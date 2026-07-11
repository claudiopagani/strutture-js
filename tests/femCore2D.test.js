import test from "node:test";
import assert from "node:assert/strict";

import {
  DofRegistry,
  FemAssembler2D,
  KinematicConstraintReducer2D,
  LinearStaticSolver2D,
  NodalLoad,
  Node,
  Support,
} from "../src/index.js";
import { createElementLoadIndex } from "../src/domain/fem/ElementLoadIndex.js";

const units = { force: "kN", length: "m" };

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createNode(id, x = 0) {
  return new Node({ id, x, units });
}

function createAxialSpringElement({ id, startNode, endNode, stiffness }) {
  return {
    id,
    nodes: [startNode, endNode],
    getDofIds(dofRegistry) {
      return [
        dofRegistry.getDofId(startNode, "ux"),
        dofRegistry.getDofId(endNode, "ux"),
      ];
    },
    globalStiffness() {
      return [
        [stiffness, -stiffness],
        [-stiffness, stiffness],
      ];
    },
  };
}

test("element load index groups loads once by element id or reference", () => {
  const node = createNode("node-id");
  const elementA = { id: "shared-id", nodes: [] };
  const elementACopy = { id: "shared-id", nodes: [] };
  const elementWithoutId = { nodes: [] };
  const loadA = { id: "load-a", element: elementACopy };
  const loadByTarget = { id: "load-target", target: elementA };
  const loadWithoutId = { id: "load-ref", element: elementWithoutId };
  const nodalLoad = { id: "nodal", target: node };
  const index = createElementLoadIndex([
    loadA,
    loadByTarget,
    loadWithoutId,
    nodalLoad,
  ]);

  assert.deepEqual(index.get(elementA), [loadA, loadByTarget]);
  assert.deepEqual(index.get(elementWithoutId), [loadWithoutId]);
  assert.deepEqual(index.get({ id: "missing", nodes: [] }), []);
});

test("dof registry assigns stable 2D frame DOFs to registered nodes", () => {
  const nodeA = createNode("A");
  const nodeB = createNode("B", 1000);
  const registry = new DofRegistry();

  registry.registerNodes([nodeA, nodeB]);

  assert.equal(registry.size(), 6);
  assert.equal(registry.getDofId(nodeA, "ux"), "A.ux");
  assert.equal(registry.getIndex(nodeA, "ux"), 0);
  assert.equal(registry.getIndex(nodeA, "uy"), 1);
  assert.equal(registry.getIndex(nodeA, "rz"), 2);
  assert.equal(registry.getIndex(nodeB, "rz"), 5);
  assert.deepEqual(registry.getDofIds(), [
    "A.ux",
    "A.uy",
    "A.rz",
    "B.ux",
    "B.uy",
    "B.rz",
  ]);
});

test("fem assembler builds global stiffness and nodal load vectors", () => {
  const nodeA = createNode("A");
  const nodeB = createNode("B", 1000);
  const element = createAxialSpringElement({
    id: "spring-AB",
    startNode: nodeA,
    endNode: nodeB,
    stiffness: 100,
  });
  const load = new NodalLoad({
    node: nodeB,
    components: { fx: 50 },
    units,
  });
  const assembly = new FemAssembler2D().assemble({
    nodes: [nodeA, nodeB],
    elements: [element],
    nodalLoads: [load],
  });

  const aUx = assembly.dofRegistry.getIndex(nodeA, "ux");
  const bUx = assembly.dofRegistry.getIndex(nodeB, "ux");

  approx(assembly.stiffnessMatrix[aUx][aUx], 100);
  approx(assembly.stiffnessMatrix[aUx][bUx], -100);
  approx(assembly.stiffnessMatrix[bUx][aUx], -100);
  approx(assembly.stiffnessMatrix[bUx][bUx], 100);
  approx(assembly.loadVector[bUx], 50);
});

test("linear static solver partitions constrained DOFs and recovers reactions", () => {
  const nodeA = createNode("A");
  const nodeB = createNode("B", 1000);
  const element = createAxialSpringElement({
    id: "spring-AB",
    startNode: nodeA,
    endNode: nodeB,
    stiffness: 100,
  });
  const supports = [
    new Support({
      id: "fixed-A",
      node: nodeA,
      restraints: { ux: true, uy: true, rz: true },
    }),
    new Support({
      id: "roller-B",
      node: nodeB,
      restraints: { uy: true, rz: true },
    }),
  ];
  const load = new NodalLoad({
    node: nodeB,
    components: { fx: 50 },
    units,
  });

  const result = new LinearStaticSolver2D().solve({
    nodes: [nodeA, nodeB],
    elements: [element],
    supports,
    nodalLoads: [load],
  });

  approx(result.displacementByNode.B.ux, 0.5);
  approx(result.displacementByNode.A.ux, 0);
  approx(result.reactionByNode.A.ux, -50);
  approx(result.reactionByNode.B.ux, 0);
  assert.deepEqual(result.freeDofIds, ["B.ux"]);
  assert.deepEqual(result.constrainedDofIds, [
    "A.ux",
    "A.uy",
    "A.rz",
    "B.uy",
    "B.rz",
  ]);
});

test("linear static solver can be reused across models with different node ids", () => {
  const solver = new LinearStaticSolver2D();
  const solveSpring = (nodeId) => {
    const node = createNode(nodeId);

    return solver.solve({
      nodes: [node],
      supports: [
        new Support({
          id: `spring-${nodeId}`,
          node,
          restraints: { uy: true, rz: true },
          springStiffness: { ux: 100 },
        }),
      ],
      nodalLoads: [
        new NodalLoad({
          node,
          components: { fx: 50 },
          units,
        }),
      ],
    });
  };

  const first = solveSpring("A");
  const second = solveSpring("B");

  approx(first.displacementByNode.A.ux, 0.5);
  approx(second.displacementByNode.B.ux, 0.5);
  assert.equal(first.dofRegistry.size(), 3);
  assert.equal(first.dofRegistry.hasDof("A.ux"), true);
  assert.equal(first.dofRegistry.hasDof("B.ux"), false);
  assert.equal(second.dofRegistry.size(), 3);
  assert.equal(second.dofRegistry.hasDof("A.ux"), false);
});

test("linear static solver includes nodal support springs in the assembled stiffness", () => {
  const node = createNode("A");
  const support = new Support({
    id: "spring-A",
    node,
    restraints: { uy: true, rz: true },
    springStiffness: { ux: 100 },
  });
  const load = new NodalLoad({
    node,
    components: { fx: 50 },
    units,
  });

  const result = new LinearStaticSolver2D().solve({
    nodes: [node],
    supports: [support],
    nodalLoads: [load],
  });

  approx(result.displacementByNode.A.ux, 0.5);
  const uxIndex = result.dofRegistry.getIndex(node, "ux");
  approx(result.stiffnessMatrix[uxIndex][uxIndex], 100);
});

test("linear static solver can skip dense diagnostics on repeated fast paths", () => {
  const node = createNode("A");
  const support = new Support({
    id: "spring-A",
    node,
    restraints: { uy: true, rz: true },
    springStiffness: { ux: 100 },
  });
  const load = new NodalLoad({
    node,
    components: { fx: 50 },
    units,
  });
  const solver = new LinearStaticSolver2D();
  const model = {
    nodes: [node],
    supports: [support],
    nodalLoads: [load],
  };
  const withDiagnostics = solver.solve(model);
  const fast = solver.solve(model, { includeDiagnostics: false });

  approx(fast.displacementByNode.A.ux, withDiagnostics.displacementByNode.A.ux);
  assert.equal(
    withDiagnostics.reducedSystem.diagnostics.method,
    "dense-gaussian-elimination-partial-pivoting",
  );
  assert.equal(fast.reducedSystem.diagnostics, null);
});

test("linear static solver rejects conflicting displacement constraints", () => {
  const node = createNode("A");

  assert.throws(
    () =>
      new LinearStaticSolver2D().solve({
        nodes: [node],
        constraints: [
          { node, dof: "ux", value: 0 },
          { node, dof: "ux", value: 1 },
        ],
      }),
    /conflicting constraints/i,
  );
});

test("linear static solver condenses equal-DOF diaphragm constraints onto a master control DOF", () => {
  const nodeA = createNode("A");
  const nodeB = createNode("B", 1);
  const nodeC = createNode("C", 2);
  const nodeM = createNode("M", 1.5);
  const elementAB = createAxialSpringElement({
    id: "spring-AB",
    startNode: nodeA,
    endNode: nodeB,
    stiffness: 100,
  });
  const elementAC = createAxialSpringElement({
    id: "spring-AC",
    startNode: nodeA,
    endNode: nodeC,
    stiffness: 200,
  });
  const supports = [
    new Support({
      id: "fixed-A",
      node: nodeA,
      restraints: { ux: true, uy: true, rz: true },
    }),
    new Support({
      id: "guide-B",
      node: nodeB,
      restraints: { uy: true, rz: true },
    }),
    new Support({
      id: "guide-C",
      node: nodeC,
      restraints: { uy: true, rz: true },
    }),
    new Support({
      id: "guide-M",
      node: nodeM,
      restraints: { uy: true, rz: true },
    }),
  ];
  const nodalLoads = [
    new NodalLoad({
      node: nodeB,
      components: { fx: 30 },
      units,
    }),
    new NodalLoad({
      node: nodeC,
      components: { fx: 60 },
      units,
    }),
  ];
  const result = new LinearStaticSolver2D().solve({
    nodes: [nodeA, nodeB, nodeC, nodeM],
    elements: [elementAB, elementAC],
    supports,
    nodalLoads,
    constraints: [
      {
        id: "diaphragm-B",
        type: "equal-dof",
        masterNode: nodeM,
        slaveNode: nodeB,
        dof: "ux",
      },
      {
        id: "diaphragm-C",
        type: "equal-dof",
        masterNode: nodeM,
        slaveNode: nodeC,
        dof: "ux",
      },
    ],
  });

  approx(result.displacementByNode.M.ux, 0.3);
  approx(result.displacementByNode.B.ux, 0.3);
  approx(result.displacementByNode.C.ux, 0.3);
  approx(result.reactionByNode.A.ux, -90);
  assert.deepEqual(result.freeDofIds, ["M.ux"]);
  assert.ok(result.constrainedDofIds.includes("B.ux"));
  assert.ok(result.constrainedDofIds.includes("C.ux"));
});

test("kinematic reducer preserves scaled equal-DOF and prescribed-offset algebra", () => {
  const nodeA = createNode("A");
  const nodeB = createNode("B");
  const nodeC = createNode("C");
  const dofRegistry = new DofRegistry({ dofsPerNode: ["ux"] });

  dofRegistry.registerNodes([nodeA, nodeB, nodeC]);

  const reduction = new KinematicConstraintReducer2D().build({
    dofRegistry,
    constraints: [
      {
        type: "equal-dof",
        masterNode: nodeA,
        slaveNode: nodeB,
        dof: "ux",
        scale: 2,
        offset: 3,
      },
      {
        node: nodeC,
        dof: "ux",
        value: 4,
      },
    ],
  });
  const stiffnessMatrix = [
    [4, 1, 2],
    [1, 3, 0],
    [2, 0, 5],
  ];
  const loadVector = [10, 20, 30];
  const reduced = reduction.reduceLinearSystem(stiffnessMatrix, loadVector);

  assert.deepEqual(reduction.transformationMatrix, [[1], [2], [0]]);
  assert.deepEqual(reduction.offsetVector, [0, 3, 4]);
  assert.deepEqual(reduced.stiffnessMatrix, [[20]]);
  assert.deepEqual(reduced.loadVector, [21]);
  assert.deepEqual(reduction.expandReducedVector([2]), [2, 7, 4]);
});
