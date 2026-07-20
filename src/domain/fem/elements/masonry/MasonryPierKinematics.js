import { createZeroMatrix } from "../../../math/arrayLinearAlgebra.js";

export function transpose(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

export function multiplyMatrices(left, right) {
  return left.map((leftRow) =>
    right[0].map((_, column) =>
      leftRow.reduce(
        (sum, value, index) => sum + value * right[index][column],
        0,
      ),
    ),
  );
}

export function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0),
  );
}

export function subtractVectors(left, right) {
  return left.map((value, index) => value - right[index]);
}

export function addVectors(left, right) {
  return left.map((value, index) => value + right[index]);
}

export function subtractMatrices(left, right) {
  return left.map((row, rowIndex) =>
    row.map((value, columnIndex) => value - right[rowIndex][columnIndex]),
  );
}

export function identityMatrix(size) {
  const matrix = createZeroMatrix(size);

  for (let index = 0; index < size; index += 1) {
    matrix[index][index] = 1;
  }

  return matrix;
}

/**
 * Basic frame deformations [axial elongation, end-I rotation relative to
 * chord, end-J rotation relative to chord].
 */
export function masonryPierBasicKinematicMatrix(length) {
  return [
    [-1, 0, 0, 1, 0, 0],
    [0, 1 / length, 1, 0, -1 / length, 0],
    [0, 1 / length, 0, 0, -1 / length, 1],
  ];
}
/**
 * Compatibility v = v_body + C*z for
 * z=[deltaI, phiI, deltaJ, phiJ, deltaShear].
 */
export function masonryPierComponentCompatibilityMatrix(length) {
  return [
    [1, 0, 1, 0, 0],
    [0, 1, 0, 0, -1 / length],
    [0, 0, 0, 1, -1 / length],
  ];
}

export function frameTransformationMatrix(c, s) {
  return [
    [c, s, 0, 0, 0, 0],
    [-s, c, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0],
    [0, 0, 0, c, s, 0],
    [0, 0, 0, -s, c, 0],
    [0, 0, 0, 0, 0, 1],
  ];
}
