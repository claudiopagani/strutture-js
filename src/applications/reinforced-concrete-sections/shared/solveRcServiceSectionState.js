import { ConcreteNoTensionLaw } from "../../../domain/constitutive-laws/ConcreteNoTensionLaw.js";
import { SteelElasticLaw } from "../../../domain/constitutive-laws/SteelElasticLaw.js";
import { isFinitePositive } from "./rcCommon.js";
import { RCServiceStressSolver } from "../analysis/RCServiceStressSolver.js";
import { SectionFiberDiscretizer } from "../analysis/SectionFiberDiscretizer.js";
import { solveServiceStressWithFallbacks } from "../analysis/solveServiceStressWithFallbacks.js";

export function createRcServiceSectionSolverContext({
  section,
  reinforcementMaterial,
  mesh = {},
  solver = {},
  modularRatio,
  concreteLaw = null,
  steelLaw = null,
}) {
  const es = reinforcementMaterial?.elasticModulus;

  if (!section?.concreteSection) {
    throw new Error("RC SLE verification requires a reinforced concrete section.");
  }

  if (!isFinitePositive(es)) {
    throw new Error("RC SLE verification requires reinforcement elastic modulus.");
  }

  if (!isFinitePositive(modularRatio) && (!concreteLaw || !steelLaw)) {
    throw new Error("RC SLE verification requires a positive modular ratio n.");
  }

  const discretizer = new SectionFiberDiscretizer();
  const concreteMesh = discretizer.discretize(section, {
    targetCount: mesh?.targetFiberCount ?? 100,
  });
  const serviceSolver = new RCServiceStressSolver({
    tolerance: solver?.tolerance ?? 1e-2,
    maxIterations: solver?.maxIterations ?? 50,
    finiteDifferenceStep: solver?.finiteDifferenceStep ?? 1e-8,
  });

  return {
    mesh: concreteMesh,
    serviceSolver,
    concreteLaw:
      concreteLaw ??
      new ConcreteNoTensionLaw({
        ecm: es / modularRatio,
      }),
    steelLaw:
      steelLaw ??
      new SteelElasticLaw({
        Es: es,
      }),
  };
}

export function solveRcServiceSectionState({
  section,
  reinforcementMaterial,
  actions,
  mesh,
  solver,
  modularRatio,
  concreteMesh = null,
  serviceSolver = null,
  concreteLaw = null,
  steelLaw = null,
  initialGuess = solver?.initialGuess ?? {},
  referencePoint = null,
  useFallbacks = true,
}) {
  const context =
    concreteMesh && serviceSolver && concreteLaw && steelLaw
      ? {
          mesh: concreteMesh,
          serviceSolver,
          concreteLaw,
          steelLaw,
        }
      : createRcServiceSectionSolverContext({
          section,
          reinforcementMaterial,
          mesh,
          solver,
          modularRatio,
          concreteLaw,
          steelLaw,
        });

  const solveInput = {
    serviceSolver: context.serviceSolver,
    section,
    concreteFibers: context.mesh.fibers,
    concreteLaw: context.concreteLaw,
    steelLaw: context.steelLaw,
    actions,
    referencePoint,
    initialGuess,
  };

  return {
    mesh: context.mesh,
    concreteLaw: context.concreteLaw,
    steelLaw: context.steelLaw,
    serviceSolver: context.serviceSolver,
    solved: useFallbacks
      ? solveServiceStressWithFallbacks(solveInput)
      : context.serviceSolver.solve({
          section,
          concreteFibers: context.mesh.fibers,
          concreteLaw: context.concreteLaw,
          steelLaw: context.steelLaw,
          actions,
          referencePoint,
          initialGuess,
        }),
  };
}
