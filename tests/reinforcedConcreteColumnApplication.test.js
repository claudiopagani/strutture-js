import test from "node:test";
import assert from "node:assert/strict";

import {
  RectangularSection,
  ReinforcedConcreteColumnApplication,
  ReinforcedConcreteColumnModel,
  ReinforcedConcreteSection,
  ReinforcementBar,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

function createFixture({
  effectiveLength = 3000,
  actions = {},
  stability = {},
  shear = null,
  detailing = null,
} = {}) {
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
  const coordinates = [
    [50, 50],
    [50, 250],
    [450, 50],
    [450, 250],
  ];
  const section = new ReinforcedConcreteSection({
    id: "column-section",
    concreteSection,
    concreteMaterial,
    reinforcementMaterial,
    reinforcementBars: coordinates.map(
      ([y, z], index) =>
        new ReinforcementBar({
          id: `bar-${index + 1}`,
          diameter: 20,
          y,
          z,
          material: reinforcementMaterial,
          units,
        }),
    ),
    units,
  });

  return new ReinforcedConcreteColumnModel({
    id: "column-01",
    section,
    concreteMaterial,
    reinforcementMaterial,
    length: 3000,
    stability: {
      effectiveLengthMx: effectiveLength,
      effectiveLengthMy: effectiveLength,
      biaxialAngleCount: 32,
      ...stability,
    },
    actions: {
      nEd: -800e3,
      mxEd: 40e6,
      myEd: 15e6,
      ...actions,
    },
    shear,
    detailing,
    mesh: { targetFiberCount: 120 },
    units,
  });
}

test("RC column application verifies a stocky column with the biaxial fiber domain", () => {
  const result = new ReinforcedConcreteColumnApplication().run({
    model: createFixture(),
  });

  assert.equal(result.applicationId, "reinforced-concrete-columns");
  assert.equal(result.status, "ok");
  assert.ok(result.outputs.lambdaLimit > 0);
  assert.equal(result.outputs.axes.mx.secondOrderRequired, false);
  assert.equal(result.outputs.axes.my.secondOrderRequired, false);
  assert.ok(
    result.checks.some((check) => check.id === "rc-column-biaxial-resistance"),
  );
  assert.ok(Number.isFinite(result.utilizationRatio));
});

test("RC column application normalizes a serializable model DTO", () => {
  const source = createFixture();
  const result = new ReinforcedConcreteColumnApplication().run({
    model: {
      id: "column-json",
      section: source.section,
      concreteMaterial: source.concreteMaterial,
      reinforcementMaterial: source.reinforcementMaterial,
      length: 3,
      stability: {
        effectiveLengthMx: 3,
        effectiveLengthMy: 3,
        biaxialAngleCount: 32,
      },
      actions: { nEd: -800, mxEd: 40, myEd: 15 },
      mesh: source.mesh,
      solver: source.solver,
      units: { force: "kN", length: "m" },
    },
    metadata: { source: "serialized-contract" },
  });

  assert.equal(result.outputs.designActions.nEd, -800e3);
  assert.equal(result.outputs.designActions.mxEd, 40e6);
  assert.equal(result.outputs.designActions.myEd, 15e6);
  assert.equal(result.metadata.source, "serialized-contract");
});

test("RC column application rejects a slender column without second-order moments", () => {
  const result = new ReinforcedConcreteColumnApplication().run({
    model: createFixture({ effectiveLength: 6000 }),
  });

  assert.equal(result.status, "not-supported");
  assert.ok(result.metadata.unresolvedAxes.includes("mx"));
  assert.ok(result.metadata.unresolvedAxes.includes("my"));
  assert.equal(result.outputs.sectionResult, undefined);
});

test("RC column application accepts explicit total moments for slender axes", () => {
  const result = new ReinforcedConcreteColumnApplication().run({
    model: createFixture({
      effectiveLength: 6000,
      actions: {
        mxEdTotal: 45e6,
        myEdTotal: 20e6,
      },
    }),
  });

  assert.notEqual(result.status, "not-supported");
  assert.equal(result.outputs.axes.mx.secondOrderIncluded, true);
  assert.equal(result.outputs.axes.my.secondOrderIncluded, true);
  assert.equal(result.outputs.designActions.mxEd, 45e6);
  assert.equal(result.outputs.designActions.myEd, 20e6);
});

test("RC column application generates nominal-stiffness second-order moments", () => {
  const result = new ReinforcedConcreteColumnApplication().run({
    model: createFixture({
      effectiveLength: 6000,
      stability: { creepCoefficient: 2 },
    }),
  });

  assert.notEqual(result.status, "not-supported");
  assert.equal(result.outputs.axes.mx.secondOrderIncluded, true);
  assert.equal(result.outputs.axes.my.secondOrderIncluded, true);
  assert.ok(result.outputs.axes.mx.generatedTotalMoment > 40e6);
  assert.ok(result.outputs.axes.my.generatedTotalMoment > 15e6);
  assert.equal(
    result.outputs.axes.mx.secondOrderMethod,
    "ntc2018-nominal-stiffness",
  );
});

test("RC column application verifies shear and seismic confinement contracts", () => {
  const result = new ReinforcedConcreteColumnApplication().run({
    model: createFixture({
      actions: { vxEd: 80e3, vyEd: 60e3 },
      shear: {
        x: {
          mode: "with-transverse-reinforcement",
          method: "ntc2018",
          bw: 300,
          effectiveDepth: 450,
          longitudinalReinforcementArea: 1256,
          transverseReinforcement: { diameter: 8, legs: 2, spacing: 100 },
        },
        y: {
          mode: "with-transverse-reinforcement",
          method: "ntc2018",
          bw: 500,
          effectiveDepth: 250,
          longitudinalReinforcementArea: 1256,
          transverseReinforcement: { diameter: 8, legs: 2, spacing: 100 },
        },
      },
      detailing: {
        longitudinal: {
          area: 2400,
          minimumBarDiameter: 20,
          maximumBarDiameter: 20,
          maximumBarSpacing: 180,
        },
        transverse: { diameter: 8, spacing: 90 },
        seismic: {
          enabled: true,
          ductilityClass: "CDB",
          clearHeight: 3000,
          sectionDepthInBending: 500,
          curvatureDuctilityDemand: 2,
        },
        confinement: {
          coreWidth: 260,
          coreDepth: 460,
          volumePerSet: 150000,
          restrainedBarSpacings: [100, 100, 100, 100],
        },
      },
    }),
  });

  assert.ok(result.outputs.shear.x);
  assert.ok(result.outputs.shear.y);
  assert.ok(result.outputs.detailing.outputs.seismic.criticalZoneLength > 0);
  const xShearCheck = result.checks.find(
    (check) => check.metadata?.axis === "x" &&
      check.metadata?.analysisShear != null,
  );
  const yShearCheck = result.checks.find(
    (check) => check.metadata?.axis === "y" &&
      check.metadata?.analysisShear != null,
  );

  assert.equal(xShearCheck.metadata.analysisShear, 80e3);
  assert.equal(yShearCheck.metadata.analysisShear, 60e3);
  assert.ok(
    result.checks.some((check) => check.metadata?.axis === "x"),
  );
  assert.ok(
    result.checks.some((check) => check.id === "rc-column-seismic-omega-wd"),
  );
});
