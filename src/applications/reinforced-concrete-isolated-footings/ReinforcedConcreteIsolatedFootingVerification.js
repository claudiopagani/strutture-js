import { VerificationResult } from "../../core/results/VerificationResult.js";
import { governingCheck, round } from "../../core/results/checkUtils.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import {
  RectangularFootingContactAnalysis,
  integrateFootingPressureStrip,
} from "../../domain/foundations/index.js";
import { RectangularSection } from "../../domain/geometry/RectangularSection.js";
import { ReinforcedConcreteSection } from "../../domain/geometry/ReinforcedConcreteSection.js";
import { ReinforcementBar } from "../../domain/reinforcement/ReinforcementBar.js";
import {
  PunchingActionState,
  PunchingConnectionModel,
} from "../../domain/slabs/punching/index.js";
import {
  PunchingVerificationRequest,
  verifyPunching,
} from "../reinforced-concrete-punching/index.js";
import { ReinforcedConcreteSectionModel } from "../reinforced-concrete-sections/models/ReinforcedConcreteSectionModel.js";
import { ReinforcedConcreteSectionVerification } from "../reinforced-concrete-sections/checks/ReinforcedConcreteSectionVerification.js";
import { ReinforcedConcreteShearVerification } from "../reinforced-concrete-sections/checks/ReinforcedConcreteShearVerification.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });
const UNIT_WIDTH = 1000;
const PUNCHING_2004 = "EN1992_1_1_2004_A1_2014";

function totalVerticalForce(model) {
  return model.actions.columnVerticalForce +
    model.actions.uniformDownwardPressure *
      model.geometry.widthX *
      model.geometry.widthY;
}

function createFootingStrip({ model, direction }) {
  const layer = model.reinforcement.bottom[direction];
  const concreteSection = new RectangularSection({
    id: `${model.id}-${direction}-footing-strip-concrete`,
    width: UNIT_WIDTH,
    height: model.geometry.thickness,
    units: INTERNAL_UNITS,
  });
  const reinforcementBar = new ReinforcementBar({
    id: `bottom-${direction}-equivalent-layer`,
    diameter: layer.diameter,
    area: layer.areaPerMeter,
    material: model.materials.reinforcementMaterial,
    y: layer.axisFromBottom,
    z: UNIT_WIDTH / 2,
    units: INTERNAL_UNITS,
    metadata: {
      equivalentDistributedArea: true,
      direction,
      spacing: layer.spacing,
      barsPerMeter: layer.barsPerMeter,
    },
  });
  const section = new ReinforcedConcreteSection({
    id: `${model.id}-${direction}-footing-strip`,
    concreteSection,
    reinforcementBars: [reinforcementBar],
    concreteMaterial: model.materials.concreteMaterial,
    reinforcementMaterial: model.materials.reinforcementMaterial,
    units: INTERNAL_UNITS,
    metadata: {
      direction,
      unitWidth: UNIT_WIDTH,
      footingModelId: model.id,
    },
  });

  return {
    section,
    layer,
    effectiveDepth: model.geometry.thickness - layer.axisFromBottom,
  };
}

function criticalStripDemand({ model, contact, direction, effectiveDepth }) {
  const dimension = model.geometry[direction === "x" ? "widthX" : "widthY"];
  const transverseDimension = model.geometry[
    direction === "x" ? "widthY" : "widthX"
  ];
  const columnDimension = model.column[
    direction === "x" ? "widthX" : "widthY"
  ];
  const fixedCoordinates = [
    -transverseDimension / 2,
    0,
    transverseDimension / 2,
  ];
  const candidates = [];

  for (const side of [-1, 1]) {
    const face = side * columnDimension / 2;
    const edge = side * dimension / 2;
    const shearSection = face + side * effectiveDepth;

    for (const fixedCoordinate of fixedCoordinates) {
      const bending = integrateFootingPressureStrip({
        contact,
        axis: direction,
        from: face,
        to: edge,
        fixedCoordinate,
        momentOrigin: face,
        uniformDownwardPressure: model.actions.uniformDownwardPressure,
      });
      const shear = Math.abs(shearSection) >= dimension / 2
        ? { soilForce: 0, downwardForce: 0, netForce: 0 }
        : integrateFootingPressureStrip({
            contact,
            axis: direction,
            from: shearSection,
            to: edge,
            fixedCoordinate,
            uniformDownwardPressure: model.actions.uniformDownwardPressure,
          });

      candidates.push({
        side: side < 0 ? "negative" : "positive",
        fixedCoordinate,
        columnFaceCoordinate: face,
        shearSectionCoordinate: shearSection,
        edgeCoordinate: edge,
        momentPerUnitWidth: Math.abs(bending.netMoment),
        signedMomentPerUnitWidth: side * bending.netMoment,
        shearPerUnitWidth: Math.abs(shear.netForce),
        bending,
        shear,
      });
    }
  }

  const bending = candidates.reduce((selected, candidate) =>
    selected == null || candidate.momentPerUnitWidth > selected.momentPerUnitWidth
      ? candidate
      : selected, null);
  const shear = candidates.reduce((selected, candidate) =>
    selected == null || candidate.shearPerUnitWidth > selected.shearPerUnitWidth
      ? candidate
      : selected, null);

  return { direction, candidates, bending, shear };
}

function verifyDirection({ model, contact, direction }) {
  const strip = createFootingStrip({ model, direction });
  const demand = criticalStripDemand({
    model,
    contact,
    direction,
    effectiveDepth: strip.effectiveDepth,
  });
  const mEd = demand.bending.momentPerUnitWidth * UNIT_WIDTH;
  const vEd = demand.shear.shearPerUnitWidth * UNIT_WIDTH;
  const sectionModel = new ReinforcedConcreteSectionModel({
    id: `${model.id}-${direction}-footing-bending`,
    section: strip.section,
    materials: model.materials,
    analysisType: "uls-uniaxial-resistance",
    analysisSettings: { compressedEdge: "top" },
    mesh: model.mesh,
    solver: model.solver,
    actions: { nEd: 0, mEd },
    units: INTERNAL_UNITS,
  });
  const bendingResult = new ReinforcedConcreteSectionVerification().verify(
    sectionModel,
  );
  const sourceBendingCheck = bendingResult.checks[0] ?? {};
  const bendingCheck = {
    ...sourceBendingCheck,
    id: `rc-footing-bending-${direction}`,
    description: `Footing bottom reinforcement bending resistance in ${direction.toUpperCase()}`,
    metadata: {
      ...sourceBendingCheck.metadata,
      method: "cantilever-unit-strip-from-contact-pressure",
      direction,
      unitWidth: UNIT_WIDTH,
      criticalPosition: demand.bending,
    },
  };
  const shearResult = new ReinforcedConcreteShearVerification().verifySectionActions({
    nEd: 0,
    vEd,
    mEd,
    section: strip.section,
    concreteMaterial: model.materials.concreteMaterial,
    reinforcementMaterial: model.materials.reinforcementMaterial,
    shear: {
      mode: "without-transverse-reinforcement",
      bw: UNIT_WIDTH,
      effectiveDepth: strip.effectiveDepth,
      longitudinalReinforcementArea: strip.layer.areaPerMeter,
      tensionFace: "bottom",
    },
    units: INTERNAL_UNITS,
  });
  const sourceShearCheck = shearResult.checks[0] ?? {};
  const shearCheck = {
    ...sourceShearCheck,
    id: `rc-footing-one-way-shear-${direction}`,
    description: `Footing one-way shear resistance in ${direction.toUpperCase()}`,
    metadata: {
      ...sourceShearCheck.metadata,
      method: "cantilever-unit-strip-at-effective-depth",
      direction,
      unitWidth: UNIT_WIDTH,
      criticalPosition: demand.shear,
    },
  };

  return {
    direction,
    effectiveDepth: strip.effectiveDepth,
    reinforcementAreaPerMeter: strip.layer.areaPerMeter,
    demand,
    mEd,
    vEd,
    bendingResult,
    shearResult,
    checks: [bendingCheck, shearCheck],
  };
}

function punchingPerimeterFits(model, effectiveDepth) {
  return (
    model.column.widthX + 4 * effectiveDepth <= model.geometry.widthX + 1e-9 &&
    model.column.widthY + 4 * effectiveDepth <= model.geometry.widthY + 1e-9
  );
}

function verifyPunchingForFooting({ model, contact, directions }) {
  const effectiveDepthX = directions.x.effectiveDepth;
  const effectiveDepthY = directions.y.effectiveDepth;
  const effectiveDepth = (effectiveDepthX + effectiveDepthY) / 2;

  if (!punchingPerimeterFits(model, effectiveDepth)) {
    return {
      applicable: false,
      status: RESULT_STATUS.OK,
      checks: [
        {
          id: "rc-footing-punching-basic-perimeter-fit",
          description: "Basic punching control perimeter lies inside the footing",
          demand: round(
            Math.max(
              model.column.widthX + 4 * effectiveDepth,
              model.column.widthY + 4 * effectiveDepth,
            ),
          ),
          capacity: round(Math.max(model.geometry.widthX, model.geometry.widthY)),
          utilizationRatio: 0,
          ok: true,
          metadata: {
            method: "EN1992-1-1-2004-control-perimeter-at-2d",
            nonApplicabilityReason:
              "The basic control perimeter at 2d reaches or crosses the footing boundary; one-way shear remains checked.",
          },
        },
      ],
      outputs: {
        effectiveDepth,
        basicPerimeterInsideFooting: false,
      },
      warnings: [],
      assumptions: [
        "Punching is treated as non-applicable when the complete basic perimeter at 2d cannot develop inside the isolated footing.",
      ],
    };
  }

  if (model.punching.enabled === false) {
    return {
      applicable: true,
      status: RESULT_STATUS.NOT_ANALYZED,
      checks: [],
      outputs: { effectiveDepth, basicPerimeterInsideFooting: true },
      warnings: ["Punching applies geometrically but was explicitly disabled."],
      assumptions: [],
    };
  }

  if (model.punching.code?.id !== PUNCHING_2004) {
    return {
      applicable: true,
      status: RESULT_STATUS.NOT_SUPPORTED,
      checks: [],
      outputs: { effectiveDepth, basicPerimeterInsideFooting: true },
      warnings: [
        "The first footing integration requires an explicit EN 1992-1-1:2004+A1:2014 punching code selection; other generations need a dedicated footing-demand integration.",
      ],
      assumptions: [],
    };
  }

  const offset = 2 * effectiveDepth;
  const enclosedArea =
    model.column.widthX * model.column.widthY +
    2 * offset * (model.column.widthX + model.column.widthY) +
    Math.PI * offset ** 2;
  const effectiveMeanPressure =
    contact.pressurePolynomial.intercept -
    model.actions.uniformDownwardPressure;
  const enclosedUpwardForce = Math.max(0, effectiveMeanPressure * enclosedArea);
  const punchingForce = Math.max(
    0,
    model.actions.columnVerticalForce - enclosedUpwardForce,
  );
  const connection = new PunchingConnectionModel({
    id: `${model.id}-footing-punching`,
    units: INTERNAL_UNITS,
    slab: {
      thickness: model.geometry.thickness,
      boundary: [
        { x: -model.geometry.widthX / 2, y: -model.geometry.widthY / 2 },
        { x: model.geometry.widthX / 2, y: -model.geometry.widthY / 2 },
        { x: model.geometry.widthX / 2, y: model.geometry.widthY / 2 },
        { x: -model.geometry.widthX / 2, y: model.geometry.widthY / 2 },
      ],
      openings: [],
      beams: [],
    },
    support: {
      id: `${model.id}-column`,
      kind: "column",
      position: "interior",
      footprint: {
        shape: "rectangle",
        center: { x: 0, y: 0 },
        sizeX: model.column.widthX,
        sizeY: model.column.widthY,
        rotation: 0,
      },
    },
    materials: {
      concrete: { fck: model.materials.concreteMaterial.fck },
      concreteAggregate: model.punching.concreteAggregate ?? null,
    },
    reinforcement: {
      flexuralTension: {
        x: {
          effectiveDepth: effectiveDepthX,
          ratio:
            model.reinforcement.bottom.x.areaPerMeter /
            (UNIT_WIDTH * effectiveDepthX),
        },
        y: {
          effectiveDepth: effectiveDepthY,
          ratio:
            model.reinforcement.bottom.y.areaPerMeter /
            (UNIT_WIDTH * effectiveDepthY),
        },
        source: { method: "isolated-footing-bottom-reinforcement" },
      },
      punching: structuredClone(model.reinforcement.punching),
    },
  });
  const action = new PunchingActionState({
    id: `${model.id}-uls-punching`,
    connectionId: connection.id,
    localFrameId: connection.localFrame.id,
    combinationType: "ULS",
    units: INTERNAL_UNITS,
    components: {
      fz: model.actions.columnVerticalForce,
      mx: model.actions.momentX,
      my: model.actions.momentY,
    },
    punchingDemand: {
      punchingForce,
      lineOfAction: {
        x: model.actions.momentY / model.actions.columnVerticalForce,
        y: model.actions.momentX / model.actions.columnVerticalForce,
      },
      source: {
        method: "column-force-minus-enclosed-effective-soil-reaction",
      },
    },
    source: {
      method: "manual",
      reference: "isolated-footing-local-equilibrium",
    },
  });
  const result = verifyPunching(new PunchingVerificationRequest({
    id: `${model.id}-punching-request`,
    connection,
    actionStates: [action],
    code: model.punching.code,
  }));

  return {
    applicable: true,
    status: result.status,
    checks: result.checks,
    outputs: {
      effectiveDepth,
      basicPerimeterInsideFooting: true,
      enclosedArea: round(enclosedArea),
      effectiveMeanPressure: round(effectiveMeanPressure),
      enclosedUpwardForce: round(enclosedUpwardForce),
      punchingForce: round(punchingForce),
      verification: result.toJSON(),
    },
    warnings: result.warnings,
    assumptions: [
      ...result.assumptions,
      "For full contact and a centered control perimeter, the linear pressure gradients have zero resultant over the enclosed symmetric area.",
    ],
  };
}

export class ReinforcedConcreteIsolatedFootingVerification {
  constructor({ code = "NTC2018", metadata = {} } = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  verify(model) {
    const nEd = totalVerticalForce(model);
    const contact = new RectangularFootingContactAnalysis().analyze({
      widthX: model.geometry.widthX,
      widthY: model.geometry.widthY,
      nEd,
      mxEd: model.actions.momentX,
      myEd: model.actions.momentY,
    });
    const contactCheck = {
      id: "rc-footing-compressive-equilibrium",
      description: "Compressive soil-contact equilibrium inside the footing footprint",
      demand: round(contact.equilibriumUtilization),
      capacity: 1,
      utilizationRatio: round(contact.equilibriumUtilization),
      ok: contact.status !== "no-compressive-equilibrium",
      metadata: {
        contactType: contact.contactType,
        reference: "rigid-rectangular-base-no-tension-contact",
      },
    };

    if (contact.status === "no-compressive-equilibrium") {
      return new VerificationResult({
        applicationId: "reinforced-concrete-isolated-footings",
        status: RESULT_STATUS.NOT_VERIFIED,
        summary: "The vertical resultant cannot be equilibrated by compressive footing contact.",
        checks: [contactCheck],
        outputs: { footingId: model.id, contact },
        warnings: [
          "The resultant lies outside the footing footprint or no compressive vertical force is available.",
        ],
        assumptions: [
          "Soil contact has zero tensile strength and the footing base is treated as rigid for pressure distribution.",
        ],
        metadata: { code: this.code, ...this.metadata },
      });
    }

    if (contact.status === "not-supported") {
      return new VerificationResult({
        applicationId: "reinforced-concrete-isolated-footings",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary: "Biaxial partial contact requires a nonlinear compression-only contact solution.",
        checks: [contactCheck],
        outputs: { footingId: model.id, contact },
        warnings: [
          "Elastic corner pressures detect uplift in biaxial bending, but they are not used as a design pressure after contact loss.",
        ],
        assumptions: [
          "No biaxial effective-area or rectangularized contact approximation is applied.",
        ],
        metadata: { code: this.code, ...this.metadata },
      });
    }

    const bearingCheck = {
      id: "rc-footing-bearing-pressure",
      description: "Maximum footing contact pressure against assigned design bearing resistance",
      demand: round(contact.maximumPressure),
      capacity: round(model.soil.designBearingResistance),
      utilizationRatio: round(
        contact.maximumPressure / model.soil.designBearingResistance,
      ),
      ok: contact.maximumPressure <= model.soil.designBearingResistance,
      metadata: {
        resistanceSource: model.soil.bearingResistanceSource,
        geotechnicalResistanceCalculatedByModule: false,
      },
    };
    const horizontalDemand = Math.hypot(
      model.actions.horizontalX,
      model.actions.horizontalY,
    );
    const slidingMissing =
      horizontalDemand > 1e-9 &&
      !Number.isFinite(model.soil.designSlidingResistance);
    const slidingCheck = slidingMissing
      ? null
      : {
          id: "rc-footing-sliding",
          description: "Horizontal action against assigned design sliding resistance",
          demand: round(horizontalDemand),
          capacity: round(model.soil.designSlidingResistance),
          utilizationRatio: round(
            horizontalDemand === 0
              ? 0
              : horizontalDemand / model.soil.designSlidingResistance,
          ),
          ok:
            horizontalDemand === 0 ||
            horizontalDemand <= model.soil.designSlidingResistance,
          metadata: {
            resistanceSource: model.soil.slidingResistanceSource,
            geotechnicalResistanceCalculatedByModule: false,
          },
        };

    if (contact.contactType !== "full") {
      const checks = [contactCheck, bearingCheck, ...(slidingCheck ? [slidingCheck] : [])];
      return new VerificationResult({
        applicationId: "reinforced-concrete-isolated-footings",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary: "Uniaxial partial contact was solved, but structural footing checks remain limited to full contact.",
        checks,
        outputs: { footingId: model.id, contact },
        warnings: [
          "The triangular contact pressure is available, but bending, one-way shear and punching are not certified for partial contact in this MVP.",
          ...(slidingMissing
            ? ["A design sliding resistance is required when horizontal action is non-zero."]
            : []),
        ],
        assumptions: [
          "Soil contact has zero tensile strength and the footing base is treated as rigid.",
        ],
        metadata: { code: this.code, ...this.metadata },
      });
    }

    if (slidingMissing) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-isolated-footings",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary: "Footing sliding resistance is missing for a non-zero horizontal action.",
        checks: [contactCheck, bearingCheck],
        outputs: { footingId: model.id, contact },
        warnings: [
          "Pass soil.designSlidingResistance from a justified geotechnical verification; the structural module does not derive it from an assumed friction coefficient.",
        ],
        assumptions: [],
        metadata: { code: this.code, ...this.metadata },
      });
    }

    const directions = Object.fromEntries(
      ["x", "y"].map((direction) => [
        direction,
        verifyDirection({ model, contact, direction }),
      ]),
    );
    const punching = verifyPunchingForFooting({ model, contact, directions });
    const checks = [
      contactCheck,
      bearingCheck,
      ...(slidingCheck ? [slidingCheck] : []),
      ...directions.x.checks,
      ...directions.y.checks,
      ...punching.checks,
    ];
    const structuralStatuses = [
      directions.x.bendingResult.status,
      directions.x.shearResult.status,
      directions.y.bendingResult.status,
      directions.y.shearResult.status,
      punching.status,
    ];
    const unsupported = structuralStatuses.some((status) =>
      [RESULT_STATUS.NOT_SUPPORTED, RESULT_STATUS.NOT_ANALYZED].includes(status),
    );
    const ok = checks.every((check) => check.ok === true) &&
      structuralStatuses.every((status) => status === RESULT_STATUS.OK);
    const governing = governingCheck(checks);

    return new VerificationResult({
      applicationId: "reinforced-concrete-isolated-footings",
      status: unsupported
        ? RESULT_STATUS.NOT_SUPPORTED
        : ok
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "Isolated RC footing contact, assigned geotechnical resistance and local structural verification.",
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      utilizationRatio: governing?.utilizationRatio ?? null,
      checks,
      outputs: {
        footingId: model.id,
        totalVerticalForce: round(nEd),
        contact,
        directions: Object.fromEntries(
          Object.entries(directions).map(([direction, result]) => [
            direction,
            {
              effectiveDepth: round(result.effectiveDepth),
              reinforcementAreaPerMeter: round(result.reinforcementAreaPerMeter),
              mEd: round(result.mEd),
              vEd: round(result.vEd),
              demand: result.demand,
              bending: result.bendingResult.toJSON(),
              shear: result.shearResult,
            },
          ]),
        ),
        punching: punching.outputs,
      },
      warnings: [
        ...directions.x.bendingResult.warnings,
        ...directions.x.shearResult.warnings,
        ...directions.y.bendingResult.warnings,
        ...directions.y.shearResult.warnings,
        ...punching.warnings,
        "Column-bar anchorage, footing-bar anchorage, local bearing at the column-footing interface and construction detailing are not included in this MVP.",
        ...(model.soil.bearingResistanceSource == null
          ? ["The assigned design bearing resistance has no documented source in the input metadata."]
          : []),
      ],
      assumptions: [
        ...directions.x.bendingResult.assumptions,
        ...directions.x.shearResult.assumptions,
        ...directions.y.bendingResult.assumptions,
        ...directions.y.shearResult.assumptions,
        ...punching.assumptions,
        "The footing and soil-contact pressure field are treated as rigid; structural strip actions are integrated from the resulting pressure plane.",
        "The column is centered and unrotated, and all actions are reduced to the center of the footing base.",
        "The assigned bearing and sliding resistances already include the geotechnical design approach and partial factors selected by the responsible geotechnical verification.",
      ],
      metadata: {
        code: this.code,
        method: "rigid-rectangular-footing-full-contact-plus-rc-strips",
        governingCheckId: governing?.id ?? null,
        geotechnicalCapacityCalculated: false,
        ...this.metadata,
      },
    });
  }
}
