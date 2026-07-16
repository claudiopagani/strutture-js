import test from "node:test";
import assert from "node:assert/strict";

import {
  RectangularSection,
  ReinforcedConcreteColumnApplication,
  ReinforcedConcreteColumnModel,
  ReinforcedConcreteSection,
  ReinforcementBar,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

function createFixture({ effectiveLength = 3000, actions = {} } = {}) {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const concreteSection = new RectangularSection({
    width: 300,
    height: 500,
    units,
  });
  const coordinates = [
    [50, 50],
    [50, 250],
    [450, 50],
    [450, 250],
  ];
  const section = new ReinforcedConcreteSection({
    id: "column-section",
    concreteSection,
    concreteMaterial,
    reinforcementMaterial,
    reinforcementBars: coordinates.map(
      ([y, z], index) =>
        new ReinforcementBar({
          id: `bar-${index + 1}`,
          diameter: 20,
          y,
          z,
          material: reinforcementMaterial,
          units,
        }),
    ),
    units,
  });

  return new ReinforcedConcreteColumnModel({
    id: "column-01",
    section,
    concreteMaterial,
    reinforcementMaterial,
    length: 3000,
    stability: {
      effectiveLengthMx: effectiveLength,
      effectiveLengthMy: effectiveLength,
      biaxialAngleCount: 32,
    },
    actions: {
      nEd: -800e3,
      mxEd: 40e6,
      myEd: 15e6,
      ...actions,
    },
    mesh: { targetFiberCount: 120 },
    units,
  });
}

test("RC column application verifies a stocky column with the biaxial fiber domain", () => {
  const result = new ReinforcedConcreteColumnApplication().run({
    model: createFixture(),
  });

  assert.equal(result.applicationId, "reinforced-concrete-columns");
  assert.equal(result.status, "ok");
  assert.ok(result.outputs.lambdaLimit > 0);
  assert.equal(result.outputs.axes.mx.secondOrderRequired, false);
  assert.equal(result.outputs.axes.my.secondOrderRequired, false);
  assert.ok(
    result.checks.some((check) => check.id === "rc-column-biaxial-resistance"),
  );
  assert.ok(Number.isFinite(result.utilizationRatio));
});

test("RC column application rejects a slender column without second-order moments", () => {
  const result = new ReinforcedConcreteColumnApplication().run({
    model: createFixture({ effectiveLength: 6000 }),
  });

  assert.equal(result.status, "not-supported");
  assert.ok(result.metadata.unresolvedAxes.includes("mx"));
  assert.ok(result.metadata.unresolvedAxes.includes("my"));
  assert.equal(result.outputs.sectionResult, undefined);
});

test("RC column application accepts explicit total moments for slender axes", () => {
  const result = new ReinforcedConcreteColumnApplication().run({
    model: createFixture({
      effectiveLength: 6000,
      actions: {
        mxEdTotal: 45e6,
        myEdTotal: 20e6,
      },
    }),
  });

  assert.notEqual(result.status, "not-supported");
  assert.equal(result.outputs.axes.mx.secondOrderIncluded, true);
  assert.equal(result.outputs.axes.my.secondOrderIncluded, true);
  assert.equal(result.outputs.designActions.mxEd, 45e6);
  assert.equal(result.outputs.designActions.myEd, 20e6);
});
