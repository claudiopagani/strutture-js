import test from "node:test";
import assert from "node:assert/strict";

import {
  EMBEDDED_RETAINING_WALL_RESULT_SCHEMA_VERSION,
  EmbeddedRetainingWallAnalysis,
  EmbeddedRetainingWallModel,
  EmbeddedRetainingWallScenario,
  GeotechnicalDesignSituation,
  GeotechnicalEmbeddedRetainingWallApplication,
  GroundModel,
  GroundProfile,
  PorePressureField2D,
  SoilMaterial,
  WallSoilReactionLaw,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });
const source = "independent embedded-wall test input";

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

function ground({ seismic = false, withPorePressure = false } = {}) {
  const material = new SoilMaterial({
    id: "wall-soil",
    name: "Wall soil",
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [{
      id: "wall-soil-characteristic",
      basis: "characteristic",
      drainage: "drained",
      strength: {
        model: "mohr-coulomb-effective",
        frictionAngle: 30,
        cohesion: 0,
      },
      provenance: { source },
    }],
    angleUnits: "deg",
    units,
  });
  const profile = new GroundProfile({
    id: "wall-profile",
    groundSurfaceElevation: 0,
    materials: [material],
    layers: [{
      id: "wall-layer",
      topElevation: 0,
      bottomElevation: -10,
      materialId: material.id,
    }],
    groundwater: withPorePressure
      ? {
          model: "hydrostatic",
          waterTableElevation: 0,
          waterUnitWeight: 10,
        }
      : null,
    units,
  });
  const porePressureField = withPorePressure
    ? PorePressureField2D.fromGroundProfile({
        profile,
        id: "wall-pore-pressure",
      })
    : null;
  const groundModel = new GroundModel({
    id: "wall-ground",
    materials: [material],
    profiles: [profile],
    porePressureFields: porePressureField == null
      ? []
      : [porePressureField],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: seismic ? "wall-seismic" : "wall-static",
    groundModel,
    situationType: seismic ? "seismic" : "persistent",
    limitState: "SLS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: profile.id,
    porePressureFieldId: porePressureField?.id ?? null,
    seismic: seismic
      ? { model: "pseudostatic", kh: 0.1, kv: 0 }
      : { model: "none" },
    units,
  });
  return { groundModel, designSituation, profile, porePressureField };
}

function wall({
  length = 5,
  flexuralRigidity = 1000,
  headCondition = null,
  toeCondition = null,
} = {}) {
  return new EmbeddedRetainingWallModel({
    id: "embedded-wall",
    topElevation: 0,
    toeElevation: -length,
    analysisWidth: 1,
    flexuralRigiditySegments: [{
      id: "wall-section",
      topElevation: 0,
      bottomElevation: -length,
      flexuralRigidity,
      provenance: { source },
    }],
    headCondition,
    toeCondition,
    units,
  });
}

function law({ id = "wall-law", points, extrapolation = "linear" }) {
  return new WallSoilReactionLaw({
    id,
    points,
    extrapolation,
    provenance: { source },
    units,
  });
}

function scenario({
  transferLaw,
  stages,
  supports = [],
  loadingCondition = "static",
  maxElementLength = 0.5,
  porePressureFieldId = null,
} = {}) {
  const side = {
    profileId: "wall-profile",
    defaultPorePressureFieldId: porePressureFieldId,
    curvesByLayer: {
      "wall-layer": {
        stations: [{ depth: 5, law: transferLaw }],
      },
    },
  };
  return new EmbeddedRetainingWallScenario({
    id: "embedded-wall-scenario",
    loadingCondition,
    loadingProvenance: loadingCondition === "pseudostatic"
      ? { source }
      : null,
    soilResponse: {
      model: "assigned-effective-pressure-displacement-curves",
      sides: { retained: side, excavation: side },
    },
    supports,
    stages,
    discretization: { maxElementLength },
    solver: {
      incrementsPerStage: 4,
      maxIterations: 50,
      relativeResidualTolerance: 1e-10,
      displacementTolerance: 1e-12,
    },
    units,
  });
}

test("wall-soil law is monotone, unit-aware and serializable", () => {
  const transfer = new WallSoilReactionLaw({
    id: "converted-wall-law",
    points: [
      { closureDisplacement: -10, effectivePressure: 5 },
      { closureDisplacement: 0, effectivePressure: 10 },
      { closureDisplacement: 10, effectivePressure: 30 },
    ],
    extrapolation: "constant",
    provenance: { source },
    units: { force: "N", length: "mm" },
  });
  const reconstructed = new WallSoilReactionLaw(transfer.toJSON());

  approx(transfer.pressureAtZero, 10000);
  approx(transfer.evaluate(0.005).effectivePressure, 20000);
  approx(reconstructed.evaluate(-0.005).effectivePressure, 7500);
  assert.doesNotThrow(() => JSON.stringify(reconstructed.toJSON()));
  assert.throws(() => law({
    points: [
      { closureDisplacement: -0.1, effectivePressure: 20 },
      { closureDisplacement: 0.1, effectivePressure: 10 },
    ],
  }), /must not decrease/);
});

test("assigned pressure load reproduces an exact cantilever benchmark", () => {
  const fixture = ground();
  const zeroLaw = law({
    id: "zero-wall-law",
    points: [
      { closureDisplacement: -1, effectivePressure: 0 },
      { closureDisplacement: 1, effectivePressure: 0 },
    ],
  });
  const model = wall({
    length: 1,
    flexuralRigidity: 600,
    toeCondition: { translation: "fixed", rotation: "fixed" },
  });
  const loadScenario = scenario({
    transferLaw: zeroLaw,
    maxElementLength: 1,
    stages: [{
      id: "loaded",
      retainedGroundElevation: 0,
      excavationGroundElevation: 0,
      pressureLoads: [{
        id: "uniform-pressure",
        side: "retained",
        segments: [{
          topElevation: 0,
          bottomElevation: -1,
          topPressure: 10,
          bottomPressure: 10,
        }],
        provenance: { source },
      }],
    }],
  });
  const analysis = new EmbeddedRetainingWallAnalysis().analyze({
    ...fixture,
    wall: model,
    scenario: loadScenario,
    units,
  });

  assert.equal(analysis.status, "ok");
  assert.equal(
    analysis.outputs.schemaVersion,
    EMBEDDED_RETAINING_WALL_RESULT_SCHEMA_VERSION,
  );
  approx(analysis.outputs.finalStage.response.nodes[0].displacement, 10 / 4800);
  approx(analysis.outputs.finalStage.response.nodes[0].rotation, -10 / 3600);
  approx(
    Math.abs(analysis.outputs.demand.maximumAbsoluteBendingMoment.bendingMoment),
    5,
  );
  approx(analysis.outputs.finalStage.equilibrium.normalizedForceResidual, 0);
  approx(analysis.outputs.finalStage.equilibrium.normalizedMomentResidual, 0);
});

test("equal ground on both sides preserves the undeformed initial state", () => {
  const fixture = ground();
  const transfer = law({
    points: [
      { closureDisplacement: -0.1, effectivePressure: 0 },
      { closureDisplacement: 0, effectivePressure: 20 },
      { closureDisplacement: 0.1, effectivePressure: 40 },
    ],
  });
  const analysis = new EmbeddedRetainingWallAnalysis().analyze({
    ...fixture,
    wall: wall(),
    scenario: scenario({
      transferLaw: transfer,
      stages: [{
        id: "initial",
        retainedGroundElevation: 0,
        excavationGroundElevation: 0,
      }],
    }),
    units,
  });

  assert.equal(analysis.status, "ok");
  approx(
    analysis.outputs.finalStage.response.extrema
      .maximumAbsoluteDisplacement.displacement,
    0,
  );
  approx(analysis.outputs.finalStage.equilibrium.totalSoilForce, 0);
});

test("pore pressure remains separate from effective soil pressure on both sides", () => {
  const fixture = ground({ withPorePressure: true });
  const zeroEffectiveLaw = law({
    points: [
      { closureDisplacement: -1, effectivePressure: 0 },
      { closureDisplacement: 1, effectivePressure: 0 },
    ],
  });
  const analysis = new EmbeddedRetainingWallAnalysis().analyze({
    ...fixture,
    wall: wall({ length: 2 }),
    scenario: scenario({
      transferLaw: zeroEffectiveLaw,
      porePressureFieldId: fixture.porePressureField.id,
      stages: [{
        id: "hydrostatic",
        retainedGroundElevation: 0,
        excavationGroundElevation: 0,
      }],
    }),
    units,
  });
  const submergedNode = analysis.outputs.finalStage.response.nodes.find(
    ({ elevation }) => Math.abs(elevation + 1) < 1e-12,
  );

  assert.equal(analysis.status, "ok");
  assert.ok(submergedNode.soil.retained.waterForceOnWall > 0);
  approx(
    submergedNode.soil.retained.waterForceOnWall,
    -submergedNode.soil.excavation.waterForceOnWall,
  );
  approx(analysis.outputs.finalStage.equilibrium.totalSoilForce, 0);
});

test("excavation changes contact and a zero-prestress support installs without a force jump", () => {
  const fixture = ground();
  const transfer = law({
    points: [
      { closureDisplacement: -0.2, effectivePressure: 0 },
      { closureDisplacement: 0, effectivePressure: 20 },
      { closureDisplacement: 0.2, effectivePressure: 60 },
    ],
  });
  const support = {
    id: "anchor-1",
    type: "ground-anchor",
    elevation: -1,
    stiffness: 5000,
    prestress: 0,
    behavior: "unilateral",
    actionDirection: "toward-retained-side",
    provenance: { source },
  };
  const analysis = new EmbeddedRetainingWallAnalysis().analyze({
    ...fixture,
    wall: wall(),
    scenario: scenario({
      transferLaw: transfer,
      supports: [support],
      stages: [{
        id: "initial",
        retainedGroundElevation: 0,
        excavationGroundElevation: 0,
      }, {
        id: "excavation",
        retainedGroundElevation: 0,
        excavationGroundElevation: -2,
      }, {
        id: "support-installation",
        retainedGroundElevation: 0,
        excavationGroundElevation: -2,
        activeSupportIds: [support.id],
      }],
    }),
    units,
  });
  const excavated = analysis.outputs.stages[1];
  const supported = analysis.outputs.stages[2];
  const anchorNode = supported.response.nodes.find(({ elevation }) =>
    Math.abs(elevation + 1) < 1e-12);
  const anchor = supported.response.supports.find(
    ({ supportId }) => supportId === support.id,
  );

  assert.equal(analysis.status, "ok");
  assert.ok(excavated.response.extrema.maximumAbsoluteDisplacement
    .displacement > 0);
  approx(anchor.referenceDisplacement, anchorNode.displacement);
  approx(anchor.scalarForce, 0);
  approx(
    supported.equilibrium.normalizedForceResidual,
    0,
    1e-9,
  );
  approx(
    supported.equilibrium.normalizedMomentResidual,
    0,
    1e-9,
  );
});

test("assigned support capacity produces a not-verified result", () => {
  const fixture = ground();
  const zeroLaw = law({
    points: [
      { closureDisplacement: -1, effectivePressure: 0 },
      { closureDisplacement: 1, effectivePressure: 0 },
    ],
  });
  const analysis = new EmbeddedRetainingWallAnalysis().analyze({
    ...fixture,
    wall: wall({
      length: 1,
      headCondition: { translation: "fixed", rotation: "fixed" },
      toeCondition: { translation: "fixed", rotation: "fixed" },
    }),
    scenario: scenario({
      transferLaw: zeroLaw,
      maxElementLength: 1,
      supports: [{
        id: "overloaded-strut",
        type: "strut",
        elevation: 0,
        stiffness: 100,
        prestress: 20,
        actionDirection: "toward-retained-side",
        capacity: {
          maximumForce: 10,
          provenance: { source },
        },
        provenance: { source },
      }],
      stages: [{
        id: "supported",
        retainedGroundElevation: 0,
        excavationGroundElevation: 0,
        activeSupportIds: ["overloaded-strut"],
      }],
    }),
    units,
  });

  assert.equal(analysis.status, "not-verified");
  assert.equal(analysis.outputs.checks[0].status, "failed");
  approx(analysis.outputs.utilizationRatio, 2);
});

test("application accepts a matching pseudostatic scenario and guards mismatches", () => {
  const staticFixture = ground();
  const seismicFixture = ground({ seismic: true });
  const zeroLaw = law({
    points: [
      { closureDisplacement: -1, effectivePressure: 0 },
      { closureDisplacement: 1, effectivePressure: 0 },
    ],
  });
  const model = wall({
    length: 1,
    toeCondition: { translation: "fixed", rotation: "fixed" },
  });
  const pseudostaticScenario = scenario({
    transferLaw: zeroLaw,
    loadingCondition: "pseudostatic",
    maxElementLength: 1,
    stages: [{
      id: "seismic-stage",
      retainedGroundElevation: 0,
      excavationGroundElevation: 0,
      pressureLoads: [{
        side: "retained",
        category: "seismic",
        segments: [{
          topElevation: 0,
          bottomElevation: -1,
          topPressure: 0,
          bottomPressure: 6,
        }],
        provenance: { source },
      }],
    }],
  });
  const mismatch = new EmbeddedRetainingWallAnalysis().analyze({
    ...staticFixture,
    wall: model,
    scenario: pseudostaticScenario,
    units,
  });
  const applicationResult = new GeotechnicalEmbeddedRetainingWallApplication()
    .run({
      ...seismicFixture,
      wall: model.toJSON(),
      scenario: pseudostaticScenario.toJSON(),
      units,
    });

  assert.equal(mismatch.status, "not-supported");
  assert.equal(applicationResult.status, "ok");
  assert.equal(
    applicationResult.outputs.structuralCoupling.responseMode.status,
    "available",
  );
  assert.doesNotThrow(() => JSON.stringify(applicationResult.toJSON()));
});
