import test from "node:test";
import assert from "node:assert/strict";

import {
  MasonryPierApplication,
  MasonryPierEquivalentFrameBuilder,
  MasonryPierModel,
  MasonryPierVerticalVerification,
  createNTC2018ExistingMasonryMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("masonry pier verification reproduces tabulated Phi-based vertical checks", () => {
  const model = new MasonryPierModel({
    id: "pier-custom",
    units,
    geometry: {
      height: 3000,
      length: 1000,
      thickness: 300,
    },
    material: {
      fm: 6,
      E: 1800,
      G: 600,
      w: 0.000018,
      units,
    },
    actions: {
      axialForce: 200000,
      outOfPlaneMoment: 2500000,
      inPlaneMoment: 16666666.6666667,
      outOfPlaneVerticalLoadEccentricity: 10,
    },
    design: {
      gammaM: 2,
      confidenceFactor: 1.2,
    },
    idealization: {
      rigidEndZoneBottom: 200,
      rigidEndZoneTop: 300,
    },
  });
  const result = new MasonryPierVerticalVerification().verify({ model });

  assert.equal(result.status, "ok");
  approx(result.outputs.stability.lambda, 10);
  approx(result.outputs.stability.phi1, 0.61);
  approx(result.outputs.stability.phi2, 0.61);
  approx(result.outputs.stability.phiL, 0.74);
  approx(result.outputs.material.fd, 2.5);
  approx(result.outputs.actions.selfWeight, 16200);

  const governing = result.checks.find(
    (check) => check.id === "masonry-pier-compression-stage-1",
  );

  assert.ok(governing);
  approx(governing.capacity, 338550);
  approx(governing.demand, 216200);
});

test("masonry pier application includes equivalent-frame idealization with rigid ends", () => {
  const material = createNTC2018ExistingMasonryMaterial({
    masonryTypologyId: 1,
    knowledgeLevel: "LC2",
    units,
    modifierSelections: {
      maltaBuona: { selected: true, value: 1.5 },
      iniezioniMisceleLeganti: { selected: true },
    },
  });
  const model = new MasonryPierModel({
    id: "pier-ntc",
    units,
    geometry: {
      height: 1500,
      length: 1200,
      thickness: 500,
    },
    material,
    actions: {
      axialForce: 50000,
    },
    design: {
      gammaM: 2,
    },
    idealization: {
      rigidEndZoneBottom: 150,
      rigidEndZoneTop: 150,
    },
  });
  const applicationResult = new MasonryPierApplication().run({ model });
  const idealization = new MasonryPierEquivalentFrameBuilder().build({ model });

  assert.equal(applicationResult.status, "ok");
  approx(applicationResult.outputs.material.fm, 4.5);
  approx(applicationResult.outputs.material.confidenceFactor, 1.2);
  assert.equal(
    applicationResult.outputs.equivalentFrameIdealization.constraints.length,
    0,
  );
  assert.equal(applicationResult.outputs.equivalentFrameIdealization.nodes.length, 2);
  approx(
    applicationResult.outputs.equivalentFrameIdealization.metadata.deformableHeight,
    1.2,
  );
  approx(idealization.snapshot.elements[0].deformableLength, 1.2);
  approx(idealization.snapshot.elements[0].rigidStartOffset, 0.15);
  approx(idealization.snapshot.elements[0].rigidEndOffset, 0.15);
  assert.equal(
    idealization.snapshot.elements[0].type,
    "frame-2d-timoshenko-rigid-offsets",
  );
});
