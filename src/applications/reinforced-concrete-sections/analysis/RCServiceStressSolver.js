import {
  StrainField,
  createAffineStrainField,
} from "./StrainField.js";
import { RCSectionStateIntegrator } from "./RCSectionStateIntegrator.js";
import { solveLinearSystem3x3 } from "../../../domain/math/arrayLinearAlgebra.js";

function residualNorm(residual) {
  return Math.sqrt(
    residual[0] ** 2 +
      residual[1] ** 2 +
      residual[2] ** 2,
  );
}

function residualNormUniaxial(residual) {
  return Math.hypot(residual[0], residual[1]);
}

function solveLinearSystem2x2(matrix, rightHandSide) {
  const [[a, b], [c, d]] = matrix;
  const [e, f] = rightHandSide;
  const determinant = a * d - b * c;
  const scale = Math.max(Math.abs(a * d), Math.abs(b * c), 1);

  if (!Number.isFinite(determinant) || Math.abs(determinant) <= Number.EPSILON * scale) {
    throw new Error("Cannot solve singular 2x2 linear system.");
  }

  return [(e * d - b * f) / determinant, (a * f - e * c) / determinant];
}

export class RCServiceStressSolver {
  constructor({
    sectionIntegrator = new RCSectionStateIntegrator(),
    tolerance = 1e-3,
    maxIterations = 40,
    finiteDifferenceStep = 1e-8,
  } = {}) {
    this.sectionIntegrator = sectionIntegrator;
    this.tolerance = tolerance;
    this.maxIterations = maxIterations;
    this.finiteDifferenceStep = finiteDifferenceStep;
  }

  solve({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    actions,
    referencePoint = null,
    initialGuess = {},
  } = {}) {
    if (!section?.concreteSection) {
      throw new Error("RCServiceStressSolver requires a reinforced concrete section.");
    }

    if (!Array.isArray(concreteFibers) || concreteFibers.length === 0) {
      throw new Error("RCServiceStressSolver requires a non-empty concreteFibers array.");
    }

    const nEd = actions?.nEd ?? actions?.axialForce;
    const mxEd = actions?.mxEd ?? actions?.mEd ?? 0;
    const myEd = actions?.myEd ?? 0;

    if (!Number.isFinite(nEd) || !Number.isFinite(mxEd) || !Number.isFinite(myEd)) {
      throw new Error(
        "RCServiceStressSolver requires finite actions nEd/mxEd/myEd values.",
      );
    }

    const resolvedReferencePoint =
      referencePoint ?? section.getReferencePoint("concrete-centroid");
    const evaluateResultants =
      typeof this.sectionIntegrator.createResultantEvaluator === "function"
        ? this.sectionIntegrator.createResultantEvaluator({
            section,
            concreteFibers,
            concreteLaw,
            steelLaw,
            referencePoint: resolvedReferencePoint,
            includeConcreteTension: false,
          })
        : null;
    let variables = [
      initialGuess.eps0 ?? 0,
      initialGuess.kappaY ?? 0,
      initialGuess.kappaZ ?? 0,
    ];

    const evaluate = (
      [eps0, kappaY, kappaZ],
      { includeResponseDetails = false } = {},
    ) => {
      const coefficients = { eps0, kappaY, kappaZ };
      const strainField = includeResponseDetails
        ? new StrainField(coefficients)
        : createAffineStrainField(coefficients);
      const state =
        !includeResponseDetails && evaluateResultants
          ? evaluateResultants(strainField)
          : this.sectionIntegrator.evaluate({
              section,
              concreteFibers,
              concreteLaw,
              steelLaw,
              strainField,
              referencePoint: resolvedReferencePoint,
              includeConcreteTension: false,
              includeResponseDetails,
            });
      const residual = [state.N - nEd, state.Mx - mxEd, state.My - myEd];

      return {
        strainField,
        state,
        residual,
        norm: residualNorm(residual),
      };
    };

    let current = evaluate(variables);
    const history = [
      {
        iteration: 0,
        eps0: variables[0],
        kappaY: variables[1],
        kappaZ: variables[2],
        norm: current.norm,
      },
    ];

    for (let iteration = 1; iteration <= this.maxIterations; iteration += 1) {
      if (current.norm <= this.tolerance) {
        const detailed = evaluate(variables, {
          includeResponseDetails: true,
        });

        return {
          converged: true,
          iterations: iteration - 1,
          strainField: detailed.strainField,
          state: detailed.state,
          residual: {
            n: detailed.residual[0],
            mx: detailed.residual[1],
            my: detailed.residual[2],
          },
          history,
        };
      }

      const base = variables;
      const jacobian = [[], [], []];

      for (let column = 0; column < 3; column += 1) {
        const perturbed = [...base];
        perturbed[column] += this.finiteDifferenceStep;
        const evaluated = evaluate(perturbed);

        for (let row = 0; row < 3; row += 1) {
          jacobian[row][column] =
            (evaluated.residual[row] - current.residual[row]) /
            this.finiteDifferenceStep;
        }
      }

      const increment = solveLinearSystem3x3(jacobian, current.residual.map((value) => -value));
      let accepted = false;
      let damping = 1;
      let candidate = current;

      while (damping >= 1 / 64) {
        const trialVariables = base.map(
          (value, index) => value + damping * increment[index],
        );
        const trial = evaluate(trialVariables);

        if (trial.norm < current.norm) {
          variables = trialVariables;
          candidate = trial;
          accepted = true;
          history.push({
            iteration,
            eps0: variables[0],
            kappaY: variables[1],
            kappaZ: variables[2],
            norm: candidate.norm,
            damping,
          });
          break;
        }

        damping /= 2;
      }

      if (!accepted) {
        break;
      }

      current = candidate;
    }

    const detailed = evaluate(variables, {
      includeResponseDetails: true,
    });

    return {
      converged: current.norm <= this.tolerance,
      iterations: history.length - 1,
      strainField: detailed.strainField,
      state: detailed.state,
      residual: {
        n: detailed.residual[0],
        mx: detailed.residual[1],
        my: detailed.residual[2],
      },
      history,
    };
  }

  solveUniaxial({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    actions,
    referencePoint = null,
    initialGuess = {},
  } = {}) {
    if (!section?.concreteSection) {
      throw new Error("RCServiceStressSolver requires a reinforced concrete section.");
    }

    if (!Array.isArray(concreteFibers) || concreteFibers.length === 0) {
      throw new Error("RCServiceStressSolver requires a non-empty concreteFibers array.");
    }

    const nEd = actions?.nEd ?? actions?.axialForce;
    const mxEd = actions?.mxEd ?? actions?.mEd ?? 0;
    const myEd = actions?.myEd ?? 0;

    if (!Number.isFinite(nEd) || !Number.isFinite(mxEd) || !Number.isFinite(myEd)) {
      throw new Error(
        "RCServiceStressSolver requires finite actions nEd/mxEd/myEd values.",
      );
    }

    if (Math.abs(myEd) > this.tolerance) {
      throw new Error(
        "RCServiceStressSolver uniaxial analysis requires myEd equal to zero.",
      );
    }

    const resolvedReferencePoint =
      referencePoint ?? section.getReferencePoint("concrete-centroid");
    const evaluateResultants =
      typeof this.sectionIntegrator.createResultantEvaluator === "function"
        ? this.sectionIntegrator.createResultantEvaluator({
            section,
            concreteFibers,
            concreteLaw,
            steelLaw,
            referencePoint: resolvedReferencePoint,
            includeConcreteTension: false,
          })
        : null;
    let variables = [initialGuess.eps0 ?? 0, initialGuess.kappaZ ?? 0];

    const evaluate = (
      [eps0, kappaZ],
      { includeResponseDetails = false } = {},
    ) => {
      const coefficients = { eps0, kappaY: 0, kappaZ };
      const strainField = includeResponseDetails
        ? new StrainField(coefficients)
        : createAffineStrainField(coefficients);
      const state =
        !includeResponseDetails && evaluateResultants
          ? evaluateResultants(strainField)
          : this.sectionIntegrator.evaluate({
              section,
              concreteFibers,
              concreteLaw,
              steelLaw,
              strainField,
              referencePoint: resolvedReferencePoint,
              includeConcreteTension: false,
              includeResponseDetails,
            });
      const residual = [state.N - nEd, state.Mx - mxEd];

      return {
        strainField,
        state,
        residual,
        norm: residualNormUniaxial(residual),
      };
    };

    let current = evaluate(variables);
    const history = [
      {
        iteration: 0,
        eps0: variables[0],
        kappaY: 0,
        kappaZ: variables[1],
        norm: current.norm,
      },
    ];

    for (let iteration = 1; iteration <= this.maxIterations; iteration += 1) {
      if (current.norm <= this.tolerance) {
        const detailed = evaluate(variables, { includeResponseDetails: true });

        return {
          converged: true,
          analysisMode: "uniaxial",
          iterations: iteration - 1,
          strainField: detailed.strainField,
          state: detailed.state,
          residual: {
            n: detailed.residual[0],
            mx: detailed.residual[1],
            my: detailed.state.My - myEd,
          },
          history,
        };
      }

      const base = variables;
      const jacobian = [[], []];

      for (let column = 0; column < 2; column += 1) {
        const perturbed = [...base];
        perturbed[column] += this.finiteDifferenceStep;
        const evaluated = evaluate(perturbed);

        for (let row = 0; row < 2; row += 1) {
          jacobian[row][column] =
            (evaluated.residual[row] - current.residual[row]) /
            this.finiteDifferenceStep;
        }
      }

      const increment = solveLinearSystem2x2(
        jacobian,
        current.residual.map((value) => -value),
      );
      let accepted = false;
      let damping = 1;
      let candidate = current;

      while (damping >= 1 / 64) {
        const trialVariables = base.map(
          (value, index) => value + damping * increment[index],
        );
        const trial = evaluate(trialVariables);

        if (trial.norm < current.norm) {
          variables = trialVariables;
          candidate = trial;
          accepted = true;
          history.push({
            iteration,
            eps0: variables[0],
            kappaY: 0,
            kappaZ: variables[1],
            norm: candidate.norm,
            damping,
          });
          break;
        }

        damping /= 2;
      }

      if (!accepted) {
        break;
      }

      current = candidate;
    }

    const detailed = evaluate(variables, { includeResponseDetails: true });

    return {
      converged: current.norm <= this.tolerance,
      analysisMode: "uniaxial",
      iterations: history.length - 1,
      strainField: detailed.strainField,
      state: detailed.state,
      residual: {
        n: detailed.residual[0],
        mx: detailed.residual[1],
        my: detailed.state.My - myEd,
      },
      history,
    };
  }
}
