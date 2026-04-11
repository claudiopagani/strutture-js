import test from "node:test";
import assert from "node:assert/strict";

import {
  BeamLinePreprocessor2D,
  FrameElement2DEulerBernoulli,
  FrameElement2DTimoshenko,
  LinearStaticSolver2D,
  NodalLoad,
  Node,
  Support,
} from "../src/index.js";

const units = { force: "kN", length: "m" };

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createNode(id, x = 0, y = 0) {
  return new Node({ id, x, y, units });
}

function solveCantileverTipLoad({
  ElementClass,
  length,
  loadValue = -10,
  axialRigidity = 1e6,
  flexuralRigidity = 1000,
  shearRigidity = 1000,
  shearCorrectionFactor = 1,
}) {
  const fixedNode = createNode("A");
  const freeNode = createNode("B", length);
  const elementOptions = {
    id: "beam",
    startNode: fixedNode,
    endNode: freeNode,
    axialRigidity,
    flexuralRigidity,
  };

  if (ElementClass === FrameElement2DTimoshenko) {
    elementOptions.shearRigidity = shearRigidity;
    elementOptions.shearCorrectionFactor = shearCorrectionFactor;
  }

  const element = new ElementClass(elementOptions);
  const support = new Support({
    id: "fixed-A",
    node: fixedNode,
    restraints: { ux: true, uy: true, rz: true },
  });
  const load = new NodalLoad({
    id: "tip-load",
    node: freeNode,
    components: { fy: loadValue },
    units,
  });
  const result = new LinearStaticSolver2D().solve({
    nodes: [fixedNode, freeNode],
    elements: [element],
    supports: [support],
    nodalLoads: [load],
  });

  return { element, result };
}

test("timoshenko frame element handles GA and shear correction factor", () => {
  const element = new FrameElement2DTimoshenko({
    id: "timoshenko",
    startNode: createNode("A"),
    endNode: createNode("B", 2),
    axialRigidity: 1000,
    flexuralRigidity: 500,
    shearRigidity: 1200,
    shearCorrectionFactor: 5 / 6,
  });

  approx(element.resolvedEffectiveShearRigidity(), 1000);
  approx(element.shearFlexibilityCoefficient(), (12 * 500) / (1000 * 2 ** 2));

  const stiffness = element.localStiffness();

  for (let row = 0; row < stiffness.length; row += 1) {
    for (let column = 0; column < stiffness.length; column += 1) {
      approx(stiffness[row][column], stiffness[column][row]);
    }
  }
});

test("timoshenko frame element resolves shear stiffness from material and section", () => {
  const element = new FrameElement2DTimoshenko({
    id: "section-based",
    startNode: createNode("A"),
    endNode: createNode("B", 1),
    material: {
      elasticModulus: 30000,
      shearModulus: 12000,
    },
    crossSection: {
      area: 2,
      inertiaY: 0.5,
    },
    shearCorrectionFactor: 0.75,
  });

  approx(element.resolvedAxialRigidity(), 60000);
  approx(element.resolvedFlexuralRigidity(), 15000);
  approx(element.resolvedEffectiveShearRigidity(), 18000);
});

test("stocky cantilever includes shear deformation in tip displacement", () => {
  const length = 1;
  const loadValue = -10;
  const flexuralRigidity = 1000;
  const effectiveShearRigidity = 100;
  const { result } = solveCantileverTipLoad({
    ElementClass: FrameElement2DTimoshenko,
    length,
    loadValue,
    flexuralRigidity,
    shearRigidity: effectiveShearRigidity,
  });
  const pAbs = Math.abs(loadValue);
  const bendingDisplacement = (-pAbs * length ** 3) / (3 * flexuralRigidity);
  const shearDisplacement = (-pAbs * length) / effectiveShearRigidity;

  approx(result.displacementByNode.B.uy, bendingDisplacement + shearDisplacement);
  approx(result.displacementByNode.B.rz, (-pAbs * length ** 2) / (2 * flexuralRigidity));
});

test("timoshenko response approaches euler-bernoulli as slenderness grows", () => {
  const lengths = [2, 4, 8, 16];
  const relativeDifferences = lengths.map((length) => {
    const timoshenko = solveCantileverTipLoad({
      ElementClass: FrameElement2DTimoshenko,
      length,
      flexuralRigidity: 1000,
      shearRigidity: 1200,
      shearCorrectionFactor: 5 / 6,
    }).result;
    const eulerBernoulli = solveCantileverTipLoad({
      ElementClass: FrameElement2DEulerBernoulli,
      length,
      flexuralRigidity: 1000,
    }).result;
    const ebDisplacement = Math.abs(eulerBernoulli.displacementByNode.B.uy);
    const timoshenkoDisplacement = Math.abs(timoshenko.displacementByNode.B.uy);

    return (timoshenkoDisplacement - ebDisplacement) / ebDisplacement;
  });

  for (let index = 1; index < relativeDifferences.length; index += 1) {
    assert.ok(
      relativeDifferences[index] < relativeDifferences[index - 1],
      `${relativeDifferences[index]} should be smaller than ${relativeDifferences[index - 1]}`,
    );
  }

  approx(relativeDifferences.at(-1), 3 / 16 ** 2, 1e-12);
  assert.ok(relativeDifferences.at(-1) < 0.02);
});

test("closed-form timoshenko stiffness avoids shear locking for a slender beam", () => {
  const length = 10;
  const flexuralRigidity = 1000;
  const timoshenko = solveCantileverTipLoad({
    ElementClass: FrameElement2DTimoshenko,
    length,
    flexuralRigidity,
    shearRigidity: 1e12,
  });
  const eulerBernoulli = solveCantileverTipLoad({
    ElementClass: FrameElement2DEulerBernoulli,
    length,
    flexuralRigidity,
  });
  const diagnostics = timoshenko.element.lockingDiagnostics();

  assert.equal(diagnostics.shearLockingControlled, true);
  assert.ok(diagnostics.shearFlexibilityCoefficient < 2e-10);
  approx(
    timoshenko.result.displacementByNode.B.uy,
    eulerBernoulli.result.displacementByNode.B.uy,
    1e-8,
  );
});

test("beam line preprocessor preserves timoshenko shear rigidity units", () => {
  const model = new BeamLinePreprocessor2D({
    elementClass: FrameElement2DTimoshenko,
  }).build({
    id: "timo-line",
    span: 2,
    units,
    element: {
      axialRigidity: 10000,
      flexuralRigidity: 1000,
      shearRigidity: 1200,
      shearCorrectionFactor: 5 / 6,
    },
  });

  assert.ok(model.elements[0] instanceof FrameElement2DTimoshenko);
  approx(model.elements[0].resolvedEffectiveShearRigidity(), 1000);
});
