export function createZeroVector(size) {
  if (!Number.isInteger(size) || size < 0) {
    throw new Error("Vector size must be a non-negative integer.");
  }

  return new Array(size).fill(0);
}

export function createZeroMatrix(rows, columns = rows) {
  if (
    !Number.isInteger(rows) ||
    rows < 0 ||
    !Number.isInteger(columns) ||
    columns < 0
  ) {
    throw new Error("Matrix dimensions must be non-negative integers.");
  }

  return Array.from({ length: rows }, () => new Array(columns).fill(0));
}

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function roundTo(value, decimals = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;
}

export function solveLinearSystem3x3(matrix, vector) {
  if (
    !Array.isArray(matrix) ||
    matrix.length !== 3 ||
    matrix.some((row) => !Array.isArray(row) || row.length !== 3) ||
    !Array.isArray(vector) ||
    vector.length !== 3
  ) {
    throw new Error("A finite 3x3 matrix and three-entry vector are required.");
  }

  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  if (augmented.some((row) => row.some((value) => !Number.isFinite(value)))) {
    throw new Error("A finite 3x3 matrix and three-entry vector are required.");
  }

  for (let pivot = 0; pivot < 3; pivot += 1) {
    let maxRow = pivot;

    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) {
        maxRow = row;
      }
    }

    if (Math.abs(augmented[maxRow][pivot]) < 1e-18) {
      throw new Error("Singular 3x3 linear system.");
    }

    if (maxRow !== pivot) {
      [augmented[pivot], augmented[maxRow]] = [
        augmented[maxRow],
        augmented[pivot],
      ];
    }

    const pivotValue = augmented[pivot][pivot];

    for (let column = pivot; column < 4; column += 1) {
      augmented[pivot][column] /= pivotValue;
    }

    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) {
        continue;
      }

      const factor = augmented[row][pivot];

      for (let column = pivot; column < 4; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }

  return [augmented[0][3], augmented[1][3], augmented[2][3]];
}
