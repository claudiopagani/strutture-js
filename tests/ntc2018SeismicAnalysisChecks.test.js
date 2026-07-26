import test from "node:test";
import assert from "node:assert/strict";

import {
  createNTC2018LinearDynamicAssessment,
  validateGlobalFemAnalysisContract,
  verifyNTC2018AccidentalEccentricities,
  verifyNTC2018ModalMassParticipation,
} from "../src/index.js";
import {
  createGlobalFemBuildingFixture,
} from "./fixtures/globalFemBuildingFixture.js";

function modalModes(totalX = 0.86, totalY = 0.86) {
  return [
    {
      procedureId: "PROC-MODAL",
      modeNumber: 1,
      participatingMassRatios: {
        X: totalX - 0.06,
        Y: 0.06,
        Z: 0,
      },
    },
    {
      procedureId: "PROC-MODAL",
      modeNumber: 2,
      participatingMassRatios: {
        X: 0.06,
        Y: totalY - 0.06,
        Z: 0,
      },
    },
  ];
}

function eccentricities(offset = 0.2) {
  return ["L1", "L2"].flatMap((storeyId) =>
    ["X", "Y"].flatMap((direction) => [
      { storeyId, direction, offset },
      { storeyId, direction, offset: -offset },
    ]));
}

function linearDynamicInput() {
  return {
    analysis: {
      spectra: [
        { id: "SPECTRUM-X", direction: "X" },
        { id: "SPECTRUM-Y", direction: "Y" },
      ],
      procedures: [
        {
          id: "PROC-MODAL",
          type: "modal",
          requestedModes: 2,
        },
        {
          id: "PROC-RS",
          type: "response-spectrum",
          spectrumIds: ["SPECTRUM-X", "SPECTRUM-Y"],
          modalCombinationMethod: "cqc",
          componentCombinationRule: "100-30-30",
          accidentalEccentricities: eccentricities(),
        },
      ],
    },
    result: {
      results: {
        modes: modalModes(),
      },
    },
    modalProcedureId: "PROC-MODAL",
    responseSpectrumProcedureId: "PROC-RS",
    storeyIds: ["L1", "L2"],
    meanPlanDimensions: { X: 4, Y: 4 },
  };
}

test("modal participating mass must be strictly greater than 85 percent", () => {
  const exactThreshold = verifyNTC2018ModalMassParticipation({
    modes: modalModes(0.85, 0.85),
  });
  const aboveThreshold = verifyNTC2018ModalMassParticipation({
    modes: modalModes(),
  });

  assert.equal(exactThreshold.ok, false);
  assert.equal(aboveThreshold.ok, true);
  assert.deepEqual(
    aboveThreshold.directions.map((item) =>
      item.significantModeNumbers),
    [[1, 2], [1, 2]],
  );
});

test("only modes above five percent are reported as significant", () => {
  const result = verifyNTC2018ModalMassParticipation({
    modes: [{
      modeNumber: 1,
      participatingMassRatios: { X: 0.05 },
    }, {
      modeNumber: 2,
      participatingMassRatios: { X: 0.81 },
    }],
    directions: ["X"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.directions[0].significantModeNumbers,
    [2],
  );
});

test("accidental eccentricity covers both signs and remains constant over height", () => {
  const valid = verifyNTC2018AccidentalEccentricities({
    eccentricities: eccentricities(),
    storeyIds: ["L1", "L2"],
    meanPlanDimensions: { X: 4, Y: 4 },
  });
  const missingSign = verifyNTC2018AccidentalEccentricities({
    eccentricities: eccentricities().filter((item) =>
      !(item.storeyId === "L2" &&
        item.direction === "Y" &&
        item.offset < 0)),
    storeyIds: ["L1", "L2"],
    meanPlanDimensions: { X: 4, Y: 4 },
  });
  const variableOverHeight = verifyNTC2018AccidentalEccentricities({
    eccentricities: eccentricities().map((item) =>
      item.storeyId === "L2"
        ? { ...item, offset: item.offset * 1.5 }
        : item),
    storeyIds: ["L1", "L2"],
    meanPlanDimensions: { X: 4, Y: 4 },
  });

  assert.equal(valid.ok, true);
  assert.equal(missingSign.ok, false);
  assert.equal(variableOverHeight.ok, false);
});

test("linear dynamic assessment verifies the complete NTC procedure declaration", () => {
  const valid = createNTC2018LinearDynamicAssessment(
    linearDynamicInput(),
  );
  const wrongCombination = linearDynamicInput();
  wrongCombination.analysis.procedures[1].modalCombinationMethod = "srss";
  const invalid = createNTC2018LinearDynamicAssessment(
    wrongCombination,
  );

  assert.equal(valid.status, "ok");
  assert.equal(valid.complete, true);
  assert.equal(valid.checks.length, 6);
  assert.equal(invalid.status, "not-verified");
  assert.ok(invalid.checks.some((item) =>
    item.id === "modal-combination-cqc" && !item.ok));
});

test("response-spectrum FEM contracts require CQC, 100-30-30 and eccentricities", () => {
  const fixture = createGlobalFemBuildingFixture();
  fixture.capabilities.analyses.responseSpectrum = true;
  fixture.analysis.spectra = [
    {
      id: "SPECTRUM-X",
      direction: "X",
      dampingRatio: 0.05,
      points: [
        { period: 0, acceleration: 1 },
        { period: 1, acceleration: 0.5 },
      ],
    },
    {
      id: "SPECTRUM-Y",
      direction: "Y",
      dampingRatio: 0.05,
      points: [
        { period: 0, acceleration: 1 },
        { period: 1, acceleration: 0.5 },
      ],
    },
  ];
  fixture.analysis.procedures.push({
    id: "PROC-RS",
    type: "response-spectrum",
    massSourceId: "MASS-1",
    requestedModes: 2,
    directions: ["X", "Y"],
    requestedOutputs: ["modes"],
    spectrumIds: ["SPECTRUM-X", "SPECTRUM-Y"],
    modalCombinationMethod: "cqc",
    componentCombinationRule: "100-30-30",
    accidentalEccentricities: eccentricities().map((item, index) => ({
      id: `ECC-RS-${index + 1}`,
      ...item,
    })),
  });

  const valid = validateGlobalFemAnalysisContract(
    fixture.analysis,
    fixture,
  );
  assert.equal(valid.ok, true, JSON.stringify(valid.errors));

  delete fixture.analysis.procedures.at(-1).modalCombinationMethod;
  const missing = validateGlobalFemAnalysisContract(
    fixture.analysis,
    fixture,
  );
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((item) =>
    item.path.endsWith(".modalCombinationMethod")));
});
