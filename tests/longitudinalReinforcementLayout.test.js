import test from "node:test";
import assert from "node:assert/strict";

import {
  RectangularSection,
  TSection,
  createLongitudinalReinforcementLayout,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

test("longitudinal reinforcement layout creates top and bottom groups for rectangular sections", () => {
  const material = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new RectangularSection({
    width: 300,
    height: 500,
    units,
  });
  const layout = createLongitudinalReinforcementLayout({
    section,
    material,
    units,
    bottom: {
      id: "bottom-main",
      diameter: 20,
      count: 2,
      cover: 40,
    },
    top: {
      id: "top-main",
      diameter: 16,
      count: 3,
      cover: 35,
    },
  });

  assert.equal(layout.reinforcementBars.length, 5);
  assert.deepEqual(
    layout.longitudinalReinforcementGroups.map((group) => group.id),
    ["bottom-main", "top-main"],
  );
  assert.equal(layout.longitudinalReinforcementGroups[0].face, "bottom");
  assert.equal(layout.longitudinalReinforcementGroups[1].face, "top");
  assert.equal(layout.reinforcementBars[0].y, 50);
  assert.equal(layout.reinforcementBars[1].z, 250);
  assert.equal(layout.reinforcementBars[2].y, 457);
});

test("longitudinal reinforcement layout places bottom bars in the web of T sections", () => {
  const section = new TSection({
    flangeWidth: 800,
    flangeThickness: 120,
    webWidth: 300,
    webHeight: 500,
    units,
  });
  const layout = createLongitudinalReinforcementLayout({
    section,
    units,
    bottom: {
      id: "bottom-main",
      diameter: 20,
      count: 2,
      cover: 40,
    },
    top: {
      id: "top-main",
      diameter: 16,
      count: 2,
      cover: 35,
    },
  });

  const bottomBars = layout.reinforcementBars.filter((bar) =>
    bar.id.startsWith("bottom-main"),
  );
  const topBars = layout.reinforcementBars.filter((bar) =>
    bar.id.startsWith("top-main"),
  );

  assert.equal(bottomBars[0].z, 300);
  assert.equal(bottomBars[1].z, 500);
  assert.equal(topBars[0].z, 43);
  assert.equal(topBars[1].z, 757);
});
