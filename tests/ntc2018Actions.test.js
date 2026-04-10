import test from "node:test";
import assert from "node:assert/strict";

import {
  ClimaticAction,
  ImposedAction,
  LoadCase,
  NodalLoad,
  PermanentAction,
  TrafficAction,
  WindAction,
  createNTC2018PermanentAction,
  createNTC2018SLECombination,
  createNTC2018ULSFundamentalCombination,
  createNTC2018VariableAction,
  createNTC2018WindAction,
  getNTC2018ActionCombinationFactors,
  getNTC2018ActionPartialFactors,
  getNTC2018LoadDurationDefinition,
  getNTC2018TimberKmod,
  resolveNTC2018GoverningLoadDuration,
} from "../src/index.js";

const units = { force: "kN", length: "m" };

test("ntc2018 actions expose combination factors, partial factors and duration classes", () => {
  const permanent = createNTC2018PermanentAction({
    id: "ACT-G1",
    permanentClass: "G1",
  });
  const imposed = createNTC2018VariableAction({
    id: "ACT-QB",
    category: "B",
  });
  const wind = createNTC2018WindAction({
    id: "ACT-W",
  });

  assert.equal(permanent instanceof PermanentAction, true);
  assert.equal(imposed instanceof ImposedAction, true);
  assert.equal(wind instanceof WindAction, true);
  assert.equal(wind instanceof ClimaticAction, true);
  assert.equal(imposed.getCombinationFactor("psi0"), 0.7);
  assert.equal(imposed.getPartialFactor({ combinationSet: "A1", effect: "unfavourable" }), 1.5);
  assert.equal(permanent.getPartialFactor({ combinationSet: "A1", effect: "unfavourable" }), 1.3);
  assert.equal(wind.loadDurationClass, "instantaneous");
});

test("traffic-related variable actions use dedicated partial factors", () => {
  const traffic = createNTC2018VariableAction({
    id: "ACT-QF",
    category: "F",
    family: "traffic",
  });

  assert.equal(traffic instanceof TrafficAction, true);
  assert.equal(traffic.getPartialFactor({ combinationSet: "A1", effect: "unfavourable" }), 1.35);
});

test("load cases propagate actions to loads", () => {
  const action = createNTC2018VariableAction({
    id: "ACT-QC",
    category: "C",
  });

  const loadCase = new LoadCase({
    id: "Q_C",
    action,
  });

  const load = new NodalLoad({
    id: "P1",
    node: { id: "N1" },
    components: { fy: -10 },
    units,
  });

  loadCase.addLoad(load);

  assert.equal(load.action?.id, "ACT-QC");
  assert.equal(action.loadCase?.id, "Q_C");
});

test("ntc2018 combinations can be created directly from action objects", () => {
  const g1 = new LoadCase({
    id: "G1",
    action: createNTC2018PermanentAction({
      id: "ACT-G1",
      permanentClass: "G1",
    }),
  });
  const g2 = new LoadCase({
    id: "G2",
    action: createNTC2018PermanentAction({
      id: "ACT-G2",
      permanentClass: "G2",
    }),
  });
  const qOfficeAction = createNTC2018VariableAction({
    id: "ACT-QB",
    category: "B",
  });
  const qOffice = new LoadCase({
    id: "QB",
    action: qOfficeAction,
  });
  const windAction = createNTC2018WindAction({
    id: "ACT-W",
  });
  const wind = new LoadCase({
    id: "W",
    action: windAction,
  });

  const uls = createNTC2018ULSFundamentalCombination({
    id: "ULS-1",
    permanentActions: [g1.action, g2.action],
    variableActions: [qOffice.action, wind.action],
    leadingVariableAction: qOffice.action,
  });

  const sleFrequent = createNTC2018SLECombination({
    id: "SLE-FREQ-1",
    type: "FREQUENT",
    permanentActions: [g1.action, g2.action],
    variableActions: [qOffice.action, wind.action],
    leadingVariableAction: qOffice.action,
  });

  assert.equal(uls.evaluate({ G1: 10, G2: 4, QB: 3, W: 2 }), 25.3);
  assert.equal(sleFrequent.evaluate({ G1: 10, G2: 4, QB: 3, W: 2 }), 15.5);
});

test("duration helpers support timber verification workflows", () => {
  const duration = resolveNTC2018GoverningLoadDuration([
    createNTC2018PermanentAction({ id: "ACT-G1", permanentClass: "G1" }),
    createNTC2018VariableAction({ id: "ACT-QE", category: "E" }),
    createNTC2018WindAction({ id: "ACT-W" }),
  ]);

  assert.deepEqual(getNTC2018ActionCombinationFactors("E"), {
    psi0: 1,
    psi1: 0.9,
    psi2: 0.8,
    description: "magazzini e industriale",
  });
  assert.deepEqual(getNTC2018LoadDurationDefinition("short"), {
    key: "short",
    order: 2,
    description: "breve durata",
  });
  assert.equal(duration.key, "instantaneous");
  assert.equal(
    getNTC2018ActionPartialFactors({
      nature: "variable",
      family: "wind",
    }).A1.unfavourable,
    1.5,
  );
  assert.equal(
    getNTC2018TimberKmod({
      materialType: "solid_timber",
      serviceClass: 2,
      loadDurationClass: "medium",
    }),
    0.8,
  );
});
