import test from "node:test";
import assert from "node:assert/strict";

import {
  CircularSection,
  RectangularSection,
  ReinforcedConcreteSection,
  ReinforcedConcreteShearVerification,
  ReinforcementBar,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

const approx = (actual, expected, tolerance = 1e-4) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createRcShearFixture() {
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
  const section = new ReinforcedConcreteSection({
    id: "rc-shear-section",
    name: "RC shear section",
    concreteSection,
    concreteMaterial,
    reinforcementMaterial,
    reinforcementBars: [
      new ReinforcementBar({
        id: "bottom-1",
        diameter: 20,
        material: reinforcementMaterial,
        y: 50,
        z: 90,
        units,
      }),
      new ReinforcementBar({
        id: "bottom-2",
        diameter: 20,
        material: reinforcementMaterial,
        y: 50,
        z: 210,
        units,
      }),
      new ReinforcementBar({
        id: "top-1",
        diameter: 12,
        material: reinforcementMaterial,
        y: 450,
        z: 90,
        units,
      }),
      new ReinforcementBar({
        id: "top-2",
        diameter: 12,
        material: reinforcementMaterial,
        y: 450,
        z: 210,
        units,
      }),
    ],
    units,
  });

  return {
    section,
    concreteMaterial,
    reinforcementMaterial,
  };
}

test("RC shear verification checks sections without transverse reinforcement", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createRcShearFixture();
  const result = new ReinforcedConcreteShearVerification().verify({
    section,
    concreteMaterial,
    reinforcementMaterial,
    actions: {
      vEd: 60000,
      nEd: -100000,
      mEd: 120000000,
    },
    shear: {
      mode: "without-transverse-reinforcement",
      longitudinalReinforcementGroup: {
        id: "bottom-main",
        face: "bottom",
        barIds: ["bottom-1", "bottom-2"],
      },
    },
    units,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.checks[0].id, "rc-shear-without-transverse-reinforcement");
  approx(result.outputs.parameters.bw, 300);
  approx(result.outputs.parameters.effectiveDepth, 450);
  approx(result.outputs.parameters.longitudinalArea, (2 * Math.PI * 20 ** 2) / 4);
  assert.equal(result.outputs.parameters.sources.bw, "derived-rectangular-section");
  assert.equal(result.outputs.parameters.sources.d, "derived-from-reinforcement-group");
  assert.equal(result.outputs.parameters.sources.asl, "derived-from-reinforcement-group");
  assert.equal(result.metadata.method, "ntc2018-4.1.2.3.5.1");
});

test("RC shear verification reports missing parameters without unsafe inference", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createRcShearFixture();
  const result = new ReinforcedConcreteShearVerification().verify({
    section,
    concreteMaterial,
    reinforcementMaterial,
    actions: {
      vEd: 60000,
    },
    shear: {
      mode: "without-transverse-reinforcement",
    },
    units,
  });

  assert.equal(result.status, "not-verified");
  assert.equal(result.checks.length, 0);
  assert.ok(result.warnings.some((warning) => warning.includes("longitudinalArea")));
  assert.ok(result.metadata.missingParameters.includes("longitudinalArea"));
});

test("RC shear verification checks vertical stirrups", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createRcShearFixture();
  const result = new ReinforcedConcreteShearVerification().verify({
    section,
    concreteMaterial,
    reinforcementMaterial,
    actions: {
      vEd: 150000,
      nEd: 0,
    },
    shear: {
      mode: "with-transverse-reinforcement",
      effectiveDepth: 450,
      transverseReinforcement: {
        type: "stirrups",
        diameter: 8,
        legs: 2,
        spacing: 150,
        material: reinforcementMaterial,
      },
      cotThetaMin: 1,
      cotThetaMax: 2.5,
    },
    units,
  });

  assert.equal(result.status, "ok");
  assert.ok(result.checks.some((check) => check.id === "rc-shear-resistance"));
  assert.equal(result.metadata.method, "ntc2018-4.1.2.3.5.2");
  assert.ok(result.outputs.vRsd > 150000);
  assert.ok(result.outputs.vRcd > 150000);
  assert.ok(result.outputs.vRdWithTransverseReinforcement > 150000);
  assert.equal(result.outputs.selectedMechanism, "with-transverse-reinforcement");
  assert.ok(result.outputs.cotTheta >= 1);
  assert.ok(result.outputs.cotTheta <= 2.5);
});

test("RC shear verification optimizes cotTheta and compares stirrup/no-stirrup mechanisms", () => {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const concreteSection = new RectangularSection({
    width: 1250,
    height: 240,
    units,
  });
  const section = new ReinforcedConcreteSection({
    id: "rc-shear-excel-section",
    name: "RC shear Excel regression section",
    concreteSection,
    concreteMaterial,
    reinforcementMaterial,
    units,
  });
  const result = new ReinforcedConcreteShearVerification().verify({
    section,
    concreteMaterial,
    reinforcementMaterial,
    actions: {
      vEd: 60000,
      nEd: 0,
    },
    shear: {
      mode: "with-transverse-reinforcement",
      bw: 1250,
      effectiveDepth: 200,
      longitudinalReinforcementArea: 1847.2564803107985,
      fck: 16,
      gammaC: 1.8,
      alphaCc: 0.85,
      cotThetaMin: 1,
      cotThetaMax: 2.5,
      transverseReinforcement: {
        type: "stirrups",
        areaPerLeg: 56.548667764616276 / 2,
        legs: 2,
        spacing: 250,
        fyd: 413.5,
      },
    },
    units,
  });

  assert.equal(result.status, "ok");
  approx(result.outputs.cotTheta, 2.5);
  approx(result.outputs.vRdWithTransverseReinforcement / 1000, 42.089173, 1e-3);
  approx(result.outputs.vRdWithoutTransverseReinforcement / 1000, 113.904023, 1e-3);
  approx(result.outputs.vRd / 1000, 113.904023, 1e-3);
  assert.equal(result.outputs.selectedMechanism, "without-transverse-reinforcement");
});

test("RC circular shear verification applies Cosenza et al. (2016) without stirrups", () => {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const diameter = 300;
  const concreteSection = new CircularSection({
    diameter,
    units,
  });
  const barDiameter = 16;
  const barCount = 8;
  const barRadius = 110;
  const reinforcementBars = Array.from({ length: barCount }, (_, index) => {
    const angle = (2 * Math.PI * index) / barCount;

    return new ReinforcementBar({
      id: `circular-bar-${index + 1}`,
      diameter: barDiameter,
      material: reinforcementMaterial,
      y: diameter / 2 + barRadius * Math.cos(angle),
      z: diameter / 2 + barRadius * Math.sin(angle),
      units,
    });
  });
  const section = new ReinforcedConcreteSection({
    id: "rc-circular-cosenza-without-stirrups",
    name: "RC circular Cosenza section",
    concreteSection,
    concreteMaterial,
    reinforcementMaterial,
    reinforcementBars,
    units,
  });
  const longitudinalReinforcementArea =
    barCount * Math.PI * barDiameter ** 2 / 4;
  const rhoL = longitudinalReinforcementArea / concreteSection.area;
  const result = new ReinforcedConcreteShearVerification().verify({
    section,
    concreteMaterial,
    reinforcementMaterial,
    actions: {
      vEd: 60000,
      nEd: 0,
    },
    shear: {
      method: "cosenza-et-al-2016",
      mode: "without-transverse-reinforcement",
    },
    units,
  });
  const expected =
    0.232 *
    diameter ** 2 *
    Math.cbrt(100 * rhoL * concreteMaterial.fck);

  assert.equal(result.status, "ok");
  approx(result.outputs.vRd, expected);
  approx(result.outputs.rhoL, rhoL, 1e-9);
  assert.equal(result.outputs.parameters.sources.diameter, "derived-circular-section");
  assert.equal(result.outputs.parameters.sources.asl, "derived-all-longitudinal-bars");
  assert.equal(result.outputs.parameters.sources.fcPrime, "concrete-material-fck");
  assert.equal(result.metadata.method, "cosenza-et-al-2016-eq-3");
});

test("RC circular shear verification applies the Cosenza stirrup amplification", () => {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const diameter = 300;
  const concreteSection = new CircularSection({
    diameter,
    units,
  });
  const section = new ReinforcedConcreteSection({
    id: "rc-circular-cosenza-with-stirrups",
    name: "RC circular Cosenza section with stirrups",
    concreteSection,
    concreteMaterial,
    reinforcementMaterial,
    units,
  });
  const longitudinalReinforcementArea = 0.02 * concreteSection.area;
  const stirrupDiameter = 8;
  const legs = 2;
  const spacing = 150;
  const asw = legs * Math.PI * stirrupDiameter ** 2 / 4;
  const rhoW = asw / (spacing * diameter);
  const baseResistance =
    0.232 *
    diameter ** 2 *
    Math.cbrt(100 * 0.02 * 25);
  const result = new ReinforcedConcreteShearVerification().verify({
    section,
    concreteMaterial,
    reinforcementMaterial,
    actions: {
      vEd: 100000,
      nEd: 0,
    },
    shear: {
      formulation: "cosenza-2016",
      mode: "with-transverse-reinforcement",
      longitudinalReinforcementArea,
      fcPrime: 25,
      transverseReinforcement: {
        diameter: stirrupDiameter,
        legs,
        spacing,
      },
    },
    units,
  });
  const expected = baseResistance * (1 + 245 * rhoW);

  assert.equal(result.status, "ok");
  approx(result.outputs.rhoW, rhoW, 1e-9);
  approx(result.outputs.amplificationFactor, 1 + 245 * rhoW, 1e-9);
  approx(result.outputs.vRd, expected);
  approx(result.outputs.vRdWithTransverseReinforcement, expected);
  assert.equal(result.metadata.method, "cosenza-et-al-2016-eq-5");
});

test("Cosenza et al. (2016) shear verification rejects non-circular sections", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createRcShearFixture();
  const result = new ReinforcedConcreteShearVerification().verify({
    section,
    concreteMaterial,
    reinforcementMaterial,
    actions: {
      vEd: 10000,
    },
    shear: {
      method: "cosenza-et-al-2016",
      mode: "without-transverse-reinforcement",
      longitudinalReinforcementArea: 1000,
      fcPrime: 25,
    },
    units,
  });

  assert.equal(result.status, "not-verified");
  assert.ok(result.metadata.missingParameters.includes("circularSection"));
  assert.ok(result.warnings.some((warning) => warning.includes("only for circular")));
});
