import test from "node:test";
import assert from "node:assert/strict";

import { BandedLinearSolver, DenseLinearSolver } from "../src/index.js";

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

const approxVector = (actual, expected, tolerance = 1e-9) => {
  assert.equal(actual.length, expected.length);

  for (let index = 0; index < actual.length; index += 1) {
    approx(actual[index], expected[index], tolerance);
  }
};

test("dense linear solver solves a regular 3x3 system", () => {
  const solver = new DenseLinearSolver();
  const result = solver.solveWithDiagnostics(
    [
      [3, 2, -1],
      [2, -2, 4],
      [-1, 0.5, -1],
    ],
    [1, -2, 0],
  );

  approxVector(result.solution, [1, -2, -2]);
  assert.equal(result.method, "dense-gaussian-elimination-partial-pivoting");
  assert.equal(result.size, 3);
  assert.equal(result.warnings.length, 0);
  assert.ok(result.residual.infNorm < 1e-12);
});

test("dense linear solver performs partial pivoting when the diagonal starts with zero", () => {
  const solver = new DenseLinearSolver();
  const result = solver.solveWithDiagnostics(
    [
      [0, 2],
      [1, 1],
    ],
    [4, 3],
  );

  approxVector(result.solution, [1, 2]);
  assert.deepEqual(result.rowPermutation, [1, 0]);
  approx(result.determinant, -2);
});

test("dense linear solver solve returns only the solution vector", () => {
  const solver = new DenseLinearSolver();
  const matrix = [
    [4, 1],
    [2, 3],
  ];
  const rhs = [9, 13];
  const solution = solver.solve(matrix, rhs);

  approxVector(solution, [1.4, 3.4]);
  assert.deepEqual(matrix, [
    [4, 1],
    [2, 3],
  ]);
  assert.deepEqual(rhs, [9, 13]);
});

test("dense linear solver reuses one LU factorization for multiple right-hand sides", () => {
  const solver = new DenseLinearSolver();
  const matrix = [
    [0, 2, 1],
    [1, 1, 0],
    [2, 0, 3],
  ];
  const factorization = solver.factorize(matrix);
  const rightHandSides = [
    [7, 3, 11],
    [0, -1, 4],
  ];
  const solutions = factorization.solveMany(rightHandSides);

  approxVector(solutions[0], solver.solve(matrix, rightHandSides[0]));
  approxVector(solutions[1], solver.solve(matrix, rightHandSides[1]));
  assert.deepEqual(matrix, [
    [0, 2, 1],
    [1, 1, 0],
    [2, 0, 3],
  ]);
});

test("banded solver matches dense solution and reports the detected bandwidth", () => {
  const matrix = [
    [4, -1, 0],
    [-1, 4, -1],
    [0, -1, 3],
  ];
  const rhs = [2, 4, 7];
  const solver = new BandedLinearSolver();
  const result = solver.solveWithDiagnostics(matrix, rhs);

  approxVector(result.solution, [1, 2, 3]);
  assert.equal(result.method, "banded-cholesky-factorization");
  assert.equal(result.bandwidth, 1);

  const factorization = solver.factorize(matrix);
  approxVector(factorization.solve(rhs), [1, 2, 3]);
  approxVector(
    factorization.solve([4, -1, 0]),
    new DenseLinearSolver().solve(matrix, [4, -1, 0]),
  );
});

test("banded solver rejects non-symmetric and non-positive-definite matrices", () => {
  const solver = new BandedLinearSolver();

  assert.throws(
    () => solver.solve([[2, 1], [0, 2]], [1, 1]),
    /symmetric matrix/i,
  );
  assert.throws(
    () => solver.solve([[1, 2], [2, 1]], [1, 1]),
    /positive-definite matrix/i,
  );
});

test("dense linear solver rejects singular systems with a clear error", () => {
  const solver = new DenseLinearSolver();

  assert.throws(
    () =>
      solver.solve(
        [
          [1, 2],
          [2, 4],
        ],
        [3, 6],
      ),
    /singular matrix/i,
  );
});

test("dense linear solver reports small pivots on nearly singular systems", () => {
  const solver = new DenseLinearSolver();
  const result = solver.solveWithDiagnostics(
    [
      [1, 1],
      [1, 1 + 1e-10],
    ],
    [2, 2 + 1e-10],
  );

  approxVector(result.solution, [1, 1], 1e-6);
  assert.ok(result.minAbsPivot < 1e-8);
  assert.ok(result.warnings.some((warning) => warning.includes("small pivot")));
});

test("dense linear solver validates matrix and vector inputs", () => {
  const solver = new DenseLinearSolver();

  assert.throws(
    () => solver.solve([[1, 2]], [1]),
    /square matrix/i,
  );
  assert.throws(
    () => solver.solve([[1]], [Number.NaN]),
    /right-hand side/i,
  );
  assert.throws(
    () => new DenseLinearSolver({ singularityTolerance: 0 }),
    /positive singularityTolerance/i,
  );
});
