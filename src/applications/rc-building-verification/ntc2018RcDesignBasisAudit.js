import { VerificationResult } from "../../core/results/VerificationResult.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import { withNormativeReferences } from "../../norms/normativeReference.js";
import {
  NTC2018_RC_CHAPTER_7_4_REFERENCES,
  NTC2018_RC_OUTSIDE_CORPUS_REFERENCES,
} from "../../norms/ntc2018/normativeReferences.js";
import {
  createNTC2018StructuralBehavior,
  selectNTC2018AllowedAnalysisMethods,
} from "../../norms/ntc2018/reinforced-concrete/structuralBehavior.js";
import {
  evaluateNTC2018RcBuildingCompleteness,
} from "./ntc2018RcBuildingCoverage.js";

function relativeDifference(value, expected) {
  if (!Number.isFinite(value) || !Number.isFinite(expected)) {
    return null;
  }

  return Math.abs(value - expected) / Math.max(Math.abs(expected), 1e-12);
}

/**
 * Audit the solver-independent project choices made before consuming global
 * FEM results. This verifies consistency, not legal or professional
 * conformity, and deliberately keeps the external solver out of the library.
 */
export function auditNTC2018RcDesignBasis({
  behavior,
  structuralType,
  regularity = {},
  analysisMethod,
  analysisParameters = {},
  q = null,
  alphaRatio,
  frameStoreyCount,
  frameBayCount,
  uncoupledWallCount,
  requiredCapabilityIds,
} = {}) {
  const behaviorDescriptor = createNTC2018StructuralBehavior({
    behavior,
    structuralType,
    regularity,
    alphaRatio,
    frameStoreyCount,
    frameBayCount,
    uncoupledWallCount,
  });
  const methods = selectNTC2018AllowedAnalysisMethods({
    behavior: behaviorDescriptor.behavior,
    planRegularity: regularity.plan,
    elevationRegularity: regularity.elevation,
    t1: analysisParameters.t1,
    tc: analysisParameters.tc,
    td: analysisParameters.td,
  });
  const implementation = evaluateNTC2018RcBuildingCompleteness({
    ...(requiredCapabilityIds == null ? {} : { requiredCapabilityIds }),
  });
  const methodAllowed = methods.allowed.includes(analysisMethod);
  const qDifference = q == null
    ? null
    : relativeDifference(Number(q), behaviorDescriptor.q);
  const qConsistent = qDifference == null || qDifference <= 1e-9;
  const checks = [
    {
      id: "rc-design-basis-analysis-method",
      description: "Selected global analysis method is admitted by the supplied design basis",
      demand: analysisMethod ?? null,
      capacity: [...methods.allowed],
      utilizationRatio: null,
      ok: methodAllowed,
      metadata: withNormativeReferences({
        recommendedMethod: methods.recommended,
      }, [NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.globalSeismicAnalysis]),
    },
    {
      id: "rc-design-basis-behavior-factor",
      description: "Declared behavior factor is consistent with structural type and regularity",
      demand: q == null ? behaviorDescriptor.q : Number(q),
      capacity: behaviorDescriptor.q,
      utilizationRatio: qDifference,
      ok: qConsistent,
      metadata: withNormativeReferences({
        computedQ0: behaviorDescriptor.q0,
        regularityFactor: behaviorDescriptor.kr,
        suppliedExplicitly: q != null,
      }, [
        NTC2018_RC_CHAPTER_7_4_REFERENCES.structuralBehavior,
        NTC2018_RC_CHAPTER_7_4_REFERENCES.structuralTypesAndQ,
      ]),
    },
    {
      id: "rc-design-basis-implementation-readiness",
      description: "Required strutture-js capability families are implemented",
      demand: implementation.requiredCapabilityIds.length,
      capacity:
        implementation.requiredCapabilityIds.length -
        implementation.blockingCapabilities.length,
      utilizationRatio: null,
      ok: implementation.complete,
      metadata: {
        evaluationBasis: implementation.evaluationBasis,
        blockingCapabilities: implementation.blockingCapabilities,
      },
    },
  ];
  const ok = checks.every((check) => check.ok === true);
  const normativeReferences = [
    NTC2018_RC_CHAPTER_7_4_REFERENCES.structuralBehavior,
    NTC2018_RC_CHAPTER_7_4_REFERENCES.structuralTypesAndQ,
    NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.globalSeismicAnalysis,
  ];

  return new VerificationResult({
    applicationId: "ntc2018-rc-design-basis-audit",
    status: ok ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    summary:
      "Solver-independent audit of NTC 2018 RC structural behavior, q factor, analysis method and implementation readiness.",
    utilizationRatio: qDifference,
    demand: q == null ? behaviorDescriptor.q : Number(q),
    capacity: behaviorDescriptor.q,
    checks,
    outputs: {
      behavior: behaviorDescriptor,
      analysisMethods: methods,
      implementation,
      normativeAssurance: {
        corpusWorkflowStatus: "extracted",
        traceabilityComplete: implementation.normativeTraceabilityComplete,
        conformityClaimed: false,
      },
    },
    warnings: [
      ...(!implementation.normativeTraceabilityComplete
        ? [
            "Some required provisions are outside the currently pinned normative corpus.",
          ]
        : []),
      "Canonical corpus records are extracted and still require the declared human review workflow before any conformity claim.",
    ],
    assumptions: [
      "The audit checks declared solver-independent choices only; it does not validate FEM modelling quality or member resistance.",
      "Periods and spectrum corner values use one consistent time unit.",
    ],
    metadata: withNormativeReferences({
      normativeConformityClaimed: false,
      normativeTraceabilityComplete:
        implementation.normativeTraceabilityComplete,
    }, normativeReferences),
  });
}
