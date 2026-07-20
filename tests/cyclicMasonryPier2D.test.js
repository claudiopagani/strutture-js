import test from "node:test";
import assert from "node:assert/strict";

import { Node } from "../src/domain/geometry/Node.js";
import { CyclicMasonryCompressionMaterial } from "../src/domain/materials/masonry/CyclicMasonryCompressionMaterial.js";
import { CyclicMasonryShearMaterial } from "../src/domain/materials/masonry/CyclicMasonryShearMaterial.js";
import { SlidingStrengthModel } from "../src/domain/materials/masonry/shearStrength/SlidingStrengthModel.js";
import { TurnsekSheppardModel } from "../src/domain/materials/masonry/shearStrength/TurnsekSheppardModel.js";
import { CyclicMasonryPier2D } from "../src/domain/fem/elements/masonry/CyclicMasonryPier2D.js";
import { CyclicMasonryPierAnalysis2D } from "../src/domain/fem/nonlinear/CyclicMasonryPierAnalysis2D.js";

const units = { force: "N", length: "mm" };

function createPier({
  fiberCount = 16,
  cohesion = 0.1,
  compression = {},
  shear = {},
  coupling = {},
  localTolerance = 1e-7,
} = {}) {
  const startNode = new Node({ id: `base-${fiberCount}`, x: 0, y: 0, units });
  const endNode = new Node({ id: `top-${fiberCount}`, x: 0, y: 2500, units });
  const compressionMaterial = new CyclicMasonryCompressionMaterial({
    units,
    elasticModulus: 2000,
    compressiveStrength: 4,
    peakStrain: 0.002,
    prePeakCurve: "linear",
    damageOnsetStrain: 0.003,
    ultimateStrain: 0.01,
    residualStrengthRatio: 0.2,
    unloadingStiffnessDegradation: 0.3,
    strengthDegradation: 0.2,
    hingeLength: 100,
    numericalTangentRatio: 1e-8,
    ...compression,
  });
  const shearMaterial = new CyclicMasonryShearMaterial({
    units,
    shearModulus: 800,
    diagonalTensionModel: new TurnsekSheppardModel({
      units,
      tensileStrength: 0.15,
      shearStressDistributionFactor: 1.2,
      damageCoefficient: 0.8,
      crushingReductionCoefficient: 0.5,
    }),
    slidingModel: new SlidingStrengthModel({
      units,
      cohesion,
      frictionCoefficient: 0.4,
      residualCohesionRatio: 0.1,
    }),
    peakShearStrain: 0.004,
    ultimateShearStrain: 0.012,
    hardeningRatio: 0.05,
    residualStrengthRatio: 0.25,
    pinching: { enabled: true, factor: 0.35, recoveryRatio: 0.8 },
    stiffnessDegradation: {
      enabled: true,
      ductilityCoefficient: 0.2,
      energyCoefficient: 0.05,
    },
    strengthDegradation: {
      enabled: true,
      ductilityCoefficient: 0.15,
      energyCoefficient: 0.05,
    },
    ...shear,
  });

  return new CyclicMasonryPier2D({
    id: `pier-${fiberCount}`,
    startNode,
    endNode,
    units,
    height: 2500,
    width: 1000,
    thickness: 250,
    elasticModulus: 2000,
    shearModulus: 800,
    effectiveShearAreaFactor: 1,
    fiberCount,
    hingeLength: 100,
    compressionMaterial,
    shearMaterial,
    coupling,
    localTolerance,
  });
}

function approx(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test("complete masonry pier equilibrates core, interfaces and central shear spring", () => {
  const pier = createPier();
  const response = pier.setTrialLocalDisplacements([
    0, 0, 0, -0.001, 0.002, 0,
  ]);

  assert.equal(response.localConverged, true);
  approx(response.compressionResultants[0], -response.axialForce, 1e-4);
  approx(response.compressionResultants[1], -response.axialForce, 1e-4);
  approx(
    response.shearForce,
    -(response.endMoments[0] + response.endMoments[1]) / pier.height,
    1e-4,
  );
  assert.equal(response.localForces.length, 6);
  assert.equal(response.localTangent.length, 6);
});

test("complete pier compatibility counts each axial, flexural and shear component once", () => {
  const pier = createPier();
  const response = pier.setTrialLocalDisplacements([
    0, 0, 0, -0.001, 0.002, 0,
  ]);
  const z = response.internalDeformations;
  const reconstructed = [
    response.bodyDeformations[0] + z[0] + z[2],
    response.bodyDeformations[1] + z[1] - z[4] / pier.height,
    response.bodyDeformations[2] + z[3] - z[4] / pier.height,
  ];

  response.basicDeformations.forEach((value, index) => {
    approx(reconstructed[index], value, 1e-10);
  });
});

test("condensed local tangent matches finite differences around a committed compressed state", () => {
  const pier = createPier({ fiberCount: 24, localTolerance: 1e-9 });
  const committedBase = [0, 0, 0, -0.001, 0.0009, 0];
  const base = [0, 0, 0, -0.001, 0.001, 0];
  pier.setTrialLocalDisplacements(committedBase);
  pier.commitState();
  const response = pier.setTrialLocalDisplacements(base);
  const analytical = response.localTangent;
  const baseForces = response.localForces;
  const columns = [3, 4, 5];
  const rows = [3, 4, 5];

  for (const column of columns) {
    const step = column === 5 ? 2e-7 : 2e-7;
    const plus = [...base];
    plus[column] += step;
    const forcePlus = pier.setTrialLocalDisplacements(plus).localForces;

    for (const row of rows) {
      const numerical = (forcePlus[row] - baseForces[row]) / step;
      const tolerance = Math.max(2, Math.abs(numerical) * 0.02);
      assert.ok(
        Math.abs(analytical[row][column] - numerical) <= tolerance,
        `tangent[${row}][${column}]: ${analytical[row][column]} != ${numerical}`,
      );
    }
  }
});

test("element trial, commit, revert and pure state evaluation do not contaminate history", () => {
  const pier = createPier();
  pier.setTrialLocalDisplacements([0, 0, 0, -0.001, 0.002, 0]);
  pier.commitState();
  const committed = pier.exportState({ committed: true });
  const committedShear = pier.getCommittedResponse().shearForce;

  pier.setTrialLocalDisplacements([0, 0, 0, -0.001, 0.003, 0]);
  pier.revertToLastCommit();
  approx(pier.getResponse().shearForce, committedShear);

  const pure = pier.evaluate({
    localDisplacements: [0, 0, 0, -0.001, 0.004, 0],
    state: committed,
  });
  assert.ok(pure.state);
  approx(pier.getCommittedResponse().shearForce, committedShear);
});

test("standalone cyclic analysis maintains axial compression and zero cantilever top moment", () => {
  const pier = createPier();
  const analysis = new CyclicMasonryPierAnalysis2D();
  const result = analysis.solve({
    element: pier,
    axialCompression: 150,
    lateralDisplacements: [
      0,
      0.001,
      0.002,
      0.003,
      0.004,
      0.003,
      0.002,
      0.001,
      0,
      -0.001,
      -0.002,
      -0.003,
      -0.004,
      -0.003,
      -0.002,
      -0.001,
      0,
    ],
    tolerance: 2e-5,
    maxIterations: 30,
  });

  assert.equal(result.status, "ok", JSON.stringify({
    termination: result.termination,
    warnings: result.warnings,
  }));
  assert.equal(result.points.length, 17);
  result.points.forEach((point) => {
    approx(point.axialForce, 150, 0.02);
    approx(point.topMoment, 0, 0.02);
  });
  assert.ok(result.points.some((point) => Math.abs(point.lateralForce) > 0));
});

test("failed external convergence rolls the element back to its last committed state", () => {
  const pier = createPier();
  const analysis = new CyclicMasonryPierAnalysis2D();
  const converged = analysis.solve({
    element: pier,
    axialCompression: 100,
    lateralDisplacements: [0],
    tolerance: 1e-5,
  });
  assert.equal(converged.status, "ok");
  const before = pier.exportState({ committed: true });
  const failed = analysis.solve({
    element: pier,
    axialCompression: 300,
    lateralDisplacements: [0.03],
    tolerance: 1e-12,
    maxIterations: 1,
  });

  assert.equal(failed.status, "failed");
  assert.deepEqual(
    pier.exportState({ committed: true }),
    before,
  );
});
