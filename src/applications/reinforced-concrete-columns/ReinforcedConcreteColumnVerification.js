import { VerificationResult } from "../../core/results/VerificationResult.js";
import { governingCheck, round } from "../../core/results/checkUtils.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import { ReinforcedConcreteSectionVerification } from "../reinforced-concrete-sections/checks/ReinforcedConcreteSectionVerification.js";
import { ReinforcedConcreteShearVerification } from "../reinforced-concrete-sections/checks/ReinforcedConcreteShearVerification.js";
import { ReinforcedConcreteSectionModel } from "../reinforced-concrete-sections/models/ReinforcedConcreteSectionModel.js";
import { ReinforcedConcreteColumnDetailingVerification } from "./ReinforcedConcreteColumnDetailingVerification.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });
const EPS = 1e-9;

function concreteSectionFrom(section) {
  return section?.concreteSection ?? section;
}

function compressionFrom(nEd, convention) {
  if (convention === "compression-positive") {
    return Math.max(nEd, 0);
  }

  if (convention === "compression-negative" || convention === "tension-positive") {
    return Math.max(-nEd, 0);
  }

  throw new Error(`Unsupported compression sign convention: ${convention}.`);
}

function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

function rayCapacity(points, demandX, demandY) {
  const demandNorm = Math.hypot(demandX, demandY);

  if (demandNorm <= EPS) {
    return {
      demandNorm: 0,
      capacityNorm: Number.POSITIVE_INFINITY,
      utilizationRatio: 0,
      intersection: null,
    };
  }

  const direction = { x: demandX / demandNorm, y: demandY / demandNorm };
  const intersections = [];

  for (let index = 0; index < points.length; index += 1) {
    const start = {
      x: points[index].MxRd,
      y: points[index].MyRd,
    };
    const endPoint = points[(index + 1) % points.length];
    const segment = {
      x: endPoint.MxRd - start.x,
      y: endPoint.MyRd - start.y,
    };
    const denominator = cross(direction, segment);

    if (Math.abs(denominator) <= EPS) {
      continue;
    }

    const distance = cross(start, segment) / denominator;
    const segmentParameter = cross(start, direction) / denominator;

    if (
      distance >= -EPS &&
      segmentParameter >= -EPS &&
      segmentParameter <= 1 + EPS
    ) {
      intersections.push({
        distance: Math.max(0, distance),
        x: direction.x * Math.max(0, distance),
        y: direction.y * Math.max(0, distance),
        segmentIndex: index,
      });
    }
  }

  const positive = intersections
    .filter((item) => item.distance > EPS)
    .sort((a, b) => a.distance - b.distance);
  const selected = positive[0] ?? null;

  return {
    demandNorm,
    capacityNorm: selected?.distance ?? null,
    utilizationRatio:
      selected?.distance && selected.distance > 0
        ? demandNorm / selected.distance
        : Number.POSITIVE_INFINITY,
    intersection: selected,
  };
}

function resolveAxis({
  id,
  inertia,
  concreteArea,
  effectiveLength,
  firstOrderMoment,
  totalMoment,
  secondOrderFlag,
  compression,
  lambdaLimit,
  nominalRigidity,
  momentDistributionFactor,
  includeImperfectionWhenMomentIsZero,
  memberLength,
}) {
  const radiusOfGyration =
    Number.isFinite(inertia) && inertia > 0 && concreteArea > 0
      ? Math.sqrt(inertia / concreteArea)
      : null;
  const slenderness = radiusOfGyration
    ? effectiveLength / radiusOfGyration
    : null;
  const secondOrderRequired =
    compression > 0 &&
    Number.isFinite(slenderness) &&
    Number.isFinite(lambdaLimit) &&
    slenderness > lambdaLimit;
  const explicitTotal = Number.isFinite(totalMoment);
  const imperfectionEccentricity =
    includeImperfectionWhenMomentIsZero &&
    compression > 0 &&
    Math.abs(firstOrderMoment) <= EPS
      ? memberLength / 300
      : 0;
  const firstOrderWithImperfection = firstOrderMoment +
    (firstOrderMoment < 0 ? -1 : 1) *
      compression * imperfectionEccentricity;
  const criticalLoad =
    Number.isFinite(nominalRigidity) && nominalRigidity > 0
      ? Math.PI ** 2 * nominalRigidity / effectiveLength ** 2
      : null;
  const stableForMagnification =
    Number.isFinite(criticalLoad) && criticalLoad > compression;
  const magnificationFactor =
    secondOrderRequired && stableForMagnification
      ? 1 + momentDistributionFactor / (criticalLoad / compression - 1)
      : 1;
  const generatedTotalMoment =
    secondOrderRequired && stableForMagnification
      ? firstOrderWithImperfection * magnificationFactor
      : null;
  const secondOrderIncluded =
    !secondOrderRequired || explicitTotal || secondOrderFlag === true ||
    Number.isFinite(generatedTotalMoment);
  const designMoment = explicitTotal
    ? totalMoment
    : Number.isFinite(generatedTotalMoment)
      ? generatedTotalMoment
      : firstOrderWithImperfection;
  const ratio =
    Number.isFinite(slenderness) && Number.isFinite(lambdaLimit) && lambdaLimit > 0
      ? slenderness / lambdaLimit
      : 0;

  return {
    id,
    inertia,
    effectiveLength,
    radiusOfGyration,
    slenderness,
    lambdaLimit,
    slendernessRatio: ratio,
    secondOrderRequired,
    secondOrderIncluded,
    firstOrderMoment,
    firstOrderWithImperfection,
    imperfectionEccentricity,
    nominalRigidity,
    criticalLoad,
    magnificationFactor,
    stableForMagnification,
    generatedTotalMoment,
    totalMoment: explicitTotal ? totalMoment : null,
    designMoment,
    check: {
      id: `rc-column-second-order-${id}`,
      description: `Second-order treatment for column ${id} bending component`,
      demand: round(slenderness),
      capacity: round(lambdaLimit),
      utilizationRatio: round(ratio),
      ok: secondOrderIncluded,
      metadata: {
        reference: "NTC2018-4.1.41-4.1.42",
        screeningExceeded: secondOrderRequired,
        secondOrderIncluded,
        momentSource: explicitTotal
          ? "explicit-total"
          : Number.isFinite(generatedTotalMoment)
            ? "generated-ntc2018-nominal-stiffness"
          : secondOrderFlag === true
            ? "input-declared-inclusive"
            : "first-order-screened",
      },
    },
  };
}

export class ReinforcedConcreteColumnVerification {
  constructor({ code = "NTC2018", metadata = {} } = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  verify(model) {
    if (!model?.section || !model?.concreteMaterial) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-columns",
        status: RESULT_STATUS.NOT_VERIFIED,
        summary: "RC column verification requires a section and concrete material.",
        warnings: ["Column verification was not run because required inputs are missing."],
        metadata: { code: this.code, ...this.metadata },
      });
    }

    const concreteSection = concreteSectionFrom(model.section);
    const concreteArea = concreteSection?.area;
    const fcd = model.concreteMaterial?.fcd;

    if (!Number.isFinite(concreteArea) || concreteArea <= 0 || !Number.isFinite(fcd) || fcd <= 0) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-columns",
        status: RESULT_STATUS.NOT_VERIFIED,
        summary: "RC column stability parameters are incomplete.",
        warnings: ["A positive concrete area and design concrete strength fcd are required."],
        metadata: {
          code: this.code,
          missingParameters: ["concreteArea", "fcd"],
          ...this.metadata,
        },
      });
    }

    const compression = compressionFrom(
      model.actions.nEd,
      model.stability.compressionSignConvention,
    );
    const normalizedAxialForce = compression / (concreteArea * fcd);
    const lambdaLimit = normalizedAxialForce > 0
      ? 25 / Math.sqrt(normalizedAxialForce)
      : Number.POSITIVE_INFINITY;
    const creepCoefficient = model.stability.creepCoefficient;
    const gammaCE = model.stability.gammaCE ?? 1.2;
    const concreteElasticModulus = model.concreteMaterial?.elasticModulus;
    const concreteDesignModulus =
      Number.isFinite(concreteElasticModulus) && concreteElasticModulus > 0
        ? concreteElasticModulus / gammaCE
        : null;
    const rigidityFactor =
      Number.isFinite(creepCoefficient) && creepCoefficient >= 0
        ? 0.3 / (1 + 0.5 * creepCoefficient)
        : null;
    const nominalRigidityFor = (inertia) =>
      model.stability.secondOrderMethod === "ntc2018-nominal-stiffness" &&
      Number.isFinite(rigidityFactor) &&
      Number.isFinite(concreteDesignModulus) &&
      Number.isFinite(inertia) && inertia > 0
        ? rigidityFactor * concreteDesignModulus * inertia
        : null;
    const sharedSecondOrderFlag =
      model.stability.designMomentsIncludeSecondOrder === true;
    const axisMx = resolveAxis({
      id: "mx",
      inertia: concreteSection.inertiaY,
      concreteArea,
      effectiveLength: model.stability.effectiveLengthMx,
      firstOrderMoment: model.actions.mxEd,
      totalMoment: model.actions.mxEdTotal,
      secondOrderFlag:
        model.stability.mxIncludesSecondOrder ?? sharedSecondOrderFlag,
      compression,
      lambdaLimit,
      nominalRigidity: nominalRigidityFor(concreteSection.inertiaY),
      momentDistributionFactor: model.stability.momentDistributionFactor,
      includeImperfectionWhenMomentIsZero:
        model.stability.includeImperfectionWhenMomentIsZero,
      memberLength: model.length,
    });
    const axisMy = resolveAxis({
      id: "my",
      inertia: concreteSection.inertiaZ,
      concreteArea,
      effectiveLength: model.stability.effectiveLengthMy,
      firstOrderMoment: model.actions.myEd,
      totalMoment: model.actions.myEdTotal,
      secondOrderFlag:
        model.stability.myIncludesSecondOrder ?? sharedSecondOrderFlag,
      compression,
      lambdaLimit,
      nominalRigidity: nominalRigidityFor(concreteSection.inertiaZ),
      momentDistributionFactor: model.stability.momentDistributionFactor,
      includeImperfectionWhenMomentIsZero:
        model.stability.includeImperfectionWhenMomentIsZero,
      memberLength: model.length,
    });
    const axes = [axisMx, axisMy];
    const unresolvedAxes = axes.filter(
      (axis) => axis.secondOrderRequired && !axis.secondOrderIncluded,
    );
    const baseOutputs = {
      columnId: model.id,
      nEd: round(model.actions.nEd),
      compression: round(compression),
      concreteArea: round(concreteArea),
      fcd: round(fcd),
      normalizedAxialForce: round(normalizedAxialForce, 9),
      lambdaLimit: round(lambdaLimit),
      secondOrder: {
        method: model.stability.secondOrderMethod,
        creepCoefficient,
        gammaCE,
        concreteDesignModulus: round(concreteDesignModulus),
        rigidityFactor: round(rigidityFactor),
      },
      axes: Object.fromEntries(
        axes.map((axis) => [
          axis.id,
          {
            inertia: round(axis.inertia),
            effectiveLength: round(axis.effectiveLength),
            radiusOfGyration: round(axis.radiusOfGyration),
            slenderness: round(axis.slenderness),
            slendernessRatio: round(axis.slendernessRatio),
            secondOrderRequired: axis.secondOrderRequired,
            secondOrderIncluded: axis.secondOrderIncluded,
            firstOrderMoment: round(axis.firstOrderMoment),
            firstOrderWithImperfection: round(axis.firstOrderWithImperfection),
            imperfectionEccentricity: round(axis.imperfectionEccentricity),
            nominalRigidity: round(axis.nominalRigidity),
            criticalLoad: round(axis.criticalLoad),
            magnificationFactor: round(axis.magnificationFactor),
            stableForMagnification: axis.stableForMagnification,
            generatedTotalMoment: round(axis.generatedTotalMoment),
            totalMoment: round(axis.totalMoment),
            designMoment: round(axis.designMoment),
            secondOrderMethod: axis.secondOrderRequired
              ? model.stability.secondOrderMethod
              : null,
          },
        ]),
      ),
    };

    if (unresolvedAxes.length > 0) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-columns",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary:
          "RC column is slender and requires design moments including second-order effects.",
        checks: axes.map((axis) => axis.check),
        outputs: baseOutputs,
        warnings: [
          `Second-order moments are missing for: ${unresolvedAxes.map((axis) => axis.id).join(", ")}.`,
          "Provide a non-negative stability.creepCoefficient to generate moments with the NTC 2018 nominal stiffness, or supply explicit total moments from an adequate analysis.",
        ],
        assumptions: [
          "The NTC 2018 single-column slenderness screening is applied independently to the two section bending components.",
        ],
        metadata: {
          code: this.code,
          method: "ntc2018-4.1.2.3.9.2-screening-and-4.1.44",
          unresolvedAxes: unresolvedAxes.map((axis) => axis.id),
          ...this.metadata,
        },
      });
    }

    const sectionModel = new ReinforcedConcreteSectionModel({
      id: `${model.id}-design-section`,
      section: model.section,
      materials: {
        concreteMaterial: model.concreteMaterial,
        reinforcementMaterial: model.reinforcementMaterial,
      },
      analysisType: "uls-biaxial-domain",
      analysisSettings: {
        angleCount: model.stability.biaxialAngleCount ?? 64,
      },
      mesh: model.mesh,
      solver: model.solver,
      actions: {
        nEd: model.actions.nEd,
        mxEd: axisMx.designMoment,
        myEd: axisMy.designMoment,
      },
      units: INTERNAL_UNITS,
      metadata: {
        sourceColumnId: model.id,
      },
    });
    const sectionResult = new ReinforcedConcreteSectionVerification({
      code: this.code,
    }).verify(sectionModel);
    const capacity = rayCapacity(
      sectionResult.outputs?.points ?? [],
      axisMx.designMoment,
      axisMy.designMoment,
    );
    const resistanceCheck = {
      id: "rc-column-biaxial-resistance",
      description: "Column biaxial bending resistance at the assigned axial force",
      demand: round(capacity.demandNorm),
      capacity: round(capacity.capacityNorm),
      utilizationRatio: round(capacity.utilizationRatio),
      ok:
        sectionResult.status === RESULT_STATUS.OK &&
        Number.isFinite(capacity.utilizationRatio) &&
        capacity.utilizationRatio <= 1,
      metadata: {
        method: "fiber-domain-ray-intersection",
        mxEd: round(axisMx.designMoment),
        myEd: round(axisMy.designMoment),
        intersection: capacity.intersection
          ? {
              mxRd: round(capacity.intersection.x),
              myRd: round(capacity.intersection.y),
              segmentIndex: capacity.intersection.segmentIndex,
            }
          : null,
      },
    };
    const capacityDesign = model.shear?.capacityDesign;
    const seismicGammaRd = model.detailing?.seismic?.enabled
      ? String(model.detailing.seismic.ductilityClass).toUpperCase().includes("A")
        ? 1.2
        : 1
      : 1;
    const shearResults = Object.fromEntries(
      [
        ["x", model.shear?.x, model.actions.vxEd, axisMx.designMoment],
        ["y", model.shear?.y, model.actions.vyEd, axisMy.designMoment],
      ].filter(([, shear]) => shear).map(([axisId, shear, action, moment]) => {
        const endMoments = capacityDesign?.[
          axisId === "x" ? "endMomentsX" : "endMomentsY"
        ] ?? [];
        const capacityDesignShear = endMoments.length > 0
          ? seismicGammaRd * endMoments.reduce(
              (sum, value) => sum + Math.abs(value),
              0,
            ) / capacityDesign.clearLength
          : 0;
        const vEd = Math.max(Math.abs(shear.vEd ?? action ?? 0), capacityDesignShear);
        const result = new ReinforcedConcreteShearVerification({
          code: this.code,
        }).verifySectionActions({
          nEd: model.actions.nEd,
          vEd,
          mEd: moment,
          section: model.section,
          concreteMaterial: model.concreteMaterial,
          reinforcementMaterial: model.reinforcementMaterial,
          shear,
          units: INTERNAL_UNITS,
        });
        result.checks = result.checks.map((check) => ({
          ...check,
          id: `${check.id}-${axisId}`,
          metadata: {
            ...check.metadata,
            axis: axisId,
            analysisShear: round(Math.abs(shear.vEd ?? action ?? 0)),
            capacityDesignShear: round(capacityDesignShear),
            gammaRd: seismicGammaRd,
            reference: capacityDesignShear > 0
              ? "NTC2018-7.4.5"
              : check.metadata?.reference,
          },
        }));

        return [axisId, result];
      }),
    );
    const detailingResult = model.detailing
      ? new ReinforcedConcreteColumnDetailingVerification({
          code: this.code,
        }).verify({ model, compression, normalizedAxialForce })
      : null;
    const checks = [
      ...axes.map((axis) => axis.check),
      resistanceCheck,
      ...Object.values(shearResults).flatMap((result) => result.checks),
      ...(detailingResult?.checks ?? []),
    ];
    const governing = governingCheck(checks);
    const componentStatuses = [
      sectionResult.status,
      ...Object.values(shearResults).map((result) => result.status),
      ...(detailingResult ? [detailingResult.status] : []),
    ];
    const ok = checks.every((check) => check.ok === true) &&
      componentStatuses.every((status) => status === RESULT_STATUS.OK);

    return new VerificationResult({
      applicationId: "reinforced-concrete-columns",
      status: ok ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "RC column NTC 2018 slenderness screening and biaxial section resistance verification.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks,
      outputs: {
        ...baseOutputs,
        designActions: {
          nEd: round(model.actions.nEd),
          mxEd: round(axisMx.designMoment),
          myEd: round(axisMy.designMoment),
        },
        sectionResult: sectionResult.toJSON(),
        shear: Object.fromEntries(
          Object.entries(shearResults).map(([axis, result]) => [
            axis,
            result.toJSON?.() ?? result,
          ]),
        ),
        detailing: detailingResult?.toJSON() ?? null,
      },
      warnings: [
        ...sectionResult.warnings,
        ...Object.values(shearResults).flatMap((result) => result.warnings),
        ...(detailingResult?.warnings ?? []),
        ...(!model.shear ? ["Column shear was not checked because no shear contract was supplied."] : []),
        ...(!model.detailing ? ["Column reinforcement, confinement and ductility were not checked because no detailing contract was supplied."] : []),
      ],
      assumptions: [
        ...sectionResult.assumptions,
        ...Object.values(shearResults).flatMap((result) => result.assumptions),
        ...(detailingResult?.assumptions ?? []),
        "Compression is negative by default; change stability.compressionSignConvention explicitly when required.",
        "mxEd is paired with concreteSection.inertiaY and myEd with concreteSection.inertiaZ, following the existing RC section action convention.",
        "Explicit total moments are assumed to include imperfections, cracking, creep and second-order effects; generated moments use the documented NTC nominal-stiffness isolated-member method.",
      ],
      metadata: {
        code: this.code,
        method: "ntc2018-column-stability-resistance-shear-detailing",
        governingCheckId: governing?.id ?? null,
        ...this.metadata,
      },
    });
  }
}
