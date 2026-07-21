import {
  GeotechnicalDesignSituation,
  GroundAnchorAnalysis,
  GroundAnchorDesignScenario,
  GroundAnchorModel,
  GroundModel,
  GroundSection2D,
  SoilMaterial,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });
const reference =
  "FHWA GEC 4, FHWA-IF-99-015 (1999), sections 5.3, 6.4 and 7.4.5";

function readPath(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function evaluateCase(definition) {
  const output = definition.evaluate();
  const checks = definition.expectations.map((expectation) => {
    const actual = readPath(output, expectation.path);
    const passed = Number.isFinite(actual) &&
      Math.abs(actual - expectation.expected) <= expectation.tolerance;
    return {
      id: expectation.id,
      actual,
      expected: expectation.expected,
      tolerance: expectation.tolerance,
      units: expectation.units ?? null,
      status: passed ? "ok" : "failed",
    };
  });
  return {
    id: definition.id,
    title: definition.title,
    source: definition.source,
    sourceKind: definition.sourceKind,
    assumptions: [...definition.assumptions],
    status: checks.every(({ status }) => status === "ok") ? "ok" : "failed",
    checks,
  };
}

function modelFixture({ withTest = false } = {}) {
  const materials = ["upper", "lower"].map((id) => new SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk: 20, saturated: 20 },
    parameterSets: [{
      id: `${id}-characteristic`,
      basis: "characteristic",
      drainage: "drained",
      strength: {
        model: "mohr-coulomb-effective",
        frictionAngle: 30,
        cohesion: 0,
      },
      provenance: { source: "validation assigned material" },
    }],
    angleUnits: "deg",
    units,
  }));
  const section = new GroundSection2D({
    id: "validation-anchor-section",
    surface: { points: [{ x: 0, z: 5 }, { x: 30, z: 5 }] },
    zones: [{
      id: "upper-zone",
      materialId: "upper",
      polygon: [
        { x: 0, z: -4 },
        { x: 30, z: -4 },
        { x: 30, z: 5 },
        { x: 0, z: 5 },
      ],
    }, {
      id: "lower-zone",
      materialId: "lower",
      polygon: [
        { x: 0, z: -15 },
        { x: 30, z: -15 },
        { x: 30, z: -4 },
        { x: 0, z: -4 },
      ],
    }],
    units,
  });
  const groundModel = new GroundModel({
    id: "validation-anchor-ground",
    materials,
    sections: [section],
    defaultSectionId: section.id,
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "validation-anchor-sls",
    groundModel,
    limitState: "SLS",
    drainageCondition: "drained",
    sectionId: section.id,
    units,
  });
  const anchor = new GroundAnchorModel({
    id: "validation-anchor",
    head: { x: 0, z: 0 },
    inclination: 30,
    freeLength: 6,
    bondLength: 6,
    horizontalSpacing: 2,
    groutBodyDiameter: 0.15,
    tendon: {
      type: "strand",
      steelArea: 0.001,
      elasticModulus: 200e6,
      specifiedMinimumTensileStrength: 1e6,
      provenance: { source: "validation assigned tendon" },
    },
    corrosionProtection: {
      class: "I",
      details: {
        anchorage: { trumpet: true, exposed: false },
        unbondedLength: {
          system: "encapsulated-grout-filled-strand-sheaths",
        },
        bondLength: { system: "grout-filled-encapsulation" },
      },
      provenance: { source: "validation assigned corrosion class" },
    },
    anchorage: {
      tensileCapacity: {
        value: 1000,
        provenance: { source: "validation assigned capacity" },
      },
      tendonGroutBondCapacity: {
        value: 1000,
        provenance: { source: "validation assigned capacity" },
      },
    },
    units,
  });
  const scenario = new GroundAnchorDesignScenario({
    id: "validation-anchor-scenario",
    demand: {
      source: "assigned-horizontal-line-load",
      horizontalLineLoad: 100,
      provenance: { source: "validation assigned wall line reaction" },
    },
    lockOffLoadFactor: 0.75,
    testLoadFactor: 1.33,
    criticalFailureSurface: {
      model: "rankine-active-wedge",
      frictionAngle: 30,
      excavationBaseElevation: -5,
      wallHeight: 5,
      provenance: { source: reference },
    },
    bondResistanceByZone: {
      "upper-zone": {
        model: "fhwa-presumptive",
        catalogId: "sand-medium-dense",
      },
      "lower-zone": {
        model: "fhwa-presumptive",
        catalogId: "sandstone",
      },
    },
    corrosionEnvironment: {
      serviceLife: "permanent",
      aggressivity: "non-aggressive",
      consequencesOfFailure: "serious",
      higherProtectionCost: "significant",
      provenance: { source: reference },
    },
    testing: withTest ? {
      jackLength: 0.4,
      records: [{
        id: "validation-performance-test",
        type: "performance",
        alignmentLoad: 10,
        testLoad: 310,
        initialLiftOffLoad: 173.2,
        elasticMovementAtTestLoad: 0.008,
        holds: [{
          load: 310,
          observations: [
            { timeMinutes: 1, movement: 0.0100 },
            { timeMinutes: 6, movement: 0.0104 },
            { timeMinutes: 10, movement: 0.0108 },
          ],
        }],
        provenance: { source: "validation assigned test readings" },
      }],
    } : { jackLength: 0, records: [] },
    units,
  });
  const result = new GroundAnchorAnalysis().analyze({
    groundModel,
    designSituation,
    anchor,
    scenario,
    units,
  });
  if (result.status !== "ok") {
    throw new Error(`Ground-anchor validation analysis failed: ${result.summary}`);
  }
  return result.outputs;
}

function cases() {
  return [{
    id: "ground-anchor-stratified-bond",
    title: "Two-zone bond capacity from exact line intersections",
    source: reference,
    sourceKind: "independent-line-intersection-and-capacity-summation",
    assumptions: [
      "The 30-degree anchor crosses z=-4 at 8 m from its head.",
      "The six-metre bond therefore contains 2 m of sand and 4 m of rock.",
    ],
    evaluate: () => modelFixture(),
    expectations: [
      {
        id: "upper-zone-length",
        path: "capacity.groundBond.contributions.0.length",
        expected: 2,
        tolerance: 1e-12,
        units: "m",
      },
      {
        id: "lower-zone-length",
        path: "capacity.groundBond.contributions.1.length",
        expected: 4,
        tolerance: 1e-12,
        units: "m",
      },
      {
        id: "allowable-bond-capacity",
        path: "capacity.groundBond.allowableCapacity",
        expected: 145 + 440 * 4 / 3,
        tolerance: 1e-10,
        units: "kN",
      },
    ],
  }, {
    id: "ground-anchor-wall-action-resolution",
    title: "Horizontal wall line action resolved into one inclined anchor",
    source: reference,
    sourceKind: "independent-force-resolution",
    assumptions: [
      "Horizontal line reaction is 100 kN/m, spacing is 2 m and inclination is 30 degrees.",
    ],
    evaluate: () => modelFixture(),
    expectations: [
      {
        id: "horizontal-force",
        path: "demand.horizontalForcePerAnchor",
        expected: 200,
        tolerance: 1e-12,
        units: "kN",
      },
      {
        id: "tendon-force",
        path: "demand.designLoad",
        expected: 200 / Math.cos(Math.PI / 6),
        tolerance: 1e-12,
        units: "kN",
      },
      {
        id: "vertical-force",
        path: "demand.verticalForcePerAnchor",
        expected: 200 / Math.cos(Math.PI / 6) * 0.5,
        tolerance: 1e-12,
        units: "kN",
      },
    ],
  }, {
    id: "ground-anchor-apparent-free-length",
    title: "Apparent free length from independent tendon elongation equation",
    source: reference,
    sourceKind: "independent-equation-49-recalculation",
    assumptions: [
      "A=0.001 m2, E=200,000,000 kN/m2, elastic movement=0.008 m.",
      "Test load is 310 kN and alignment load is 10 kN.",
    ],
    evaluate: () => modelFixture({ withTest: true }),
    expectations: [{
      id: "apparent-free-length",
      path:
        "testing.records.0.apparentFreeLength.apparentFreeLength",
      expected: 0.001 * 200e6 * 0.008 / 300,
      tolerance: 1e-12,
      units: "m",
    }, {
      id: "creep-demand",
      path: "testing.records.0.checks.3.demand",
      expected: 0.0008,
      tolerance: 1e-12,
      units: "m",
    }],
  }];
}

export function runGeotechnicalGroundAnchorValidationCampaign() {
  const results = cases().map(evaluateCase);
  const passed = results.filter(({ status }) => status === "ok").length;
  return {
    id: "geotechnical-ground-anchor-validation-campaign",
    status: passed === results.length ? "ok" : "failed",
    caseCount: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export function formatGeotechnicalGroundAnchorValidationReport(campaign) {
  const lines = [
    "# Geotechnical ground-anchor validation campaign",
    "",
    `Status: ${campaign.status}`,
    `Cases: ${campaign.caseCount}; passed: ${campaign.passed}; failed: ${campaign.failed}`,
    "",
  ];
  for (const caseResult of campaign.results) {
    lines.push(
      `- ${caseResult.id}: ${caseResult.status} (${caseResult.source})`,
    );
  }
  return lines.join("\n");
}
