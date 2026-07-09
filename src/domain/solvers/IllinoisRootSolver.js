export class IllinoisRootSolver {
  constructor({ tolerance = 1e-6, maxIterations = 100 } = {}) {
    if (!Number.isFinite(tolerance) || tolerance <= 0) {
      throw new Error("IllinoisRootSolver requires a positive tolerance.");
    }

    if (!Number.isInteger(maxIterations) || maxIterations <= 0) {
      throw new Error("IllinoisRootSolver requires a positive integer maxIterations.");
    }

    this.tolerance = tolerance;
    this.maxIterations = maxIterations;
  }

  solve({ fn, min, max, target = 0, includeHistory = true } = {}) {
    if (typeof fn !== "function") {
      throw new Error("IllinoisRootSolver requires a fn callback.");
    }

    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      throw new Error("IllinoisRootSolver requires a finite bracket with min < max.");
    }

    if (!Number.isFinite(target)) {
      throw new Error("IllinoisRootSolver requires a finite target.");
    }

    const evaluate = (x) => {
      const rawValue = fn(x);

      if (!Number.isFinite(rawValue)) {
        throw new Error("IllinoisRootSolver function returned a non-finite value.");
      }

      return rawValue - target;
    };

    let a = min;
    let b = max;
    let fa = evaluate(a);
    let fb = evaluate(b);
    const history = includeHistory
      ? [
          { x: a, value: fa + target, residual: fa },
          { x: b, value: fb + target, residual: fb },
        ]
      : null;
    const historyResult = () => (includeHistory ? { history } : {});

    if (Math.abs(fa) <= this.tolerance) {
      return {
        converged: true,
        iterations: 0,
        root: a,
        value: fa + target,
        residual: fa,
        bracket: { min: a, max: b },
        ...historyResult(),
      };
    }

    if (Math.abs(fb) <= this.tolerance) {
      return {
        converged: true,
        iterations: 0,
        root: b,
        value: fb + target,
        residual: fb,
        bracket: { min: a, max: b },
        ...historyResult(),
      };
    }

    if (fa * fb > 0) {
      throw new Error("IllinoisRootSolver requires the function to change sign in the bracket.");
    }

    let lastUpdatedSide = null;
    let x = a;
    let fx = fa;

    for (let iteration = 1; iteration <= this.maxIterations; iteration += 1) {
      x = (a * fb - b * fa) / (fb - fa);
      fx = evaluate(x);
      if (includeHistory) {
        history.push({ x, value: fx + target, residual: fx });
      }

      if (Math.abs(fx) <= this.tolerance || Math.abs(b - a) <= this.tolerance) {
        return {
          converged: true,
          iterations: iteration,
          root: x,
          value: fx + target,
          residual: fx,
          bracket: { min: a, max: b },
          ...historyResult(),
        };
      }

      if (fa * fx < 0) {
        b = x;
        fb = fx;

        if (lastUpdatedSide === "b") {
          fa /= 2;
        }

        lastUpdatedSide = "b";
      } else if (fb * fx < 0) {
        a = x;
        fa = fx;

        if (lastUpdatedSide === "a") {
          fb /= 2;
        }

        lastUpdatedSide = "a";
      } else {
        return {
          converged: true,
          iterations: iteration,
          root: x,
          value: fx + target,
          residual: fx,
          bracket: { min: a, max: b },
          ...historyResult(),
        };
      }
    }

    return {
      converged: false,
      iterations: this.maxIterations,
      root: x,
      value: fx + target,
      residual: fx,
      bracket: { min: a, max: b },
      ...historyResult(),
    };
  }
}
