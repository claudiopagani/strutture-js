import test from "node:test";
import assert from "node:assert/strict";

import {
  applyNTC2018ExistingMasonryMaltaBuonaUpdate,
  applyNTC2018ExistingMasonryModifierToggle,
  createNTC2018ExistingMasonryWorkflowState,
  evaluateNTC2018ExistingMasonryWorkflow,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

test("toggle disables mutually exclusive interventions", () => {
  const initialState = createNTC2018ExistingMasonryWorkflowState();

  const nextState = applyNTC2018ExistingMasonryModifierToggle(initialState, 5);

  assert.equal(nextState.coefficienti.find((item) => item.id === 5).checked, true);
  assert.equal(nextState.coefficienti.find((item) => item.id === 6).enabled, false);
  assert.equal(nextState.coefficienti.find((item) => item.id === 7).enabled, false);
  assert.equal(nextState.coefficienti.find((item) => item.id === 8).enabled, false);
});

test("toggling back re-enables alternative interventions", () => {
  const initialState = createNTC2018ExistingMasonryWorkflowState();
  const withToggle = applyNTC2018ExistingMasonryModifierToggle(initialState, 5);

  const restoredState = applyNTC2018ExistingMasonryModifierToggle(withToggle, 5);

  assert.equal(restoredState.coefficienti.find((item) => item.id === 5).checked, false);
  assert.equal(restoredState.coefficienti.find((item) => item.id === 6).enabled, true);
  assert.equal(restoredState.coefficienti.find((item) => item.id === 7).enabled, true);
  assert.equal(restoredState.coefficienti.find((item) => item.id === 8).enabled, true);
});

test("updating malta buona changes only its value", () => {
  const initialState = createNTC2018ExistingMasonryWorkflowState();
  const updatedState = applyNTC2018ExistingMasonryMaltaBuonaUpdate(initialState, 5);

  assert.equal(
    updatedState.coefficienti.find((item) => item.key === "maltaBuona").value,
    Math.pow(5, 0.35),
  );
  assert.equal(
    updatedState.coefficienti.find((item) => item.id === 2).value,
    initialState.coefficienti.find((item) => item.id === 2).value,
  );
});

test("workflow evaluation delegates to the NTC material engine", async () => {
  const response = await evaluateNTC2018ExistingMasonryWorkflow({
    tipologiaIndex: 1,
    livelloDiConfidenza: 2,
    units,
    coefficienti: [
      {
        id: 1,
        key: "maltaBuona",
        enabled: true,
        checked: true,
        value: 1.5,
      },
      {
        id: 4,
        key: "iniezioniMisceleLeganti",
        enabled: true,
        checked: true,
        value: 2,
      },
    ],
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.parametriOriginali.fm, 1.5);
  assert.equal(response.data.parametriAnteOperam.fm, 2.25);
  assert.equal(response.data.parametriPostOperam.fm, 4.5);
});
