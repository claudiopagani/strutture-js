import test from "node:test";
import assert from "node:assert/strict";

import {
  ReinforcedConcreteSection,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcementBar,
  RectangularSection,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

function createSection() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC moment-curvature fixture",
    concreteSection: new RectangularSection({ width: 300, height: 500, units }),
    reinforcementBars: [
      new ReinforcementBar({
        id: "bottom-left",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "bottom-right",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 240,
        units,
      }),
      new ReinforcementBar({
        id: "top-left",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "top-right",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 240,
        units,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  return {
    section,
    concreteMaterial,
    reinforcementMaterial,
  };
}

test("reinforced concrete section application returns a moment-curvature curve", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createSection();
  const model = new ReinforcedConcreteSectionModel({
    id: "rc-moment-curvature-01",
    section,
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    analysisType: "moment-curvature",
    mesh: {
      targetFiberCount: 120,
    },
    solver: {
      tolerance: 1e-6,
      maxIterations: 100,
    },
    actions: {
      nEd: 0,
    },
    analysisSettings: {
      compressedEdge: "top",
      pointCount: 12,
      curvatureMax: 0.0003,
    },
    units,
  });
  const result = new ReinforcedConcreteSectionApplication().run({ model });

  assert.equal(result.applicationId, "reinforced-concrete-sections");
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.analysisType, "moment-curvature");
  assert.ok(result.outputs.points.length >= 3);
  assert.equal(result.outputs.points[0].curvature, 0);
  assert.equal(result.outputs.points[0].Mx, 0);
  assert.ok(result.outputs.points.at(-1).curvature > 0);
  assert.ok(result.outputs.points.at(-1).Mx > 0);
  assert.equal(result.outputs.failureReached, true);
  assert.equal(result.outputs.firstYieldReached, true);
  assert.equal(result.outputs.firstYieldType, "steel-tension-yield");
  assert.equal(
    result.outputs.firstYieldPoint.firstYieldState.eventMaterial,
    "steel",
  );
  assert.equal(
    result.outputs.firstYieldPoint.firstYieldState.eventMode,
    "yield-tension",
  );
  assert.ok(
    Math.abs(
      result.outputs.firstYieldPoint.firstYieldState.event.utilizationRatio - 1,
    ) < 1e-6,
  );
  assert.ok(
    result.outputs.points.some(
      (point) =>
        point.firstYieldState.eventType === result.outputs.firstYieldType,
    ),
  );
  assert.equal(
    result.outputs.failurePoint.extremes.concreteCompressionEdge.edge,
    "top",
  );
  assert.equal(
    result.outputs.ntc2018Ductility.reference,
    "NTC2018 4.1.2.3.4.2",
  );
  assert.ok(result.outputs.ntc2018Ductility.phiPrimeYd > 0);
  assert.ok(result.outputs.ntc2018Ductility.mPrimeYd > 0);
  assert.ok(result.outputs.ntc2018Ductility.mRd >= result.outputs.ntc2018Ductility.mPrimeYd);
  assert.ok(result.outputs.ntc2018Ductility.phiYd >= result.outputs.ntc2018Ductility.phiPrimeYd);
  assert.ok(result.outputs.ntc2018Ductility.phiU >= result.outputs.ntc2018Ductility.phiPrimeYd);
  assert.ok(result.outputs.ntc2018Ductility.curvatureDuctilityRatio > 0);
  assert.ok(result.outputs.failurePoint.limitState.governing.utilizationRatio >= 0.99);
});

test("moment-curvature default range reaches material failure and reports balanced failure", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createSection();
  const model = new ReinforcedConcreteSectionModel({
    id: "rc-moment-curvature-balanced-01",
    section,
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    analysisType: "moment-curvature",
    mesh: {
      targetFiberCount: 120,
    },
    solver: {
      tolerance: 1e-6,
      maxIterations: 100,
    },
    actions: {
      nEd: 0,
    },
    analysisSettings: {
      compressedEdge: "top",
      pointCount: 41,
    },
    units,
  });
  const result = new ReinforcedConcreteSectionApplication().run({ model });
  const balanced = result.outputs.balancedFailurePoint;
  const expectedBalancedCurvature =
    (0.0035 + reinforcementMaterial.ultimateStrain) / (500 - 40);

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.failureReached, true);
  assert.equal(result.outputs.balancedFailureReached, true);
  assert.ok(
    Math.abs(
      result.outputs.initialCurvatureMax - expectedBalancedCurvature,
    ) < 1e-12,
  );
  assert.ok(result.outputs.curvatureMax > expectedBalancedCurvature);
  assert.ok(
    result.outputs.failurePoint.absoluteCurvature <
      result.outputs.curvatureMax,
  );
  assert.equal(result.outputs.postPeakDropReached, true);
  assert.equal(
    result.outputs.terminationReason,
    "post-peak-moment-drop",
  );
  assert.ok(
    result.outputs.postPeakDropPoint.absoluteCurvature >
      expectedBalancedCurvature,
  );
  assert.ok(
    result.outputs.postPeakDropPoint.Mx /
      result.outputs.maximumMomentPoint.Mx <=
      0.7,
  );
  assert.equal(
    result.outputs.postPeakDropPoint.postPeakState.targetDropRatio,
    0.3,
  );
  assert.ok(
    result.outputs.postPeakDropPoint.postPeakState.actualDropRatio >=
      0.3,
  );
  assert.equal(
    result.outputs.postPeakDropPoint.postUltimate.active,
    true,
  );
  assert.equal(
    result.outputs.postUltimateModel.response,
    "zero-stress",
  );
  assert.deepEqual(
    result.outputs.postUltimateModel.fractureEnergyDensity,
    {
      concrete: 0,
      steel: 0,
    },
  );
  assert.equal(balanced.failureMode, "balanced-concrete-steel");
  assert.equal(balanced.balancedFailureState.reached, true);
  assert.ok(
    Math.abs(
      balanced.balancedFailureState.concrete.utilizationRatio - 1,
    ) < 1e-9,
  );
  assert.ok(
    Math.abs(balanced.balancedFailureState.steel.utilizationRatio - 1) < 1e-9,
  );
  assert.equal(balanced.extremes.maxSteelTensionStrain.id, "bottom-left");
  assert.equal(balanced.extremes.maxSteelTensionStrain.y, 40);
  assert.equal(
    result.outputs.ntc2018Ductility.ultimateMomentDropRatio,
    0.15,
  );
  assert.equal(
    result.outputs.ntc2018Ductility.ultimateCurvatureSource,
    "material-ultimate-strain",
  );
});

test("moment-curvature enables linear softening only with explicit fracture-energy density", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createSection();
  const concreteFractureEnergyDensity =
    0.5 * concreteMaterial.fcd * 0.0035;
  const steelFractureEnergyDensity =
    0.5 *
    reinforcementMaterial.fyd *
    reinforcementMaterial.ultimateStrain;
  const model = new ReinforcedConcreteSectionModel({
    id: "rc-moment-curvature-softening-energy-01",
    section,
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    analysisType: "moment-curvature",
    mesh: {
      targetFiberCount: 120,
    },
    actions: {
      nEd: 0,
    },
    analysisSettings: {
      compressedEdge: "top",
      pointCount: 41,
      postUltimateResponse: "linear-softening",
      postUltimateFractureEnergyDensity: {
        concrete: concreteFractureEnergyDensity,
        steel: steelFractureEnergyDensity,
      },
    },
    units,
  });
  const result = new ReinforcedConcreteSectionApplication().run({ model });

  assert.equal(result.status, "ok");
  assert.equal(
    result.outputs.postUltimateModel.response,
    "linear-softening",
  );
  assert.deepEqual(
    result.outputs.postUltimateModel.fractureEnergyDensity,
    {
      concrete: concreteFractureEnergyDensity,
      steel: steelFractureEnergyDensity,
    },
  );
  assert.ok(
    Math.abs(
      result.outputs.postPeakDropPoint.postPeakState.actualDropRatio -
        0.3,
    ) < 1e-6,
  );
});

test("moment-curvature can retain the legacy stop at first material failure", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createSection();
  const model = new ReinforcedConcreteSectionModel({
    id: "rc-moment-curvature-stop-at-failure-01",
    section,
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    analysisType: "moment-curvature",
    mesh: {
      targetFiberCount: 120,
    },
    actions: {
      nEd: 0,
    },
    analysisSettings: {
      compressedEdge: "top",
      pointCount: 41,
      stopAtFailure: true,
    },
    units,
  });
  const result = new ReinforcedConcreteSectionApplication().run({ model });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.failureReached, true);
  assert.equal(result.outputs.postPeakDropReached, false);
  assert.equal(
    result.outputs.terminationReason,
    "first-material-ultimate-strain",
  );
  assert.equal(
    result.outputs.curvatureMax,
    result.outputs.failurePoint.absoluteCurvature,
  );
});

test("moment-curvature identifies concrete as the first yield event under compression", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createSection();
  const model = new ReinforcedConcreteSectionModel({
    id: "rc-moment-curvature-concrete-yield-01",
    section,
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    analysisType: "moment-curvature",
    mesh: {
      targetFiberCount: 120,
    },
    solver: {
      tolerance: 1e-6,
      maxIterations: 100,
    },
    actions: {
      nEd: -800000,
    },
    analysisSettings: {
      compressedEdge: "top",
      pointCount: 41,
    },
    units,
  });
  const result = new ReinforcedConcreteSectionApplication().run({ model });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.firstYieldType, "concrete-compression-peak");
  assert.equal(
    result.outputs.firstYieldPoint.firstYieldState.eventMaterial,
    "concrete",
  );
  assert.equal(
    result.outputs.firstYieldPoint.firstYieldState.eventMode,
    "peak-compression",
  );
  assert.ok(
    Math.abs(
      result.outputs.firstYieldPoint.extremes.concreteCompressionEdge.strain +
        0.002,
    ) < 1e-8,
  );
});

test("moment-curvature identifies compression-steel yielding when it occurs first", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createSection();
  const model = new ReinforcedConcreteSectionModel({
    id: "rc-moment-curvature-steel-compression-yield-01",
    section,
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    analysisType: "moment-curvature",
    mesh: {
      targetFiberCount: 120,
    },
    solver: {
      tolerance: 1e-6,
      maxIterations: 100,
    },
    actions: {
      nEd: -2000000,
    },
    analysisSettings: {
      compressedEdge: "top",
      pointCount: 41,
    },
    units,
  });
  const result = new ReinforcedConcreteSectionApplication().run({ model });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.firstYieldType, "steel-compression-yield");
  assert.equal(
    result.outputs.firstYieldPoint.firstYieldState.eventMode,
    "yield-compression",
  );
});

test("moment-curvature workflow can use triangular concrete and hardening steel laws", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createSection();
  const model = new ReinforcedConcreteSectionModel({
    id: "rc-moment-curvature-hardening-01",
    section,
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    analysisType: "moment-curvature",
    mesh: {
      targetFiberCount: 120,
    },
    solver: {
      tolerance: 1e-6,
      maxIterations: 100,
    },
    actions: {
      nEd: 0,
    },
    analysisSettings: {
      concreteLawType: "triangular-rectangle",
      steelLawType: "elastic-plastic-hardening",
      compressedEdge: "top",
      pointCount: 12,
      curvatureMax: 0.00003,
    },
    units,
  });
  const result = new ReinforcedConcreteSectionApplication().run({ model });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.firstYieldReached, true);
  assert.ok(result.outputs.ntc2018Ductility.mPrimeYd > 0);
  assert.ok(result.outputs.points.at(-1).Mx > 0);
});
