import test from "node:test";
import assert from "node:assert/strict";

import {
  RectangularSection,
  ReinforcedConcreteBeamDetailingVerification,
  calculateEn1992AnchorageLength,
  calculateEn1992DesignBondStrength,
  calculateEn1992LocalBearingResistance,
  calculateEn1992ShrinkageCurvature,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

test("EN 1992 common RC helpers reproduce independent detailing arithmetic", () => {
  const bond = calculateEn1992DesignBondStrength({
    fctd: 1.2,
    barDiameter: 16,
  });
  const anchorage = calculateEn1992AnchorageLength({
    barDiameter: 16,
    designSteelStress: 400,
    fbd: bond.fbd,
  });
  const bearing = calculateEn1992LocalBearingResistance({
    loadedArea: 40000,
    distributionArea: 160000,
    fcd: 15,
  });
  const shrinkage = calculateEn1992ShrinkageCurvature({
    freeShrinkageStrain: -0.0003,
    reinforcementElasticModulus: 200000,
    effectiveConcreteModulus: 10000,
    reinforcementFirstMoment: 100000,
    sectionSecondMoment: 1e9,
  });

  assert.ok(Math.abs(bond.fbd - 2.7) < 1e-12);
  assert.ok(Math.abs(anchorage.basicRequiredLength - 592.5925926) < 1e-6);
  assert.equal(bearing.enhancement, 2);
  assert.equal(bearing.resistance, 1.2e6);
  assert.ok(Math.abs(shrinkage.curvature + 6e-7) < 1e-18);
});

test("beam detailing covers anchorage, critical zones and dissipative ductility rules", () => {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const result = new ReinforcedConcreteBeamDetailingVerification().verify({
    section: new RectangularSection({ width: 300, height: 500, units }),
    concreteMaterial,
    reinforcementMaterial,
    detailing: {
      geometry: { effectiveDepth: 450 },
      longitudinal: {
        top: { diameter: 16, barCount: 4 },
        bottom: { diameter: 16, barCount: 4 },
      },
      transverse: {
        diameter: 8,
        spacing: 90,
        areaPerSet: 100.53,
        hookAngle: 135,
        hookExtension: 80,
      },
      seismic: {
        enabled: true,
        ductilityClass: "CDA",
        firstHoopDistance: 50,
      },
      anchors: [{ id: "support-top", diameter: 16, availableLength: 1000 }],
    },
  });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.seismic.criticalZoneLength, 750);
  assert.ok(
    result.checks.some((check) => check.id === "rc-beam-anchorage-support-top"),
  );
  assert.ok(
    result.checks.some((check) => check.id === "rc-beam-seismic-hoop-spacing"),
  );
});
