import { IllinoisRootSolver } from "../../../domain/solvers/IllinoisRootSolver.js";
import { StrainField } from "./StrainField.js";
import { RCSectionStateIntegrator } from "./RCSectionStateIntegrator.js";
import {
  getConcreteProjectedBounds,
  neutralAxisDirection,
  projectionAt,
  resolveConcreteStrainExtremes,
} from "./RCSectionStrainExtremes.js";

function resolveConcreteUltimateCompressionStrain(concreteLaw) {
  const compressionLimit = concreteLaw?.strainLimits?.().compression;

  if (!Number.isFinite(compressionLimit) || compressionLimit === 0) {
    throw new Error(
      "RCUltimateSectionSolver requires a concrete law with a finite compression strain limit.",
    );
  }

  return Math.abs(compressionLimit);
}

function resolveSteelUltimateTensionStrain(steelLaw) {
  const tensionLimit = steelLaw?.strainLimits?.().tension;

  return Number.isFinite(tensionLimit) && tensionLimit > 0
    ? Math.abs(tensionLimit)
    : null;
}

function buildStrainFieldForOrientedFailure({
  section,
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

  const projectedBounds = getConcreteProjectedBounds(section, theta);
  const direction = neutralAxisDirection(theta);
  const minProjection = projectedBounds.minimum.projection;
  const maxProjection = projectedBounds.maximum.projection;
  const sideSign = compressedSide === "positive" ? 1 : -1;
  const compressedEdgeProjection =
    compressedSide === "positive" ? maxProjection : minProjection;
  const neutralAxisProjection =
    compressedEdgeProjection - sideSign * neutralAxisDepth;
  const curvature = ultimateCompressionStrain / neutralAxisDepth;

  return new StrainField({
    eps0: sideSign * curvature * neutralAxisProjection,
    kappaY: sideSign * curvature * direction.sin,
    kappaZ: sideSign * curvature * direction.cos,
  });
}

function buildStrainFieldForOrientedSteelTensionFailure({
  section,
  theta,
  neutralAxisDepth,
  ultimateTensionStrain,
  compressedSide,
  reinforcementBars,
}) {
  if (!Number.isFinite(theta)) {
    throw new Error("Theta must be finite.");
  }

  if (!Number.isFinite(neutralAxisDepth) || neutralAxisDepth <= 0) {
    throw new Error("Neutral axis depth must be positive.");
  }

  if (!Number.isFinite(ultimateTensionStrain) || ultimateTensionStrain <= 0) {
    throw new Error("Steel ultimate tension strain must be positive.");
  }

  if (!["positive", "negative"].includes(compressedSide)) {
    throw new Error(`Unsupported compressed side: ${compressedSide}.`);
  }

  if (!Array.isArray(reinforcementBars) || reinforcementBars.length === 0) {
    throw new Error("Steel tension failure requires reinforcement bars.");
  }

  const projectedBounds = getConcreteProjectedBounds(section, theta);
  const direction = neutralAxisDirection(theta);
  const minProjection = projectedBounds.minimum.projection;
  const maxProjection = projectedBounds.maximum.projection;
  const steelProjections = reinforcementBars.map((bar) => projectionAt(theta, bar));
  const sideSign = compressedSide === "positive" ? 1 : -1;
  const compressedEdgeProjection =
    compressedSide === "positive" ? maxProjection : minProjection;
  const tensionBarProjection =
    compressedSide === "positive"
      ? Math.min(...steelProjections)
      : Math.max(...steelProjections);
  const neutralAxisProjection =
    compressedEdgeProjection - sideSign * neutralAxisDepth;
  const tensionDistance =
    sideSign * (neutralAxisProjection - tensionBarProjection);

  if (!Number.isFinite(tensionDistance) || tensionDistance <= 0) {
    throw new Error("Steel tension failure requires the neutral axis before the tension reinforcement.");
  }

  const curvature = ultimateTensionStrain / tensionDistance;

  return new StrainField({
    eps0: sideSign * curvature * neutralAxisProjection,
    kappaY: sideSign * curvature * direction.sin,
    kappaZ: sideSign * curvature * direction.cos,
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

function createDepthSamplesInRange({ minimum, maximum, steps = 80 }) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) {
    throw new Error("A valid neutral-axis depth range is required.");
  }

  const ratio = (maximum / minimum) ** (1 / (steps - 1));
  const samples = [];
  let current = minimum;

  for (let index = 0; index < steps; index += 1) {
    samples.push(index === steps - 1 ? maximum : current);
    current *= ratio;
  }

  return samples;
}

function maxSteelTensionStrain(state) {
  return Math.max(
    0,
    state?.extremes?.maxSteelTensionStrain?.strain ??
      state?.extremes?.maxSteelTension?.strain ??
      0,
  );
}

function steelTensionExceeded(state, ultimateTensionStrain, tolerance = 1e-9) {
  return (
    Number.isFinite(ultimateTensionStrain) &&
    ultimateTensionStrain > 0 &&
    maxSteelTensionStrain(state) > ultimateTensionStrain * (1 + tolerance)
  );
}

/**
 * Ultimate resistance solver using theta counterclockwise from +z toward +y.
 */
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

    const normalizedTheta = neutralAxisDirection(theta).theta;
    const bounds = section.getBoundingBox();
    const height = bounds.maxY - bounds.minY;
    const width = bounds.maxZ - bounds.minZ;
    const characteristicLength = Math.max(height, width);
    const ultimateCompressionStrain =
      resolveConcreteUltimateCompressionStrain(concreteLaw);
    const ultimateSteelTensionStrain =
      resolveSteelUltimateTensionStrain(steelLaw);
    const resolvedReferencePoint =
      referencePoint ?? section.getReferencePoint("concrete-centroid");
    const reinforcementBars = section.getReinforcementBars();

    const evaluateConcreteFailureAtDepth = (neutralAxisDepth) => {
      const strainField = buildStrainFieldForOrientedFailure({
        section,
        theta: normalizedTheta,
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
        postUltimateResponse: "retain",
      });

      return {
        neutralAxisDepth,
        strainField,
        state,
        concreteStrainExtremes: resolveConcreteStrainExtremes({
          section,
          strainField,
        }),
        residual: state.N - nEd,
      };
    };

    const solveCandidate = ({ samples, evaluateAtDepth, failureMode }) => {
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
          `RCUltimateSectionSolver could not bracket the axial equilibrium root for ${failureMode}.`,
        );
      }

      const sampledStateReport = sampledStates.map((sample) => ({
        neutralAxisDepth: sample.neutralAxisDepth,
        residual: sample.residual,
      }));

      if (bracket.min === bracket.max) {
        const direct = evaluateAtDepth(bracket.min);

        return {
          converged: true,
          theta: normalizedTheta,
          compressedSide,
          failureMode,
          neutralAxisDepth: direct.neutralAxisDepth,
          strainField: direct.strainField,
          axialResidual: direct.residual,
          N: direct.state.N,
          MxRd: direct.state.Mx,
          MyRd: direct.state.My,
          state: direct.state,
          concreteStrainExtremes: direct.concreteStrainExtremes,
          solverReport: {
            method: "direct-hit",
            iterations: 0,
            bracket,
            failureMode,
            sampledStates: sampledStateReport,
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
        theta: normalizedTheta,
        compressedSide,
        failureMode,
        neutralAxisDepth: solved.neutralAxisDepth,
        strainField: solved.strainField,
        axialResidual: solved.residual,
        N: solved.state.N,
        MxRd: solved.state.Mx,
        MyRd: solved.state.My,
        state: solved.state,
        concreteStrainExtremes: solved.concreteStrainExtremes,
        solverReport: {
          method: "illinois",
          iterations: root.iterations,
          bracket: root.bracket,
          residual: root.residual,
          failureMode,
          sampledStates: sampledStateReport,
        },
      };
    };

    const solveSteelTensionCandidate = () => {
      if (!Number.isFinite(ultimateSteelTensionStrain)) {
        throw new Error(
          "RCUltimateSectionSolver requires a finite steel ultimate strain for steel tension failure.",
        );
      }

      const projectedBounds = getConcreteProjectedBounds(section, normalizedTheta);
      const minProjection = projectedBounds.minimum.projection;
      const maxProjection = projectedBounds.maximum.projection;
      const steelProjections = reinforcementBars.map((bar) =>
        projectionAt(normalizedTheta, bar),
      );
      const sideSign = compressedSide === "positive" ? 1 : -1;
      const compressedEdgeProjection =
        compressedSide === "positive" ? maxProjection : minProjection;
      const tensionBarProjection =
        compressedSide === "positive"
          ? Math.min(...steelProjections)
          : Math.max(...steelProjections);
      const maximumTensionDistance =
        sideSign * (compressedEdgeProjection - tensionBarProjection);
      const minimumDepth = Math.max(characteristicLength * 1e-4, 1e-6);
      const maximumDepth = maximumTensionDistance * (1 - 1e-6);

      const evaluateSteelFailureAtDepth = (neutralAxisDepth) => {
        const strainField = buildStrainFieldForOrientedSteelTensionFailure({
          section,
          theta: normalizedTheta,
          neutralAxisDepth,
          ultimateTensionStrain: ultimateSteelTensionStrain,
          compressedSide,
          reinforcementBars,
        });
        const state = this.sectionIntegrator.evaluate({
          section,
          concreteFibers,
          concreteLaw,
          steelLaw,
          strainField,
          referencePoint: resolvedReferencePoint,
          includeConcreteTension: false,
          postUltimateResponse: "retain",
        });

        return {
          neutralAxisDepth,
          strainField,
          state,
          concreteStrainExtremes: resolveConcreteStrainExtremes({
            section,
            strainField,
          }),
          residual: state.N - nEd,
        };
      };

      return solveCandidate({
        samples: createDepthSamplesInRange({
          minimum: minimumDepth,
          maximum: maximumDepth,
        }),
        evaluateAtDepth: evaluateSteelFailureAtDepth,
        failureMode: "steel-tension",
      });
    };

    const solveUniformSteelTensionCandidate = () => {
      if (!Number.isFinite(ultimateSteelTensionStrain)) {
        throw new Error(
          "RCUltimateSectionSolver requires a finite steel ultimate strain for pure steel tension failure.",
        );
      }

      const strainField = new StrainField({
        eps0: ultimateSteelTensionStrain,
        kappaY: 0,
        kappaZ: 0,
      });
      const state = this.sectionIntegrator.evaluate({
        section,
        concreteFibers,
        concreteLaw,
        steelLaw,
        strainField,
        referencePoint: resolvedReferencePoint,
        includeConcreteTension: false,
        postUltimateResponse: "retain",
      });
      const residual = state.N - nEd;
      const concreteStrainExtremes = resolveConcreteStrainExtremes({
        section,
        strainField,
      });
      const axialTolerance = Math.max(10, Math.abs(nEd) * 1e-6);

      if (Math.abs(residual) > axialTolerance) {
        throw new Error(
          "RCUltimateSectionSolver pure steel tension state does not match the axial load.",
        );
      }

      return {
        converged: true,
        theta: normalizedTheta,
        compressedSide,
        failureMode: "steel-tension",
        neutralAxisDepth: Number.POSITIVE_INFINITY,
        strainField,
        axialResidual: residual,
        N: state.N,
        MxRd: state.Mx,
        MyRd: state.My,
        state,
        concreteStrainExtremes,
        solverReport: {
          method: "uniform-steel-tension",
          iterations: 0,
          residual,
          failureMode: "steel-tension",
        },
      };
    };

    let concreteCandidate = null;
    let concreteError = null;

    try {
      concreteCandidate = solveCandidate({
        samples: createDepthSamples(characteristicLength),
        evaluateAtDepth: evaluateConcreteFailureAtDepth,
        failureMode: "concrete-compression",
      });
    } catch (error) {
      concreteError = error;
    }

    if (
      concreteCandidate &&
      !steelTensionExceeded(concreteCandidate.state, ultimateSteelTensionStrain)
    ) {
      return concreteCandidate;
    }

    try {
      return solveSteelTensionCandidate();
    } catch (steelError) {
      try {
        return solveUniformSteelTensionCandidate();
      } catch {
        // Keep the original bracketing error when the pure-tension limit is not applicable.
      }

      if (concreteCandidate) {
        throw steelError;
      }

      throw concreteError ?? steelError;
    }
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
      compressedSide: compressedEdge === "top" ? "positive" : "negative",
      referencePoint,
    });

    return {
      ...orientedResult,
      compressedEdge,
    };
  }
}
