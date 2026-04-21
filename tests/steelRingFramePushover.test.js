import test from "node:test";
import assert from "node:assert/strict";

import {
  DofRegistry,
  Node,
  SteelFrameApplication,
  SteelPlasticHingeFrameElement2D,
  SteelRingFrame2DBuilder,
  SteelRingFramePushoverModel,
  createNTC2018StructuralSteelMaterial,
  createSteelProfileSection,
} from "../src/index.js";

const internalUnits = { force: "N", length: "mm" };
const userUnits = { force: "kN", length: "m" };

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("steel ring frame builder resolves fixed-base portal without bottom beam", () => {
  const model = new SteelRingFramePushoverModel({
    id: "ring-fixed",
    units: userUnits,
    geometry: {
      b: 0.9,
      h: 2.1,
    },
    memberSections: {
      columns: "IPE200",
      topBeam: "IPE200",
    },
    baseCondition: "fixed-base",
  });
  const frame = new SteelRingFrame2DBuilder().build({ model });

  assert.equal(model.includeBottomBeam, false);
  assert.equal(frame.nodes.length, 4);
  assert.equal(frame.elements.length, 3);
  assert.equal(frame.supports[0].restraints.rz, true);
  assert.equal(frame.supports[1].restraints.rz, true);
  approx(
    frame.referenceLoadVector.reduce((sum, value) => sum + value, 0),
    1,
  );
});

test("plastic hinge frame element caps the yielded end moment at the plastic capacity", () => {
  const startNode = new Node({ id: "A", x: 0, y: 0, units: internalUnits });
  const endNode = new Node({ id: "B", x: 1000, y: 0, units: internalUnits });
  const section = createSteelProfileSection({
    profileName: "IPE200",
    units: internalUnits,
  });
  const material = createNTC2018StructuralSteelMaterial({
    grade: "S275",
    units: internalUnits,
  });
  const element = new SteelPlasticHingeFrameElement2D({
    id: "plastic-element",
    startNode,
    endNode,
    section,
    material,
  });
  const dofRegistry = new DofRegistry();

  dofRegistry.registerNodes([startNode, endNode]);

  const displacements = [0, 0, 0.1, 0, 0, 0];
  const response = element.evaluate({
    globalDisplacements: displacements,
    dofRegistry,
  });

  assert.equal(response.hingeState.start, "positive");
  assert.equal(response.hingeState.end, "positive");
  approx(response.localEndForces[2], element.plasticMomentStart, 1e-3);
  approx(response.localEndForces[5], element.plasticMomentEnd, 1e-3);
});

test("steel frame application runs a standalone ring-frame pushover workflow", () => {
  const model = new SteelRingFramePushoverModel({
    id: "ring-pushover",
    units: userUnits,
    geometry: {
      b: 0.9,
      h: 2.1,
    },
    memberSections: {
      columns: "IPE200",
      topBeam: "IPE200",
      bottomBeam: "IPE200",
    },
    material: "S275",
    baseCondition: "pinned-base-with-bottom-beam",
    solver: {
      controlIncrement: 0.002,
      maxDisplacement: 0.03,
      tolerance: 1e-6,
      maxIterations: 60,
      maxSteps: 60,
    },
  });
  const result = new SteelFrameApplication().run({ model });
  const points = result.outputs.capacityCurve.points;

  assert.equal(result.applicationId, "steel-frames");
  assert.equal(result.status, "ok");
  assert.equal(result.metadata.analysisType, "steel-ring-frame-pushover");
  assert.ok(points.length > 2);
  assert.ok(result.outputs.hingeEvents.length > 0);
  assert.ok(points.at(-1).baseShear > 0);
  assert.ok(points.at(-1).hingeCount > 0);
  assert.equal(result.outputs.finalState.termination.reason, "target-displacement-reached");
  approx(points.at(-1).controlDisplacement, 0.03, 1e-9);

  const postMechanismPlateau = points.slice(-4).map((point) => point.baseShear);

  for (const plateauValue of postMechanismPlateau) {
    approx(plateauValue, postMechanismPlateau[0], 1e-6);
  }

  for (let index = 1; index < points.length; index += 1) {
    assert.ok(
      points[index].controlDisplacement > points[index - 1].controlDisplacement,
      "control displacement must grow monotonically",
    );
    assert.ok(points[index].baseShear >= 0, "base shear must stay non-negative");
  }
});
