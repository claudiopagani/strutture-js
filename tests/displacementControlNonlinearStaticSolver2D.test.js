import test from "node:test";
import assert from "node:assert/strict";

import { DisplacementControlNonlinearStaticSolver2D } from "../src/index.js";

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createSingleDofModel() {
  return {
    supports: [],
    referenceLoadVector: [1],
    controlVector: [1],
    dofRegistry: {
      dofsPerNode: ["ux"],
      size() {
        return 1;
      },
      getDofIds() {
        return ["spring-1__ux"];
      },
      getIndex(nodeOrDofId, dof) {
        if (dof != null) {
          return 0;
        }

        if (nodeOrDofId !== "spring-1__ux") {
          throw new Error(`Unknown DOF id ${nodeOrDofId}`);
        }

        return 0;
      },
    },
  };
}

test("generic displacement-control solver continues a perfectly plastic plateau after yielding", () => {
  const elasticStiffness = 10;
  const yieldForce = 5;
  const model = createSingleDofModel();
  const solver = new DisplacementControlNonlinearStaticSolver2D();

  const result = solver.solve({
    model,
    initialState: { yielded: false, sign: null },
    cloneState: (state) => ({ ...state }),
    controlDisplacementIncrement: 0.1,
    maxControlDisplacement: 1.0,
    tolerance: 1e-9,
    maxIterations: 10,
    maxSteps: 20,
    evaluator: ({ displacements, state }) => {
      const displacement = displacements[0];
      const trialForce = elasticStiffness * displacement;
      const shouldYield = Math.abs(trialForce) >= yieldForce;
      const nextState =
        state?.yielded || shouldYield
          ? {
              yielded: true,
              sign: Math.sign(trialForce) || state?.sign || 1,
            }
          : { yielded: false, sign: null };
      const internalForce =
        nextState.yielded
          ? nextState.sign * yieldForce
          : trialForce;
      const tangentStiffness =
        nextState.yielded
          ? [[0]]
          : [[elasticStiffness]];

      return {
        internalForceVector: [internalForce],
        tangentStiffnessMatrix: tangentStiffness,
        state: nextState,
        events:
          !state?.yielded && nextState.yielded
            ? [{ type: "yield", sign: nextState.sign }]
            : [],
      };
    },
  });

  const points = result.points;

  assert.equal(result.termination.reason, "target-displacement-reached");
  approx(points.at(-1).controlDisplacement, 1.0, 1e-9);
  approx(points[5].loadFactor, 5, 1e-9);

  for (let index = 6; index < points.length; index += 1) {
    approx(points[index].loadFactor, 5, 1e-9);
  }

  assert.ok(result.events.length > 0);
  assert.equal(result.finalState.yielded, true);
});
