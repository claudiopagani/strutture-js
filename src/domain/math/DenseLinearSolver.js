function cloneDenseSquareMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error("DenseLinearSolver requires a non-empty matrix.");
  }

  const size = matrix.length;

  return matrix.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== size) {
      throw new Error("DenseLinearSolver requires a square matrix.");
    }

    return row.map((value, columnIndex) => {
      if (!Number.isFinite(value)) {
        throw new Error(
          `DenseLinearSolver matrix value at row ${rowIndex + 1}, column ${columnIndex + 1} must be finite.`,
        );
      }

      return value;
    });
  });
}

function cloneVector(vector, size) {
  if (!Array.isArray(vector) || vector.length !== size) {
    throw new Error("DenseLinearSolver requires a right-hand side vector matching the matrix size.");
  }

  return vector.map((value, index) => {
    if (!Number.isFinite(value)) {
      throw new Error(
        `DenseLinearSolver right-hand side value at index ${index + 1} must be finite.`,
      );
    }

    return value;
  });
}

function matrixScale(matrix) {
  let scale = 0;

  for (const row of matrix) {
    for (const value of row) {
      scale = Math.max(scale, Math.abs(value));
    }
  }

  return scale;
}

function computeResidual(matrix, solution, rhs) {
  let infNorm = 0;
  let l2NormSquared = 0;
  let rhsInfNorm = 0;

  for (let row = 0; row < matrix.length; row += 1) {
    let value = -rhs[row];
    rhsInfNorm = Math.max(rhsInfNorm, Math.abs(rhs[row]));

    for (let column = 0; column < matrix.length; column += 1) {
      value += matrix[row][column] * solution[column];
    }

    infNorm = Math.max(infNorm, Math.abs(value));
    l2NormSquared += value ** 2;
  }

  return {
    infNorm,
    l2Norm: Math.sqrt(l2NormSquared),
    relativeInfNorm: rhsInfNorm === 0 ? infNorm : infNorm / rhsInfNorm,
  };
}

function backSubstitute(upperMatrix, rhs) {
  const size = upperMatrix.length;
  const solution = new Array(size).fill(0);

  for (let row = size - 1; row >= 0; row -= 1) {
    let value = rhs[row];

    for (let column = row + 1; column < size; column += 1) {
      value -= upperMatrix[row][column] * solution[column];
    }

    solution[row] = value / upperMatrix[row][row];
  }

  return solution;
}

export class DenseLinearSolver {
  constructor({
    singularityTolerance = 1e-12,
    nearSingularityTolerance = 1e-9,
  } = {}) {
    if (!Number.isFinite(singularityTolerance) || singularityTolerance <= 0) {
      throw new Error("DenseLinearSolver requires a positive singularityTolerance.");
    }

    if (!Number.isFinite(nearSingularityTolerance) || nearSingularityTolerance <= 0) {
      throw new Error("DenseLinearSolver requires a positive nearSingularityTolerance.");
    }

    if (nearSingularityTolerance < singularityTolerance) {
      throw new Error(
        "DenseLinearSolver nearSingularityTolerance must be greater than or equal to singularityTolerance.",
      );
    }

    this.singularityTolerance = singularityTolerance;
    this.nearSingularityTolerance = nearSingularityTolerance;
  }

  solve(matrix, rhs) {
    return this.solveWithDiagnostics(matrix, rhs).solution;
  }

  solveWithDiagnostics(matrix, rhs) {
    const originalMatrix = cloneDenseSquareMatrix(matrix);
    const originalRhs = cloneVector(rhs, originalMatrix.length);
    const upperMatrix = originalMatrix.map((row) => [...row]);
    const transformedRhs = [...originalRhs];
    const size = upperMatrix.length;
    const scale = matrixScale(upperMatrix);

    if (scale === 0) {
      throw new Error("DenseLinearSolver detected a singular matrix with zero stiffness scale.");
    }

    const rowPermutation = Array.from({ length: size }, (_, index) => index);
    const pivots = [];
    let determinantSign = 1;

    for (let pivot = 0; pivot < size; pivot += 1) {
      let pivotRow = pivot;
      let pivotMagnitude = Math.abs(upperMatrix[pivot][pivot]);

      for (let row = pivot + 1; row < size; row += 1) {
        const candidateMagnitude = Math.abs(upperMatrix[row][pivot]);

        if (candidateMagnitude > pivotMagnitude) {
          pivotRow = row;
          pivotMagnitude = candidateMagnitude;
        }
      }

      if (pivotMagnitude <= this.singularityTolerance * scale) {
        throw new Error(
          `DenseLinearSolver detected a singular matrix near pivot ${pivot + 1}.`,
        );
      }

      if (pivotRow !== pivot) {
        [upperMatrix[pivot], upperMatrix[pivotRow]] = [
          upperMatrix[pivotRow],
          upperMatrix[pivot],
        ];
        [transformedRhs[pivot], transformedRhs[pivotRow]] = [
          transformedRhs[pivotRow],
          transformedRhs[pivot],
        ];
        [rowPermutation[pivot], rowPermutation[pivotRow]] = [
          rowPermutation[pivotRow],
          rowPermutation[pivot],
        ];
        determinantSign *= -1;
      }

      const pivotValue = upperMatrix[pivot][pivot];
      pivots.push(pivotValue);

      for (let row = pivot + 1; row < size; row += 1) {
        const factor = upperMatrix[row][pivot] / pivotValue;
        upperMatrix[row][pivot] = 0;

        for (let column = pivot + 1; column < size; column += 1) {
          upperMatrix[row][column] -= factor * upperMatrix[pivot][column];
        }

        transformedRhs[row] -= factor * transformedRhs[pivot];
      }
    }

    const solution = backSubstitute(upperMatrix, transformedRhs);
    const absPivots = pivots.map((value) => Math.abs(value));
    const minAbsPivot = Math.min(...absPivots);
    const maxAbsPivot = Math.max(...absPivots);
    const pivotScaleRatio = minAbsPivot / scale;
    const pivotSpreadRatio = maxAbsPivot === 0 ? Infinity : minAbsPivot / maxAbsPivot;
    const warnings = [];

    if (
      pivotScaleRatio <= this.nearSingularityTolerance ||
      pivotSpreadRatio <= this.nearSingularityTolerance
    ) {
      warnings.push(
        "DenseLinearSolver detected a small pivot; the matrix may be ill-conditioned.",
      );
    }

    return {
      method: "dense-gaussian-elimination-partial-pivoting",
      size,
      solution,
      rowPermutation,
      pivots,
      determinant: determinantSign * pivots.reduce((product, value) => product * value, 1),
      scale,
      minAbsPivot,
      maxAbsPivot,
      pivotScaleRatio,
      pivotSpreadRatio,
      residual: computeResidual(originalMatrix, solution, originalRhs),
      warnings,
    };
  }
}
