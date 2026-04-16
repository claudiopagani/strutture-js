import {
  BeamSectionActionVerifier,
  RectangularSection,
  ReinforcedConcreteSection,
  ReinforcedConcreteShearVerification,
  ReinforcedConcreteServiceabilityVerification,
  ReinforcementBar,
  SingleBeamAnalysis,
  SteelMaterial,
  classifySteelSection,
  createLongitudinalReinforcementLayout,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  createNTC2018StructuralSteelMaterial,
  createSteelProfileSection,
} from "../src/index.js";

const femUnits = Object.freeze({ force: "kN", length: "m" });
const sectionUnits = Object.freeze({ force: "N", length: "mm" });

function round(value, decimals = 9) {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;
}

function getPath(value, path) {
  return String(path)
    .split(".")
    .reduce((current, key) => current?.[key], value);
}

function createSteelMaterial() {
  return new SteelMaterial({
    name: "S275",
    grade: "S275",
    elasticModulus: 210000,
    shearModulus: 80769.23076923077,
    fyk: 275,
    units: sectionUnits,
  });
}

function createDemoSection() {
  return new RectangularSection({
    width: 100,
    height: 200,
    units: sectionUnits,
  });
}

function createGroupedRcServiceabilityFixture() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units: sectionUnits,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units: sectionUnits,
  });
  const concreteSection = new RectangularSection({
    width: 300,
    height: 500,
    units: sectionUnits,
  });
  const reinforcementLayout = createLongitudinalReinforcementLayout({
    section: concreteSection,
    material: reinforcementMaterial,
    units: sectionUnits,
    bottom: {
      id: "bottom-main",
      diameter: 16,
      count: 2,
      cover: 40,
    },
    top: {
      id: "top-main",
      diameter: 16,
      count: 2,
      cover: 40,
    },
  });
  const section = new ReinforcedConcreteSection({
    id: "validation-rc-sle-section",
    name: "Validation RC SLE section",
    concreteSection,
    reinforcementBars: reinforcementLayout.reinforcementBars,
    concreteMaterial,
    reinforcementMaterial,
    units: sectionUnits,
    metadata: {
      longitudinalReinforcementGroups:
        reinforcementLayout.longitudinalReinforcementGroups,
    },
  });

  return {
    section,
    concreteMaterial,
    reinforcementMaterial,
  };
}

function findCheck(result, id) {
  return result.checks.find((check) => check.id === id);
}

function simplySupportedUniformLoadCase() {
  return {
    id: "beam-eb-simply-supported-udl",
    title: "Euler-Bernoulli beam, simply supported, uniform load",
    category: "beam-analysis",
    source: "Closed-form elastic beam formulas",
    notes: "Reference values use qL/2, qL^2/8 and 5qL^4/(384EI).",
    evaluate() {
      const result = new SingleBeamAnalysis().analyze({
        id: "validation-eb-udl",
        units: femUnits,
        geometry: {
          start: { x: 0, y: 0 },
          end: { x: 4, y: 0 },
        },
        section: createDemoSection(),
        material: createSteelMaterial(),
        supports: {
          start: "hinge",
          end: "roller",
        },
        loads: [
          {
            id: "g1",
            actionType: "G1",
            type: "uniform",
            value: -2,
          },
        ],
        discretization: {
          elementCount: 4,
        },
        combinations: false,
      });
      const loadCase = result.loadCases.G1;
      const midspan = loadCase.displacements.samples.find(
        (sample) => sample.station === 2,
      );

      return {
        leftReaction: loadCase.reactionByNode["validation-eb-udl-beam-node-1"].uy,
        rightReaction: loadCase.reactionByNode["validation-eb-udl-beam-node-5"].uy,
        maxMoment: loadCase.internalForces.maxAbsBendingMoment.m,
        midspanDeflection: midspan.uy,
      };
    },
    expectations: [
      { id: "left-reaction", path: "leftReaction", expected: 4, tolerance: 1e-9 },
      { id: "right-reaction", path: "rightReaction", expected: 4, tolerance: 1e-9 },
      { id: "max-moment", path: "maxMoment", expected: 4, tolerance: 1e-9 },
      {
        id: "midspan-deflection",
        path: "midspanDeflection",
        expected: (-5 * 2 * 4 ** 4) / (384 * 14000),
        tolerance: 1e-12,
      },
    ],
  };
}

function steelClassificationCase() {
  return {
    id: "steel-ipe200-classification-pure-bending",
    title: "Steel IPE200 classification in pure My bending",
    category: "steel",
    source: "NTC/EC3 local classification limits implemented in SteelSectionClassification",
    notes: "Pure bending reference for a stock IPE200 S275 profile.",
    evaluate() {
      const material = createNTC2018StructuralSteelMaterial({
        grade: "S275",
        units: femUnits,
      });
      const section = createSteelProfileSection({
        profileName: "IPE200",
        units: femUnits,
      });
      const classification = classifySteelSection({
        section,
        material,
        nEd: 0,
        mEd: 2e7,
      });

      return {
        status: classification.status,
        sectionClass: classification.class,
        flangeClass: classification.parts.find((part) => part.id === "flange")?.class,
        webClass: classification.parts.find((part) => part.id === "web")?.class,
      };
    },
    expectations: [
      { id: "status", path: "status", expected: "ok", type: "equal" },
      { id: "section-class", path: "sectionClass", expected: 1, type: "equal" },
      { id: "flange-class", path: "flangeClass", expected: 1, type: "equal" },
      { id: "web-class", path: "webClass", expected: 1, type: "equal" },
    ],
  };
}

function rcServiceStressLimitCase() {
  return {
    id: "rc-sle-stress-limit-factors",
    title: "RC SLE stress limit factors",
    category: "reinforced-concrete-sle",
    source: "NTC 2018 4.1.2.2.5 stress limits",
    notes: "Rare and quasi-permanent combinations expose 0.60 fck, 0.45 fck and 0.80 fyk factors.",
    evaluate() {
      const { section, concreteMaterial, reinforcementMaterial } =
        createGroupedRcServiceabilityFixture();
      const verifier = new ReinforcedConcreteServiceabilityVerification();
      const rareResult = verifier.verify({
        section,
        concreteMaterial,
        reinforcementMaterial,
        actions: {
          nEd: 0,
          mEd: 1e7,
        },
        combinationType: "SLE_RARE",
      });
      const quasiPermanentResult = verifier.verify({
        section,
        concreteMaterial,
        reinforcementMaterial,
        actions: {
          nEd: 0,
          mEd: 1e7,
        },
        combinationType: "SLE_QUASI_PERMANENT",
      });

      return {
        rareConcreteLimit: findCheck(rareResult, "rc-sle-concrete-stress")?.capacity,
        rareSteelLimit: findCheck(rareResult, "rc-sle-steel-stress")?.capacity,
        quasiPermanentConcreteLimit: findCheck(
          quasiPermanentResult,
          "rc-sle-concrete-stress",
        )?.capacity,
        quasiPermanentSteelCheckMissing:
          findCheck(quasiPermanentResult, "rc-sle-steel-stress") == null,
      };
    },
    expectations: [
      { id: "rare-concrete", path: "rareConcreteLimit", expected: 15, tolerance: 1e-12 },
      { id: "rare-steel", path: "rareSteelLimit", expected: 360, tolerance: 1e-12 },
      {
        id: "quasi-permanent-concrete",
        path: "quasiPermanentConcreteLimit",
        expected: 11.25,
        tolerance: 1e-12,
      },
      {
        id: "quasi-permanent-steel-missing",
        path: "quasiPermanentSteelCheckMissing",
        expected: true,
        type: "equal",
      },
    ],
  };
}

function rcCrackEnvironmentMappingCase() {
  return {
    id: "rc-sle-crack-environment-mapping",
    title: "RC SLE crack class by environment and combination",
    category: "reinforced-concrete-sle",
    source: "Circolare explanatory table mapping implemented in serviceability verifier",
    notes: "Ordinary, aggressive and very aggressive environments are checked for frequent and quasi-permanent combinations.",
    evaluate() {
      const { section, concreteMaterial, reinforcementMaterial } =
        createGroupedRcServiceabilityFixture();
      const verifier = new ReinforcedConcreteServiceabilityVerification();
      const cases = [
        ["ordinary", "SLE_FREQUENT", "ordinaryFrequent"],
        ["ordinary", "SLE_QUASI_PERMANENT", "ordinaryQuasiPermanent"],
        ["aggressive", "SLE_FREQUENT", "aggressiveFrequent"],
        ["aggressive", "SLE_QUASI_PERMANENT", "aggressiveQuasiPermanent"],
        ["very_aggressive", "SLE_FREQUENT", "veryAggressiveFrequent"],
        [
          "very_aggressive",
          "SLE_QUASI_PERMANENT",
          "veryAggressiveQuasiPermanent",
        ],
      ];

      return Object.fromEntries(
        cases.map(([environment, combinationType, key]) => {
          const result = verifier.verify({
            section,
            concreteMaterial,
            reinforcementMaterial,
            actions: {
              nEd: 0,
              mEd: 0,
            },
            combinationType,
            serviceability: {
              cracking: {
                environment,
              },
            },
          });

          return [key, result.outputs.crackWidthClass];
        }),
      );
    },
    expectations: [
      { id: "ordinary-frequent", path: "ordinaryFrequent", expected: "w3", type: "equal" },
      {
        id: "ordinary-quasi-permanent",
        path: "ordinaryQuasiPermanent",
        expected: "w2",
        type: "equal",
      },
      {
        id: "aggressive-frequent",
        path: "aggressiveFrequent",
        expected: "w2",
        type: "equal",
      },
      {
        id: "aggressive-quasi-permanent",
        path: "aggressiveQuasiPermanent",
        expected: "w1",
        type: "equal",
      },
      {
        id: "very-aggressive-frequent",
        path: "veryAggressiveFrequent",
        expected: "w1",
        type: "equal",
      },
      {
        id: "very-aggressive-quasi-permanent",
        path: "veryAggressiveQuasiPermanent",
        expected: "w1",
        type: "equal",
      },
    ],
  };
}

function rcCrackTensionGroupSelectionCase() {
  return {
    id: "rc-sle-crack-tension-group-selection",
    title: "RC SLE top/bottom crack-control group selection",
    category: "reinforced-concrete-sle",
    source: "Declared top/bottom reinforcement group contract",
    notes: "Positive My selects bottom bars; negative My selects top bars.",
    evaluate() {
      const { section, concreteMaterial, reinforcementMaterial } =
        createGroupedRcServiceabilityFixture();
      const verifier = new ReinforcedConcreteServiceabilityVerification();
      const positiveMoment = verifier.verify({
        section,
        concreteMaterial,
        reinforcementMaterial,
        actions: {
          nEd: 0,
          mEd: 4e7,
        },
        combinationType: "SLE_FREQUENT",
      });
      const negativeMoment = verifier.verify({
        section,
        concreteMaterial,
        reinforcementMaterial,
        actions: {
          nEd: 0,
          mEd: -4e7,
        },
        combinationType: "SLE_FREQUENT",
      });

      return {
        positiveStatus: positiveMoment.status,
        positiveGroup: positiveMoment.outputs.crackControlGroupId,
        positiveFace: positiveMoment.outputs.crackControlFace,
        positiveBars: positiveMoment.outputs.tensileBars
          .map((bar) => bar.id)
          .join(","),
        negativeStatus: negativeMoment.status,
        negativeGroup: negativeMoment.outputs.crackControlGroupId,
        negativeFace: negativeMoment.outputs.crackControlFace,
        negativeBars: negativeMoment.outputs.tensileBars
          .map((bar) => bar.id)
          .join(","),
      };
    },
    expectations: [
      { id: "positive-status", path: "positiveStatus", expected: "ok", type: "equal" },
      {
        id: "positive-group",
        path: "positiveGroup",
        expected: "bottom-main",
        type: "equal",
      },
      { id: "positive-face", path: "positiveFace", expected: "bottom", type: "equal" },
      {
        id: "positive-bars",
        path: "positiveBars",
        expected: "bottom-main-1,bottom-main-2",
        type: "equal",
      },
      { id: "negative-status", path: "negativeStatus", expected: "ok", type: "equal" },
      {
        id: "negative-group",
        path: "negativeGroup",
        expected: "top-main",
        type: "equal",
      },
      { id: "negative-face", path: "negativeFace", expected: "top", type: "equal" },
      {
        id: "negative-bars",
        path: "negativeBars",
        expected: "top-main-1,top-main-2",
        type: "equal",
      },
    ],
  };
}

function rcShearExcelRegressionCase() {
  return {
    id: "rc-shear-stirrups-cottheta-optimization",
    title: "RC shear with vertical stirrups and cotTheta optimization",
    category: "reinforced-concrete",
    source: "User spreadsheet regression for NTC 2018 4.1.2.3.5.2",
    notes: "The selected resistance is the maximum between stirrup and no-stirrup mechanisms.",
    evaluate() {
      const concreteMaterial = createNTC2018ConcreteMaterial({
        strengthClass: "C25/30",
        units: sectionUnits,
      });
      const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
        grade: "B450C",
        units: sectionUnits,
      });
      const concreteSection = new RectangularSection({
        width: 1250,
        height: 240,
        units: sectionUnits,
      });
      const section = new ReinforcedConcreteSection({
        id: "rc-shear-validation-section",
        name: "RC shear validation section",
        concreteSection,
        concreteMaterial,
        reinforcementMaterial,
        units: sectionUnits,
      });
      const result = new ReinforcedConcreteShearVerification().verify({
        section,
        concreteMaterial,
        reinforcementMaterial,
        actions: {
          vEd: 60000,
          nEd: 0,
        },
        shear: {
          mode: "with-transverse-reinforcement",
          bw: 1250,
          effectiveDepth: 200,
          longitudinalReinforcementArea: 1847.2564803107985,
          fck: 16,
          gammaC: 1.8,
          alphaCc: 0.85,
          cotThetaMin: 1,
          cotThetaMax: 2.5,
          transverseReinforcement: {
            type: "stirrups",
            areaPerLeg: 56.548667764616276 / 2,
            legs: 2,
            spacing: 250,
            fyd: 413.5,
          },
        },
        units: sectionUnits,
      });

      return {
        status: result.status,
        cotTheta: result.outputs.cotTheta,
        vRdKn: result.outputs.vRd / 1000,
        vRdWithStirrupsKn: result.outputs.vRdWithTransverseReinforcement / 1000,
        vRdWithoutStirrupsKn: result.outputs.vRdWithoutTransverseReinforcement / 1000,
        selectedMechanism: result.outputs.selectedMechanism,
      };
    },
    expectations: [
      { id: "status", path: "status", expected: "ok", type: "equal" },
      { id: "cot-theta", path: "cotTheta", expected: 2.5, tolerance: 1e-9 },
      { id: "vrd", path: "vRdKn", expected: 113.904023, tolerance: 1e-3 },
      {
        id: "vrd-stirrups",
        path: "vRdWithStirrupsKn",
        expected: 42.089173,
        tolerance: 1e-3,
      },
      {
        id: "vrd-no-stirrups",
        path: "vRdWithoutStirrupsKn",
        expected: 113.904023,
        tolerance: 1e-3,
      },
      {
        id: "selected-mechanism",
        path: "selectedMechanism",
        expected: "without-transverse-reinforcement",
        type: "equal",
      },
    ],
  };
}

function verificationStationSelectionCase() {
  return {
    id: "beam-verification-user-station-selection",
    title: "Beam verifier restricted to a user station",
    category: "beam-verification",
    source: "Internal contract regression for verificationStations",
    notes: "Checks that the verifier can be driven by explicit user stations independently from default FEM samples.",
    evaluate() {
      const analysisResult = new SingleBeamAnalysis().analyze({
        id: "validation-stations",
        units: femUnits,
        geometry: {
          start: { x: 0, y: 0 },
          end: { x: 4, y: 0 },
        },
        section: createDemoSection(),
        material: createSteelMaterial(),
        supports: {
          start: "hinge",
          end: "roller",
        },
        loads: [
          {
            id: "g1",
            actionType: "G1",
            type: "uniform",
            value: -2,
          },
        ],
        combinations: [
          {
            id: "uls",
            limitState: "ULS",
            factors: { G1: 1.5 },
          },
        ],
        discretization: {
          elementCount: 2,
        },
        verificationStations: {
          mode: "combined",
          userStations: [1.25],
        },
      });
      const verification = new BeamSectionActionVerifier({
        sectionVerifier: {
          verifySectionActions: ({ mEd }) => ({
            checks: [
              {
                id: "station-selection",
                demand: Math.abs(mEd),
                capacity: 100,
                utilizationRatio: Math.abs(mEd) / 100,
                ok: true,
              },
            ],
          }),
        },
        limitStates: "ULS",
        verificationStations: {
          mode: "user",
          userStations: [1.25],
        },
      }).verify({ analysisResult });
      const stations = [
        ...new Set(verification.checks.map((check) => check.metadata.station)),
      ];
      const sources = [
        ...new Set(verification.checks.map((check) => check.metadata.stationSource)),
      ];

      return {
        status: verification.status,
        stationResultCount: verification.outputs.stationResultCount,
        stations: stations.join(","),
        stationSources: sources.join(","),
      };
    },
    expectations: [
      { id: "status", path: "status", expected: "ok", type: "equal" },
      { id: "stations", path: "stations", expected: "1.25", type: "equal" },
      { id: "station-source", path: "stationSources", expected: "user", type: "equal" },
      {
        id: "station-result-count-positive",
        path: "stationResultCount",
        expected: 0,
        type: "greater-than",
      },
    ],
  };
}

export function createBeamValidationCases() {
  return [
    simplySupportedUniformLoadCase(),
    steelClassificationCase(),
    rcShearExcelRegressionCase(),
    rcServiceStressLimitCase(),
    rcCrackEnvironmentMappingCase(),
    rcCrackTensionGroupSelectionCase(),
    verificationStationSelectionCase(),
  ];
}

function evaluateExpectation(actual, expectation) {
  const actualValue = getPath(actual, expectation.path);
  const type = expectation.type ?? "approx";
  let ok = false;

  if (type === "equal") {
    ok = Object.is(actualValue, expectation.expected);
  } else if (type === "greater-than") {
    ok = Number(actualValue) > expectation.expected;
  } else {
    ok =
      Number.isFinite(actualValue) &&
      Math.abs(actualValue - expectation.expected) <= expectation.tolerance;
  }

  return {
    id: expectation.id,
    path: expectation.path,
    type,
    expected: expectation.expected,
    actual: round(actualValue),
    tolerance: expectation.tolerance ?? null,
    status: ok ? "ok" : "failed",
  };
}

export function runValidationCase(validationCase) {
  try {
    const actual = validationCase.evaluate();
    const checks = validationCase.expectations.map((expectation) =>
      evaluateExpectation(actual, expectation),
    );

    return {
      id: validationCase.id,
      title: validationCase.title,
      category: validationCase.category,
      source: validationCase.source,
      notes: validationCase.notes,
      status: checks.every((check) => check.status === "ok") ? "ok" : "failed",
      checks,
      actual,
    };
  } catch (error) {
    return {
      id: validationCase.id,
      title: validationCase.title,
      category: validationCase.category,
      source: validationCase.source,
      notes: validationCase.notes,
      status: "error",
      checks: [],
      actual: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function runBeamValidationCampaign({
  cases = createBeamValidationCases(),
} = {}) {
  const results = cases.map((validationCase) => runValidationCase(validationCase));
  const passed = results.filter((result) => result.status === "ok").length;
  const failed = results.length - passed;

  return {
    id: "beam-validation-campaign",
    status: failed === 0 ? "ok" : "failed",
    caseCount: results.length,
    passed,
    failed,
    results,
  };
}

export function formatBeamValidationReport(campaign) {
  const lines = [
    "# Beam Validation Campaign",
    "",
    `Status: ${campaign.status}`,
    `Cases: ${campaign.caseCount}`,
    `Passed: ${campaign.passed}`,
    `Failed: ${campaign.failed}`,
    "",
    "| Case | Category | Status | Source |",
    "| --- | --- | --- | --- |",
  ];

  for (const result of campaign.results) {
    lines.push(
      `| ${result.id} | ${result.category} | ${result.status} | ${result.source} |`,
    );
  }

  lines.push("", "## Checks", "");

  for (const result of campaign.results) {
    lines.push(`### ${result.id}`, "");

    if (result.error) {
      lines.push(`Error: ${result.error}`, "");
      continue;
    }

    lines.push("| Check | Status | Actual | Expected | Tolerance |");
    lines.push("| --- | --- | ---: | ---: | ---: |");

    for (const check of result.checks) {
      lines.push(
        `| ${check.id} | ${check.status} | ${check.actual} | ${check.expected} | ${check.tolerance ?? "-"} |`,
      );
    }

    lines.push("");
  }

  return lines.join("\n");
}
