import test from "node:test";
import assert from "node:assert/strict";

import {
  ReinforcementBar,
  TECNARIA_CONNECTOR_TYPES,
  TecnariaConnector,
  createTecnariaConnector,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("reinforcement bar resolves area from diameter and distributes it over a width", () => {
  const steel = createNTC2018ReinforcementSteelMaterial({ grade: "B450C" });
  const bar = new ReinforcementBar({
    diameter: 6,
    grade: "B450C",
    material: steel,
  });

  approx(bar.area, (Math.PI * 6 ** 2) / 4);
  approx(bar.distributedArea(1800, 100), 508.93800988154646);
});

test("tecnaria connector resolves catalog properties", () => {
  const connector = createTecnariaConnector({
    type: "MAXI",
    boardThickness: 0,
  });

  assert.ok(connector instanceof TecnariaConnector);
  assert.ok(TECNARIA_CONNECTOR_TYPES.includes("BASE"));
  approx(connector.kser, 18.6);
  approx(connector.ku, 10.4);
  approx(connector.fvrk, 19.3);
});
