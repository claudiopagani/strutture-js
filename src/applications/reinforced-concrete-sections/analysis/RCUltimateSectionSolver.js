import { IllinoisRootSolver } from "../../../domain/solvers/IllinoisRootSolver.js";
import { StrainField } from "./StrainField.js";
import { RCSectionStateIntegrator } from "./RCSectionStateIntegrator.js";

function resolveConcreteUltimateCompressionStrain(concreteLaw) {
  const compressionLimit = concreteLaw?.strainLimits?.().compression;

  if (!Number.isFinite(compressionLimit) || compressionLimit === 0) {
    throw new Error(
      "RCUltimateSectionSolver requires a concrete law with a finite compression strain limit.",
    );
  }

  return Math.abs(compressionLimit);
}

function buildStrainFieldForUniaxialFailure({
  bounds,
  neutralAxisDepth,
  ultimateCompressionStrain,
  compressedEdge,
}) {
  const height = bounds.maxY - bounds.minY;

  if (!Number.isFinite(neutralAxisDepth) || neutralAxisDepth <= 0) {
    throw new Error("Neutral axis depth must be positive.");
  }

  if (compressedEdge === "top") {
    const neutralAxisY = bounds.minY + neutralAxisDepth;
    const curvature = ultimateCompressionStrain / neutralAxisDepth;

    return new StrainField({
      eps0: -curvature * neutralAxisY,
      kappaY: 0,
      kappaZ: -curvature,
    });
  }

  if (compressedEdge === "bottom") {
    const neutralAxisY = bounds.maxY - neutralAxisDepth;
    const curvature = -ultimateCompressionStrain / neutralAxisDepth;

    return new StrainField({
      eps0: -curvature * neutralAxisY,
      kappaY: 0,
      kappaZ: -curvature,
    });
  }

  throw new Error(`Unsupported compressed edge: ${compressedEdge}.`);
}

function buildStrainFieldForOrientedFailure({
  bounds,
  theta,
  neutralAxisDepth,
  ultimateCompressionStrain,
  compressedSide,
}) {
  if (!Number.isFinite(theta)) {
    throw new Error("Theta must be finite.");
  }

  if (!Number.isFinite(neutralAxisDepth) || neutralAxisDepth <= 0) {
    throw new Error("Neutral axis depth must be positive.");
  }

  if (!["positive", "negative"].includes(compressedSide)) {
    throw new Error(`Unsupported compressed side: ${compressedSide}.`);
  }

  const corners = [
    { y: bounds.minY, z: bounds.minZ },
    { y: bounds.minY, z: bounds.maxZ },
    { y: bounds.maxY, z: bounds.maxZ },
    { y: bounds.maxY, z: bounds.minZ },
  ];
  const projection = ({ y, z }) => y * Math.cos(theta) + z * Math.sin(theta);
  const projectedExtremes = corners.map(projection);
  const maxProjection = Math.max(...projectedExtremes);
  const minProjection = Math.min(...projectedExtremes);
  const sideSign = compressedSide === "positive" ? 1 : -1;
  const compressedEdgeProjection =
    compressedSide === "positive" ? maxProjection : minProjection;
  const neutralAxisProjection =
    compressedEdgeProjection - sideSign * neutralAxisDepth;
  const curvature = ultimateCompressionStrain / neutralAxisDepth;

  return new StrainField({
    eps0: sideSign * curvature * neutralAxisProjection,
    kappaY: -sideSign * curvature * Math.sin(theta),
    kappaZ: sideSign * curvature * Math.cos(theta),
  });
}

function createDepthSamples(height, { minDepthFactor = 1e-4, maxDepthFactor = 5, steps = 80 } = {}) {
  const minDepth = Math.max(height * minDepthFactor, 1e-6);
  const maxDepth = Math.max(height * maxDepthFactor, minDepth * 10);
  const ratio = (maxDepth / minDepth) ** (1 / (steps - 1));
  const samples = [];

  let current = minDepth;

  for (let index = 0; index < steps; index += 1) {
    samples.push(current);
    current *= ratio;
  }

  return samples;
}

export class RCUltimateSectionSolver {
  constructor({
    rootSolver = new IllinoisRootSolver(),
    sectionIntegrator = new RCSectionStateIntegrator(),
  } = {}) {
    this.rootSolver = rootSolver;
    this.sectionIntegrator = sectionIntegrator;
  }

  solveAtAxialLoad({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    nEd,
    theta,
    compressedSide = "positive",
    referencePoint = null,
  } = {}) {
    if (!section?.concreteSection) {
      throw new Error("RCUltimateSectionSolver requires a reinforced concrete section.");
    }

    if (!Number.isFinite(theta)) {
      throw new Error("RCUltimateSectionSolver requires a finite theta.");
    }

    const bounds = section.getBoundingBox();
    const height = bounds.maxY - bounds.minY;
    const width = bounds.maxZ - bounds.minZ;
    const characteristicLength = Math.max(height, width);
    const ultimateCompressionStrain =
      resolveConcreteUltimateCompressionStrain(concreteLaw);
    const resolvedReferencePoint =
      referencePoint ?? section.getReferencePoint("concrete-centroid");

    const evaluateAtDepth = (neutralAxisDepth) => {
      const strainField = buildStrainFieldForOrientedFailure({
        bounds,
        theta,
        neutralAxisDepth,
        ultimateCompressionStrain,
        compressedSide,
      });
      const state = this.sectionIntegrator.evaluate({
        section,
        concreteFibers,
        concreteLaw,
        steelLaw,
        strainField,
        referencePoint: resolvedReferencePoint,
        includeConcreteTension: false,
      });

      return {
        neutralAxisDepth,
        strainField,
        state,
        residual: state.N - nEd,
      };
    };

    const samples = createDepthSamples(characteristicLength);
    const sampledStates = samples.map((depth) => evaluateAtDepth(depth));
    let bracket = null;

    for (let index = 1; index < sampledStates.length; index += 1) {
      const previous = sampledStates[index - 1];
      const current = sampledStates[index];

      if (previous.residual === 0) {
        bracket = { min: previous.neutralAxisDepth, max: previous.neutralAxisDepth };
        break;
      }

      if (previous.residual * current.residual <= 0) {
        bracket = {
          min: previous.neutralAxisDepth,
          max: current.neutralAxisDepth,
        };
        break;
      }
    }

    if (!bracket) {
      throw new Error(
        "RCUltimateSectionSolver could not bracket the axial equilibrium root for the requested axial load.",
      );
    }

    if (bracket.min === bracket.max) {
      const direct = evaluateAtDepth(bracket.min);

      return {
        converged: true,
        theta,
        compressedSide,
        neutralAxisDepth: direct.neutralAxisDepth,
        strainField: direct.strainField,
        axialResidual: direct.residual,
        N: direct.state.N,
        MxRd: direct.state.Mx,
        MyRd: direct.state.My,
        state: direct.state,
        solverReport: {
          method: "direct-hit",
          iterations: 0,
          bracket,
          sampledStates: sampledStates.map((sample) => ({
            neutralAxisDepth: sample.neutralAxisDepth,
            residual: sample.residual,
          })),
        },
      };
    }

    const root = this.rootSolver.solve({
      fn: (neutralAxisDepth) => evaluateAtDepth(neutralAxisDepth).state.N,
      min: bracket.min,
      max: bracket.max,
      target: nEd,
    });
    const solved = evaluateAtDepth(root.root);

    return {
      converged: root.converged,
      theta,
      compressedSide,
      neutralAxisDepth: solved.neutralAxisDepth,
      strainField: solved.strainField,
      axialResidual: solved.residual,
      N: solved.state.N,
      MxRd: solved.state.Mx,
      MyRd: solved.state.My,
      state: solved.state,
      solverReport: {
        method: "illinois",
        iterations: root.iterations,
        bracket: root.bracket,
        residual: root.residual,
        sampledStates: sampledStates.map((sample) => ({
          neutralAxisDepth: sample.neutralAxisDepth,
          residual: sample.residual,
        })),
      },
    };
  }

  solveUniaxialAtAxialLoad({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    nEd,
    compressedEdge = "top",
    referencePoint = null,
  } = {}) {
    const orientedResult = this.solveAtAxialLoad({
      section,
      concreteFibers,
      concreteLaw,
      steelLaw,
      nEd,
      theta: 0,
      compressedSide: compressedEdge === "top" ? "negative" : "positive",
      referencePoint,
    });

    return {
      ...orientedResult,
      compressedEdge,
    };
  }
}
