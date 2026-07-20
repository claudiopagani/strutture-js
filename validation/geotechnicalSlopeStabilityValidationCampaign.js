import {
  CircularSlipSurface2D,
  CircularSlopeStabilityAnalysis,
  GeotechnicalDesignSituation,
  GroundModel,
  GroundSection2D,
  PorePressureField2D,
  SoilMaterial,
  ordinaryMethodOfSlices,
  simplifiedBishop,
  spencerMethod,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });
const usaceReference =
  "USACE EM 1110-2-1902 (2003), Appendix C, equations C-12, C-15 and C-16, and Appendix F";
const spencerReference =
  "Spencer (1967), Géotechnique 17(1), 11-26, doi:10.1680/geot.1967.17.1.11; USBR Design Standards No. 13, Chapter 4 (2011), Appendix B";

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

function undrainedCircularSegmentFixture() {
  const material = new SoilMaterial({
    id: "validation-clay",
    name: "Validation clay",
    unitWeight: { bulk: 18 },
    parameterSets: [{
      id: "characteristic-undrained",
      basis: "characteristic",
      drainage: "undrained",
      strength: {
        model: "total-stress-undrained",
        undrainedShearStrength: 25,
      },
      provenance: { source: "validation-case-input" },
    }],
    units,
  });
  const section = new GroundSection2D({
    id: "validation-slope-section",
    surface: { points: [{ x: 0, z: 10 }, { x: 10, z: 0 }] },
    zones: [{
      id: "validation-zone",
      materialId: material.id,
      polygon: [
        { x: 0, z: -20 },
        { x: 10, z: -20 },
        { x: 10, z: 0 },
        { x: 0, z: 10 },
      ],
    }],
    units,
  });
  const field = new PorePressureField2D({
    id: "validation-dry-field",
    model: "none",
    units,
  });
  const groundModel = new GroundModel({
    id: "validation-slope-model",
    materials: [material],
    sections: [section],
    porePressureFields: [field],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "validation-undrained-situation",
    groundModel,
    situationType: "persistent",
    drainageCondition: "undrained",
    requiredParameterBasis: "characteristic",
    sectionId: section.id,
    porePressureFieldId: field.id,
    units,
  });
  const slipSurface = CircularSlipSurface2D.fromChordAndSagitta({
    id: "validation-circle",
    entry: { x: 0, z: 10 },
    exit: { x: 10, z: 0 },
    sagitta: 2,
    units,
  });
  return { groundModel, designSituation, slipSurface };
}

function spencerPhiZeroSlices(horizontalScale) {
  const radius = 10;
  const cohesion = 10;
  const baseLength = 2;
  return [
    { id: "a", vertical: 100, alphaDegrees: 20 },
    { id: "b", vertical: 80, alphaDegrees: 10 },
  ].map((input) => {
    const alpha = input.alphaDegrees * Math.PI / 180;
    const horizontal = horizontalScale * input.vertical;
    const tangentDriving = input.vertical * Math.sin(alpha) +
      horizontal * Math.cos(alpha);
    return {
      id: input.id,
      width: 1,
      baseLength,
      totalVerticalLoad: input.vertical,
      horizontalSeismicLoad: horizontal,
      baseInclination: alpha,
      cohesion,
      frictionAngle: 0,
      porePressure: 0,
      stressBasis: "total",
      baseMomentArm: radius,
      drivingMoment: tangentDriving * radius,
    };
  });
}

function evaluateSpencerPhiZero(horizontalScale) {
  const slices = spencerPhiZeroSlices(horizontalScale);
  const independentFactor = slices.reduce(
    (sum, slice) =>
      sum + slice.cohesion * slice.baseLength * slice.baseMomentArm,
    0,
  ) / slices.reduce((sum, slice) => sum + slice.drivingMoment, 0);
  const result = spencerMethod(slices);
  return {
    factorDifference: result.factorOfSafety - independentFactor,
    inclination: result.intersliceForceInclination,
    residualNorm: result.equilibrium.residualNorm,
    localResidual: result.equilibrium.maximumLocalShearResidual,
  };
}

function validationCases() {
  return [
    {
      id: "usace-slice-equations-independent-arithmetic",
      title: "Ordinary and Simplified Bishop slice-equation arithmetic",
      source: usaceReference,
      sourceKind: "primary-method-reference-and-independent-arithmetic",
      assumptions: [
        "Two assigned slices; loads are vertical and external water is absent.",
        "Expected values were evaluated independently from the published equations before calling the kernels.",
      ],
      evaluate() {
        const slices = [
          {
            width: 2,
            baseLength: 2.1,
            totalVerticalLoad: 100,
            baseInclination: 20 * Math.PI / 180,
            cohesion: 5,
            frictionAngle: 30 * Math.PI / 180,
            porePressure: 10,
            stressBasis: "effective",
          },
          {
            width: 2,
            baseLength: 2.1,
            totalVerticalLoad: 80,
            baseInclination: -5 * Math.PI / 180,
            cohesion: 5,
            frictionAngle: 30 * Math.PI / 180,
            porePressure: 5,
            stressBasis: "effective",
          },
        ];
        return {
          ordinary: ordinaryMethodOfSlices(slices).factorOfSafety,
          bishop: simplifiedBishop(slices).factorOfSafety,
        };
      },
      expectations: [
        {
          id: "ordinary-factor",
          path: "ordinary",
          expected: 3.8393296189203707,
          tolerance: 1e-12,
        },
        {
          id: "bishop-factor",
          path: "bishop",
          expected: 3.935106297581459,
          tolerance: 1e-12,
        },
      ],
    },
    {
      id: "circular-segment-area-and-weight",
      title: "Circular sliding-mass area and homogeneous weight",
      source:
        `${usaceReference}; exact circular-segment geometry evaluated independently`,
      sourceKind:
        "primary-discretization-reference-and-independent-analytic-geometry",
      assumptions: [
        "Straight ground chord of length sqrt(200) m and circular sagitta of 2 m.",
        "Radius is 13.5 m; exact segment area is r^2 acos((r-s)/r) - (r-s)sqrt(2rs-s^2).",
        "Homogeneous total unit weight is 18 kN/m3 and the out-of-plane width is one metre.",
      ],
      evaluate() {
        const fixture = undrainedCircularSegmentFixture();
        const result = new CircularSlopeStabilityAnalysis().analyze({
          ...fixture,
          sliceCount: 40,
          units,
        });
        const slices = result.outputs.discretization.slices;
        return {
          area: slices.reduce((sum, slice) => sum + slice.area, 0),
          weight: slices.reduce((sum, slice) => sum + slice.selfWeight, 0),
        };
      },
      expectations: [
        {
          id: "exact-area",
          path: "area",
          expected: 19.154520477875764,
          tolerance: 1e-8,
          units: "m2",
        },
        {
          id: "exact-weight",
          path: "weight",
          expected: 344.78136860176375,
          tolerance: 2e-7,
          units: "kN/m",
        },
      ],
    },
    {
      id: "undrained-phi-zero-method-identity",
      title: "Bishop/Ordinary identity for compatible phi-zero slices",
      source: usaceReference,
      sourceKind: "primary-method-reference-and-independent-limit-case",
      assumptions: [
        "Total-stress strength with phi_u=0 and no pore-pressure subtraction.",
        "Each base length is width/cos(alpha), so the cohesion terms in the two formulations are identical.",
      ],
      evaluate() {
        const firstAlpha = 20 * Math.PI / 180;
        const secondAlpha = -5 * Math.PI / 180;
        const slices = [
          {
            width: 2,
            baseLength: 2 / Math.cos(firstAlpha),
            totalVerticalLoad: 100,
            baseInclination: firstAlpha,
            cohesion: 25,
            frictionAngle: 0,
            porePressure: 100,
            stressBasis: "total",
          },
          {
            width: 2,
            baseLength: 2 / Math.cos(secondAlpha),
            totalVerticalLoad: 80,
            baseInclination: secondAlpha,
            cohesion: 25,
            frictionAngle: 0,
            porePressure: 100,
            stressBasis: "total",
          },
        ];
        const ordinary = ordinaryMethodOfSlices(slices).factorOfSafety;
        const bishop = simplifiedBishop(slices).factorOfSafety;
        return { absoluteDifference: Math.abs(bishop - ordinary) };
      },
      expectations: [{
        id: "method-identity",
        path: "absoluteDifference",
        expected: 0,
        tolerance: 1e-12,
      }],
    },
    {
      id: "spencer-static-phi-zero-closed-form",
      title: "Spencer static force/moment closure in a phi-zero limit case",
      source: spencerReference,
      sourceKind: "primary-method-reference-and-independent-limit-case",
      assumptions: [
        "Two total-stress slices share a 10 m circular base moment arm.",
        "For phi=0, overall moment equilibrium independently gives F=sum(c L R)/sum(Mdrive).",
        "The selected slice actions are symmetric about theta=15 degrees in the force recurrence.",
      ],
      evaluate() {
        return evaluateSpencerPhiZero(0);
      },
      expectations: [
        {
          id: "closed-form-factor",
          path: "factorDifference",
          expected: 0,
          tolerance: 1e-12,
        },
        {
          id: "interslice-inclination",
          path: "inclination",
          expected: 15 * Math.PI / 180,
          tolerance: 1e-12,
          units: "rad",
        },
        {
          id: "global-equilibrium",
          path: "residualNorm",
          expected: 0,
          tolerance: 1e-12,
        },
      ],
    },
    {
      id: "spencer-pseudostatic-phi-zero-closed-form",
      title: "Spencer pseudostatic force/moment closure in a phi-zero limit case",
      source: spencerReference,
      sourceKind: "primary-method-reference-and-independent-limit-case",
      assumptions: [
        "The horizontal inertia action equals 0.1 times each assigned vertical slice load.",
        "The independent moment expression includes V sin(alpha)+H cos(alpha).",
        "Surface-load inertia, external water and dynamic displacement are outside this benchmark.",
      ],
      evaluate() {
        return evaluateSpencerPhiZero(0.1);
      },
      expectations: [
        {
          id: "pseudostatic-closed-form-factor",
          path: "factorDifference",
          expected: 0,
          tolerance: 1e-12,
        },
        {
          id: "pseudostatic-interslice-inclination",
          path: "inclination",
          expected: 15 * Math.PI / 180,
          tolerance: 1e-12,
          units: "rad",
        },
        {
          id: "local-force-equilibrium",
          path: "localResidual",
          expected: 0,
          tolerance: 1e-12,
        },
      ],
    },
  ];
}

export function runGeotechnicalSlopeStabilityValidationCampaign() {
  const results = validationCases().map(evaluateCase);
  const passed = results.filter((result) => result.status === "ok").length;
  return {
    id: "geotechnical-slope-stability-validation-campaign",
    status: passed === results.length ? "ok" : "failed",
    caseCount: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export function formatGeotechnicalSlopeStabilityValidationReport(campaign) {
  const lines = [
    "# Geotechnical slope-stability validation campaign",
    "",
    `Status: ${campaign.status}`,
    `Cases: ${campaign.caseCount}; passed: ${campaign.passed}; failed: ${campaign.failed}`,
    "",
  ];
  for (const result of campaign.results) {
    lines.push(`- ${result.id}: ${result.status} (${result.source})`);
  }
  return lines.join("\n");
}
