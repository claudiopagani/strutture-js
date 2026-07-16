import { VerificationResult } from "../../core/results/VerificationResult.js";
import { governingCheck, round } from "../../core/results/checkUtils.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import { ReinforcedConcreteSectionVerification } from "../reinforced-concrete-sections/checks/ReinforcedConcreteSectionVerification.js";
import { ReinforcedConcreteSectionModel } from "../reinforced-concrete-sections/models/ReinforcedConcreteSectionModel.js";

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
  const secondOrderIncluded =
    !secondOrderRequired || explicitTotal || secondOrderFlag === true;
  const designMoment = explicitTotal ? totalMoment : firstOrderMoment;
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
            totalMoment: round(axis.totalMoment),
            designMoment: round(axis.designMoment),
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
          "This MVP does not generate second-order moments with an approximate column model; supply explicit total design moments or results from an adequate second-order analysis.",
        ],
        assumptions: [
          "The NTC 2018 single-column slenderness screening is applied independently to the two section bending components.",
        ],
        metadata: {
          code: this.code,
          method: "ntc2018-4.1.2.3.9.2-screening",
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
    const checks = [...axes.map((axis) => axis.check), resistanceCheck];
    const governing = governingCheck([resistanceCheck]);
    const ok = checks.every((check) => check.ok === true);

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
      },
      warnings: [
        ...sectionResult.warnings,
        "Minimum eccentricity, member detailing, confinement and seismic ductility checks are not included in this first column MVP.",
      ],
      assumptions: [
        ...sectionResult.assumptions,
        "Compression is negative by default; change stability.compressionSignConvention explicitly when required.",
        "mxEd is paired with concreteSection.inertiaY and myEd with concreteSection.inertiaZ, following the existing RC section action convention.",
        "For slender axes the supplied total moment is assumed to include imperfections, cracking, creep and second-order effects from an adequate analysis.",
      ],
      metadata: {
        code: this.code,
        method: "ntc2018-4.1.2.3.9.2-plus-fiber-domain",
        governingCheckId: governing?.id ?? null,
        ...this.metadata,
      },
    });
  }
}
