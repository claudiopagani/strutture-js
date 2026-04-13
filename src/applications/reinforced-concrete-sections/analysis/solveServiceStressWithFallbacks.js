const DEFAULT_INITIAL_GUESSES = Object.freeze([
  {},
  { kappaZ: 1e-7 },
  { kappaZ: -1e-7 },
  { kappaZ: 1e-6 },
  { kappaZ: -1e-6 },
  { kappaY: 1e-7 },
  { kappaY: -1e-7 },
]);

function normalizeInitialGuess(initialGuess) {
  return {
    ...(initialGuess ?? {}),
  };
}

function mergeGuess(base, guess) {
  return {
    ...base,
    ...guess,
  };
}

function guessKey(guess) {
  return JSON.stringify([
    guess.eps0 ?? 0,
    guess.kappaY ?? 0,
    guess.kappaZ ?? 0,
  ]);
}

function serviceStressNorm(result) {
  const residual = result?.residual ?? {};

  return Math.sqrt(
    (residual.n ?? 0) ** 2 +
      (residual.mx ?? 0) ** 2 +
      (residual.my ?? 0) ** 2,
  );
}

export function solveServiceStressWithFallbacks({
  serviceSolver,
  section,
  concreteFibers,
  concreteLaw,
  steelLaw,
  actions,
  referencePoint = null,
  initialGuess = {},
} = {}) {
  const baseGuess = normalizeInitialGuess(initialGuess);
  const guesses = [
    baseGuess,
    ...DEFAULT_INITIAL_GUESSES.map((guess) => mergeGuess(baseGuess, guess)),
  ];
  const used = new Set();
  let best = null;
  let lastError = null;

  for (const guess of guesses) {
    const key = guessKey(guess);

    if (used.has(key)) {
      continue;
    }

    used.add(key);

    let result = null;

    try {
      result = serviceSolver.solve({
        section,
        concreteFibers,
        concreteLaw,
        steelLaw,
        actions,
        referencePoint,
        initialGuess: guess,
      });
    } catch (error) {
      lastError = error;
      continue;
    }

    if (result.converged) {
      return {
        ...result,
        initialGuess: guess,
        fallbackUsed: used.size > 1,
      };
    }

    if (!best || serviceStressNorm(result) < serviceStressNorm(best)) {
      best = {
        ...result,
        initialGuess: guess,
        fallbackUsed: used.size > 1,
      };
    }
  }

  if (best) {
    return best;
  }

  throw lastError ?? new Error("RC service stress solver did not return a result.");
}
