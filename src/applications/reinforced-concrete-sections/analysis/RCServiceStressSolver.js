import { StrainField } from "./StrainField.js";
import { RCSectionStateIntegrator } from "./RCSectionStateIntegrator.js";

function solveLinearSystem3x3(matrix, vector) {
  const a = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivot = 0; pivot < 3; pivot += 1) {
    let maxRow = pivot;

    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(a[row][pivot]) > Math.abs(a[maxRow][pivot])) {
        maxRow = row;
      }
    }

    if (Math.abs(a[maxRow][pivot]) < 1e-18) {
      throw new Error("Singular 3x3 linear system.");
    }

    if (maxRow !== pivot) {
      [a[pivot], a[maxRow]] = [a[maxRow], a[pivot]];
    }

    const pivotValue = a[pivot][pivot];

    for (let column = pivot; column < 4; column += 1) {
      a[pivot][column] /= pivotValue;
    }

    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) {
        continue;
      }

      const factor = a[row][pivot];

      for (let column = pivot; column < 4; column += 1) {
        a[row][column] -= factor * a[pivot][column];
      }
    }
  }

  return [a[0][3], a[1][3], a[2][3]];
}

function residualNorm(residual) {
  return Math.sqrt(
    residual[0] ** 2 +
      residual[1] ** 2 +
      residual[2] ** 2,
  );
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
    let variables = [
      initialGuess.eps0 ?? 0,
      initialGuess.kappaY ?? 0,
      initialGuess.kappaZ ?? 0,
    ];

    const evaluate = ([eps0, kappaY, kappaZ]) => {
      const strainField = new StrainField({ eps0, kappaY, kappaZ });
      const state = this.sectionIntegrator.evaluate({
        section,
        concreteFibers,
        concreteLaw,
        steelLaw,
        strainField,
        referencePoint: resolvedReferencePoint,
        includeConcreteTension: false,
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
        return {
          converged: true,
          iterations: iteration - 1,
          strainField: current.strainField,
          state: current.state,
          residual: {
            n: current.residual[0],
            mx: current.residual[1],
            my: current.residual[2],
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

    return {
      converged: current.norm <= this.tolerance,
      iterations: history.length - 1,
      strainField: current.strainField,
      state: current.state,
      residual: {
        n: current.residual[0],
        mx: current.residual[1],
        my: current.residual[2],
      },
      history,
    };
  }
}
