import test from "node:test";
import assert from "node:assert/strict";

import {
  createNTC2018BeamCombinations,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  CrackedSectionDeflectionAnalysis,
  RectangularSection,
  ReinforcedConcreteSection,
  ReinforcementBar,
  runScaRcDeflectionAnalysis,
  SectionMomentCurvatureCurve,
  SingleBeamAnalysis,
} from "../src/index.js";
import { createRcElasticBeamReportModel } from "../examples/beam-report-fixtures.js";
import { createFixedFixedRcDeflectionExample } from "../examples/rc-deflection-report-common.js";

function analyzeUniformServiceLoad({
  model = createRcElasticBeamReportModel(),
  value,
  section = model.section,
  types = ["SLE_RARE"],
  serviceability = {},
  output = { includePointDetails: true },
}) {
  const loads = [{ ...model.beamInput.loads[0], value }];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types,
    idPrefix: `rc-mcr-${Math.abs(value)}`,
  });
  const beamInput = { ...model.beamInput, loads, combinations };
  const analysisResult = new SingleBeamAnalysis().analyze(beamInput);

  return new CrackedSectionDeflectionAnalysis().analyze({
    analysisResult,
    section,
    concreteMaterial: section.concreteMaterial,
    reinforcementMaterial: section.reinforcementMaterial,
    serviceability,
    output,
  });
}

function createScaDefaultDeflectionSection() {
  const units = { force: "N", length: "mm" };
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
  const reinforcementBars = [
    ...[40, 150, 260].map(
      (z) =>
        new ReinforcementBar({
          diameter: 16,
          material: reinforcementMaterial,
          y: 40,
          z,
          units,
        }),
    ),
    ...[40, 260].map(
      (z) =>
        new ReinforcementBar({
          diameter: 14,
          material: reinforcementMaterial,
          y: 460,
          z,
          units,
        }),
    ),
  ];
  const section = new ReinforcedConcreteSection({
    concreteSection,
    reinforcementBars,
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  return { section, concreteMaterial, reinforcementMaterial, units };
}

function transformedBeamSectionProvider({
  section,
  reinforcementMaterial,
  modularRatio,
  units,
}) {
  const concrete = section.concreteSection;
  const transformedBars = section.getReinforcementBars().map((bar) => ({
    area: modularRatio * bar.area,
    y: bar.y,
  }));
  const area =
    concrete.area +
    transformedBars.reduce((sum, bar) => sum + bar.area, 0);
  const centroid =
    (concrete.area * concrete.centroidY +
      transformedBars.reduce((sum, bar) => sum + bar.area * bar.y, 0)) /
    area;
  const inertia =
    concrete.inertiaY +
    concrete.area * (concrete.centroidY - centroid) ** 2 +
    transformedBars.reduce(
      (sum, bar) => sum + bar.area * (bar.y - centroid) ** 2,
      0,
    );
  const concreteModulus =
    reinforcementMaterial.elasticModulus / modularRatio;

  return {
    getElasticBeamProperties() {
      return {
        axialRigidity: concreteModulus * area,
        flexuralRigidity: concreteModulus * inertia,
        units,
      };
    },
  };
}

test("RC deflection remains entirely uncracked below transformed-section Mcr", () => {
  const result = analyzeUniformServiceLoad({ value: -12 });
  const combination = result.outputs.combinations[0];
  const maxMoment = Math.max(
    ...combination.points.map((point) => Math.abs(point.mEd)),
  );

  assert.ok(Math.abs(maxMoment - 37.5e6) <= 1e-6);
  assert.ok(combination.mcr > maxMoment);
  assert.equal(combination.crackedPointCount, 0);
  assert.equal(combination.maxZeta, 0);
  assert.equal(result.outputs.performance.serviceSolveCount, 0);
  assert.ok(combination.points.every((point) => point.cracked === false));
  assert.ok(
    combination.points.every(
      (point) => point.curvature === point.uncrackedCurvature,
    ),
  );
  assert.equal(combination.mcr, combination.mcrPositive);
  assert.equal(combination.mcrPositive, combination.mcrNegative);
});

test("RC deflection cracks the central span above transformed-section Mcr", () => {
  const result = analyzeUniformServiceLoad({ value: -14 });
  const combination = result.outputs.combinations[0];
  const midspan = combination.points.reduce((selected, point) =>
    Math.abs(point.station - 2.5) < Math.abs(selected.station - 2.5)
      ? point
      : selected,
  );

  assert.ok(Math.abs(midspan.mEd) > combination.mcrPositive);
  assert.equal(midspan.cracked, true);
  assert.ok(midspan.zeta > 0);
  assert.ok(combination.crackedPointCount > 0);
  assert.ok(result.outputs.performance.serviceSolveCount > 0);
});

test("RC deflection selects distinct positive and negative Mcr thresholds for asymmetric reinforcement", () => {
  const model = createRcElasticBeamReportModel();
  const bars = model.section.getReinforcementBars();
  const asymmetricSection = new ReinforcedConcreteSection({
    name: "RC asymmetric reinforcement",
    concreteSection: model.section.concreteSection,
    reinforcementBars: [bars[0], bars[2], bars[3]],
    concreteMaterial: model.section.concreteMaterial,
    reinforcementMaterial: model.section.reinforcementMaterial,
    referenceModularRatio: model.section.referenceModularRatio,
    units: model.section.units,
  });
  const positive = analyzeUniformServiceLoad({
    model,
    value: -12,
    section: asymmetricSection,
  }).outputs.combinations[0];
  const negative = analyzeUniformServiceLoad({
    model,
    value: 12,
    section: asymmetricSection,
  }).outputs.combinations[0];
  const positiveMidspan = positive.points.find(
    (point) => Math.abs(point.station - 2.5) <= 1e-9,
  );
  const negativeMidspan = negative.points.find(
    (point) => Math.abs(point.station - 2.5) <= 1e-9,
  );

  assert.notEqual(positive.mcrPositive, positive.mcrNegative);
  assert.equal(positiveMidspan.mcr, positive.mcrPositive);
  assert.equal(negativeMidspan.mcr, negative.mcrNegative);
  assert.ok(positiveMidspan.mEd > 0);
  assert.ok(negativeMidspan.mEd < 0);
  assert.equal(positiveMidspan.cracked, true);
  assert.equal(negativeMidspan.cracked, false);
  assert.ok(positive.crackedPointCount > 0);
  assert.equal(negative.crackedPointCount, 0);
});

test("RC long-term Mcr uses n effective equal to n times one plus phi", () => {
  const phi = 2;
  const result = analyzeUniformServiceLoad({
    value: -8,
    types: ["SLE_RARE", "SLE_QUASI_PERMANENT"],
    serviceability: { deflection: { creepCoefficient: phi } },
  });
  const rare = result.outputs.combinations.find(
    (combination) => combination.combinationType === "SLE_RARE",
  );
  const longTerm = result.outputs.combinations.find(
    (combination) =>
      combination.combinationType === "SLE_QUASI_PERMANENT",
  );
  const expectedLongTermMcr =
    (createRcElasticBeamReportModel().section.concreteMaterial.fctm *
      longTerm.grossInertia) /
    longTerm.grossCentroid;

  assert.equal(longTerm.modularRatio, rare.baseModularRatio * (1 + phi));
  assert.ok(
    Math.abs(longTerm.mcrPositive - expectedLongTermMcr) / expectedLongTermMcr <
      1e-12,
  );
  assert.notEqual(longTerm.mcrPositive, rare.mcrPositive);
});

test("RC moment-curvature table keeps the exact Mcr point uncracked", () => {
  const model = createRcElasticBeamReportModel();
  const result = analyzeUniformServiceLoad({
    model,
    value: -8,
    types: ["SLE_QUASI_PERMANENT"],
    serviceability: { deflection: { creepCoefficient: 2 } },
  });
  const combination = result.outputs.combinations[0];
  const effectiveModularRatio = combination.modularRatio;
  const curve = new SectionMomentCurvatureCurve({
    section: model.section,
    reinforcementMaterial: model.section.reinforcementMaterial,
    effectiveModularRatio,
    mcrPositive: combination.mcrPositive,
    mcrNegative: combination.mcrNegative,
    grossInertia: combination.grossInertia,
    concreteModulus:
      model.section.reinforcementMaterial.elasticModulus /
      effectiveModularRatio,
    beta: 0.5,
    momentSamples: 20,
    initialMaxMoment: combination.mcrPositive * 2,
  });
  const atThreshold = curve.lookupState(combination.mcrPositive);
  const immediatelyAbove = curve.lookupState(
    combination.mcrPositive * (1 + 1e-12),
  );

  assert.equal(atThreshold.cracked, false);
  assert.equal(atThreshold.zeta, 0);
  assert.equal(atThreshold.eiSec, curve.grossEI);
  assert.equal(immediatelyAbove.cracked, true);
  assert.ok(immediatelyAbove.zeta > 0);
  assert.ok(immediatelyAbove.zeta < 1e-3);
  assert.ok(immediatelyAbove.eiSec > curve.grossEI * 0.999);
});

test("RC cracked deflection analysis integrates SLE curvatures with default creep", () => {
  const model = createRcElasticBeamReportModel();
  const analysisResult = new SingleBeamAnalysis().analyze(model.beamInput);
  const result = new CrackedSectionDeflectionAnalysis().analyze({
    beamId: model.id,
    analysisResult,
    section: model.section,
    concreteMaterial: model.section.concreteMaterial,
    reinforcementMaterial: model.section.reinforcementMaterial,
  });

  assert.equal(result.applicationId, "rc-cracked-deflection");
  assert.equal(result.status, "ok");
  assert.ok(result.checks.some((check) => check.id === "rc-sle-deflection-curvature"));
  assert.ok(result.checks.some((check) => check.id === "rc-sle-deflection-slenderness"));
  assert.equal(result.outputs.creepCoefficient, 2);
  assert.equal(result.outputs.includeShrinkage, false);
  assert.equal(result.outputs.simplifiedSlenderness.metadata.system, "simple_span");
  assert.ok(
    result.outputs.combinations.some(
      (combination) =>
        combination.combinationType === "SLE_QUASI_PERMANENT" &&
        combination.creepCoefficient === 2 &&
        combination.baseModularRatio === 15,
    ),
  );
});

test("RC cracked deflection validation applies configurable creep and excludes shrinkage", () => {
  const model = createRcElasticBeamReportModel();
  const analysisResult = new SingleBeamAnalysis().analyze(model.beamInput);
  const immediateResult = new CrackedSectionDeflectionAnalysis().analyze({
    beamId: model.id,
    analysisResult,
    section: model.section,
    concreteMaterial: model.section.concreteMaterial,
    reinforcementMaterial: model.section.reinforcementMaterial,
    serviceability: {
      deflection: {
        creepCoefficient: 0,
      },
    },
  });
  const longTermResult = new CrackedSectionDeflectionAnalysis().analyze({
    beamId: model.id,
    analysisResult,
    section: model.section,
    concreteMaterial: model.section.concreteMaterial,
    reinforcementMaterial: model.section.reinforcementMaterial,
    serviceability: {
      deflection: {
        creepCoefficient: 3,
        includeShrinkage: true,
      },
    },
  });
  const immediateQuasiPermanent =
    immediateResult.outputs.combinations.find(
      (combination) => combination.combinationType === "SLE_QUASI_PERMANENT",
    );
  const longTermQuasiPermanent =
    longTermResult.outputs.combinations.find(
      (combination) => combination.combinationType === "SLE_QUASI_PERMANENT",
    );

  assert.equal(immediateResult.status, "ok");
  assert.equal(longTermResult.status, "ok");
  assert.equal(immediateQuasiPermanent.creepCoefficient, 0);
  assert.equal(longTermQuasiPermanent.creepCoefficient, 3);
  assert.ok(
    longTermQuasiPermanent.maxAbsDeflection >
      immediateQuasiPermanent.maxAbsDeflection,
  );
  assert.equal(longTermResult.outputs.includeShrinkage, false);
  assert.ok(
    longTermResult.warnings.some((warning) =>
      warning.includes("Shrinkage curvature is intentionally excluded"),
    ),
  );
});

test("RC cracked deflection production profile limits station solves and output payload", () => {
  const model = createRcElasticBeamReportModel();
  const analysisResult = new SingleBeamAnalysis().analyze(model.beamInput);
  const result = new CrackedSectionDeflectionAnalysis().analyze({
    beamId: model.id,
    analysisResult,
    section: model.section,
    concreteMaterial: model.section.concreteMaterial,
    reinforcementMaterial: model.section.reinforcementMaterial,
    performanceProfile: "production",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.performance.profile, "production");
  assert.equal(result.outputs.performance.maxStationsPerCombination, 33);
  assert.ok(result.outputs.performance.inputStationCount >= result.outputs.performance.analyzedStationCount);
  assert.ok(result.outputs.performance.returnedPointCount >= result.outputs.combinations.length);

  for (const combination of result.outputs.combinations) {
    assert.ok(combination.analyzedPointCount <= 33);
    assert.ok(combination.returnedPointCount <= 65);
    assert.equal(combination.points.length, combination.returnedPointCount);
  }
});

test("RC hyperstatic cracked deflection iterates fixed-fixed stiffness redistribution", () => {
  const model = createFixedFixedRcDeflectionExample();
  const heavyLoads = model.loads.map((load) => ({
    ...load,
    value: load.value * 5,
  }));
  const combinations = createNTC2018BeamCombinations({
    loads: heavyLoads,
    types: ["SLE_RARE", "SLE_FREQUENT", "SLE_QUASI_PERMANENT"],
    idPrefix: "rc-fixed-fixed-deflection",
  });
  const beamInput = {
    ...model.beamInput,
    loads: heavyLoads,
    combinations,
  };
  const analysisResult = new SingleBeamAnalysis().analyze(beamInput);
  const commonInput = {
    beamId: model.id,
    analysisResult,
    section: model.section,
    concreteMaterial: model.concreteMaterial,
    reinforcementMaterial: model.reinforcementMaterial,
    serviceability: model.serviceability,
    mesh: { targetFiberCount: 80 },
    solver: { tolerance: 1e-2, maxIterations: 50 },
  };
  const linearMomentResult = new CrackedSectionDeflectionAnalysis().analyze(
    commonInput,
  );
  const hyperstaticResult = new CrackedSectionDeflectionAnalysis().analyze({
    ...commonInput,
    beamModel: beamInput,
  });
  const rareLinear = linearMomentResult.outputs.combinations.find(
    (combination) => combination.combinationType === "SLE_RARE",
  );
  const rareHyperstatic = hyperstaticResult.outputs.combinations.find(
    (combination) => combination.combinationType === "SLE_RARE",
  );

  assert.equal(hyperstaticResult.status, "ok");
  assert.equal(rareHyperstatic.hyperstatic.active, true);
  assert.equal(rareHyperstatic.hyperstatic.converged, true);
  assert.ok(rareHyperstatic.hyperstatic.iterations > 0);
  assert.ok(rareHyperstatic.crackedPointCount > 0);
  assert.ok(
    hyperstaticResult.assumptions.some((assumption) =>
      assumption.includes("Hyperstatic beams use iterative"),
    ),
  );
  assert.equal(hyperstaticResult.outputs.performance.serviceSolveCount, 0);
  assert.equal(hyperstaticResult.outputs.performance.curveBuildCount, 2);
  assert.equal(hyperstaticResult.outputs.performance.curveCacheHitCount, 1);
  assert.ok(
    hyperstaticResult.outputs.performance.curveSectionSolveCount > 0,
  );
  assert.ok(hyperstaticResult.outputs.performance.curveLookupCount > 0);
  assert.ok(hyperstaticResult.outputs.performance.femSolveCount > 0);
  assert.ok(
    hyperstaticResult.outputs.performance.hyperstaticIterationElapsedMs >= 0,
  );
  assert.ok(rareHyperstatic.maxAbsDeflection > rareLinear.maxAbsDeflection);
});

test("RC hyperstatic deflection keeps gross EI and diagnostics below both Mcr thresholds", () => {
  const model = createFixedFixedRcDeflectionExample();
  const loads = model.loads.map((load) => ({
    ...load,
    value: load.value * 1.9,
  }));
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["SLE_QUASI_PERMANENT"],
    idPrefix: "rc-hyperstatic-uncracked",
  });
  const beamModel = { ...model.beamInput, loads, combinations };
  const analysisResult = new SingleBeamAnalysis().analyze(beamModel);
  const result = new CrackedSectionDeflectionAnalysis().analyze({
    analysisResult,
    section: model.section,
    concreteMaterial: model.concreteMaterial,
    reinforcementMaterial: model.reinforcementMaterial,
    serviceability: model.serviceability,
    beamModel,
  });
  const combination = result.outputs.combinations[0];

  assert.equal(combination.hyperstatic.active, true);
  assert.equal(combination.hyperstatic.converged, true);
  assert.equal(combination.crackedPointCount, 0);
  assert.equal(combination.maxZeta, 0);
  assert.ok(combination.points.every((point) => point.cracked === false));
  assert.equal(result.outputs.performance.serviceSolveCount, 0);
  assert.equal(result.outputs.performance.curveSectionSolveCount, 0);
});

test("RC adaptive relaxation converges for the SCA default three-support beam at q 20", () => {
  const {
    section,
    concreteMaterial,
    reinforcementMaterial,
    units,
  } = createScaDefaultDeflectionSection();
  const effectiveModularRatio = 15 * (1 + 2);
  const beamModel = {
    units: { force: "kN", length: "m" },
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
    },
    sectionProvider: transformedBeamSectionProvider({
      section,
      reinforcementMaterial,
      modularRatio: effectiveModularRatio,
      units,
    }),
    supports: [
      { id: "left", position: 0, type: "hinge" },
      { id: "middle", position: 5, type: "roller" },
      { id: "right", position: 10, type: "roller" },
    ],
    loads: [
      {
        id: "q",
        loadCaseId: "q",
        type: "uniform",
        value: -20,
        direction: "global-y",
        from: 0,
        to: 10,
      },
    ],
    combinations: [
      {
        id: "sca-q20",
        combinationType: "SLE_QUASI_PERMANENT",
        limitState: "SLE",
        serviceCombination: "quasiPermanent",
        factors: { q: 1 },
        metadata: {
          limitState: "SLE",
          combinationType: "SLE_QUASI_PERMANENT",
        },
      },
    ],
    discretization: { elementCount: 32 },
    verificationStations: { count: 33, mode: "combined" },
  };
  const analysisResult = new SingleBeamAnalysis().analyze(beamModel);
  const result = new CrackedSectionDeflectionAnalysis().analyze({
    analysisResult,
    beamModel,
    section,
    concreteMaterial,
    reinforcementMaterial,
    mesh: { targetFiberCount: 200 },
    performanceProfile: "interactive",
    serviceability: {
      deflection: {
        modularRatio: 15,
        creepCoefficient: 2,
        betaShortTerm: 1,
        betaLongTerm: 0.5,
        maxStationsPerCombination: 33,
        maxOutputPointsPerCombination: 33,
      },
    },
  });
  const combination = result.outputs.combinations[0];

  assert.equal(combination.hyperstatic.converged, true);
  assert.ok(combination.hyperstatic.iterations < 50);
  assert.ok(combination.hyperstatic.adaptiveAdjustmentCount > 0);
  assert.ok(
    combination.hyperstatic.effectiveRelaxationFactor > 0 &&
      combination.hyperstatic.effectiveRelaxationFactor <= 0.5,
  );
  assert.ok(combination.crackedPointCount > 0);
  assert.equal(
    result.warnings.some((warning) => warning.includes("did not converge")),
    false,
  );
});

test("RC hyperstatic exact Mcr threshold remains stable near cracking", () => {
  const model = createFixedFixedRcDeflectionExample();
  const loads = model.loads.map((load) => ({
    ...load,
    value: load.value * 2.8,
  }));
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["SLE_QUASI_PERMANENT"],
    idPrefix: "rc-near-mcr-relaxation",
  });
  const beamModel = {
    ...model.beamInput,
    loads,
    combinations,
    discretization: {
      ...model.beamInput.discretization,
      elementCount: 20,
    },
  };
  const analysisResult = new SingleBeamAnalysis().analyze(beamModel);
  const analyze = (relaxationFactor) =>
    new CrackedSectionDeflectionAnalysis().analyze({
      beamId: `rc-near-mcr-${relaxationFactor}`,
      analysisResult,
      section: model.section,
      concreteMaterial: model.concreteMaterial,
      reinforcementMaterial: model.reinforcementMaterial,
      serviceability: {
        ...model.serviceability,
        deflection: {
          ...(model.serviceability?.deflection ?? {}),
          relaxationFactor,
          maxIterations: 50,
        },
      },
      mesh: { targetFiberCount: 80 },
      beamModel,
    });
  const unrelaxed = analyze(1).outputs.combinations[0];
  const relaxed = analyze(0.5).outputs.combinations[0];

  assert.equal(unrelaxed.hyperstatic.converged, true);
  assert.equal(relaxed.hyperstatic.converged, true);
  assert.ok(relaxed.hyperstatic.iterations < 20);
  assert.equal(relaxed.hyperstatic.relaxationFactor, 0.5);
  assert.ok(relaxed.crackedPointCount > 0);
  assert.ok(relaxed.maxZeta > 0 && relaxed.maxZeta < 1);
});

test("RC hyperstatic cracked deflection keeps continuous beam support deflections compatible", () => {
  const model = createFixedFixedRcDeflectionExample();
  const loads = model.loads.map((load) => ({
    ...load,
    value: load.value * 4,
  }));
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["SLE_QUASI_PERMANENT"],
    idPrefix: "rc-continuous-deflection",
  });
  const beamInput = {
    ...model.beamInput,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
    },
    supports: [
      { id: "left", position: 0, type: "hinge" },
      { id: "middle", position: 5, type: "roller" },
      { id: "right", position: 10, type: "roller" },
    ],
    loads,
    combinations,
    discretization: {
      elementCount: 40,
      stations: [2.5, 5, 7.5],
    },
  };
  const analysisResult = new SingleBeamAnalysis().analyze(beamInput);
  const result = new CrackedSectionDeflectionAnalysis().analyze({
    beamId: "rc-continuous-deflection",
    analysisResult,
    section: model.section,
    concreteMaterial: model.concreteMaterial,
    reinforcementMaterial: model.reinforcementMaterial,
    serviceability: model.serviceability,
    mesh: { targetFiberCount: 80 },
    beamModel: beamInput,
    output: { includePointDetails: true },
  });
  const combination = result.outputs.combinations.find(
    (item) => item.combinationType === "SLE_QUASI_PERMANENT",
  );
  const middleSupport = combination.points.find(
    (point) => Math.abs(point.station - 5) <= 1e-9,
  );

  assert.equal(result.status, "ok");
  assert.ok(middleSupport);
  assert.ok(Math.abs(middleSupport.deflection) <= 1e-9);
});

test("RC hyperstatic cracked deflection supports unequal spans with ratio 1 to 1.5", () => {
  const model = createFixedFixedRcDeflectionExample();
  const loads = model.loads.map((load) => ({
    ...load,
    value: load.value * 4,
  }));
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["SLE_QUASI_PERMANENT"],
    idPrefix: "rc-continuous-unequal-deflection",
  });
  const beamInput = {
    ...model.beamInput,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 12.5, y: 0 },
    },
    supports: [
      { id: "left", position: 0, type: "hinge" },
      { id: "middle", position: 5, type: "roller" },
      { id: "right", position: 12.5, type: "roller" },
    ],
    loads,
    combinations,
    discretization: {
      elementCount: 50,
      stations: [2.5, 5, 8.75],
    },
  };
  const analysisResult = new SingleBeamAnalysis().analyze(beamInput);
  const result = new CrackedSectionDeflectionAnalysis().analyze({
    beamId: "rc-continuous-unequal-deflection",
    analysisResult,
    section: model.section,
    concreteMaterial: model.concreteMaterial,
    reinforcementMaterial: model.reinforcementMaterial,
    serviceability: model.serviceability,
    mesh: { targetFiberCount: 80 },
    beamModel: beamInput,
    output: { includePointDetails: true },
  });
  const combination = result.outputs.combinations.find(
    (item) => item.combinationType === "SLE_QUASI_PERMANENT",
  );
  const supportDeflections = [0, 5, 12.5].map((station) =>
    combination.points.find(
      (point) => Math.abs(point.station - station) <= 1e-9,
    ),
  );

  assert.notEqual(result.status, "not-implemented");
  assert.equal(combination.hyperstatic.active, true);
  assert.equal(combination.hyperstatic.converged, true);
  assert.ok(supportDeflections.every(Boolean));
  assert.ok(
    supportDeflections.every(
      (point) => Math.abs(point.deflection) <= 1e-9,
    ),
  );
  assert.ok(Number.isFinite(combination.maxAbsDeflection));
});

test("RC hyperstatic deflection uses distinct M-kappa curves for variable axial force", () => {
  const model = createFixedFixedRcDeflectionExample();
  const bendingLoads = model.loads.map((load) => ({
    ...load,
    value: load.value * 1.5,
  }));
  const axialPointLoad = {
    ...model.loads[0],
    id: "axial-midspan",
    type: "point",
    position: 2.5,
    direction: "global-x",
    value: 100,
  };
  const loads = [...bendingLoads, axialPointLoad];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["SLE_QUASI_PERMANENT"],
    idPrefix: "rc-variable-axial-force",
  });
  const beamModel = {
    ...model.beamInput,
    loads,
    combinations,
    discretization: {
      ...model.beamInput.discretization,
      elementCount: 20,
      stations: [2.5],
    },
  };
  const analysisResult = new SingleBeamAnalysis().analyze(beamModel);
  const result = new CrackedSectionDeflectionAnalysis().analyze({
    beamId: "rc-variable-axial-force",
    analysisResult,
    section: model.section,
    concreteMaterial: model.concreteMaterial,
    reinforcementMaterial: model.reinforcementMaterial,
    serviceability: model.serviceability,
    mesh: { targetFiberCount: 40 },
    beamModel,
    output: { includePointDetails: true },
  });
  const combination = result.outputs.combinations[0];
  const axialForces = new Set(
    combination.points.map((point) => Math.round(point.nEd)),
  );

  assert.equal(combination.hyperstatic.converged, true);
  assert.equal(combination.hyperstatic.axialForceCurveCount, 2);
  assert.equal(combination.hyperstatic.axialForceCurveTolerance, 1000);
  assert.ok([...axialForces].some((value) => value > 0));
  assert.ok([...axialForces].some((value) => value < 0));
  assert.ok(
    result.assumptions.some((assumption) =>
      assumption.includes("Variable axial force"),
    ),
  );
});

test("SCA deflection adapter builds a UI DTO from span and service moment", () => {
  const model = createRcElasticBeamReportModel();
  const result = runScaRcDeflectionAnalysis({
    sectionBuild: {
      section: model.section,
      materials: {
        concreteMaterial: model.section.concreteMaterial,
        reinforcementMaterial: model.section.reinforcementMaterial,
      },
    },
    analysisState: {
      serviceCombination: "quasiPermanent",
      deflectionSpanM: "5",
      deflectionMEdKnm: "120",
      deflectionStructuralSystem: "simpleBeam",
      deflectionLimitRatio: "250",
      modularRatio: "15",
    },
  });

  assert.equal(result.kind, "serviceDeflection");
  assert.equal(result.applicationId, "rc-cracked-deflection");
  assert.ok(["ok", "not-verified"].includes(result.status));
  assert.equal(result.outputs.source, "synthetic-service-moment-profile");
  assert.equal(result.outputs.performance.profile, "interactive");
  assert.equal(result.outputs.performance.maxStationsPerCombination, 17);
  assert.ok(result.outputs.maxAbsDeflection > 0);
  assert.ok(result.outputs.deflectionLimit > 0);
  assert.ok(result.outputs.points.length > 2);
  assert.ok(result.outputs.points.length <= 33);
  assert.equal(result.outputs.combination.combinationType, "SLE_QUASI_PERMANENT");
  assert.equal(result.outputs.hyperstatic.active, false);
});
