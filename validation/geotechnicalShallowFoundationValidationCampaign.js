import {
  GeotechnicalDesignSituation,
  GroundModel,
  GroundProfile,
  ShallowFoundationActionState,
  ShallowFoundationModel,
  ShallowFoundationUltimateLimitStateAnalysis,
  SoilMaterial,
  SoilStructureInterface,
  calculateShallowFoundationBearingCapacity,
  calculateShallowFoundationEffectiveGeometry,
  calculateShallowFoundationSlidingResistance,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });
const FOOT = 0.3048;
const KIP = 4.4482216152605;
const KSF = 47.8802589803358;
const KCF = 157.087463846246;
const usaceReference =
  "USACE EM 1110-1-1905 (31 July 2025), Chapter 5 and Appendix B, Examples B-3 and B-4";

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
    status: checks.every((check) => check.status === "ok") ? "ok" : "failed",
    checks,
  };
}

function material({ id, drainage, strength, unitWeight }) {
  return new SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk: unitWeight, saturated: unitWeight },
    parameterSets: [{
      id: `${id}-parameters`,
      basis: "representative",
      drainage,
      strength,
      provenance: { source: "published-validation-case" },
    }],
    angleUnits: "deg",
    units,
  });
}

function actions({ vertical, horizontalX = 0, momentY = 0 }) {
  return new ShallowFoundationActionState({
    id: "validation-actions",
    basis: "total",
    resultantScope: "total-at-foundation-base",
    actions: {
      verticalForce: vertical,
      horizontalX,
      momentY,
    },
    units,
  });
}

function exampleB3Output() {
  const sand = material({
    id: "b3-sand",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 34,
      cohesion: 0,
    },
    unitWeight: 0.135 * KCF,
  });
  const clay = material({
    id: "b3-clay",
    drainage: "undrained",
    strength: {
      model: "total-stress-undrained",
      undrainedShearStrength: 0.5 * KSF,
    },
    unitWeight: 0.135 * KCF,
  });
  const profile = new GroundProfile({
    id: "b3-profile",
    groundSurfaceElevation: 0,
    materials: [sand, clay],
    layers: [
      {
        id: "b3-upper",
        topElevation: 0,
        bottomElevation: -8 * FOOT,
        materialId: sand.id,
      },
      {
        id: "b3-lower",
        topElevation: -8 * FOOT,
        bottomElevation: -30 * FOOT,
        materialId: clay.id,
      },
    ],
    groundwater: {
      model: "hydrostatic",
      waterTableElevation: -13 * FOOT,
      waterUnitWeight: 9.81,
    },
    units,
  });
  const groundModel = new GroundModel({
    id: "b3-ground",
    materials: [sand, clay],
    profiles: [profile],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "b3-situation",
    groundModel,
    limitState: "ULS",
    drainageCondition: "mixed",
    profileId: profile.id,
    parameterSelection: {
      byLayer: {
        "b3-upper": sand.defaultParameterSetId,
        "b3-lower": clay.defaultParameterSetId,
      },
    },
    units,
  });
  const foundation = new ShallowFoundationModel({
    id: "b3-foundation",
    shape: "rectangular",
    geometry: { width: 7 * FOOT, length: 7 * FOOT },
    placement: { baseElevation: -2 * FOOT },
    units,
  });
  const output = new ShallowFoundationUltimateLimitStateAnalysis().analyze({
    groundModel,
    designSituation,
    foundation,
    actionState: actions({ vertical: 104.7 * KIP }),
    units,
  }).outputs;
  return {
    usace: output.bearing.methodCapacities["usace-meyerhof-2025"] / KSF,
    fhwa: output.bearing.methodCapacities["fhwa-vesic-2002"] / KSF,
    demand: output.bearing.demand / KSF,
    spreadRatio: output.bearing.punchThroughCandidates[0].spreadRatio,
  };
}

function exampleB4Output() {
  const clay = material({
    id: "b4-clay",
    drainage: "undrained",
    strength: {
      model: "total-stress-undrained",
      undrainedShearStrength: 0.85 * KSF,
    },
    unitWeight: 0.113 * KCF,
  });
  const foundation = new ShallowFoundationModel({
    id: "b4-foundation",
    shape: "rectangular",
    geometry: { width: 7 * FOOT, length: 7 * FOOT },
    placement: { baseElevation: -2 * FOOT },
    units,
  });
  const geometry = calculateShallowFoundationEffectiveGeometry({
    foundation,
    actionState: actions({ vertical: 94.7 * KIP }),
  });
  const common = {
    parameterSet: clay.getParameterSet(),
    effectiveGeometry: geometry,
    embedmentDepth: 2 * FOOT,
    surchargeStress: 0.226 * KSF,
    totalUnitWeightBelowBase: 0.113 * KCF,
  };
  return {
    usace: calculateShallowFoundationBearingCapacity({
      ...common,
      method: "usace-meyerhof-2025",
    }).ultimateGrossBearingPressure / KSF,
    fhwa: calculateShallowFoundationBearingCapacity({
      ...common,
      method: "fhwa-vesic-2002",
    }).ultimateGrossBearingPressure / KSF,
  };
}

function circularEffectiveAreaOutput() {
  const foundation = new ShallowFoundationModel({
    id: "circular-validation",
    shape: "circular",
    geometry: { diameter: 2 },
    placement: { baseElevation: -1 },
    units,
  });
  const geometry = calculateShallowFoundationEffectiveGeometry({
    foundation,
    actionState: actions({ vertical: 1000, momentY: 200 }),
  });
  const independentArea = 2 * (
    Math.acos(0.2) - 0.2 * Math.sqrt(1 - 0.2 ** 2)
  );
  return {
    areaResidual: geometry.effectiveArea - independentArea,
    area: geometry.effectiveArea,
  };
}

function slidingOutput() {
  const soil = material({
    id: "sliding-soil",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 30,
      cohesion: 10,
    },
    unitWeight: 20,
  });
  const foundation = new ShallowFoundationModel({
    id: "sliding-validation",
    shape: "rectangular",
    geometry: { width: 2, length: 3 },
    placement: { baseElevation: -1 },
    units,
  });
  const geometry = calculateShallowFoundationEffectiveGeometry({
    foundation,
    actionState: actions({ vertical: 1000, horizontalX: 200 }),
  });
  const interfaceModel = new SoilStructureInterface({
    id: "validation-interface",
    wallSurface: { typeId: "rough-cast-concrete" },
    parameterSets: [{
      id: "validation-interface-parameters",
      basis: "representative",
      model: "assigned-angle",
      frictionAngle: 20,
      angleUnits: "deg",
    }],
  });
  const calculated = calculateShallowFoundationSlidingResistance({
    parameterSet: soil.getParameterSet(),
    effectiveGeometry: geometry,
    porePressureAtBase: 5,
    interfaceModel,
    drainedAdhesionRatio: 0.5,
  });
  const independentResistance = (1000 - 5 * 6) *
    Math.tan(20 * Math.PI / 180) + 0.5 * 10 * 6;
  return {
    resistanceResidual: calculated.capacity - independentResistance,
    equilibriumResidual:
      calculated.factorOfSafety - independentResistance / 200,
  };
}

function validationCases() {
  return [
    {
      id: "usace-example-b3-layered-punch-through",
      title: "Drained sand over weak undrained clay",
      source: usaceReference,
      sourceKind: "independent-published-worked-example",
      assumptions: [
        "Published customary-unit inputs are converted to kN and m without changing the rounded reference targets.",
        "The layer boundary is placed from the published Hs=6 ft used in Equation 5-17.",
      ],
      evaluate: exampleB3Output,
      expectations: [
        { id: "usace-capacity", path: "usace", expected: 12.21, tolerance: 0.05, units: "ksf" },
        { id: "fhwa-capacity", path: "fhwa", expected: 11.56, tolerance: 0.05, units: "ksf" },
        { id: "equivalent-demand", path: "demand", expected: 2.14, tolerance: 0.01, units: "ksf" },
        { id: "load-spread-ratio", path: "spreadRatio", expected: 3.45, tolerance: 0.01 },
      ],
    },
    {
      id: "usace-example-b4-undrained-bearing",
      title: "Undrained isolated footing on clay",
      source: usaceReference,
      sourceKind: "independent-published-worked-example",
      assumptions: [
        "The published rounded q0=0.226 ksf is used directly in the bearing kernel.",
      ],
      evaluate: exampleB4Output,
      expectations: [
        { id: "usace-capacity", path: "usace", expected: 5.78, tolerance: 0.03, units: "ksf" },
        { id: "fhwa-capacity", path: "fhwa", expected: 5.47, tolerance: 0.03, units: "ksf" },
      ],
    },
    {
      id: "usace-circular-effective-area-equations",
      title: "Circular eccentric effective area",
      source: `${usaceReference}, equations 5-9 through 5-14`,
      sourceKind: "independent-closed-form-recalculation",
      assumptions: ["Diameter=2 m, V=1000 kN and M=200 kN.m."],
      evaluate: circularEffectiveAreaOutput,
      expectations: [
        { id: "area-equation", path: "areaResidual", expected: 0, tolerance: 1e-12, units: "m2" },
        { id: "positive-area", path: "area", expected: 2.346958, tolerance: 1e-6, units: "m2" },
      ],
    },
    {
      id: "usace-base-sliding-closed-form",
      title: "Drained base friction and adhesion",
      source: `${usaceReference}, equation 5-28`,
      sourceKind: "independent-closed-form-recalculation",
      assumptions: [
        "Passive resistance is zero; delta=20 degrees and ca/c'=0.5 are assigned.",
      ],
      evaluate: slidingOutput,
      expectations: [
        { id: "resistance-equilibrium", path: "resistanceResidual", expected: 0, tolerance: 1e-12, units: "kN" },
        { id: "factor-of-safety", path: "equilibriumResidual", expected: 0, tolerance: 1e-12 },
      ],
    },
  ];
}

export function runGeotechnicalShallowFoundationValidationCampaign() {
  const results = validationCases().map(evaluateCase);
  const passed = results.filter(({ status }) => status === "ok").length;
  return {
    id: "geotechnical-shallow-foundation-validation-campaign",
    status: passed === results.length ? "ok" : "failed",
    caseCount: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export function formatGeotechnicalShallowFoundationValidationReport(campaign) {
  const lines = [
    "# Geotechnical shallow-foundation validation campaign",
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
