import { IllinoisRootSolver } from "../../../domain/solvers/IllinoisRootSolver.js";
import { RCMomentCurvatureAnalyzer } from "../analysis/RCMomentCurvatureAnalyzer.js";
import { RCUltimateSectionSolver } from "../analysis/RCUltimateSectionSolver.js";
import { SectionFiberDiscretizer } from "../analysis/SectionFiberDiscretizer.js";
import {
  resolveConcreteLaw,
  resolveServiceConcreteLaw,
  resolveServiceSteelLaw,
  resolveSteelLaw,
} from "./rcConstitutiveLaws.js";
import { resolveReferencePoint } from "./rcCommon.js";

export function createRcSectionAnalysisContext(model, { service = false } = {}) {
  const section = model.section;
  const targetFiberCount = model.mesh?.targetFiberCount ?? 100;
  const referencePoint = resolveReferencePoint(section, model.referencePoint);
  const concreteLaw = service
    ? resolveServiceConcreteLaw(model, section)
    : resolveConcreteLaw(model, section);
  const steelLaw = service
    ? resolveServiceSteelLaw(model, section)
    : resolveSteelLaw(model, section);
  const discretizer = new SectionFiberDiscretizer();
  const mesh = discretizer.discretize(section, {
    targetCount: targetFiberCount,
  });

  return {
    model,
    section,
    targetFiberCount,
    referencePoint,
    concreteLaw,
    steelLaw,
    mesh,
  };
}

export function createUltimateSectionSolver(model) {
  return new RCUltimateSectionSolver({
    rootSolver: new IllinoisRootSolver({
      tolerance: model.solver?.tolerance ?? 1e-6,
      maxIterations: model.solver?.maxIterations ?? 100,
    }),
  });
}

export function createMomentCurvatureAnalyzer(model) {
  return new RCMomentCurvatureAnalyzer({
    axialRootSolver: new IllinoisRootSolver({
      tolerance: model.solver?.tolerance ?? 1e-6,
      maxIterations: model.solver?.maxIterations ?? 100,
    }),
    limitRootSolver: new IllinoisRootSolver({
      tolerance: model.solver?.limitTolerance ?? model.solver?.tolerance ?? 1e-8,
      maxIterations: model.solver?.limitMaxIterations ?? 60,
    }),
    eps0Samples: model.solver?.eps0Samples ?? 161,
    eps0Min: model.solver?.eps0Min ?? -0.08,
    eps0Max: model.solver?.eps0Max ?? 0.08,
  });
}
