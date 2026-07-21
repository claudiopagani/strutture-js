import {
  GeotechnicalDesignSituation,
  GroundModel,
  GroundProfile,
  RetainingWallAnalysis,
  RetainingWallLoadScenario,
  RetainingWallModel,
  SoilMaterial,
  SoilStructureInterface,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });
const source =
  "USACE EM 1110-2-2502 (1989), Chapters 3 and 4, earth pressures and rigid-body stability";

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

function model({ groundwater = false, seismic = false } = {}) {
  const soil = new SoilMaterial({
    id: "validation-sand",
    name: "Validation sand",
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [{
      id: "validation-characteristic",
      basis: "characteristic",
      drainage: "drained",
      strength: {
        model: "mohr-coulomb-effective",
        frictionAngle: 30,
        cohesion: 0,
      },
      provenance: { source: "validation-input" },
    }],
    angleUnits: "deg",
    units,
  });
  const retained = new GroundProfile({
    id: "validation-retained",
    groundSurfaceElevation: 4.5,
    materials: [soil],
    layers: [{
      id: "validation-retained-layer",
      topElevation: 4.5,
      bottomElevation: -20,
      materialId: soil.id,
    }],
    groundwater: groundwater
      ? {
          model: "hydrostatic",
          waterTableElevation: 4.5,
          waterUnitWeight: 9.81,
        }
      : { model: "none" },
    units,
  });
  const bearing = new GroundProfile({
    id: "validation-bearing",
    groundSurfaceElevation: 0.5,
    materials: [soil],
    layers: [{
      id: "validation-bearing-layer",
      topElevation: 0.5,
      bottomElevation: -20,
      materialId: soil.id,
    }],
    groundwater: groundwater
      ? {
          model: "hydrostatic",
          waterTableElevation: 0.5,
          waterUnitWeight: 9.81,
        }
      : { model: "none" },
    units,
  });
  const groundModel = new GroundModel({
    id: "validation-ground",
    materials: [soil],
    profiles: [retained, bearing],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: seismic ? "validation-seismic" : "validation-static",
    groundModel,
    situationType: seismic ? "seismic" : "persistent",
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: retained.id,
    seismic: seismic
      ? { model: "pseudostatic", kh: 0.1, kv: 0.05 }
      : { model: "none" },
    units,
  });
  const wall = RetainingWallModel.cantilever({
    id: "validation-wall",
    geometry: {
      toeLength: 1,
      heelLength: 2,
      baseThickness: 0.5,
      stemHeight: 4,
      stemBaseThickness: 0.4,
      stemTopThickness: 0.2,
    },
    concreteUnitWeight: 25,
    placement: { baseElevation: 0 },
    units,
  });
  const interfaceModel = new SoilStructureInterface({
    id: "validation-base-interface",
    wallSurface: { typeId: "formed-concrete" },
    parameterSets: [{
      id: "validation-base-angle",
      basis: "characteristic",
      model: "assigned-angle",
      frictionAngle: 20,
      angleUnits: "deg",
      provenance: { source: "validation-input" },
    }],
  });
  return { groundModel, designSituation, wall, interfaceModel };
}

function analyze({ groundwater = false, seismic = false } = {}) {
  const fixture = model({ groundwater, seismic });
  const scenario = new RetainingWallLoadScenario({
    id: "validation-scenario",
    retainedSide: seismic
      ? {
          profileId: "validation-retained",
          state: "seismic-active",
          method: "mononobe-okabe-active",
          seismic: { distributionModel: "triangular-equivalent" },
        }
      : {
          profileId: "validation-retained",
          state: "active",
          method: "rankine",
        },
    baseUplift: groundwater
      ? { model: "linear-hydrostatic", reductionFactor: 0.5 }
      : { model: "linear-hydrostatic" },
    foundation: {
      profileId: "validation-bearing",
      baseInterface: fixture.interfaceModel,
      bearing: { enabled: false },
    },
    seismicDirection: seismic ? "retained-to-front" : null,
    units,
  });
  return new RetainingWallAnalysis().analyze({
    groundModel: fixture.groundModel,
    designSituation: fixture.designSituation,
    wall: fixture.wall,
    scenario,
    units,
  }).outputs;
}

function dryOutput() {
  const output = analyze();
  const active = output.loads.find(({ id }) => id === "retained-soil-normal");
  const soilWeight = output.loads
    .filter(({ category }) => category === "soil-over-heel")
    .reduce((sum, load) => sum - load.force.z, 0);
  const baseWeight = output.loads.find(({ id }) =>
    id === "wall-component-base");
  return {
    activeForce: -active.force.x,
    activeHeight: active.applicationPoint.z,
    baseWeight: -baseWeight.force.z,
    soilWeight,
    vertical: output.equilibrium.verticalDownward,
    slidingResistance: output.sliding.baseResistance,
  };
}

function upliftOutput() {
  const output = analyze({ groundwater: true });
  return {
    toePressure: output.baseUplift.toePressure,
    heelPressure: output.baseUplift.heelPressure,
    upliftForce: output.baseUplift.forcePerUnitWidth,
    upliftDistance: output.baseUplift.distanceFromToe,
  };
}

function seismicMassOutput() {
  const output = analyze({ seismic: true });
  const horizontal = output.loads.find(({ id }) =>
    id === "wall-component-base-horizontal-inertia");
  const vertical = output.loads.find(({ id }) =>
    id === "wall-component-base-vertical-inertia");
  return {
    horizontalInertia: horizontal.force.x,
    verticalInertia: vertical.force.z,
  };
}

function cases() {
  const toePressure = 9.81 * 0.5;
  const heelPressure = 9.81 * 4.5;
  const upliftForce = 0.5 * 3.4 * (toePressure + heelPressure) / 2;
  const upliftDistance = 3.4 * (toePressure + 2 * heelPressure) /
    (3 * (toePressure + heelPressure));
  return [{
    id: "dry-rankine-rigid-body-equilibrium",
    title: "Dry vertical cantilever wall with Rankine pressure",
    source,
    sourceKind: "independent-closed-form-recalculation",
    assumptions: [
      "H=4 m, gamma=18 kN/m3, phi=30 degrees and Ka=1/3.",
      "Concrete unit weight is 25 kN/m3 and the retained soil over the 2 m heel is rectangular.",
    ],
    evaluate: dryOutput,
    expectations: [
      { id: "active-force", path: "activeForce", expected: 48, tolerance: 1e-10, units: "kN/m" },
      { id: "active-height", path: "activeHeight", expected: 0.5 + 4 / 3, tolerance: 1e-10, units: "m" },
      { id: "base-weight", path: "baseWeight", expected: 42.5, tolerance: 1e-10, units: "kN/m" },
      { id: "soil-weight", path: "soilWeight", expected: 144, tolerance: 1e-10, units: "kN/m" },
      { id: "vertical-resultant", path: "vertical", expected: 216.5, tolerance: 1e-10, units: "kN/m" },
      { id: "base-friction", path: "slidingResistance", expected: 216.5 * Math.tan(20 * Math.PI / 180), tolerance: 1e-10, units: "kN/m" },
    ],
  }, {
    id: "linear-uplift-resultant",
    title: "Linear hydrostatic uplift with unequal heads",
    source: `${source}; statics of a linearly varying pressure field`,
    sourceKind: "independent-closed-form-recalculation",
    assumptions: [
      "Toe and heel heads are 0.5 m and 4.5 m with gamma_w=9.81 kN/m3.",
      "An explicit uplift reduction factor of 0.5 is applied to force, not centroid.",
    ],
    evaluate: upliftOutput,
    expectations: [
      { id: "toe-pressure", path: "toePressure", expected: toePressure, tolerance: 1e-12, units: "kN/m2" },
      { id: "heel-pressure", path: "heelPressure", expected: heelPressure, tolerance: 1e-12, units: "kN/m2" },
      { id: "uplift-force", path: "upliftForce", expected: upliftForce, tolerance: 1e-12, units: "kN/m" },
      { id: "uplift-centroid", path: "upliftDistance", expected: upliftDistance, tolerance: 1e-12, units: "m" },
    ],
  }, {
    id: "pseudostatic-wall-mass-actions",
    title: "Assigned pseudostatic inertia of a wall component",
    source: `${source}; assigned pseudostatic rigid-body inertia convention`,
    sourceKind: "independent-closed-form-recalculation",
    assumptions: [
      "Base weight is 42.5 kN/m, kh=0.1 and positive kv=0.05 reduces effective gravity.",
    ],
    evaluate: seismicMassOutput,
    expectations: [
      { id: "horizontal-inertia", path: "horizontalInertia", expected: -4.25, tolerance: 1e-12, units: "kN/m" },
      { id: "vertical-inertia", path: "verticalInertia", expected: 2.125, tolerance: 1e-12, units: "kN/m" },
    ],
  }];
}

export function runGeotechnicalRetainingWallValidationCampaign() {
  const results = cases().map(evaluateCase);
  const passed = results.filter(({ status }) => status === "ok").length;
  return {
    id: "geotechnical-retaining-wall-validation-campaign",
    status: passed === results.length ? "ok" : "failed",
    caseCount: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export function formatGeotechnicalRetainingWallValidationReport(campaign) {
  const lines = [
    "# Geotechnical retaining-wall validation campaign",
    "",
    `Status: ${campaign.status}`,
    `Cases: ${campaign.caseCount}; passed: ${campaign.passed}; failed: ${campaign.failed}`,
    "",
  ];
  for (const caseResult of campaign.results) {
    lines.push(`- ${caseResult.id}: ${caseResult.status} (${caseResult.source})`);
  }
  return lines.join("\n");
}
