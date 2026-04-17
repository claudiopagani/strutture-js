import test from "node:test";
import assert from "node:assert/strict";

import {
  PolygonSection,
  RectangularSection,
  ReinforcedConcreteSection,
  ReinforcedConcreteServiceabilityVerification,
  ReinforcementBar,
  createLongitudinalReinforcementLayout,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

function createServiceabilityFixture() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    id: "rc-sle-section",
    name: "RC SLE section",
    concreteSection: new RectangularSection({
      width: 300,
      height: 500,
      units,
    }),
    reinforcementBars: [
      new ReinforcementBar({
        id: "bottom-left",
        diameter: 16,
        material: reinforcementMaterial,
        y: 50,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "bottom-right",
        diameter: 16,
        material: reinforcementMaterial,
        y: 50,
        z: 240,
        units,
      }),
      new ReinforcementBar({
        id: "top-left",
        diameter: 16,
        material: reinforcementMaterial,
        y: 450,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "top-right",
        diameter: 16,
        material: reinforcementMaterial,
        y: 450,
        z: 240,
        units,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    units,
  });

  return {
    section,
    concreteMaterial,
    reinforcementMaterial,
  };
}

function createGroupedServiceabilityFixture() {
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
  const reinforcementLayout = createLongitudinalReinforcementLayout({
    section: concreteSection,
    material: reinforcementMaterial,
    units,
    bottom: {
      id: "bottom-main",
      diameter: 16,
      count: 2,
      cover: 40,
    },
    top: {
      id: "top-main",
      diameter: 16,
      count: 2,
      cover: 40,
    },
  });
  const section = new ReinforcedConcreteSection({
    id: "grouped-rc-sle-section",
    name: "Grouped RC SLE section",
    concreteSection,
    reinforcementBars: reinforcementLayout.reinforcementBars,
    concreteMaterial,
    reinforcementMaterial,
    units,
    metadata: {
      longitudinalReinforcementGroups:
        reinforcementLayout.longitudinalReinforcementGroups,
    },
  });

  return {
    section,
    concreteMaterial,
    reinforcementMaterial,
  };
}

function findCheck(result, id) {
  return result.checks.find((check) => check.id === id);
}

test("RC serviceability verification checks NTC service stress limits", () => {
  const { section, concreteMaterial, reinforcementMaterial } =
    createServiceabilityFixture();
  const result = new ReinforcedConcreteServiceabilityVerification().verify({
    section,
    concreteMaterial,
    reinforcementMaterial,
    actions: {
      nEd: 0,
      mEd: 4e7,
    },
    combinationType: "SLE_RARE",
  });

  assert.equal(result.applicationId, "reinforced-concrete-serviceability");
  assert.equal(result.status, "ok");
  assert.ok(result.checks.some((check) => check.id === "rc-sle-concrete-stress"));
  assert.ok(result.checks.some((check) => check.id === "rc-sle-steel-stress"));
  assert.equal(result.outputs.modularRatio, 15);
  assert.equal(result.outputs.creepCoefficient, 2);
  assert.equal(result.outputs.includeShrinkage, false);
});

test("RC serviceability verification performs indirect crack control from tables", () => {
  const { section, concreteMaterial, reinforcementMaterial } =
    createServiceabilityFixture();
  const result = new ReinforcedConcreteServiceabilityVerification().verifySectionActions({
    nEd: 0,
    mEd: 4e7,
    context: {
      section,
      concreteMaterial,
      reinforcementMaterial,
      combinationType: "SLE_FREQUENT",
    },
  });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.crackWidthClass, "w3");
  assert.ok(result.checks.some((check) => check.id === "rc-sle-crack-bar-diameter"));
  assert.ok(result.checks.some((check) => check.id === "rc-sle-crack-bar-spacing"));
  assert.ok(
    result.checks.some(
      (check) =>
        check.id === "rc-sle-crack-bar-spacing" &&
        check.metadata.spacing === 180,
    ),
  );
});

test("RC serviceability validation uses NTC stress limit factors", () => {
  const { section, concreteMaterial, reinforcementMaterial } =
    createGroupedServiceabilityFixture();
  const rareResult = new ReinforcedConcreteServiceabilityVerification().verify({
    section,
    concreteMaterial,
    reinforcementMaterial,
    actions: {
      nEd: 0,
      mEd: 1e7,
    },
    combinationType: "SLE_RARE",
  });
  const quasiPermanentResult =
    new ReinforcedConcreteServiceabilityVerification().verify({
      section,
      concreteMaterial,
      reinforcementMaterial,
      actions: {
        nEd: 0,
        mEd: 1e7,
      },
      combinationType: "SLE_QUASI_PERMANENT",
    });

  assert.equal(findCheck(rareResult, "rc-sle-concrete-stress").capacity, 15);
  assert.equal(findCheck(rareResult, "rc-sle-steel-stress").capacity, 360);
  assert.equal(
    findCheck(quasiPermanentResult, "rc-sle-concrete-stress").capacity,
    11.25,
  );
  assert.equal(
    findCheck(quasiPermanentResult, "rc-sle-steel-stress"),
    undefined,
  );
});

test("RC serviceability validation maps environment and combination to crack classes", () => {
  const { section, concreteMaterial, reinforcementMaterial } =
    createGroupedServiceabilityFixture();
  const cases = [
    ["ordinary", "SLE_FREQUENT", "w3"],
    ["ordinary", "SLE_QUASI_PERMANENT", "w2"],
    ["aggressive", "SLE_FREQUENT", "w2"],
    ["aggressive", "SLE_QUASI_PERMANENT", "w1"],
    ["very_aggressive", "SLE_FREQUENT", "w1"],
    ["very_aggressive", "SLE_QUASI_PERMANENT", "w1"],
  ];

  for (const [environment, combinationType, expectedClass] of cases) {
    const result = new ReinforcedConcreteServiceabilityVerification().verify({
      section,
      concreteMaterial,
      reinforcementMaterial,
      actions: {
        nEd: 0,
        mEd: 0,
      },
      combinationType,
      serviceability: {
        cracking: {
          environment,
        },
      },
    });

    assert.equal(result.outputs.crackWidthClass, expectedClass);
  }
});

test("RC serviceability crack control selects bottom or top reinforcement groups", () => {
  const { section, concreteMaterial, reinforcementMaterial } =
    createGroupedServiceabilityFixture();
  const verifier = new ReinforcedConcreteServiceabilityVerification();
  const positiveMoment = verifier.verify({
    section,
    concreteMaterial,
    reinforcementMaterial,
    actions: {
      nEd: 0,
      mEd: 4e7,
    },
    combinationType: "SLE_FREQUENT",
  });
  const negativeMoment = verifier.verify({
    section,
    concreteMaterial,
    reinforcementMaterial,
    actions: {
      nEd: 0,
      mEd: -4e7,
    },
    combinationType: "SLE_FREQUENT",
  });

  assert.equal(positiveMoment.status, "ok");
  assert.equal(positiveMoment.outputs.crackControlGroupId, "bottom-main");
  assert.deepEqual(
    positiveMoment.outputs.tensileBars.map((bar) => bar.id),
    ["bottom-main-1", "bottom-main-2"],
  );
  assert.ok(
    positiveMoment.checks.every(
      (check) =>
        !check.id.startsWith("rc-sle-crack") ||
        (check.metadata.groupId === "bottom-main" &&
          check.metadata.face === "bottom"),
    ),
  );

  assert.equal(negativeMoment.status, "ok");
  assert.equal(negativeMoment.outputs.crackControlGroupId, "top-main");
  assert.deepEqual(
    negativeMoment.outputs.tensileBars.map((bar) => bar.id),
    ["top-main-1", "top-main-2"],
  );
  assert.ok(
    negativeMoment.checks.every(
      (check) =>
        !check.id.startsWith("rc-sle-crack") ||
        (check.metadata.groupId === "top-main" &&
          check.metadata.face === "top"),
    ),
  );
});

test("RC serviceability stress check can include biaxial moment while crack control stays primary-plane", () => {
  const { section, concreteMaterial, reinforcementMaterial } =
    createGroupedServiceabilityFixture();
  const result = new ReinforcedConcreteServiceabilityVerification().verifySectionActions({
    nEd: 0,
    mEd: 1e7,
    mxEd: -1e7,
    myEd: 1e6,
    context: {
      section,
      concreteMaterial,
      reinforcementMaterial,
      combinationType: "SLE_QUASI_PERMANENT",
    },
  });
  const concreteStress = findCheck(result, "rc-sle-concrete-stress");
  const crackDiameter = findCheck(result, "rc-sle-crack-bar-diameter");

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.biaxialStress, true);
  assert.equal(concreteStress.metadata.biaxialStress, true);
  assert.equal(concreteStress.metadata.myEd, 1e6);
  assert.equal(crackDiameter.metadata.momentBasis, "primary-moment-only");
  assert.equal(crackDiameter.metadata.weakAxisMomentNeglected, true);
  assert.equal(result.outputs.crackControlGroupId, "bottom-main");
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("weak-axis service moment component"),
    ),
  );
});

test("RC serviceability requires explicit crack-control groups for generic sections", () => {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const concreteSection = new PolygonSection({
    points: [
      { y: 0, z: 0 },
      { y: 0, z: 300 },
      { y: 500, z: 300 },
      { y: 500, z: 0 },
    ],
    units,
  });
  const section = new ReinforcedConcreteSection({
    id: "generic-rc-sle-section",
    name: "Generic RC SLE section",
    concreteSection,
    reinforcementBars: [
      new ReinforcementBar({
        id: "bottom-left",
        diameter: 16,
        material: reinforcementMaterial,
        y: 50,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "bottom-right",
        diameter: 16,
        material: reinforcementMaterial,
        y: 50,
        z: 240,
        units,
      }),
      new ReinforcementBar({
        id: "top-left",
        diameter: 16,
        material: reinforcementMaterial,
        y: 450,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "top-right",
        diameter: 16,
        material: reinforcementMaterial,
        y: 450,
        z: 240,
        units,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    units,
  });
  const result = new ReinforcedConcreteServiceabilityVerification().verify({
    section,
    concreteMaterial,
    reinforcementMaterial,
    actions: {
      nEd: 0,
      mEd: 4e7,
    },
    combinationType: "SLE_FREQUENT",
  });

  assert.equal(result.status, "not-verified");
  assert.equal(result.outputs.crackControlComplete, false);
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("requires explicit top/bottom reinforcement groups"),
    ),
  );
});
