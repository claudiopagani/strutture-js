import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import { round } from "../../../core/results/checkUtils.js";
import { NTC2018MasonryPierModel } from "../models/NTC2018MasonryPierModel.js";

function resolveModel(input) {
  return input instanceof NTC2018MasonryPierModel
    ? input
    : new NTC2018MasonryPierModel(input);
}

function roundCurve(curve = []) {
  return curve.map((point) => ({
    ...point,
    displacement: round(point.displacement),
    force: round(point.force),
  }));
}

export class NTC2018MasonryPierAnalysis {
  analyze({ model, lateralDisplacement = null } = {}) {
    const resolvedModel = resolveModel(model ?? {});
    const evaluation = resolvedModel.evaluate({
      lateralDisplacement:
        Number.isFinite(lateralDisplacement) ? lateralDisplacement : undefined,
    });
    const warnings = [];
    const assumptions = [
      "Compression is positive; tensile axial force does not increase friction and gives zero flexural resistance.",
      "The resistance is the exact minimum of flexure, bed-joint sliding and diagonal cracking; no compression-ratio switch selects the mechanism.",
      "The normative model is an elastic-perfectly-plastic monotonic envelope and does not reproduce cyclic degradation, pinching or residual deformation.",
      "For existing masonry, mean strength parameters are divided by the confidence factor; elastic moduli are not divided by it.",
    ];

    if (!evaluation.complete) {
      const missingDescription = evaluation.missing
        .map((item) => `${item.mechanism}: ${item.parameters.join(", ")}`)
        .join("; ");

      warnings.push(
        `The strict normative envelope is incomplete because required inputs are missing (${missingDescription}).`,
      );

      return new VerificationResult({
        applicationId: "masonry-piers",
        status: RESULT_STATUS.NOT_IMPLEMENTED,
        summary:
          "The autonomous NTC 2018 masonry-pier model could not evaluate all three required resistance mechanisms.",
        checks: [
          {
            id: "ntc2018-masonry-pier-input-completeness",
            description: "All normative capacity and stiffness inputs are available",
            demand: null,
            capacity: null,
            utilizationRatio: null,
            ok: false,
            metadata: { missing: evaluation.missing },
          },
        ],
        outputs: evaluation,
        warnings,
        assumptions,
        metadata: {
          code: "NTC2018-Circolare2019",
          modelId: resolvedModel.id,
          modelType: "normative-bilinear",
        },
      });
    }

    const displacementDemand = Number.isFinite(lateralDisplacement)
      ? Math.abs(lateralDisplacement)
      : Number.isFinite(resolvedModel.normative.lateralDisplacement)
        ? Math.abs(resolvedModel.normative.lateralDisplacement)
        : null;
    const displacementCapacity = evaluation.deformation.ultimateDisplacement;
    const displacementRatio = Number.isFinite(displacementDemand)
      ? displacementDemand / displacementCapacity
      : null;
    const checks = [
      {
        id: "ntc2018-masonry-pier-bilinear-consistency",
        description: "Elastic yield displacement is below the normative ultimate displacement",
        demand: round(evaluation.yieldDisplacement),
        capacity: round(displacementCapacity),
        utilizationRatio: round(
          evaluation.yieldDisplacement / displacementCapacity,
        ),
        ok: evaluation.consistentBilinear,
      },
    ];

    if (Number.isFinite(displacementDemand)) {
      checks.push({
        id: "ntc2018-masonry-pier-displacement-capacity",
        description: "SLC lateral displacement demand does not exceed capacity",
        demand: round(displacementDemand),
        capacity: round(displacementCapacity),
        utilizationRatio: round(displacementRatio),
        ok: displacementRatio <= 1,
      });
    }

    if (!evaluation.consistentBilinear) {
      warnings.push(
        "The elastic yield displacement is not below the normative ultimate displacement. No artificial stiffness or displacement cap was introduced.",
      );
    }

    const status = checks.every((check) => check.ok)
      ? RESULT_STATUS.OK
      : RESULT_STATUS.NOT_VERIFIED;

    return new VerificationResult({
      applicationId: "masonry-piers",
      status,
      summary:
        "Autonomous NTC 2018 / Circular 2019 bilinear capacity envelope for an in-plane masonry pier.",
      utilizationRatio: round(displacementRatio),
      demand: round(displacementDemand),
      capacity: round(displacementCapacity),
      checks,
      outputs: {
        ...evaluation,
        curve: roundCurve(evaluation.curve),
      },
      warnings,
      assumptions,
      metadata: {
        code: "NTC2018-Circolare2019",
        modelId: resolvedModel.id,
        modelType: "normative-bilinear",
        units: { ...resolvedModel.units },
      },
    });
  }
}
