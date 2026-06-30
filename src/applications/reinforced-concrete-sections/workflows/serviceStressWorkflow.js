import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import { resolveRcSleModularRatio } from "../serviceabilityDefaults.js";
import { createRcSectionAnalysisContext } from "../shared/RcSectionAnalysisContext.js";
import {
  resolveServiceStressSolverActions,
  round,
} from "../shared/rcCommon.js";
import { solveRcServiceSectionState } from "../shared/solveRcServiceSectionState.js";

export function runServiceStressWorkflow(model, { code, metadata }) {
  const context = createRcSectionAnalysisContext(model, { service: true });
  const modularRatio = resolveRcSleModularRatio(
    model.analysisSettings?.modularRatio,
  );
  const solved = solveRcServiceSectionState({
    section: context.section,
    reinforcementMaterial:
      model.materials?.reinforcementMaterial ??
      context.section.reinforcementMaterial,
    actions: resolveServiceStressSolverActions(model.actions),
    concreteMesh: context.mesh,
    concreteLaw: context.concreteLaw,
    steelLaw: context.steelLaw,
    solver: {
      tolerance: model.solver?.tolerance ?? 1e-3,
      maxIterations: model.solver?.maxIterations ?? 40,
      finiteDifferenceStep: model.solver?.finiteDifferenceStep ?? 1e-8,
      initialGuess: model.solver?.initialGuess ?? {},
    },
    modularRatio,
    referencePoint: context.referencePoint,
    useFallbacks: false,
  }).solved;

  return new VerificationResult({
    applicationId: "reinforced-concrete-sections",
    status: solved.converged ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    summary:
      "Service stress state solved through strain-field equilibrium with concrete tension excluded.",
    outputs: {
      analysisType: model.analysisType,
      sectionId: model.id,
      nEd: round(model.actions?.nEd ?? model.actions?.axialForce, 6),
      mxEd: round(model.actions?.mxEd ?? model.actions?.mEd ?? 0, 6),
      myEd: round(model.actions?.myEd ?? 0, 6),
      fiberCount: context.mesh.generatedCount,
      modularRatio: round(modularRatio, 6),
      referencePoint: {
        y: round(context.referencePoint.y, 6),
        z: round(context.referencePoint.z, 6),
      },
      strainField: {
        eps0: round(solved.strainField.eps0, 12),
        kappaY: round(solved.strainField.kappaY, 12),
        kappaZ: round(solved.strainField.kappaZ, 12),
      },
      residual: {
        n: round(solved.residual.n, 6),
        mx: round(solved.residual.mx, 6),
        my: round(solved.residual.my, 6),
      },
      iterations: solved.iterations,
      concrete: {
        axialForce: round(solved.state.concrete.axialForce, 6),
        maxCompression:
          solved.state.extremes.maxConcreteCompression == null
            ? null
            : {
                value: round(
                  solved.state.extremes.maxConcreteCompression.value,
                  6,
                ),
                y: round(solved.state.extremes.maxConcreteCompression.y, 6),
                z: round(solved.state.extremes.maxConcreteCompression.z, 6),
              },
        maxTension:
          solved.state.extremes.maxConcreteTension == null
            ? null
            : {
                value: round(solved.state.extremes.maxConcreteTension.value, 6),
                y: round(solved.state.extremes.maxConcreteTension.y, 6),
                z: round(solved.state.extremes.maxConcreteTension.z, 6),
              },
      },
      steel: {
        axialForce: round(solved.state.steel.axialForce, 6),
        maxCompression:
          solved.state.extremes.maxSteelCompression == null
            ? null
            : {
                value: round(solved.state.extremes.maxSteelCompression.value, 6),
                y: round(solved.state.extremes.maxSteelCompression.y, 6),
                z: round(solved.state.extremes.maxSteelCompression.z, 6),
              },
        maxTension:
          solved.state.extremes.maxSteelTension == null
            ? null
            : {
                value: round(solved.state.extremes.maxSteelTension.value, 6),
                y: round(solved.state.extremes.maxSteelTension.y, 6),
                z: round(solved.state.extremes.maxSteelTension.z, 6),
              },
      },
    },
    warnings: solved.converged
      ? []
      : [
          "The service stress equilibrium iteration did not converge within the configured limits.",
        ],
    assumptions: [
      `Service-stress equilibrium uses the RC modular-ratio method with n = ${round(modularRatio, 6)} and concrete tension excluded.`,
      "Default service steel response is linear elastic unless a different constitutive law is passed in.",
    ],
    metadata: {
      code,
      sectionId: model.id,
      analysisType: model.analysisType,
      solverMethod: "damped-newton-finite-difference",
      modularRatio: round(modularRatio, 6),
      ...metadata,
    },
  });
}
