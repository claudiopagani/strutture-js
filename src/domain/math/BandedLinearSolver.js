import { createZeroMatrix, createZeroVector } from "./arrayLinearAlgebra.js";

function cloneSymmetricMatrix(matrix, symmetryTolerance) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error("BandedLinearSolver requires a non-empty matrix.");
  }

  const size = matrix.length;
  const clone = matrix.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== size) {
      throw new Error("BandedLinearSolver requires a square matrix.");
    }

    return row.map((value, columnIndex) => {
      if (!Number.isFinite(value)) {
        throw new Error(
          `BandedLinearSolver matrix value at row ${rowIndex + 1}, column ${columnIndex + 1} must be finite.`,
        );
      }

      return value;
    });
  });

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < row; column += 1) {
      const scale = Math.max(
        1,
        Math.abs(clone[row][column]),
        Math.abs(clone[column][row]),
      );

      if (
        Math.abs(clone[row][column] - clone[column][row]) >
        symmetryTolerance * scale
      ) {
        throw new Error("BandedLinearSolver requires a symmetric matrix.");
      }
    }
  }

  return clone;
}

function cloneVector(vector, size) {
  if (!Array.isArray(vector) || vector.length !== size) {
    throw new Error(
      "BandedLinearSolver requires a right-hand side vector matching the matrix size.",
    );
  }

  return vector.map((value, index) => {
    if (!Number.isFinite(value)) {
      throw new Error(
        `BandedLinearSolver right-hand side value at index ${index + 1} must be finite.`,
      );
    }

    return value;
  });
}

function matrixScale(matrix) {
  return matrix.reduce(
    (scale, row) =>
      row.reduce((rowScale, value) => Math.max(rowScale, Math.abs(value)), scale),
    0,
  );
}

export function detectMatrixSemiBandwidth(matrix, zeroTolerance = 0) {
  let bandwidth = 0;

  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix.length; column += 1) {
      if (Math.abs(matrix[row][column]) > zeroTolerance) {
        bandwidth = Math.max(bandwidth, Math.abs(row - column));
      }
    }
  }

  return bandwidth;
}

export class BandedCholeskyFactorization {
  constructor({ lower, bandwidth }) {
    this.lower = lower;
    this.bandwidth = bandwidth;
    this.size = lower.length;
  }

  solve(rhs) {
    const vector = cloneVector(rhs, this.size);
    const intermediate = createZeroVector(this.size);
    const solution = createZeroVector(this.size);

    for (let row = 0; row < this.size; row += 1) {
      let value = vector[row];
      const firstColumn = Math.max(0, row - this.bandwidth);

      for (let column = firstColumn; column < row; column += 1) {
        value -= this.lower[row][column] * intermediate[column];
      }

      intermediate[row] = value / this.lower[row][row];
    }

    for (let row = this.size - 1; row >= 0; row -= 1) {
      let value = intermediate[row];
      const lastColumn = Math.min(this.size - 1, row + this.bandwidth);

      for (let column = row + 1; column <= lastColumn; column += 1) {
        value -= this.lower[column][row] * solution[column];
      }

      solution[row] = value / this.lower[row][row];
    }

    return solution;
  }

  solveMany(rightHandSides) {
    if (!Array.isArray(rightHandSides)) {
      throw new Error(
        "BandedCholeskyFactorization solveMany requires an array of vectors.",
      );
    }

    return rightHandSides.map((rhs) => this.solve(rhs));
  }
}

export class BandedLinearSolver {
  constructor({
    bandwidth = null,
    singularityTolerance = 1e-12,
    symmetryTolerance = 1e-10,
  } = {}) {
    if (bandwidth != null && (!Number.isInteger(bandwidth) || bandwidth < 0)) {
      throw new Error("BandedLinearSolver bandwidth must be a non-negative integer.");
    }

    this.bandwidth = bandwidth;
    this.singularityTolerance = singularityTolerance;
    this.symmetryTolerance = symmetryTolerance;
  }

  factorize(matrix) {
    const source = cloneSymmetricMatrix(matrix, this.symmetryTolerance);
    const size = source.length;
    const bandwidth = this.bandwidth ?? detectMatrixSemiBandwidth(source);
    const scale = matrixScale(source);
    const lower = createZeroMatrix(size);

    if (scale === 0) {
      throw new Error(
        "BandedLinearSolver detected a singular matrix with zero stiffness scale.",
      );
    }

    for (let row = 0; row < size; row += 1) {
      const firstColumn = Math.max(0, row - bandwidth);

      for (let column = firstColumn; column <= row; column += 1) {
        let value = source[row][column];
        const firstProduct = Math.max(
          0,
          row - bandwidth,
          column - bandwidth,
        );

        for (let index = firstProduct; index < column; index += 1) {
          value -= lower[row][index] * lower[column][index];
        }

        if (row === column) {
          if (value <= this.singularityTolerance * scale) {
            throw new Error(
              `BandedLinearSolver requires a positive-definite matrix near pivot ${row + 1}.`,
            );
          }

          lower[row][column] = Math.sqrt(value);
        } else {
          lower[row][column] = value / lower[column][column];
        }
      }
    }

    return new BandedCholeskyFactorization({ lower, bandwidth });
  }

  solve(matrix, rhs) {
    return this.factorize(matrix).solve(rhs);
  }

  solveWithDiagnostics(matrix, rhs) {
    const factorization = this.factorize(matrix);
    const solution = factorization.solve(rhs);

    return {
      method: "banded-cholesky-factorization",
      size: factorization.size,
      bandwidth: factorization.bandwidth,
      solution,
      warnings: [],
    };
  }
}
