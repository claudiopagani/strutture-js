import {
  CircularSlipSurface2D,
  CircularSlopeStabilityAnalysis,
  GeotechnicalDesignSituation,
  GroundModel,
  GroundAnchorStabilityAction2D,
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
const groundAnchorReference =
  "FHWA GEC 4, Ground Anchors and Anchored Systems, FHWA-IF-99-015 (1999), section 5.8.3.2";

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

function groundAnchorInteractionFixture({ id, freeLength, bondLength }) {
  const inclination = 10 * Math.PI / 180;
  const pointAtDistance = (distance) => ({
    x: 8 - distance * Math.cos(inclination),
    z: 2 - distance * Math.sin(inclination),
  });
  return new GroundAnchorStabilityAction2D({
    id,
    head: pointAtDistance(0),
    bondStart: pointAtDistance(freeLength),
    bondEnd: pointAtDistance(freeLength + bondLength),
    designTendonForce: 100,
    horizontalSpacing: 1,
    sourceVerificationStatus: "ok",
    units,
    provenance: { source: "validation-case-input" },
  });
}

function evaluateGroundAnchorMobilization() {
  const slipSurface = CircularSlipSurface2D.fromChordAndSagitta({
    id: "anchor-validation-circle",
    entry: { x: 0, z: 10 },
    exit: { x: 10, z: 0 },
    sagitta: 2,
    movementDirection: "left-to-right",
    units,
  });
  const full = groundAnchorInteractionFixture({
    id: "full-anchor",
    freeLength: 3,
    bondLength: 2,
  }).evaluateForSlipSurface(slipSurface);
  const partial = groundAnchorInteractionFixture({
    id: "partial-anchor",
    freeLength: 1,
    bondLength: 4,
  }).evaluateForSlipSurface(slipSurface);
  const enclosed = groundAnchorInteractionFixture({
    id: "enclosed-anchor",
    freeLength: 0.5,
    bondLength: 1,
  }).evaluateForSlipSurface(slipSurface);
  return {
    fullRatio: full.mobilizationRatio,
    partialIntersectionDistance: partial.intersectionDistance,
    partialRatio: partial.mobilizationRatio,
    partialForcePerUnitWidth: partial.mobilizedForcePerUnitWidth,
    enclosedRatio: enclosed.mobilizationRatio,
  };
}

function evaluateSpencerExternalPointForce() {
  const radius = 10;
  const slices = [
    { id: "a", vertical: 100, alphaDegrees: 20 },
    { id: "b", vertical: 80, alphaDegrees: 10 },
  ].map((input, index) => {
    const alpha = input.alphaDegrees * Math.PI / 180;
    return {
      id: input.id,
      width: 1,
      baseLength: 2,
      totalVerticalLoad: input.vertical,
      horizontalSeismicLoad: 0,
      baseInclination: alpha,
      cohesion: 10,
      frictionAngle: 0,
      porePressure: 0,
      stressBasis: "total",
      baseMomentArm: radius,
      drivingMoment: input.vertical * Math.sin(alpha) * radius,
      externalPointLoads: index === 0 ? [{
        id: "validation-anchor-force",
        horizontalForceInMovementDirection: -10,
        verticalDownwardForce: 2,
        drivingMoment: -80,
      }] : [],
    };
  });
  const independentFactor = 400 / (
    slices.reduce((sum, slice) => sum + slice.drivingMoment, 0) - 80
  );
  const result = spencerMethod(slices);
  return {
    factorDifference: result.factorOfSafety - independentFactor,
    residualNorm: result.equilibrium.residualNorm,
    externalHorizontalLoad:
      result.sliceContributions[0].externalHorizontalLoad,
    externalVerticalLoad:
      result.sliceContributions[0].externalVerticalLoad,
    externalMoment:
      result.sliceContributions[0].externalDrivingMoment,
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
    {
      id: "fhwa-ground-anchor-surface-intersection",
      title: "FHWA full, proportional and zero ground-anchor restraint",
      source: groundAnchorReference,
      sourceKind: "primary-design-reference-and-independent-line-circle-geometry",
      assumptions: [
        "The straight anchor intersects the assigned circle once at 2.002943894280822 m from its head, obtained independently from the line-circle quadratic equation.",
        "Uniform bond stress makes the partial force ratio equal to remaining bond length divided by total bond length.",
        "The force is converted to one metre out-of-plane width by dividing one anchor force by its horizontal spacing.",
      ],
      evaluate: evaluateGroundAnchorMobilization,
      expectations: [
        {
          id: "full-force-ratio",
          path: "fullRatio",
          expected: 1,
          tolerance: 1e-12,
        },
        {
          id: "independent-intersection-distance",
          path: "partialIntersectionDistance",
          expected: 2.002943894280822,
          tolerance: 1e-12,
          units: "m",
        },
        {
          id: "proportional-bond-force-ratio",
          path: "partialRatio",
          expected: 0.7492640264297944,
          tolerance: 1e-12,
        },
        {
          id: "proportional-line-force",
          path: "partialForcePerUnitWidth",
          expected: 74.92640264297944,
          tolerance: 1e-10,
          units: "kN/m",
        },
        {
          id: "enclosed-anchor-zero-force",
          path: "enclosedRatio",
          expected: 0,
          tolerance: 1e-12,
        },
      ],
    },
    {
      id: "spencer-ground-anchor-point-force-closed-form",
      title: "Spencer equilibrium with a resisting ground-anchor point force",
      source: `${spencerReference}; ${groundAnchorReference}`,
      sourceKind: "primary-method-reference-and-independent-limit-case",
      assumptions: [
        "The phi-zero limit gives F=sum(c L R)/sum(Mdrive) independently of the force recurrence.",
        "The assigned anchor action contributes -10 kN/m horizontally, +2 kN/m downward and -80 kNm/m to the driving moment.",
      ],
      evaluate: evaluateSpencerExternalPointForce,
      expectations: [
        {
          id: "external-force-closed-form-factor",
          path: "factorDifference",
          expected: 0,
          tolerance: 1e-12,
        },
        {
          id: "external-horizontal-force",
          path: "externalHorizontalLoad",
          expected: -10,
          tolerance: 1e-12,
          units: "kN/m",
        },
        {
          id: "external-vertical-force",
          path: "externalVerticalLoad",
          expected: 2,
          tolerance: 1e-12,
          units: "kN/m",
        },
        {
          id: "external-force-moment",
          path: "externalMoment",
          expected: -80,
          tolerance: 1e-12,
          units: "kNm/m",
        },
        {
          id: "external-force-global-equilibrium",
          path: "residualNorm",
          expected: 0,
          tolerance: 1e-9,
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
