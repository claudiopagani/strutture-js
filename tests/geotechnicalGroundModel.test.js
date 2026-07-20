import test from "node:test";
import assert from "node:assert/strict";

import {
  GEOTECHNICAL_DESIGN_SITUATION_SCHEMA_VERSION,
  GROUND_MODEL_SCHEMA_VERSION,
  GROUND_SECTION_2D_SCHEMA_VERSION,
  PORE_PRESSURE_FIELD_2D_SCHEMA_VERSION,
  GeotechnicalDesignSituation,
  GroundModel,
  GroundProfile,
  GroundSection2D,
  PorePressureField2D,
  SoilMaterial,
} from "../src/index.js";

const units = { force: "kN", length: "m" };

function approx(actual, expected, tolerance = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

function material({ id = "sand", indicative = false } = {}) {
  return new SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [
      {
        id: "drained-characteristic",
        basis: "characteristic",
        drainage: "drained",
        strength: {
          model: "mohr-coulomb-effective",
          frictionAngle: 30,
          cohesion: 0,
        },
      },
      {
        id: "drained-design",
        basis: "design",
        drainage: "drained",
        strength: {
          model: "mohr-coulomb-effective",
          frictionAngle: 25,
          cohesion: 0,
        },
      },
      {
        id: "undrained-characteristic",
        basis: "characteristic",
        drainage: "undrained",
        strength: {
          model: "total-stress-undrained",
          undrainedShearStrength: 40,
        },
      },
      ...(indicative ? [{
        id: "drained-indicative",
        basis: "indicative",
        drainage: "drained",
        strength: {
          model: "mohr-coulomb-effective",
          frictionAngle: 28,
          cohesion: 0,
        },
      }] : []),
    ],
    defaultParameterSetId: "drained-characteristic",
    angleUnits: "deg",
    units,
  });
}

function profile({ groundMaterial = material() } = {}) {
  return new GroundProfile({
    id: "profile-a",
    groundSurfaceElevation: 10,
    materials: [groundMaterial],
    layers: [{
      id: "layer-a",
      topElevation: 10,
      bottomElevation: 0,
      materialId: groundMaterial.id,
    }],
    groundwater: {
      model: "hydrostatic",
      waterTableElevation: 5,
      waterUnitWeight: 9.81,
    },
    units,
  });
}

function section(overrides = {}) {
  return new GroundSection2D({
    id: "section-a",
    surface: {
      points: [{ x: 0, z: 10 }, { x: 10, z: 10 }],
    },
    zones: [
      {
        id: "upper",
        materialId: "sand",
        polygon: [
          { x: 0, z: 5 },
          { x: 10, z: 5 },
          { x: 10, z: 10 },
          { x: 0, z: 10 },
        ],
      },
      {
        id: "lower",
        materialId: "clay",
        polygon: [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
          { x: 10, z: 5 },
          { x: 0, z: 5 },
        ],
      },
    ],
    units,
    ...overrides,
  });
}

test("GroundSection2D validates geometry and performs deterministic spatial queries", () => {
  const ground = section({
    surface: {
      points: [{ x: 0, z: 10 }, { x: 10, z: 8 }],
    },
    zones: [
      {
        id: "upper",
        materialId: "sand",
        polygon: [
          { x: 0, z: 5 },
          { x: 10, z: 5 },
          { x: 10, z: 8 },
          { x: 0, z: 10 },
        ],
      },
      {
        id: "lower",
        materialId: "clay",
        polygon: [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
          { x: 10, z: 5 },
          { x: 0, z: 5 },
        ],
      },
    ],
  });

  approx(ground.surfaceElevationAt(5), 9);
  assert.equal(ground.getMaterialIdAtPoint({ x: 5, z: 7 }), "sand");
  assert.equal(ground.getMaterialIdAtPoint({ x: 5, z: 2 }), "clay");
  assert.equal(ground.getZoneAtPoint({ x: 5, z: -1 }), null);
  assert.equal(ground.isBelowGroundSurface({ x: 5, z: 9 }), true);
  assert.equal(ground.toJSON().schemaVersion, GROUND_SECTION_2D_SCHEMA_VERSION);
  assert.doesNotThrow(() => JSON.stringify(ground));

  assert.throws(
    () => ground.getZoneAtPoint({ x: 5, z: 5 }),
    /multiple GroundSection2D zone boundaries/,
  );
  assert.equal(
    ground.getZoneAtPoint({ x: 5, z: 5 }, { requireUnique: false }).id,
    "upper",
  );
});

test("GroundSection2D rejects invalid surfaces, self-intersections and overlaps", () => {
  assert.throws(() => section({
    surface: { points: [{ x: 0, z: 10 }, { x: 0, z: 9 }] },
  }), /strictly increasing/);

  assert.throws(() => section({
    zones: [{
      id: "bow-tie",
      materialId: "sand",
      polygon: [
        { x: 0, z: 0 },
        { x: 10, z: 10 },
        { x: 0, z: 10 },
        { x: 10, z: 0 },
      ],
    }],
  }), /non-self-intersecting/);

  assert.throws(() => section({
    zones: [
      {
        id: "left",
        materialId: "sand",
        polygon: [
          { x: 0, z: 0 }, { x: 7, z: 0 },
          { x: 7, z: 7 }, { x: 0, z: 7 },
        ],
      },
      {
        id: "right",
        materialId: "clay",
        polygon: [
          { x: 5, z: 2 }, { x: 10, z: 2 },
          { x: 10, z: 9 }, { x: 5, z: 9 },
        ],
      },
    ],
  }), /overlap internally/);

  assert.throws(() => section({
    zones: [
      {
        id: "first-strip",
        materialId: "sand",
        polygon: [
          { x: 0, z: 0 }, { x: 7, z: 0 },
          { x: 7, z: 5 }, { x: 0, z: 5 },
        ],
      },
      {
        id: "second-strip",
        materialId: "clay",
        polygon: [
          { x: 5, z: 0 }, { x: 10, z: 0 },
          { x: 10, z: 5 }, { x: 5, z: 5 },
        ],
      },
    ],
  }), /overlap internally/);

  assert.throws(() => section({
    zones: [{
      id: "above",
      materialId: "sand",
      polygon: [
        { x: 0, z: 0 }, { x: 10, z: 0 },
        { x: 10, z: 11 }, { x: 0, z: 10 },
      ],
    }],
  }), /extends above/);

  assert.throws(() => section({
    surface: {
      points: [{ x: 0, z: 10 }, { x: 5, z: 5 }, { x: 10, z: 10 }],
    },
    zones: [{
      id: "bridges-valley",
      materialId: "sand",
      polygon: [
        { x: 0, z: 0 }, { x: 10, z: 0 },
        { x: 10, z: 9 }, { x: 0, z: 9 },
      ],
    }],
  }), /between its vertices/);
});

test("GroundSection2D converts coordinates to the geotechnical unit system", () => {
  const ground = new GroundSection2D({
    id: "section-mm",
    surface: { points: [{ x: 0, z: 10000 }, { x: 10000, z: 8000 }] },
    zones: [{
      id: "zone",
      materialId: "sand",
      polygon: [
        { x: 0, z: 0 }, { x: 10000, z: 0 },
        { x: 10000, z: 8000 }, { x: 0, z: 10000 },
      ],
    }],
    units: { force: "N", length: "mm" },
  });

  approx(ground.bounds.maximumX, 10);
  approx(ground.surfaceElevationAt(5), 9);
  assert.deepEqual(ground.units, units);
});

test("PorePressureField2D covers hydrostatic, phreatic and assigned-grid fields", () => {
  const horizontal = new PorePressureField2D({
    id: "horizontal",
    model: "hydrostatic-horizontal",
    waterTableElevation: 5,
    waterUnitWeight: 10,
    units,
  });
  const phreatic = new PorePressureField2D({
    id: "phreatic",
    model: "phreatic-line",
    phreaticLine: {
      points: [{ x: 0, z: 6 }, { x: 10, z: 4 }],
    },
    waterUnitWeight: 10,
    units,
  });
  const grid = new PorePressureField2D({
    id: "grid",
    model: "assigned-grid",
    assignedGrid: {
      xCoordinates: [0, 10],
      zCoordinates: [0, 10],
      values: [[0, 10], [20, 30]],
    },
    units,
  });

  approx(horizontal.porePressureAt({ x: 99, z: 2 }), 30);
  approx(horizontal.porePressureAt({ x: 0, z: 7 }), 0);
  approx(phreatic.waterElevationAt(5), 5);
  approx(phreatic.porePressureAt({ x: 5, z: 2 }), 30);
  approx(grid.porePressureAt({ x: 5, z: 5 }), 15);
  assert.deepEqual(grid.breakpointsAtX(5), [0, 10]);
  assert.equal(grid.toJSON().schemaVersion, PORE_PRESSURE_FIELD_2D_SCHEMA_VERSION);
  assert.throws(() => grid.porePressureAt({ x: 11, z: 5 }), /outside/);

  const clamped = new PorePressureField2D({
    ...grid.toJSON(),
    id: "clamped-grid",
    outsideDomain: "constant",
  });
  approx(clamped.porePressureAt({ x: 20, z: 5 }), 20);
});

test("PorePressureField2D converts water unit weight and grid pressure", () => {
  const hydrostatic = new PorePressureField2D({
    id: "water-mm",
    model: "hydrostatic-horizontal",
    waterTableElevation: 5000,
    waterUnitWeight: 9.81e-6,
    units: { force: "N", length: "mm" },
  });
  const grid = new PorePressureField2D({
    id: "grid-mm",
    model: "assigned-grid",
    assignedGrid: {
      xCoordinates: [0, 10000],
      zCoordinates: [0, 10000],
      values: [[0, 0.01], [0.02, 0.03]],
    },
    units: { force: "N", length: "mm" },
  });

  approx(hydrostatic.porePressureAt({ x: 0, z: 2 }), 29.43);
  approx(grid.porePressureAt({ x: 5, z: 5 }), 15);
});

test("GroundModel upgrades GroundProfile without breaking the one-dimensional API", () => {
  const source = profile();
  const model = GroundModel.fromGroundProfile({
    profile: source,
    id: "site-model",
    minimumX: 0,
    maximumX: 20,
  });

  assert.equal(model.schemaVersion, GROUND_MODEL_SCHEMA_VERSION);
  assert.equal(model.getProfile().id, source.id);
  assert.equal(model.getSection().metadata.sourceProfileId, source.id);
  assert.equal(
    model.resolveZoneMaterial({ x: 10, z: 2 }).material.id,
    "sand",
  );
  approx(model.porePressureAt({ x: 10, z: 2 }), 29.43);
  assert.equal(model.analysisContext().materials.length, 1);

  const serialized = model.toJSON();
  assert.equal(serialized.profiles[0].materials, undefined);
  assert.equal(
    serialized.profiles[0].materialSource,
    "ground-model-material-library",
  );
  const roundTrip = new GroundModel(serialized);
  assert.deepEqual(roundTrip.toJSON(), serialized);
  assert.doesNotThrow(() => JSON.stringify(roundTrip));
});

test("GroundModel rejects unknown zone material references", () => {
  const sand = material();
  assert.throws(() => new GroundModel({
    id: "invalid-model",
    materials: [sand],
    sections: [section()],
    units,
  }), /unknown material clay/);
});

test("GeotechnicalDesignSituation resolves parameter precedence and traces it", () => {
  const source = profile({ groundMaterial: material({ indicative: true }) });
  const model = GroundModel.fromGroundProfile({
    profile: source,
    id: "site-model",
    maximumX: 10,
  });
  const situation = new GeotechnicalDesignSituation({
    id: "uls-drained",
    groundModel: model,
    situationType: "persistent",
    limitState: "ULS",
    timeCondition: "long-term",
    drainageCondition: "drained",
    requiredParameterBasis: "design",
    profileId: model.defaultProfileId,
    sectionId: model.defaultSectionId,
    porePressureFieldId: model.defaultPorePressureFieldId,
    constructionStageId: "end-of-construction",
    parameterSelection: {
      byMaterial: { sand: "drained-characteristic" },
      byZone: { "layer-a": "drained-design" },
      byLayer: { "layer-a": "drained-characteristic" },
      byInterface: { "wall-back": "interface-design" },
    },
    normativeContext: {
      standard: "project-selected-standard",
      combinationId: "uls-geotechnical",
    },
    units,
  });
  const resolved = situation.resolveParameterSet({
    groundModel: model,
    zoneId: "layer-a",
    layerId: "layer-a",
  });

  assert.equal(resolved.parameterSetId, "drained-design");
  assert.equal(resolved.selectionSource, "zone");
  assert.equal(resolved.selectionSourceId, "layer-a");
  assert.equal(situation.resolveInterfaceParameterSetId("wall-back"),
    "interface-design");
  assert.equal(situation.validateAgainst(model), true);
  assert.equal(
    situation.toJSON().schemaVersion,
    GEOTECHNICAL_DESIGN_SITUATION_SCHEMA_VERSION,
  );
  assert.doesNotThrow(() => JSON.stringify(situation));
});

test("GeotechnicalDesignSituation guards drainage, basis and indicative data", () => {
  const source = profile({ groundMaterial: material({ indicative: true }) });
  const model = GroundModel.fromGroundProfile({ profile: source });
  const base = {
    id: "situation",
    groundModel: model,
    profileId: model.defaultProfileId,
    sectionId: model.defaultSectionId,
    drainageCondition: "drained",
    units,
  };

  const wrongDrainage = new GeotechnicalDesignSituation({
    ...base,
    parameterSelection: {
      byMaterial: { sand: "undrained-characteristic" },
    },
  });
  assert.throws(() => wrongDrainage.resolveParameterSet({
    groundModel: model,
    materialId: "sand",
  }), /requires drained/);

  const wrongBasis = new GeotechnicalDesignSituation({
    ...base,
    requiredParameterBasis: "design",
  });
  assert.throws(() => wrongBasis.resolveParameterSet({
    groundModel: model,
    materialId: "sand",
  }), /design is required/);

  const blockedIndicative = new GeotechnicalDesignSituation({
    ...base,
    parameterSelection: {
      byMaterial: { sand: "drained-indicative" },
    },
  });
  assert.throws(() => blockedIndicative.resolveParameterSet({
    groundModel: model,
    materialId: "sand",
  }), /not authorized/);

  const authorizedIndicative = new GeotechnicalDesignSituation({
    ...base,
    allowIndicativeValues: true,
    parameterSelection: {
      byMaterial: { sand: "drained-indicative" },
    },
  });
  assert.equal(authorizedIndicative.resolveParameterSet({
    groundModel: model,
    materialId: "sand",
  }).warnings.length, 1);
});

test("seismic design situations require explicit bounded pseudostatic data", () => {
  const model = GroundModel.fromGroundProfile({ profile: profile() });
  assert.throws(() => new GeotechnicalDesignSituation({
    id: "seismic-invalid",
    groundModel: model,
    situationType: "seismic",
    units,
  }), /explicit seismic model/);
  assert.throws(() => new GeotechnicalDesignSituation({
    id: "seismic-invalid-kv",
    groundModel: model,
    situationType: "seismic",
    seismic: { model: "pseudostatic", kh: 0.1, kv: 1 },
    units,
  }), /-1 < kv < 1/);

  const situation = new GeotechnicalDesignSituation({
    id: "seismic",
    groundModel: model,
    situationType: "seismic",
    limitState: "ULS",
    seismic: { model: "pseudostatic", kh: 0.12, kv: -0.04 },
    units,
  });
  const roundTrip = new GeotechnicalDesignSituation(situation.toJSON());

  assert.deepEqual(roundTrip.toJSON(), situation.toJSON());
  assert.equal(roundTrip.seismic.kh, 0.12);
  assert.equal(roundTrip.seismic.kv, -0.04);
});
