import test from "node:test";
import assert from "node:assert/strict";

import {
  CalculationResult,
  NTC2018_SEISMIC_LIMIT_STATES,
  NTC2018_SITE_HAZARD_SOURCE_KINDS,
  NTC2018_SUBSOIL_SPECTRUM_COEFFICIENTS,
  NTC2018_TOPOGRAPHIC_AMPLIFICATION_MAXIMA,
  calculateNTC2018HorizontalElasticSpectrum,
  calculateNTC2018HorizontalSpectrumParameters,
  calculateNTC2018StratigraphicSpectrumCoefficients,
  getNTC2018SeismicLimitStateDefinition,
  getNTC2018SubsoilSpectrumCoefficientDefinition,
  getNTC2018TopographicAmplificationDefinition,
  normalizeNTC2018SiteHazardParameters,
  resolveNTC2018TopographicAmplification,
} from "../src/index.js";

function approx(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

function hazardParameters(overrides = {}) {
  return {
    siteReference: "project-site-A",
    limitState: "SLV",
    returnPeriodYears: 475,
    ag: 0.25,
    agUnit: "g",
    f0: 2.5,
    tcStar: 0.35,
    tcStarUnit: "s",
    source: {
      kind: "manual-entry",
      reference: "Site hazard worksheet H-01",
    },
    ...overrides,
  };
}

test("NTC 2018 seismic catalogs expose immutable normative definitions", () => {
  assert.equal(Object.isFrozen(NTC2018_SEISMIC_LIMIT_STATES), true);
  assert.equal(Object.isFrozen(NTC2018_SEISMIC_LIMIT_STATES.SLV), true);
  assert.equal(
    NTC2018_SEISMIC_LIMIT_STATES.SLO
      .nominalExceedanceProbabilityInReferencePeriod,
    0.81,
  );
  assert.deepEqual(
    NTC2018_SITE_HAZARD_SOURCE_KINDS,
    ["manual-entry", "external-service", "documented-study"],
  );
  assert.equal(
    NTC2018_SUBSOIL_SPECTRUM_COEFFICIENTS.D.ssMinimum,
    0.9,
  );
  assert.equal(
    NTC2018_TOPOGRAPHIC_AMPLIFICATION_MAXIMA.T4.maximumCoefficient,
    1.4,
  );

  const limitState = getNTC2018SeismicLimitStateDefinition("SLD");
  limitState.nominalExceedanceProbabilityInReferencePeriod = 0;
  assert.equal(
    getNTC2018SeismicLimitStateDefinition("SLD")
      .nominalExceedanceProbabilityInReferencePeriod,
    0.63,
  );
  assert.equal(
    getNTC2018SubsoilSpectrumCoefficientDefinition("B").ccExponent,
    -0.2,
  );
  assert.equal(
    getNTC2018TopographicAmplificationDefinition("T2").referenceLocation,
    "slope-summit",
  );
});

test("manual and external hazard values normalize to the same technical contract", () => {
  const manual = normalizeNTC2018SiteHazardParameters(hazardParameters());
  const service = normalizeNTC2018SiteHazardParameters(hazardParameters({
    source: {
      kind: "external-service",
      reference: "Site hazard calculation service",
      datasetVersion: "hazard-grid-2025-01",
      resultId: "result-123",
    },
  }));

  assert.equal(manual.schemaVersion, "ntc2018-site-hazard-parameters/v1");
  assert.equal(manual.ag, service.ag);
  assert.equal(manual.f0, service.f0);
  assert.equal(manual.tcStar, service.tcStar);
  assert.equal(manual.agOverG, 0.25);
  assert.equal(manual.agMetersPerSecondSquared, 2.4525);
  assert.equal(manual.nominalExceedanceProbabilityInReferencePeriod, 0.1);
  assert.equal(manual.source.kind, "manual-entry");
  assert.equal(service.source.kind, "external-service");
  assert.equal(service.source.datasetVersion, "hazard-grid-2025-01");
  assert.equal(service.source.resultId, "result-123");
  assert.doesNotThrow(() => JSON.stringify(service));
});

test("site hazard normalization rejects ambiguous units and undocumented data", () => {
  assert.throws(
    () => normalizeNTC2018SiteHazardParameters(hazardParameters({
      agUnit: "m/s2",
    })),
    /agUnit must be 'g'/,
  );
  assert.throws(
    () => normalizeNTC2018SiteHazardParameters(hazardParameters({
      tcStarUnit: "ms",
    })),
    /tcStarUnit must be 's'/,
  );
  assert.throws(
    () => normalizeNTC2018SiteHazardParameters(hazardParameters({ f0: 2.19 })),
    /minimum of 2.2/,
  );
  assert.throws(
    () => normalizeNTC2018SiteHazardParameters(hazardParameters({
      source: {
        kind: "unknown-source",
        reference: "Unsupported source kind",
      },
    })),
    /source.kind must be one of/,
  );
  assert.throws(
    () => normalizeNTC2018SiteHazardParameters(hazardParameters({
      source: {
        kind: "external-service",
      },
    })),
    /source.reference must be a non-empty string/,
  );
});

test("stratigraphic coefficients reproduce Table 3.2.IV and its bounds", () => {
  const categoryA = calculateNTC2018StratigraphicSpectrumCoefficients({
    subsoilCategory: "A",
    agOverG: 0.25,
    f0: 2.5,
    tcStar: 0.35,
  });
  const categoryB = calculateNTC2018StratigraphicSpectrumCoefficients({
    subsoilCategory: "B",
    agOverG: 0.25,
    f0: 2.5,
    tcStar: 0.35,
  });
  const categoryCMaximum = calculateNTC2018StratigraphicSpectrumCoefficients({
    subsoilCategory: "C",
    agOverG: 0.01,
    f0: 2.2,
    tcStar: 0.35,
  });
  const categoryDMinimum = calculateNTC2018StratigraphicSpectrumCoefficients({
    subsoilCategory: "D",
    agOverG: 0.8,
    f0: 3,
    tcStar: 0.35,
  });

  assert.equal(categoryA.ss, 1);
  assert.equal(categoryA.cc, 1);
  approx(categoryB.ss, 1.4 - 0.4 * 2.5 * 0.25);
  approx(categoryB.cc, 1.1 * 0.35 ** -0.2);
  assert.equal(categoryB.ssLimitApplied, "none");
  assert.equal(categoryCMaximum.ss, 1.5);
  assert.equal(categoryCMaximum.ssLimitApplied, "maximum");
  assert.equal(categoryDMinimum.ss, 0.9);
  assert.equal(categoryDMinimum.ssLimitApplied, "minimum");
  assert.throws(
    () => calculateNTC2018StratigraphicSpectrumCoefficients({
      subsoilCategory: "S1",
      agOverG: 0.25,
      f0: 2.5,
      tcStar: 0.35,
    }),
    /Unsupported NTC 2018 simplified-spectrum subsoil category/,
  );
});

test("topographic coefficient distinguishes tabulated maxima from documented values", () => {
  const categoryT1 = resolveNTC2018TopographicAmplification({
    topographicCategory: "T1",
  });
  const categoryT2Maximum = resolveNTC2018TopographicAmplification({
    topographicCategory: "T2",
    atReferenceLocation: true,
  });
  const categoryT4Intermediate = resolveNTC2018TopographicAmplification({
    topographicCategory: "T4",
    coefficient: 1.2,
    coefficientSource: "Topographic interpolation T-01",
  });

  assert.equal(categoryT1.value, 1);
  assert.equal(categoryT2Maximum.value, 1.2);
  assert.equal(
    categoryT2Maximum.selection,
    "ntc2018-tabulated-maximum-at-reference-location",
  );
  assert.equal(categoryT4Intermediate.value, 1.2);
  assert.equal(
    categoryT4Intermediate.sourceReference,
    "Topographic interpolation T-01",
  );
  assert.throws(
    () => resolveNTC2018TopographicAmplification({
      topographicCategory: "T3",
    }),
    /provide exactly one/i,
  );
  assert.throws(
    () => resolveNTC2018TopographicAmplification({
      topographicCategory: "T2",
      coefficient: 1.1,
    }),
    /coefficientSource must be a non-empty string/,
  );
  assert.throws(
    () => resolveNTC2018TopographicAmplification({
      topographicCategory: "T2",
      coefficient: 1.21,
      coefficientSource: "Topographic interpolation T-02",
    }),
    /must be between 1 and 1.2/,
  );
});

test("horizontal spectrum parameters reproduce NTC period and damping equations", () => {
  const parameters = calculateNTC2018HorizontalSpectrumParameters({
    agOverG: 0.25,
    f0: 2.5,
    tcStar: 0.35,
    subsoilCategory: "B",
    topographicCategory: "T1",
  });

  const expectedSs = 1.4 - 0.4 * 2.5 * 0.25;
  const expectedCc = 1.1 * 0.35 ** -0.2;
  const expectedTc = expectedCc * 0.35;
  assert.equal(parameters.eta, 1);
  approx(parameters.ss, expectedSs);
  approx(parameters.s, expectedSs);
  approx(parameters.cc, expectedCc);
  approx(parameters.tc, expectedTc);
  approx(parameters.tb, expectedTc / 3);
  assert.equal(parameters.td, 2.6);

  const highDamping = calculateNTC2018HorizontalSpectrumParameters({
    agOverG: 0.25,
    f0: 2.5,
    tcStar: 0.35,
    subsoilCategory: "A",
    topographicCategory: "T1",
    viscousDampingPercent: 100,
  });
  assert.equal(highDamping.eta, 0.55);
});

test("horizontal elastic spectrum covers all four branches continuously", () => {
  const parameters = calculateNTC2018HorizontalSpectrumParameters({
    agOverG: 0.25,
    f0: 2.5,
    tcStar: 0.35,
    subsoilCategory: "B",
    topographicCategory: "T1",
  });
  const periods = [
    0,
    parameters.tb / 2,
    parameters.tb,
    parameters.tc,
    1,
    parameters.td,
    4,
  ];
  const result = calculateNTC2018HorizontalElasticSpectrum({
    actionId: "seismic-x",
    hazardParameters: hazardParameters(),
    subsoilCategory: "B",
    topographicCategory: "T1",
    periods,
  });
  const points = result.outputs.spectrum.points;
  const plateau = 0.25 * parameters.s * 2.5;

  assert.equal(result instanceof CalculationResult, true);
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.schemaVersion, "ntc2018-horizontal-elastic-spectrum/v1");
  approx(points[0].value, 0.25 * parameters.s);
  approx(points[1].value, (0.25 * parameters.s + plateau) / 2);
  approx(points[2].value, plateau);
  approx(points[3].value, plateau);
  approx(points[4].value, plateau * parameters.tc);
  approx(
    points[5].value,
    plateau * parameters.tc / parameters.td,
  );
  approx(
    points[6].value,
    plateau * parameters.tc * parameters.td / 4 ** 2,
  );
  assert.deepEqual(
    points.map(({ branch }) => branch),
    [
      "rising-acceleration",
      "rising-acceleration",
      "constant-acceleration",
      "constant-velocity",
      "constant-velocity",
      "constant-displacement",
      "constant-displacement",
    ],
  );
  assert.equal(result.outputs.action.id, "seismic-x");
  assert.equal(result.outputs.action.family, "seismic");
  assert.equal(result.outputs.action.nature, "seismic");
  assert.equal(result.outputs.action.metadata.hazardSource.kind, "manual-entry");
  assert.doesNotThrow(() => JSON.stringify(result.toJSON()));
});

test("external-service provenance crosses the boundary without network semantics", () => {
  const result = calculateNTC2018HorizontalElasticSpectrum({
    hazardParameters: hazardParameters({
      source: {
        kind: "external-service",
        reference: "Normalized seismic hazard response",
        datasetVersion: "grid-v2",
        resultId: "job-result-42",
      },
    }),
    subsoilCategory: "C",
    topographicCategory: "T4",
    topographicCoefficient: 1.25,
    topographicCoefficientSource: "Topographic result TOP-42",
    periods: [0, 0.5, 1],
  });

  assert.equal(result.status, "ok");
  assert.equal(
    result.outputs.hazardParameters.source.kind,
    "external-service",
  );
  assert.equal(
    result.outputs.hazardParameters.source.resultId,
    "job-result-42",
  );
  assert.equal(result.outputs.spectrumParameters.st, 1.25);
});

test("horizontal spectrum reports periods above 4 seconds as not supported", () => {
  const result = calculateNTC2018HorizontalElasticSpectrum({
    hazardParameters: hazardParameters(),
    subsoilCategory: "B",
    topographicCategory: "T1",
    periods: [0, 4, 4.01],
  });

  assert.equal(result.status, "not-supported");
  assert.deepEqual(result.outputs.unsupportedPeriods, [4.01]);
  assert.equal(result.outputs.maximumSupportedPeriod, 4);
  assert.equal(result.outputs.spectrum, undefined);
});
