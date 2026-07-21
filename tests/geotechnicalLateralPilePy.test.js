import assert from "node:assert/strict";
import test from "node:test";
import {
  DeepFoundationModel,
  GeotechnicalDesignSituation,
  GeotechnicalLateralPileApplication,
  GroundModel,
  GroundProfile,
  LATERAL_PILE_PY_RESULT_SCHEMA_VERSION,
  LATERAL_PILE_RESPONSE_SCENARIO_SCHEMA_VERSION,
  LateralPileBeamOnSpringsAnalysis,
  LateralPileResponseScenario,
  PILE_TRANSFER_LAW_SCHEMA_VERSION,
  PileTransferLaw,
  SoilMaterial,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected} by more than ${tolerance}`,
  );
}

function soil(id) {
  return new SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [{
      id: `${id}-parameters`,
      basis: "characteristic",
      drainage: "drained",
      strength: {
        model: "mohr-coulomb-effective",
        frictionAngle: 30,
        cohesion: 0,
      },
      provenance: { source: "test-characterization" },
    }],
    angleUnits: "deg",
    units,
  });
}

function groundFixture({ layers, materials, seismic = null }) {
  const profile = new GroundProfile({
    id: "py-profile",
    groundSurfaceElevation: 0,
    materials,
    layers,
    groundwater: { model: "none" },
    units,
  });
  const groundModel = new GroundModel({
    id: "py-ground",
    materials,
    profiles: [profile],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "py-situation",
    groundModel,
    situationType: seismic ? "seismic" : "persistent",
    limitState: "SLS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: profile.id,
    seismic,
    units,
  });
  return { profile, groundModel, designSituation };
}

function pile({ embedment, headElevation = 0, diameter = 1 }) {
  return new DeepFoundationModel({
    id: "py-pile",
    geometry: { model: "circular", diameter },
    placement: {
      headElevation,
      soilContactTopElevation: 0,
      toeElevation: -embedment,
    },
    construction: {
      installationMethod: "assigned-test-method",
      structuralMaterial: "assigned-test-material",
      displacementClass: "not-classified",
    },
    units,
  });
}

function law({ id, points, extrapolation = "constant" }) {
  return new PileTransferLaw({
    id,
    points,
    extrapolation,
    provenance: { source: "test-assigned-p-y-law" },
    units,
  });
}

function responseScenario({
  curvesByLayer,
  shear,
  moment = 0,
  flexuralRigidity,
  maxElementLength,
  headCondition = null,
  tipCondition = null,
  loadSteps = 1,
}) {
  return new LateralPileResponseScenario({
    id: "py-response",
    action: {
      lateralShear: shear,
      overturningMoment: moment,
      referencePoint: "pile-head",
      basis: "assigned-test-action",
    },
    flexuralRigidity: {
      model: "constant",
      value: flexuralRigidity,
      provenance: { source: "test-assigned-EI" },
    },
    headCondition,
    tipCondition,
    soilResponse: {
      model: "assigned-py-curves",
      curvesByLayer,
    },
    discretization: { maxElementLength },
    solver: {
      loadSteps,
      maxIterations: 40,
      relativeResidualTolerance: 1e-10,
      displacementTolerance: 1e-12,
    },
    units,
  });
}

test("p-y transfer law converts units and evaluates symmetric branches", () => {
  const transfer = new PileTransferLaw({
    id: "converted-p-y",
    points: [
      { displacement: 0, resistancePerLength: 0 },
      { displacement: 10, resistancePerLength: 2 },
    ],
    extrapolation: "linear",
    provenance: { source: "unit-conversion-test" },
    units: { force: "N", length: "mm" },
  });
  const positive = transfer.evaluate(0.005);
  const negative = transfer.evaluate(-0.005);
  const reconstructed = new PileTransferLaw(transfer.toJSON());

  assert.equal(transfer.schemaVersion, PILE_TRANSFER_LAW_SCHEMA_VERSION);
  approx(transfer.points[1].displacement, 0.01);
  approx(transfer.points[1].resistancePerLength, 2);
  approx(positive.mobilizedResistancePerLength, 1);
  approx(positive.tangentModulus, 200);
  approx(negative.mobilizedResistancePerLength, -1);
  approx(negative.soilReactionOnPilePerLength, 1);
  approx(reconstructed.evaluate(0.005).mobilizedResistancePerLength, 1);
});

test("response scenario remains serializable with depth-dependent p-y laws", () => {
  const scenario = responseScenario({
    curvesByLayer: {
      layer: {
        stations: [{
          depth: 0,
          law: law({
            id: "surface-law",
            points: [
              { displacement: 0, resistancePerLength: 0 },
              { displacement: 0.1, resistancePerLength: 10 },
            ],
          }),
        }, {
          depth: 2,
          law: law({
            id: "deep-law",
            points: [
              { displacement: 0, resistancePerLength: 0 },
              { displacement: 0.1, resistancePerLength: 30 },
            ],
          }),
        }],
      },
    },
    shear: 10,
    flexuralRigidity: 1000,
    maxElementLength: 0.5,
  });
  const reconstructed = new LateralPileResponseScenario(scenario.toJSON());

  assert.equal(
    scenario.schemaVersion,
    LATERAL_PILE_RESPONSE_SCENARIO_SCHEMA_VERSION,
  );
  assert.equal(
    reconstructed.soilResponse.curvesByLayer.layer.stations[1].law.id,
    "deep-law",
  );
  assert.doesNotThrow(() => JSON.stringify(reconstructed.toJSON()));
  assert.throws(
    () => responseScenario({
      curvesByLayer: {
        layer: {
          reactionMultiplier: 0.8,
          stations: scenario.soilResponse.curvesByLayer.layer.stations,
        },
      },
      shear: 10,
      flexuralRigidity: 1000,
      maxElementLength: 0.5,
    }),
    /provenance is required/,
  );
});

test("beam kernel reproduces an Euler-Bernoulli cantilever without soil reaction", () => {
  const material = soil("cantilever-soil");
  const ground = groundFixture({
    materials: [material],
    layers: [{
      id: "cantilever-layer",
      topElevation: 0,
      bottomElevation: -2,
      materialId: material.id,
    }],
  });
  const zeroLaw = law({
    id: "zero-p-y",
    points: [
      { displacement: 0, resistancePerLength: 0 },
      { displacement: 1, resistancePerLength: 0 },
    ],
  });
  const result = new LateralPileBeamOnSpringsAnalysis().analyze({
    ...ground,
    pile: pile({ embedment: 1 }),
    scenario: responseScenario({
      curvesByLayer: {
        "cantilever-layer": {
          stations: [{ depth: 0.5, law: zeroLaw }],
        },
      },
      shear: 12,
      flexuralRigidity: 600,
      maxElementLength: 1,
      tipCondition: { translation: "fixed", rotation: "fixed" },
    }),
    units,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.schemaVersion, LATERAL_PILE_PY_RESULT_SCHEMA_VERSION);
  approx(result.outputs.response.pileHead.displacement, 12 / (3 * 600));
  approx(result.outputs.response.pileHead.rotation, -12 / (2 * 600));
  approx(
    Math.abs(
      result.outputs.response.extrema.maximumAbsoluteBendingMoment
        .bendingMoment,
    ),
    12,
  );
  approx(result.outputs.equilibrium.normalizedForceEquilibriumResidual, 0);
  approx(result.outputs.equilibrium.normalizedMomentEquilibriumResidual, 0);
});

test("linear p-y mesh approaches the semi-infinite Winkler closed form", () => {
  const material = soil("winkler-soil");
  const ground = groundFixture({
    materials: [material],
    layers: [{
      id: "winkler-layer",
      topElevation: 0,
      bottomElevation: -20,
      materialId: material.id,
    }],
  });
  const stiffnessPerLengthSquared = 1000;
  const flexuralRigidity = 10000;
  const transfer = law({
    id: "linear-p-y",
    points: [
      { displacement: 0, resistancePerLength: 0 },
      {
        displacement: 1,
        resistancePerLength: stiffnessPerLengthSquared,
      },
    ],
    extrapolation: "linear",
  });
  const result = new LateralPileBeamOnSpringsAnalysis().analyze({
    ...ground,
    pile: pile({ embedment: 15 }),
    scenario: responseScenario({
      curvesByLayer: {
        "winkler-layer": {
          stations: [{ depth: 0, law: transfer }],
        },
      },
      shear: 100,
      flexuralRigidity,
      maxElementLength: 0.25,
    }),
    units,
  });
  const beta = (stiffnessPerLengthSquared / (4 * flexuralRigidity)) ** 0.25;
  const expectedDisplacement = 100 / (2 * flexuralRigidity * beta ** 3);
  const expectedRotation = -100 / (2 * flexuralRigidity * beta ** 2);

  assert.equal(result.status, "ok");
  approx(
    result.outputs.response.pileHead.displacement,
    expectedDisplacement,
    8e-4,
  );
  approx(result.outputs.response.pileHead.rotation, expectedRotation, 5e-4);
  assert.ok(
    result.outputs.equilibrium.normalizedForceEquilibriumResidual < 1e-9,
  );
  assert.ok(
    result.outputs.equilibrium.normalizedMomentEquilibriumResidual < 1e-9,
  );
});

test("nonlinear p-y spring and fixed-fixed beam reproduce closed equilibrium", () => {
  const material = soil("nonlinear-soil");
  const ground = groundFixture({
    materials: [material],
    layers: [{
      id: "nonlinear-layer",
      topElevation: 0,
      bottomElevation: -2,
      materialId: material.id,
    }],
  });
  const transfer = law({
    id: "plateau-p-y",
    points: [
      { displacement: 0, resistancePerLength: 0 },
      { displacement: 0.01, resistancePerLength: 10 },
      { displacement: 0.02, resistancePerLength: 10 },
    ],
  });
  const result = new LateralPileBeamOnSpringsAnalysis().analyze({
    ...ground,
    pile: pile({ embedment: 1 }),
    scenario: responseScenario({
      curvesByLayer: {
        "nonlinear-layer": {
          stations: [{ depth: 0.5, law: transfer }],
        },
      },
      shear: 24,
      flexuralRigidity: 100,
      maxElementLength: 1,
      headCondition: { translation: "free", rotation: "fixed" },
      tipCondition: { translation: "fixed", rotation: "fixed" },
      loadSteps: 4,
    }),
    units,
  });
  const expectedDisplacement = (24 - 0.5 * 10) / 1200;

  assert.equal(result.status, "ok");
  approx(result.outputs.response.pileHead.displacement, expectedDisplacement);
  approx(result.outputs.response.nodes[0].spring.mobilizedResistance, 5);
  approx(result.outputs.equilibrium.totalSoilReaction, -5);
  approx(result.outputs.equilibrium.totalTranslationSupportReaction, -19);
  approx(result.outputs.equilibrium.forceEquilibriumResidual, 0, 1e-10);
  approx(result.outputs.equilibrium.momentEquilibriumResidual, 0, 1e-10);
});

test("stratified mesh keeps separate spring contributions at layer interfaces", () => {
  const upper = soil("upper-py-soil");
  const lower = soil("lower-py-soil");
  const ground = groundFixture({
    materials: [upper, lower],
    layers: [{
      id: "upper-py-layer",
      topElevation: 0,
      bottomElevation: -2,
      materialId: upper.id,
    }, {
      id: "lower-py-layer",
      topElevation: -2,
      bottomElevation: -6,
      materialId: lower.id,
    }],
  });
  const upperLaw = law({
    id: "upper-p-y",
    points: [
      { displacement: 0, resistancePerLength: 0 },
      { displacement: 0.1, resistancePerLength: 20 },
    ],
    extrapolation: "linear",
  });
  const lowerLaw = law({
    id: "lower-p-y",
    points: [
      { displacement: 0, resistancePerLength: 0 },
      { displacement: 0.1, resistancePerLength: 50 },
    ],
    extrapolation: "linear",
  });
  const result = new LateralPileBeamOnSpringsAnalysis().analyze({
    ...ground,
    pile: pile({ embedment: 4 }),
    scenario: responseScenario({
      curvesByLayer: {
        "upper-py-layer": {
          stations: [{ depth: 1, law: upperLaw }],
        },
        "lower-py-layer": {
          stations: [{ depth: 3, law: lowerLaw }],
        },
      },
      shear: 10,
      flexuralRigidity: 2000,
      maxElementLength: 1,
      tipCondition: { translation: "fixed", rotation: "free" },
    }),
    units,
  });
  const interfaceNode = result.outputs.response.nodes.find(
    ({ elevation }) => Math.abs(elevation + 2) < 1e-12,
  );
  const contributionLayers = new Set(
    interfaceNode.spring.contributions.map(({ layerId }) => layerId),
  );

  assert.equal(result.status, "ok");
  assert.deepEqual(
    contributionLayers,
    new Set(["upper-py-layer", "lower-py-layer"]),
  );
});

test("application routes p-y scenarios and seismic use remains guarded", () => {
  const material = soil("application-py-soil");
  const layers = [{
    id: "application-py-layer",
    topElevation: 0,
    bottomElevation: -3,
    materialId: material.id,
  }];
  const ground = groundFixture({ materials: [material], layers });
  const transfer = law({
    id: "application-p-y",
    points: [
      { displacement: 0, resistancePerLength: 0 },
      { displacement: 0.1, resistancePerLength: 20 },
    ],
    extrapolation: "linear",
  });
  const scenario = responseScenario({
    curvesByLayer: {
      "application-py-layer": {
        stations: [{ depth: 1, law: transfer }],
      },
    },
    shear: 10,
    flexuralRigidity: 1000,
    maxElementLength: 0.5,
    tipCondition: { translation: "fixed", rotation: "free" },
  });
  const input = {
    ...ground,
    pile: pile({ embedment: 2 }),
    scenario,
    units,
  };
  const plainScenario = scenario.toJSON();
  delete plainScenario.method;
  const applicationResult = new GeotechnicalLateralPileApplication().run({
    ...input,
    scenario: plainScenario,
  });
  const seismicGround = groundFixture({
    materials: [material],
    layers,
    seismic: { model: "pseudostatic", kh: 0.1, kv: 0 },
  });
  const seismicResult = new LateralPileBeamOnSpringsAnalysis().analyze({
    ...input,
    ...seismicGround,
  });

  assert.equal(applicationResult.status, "ok");
  assert.equal(
    applicationResult.outputs.structuralCoupling.responseMode.status,
    "available",
  );
  assert.equal(seismicResult.status, "not-supported");
  assert.match(seismicResult.summary, /static monotonic/);
});
