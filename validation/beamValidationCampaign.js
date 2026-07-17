import {
  BeamSectionActionVerifier,
  ConcreteMaterial,
  ConcreteParabolaRectangleLaw,
  ElasticBeamSectionProvider,
  FoundationBeamAnalysis,
  RectangularFootingContactAnalysis,
  RectangularSection,
  RC_PLATE_ANALYSIS_TYPES,
  RCUltimateSectionSolver,
  ReinforcedConcretePlateApplication,
  ReinforcedConcreteColumnApplication,
  ReinforcedConcreteColumnModel,
  ReinforcedConcreteStrutAndTieApplication,
  ReinforcedConcreteSection,
  ReinforcedConcreteShearVerification,
  ReinforcedConcreteTorsionVerification,
  ReinforcedConcreteServiceabilityVerification,
  ReinforcementBar,
  SectionFiberDiscretizer,
  SingleBeamAnalysis,
  SteelElasticPerfectlyPlasticLaw,
  SteelMaterial,
  TimberConcreteCompositeBeamApplication,
  TimberConcreteCompositeBeamModel,
  TimberDowelConnector,
  TimberMaterial,
  TimberXlamCompositeBeamApplication,
  TimberXlamCompositeBeamModel,
  XlamPanelSection,
  bilinearizeCapacityCurve,
  calculateNTC2018EffectiveJointWidth,
  calculateNTC2018JointCompressionCapacity,
  calculateNTC2018JointShearDemand,
  calculateNTC2018JointTensionReinforcement,
  classifyNTC2018JointConfinement,
  calculateEn1992AnchorageLength,
  calculateEn1992DesignBondStrength,
  calculateEn1992LocalBearingResistance,
  calculateEn1992ShrinkageCurvature,
  classifySteelSection,
  createLongitudinalReinforcementLayout,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  createNTC2018StructuralSteelMaterial,
  createNTC2018TimberMaterial,
  createSteelProfileSection,
  createTecnariaConnector,
  integrateFootingPressureStrip,
  rotatePlateMoments,
  rotatePlateShear,
  woodArmer,
  verifySteelCompressionBuckling,
  verifySteelLateralTorsionalBuckling,
} from "../src/index.js";

const femUnits = Object.freeze({ force: "kN", length: "m" });
const sectionUnits = Object.freeze({ force: "N", length: "mm" });

function round(value, decimals = 9) {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function getPath(value, path) {
  return String(path)
    .split(".")
    .reduce((current, key) => current?.[key], value);
}

function escapeMarkdownCell(value) {
  return String(value ?? "-")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

function formatReportValue(value) {
  return value ?? "-";
}

function summarizeTolerances(checks) {
  const tolerances = checks
    .map((check) => check.tolerance)
    .filter((tolerance) => typeof tolerance === "number" && Number.isFinite(tolerance));

  if (tolerances.length === 0) {
    return "-";
  }

  const min = Math.min(...tolerances);
  const max = Math.max(...tolerances);

  return min === max ? String(min) : `${min} .. ${max}`;
}

function summarizeCampaignResults(results, key) {
  return results.reduce((summary, result) => {
    const group = result[key] ?? "unspecified";
    const current = summary.get(group) ?? {
      key: group,
      caseCount: 0,
      passed: 0,
      failed: 0,
      checkCount: 0,
    };

    current.caseCount += 1;
    current.checkCount += result.checks.length;
    if (result.status === "ok") {
      current.passed += 1;
    } else {
      current.failed += 1;
    }

    summary.set(group, current);
    return summary;
  }, new Map());
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

function createProjectTimberXlamCompositeModel() {
  const xlamMaterial = new TimberMaterial({
    name: "XLAM top panel",
    strengthClass: "custom-xlam",
    elasticModulus: 11600,
    fmK: 24,
    fvK: 2.7,
    units: sectionUnits,
  });
  const beamMaterial = new TimberMaterial({
    name: "Glulam beam",
    strengthClass: "custom-glulam",
    elasticModulus: 12600,
    fmK: 28,
    fvK: 3.2,
    units: sectionUnits,
  });
  const connector = new TimberDowelConnector({
    diameter: 16,
    timberDensityMean: 410,
    timberDensityCharacteristicSection1: 380,
    timberDensityCharacteristicSection2: 410,
    ultimateTensileStrength: 360,
    penetrationLength: 90,
    spacing: 50,
    gammaConnection: 1.5,
    kmod: 0.9,
    units: sectionUnits,
  });

  return new TimberXlamCompositeBeamModel({
    id: "validation-timber-xlam-workbook",
    span: 9200,
    xlamSection: new XlamPanelSection({
      effectiveWidth: 600,
      layerThicknesses: [0, 0, 30, 30, 30],
      activeLayerIndexes: [1, 3],
      units: sectionUnits,
    }),
    timberSection: new RectangularSection({
      width: 240,
      height: 440,
      units: sectionUnits,
    }),
    xlamMaterial,
    timberMaterial: beamMaterial,
    connector,
    kmod: 0.9,
    gammaXlam: 1.45,
    gammaTimber: 1.45,
    gammaConnection: 1.5,
    serviceClass: 2,
    psi2: 0,
    loads: {
      ulsLineLoad: 17.134,
      slePermanentLineLoad: 5.044,
      sleVariableLineLoad: 6.24,
    },
    units: sectionUnits,
  });
}

function createProjectTimberConcreteCompositeModel() {
  const timber = createNTC2018TimberMaterial({
    strengthClass: "C24",
    kmod: 0.8,
    units: sectionUnits,
  });
  const concrete = createNTC2018ConcreteMaterial({
    strengthClass: "LC25/28",
    units: sectionUnits,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units: sectionUnits,
  });
  const reinforcement = new ReinforcementBar({
    diameter: 6,
    grade: "B450C",
    material: reinforcementMaterial,
    units: sectionUnits,
  });
  const connector = createTecnariaConnector({
    type: "MAXI",
    boardThickness: 0,
    units: sectionUnits,
  });

  return new TimberConcreteCompositeBeamModel({
    id: "validation-timber-concrete-workbook",
    span: 4250,
    slabSection: new RectangularSection({ width: 1800, height: 60, units: sectionUnits }),
    timberSection: new RectangularSection({ width: 220, height: 250, units: sectionUnits }),
    timberConcreteGap: 100,
    reinforcement,
    reinforcementSpacing: 100,
    timberMaterial: timber,
    concreteMaterial: concrete,
    reinforcementMaterial,
    connector,
    connectorSpacing: 150,
    kdef: 0.6,
    kmod: 0.8,
    confidenceFactor: 1.35,
    gammaConcrete: 1.5,
    gammaSteel: 1.15,
    gammaTimber: 1.5,
    gammaConnector: 1.5,
    alphaCc: 0.85,
    loads: {
      ulsLineLoad: 15.966,
      sleRareLineLoad: 10.998,
    },
    deflectionLimitDenominator: 250,
    units: sectionUnits,
  });
}

function gradoSlabLoadCombinationCase() {
  return {
    id: "rc-project-grado-slab-load-combinations",
    title: "RC slab load combinations from Grado calculation report",
    category: "reinforced-concrete-load-combinations",
    source: "User supplied report CdCGrado-V1-S-03-Relazione_calcolo_solai_5m_rev06.pdf",
    sourceKind: "project-regression",
    notes:
      "Regression candidate only: reproduces published rounded surface loads for a laterocement slab; the source is not treated as authoritative.",
    evaluate() {
      const g1 = 3.06;
      const g2 = 0.70 + 0.40;
      const qCategoryC3 = 5.00;
      const qSecondary = 0.80;
      const vEd = 17100;
      const bearingArea = 200 * 200;
      const masonryMeanStrength = 2.625;
      const confidenceFactor = 1.2;
      const gammaM = 3.0;

      return {
        qSlu: round(1.3 * g1 + 1.5 * g2 + 1.5 * (qCategoryC3 + 0.5 * qSecondary), 1),
        qSleCharacteristic: round(g1 + g2 + qCategoryC3 + 0.5 * qSecondary, 1),
        qSleFrequent: round(g1 + g2 + 0.7 * qCategoryC3, 1),
        qSleQuasiPermanent: round(g1 + g2 + 0.6 * qCategoryC3, 1),
        bearingPressure: round(vEd / bearingArea, 2),
        masonryDesignStrength: round(masonryMeanStrength / (confidenceFactor * gammaM), 2),
      };
    },
    expectations: [
      { id: "q-slu", path: "qSlu", expected: 13.7, tolerance: 1e-12 },
      {
        id: "q-sle-characteristic",
        path: "qSleCharacteristic",
        expected: 9.6,
        tolerance: 1e-12,
      },
      { id: "q-sle-frequent", path: "qSleFrequent", expected: 7.7, tolerance: 1e-12 },
      {
        id: "q-sle-quasi-permanent",
        path: "qSleQuasiPermanent",
        expected: 7.2,
        tolerance: 1e-12,
      },
      {
        id: "bearing-pressure",
        path: "bearingPressure",
        expected: 0.43,
        tolerance: 1e-12,
      },
      {
        id: "masonry-design-strength",
        path: "masonryDesignStrength",
        expected: 0.73,
        tolerance: 1e-12,
      },
    ],
  };
}

function triesteSlabLoadCombinationCase() {
  return {
    id: "rc-project-trieste-slab-load-combinations",
    title: "RC slab load combinations and interface shear from Trieste report",
    category: "reinforced-concrete-load-combinations",
    source: "User supplied report CdC_Trieste-Relazione_di_calcolo-SolaiPT-rev04.pdf",
    sourceKind: "project-regression",
    notes:
      "Regression candidate only: reproduces rounded slab surface loads and the stated slab-beam interface shear check.",
    evaluate() {
      const g1 = 4.00;
      const g2 = 0.50 + 0.05 + 0.80;
      const q = 2.00;
      const tributaryWidth = 0.50;
      const span = 6.0;
      const vRd = 20.0;
      const qSluExact = 1.3 * g1 + 1.5 * g2 + 1.5 * q;
      const vEdExact = (qSluExact * tributaryWidth * span) / 2;

      return {
        qSlu: round(qSluExact, 1),
        qSleCharacteristic: round(g1 + g2 + q, 1),
        qSleFrequent: round(g1 + g2 + 0.7 * q, 1),
        qSleQuasiPermanent: round(g1 + g2 + 0.6 * q, 1),
        interfaceShearVEd: round(vEdExact, 1),
        interfaceShearVRd: vRd,
        interfaceShearMargin: round(vRd - vEdExact, 6),
      };
    },
    expectations: [
      { id: "q-slu", path: "qSlu", expected: 10.2, tolerance: 1e-12 },
      {
        id: "q-sle-characteristic",
        path: "qSleCharacteristic",
        expected: 7.4,
        tolerance: 1e-12,
      },
      { id: "q-sle-frequent", path: "qSleFrequent", expected: 6.8, tolerance: 1e-12 },
      {
        id: "q-sle-quasi-permanent",
        path: "qSleQuasiPermanent",
        expected: 6.6,
        tolerance: 1e-12,
      },
      {
        id: "interface-shear-ved",
        path: "interfaceShearVEd",
        expected: 15.3,
        tolerance: 1e-12,
      },
      {
        id: "interface-shear-vrd",
        path: "interfaceShearVRd",
        expected: 20.0,
        tolerance: 1e-12,
      },
      {
        id: "interface-shear-margin-positive",
        path: "interfaceShearMargin",
        expected: 0,
        type: "greater-than",
      },
    ],
  };
}

function rglRampFoundationPressureCase() {
  return {
    id: "rc-project-rgl-ramp-foundation-pressure",
    title: "RC ramp footing pressure from Reggello report",
    category: "reinforced-concrete-foundations",
    source: "User supplied report RGL-004-VAR01-02-Relazione_sulle strutture-rev01.pdf",
    sourceKind: "project-regression",
    notes:
      "Regression candidate only: checks the stated support reaction, footing self-weight contribution and soil pressure arithmetic.",
    evaluate() {
      const vEd = 21.6;
      const vRd = 65.0;
      const concreteUnitWeight = 25;
      const footingVolume = 0.9 * 0.4 * 1.2;
      const nSlu = vEd + 1.3 * concreteUnitWeight * footingVolume;
      const area = 900 * 1200;

      return {
        shearVEd: vEd,
        shearVRd: vRd,
        shearMargin: round(vRd - vEd, 6),
        nSlu: round(nSlu, 1),
        soilPressure: round((nSlu * 1000) / area, 3),
      };
    },
    expectations: [
      { id: "shear-ved", path: "shearVEd", expected: 21.6, tolerance: 1e-12 },
      { id: "shear-vrd", path: "shearVRd", expected: 65.0, tolerance: 1e-12 },
      {
        id: "shear-margin-positive",
        path: "shearMargin",
        expected: 0,
        type: "greater-than",
      },
      { id: "n-slu", path: "nSlu", expected: 35.6, tolerance: 1e-12 },
      { id: "soil-pressure", path: "soilPressure", expected: 0.033, tolerance: 1e-12 },
    ],
  };
}

function rcFootingRigidContactIndependentArithmeticCase() {
  return {
    id: "rc-footing-rigid-contact-independent-arithmetic",
    title: "RC footing rigid contact and cantilever-strip equilibrium",
    category: "reinforced-concrete-foundations",
    source:
      "JRC EUR 26566 EN sections 4.2.1 and 5.4; independent rigid-base equilibrium constants",
    sourceKind: "primary-method-reference",
    notes:
      "Checks a 2x2 m base under N and My, a separate uniaxial contact-loss state, and direct integration of net pressure on a cantilever strip.",
    evaluate() {
      const analysis = new RectangularFootingContactAnalysis();
      const full = analysis.analyze({
        widthX: 2000,
        widthY: 2000,
        nEd: 4_000_000,
        mxEd: 0,
        myEd: 400_000_000,
      });
      const partial = analysis.analyze({
        widthX: 2000,
        widthY: 2000,
        nEd: 4_000_000,
        mxEd: 0,
        myEd: 1_600_000_000,
      });
      const centered = analysis.analyze({
        widthX: 2000,
        widthY: 2000,
        nEd: 4_000_000,
      });
      const biaxial = analysis.analyze({
        widthX: 4,
        widthY: 3,
        nEd: 1200,
        mxEd: 500,
        myEd: 500,
      });
      const strip = integrateFootingPressureStrip({
        contact: centered,
        axis: "x",
        from: 250,
        to: 1000,
        fixedCoordinate: 0,
        momentOrigin: 250,
        uniformDownwardPressure: 0.1,
      });

      return {
        fullContactType: full.contactType,
        eccentricityX: full.eccentricityX,
        qMin: full.minimumPressure,
        qMax: full.maximumPressure,
        equilibriumUtilization: full.equilibriumUtilization,
        partialContactType: partial.contactType,
        contactLength: partial.partialContact.contactLength,
        partialQMax: partial.maximumPressure,
        biaxialContactType: biaxial.contactType,
        biaxialResidualNorm:
          biaxial.partialContact.equilibriumResidualNorm,
        stripNetForce: strip.netForce,
        stripNetMoment: strip.netMoment,
      };
    },
    expectations: [
      { id: "full-type", path: "fullContactType", expected: "full", type: "equal" },
      { id: "eccentricity-x", path: "eccentricityX", expected: 100, tolerance: 1e-12 },
      { id: "q-min", path: "qMin", expected: 0.7, tolerance: 1e-12 },
      { id: "q-max", path: "qMax", expected: 1.3, tolerance: 1e-12 },
      {
        id: "equilibrium-utilization",
        path: "equilibriumUtilization",
        expected: 0.1,
        tolerance: 1e-12,
      },
      {
        id: "partial-type",
        path: "partialContactType",
        expected: "partial-uniaxial",
        type: "equal",
      },
      { id: "contact-length", path: "contactLength", expected: 1800, tolerance: 1e-12 },
      { id: "partial-q-max", path: "partialQMax", expected: 20 / 9, tolerance: 1e-12 },
      {
        id: "biaxial-partial-type",
        path: "biaxialContactType",
        expected: "partial-biaxial",
        type: "equal",
      },
      {
        id: "biaxial-equilibrium",
        path: "biaxialResidualNorm",
        expected: 0,
        tolerance: 1e-10,
      },
      { id: "strip-net-force", path: "stripNetForce", expected: 675, tolerance: 1e-12 },
      {
        id: "strip-net-moment",
        path: "stripNetMoment",
        expected: 253_125,
        tolerance: 1e-9,
      },
    ],
  };
}

function rcEn1992DetailingIndependentArithmeticCase() {
  return {
    id: "rc-en1992-detailing-independent-arithmetic",
    title: "EN 1992 bond, anchorage, local bearing and shrinkage arithmetic",
    category: "reinforced-concrete-detailing",
    source:
      "EN 1992-1-1:2004 expressions 6.63, 7.21, 8.2, 8.3, 8.4 and 8.6",
    sourceKind: "primary-method-reference",
    notes:
      "Independent unit-consistent arithmetic for shared RC helpers used by beams, columns, footings and joints.",
    evaluate() {
      const bond = calculateEn1992DesignBondStrength({
        fctd: 1.2,
        barDiameter: 16,
      });
      const anchorage = calculateEn1992AnchorageLength({
        barDiameter: 16,
        designSteelStress: 400,
        fbd: bond.fbd,
      });
      const bearing = calculateEn1992LocalBearingResistance({
        loadedArea: 40000,
        distributionArea: 160000,
        fcd: 15,
      });
      const shrinkage = calculateEn1992ShrinkageCurvature({
        freeShrinkageStrain: -0.0003,
        reinforcementElasticModulus: 200000,
        effectiveConcreteModulus: 10000,
        reinforcementFirstMoment: 100000,
        sectionSecondMoment: 1e9,
      });

      return {
        fbd: bond.fbd,
        basicAnchorage: anchorage.basicRequiredLength,
        bearingEnhancement: bearing.enhancement,
        bearingResistance: bearing.resistance,
        shrinkageCurvature: shrinkage.curvature,
      };
    },
    expectations: [
      { id: "fbd", path: "fbd", expected: 2.7, tolerance: 1e-12 },
      { id: "lb-rqd", path: "basicAnchorage", expected: 16000 / 27, tolerance: 1e-9 },
      { id: "bearing-enhancement", path: "bearingEnhancement", expected: 2, tolerance: 1e-12 },
      { id: "bearing-resistance", path: "bearingResistance", expected: 1_200_000, tolerance: 1e-9 },
      { id: "shrinkage-curvature", path: "shrinkageCurvature", expected: -6e-7, tolerance: 1e-18 },
    ],
  };
}

function winklerFoundationBeamUniformSolutionCase() {
  return {
    id: "foundation-beam-winkler-uniform-solution",
    title: "Uniform load on a prismatic beam over a uniform Winkler bed",
    category: "reinforced-concrete-foundations",
    source:
      "PyCBA theoretical basis, continuous Winkler reaction q(x)=-kf*v(x); independent constant-field solution",
    sourceKind: "independent-analytical-benchmark",
    notes:
      "For uniform q and kf=ks*b, the constant solution has w=q/kf, zero curvature and total soil reaction qL. The tributary-lumped model is checked after mesh convergence.",
    evaluate() {
      const units = { force: "kN", length: "m" };
      const result = new FoundationBeamAnalysis().analyze({
        id: "uniform-winkler-validation",
        units,
        geometry: {
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
        },
        sectionProvider: new ElasticBeamSectionProvider({
          units,
          propertyResolver: () => ({
            axialRigidity: 1e7,
            flexuralRigidity: 2e4,
            units,
          }),
        }),
        foundation: {
          contactWidth: 1,
          subgradeModulus: 10000,
          contactModel: "compression-only",
        },
        loads: [{
          id: "uniform-load",
          actionType: "G1",
          type: "uniform",
          value: -10,
        }],
        combinations: false,
        discretization: { elementCount: 100 },
      }).loadCases.G1;

      return {
        totalReaction: result.foundation.totalReaction,
        maximumDisplacement: result.displacements.maxAbsVerticalDisplacement.uy,
        minimumPressure: result.foundation.minPressure.pressure,
        maximumPressure: result.foundation.maxPressure.pressure,
        maximumMoment: Math.abs(result.internalForces.maxAbsBendingMoment.m),
        contactConverged: result.foundationIteration.converged,
      };
    },
    expectations: [
      { id: "vertical-equilibrium", path: "totalReaction", expected: 100, tolerance: 2e-6 },
      { id: "constant-displacement", path: "maximumDisplacement", expected: -0.001, tolerance: 2e-7 },
      { id: "minimum-pressure", path: "minimumPressure", expected: 10, tolerance: 0.006 },
      { id: "maximum-pressure", path: "maximumPressure", expected: 10, tolerance: 0.002 },
      { id: "vanishing-bending", path: "maximumMoment", expected: 0, tolerance: 0.013 },
      { id: "unilateral-contact-convergence", path: "contactConverged", expected: true, type: "equal" },
    ],
  };
}

function rcBeamColumnJointNtcIndependentArithmeticCase() {
  return {
    id: "rc-beam-column-joint-ntc-independent-arithmetic",
    title: "NTC 2018 internal beam-column joint panel arithmetic",
    category: "reinforced-concrete-joints",
    source:
      "D.M. 17 January 2018, NTC 2018 sections 7.4.4.3.1 and 7.4.6.2.3, equations 7.4.7-7.4.10; independent constants",
    sourceKind: "primary-method-reference",
    notes:
      "Uses the published 350 mm internal-joint geometry, As1=As2=509 mm2, fyd=391.3 MPa, Vc=8.38 kN, fck=29.05 MPa and nuD=0.044. Exact eta is retained instead of the source's rounded 0.530.",
    evaluate() {
      const effectiveWidth = calculateNTC2018EffectiveJointWidth({
        columnWidth: 350,
        beamWidth: 300,
        columnDepth: 350,
      });
      const demand = calculateNTC2018JointShearDemand({
        jointType: "internal",
        gammaRd: 1.2,
        topReinforcementArea: 509,
        bottomReinforcementArea: 509,
        reinforcementDesignStrength: 391.3,
        columnShearAbove: 8380,
      });
      const compression = calculateNTC2018JointCompressionCapacity({
        jointType: "internal",
        fck: 29.05,
        fcd: 16.46,
        normalizedAxialForce: 0.044,
        effectiveJointWidth: effectiveWidth,
        columnLongitudinalLayerDistance: 262,
      });
      const tension = calculateNTC2018JointTensionReinforcement({
        method: "diagonal-tension",
        jointType: "internal",
        jointShearDemand: demand.demand,
        effectiveJointWidth: effectiveWidth,
        columnLongitudinalLayerDistance: 262,
        beamLongitudinalLayerDistance: 266,
        normalizedAxialForce: 0.044,
        fcd: 16.46,
        fctd: 1.32,
        gammaRd: 1.2,
        topReinforcementArea: 509,
        bottomReinforcementArea: 509,
        reinforcementDesignStrength: 391.3,
      });
      const confinement = classifyNTC2018JointConfinement({
        faceCoverageRatios: {
          positiveX: 0.75,
          negativeX: 0.8,
          positiveZ: 0.9,
          negativeZ: 1,
        },
        oppositeBeamOverlapRatios: { x: 0.75, z: 0.8 },
      });

      return {
        effectiveWidth,
        jointDemand: demand.demand,
        beamForce: demand.beamForce,
        alphaJ: compression.alphaJ,
        eta: compression.eta,
        compressionCapacity: compression.capacity,
        shearStress: tension.shearStress,
        requiredConfiningStress: tension.requiredConfiningStress,
        requiredTieForce: tension.requiredHorizontalTieForce,
        confinementClass: confinement.classification,
      };
    },
    expectations: [
      { id: "effective-width", path: "effectiveWidth", expected: 350, tolerance: 1e-12 },
      { id: "beam-force", path: "beamForce", expected: 478012.08, tolerance: 0.01 },
      { id: "joint-demand", path: "jointDemand", expected: 469632.08, tolerance: 0.01 },
      { id: "alpha-j", path: "alphaJ", expected: 0.6, tolerance: 1e-12 },
      { id: "eta", path: "eta", expected: 0.53028, tolerance: 1e-12 },
      { id: "compression-capacity", path: "compressionCapacity", expected: 766469.706, tolerance: 0.01 },
      { id: "shear-stress", path: "shearStress", expected: 5.121397, tolerance: 0.000001 },
      { id: "confining-stress", path: "requiredConfiningStress", expected: 11.510541, tolerance: 0.000001 },
      { id: "tie-force", path: "requiredTieForce", expected: 1071631.336, tolerance: 0.01 },
      { id: "fully-confined", path: "confinementClass", expected: "fully-confined", type: "equal" },
    ],
  };
}

function rcStrutAndTieEcpCorbelCase() {
  return {
    id: "rc-strut-and-tie-ecp-corbel-equilibrium",
    title: "EN 1992 strut-and-tie equilibrium for a thick short corbel",
    category: "reinforced-concrete-strut-and-tie",
    source:
      "European Concrete Platform, EC2 Worked Examples rev. A 31-03-2017, Example 6.9, pages 49-52",
    sourceKind: "external-reference",
    notes:
      "Uses the published FEd=700 kN, horizontal offset 169 mm, lever arm 288 mm, C35/45, B450C and k2=1.0. The two-bar determinate model independently resolves the reported 411 kN main tie force.",
    evaluate() {
      const units = { force: "N", length: "mm" };
      const concreteMaterial = createNTC2018ConcreteMaterial({
        strengthClass: "C35/45",
        units,
      });
      const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
        grade: "B450C",
        units,
      });
      const result = new ReinforcedConcreteStrutAndTieApplication().run({
        model: {
          id: "validation-ecp-corbel-stm",
          units,
          materials: { concreteMaterial, reinforcementMaterial },
          nodes: [
            { id: "A", x: 0, y: 0 },
            { id: "B", x: 0, y: 288 },
            { id: "C", x: 169, y: 288 },
          ],
          members: [
            {
              id: "C1",
              type: "strut",
              startNodeId: "A",
              endNodeId: "C",
              area: 100000,
              strengthModel: "transverse-tension",
            },
            {
              id: "T1",
              type: "tie",
              startNodeId: "B",
              endNodeId: "C",
              area: 1232,
            },
          ],
          loads: [{ id: "P", nodeId: "C", fy: -700000 }],
          supports: [
            { id: "SA", nodeId: "A", ux: true, uy: true },
            { id: "SB", nodeId: "B", ux: true, uy: true },
          ],
          nodalZones: [
            {
              id: "load-face",
              nodeId: "C",
              type: "cct",
              area: 45000,
              forceReference: {
                kind: "load",
                id: "P",
                normal: { x: 0, y: 1 },
              },
              factors: { k2: 1 },
            },
            {
              id: "strut-face",
              nodeId: "A",
              type: "ccc",
              area: 100000,
              forceReference: { kind: "member", id: "C1" },
            },
          ],
        },
      });
      const tie = result.outputs.analysis.members.find(
        (member) => member.id === "T1",
      );
      const strut = result.outputs.analysis.members.find(
        (member) => member.id === "C1",
      );
      const loadZone = result.outputs.nodalZones.find(
        (zone) => zone.id === "load-face",
      );

      return {
        status: result.status,
        tieForce: tie.force,
        strutForce: strut.force,
        requiredTieArea: tie.force / reinforcementMaterial.fyd,
        loadZoneStress: loadZone.stress,
        loadZoneStrength: loadZone.strength.designStrength,
        equilibriumFx: result.outputs.analysis.equilibrium.residual.fx,
        equilibriumFy: result.outputs.analysis.equilibrium.residual.fy,
        staticIndeterminacy:
          result.outputs.analysis.topology.staticIndeterminacy,
      };
    },
    expectations: [
      { id: "status", path: "status", expected: "ok", type: "equal" },
      { id: "tie-force", path: "tieForce", expected: 410763.888889, tolerance: 0.01 },
      { id: "strut-force", path: "strutForce", expected: -811619.967975, tolerance: 0.01 },
      { id: "required-tie-area", path: "requiredTieArea", expected: 1049.741602, tolerance: 0.000001 },
      { id: "load-zone-stress", path: "loadZoneStress", expected: 15.555555556, tolerance: 0.000001 },
      { id: "load-zone-strength", path: "loadZoneStrength", expected: 17.0538, tolerance: 0.000001 },
      { id: "equilibrium-x", path: "equilibriumFx", expected: 0, tolerance: 1e-9 },
      { id: "equilibrium-y", path: "equilibriumFy", expected: 0, tolerance: 1e-9 },
      { id: "determinate-topology", path: "staticIndeterminacy", expected: 0, tolerance: 1e-12 },
    ],
  };
}

function jrcEc2ColumnInteractionCase() {
  return {
    id: "rc-jrc-ec2-column-b2-interaction-parameters",
    title: "JRC EC2 column B2 normalized interaction parameters",
    category: "reinforced-concrete-section",
    source: "JRC EUR 26566 EN Eurocode 2 worked examples, doi:10.2788/35386",
    sourceKind: "external-reference",
    notes:
      "Recomputes the published normalized interaction inputs for column B2 and checks that the local section solver gives capacity above the design moment for the provided 8 phi 20 layout.",
    evaluate() {
      const b = 500;
      const h = 500;
      const fcd = 20;
      const fyd = 435;
      const mEd = 214.82e6;
      const nEd = -4384e3;
      const omega = 0.20;
      const concreteMaterial = new ConcreteMaterial({
        name: "JRC C30/37 design concrete",
        strengthClass: "C30/37",
        fck: 30,
        fcd,
        units: sectionUnits,
      });
      const reinforcementMaterial = new SteelMaterial({
        name: "JRC B500 design reinforcement",
        grade: "B500",
        fyk: 500,
        fyd,
        elasticModulus: 200000,
        units: sectionUnits,
      });
      const singleBar = new ReinforcementBar({
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 50,
        z: 50,
        units: sectionUnits,
      });
      const barPositions = [
        [50, 50],
        [50, 200],
        [50, 300],
        [50, 450],
        [450, 50],
        [450, 200],
        [450, 300],
        [450, 450],
      ];
      const concreteSection = new RectangularSection({
        width: b,
        height: h,
        units: sectionUnits,
      });
      const section = new ReinforcedConcreteSection({
        id: "jrc-column-b2",
        name: "JRC EC2 column B2",
        concreteSection,
        concreteMaterial,
        reinforcementMaterial,
        reinforcementBars: barPositions.map(
          ([y, z], index) =>
            new ReinforcementBar({
              id: `jrc-b2-${index + 1}`,
              diameter: 20,
              grade: "B450C",
              material: reinforcementMaterial,
              y,
              z,
              units: sectionUnits,
            }),
        ),
        units: sectionUnits,
      });
      const concreteFibers = new SectionFiberDiscretizer().discretize(section, {
        targetCount: 800,
      }).fibers;
      const concreteLaw = new ConcreteParabolaRectangleLaw({
        fcd,
        ec2: 0.002,
        ecu: 0.0035,
      });
      const steelLaw = new SteelElasticPerfectlyPlasticLaw({
        Es: 200000,
        fyd,
        esu: 0.01,
      });
      const solved = new RCUltimateSectionSolver().solveUniaxialAtAxialLoad({
        section,
        concreteFibers,
        concreteLaw,
        steelLaw,
        nEd,
        compressedEdge: "top",
      });

      return {
        mu: round(mEd / (b * h ** 2 * fcd), 3),
        nu: round(nEd / (b * h * fcd), 3),
        requiredReinforcementArea: round((omega * b * h * fcd) / fyd, 0),
        providedReinforcementArea: round(8 * singleBar.area, 0),
        providedMinusRequiredReinforcementArea: round(
          8 * singleBar.area - (omega * b * h * fcd) / fyd,
          0,
        ),
        mRdKnm: round(Math.abs(solved.MxRd) / 1e6, 3),
        axialResidualAbs: Math.abs(solved.axialResidual),
      };
    },
    expectations: [
      { id: "mu", path: "mu", expected: 0.086, tolerance: 1e-12 },
      { id: "nu", path: "nu", expected: -0.877, tolerance: 1e-12 },
      {
        id: "required-reinforcement-area",
        path: "requiredReinforcementArea",
        expected: 2299,
        tolerance: 1e-12,
      },
      {
        id: "provided-reinforcement-area",
        path: "providedReinforcementArea",
        expected: 2513,
        tolerance: 1e-12,
      },
      {
        id: "provided-reinforcement-margin-positive",
        path: "providedMinusRequiredReinforcementArea",
        expected: 0,
        type: "greater-than",
      },
      {
        id: "solver-mrd-exceeds-med",
        path: "mRdKnm",
        expected: 214.82,
        type: "greater-than",
      },
      {
        id: "solver-axial-equilibrium",
        path: "axialResidualAbs",
        expected: 0,
        tolerance: 1e-2,
      },
    ],
  };
}

function structvilleEc5TimberBeamCase() {
  return {
    id: "timber-ec5-structville-sawn-beam-example",
    title: "EC5 sawn timber beam worked example",
    category: "timber",
    source: "Structville, Design of Timber Beams, 2020",
    sourceKind: "external-worked-example",
    notes:
      "External worked example used as arithmetic validation only; bearing is not included because the published line appears rounded/inconsistent.",
    evaluate() {
      const b = 75;
      const h = 200;
      const l = 2.85;
      const qUls = 4.1;
      const pointUls = 1.35;
      const kmod = 0.8;
      const gammaM = 1.3;
      const fmK = 24;
      const fvK = 2.5;
      const sectionModulus = (b * h ** 2) / 6;
      const bendingMoment = 4.162 + 0.96;
      const bendingStress = (bendingMoment * 1e6) / sectionModulus;
      const bendingStrength = (kmod * fmK) / gammaM;
      const shearForce = (qUls * l) / 2 + pointUls / 2;
      const shearStress = (1.5 * round(shearForce, 2) * 1000) / (b * h);
      const shearStrength = (kmod * fvK) / gammaM;
      const permanentDeflection = 3.246;
      const variableDeflection = 2.519;
      const instantDeflectionLimit = 9.5;
      const finalDeflection = 8.963;
      const finalDeflectionLimit = 19.0;

      return {
        qUls,
        pointUls,
        bendingMoment: round(bendingMoment, 3),
        bendingStress: round(bendingStress, 3),
        bendingStrength: round(bendingStrength, 2),
        bendingUtilizationRatio: round(bendingStress / bendingStrength, 3),
        shearForce: round(shearForce, 2),
        shearStress: round(shearStress, 3),
        shearStrength: round(shearStrength, 2),
        shearUtilizationRatio: round(shearStress / shearStrength, 3),
        instantDeflection: round(permanentDeflection + variableDeflection, 3),
        instantDeflectionUtilizationRatio: round(
          (permanentDeflection + variableDeflection) / instantDeflectionLimit,
          3,
        ),
        finalDeflection,
        finalDeflectionUtilizationRatio: round(finalDeflection / finalDeflectionLimit, 3),
      };
    },
    expectations: [
      { id: "q-uls", path: "qUls", expected: 4.1, tolerance: 1e-12 },
      { id: "point-uls", path: "pointUls", expected: 1.35, tolerance: 1e-12 },
      { id: "moment", path: "bendingMoment", expected: 5.122, tolerance: 1e-12 },
      { id: "bending-stress", path: "bendingStress", expected: 10.244, tolerance: 1e-12 },
      {
        id: "bending-strength",
        path: "bendingStrength",
        expected: 14.77,
        tolerance: 1e-12,
      },
      {
        id: "bending-utilization",
        path: "bendingUtilizationRatio",
        expected: 0.694,
        tolerance: 1e-12,
      },
      { id: "shear-force", path: "shearForce", expected: 6.52, tolerance: 1e-12 },
      { id: "shear-stress", path: "shearStress", expected: 0.652, tolerance: 1e-12 },
      { id: "shear-strength", path: "shearStrength", expected: 1.54, tolerance: 1e-12 },
      {
        id: "shear-utilization",
        path: "shearUtilizationRatio",
        expected: 0.424,
        tolerance: 1e-12,
      },
      {
        id: "instant-deflection",
        path: "instantDeflection",
        expected: 5.765,
        tolerance: 1e-12,
      },
      {
        id: "instant-deflection-utilization",
        path: "instantDeflectionUtilizationRatio",
        expected: 0.607,
        tolerance: 1e-12,
      },
      {
        id: "final-deflection",
        path: "finalDeflection",
        expected: 8.963,
        tolerance: 1e-12,
      },
      {
        id: "final-deflection-utilization",
        path: "finalDeflectionUtilizationRatio",
        expected: 0.472,
        tolerance: 1e-12,
      },
    ],
  };
}

function xlamAuleGrandeLuceReportCase() {
  return {
    id: "xlam-project-aule-grande-luce-panel",
    title: "XLAM slab bending, deflection and vibration from Aule grande luce report",
    category: "xlam",
    source: "User supplied report solaio_aule_grande_luce.pdf",
    sourceKind: "project-regression",
    notes:
      "Regression candidate only: checks selected rounded values from the XLAM slab report, including two intentionally failing comfort criteria as reported.",
    evaluate() {
      const bendingStress = 4.141;
      const bendingCapacity = 16.39;
      const finalDeflection = 5.61;
      const finalDeflectionLimit = 10.4;
      const vibrationFrequency = 13.86;
      const vibrationFrequencyLimit = 8.0;
      const oneKnDeflection = 0.544;
      const oneKnDeflectionLimit = 1.0;
      const vibrationVelocity = 5.66;
      const vibrationVelocityLimit = 13.56;
      const austrianOneKnLimit = 0.25;
      const hammTwoKnDeflection = 0.925;
      const hammTwoKnLimit = 0.5;

      return {
        bendingUtilizationPercent: round((100 * bendingStress) / bendingCapacity, 1),
        finalDeflectionUtilizationPercent: round(
          (100 * finalDeflection) / finalDeflectionLimit,
          1,
        ),
        vibrationFrequencyMargin: round(vibrationFrequency - vibrationFrequencyLimit, 2),
        oneKnDeflectionMargin: round(oneKnDeflectionLimit - oneKnDeflection, 3),
        vibrationVelocityMargin: round(vibrationVelocityLimit - vibrationVelocity, 2),
        austrianOneKnUtilizationPercent: round(
          (100 * oneKnDeflection) / austrianOneKnLimit,
          1,
        ),
        hammTwoKnUtilizationPercent: round(
          (100 * hammTwoKnDeflection) / hammTwoKnLimit,
          1,
        ),
      };
    },
    expectations: [
      {
        id: "bending-utilization",
        path: "bendingUtilizationPercent",
        expected: 25.3,
        tolerance: 1e-12,
      },
      {
        id: "final-deflection-utilization",
        path: "finalDeflectionUtilizationPercent",
        expected: 53.9,
        tolerance: 1e-12,
      },
      {
        id: "frequency-margin-positive",
        path: "vibrationFrequencyMargin",
        expected: 0,
        type: "greater-than",
      },
      {
        id: "one-kn-deflection-margin-positive",
        path: "oneKnDeflectionMargin",
        expected: 0,
        type: "greater-than",
      },
      {
        id: "velocity-margin-positive",
        path: "vibrationVelocityMargin",
        expected: 0,
        type: "greater-than",
      },
      {
        id: "austrian-one-kn-utilization",
        path: "austrianOneKnUtilizationPercent",
        expected: 217.5,
        tolerance: 0.2,
      },
      {
        id: "hamm-two-kn-utilization",
        path: "hammTwoKnUtilizationPercent",
        expected: 184.9,
        tolerance: 0.2,
      },
    ],
  };
}

function timberProjectC25021RoofBeamWorkbookCase() {
  return {
    id: "timber-project-c25021-roof-beam-workbook",
    title: "Solid timber roof beam checks from C25-021 workbook",
    category: "timber",
    source: "User supplied workbook C25-021_travi_legno.xlsx",
    sourceKind: "project-regression",
    notes:
      "Regression candidate only: checks selected workbook stress and deflection ratios for the timber beam verification sheet.",
    evaluate() {
      return {
        bendingUtilizationRatio: round(14.0525 / 14.8966, 6),
        shearUtilizationRatio: round(0.702627 / 1.67586, 6),
        compressionPerpendicularUtilizationRatio: round(1.37403 / 1.67586, 6),
        lateralTorsionalUtilizationRatio: round(14.0525 / 14.8966, 6),
        instantDeflectionUtilizationRatio: round(34.9762 / 35.2, 6),
        finalDeflectionUtilizationRatio: round(51.4271 / 58.6667, 6),
      };
    },
    expectations: [
      {
        id: "bending-utilization",
        path: "bendingUtilizationRatio",
        expected: 0.943341,
        tolerance: 1e-4,
      },
      {
        id: "shear-utilization",
        path: "shearUtilizationRatio",
        expected: 0.419263,
        tolerance: 1e-4,
      },
      {
        id: "compression-perpendicular-utilization",
        path: "compressionPerpendicularUtilizationRatio",
        expected: 0.819892,
        tolerance: 1e-4,
      },
      {
        id: "lateral-torsional-utilization",
        path: "lateralTorsionalUtilizationRatio",
        expected: 0.943341,
        tolerance: 1e-4,
      },
      {
        id: "instant-deflection-utilization",
        path: "instantDeflectionUtilizationRatio",
        expected: 0.993642,
        tolerance: 1e-4,
      },
      {
        id: "final-deflection-utilization",
        path: "finalDeflectionUtilizationRatio",
        expected: 0.876598,
        tolerance: 1e-4,
      },
    ],
  };
}

function timberXlamCompositeWorkbookCase() {
  return {
    id: "timber-xlam-composite-project-workbook",
    title: "Timber-XLAM composite gamma-method workbook",
    category: "timber-composite",
    source: "User supplied workbook Travi_legno_XLAM_collab.xlsx",
    sourceKind: "project-regression",
    notes:
      "Rebuilds the workbook inputs with the local TimberXlamCompositeBeamApplication and compares gamma factors, stresses, connector force and deflection.",
    evaluate() {
      const result = new TimberXlamCompositeBeamApplication().run({
        model: createProjectTimberXlamCompositeModel(),
      });

      return {
        status: result.status,
        kser: result.outputs.kser,
        gamma1Uls: result.outputs.gamma1Uls,
        gamma2Uls: result.outputs.gamma2Uls,
        ejEffUls: round(result.outputs.ejEffUls / 1e12, 6),
        sigmaN1: result.outputs.sigmaN1,
        sigmaM1: result.outputs.sigmaM1,
        tau2: result.outputs.tau2,
        connectorForce: result.outputs.connectorForce,
        deflectionShort: result.outputs.deflectionShort,
        xlamMinStressUtilization: findCheck(result, "xlam-min-stress")?.utilizationRatio,
      };
    },
    expectations: [
      { id: "status", path: "status", expected: "ok", type: "equal" },
      { id: "kser", path: "kser", expected: 6641.493808, tolerance: 1e-3 },
      { id: "gamma1-uls", path: "gamma1Uls", expected: 0.784346, tolerance: 1e-4 },
      { id: "gamma2-uls", path: "gamma2Uls", expected: 0.363361, tolerance: 1e-4 },
      { id: "ej-eff-uls", path: "ejEffUls", expected: 33.474755, tolerance: 1e-3 },
      { id: "sigma-n1", path: "sigmaN1", expected: -12.942024, tolerance: 1e-4 },
      { id: "sigma-m1", path: "sigmaM1", expected: 1.884544, tolerance: 1e-4 },
      { id: "tau2", path: "tau2", expected: 0.944451, tolerance: 1e-4 },
      {
        id: "connector-force",
        path: "connectorForce",
        expected: 5.06427,
        tolerance: 1e-4,
      },
      {
        id: "short-deflection",
        path: "deflectionShort",
        expected: 30.622415,
        tolerance: 1e-4,
      },
      {
        id: "xlam-min-stress-utilization",
        path: "xlamMinStressUtilization",
        expected: 0.995302,
        tolerance: 1e-4,
      },
    ],
  };
}

function timberConcreteCompositeWorkbookCase() {
  return {
    id: "timber-concrete-composite-project-workbook",
    title: "Timber-concrete composite gamma-method workbook",
    category: "timber-composite",
    source: "User supplied workbook legno_cls_collaborante_travi_solaiosoggiornoP1.xlsx",
    sourceKind: "project-regression",
    notes:
      "Rebuilds the workbook inputs with the local TimberConcreteCompositeBeamApplication and compares gamma factors, stresses, connector check and SLE deflection.",
    evaluate() {
      const result = new TimberConcreteCompositeBeamApplication().run({
        model: createProjectTimberConcreteCompositeModel(),
      });

      return {
        status: result.status,
        gammaUls: result.outputs.gammaUls,
        gammaSle: result.outputs.gammaSle,
        timberStressBottom: result.outputs.timberStressBottom,
        timberStressTop: result.outputs.timberStressTop,
        neutralAxisDepth: result.outputs.neutralAxisDepth,
        deflectionSle: result.outputs.deflectionSle,
        connectorUtilization: findCheck(result, "connector")?.utilizationRatio,
        governingUtilization: result.utilizationRatio,
      };
    },
    expectations: [
      { id: "status", path: "status", expected: "ok", type: "equal" },
      { id: "gamma-uls", path: "gammaUls", expected: 0.198113, tolerance: 1e-4 },
      { id: "gamma-sle", path: "gammaSle", expected: 0.306449, tolerance: 1e-4 },
      {
        id: "timber-stress-bottom",
        path: "timberStressBottom",
        expected: -3.018467,
        tolerance: 1e-4,
      },
      {
        id: "timber-stress-top",
        path: "timberStressTop",
        expected: 6.171429,
        tolerance: 1e-4,
      },
      {
        id: "neutral-axis-depth",
        path: "neutralAxisDepth",
        expected: 14.012554,
        tolerance: 1e-3,
      },
      { id: "deflection-sle", path: "deflectionSle", expected: 5.189313, tolerance: 1e-4 },
      {
        id: "connector-utilization",
        path: "connectorUtilization",
        expected: 0.978084,
        tolerance: 1e-4,
      },
      {
        id: "governing-utilization",
        path: "governingUtilization",
        expected: 0.978084,
        tolerance: 1e-4,
      },
    ],
  };
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

function analyzeUniformBeam({ id, length, supports, elementCount }) {
  return new SingleBeamAnalysis().analyze({
    id,
    units: femUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: length, y: 0 },
    },
    section: createDemoSection(),
    material: createSteelMaterial(),
    supports,
    loads: [
      {
        id: "g1",
        actionType: "G1",
        type: "uniform",
        value: -2,
      },
    ],
    discretization: {
      elementCount,
      stations: supports.map((support) => support.position),
    },
    combinations: false,
  }).loadCases.G1;
}

function fixedFixedUniformLoadCase() {
  return {
    id: "beam-eb-fixed-fixed-udl",
    title: "Euler-Bernoulli beam, fixed-fixed, uniform load",
    category: "beam-analysis",
    sourceKind: "external-analytical-reference",
    source: "Classical fixed-ended beam closed-form solution",
    notes:
      "Independent reference uses qL/2 reactions, qL^2/12 end moments, qL^2/24 midspan moment and qL^4/(384EI) deflection.",
    evaluate() {
      const loadCase = analyzeUniformBeam({
        id: "validation-eb-fixed-fixed",
        length: 4,
        supports: [
          { id: "left", position: 0, type: "fixed" },
          { id: "right", position: 4, type: "fixed" },
        ],
        elementCount: 8,
      });
      const left = loadCase.reactions.samples.find(
        (sample) => sample.station === 0,
      );
      const right = loadCase.reactions.samples.find(
        (sample) => sample.station === 4,
      );
      const midspan = loadCase.displacements.samples.find(
        (sample) => sample.station === 2,
      );
      const midspanMoment = loadCase.internalForces.samples.find(
        (sample) => sample.station === 2,
      );

      return {
        leftReaction: left.uy,
        rightReaction: right.uy,
        leftMoment: left.rz,
        rightMoment: right.rz,
        midspanMoment: midspanMoment.m,
        midspanDeflection: midspan.uy,
      };
    },
    expectations: [
      { id: "left-reaction", path: "leftReaction", expected: 4, tolerance: 1e-9 },
      { id: "right-reaction", path: "rightReaction", expected: 4, tolerance: 1e-9 },
      { id: "left-moment", path: "leftMoment", expected: 8 / 3, tolerance: 1e-9 },
      { id: "right-moment", path: "rightMoment", expected: -8 / 3, tolerance: 1e-9 },
      { id: "midspan-moment", path: "midspanMoment", expected: 4 / 3, tolerance: 1e-9 },
      {
        id: "midspan-deflection",
        path: "midspanDeflection",
        expected: (-2 * 4 ** 4) / (384 * 14000),
        tolerance: 1e-12,
      },
    ],
  };
}

function continuousUniformLoadCase({ unequal = false } = {}) {
  const firstSpan = 4;
  const secondSpan = unequal ? 6 : 4;
  const length = firstSpan + secondSpan;
  const load = 2;
  const middleMoment =
    (-load * (firstSpan ** 3 + secondSpan ** 3)) /
    (8 * (firstSpan + secondSpan));
  const leftReaction =
    (load * firstSpan) / 2 + middleMoment / firstSpan;
  const firstSpanRightReaction = load * firstSpan - leftReaction;
  const secondSpanLeftReaction =
    (load * secondSpan) / 2 - middleMoment / secondSpan;
  const rightReaction = load * secondSpan - secondSpanLeftReaction;
  const middleReaction = firstSpanRightReaction + secondSpanLeftReaction;

  return {
    id: unequal
      ? "beam-eb-continuous-unequal-udl"
      : "beam-eb-continuous-equal-udl",
    title: unequal
      ? "Euler-Bernoulli continuous beam, spans 1:1.5, uniform load"
      : "Euler-Bernoulli continuous beam, two equal spans, uniform load",
    category: "beam-analysis",
    sourceKind: "external-analytical-reference",
    source: "Clapeyron three-moment theorem",
    notes:
      "Independent support moment and reactions are derived from the three-moment theorem with zero end moments.",
    evaluate() {
      const loadCase = analyzeUniformBeam({
        id: unequal
          ? "validation-eb-continuous-unequal"
          : "validation-eb-continuous-equal",
        length,
        supports: [
          { id: "left", position: 0, type: "hinge" },
          { id: "middle", position: firstSpan, type: "roller" },
          { id: "right", position: length, type: "roller" },
        ],
        elementCount: unequal ? 20 : 16,
      });
      const reactionAt = (station) =>
        loadCase.reactions.samples.find(
          (sample) => sample.station === station,
        )?.uy;
      const supportMoment = loadCase.internalForces.samples.find(
        (sample) => sample.station === firstSpan,
      )?.m;

      return {
        leftReaction: reactionAt(0),
        middleReaction: reactionAt(firstSpan),
        rightReaction: reactionAt(length),
        middleMoment: supportMoment,
        verticalEquilibrium:
          reactionAt(0) + reactionAt(firstSpan) + reactionAt(length),
      };
    },
    expectations: [
      { id: "left-reaction", path: "leftReaction", expected: leftReaction, tolerance: 1e-9 },
      { id: "middle-reaction", path: "middleReaction", expected: middleReaction, tolerance: 1e-9 },
      { id: "right-reaction", path: "rightReaction", expected: rightReaction, tolerance: 1e-9 },
      { id: "middle-moment", path: "middleMoment", expected: middleMoment, tolerance: 1e-9 },
      { id: "vertical-equilibrium", path: "verticalEquilibrium", expected: load * length, tolerance: 1e-9 },
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

function sciP364RestrainedBeamExampleCase() {
  return {
    id: "steel-sci-p364-example2-restrained-beam",
    title: "SCI P364 example 2 restrained steel beam",
    category: "steel",
    source: "SCI P364 Steel Building Design: Worked Examples - Open Sections, Example 2",
    sourceKind: "external-reference",
    notes:
      "Reproduces selected EC3 arithmetic for a laterally restrained 533 x 210 x 92 UKB in S275; UK National Annex factors are used as in the source.",
    evaluate() {
      const material = new SteelMaterial({
        name: "SCI P364 S275",
        grade: "S275",
        elasticModulus: 210000,
        fyk: 275,
        fyd: 275,
        units: sectionUnits,
        metadata: {
          gammaM0: 1,
          gammaM1: 1,
        },
      });
      const section = {
        family: "HEA",
        profileName: "533x210x92 UKB surrogate",
        height: 533.1,
        width: 209.3,
        webThickness: 10.1,
        flangeThickness: 15.6,
        rootRadius: 12.7,
        area: 11700,
        inertiaY: 55200e4,
        metadata: {
          unitSystem: sectionUnits,
        },
      };
      const classification = classifySteelSection({
        section,
        material,
        nEd: 0,
        mEd: 539.5e6,
      });
      const qUls = round(0.925 * 1.35 * 15 + 1.5 * 30, 1);
      const fUls = round(0.925 * 1.35 * 40 + 1.5 * 50, 1);
      const span = 6.5;
      const spanMm = span * 1000;
      const mEd = round((qUls * span ** 2) / 8 + (fUls * span) / 4, 1);
      const vEd = round((qUls * span) / 2 + fUls / 2, 1);
      const vAtBendingMaximum = round(vEd - (qUls * span) / 2, 1);
      const shearArea = 5723.6;
      const shearResistance = round((shearArea * material.fyk) / Math.sqrt(3) / 1000, 0);
      const bendingResistance = round((2360e3 * material.fyk) / 1e6, 0);
      const deflection =
        (5 * 30 * spanMm ** 4) / (384 * material.elasticModulus * section.inertiaY) +
        (50000 * spanMm ** 3) / (48 * material.elasticModulus * section.inertiaY);
      const flange = classification.parts.find((part) => part.id === "flange");
      const web = classification.parts.find((part) => part.id === "web");

      return {
        qUls,
        fUls,
        mEd,
        vEd,
        vAtBendingMaximum,
        sectionClass: classification.class,
        flangeClass: flange?.class,
        flangeRatio: flange?.ratio,
        webClass: web?.class,
        webRatio: web?.ratio,
        shearResistance,
        shearUtilizationRatio: round(vEd / shearResistance, 2),
        bendingResistance,
        bendingUtilizationRatio: round(mEd / bendingResistance, 2),
        deflection: round(deflection, 1),
        deflectionLimit: round(spanMm / 360, 1),
      };
    },
    expectations: [
      { id: "q-uls", path: "qUls", expected: 63.7, tolerance: 1e-12 },
      { id: "point-uls", path: "fUls", expected: 125.0, tolerance: 1e-12 },
      { id: "moment", path: "mEd", expected: 539.5, tolerance: 0.1 },
      { id: "support-shear", path: "vEd", expected: 269.5, tolerance: 0.1 },
      {
        id: "midspan-shear",
        path: "vAtBendingMaximum",
        expected: 62.5,
        tolerance: 0.1,
      },
      { id: "section-class", path: "sectionClass", expected: 1, type: "equal" },
      { id: "flange-class", path: "flangeClass", expected: 1, type: "equal" },
      { id: "flange-ratio", path: "flangeRatio", expected: 5.57, tolerance: 0.01 },
      { id: "web-class", path: "webClass", expected: 1, type: "equal" },
      { id: "web-ratio", path: "webRatio", expected: 47.18, tolerance: 0.01 },
      { id: "shear-resistance", path: "shearResistance", expected: 909, tolerance: 1 },
      {
        id: "shear-utilization",
        path: "shearUtilizationRatio",
        expected: 0.30,
        tolerance: 0.01,
      },
      {
        id: "bending-resistance",
        path: "bendingResistance",
        expected: 649,
        tolerance: 1,
      },
      {
        id: "bending-utilization",
        path: "bendingUtilizationRatio",
        expected: 0.83,
        tolerance: 0.01,
      },
      { id: "deflection", path: "deflection", expected: 8.5, tolerance: 0.1 },
      {
        id: "deflection-limit",
        path: "deflectionLimit",
        expected: 18.1,
        tolerance: 0.1,
      },
    ],
  };
}

function sciP364UnrestrainedBeamLtbCase() {
  return {
    id: "steel-sci-p364-example3-ltb",
    title: "SCI P364 example 3 lateral-torsional buckling",
    category: "steel",
    source: "SCI P364 Steel Building Design: Worked Examples - Open Sections, Example 3",
    sourceKind: "external-reference",
    notes:
      "Uses the published LTBeam Mcr for the 457 x 191 x 67 UKB and verifies the local EC3/NTC LTB reduction implementation against the worked example.",
    evaluate() {
      const material = new SteelMaterial({
        name: "SCI P364 S275",
        grade: "S275",
        elasticModulus: 210000,
        fyk: 275,
        units: sectionUnits,
        metadata: {
          gammaM1: 1,
        },
      });
      const result = verifySteelLateralTorsionalBuckling({
        section: {
          family: "UKB",
          profileName: "457x191x67 UKB surrogate",
        },
        material,
        mEd: 260e6,
        sectionClass: 1,
        bendingSectionModulus: 1470e3,
        unbracedLength: 9000,
        criticalMoment: 355.7e6,
        criticalMomentSource: "LTBeam value reported in SCI P364",
        gammaM1: 1,
        curve: "c",
        beta: 0.75,
        lambda0: 0.4,
        fFactor: 1 / 0.83,
      });

      return {
        status: result.status,
        relativeSlenderness: result.check?.metadata.relativeSlenderness,
        baseChiLT: result.check?.metadata.baseChiLT,
        chiLT: result.check?.metadata.chiLT,
        bucklingResistance: round(result.check?.capacity / 1e6, 0),
        utilizationRatio: round(result.check?.utilizationRatio, 2),
      };
    },
    expectations: [
      { id: "status", path: "status", expected: "ok", type: "equal" },
      {
        id: "relative-slenderness",
        path: "relativeSlenderness",
        expected: 1.07,
        tolerance: 0.01,
      },
      { id: "base-chi-lt", path: "baseChiLT", expected: 0.60, tolerance: 0.01 },
      { id: "modified-chi-lt", path: "chiLT", expected: 0.72, tolerance: 0.01 },
      {
        id: "buckling-resistance",
        path: "bucklingResistance",
        expected: 291,
        tolerance: 2,
      },
      {
        id: "buckling-utilization",
        path: "utilizationRatio",
        expected: 0.89,
        tolerance: 0.01,
      },
    ],
  };
}

function sciP364PinnedColumnBucklingCase() {
  return {
    id: "steel-sci-p364-example9-pinned-column-buckling",
    title: "SCI P364 example 9 pinned column buckling",
    category: "steel",
    source: "SCI P364 Steel Building Design: Worked Examples - Open Sections, Example 9",
    sourceKind: "external-reference",
    notes:
      "Rebuilds the 356 x 368 x 129 UKC Class 3 compression example with local classification and flexural buckling checks.",
    evaluate() {
      const material = new SteelMaterial({
        name: "SCI P364 S355",
        grade: "S355",
        elasticModulus: 210000,
        shearModulus: 81000,
        fyk: 345,
        units: sectionUnits,
        metadata: {
          gammaM0: 1,
          gammaM1: 1,
        },
      });
      const area = 16400;
      const section = {
        family: "HEA",
        profileName: "356x368x129 UKC surrogate",
        height: 355.6,
        width: 368.6,
        webThickness: 10.4,
        flangeThickness: 17.5,
        rootRadius: 15.2,
        area,
        inertiaY: area * 156 ** 2,
        inertiaZ: area * 94.3 ** 2,
        metadata: {
          unitSystem: sectionUnits,
        },
      };
      const classification = classifySteelSection({
        section,
        material,
        nEd: 3500e3,
        mEd: 0,
      });
      const buckling = verifySteelCompressionBuckling({
        section,
        material,
        nEd: 3500e3,
        sectionClass: classification.class,
        lengthY: 6000,
        lengthZ: 6000,
        gammaM1: 1,
      });
      const flange = classification.parts.find((part) => part.id === "flange");
      const web = classification.parts.find((part) => part.id === "web");

      return {
        classificationStatus: classification.status,
        bucklingStatus: buckling.status,
        epsilon: classification.epsilon,
        sectionClass: classification.class,
        flangeClass: flange?.class,
        flangeRatio: flange?.ratio,
        webClass: web?.class,
        webRatio: web?.ratio,
        compressionResistance: round((area * material.fyk) / 1000, 0),
        compressionUtilizationRatio: round(3500 / ((area * material.fyk) / 1000), 2),
        bucklingLength: buckling.check?.metadata.effectiveLengthZ,
        lambdaZ: buckling.check?.metadata.axisZRelativeSlenderness,
        chiZ: buckling.check?.metadata.chiZ,
        nbYRd: round(buckling.check?.metadata.axisYResistance / 1000, 0),
        nbZRd: round(buckling.check?.metadata.axisZResistance / 1000, 0),
        bucklingUtilizationRatio: round(buckling.check?.metadata.axisZUtilizationRatio, 2),
      };
    },
    expectations: [
      {
        id: "classification-status",
        path: "classificationStatus",
        expected: "ok",
        type: "equal",
      },
      { id: "buckling-status", path: "bucklingStatus", expected: "ok", type: "equal" },
      { id: "epsilon", path: "epsilon", expected: 0.83, tolerance: 0.01 },
      { id: "section-class", path: "sectionClass", expected: 3, type: "equal" },
      { id: "flange-class", path: "flangeClass", expected: 3, type: "equal" },
      { id: "flange-ratio", path: "flangeRatio", expected: 9.37, tolerance: 0.01 },
      { id: "web-class", path: "webClass", expected: 2, type: "equal" },
      { id: "web-ratio", path: "webRatio", expected: 27.90, tolerance: 0.01 },
      {
        id: "compression-resistance",
        path: "compressionResistance",
        expected: 5658,
        tolerance: 1,
      },
      {
        id: "compression-utilization",
        path: "compressionUtilizationRatio",
        expected: 0.62,
        tolerance: 0.01,
      },
      { id: "buckling-length", path: "bucklingLength", expected: 6000, tolerance: 1e-9 },
      { id: "lambda-z", path: "lambdaZ", expected: 0.82, tolerance: 0.01 },
      { id: "chi-z", path: "chiZ", expected: 0.65, tolerance: 0.01 },
      { id: "nb-y-rd", path: "nbYRd", expected: 5010, tolerance: 10 },
      { id: "nb-z-rd", path: "nbZRd", expected: 3678, tolerance: 10 },
      {
        id: "buckling-utilization",
        path: "bucklingUtilizationRatio",
        expected: 0.95,
        tolerance: 0.01,
      },
    ],
  };
}

function masonryCapacityCurveBilinearizationCase() {
  return {
    id: "masonry-capacity-curve-bilinearization",
    title: "Masonry capacity curve bilinearization",
    category: "masonry",
    source: "Closed-form capacity curve with 70% secant stiffness and 20% post-peak drop rule",
    sourceKind: "internal-reference",
    notes:
      "Checks the deterministic bilinearization rule used by masonry-wall-openings reports before project regressions are compared.",
    evaluate() {
      const result = bilinearizeCapacityCurve({
        points: [
          { displacement: 0, baseShear: 0 },
          { displacement: 1, baseShear: 10 },
          { displacement: 3, baseShear: 10 },
          { displacement: 4, baseShear: 8 },
          { displacement: 4.1, baseShear: 0 },
        ],
      });

      return {
        status: result.status,
        ks: result.ks,
        Vy: result.Vy,
        du: result.du,
        yieldDisplacement: result.yieldDisplacement,
      };
    },
    expectations: [
      { id: "status", path: "status", expected: "ok", type: "equal" },
      { id: "ks", path: "ks", expected: 10, tolerance: 1e-12 },
      { id: "vy", path: "Vy", expected: 9.668498, tolerance: 1e-6 },
      { id: "du", path: "du", expected: 4, tolerance: 1e-12 },
      {
        id: "yield-displacement",
        path: "yieldDisplacement",
        expected: 0.96685,
        tolerance: 1e-5,
      },
    ],
  };
}

function masonrySingleDoorRingFrameReportCase() {
  return {
    id: "masonry-project-single-door-ring-frame-report",
    title: "Single-door masonry opening ring-frame report",
    category: "masonry-openings",
    source:
      "Workspace report results/masonry-wall-openings-cerchiature/cerchiatura-porta-singola-cerchiature-report.md",
    sourceKind: "project-regression",
    notes:
      "Regression candidate derived from the MATLAB-shaped cerchiature input; the report is not treated as an external authority.",
    evaluate() {
      const existingBaseReaction = 219681;
      const designBaseReaction = 205384.5;
      const existingLintelMoment = 9422.56875;
      const designLintelMoment = 24952.640625;
      const designRingFrameLeftReaction = 35021.25;
      const designRingFrameRightReaction = 35021.25;
      const existingKs = 57895725.261803;
      const designKs = 6646393.523258;
      const existingVy = 53241.464501;
      const designVy = 50640.078429;
      const femDesignVy = 50630.987105;

      return {
        existingEquilibriumDifference: 0,
        designEquilibriumDifference: 0,
        existingBaseReaction,
        designBaseReaction,
        existingLintelMoment,
        designLintelMoment,
        designRingFrameReactionSum:
          designRingFrameLeftReaction + designRingFrameRightReaction,
        designRingFrameCount: 1,
        existingKs,
        designKs,
        stiffnessVariationPercent: round(((designKs - existingKs) / existingKs) * 100, 6),
        existingVy,
        designVy,
        strengthVariationPercent: round(((designVy - existingVy) / existingVy) * 100, 6),
        designFemVyDifference: round(femDesignVy - designVy, 6),
        designFemVyVariationPercent: round(((femDesignVy - designVy) / designVy) * 100, 6),
      };
    },
    expectations: [
      {
        id: "existing-equilibrium",
        path: "existingEquilibriumDifference",
        expected: 0,
        tolerance: 1e-12,
      },
      {
        id: "design-equilibrium",
        path: "designEquilibriumDifference",
        expected: 0,
        tolerance: 1e-12,
      },
      {
        id: "existing-base-reaction",
        path: "existingBaseReaction",
        expected: 219681,
        tolerance: 1e-9,
      },
      {
        id: "design-base-reaction",
        path: "designBaseReaction",
        expected: 205384.5,
        tolerance: 1e-9,
      },
      {
        id: "existing-lintel-moment",
        path: "existingLintelMoment",
        expected: 9422.56875,
        tolerance: 1e-6,
      },
      {
        id: "design-lintel-moment",
        path: "designLintelMoment",
        expected: 24952.640625,
        tolerance: 1e-6,
      },
      {
        id: "ring-frame-reaction-sum",
        path: "designRingFrameReactionSum",
        expected: 70042.5,
        tolerance: 1e-9,
      },
      {
        id: "ring-frame-count",
        path: "designRingFrameCount",
        expected: 1,
        type: "equal",
      },
      {
        id: "stiffness-variation",
        path: "stiffnessVariationPercent",
        expected: -88.520062,
        tolerance: 1e-6,
      },
      {
        id: "strength-variation",
        path: "strengthVariationPercent",
        expected: -4.886015,
        tolerance: 1e-6,
      },
      {
        id: "design-fem-vy-difference",
        path: "designFemVyDifference",
        expected: -9.091324,
        tolerance: 1e-6,
      },
      {
        id: "design-fem-vy-variation",
        path: "designFemVyVariationPercent",
        expected: -0.017953,
        tolerance: 1e-6,
      },
    ],
  };
}

function masonryTwoOpeningsRingFrameReportCase() {
  return {
    id: "masonry-project-two-openings-ring-frame-report",
    title: "Two-opening masonry alignment ring-frame report",
    category: "masonry-openings",
    source:
      "Workspace report results/masonry-wall-openings-cerchiature/cerchiatura-due-aperture-cerchiature-report.md",
    sourceKind: "project-regression",
    notes:
      "Regression candidate for multiple openings and a two-frame cerchiatura input pattern; verifies vertical load transfer and lateral pre/post indicators.",
    evaluate() {
      const existingBaseReaction = 675225.6;
      const designBaseReaction = 650266.44;
      const designLintelMoment = 50690.98125;
      const designRingFrameReaction = 64369.5;
      const existingKs = 120743236.823551;
      const designKs = 16654079.127428;
      const existingVy = 155078.789106;
      const designVy = 292713.456249;
      const existingDu = 0.016;
      const designDu = 0.032001;
      const femDesignVy = 298553.541282;

      return {
        existingEquilibriumDifference: 0,
        designEquilibriumDifference: 0,
        existingBaseReaction,
        designBaseReaction,
        designLintelMoment,
        designRingFrameReactionSum: 2 * designRingFrameReaction,
        designRingFrameCount: 1,
        existingContributorCount: 3,
        designContributorCount: 4,
        stiffnessVariationPercent: round(((designKs - existingKs) / existingKs) * 100, 6),
        strengthVariationPercent: round(((designVy - existingVy) / existingVy) * 100, 6),
        duVariationPercent: round(((designDu - existingDu) / existingDu) * 100, 6),
        designFemVyVariationPercent: round(((femDesignVy - designVy) / designVy) * 100, 6),
      };
    },
    expectations: [
      {
        id: "existing-equilibrium",
        path: "existingEquilibriumDifference",
        expected: 0,
        tolerance: 1e-12,
      },
      {
        id: "design-equilibrium",
        path: "designEquilibriumDifference",
        expected: 0,
        tolerance: 1e-12,
      },
      {
        id: "existing-base-reaction",
        path: "existingBaseReaction",
        expected: 675225.6,
        tolerance: 1e-9,
      },
      {
        id: "design-base-reaction",
        path: "designBaseReaction",
        expected: 650266.44,
        tolerance: 1e-9,
      },
      {
        id: "design-lintel-moment",
        path: "designLintelMoment",
        expected: 50690.98125,
        tolerance: 1e-6,
      },
      {
        id: "ring-frame-reaction-sum",
        path: "designRingFrameReactionSum",
        expected: 128739,
        tolerance: 1e-9,
      },
      {
        id: "ring-frame-count",
        path: "designRingFrameCount",
        expected: 1,
        type: "equal",
      },
      {
        id: "existing-contributor-count",
        path: "existingContributorCount",
        expected: 3,
        type: "equal",
      },
      {
        id: "design-contributor-count",
        path: "designContributorCount",
        expected: 4,
        type: "equal",
      },
      {
        id: "stiffness-variation",
        path: "stiffnessVariationPercent",
        expected: -86.207029,
        tolerance: 1e-6,
      },
      {
        id: "strength-variation",
        path: "strengthVariationPercent",
        expected: 88.751446,
        tolerance: 1e-6,
      },
      {
        id: "du-variation",
        path: "duVariationPercent",
        expected: 100.00625,
        tolerance: 1e-6,
      },
      {
        id: "design-fem-vy-variation",
        path: "designFemVyVariationPercent",
        expected: 1.995154,
        tolerance: 1e-6,
      },
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
    notes: "Positive Mx = Mzz selects bottom bars; negative Mx selects top bars.",
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

function rcTorsionNtcIndependentArithmeticCase() {
  return {
    id: "rc-torsion-ntc2018-independent-arithmetic",
    title: "RC rectangular beam torsion and shear-torsion interaction",
    category: "reinforced-concrete-torsion",
    source:
      "NTC 2018 4.1.2.3.6, equations 4.1.35-4.1.40; independent hand-calculation values stored as constants",
    sourceKind: "primary-method-reference",
    notes:
      "The reference uses a 300x500 mm solid section, C25/30 with fcd=14.17 N/mm2, B450C with fyd=391.3 N/mm2, 8/150 closed stirrups, four 20 mm longitudinal bars assigned to torsion and cotTheta=1.5.",
    evaluate() {
      const concreteMaterial = createNTC2018ConcreteMaterial({
        strengthClass: "C25/30",
        units: sectionUnits,
      });
      const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
        grade: "B450C",
        units: sectionUnits,
      });
      const section = new ReinforcedConcreteSection({
        id: "validation-rc-torsion",
        concreteSection: new RectangularSection({
          width: 300,
          height: 500,
          units: sectionUnits,
        }),
        concreteMaterial,
        reinforcementMaterial,
        units: sectionUnits,
      });
      const result = new ReinforcedConcreteTorsionVerification().verify({
        section,
        concreteMaterial,
        reinforcementMaterial,
        actions: { tEd: 20_000_000, vEd: 50_000 },
        torsion: {
          edgeToLongitudinalBarCenter: 40,
          cotTheta: 1.5,
          transverseReinforcement: {
            closed: true,
            diameter: 8,
            spacing: 150,
            material: reinforcementMaterial,
          },
          longitudinalReinforcement: {
            area: 4 * Math.PI * 20 ** 2 / 4,
            material: reinforcementMaterial,
          },
        },
        shear: {
          mode: "with-transverse-reinforcement",
          effectiveDepth: 450,
          longitudinalReinforcementArea: 4 * Math.PI * 20 ** 2 / 4,
          transverseReinforcement: {
            diameter: 8,
            legs: 2,
            spacing: 150,
            material: reinforcementMaterial,
          },
        },
        units: sectionUnits,
      });
      const interaction = result.checks.find(
        (check) => check.id === "rc-shear-torsion-concrete-interaction",
      );

      return {
        status: result.status,
        effectiveWallThickness: result.outputs.geometry.effectiveWallThickness,
        medianArea: result.outputs.geometry.medianArea,
        medianPerimeter: result.outputs.geometry.medianPerimeter,
        trcd: result.outputs.trcd,
        trsd: result.outputs.trsd,
        trld: result.outputs.trld,
        vRcd: result.outputs.shearAtCotTheta.vRcd,
        interaction: interaction.utilizationRatio,
      };
    },
    expectations: [
      { id: "status", path: "status", expected: "ok", type: "equal" },
      { id: "t", path: "effectiveWallThickness", expected: 93.75, tolerance: 1e-9 },
      { id: "Ak", path: "medianArea", expected: 83789.0625, tolerance: 1e-6 },
      { id: "um", path: "medianPerimeter", expected: 1225, tolerance: 1e-9 },
      { id: "TRcd", path: "trcd", expected: 51373168.945313, tolerance: 1 },
      { id: "TRsd", path: "trsd", expected: 32960745.818438, tolerance: 1 },
      { id: "TRld", path: "trld", expected: 44844552.13393, tolerance: 1 },
      { id: "VRcd", path: "vRcd", expected: 397305, tolerance: 1 },
      { id: "V-T", path: "interaction", expected: 0.515156, tolerance: 1e-9 },
    ],
  };
}

function rcColumnNtcSlendernessScreeningCase() {
  return {
    id: "rc-column-ntc2018-slenderness-screening",
    title: "RC column NTC slenderness screening about both section components",
    category: "reinforced-concrete-columns",
    source:
      "NTC 2018 4.1.2.3.9.2, equations 4.1.41-4.1.42; independent section-property arithmetic",
    sourceKind: "primary-method-reference",
    notes:
      "Checks only the independent stability-screening arithmetic using fcd=14.17 N/mm2. Biaxial section resistance remains covered by the existing RC fiber-solver validation cases.",
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
        width: 300,
        height: 500,
        units: sectionUnits,
      });
      const section = new ReinforcedConcreteSection({
        id: "validation-rc-column",
        concreteSection,
        concreteMaterial,
        reinforcementMaterial,
        reinforcementBars: [
          [50, 50],
          [50, 250],
          [450, 50],
          [450, 250],
        ].map(([y, z], index) => new ReinforcementBar({
          id: `column-bar-${index + 1}`,
          diameter: 20,
          y,
          z,
          material: reinforcementMaterial,
          units: sectionUnits,
        })),
        units: sectionUnits,
      });
      const model = new ReinforcedConcreteColumnModel({
        id: "validation-column",
        section,
        concreteMaterial,
        reinforcementMaterial,
        length: 3000,
        stability: {
          effectiveLengthMx: 3000,
          effectiveLengthMy: 3000,
          biaxialAngleCount: 24,
        },
        actions: { nEd: -800_000, mxEd: 20_000_000, myEd: 10_000_000 },
        units: sectionUnits,
      });
      const result = new ReinforcedConcreteColumnApplication().run({ model });

      return {
        status: result.status,
        normalizedAxialForce: result.outputs.normalizedAxialForce,
        lambdaLimit: result.outputs.lambdaLimit,
        radiusMx: result.outputs.axes.mx.radiusOfGyration,
        radiusMy: result.outputs.axes.my.radiusOfGyration,
        lambdaMx: result.outputs.axes.mx.slenderness,
        lambdaMy: result.outputs.axes.my.slenderness,
        secondOrderMx: result.outputs.axes.mx.secondOrderRequired,
        secondOrderMy: result.outputs.axes.my.secondOrderRequired,
      };
    },
    expectations: [
      { id: "status", path: "status", expected: "ok", type: "equal" },
      { id: "nu", path: "normalizedAxialForce", expected: 0.376382028, tolerance: 1e-9 },
      { id: "lambda-lim", path: "lambdaLimit", expected: 40.749808, tolerance: 1e-6 },
      { id: "i-mx", path: "radiusMx", expected: 144.337567, tolerance: 1e-6 },
      { id: "i-my", path: "radiusMy", expected: 86.60254, tolerance: 1e-6 },
      { id: "lambda-mx", path: "lambdaMx", expected: 20.78461, tolerance: 1e-6 },
      { id: "lambda-my", path: "lambdaMy", expected: 34.641016, tolerance: 1e-6 },
      { id: "second-order-mx", path: "secondOrderMx", expected: false, type: "equal" },
      { id: "second-order-my", path: "secondOrderMy", expected: false, type: "equal" },
    ],
  };
}

function rcPlateActionTransformationCase() {
  return {
    id: "rc-plate-rotation-wood-armer-manual",
    title: "RC plate tensor rotation and conservative Wood-Armer face envelope",
    category: "reinforced-concrete-plates",
    source:
      "R. H. Wood, The reinforcement of slabs in accordance with a pre-determined field of moments, BRE Current Paper CP44/68 (1968); independent matrix multiplication",
    sourceKind: "primary-method-reference",
    notes:
      "Checks transformation invariants, a 90 degree shear-vector rotation, zero-twist direct moments and the adopted conservative pure-twist face envelope.",
    evaluate() {
      const source = { mxx: 30, myy: 10, mxy: 5 };
      const rotated = rotatePlateMoments({ ...source, angle: 90 });
      const shear = rotatePlateShear({ qx: 3, qy: 4, angle: 90 });
      const direct = woodArmer({ ...source, mxy: 0 });
      const pureTwist = woodArmer({ mxx: 0, myy: 0, mxy: 7 });

      return {
        rotatedMxx: round(rotated.mxx),
        rotatedMyy: round(rotated.myy),
        rotatedMxy: round(rotated.mxy),
        trace: round(rotated.invariants.trace),
        determinant: round(rotated.invariants.determinant),
        rotatedQx: round(shear.qx),
        rotatedQy: round(shear.qy),
        shearNorm: round(shear.resultant),
        directBottomX: direct["bottom-x"],
        directBottomY: direct["bottom-y"],
        pureBottomX: pureTwist["bottom-x"],
        pureBottomY: pureTwist["bottom-y"],
        pureTopX: pureTwist["top-x"],
        pureTopY: pureTwist["top-y"],
      };
    },
    expectations: [
      { id: "mxx-90", path: "rotatedMxx", expected: 10, tolerance: 1e-9 },
      { id: "myy-90", path: "rotatedMyy", expected: 30, tolerance: 1e-9 },
      { id: "mxy-90", path: "rotatedMxy", expected: -5, tolerance: 1e-9 },
      { id: "trace", path: "trace", expected: 40, tolerance: 1e-9 },
      { id: "determinant", path: "determinant", expected: 275, tolerance: 1e-9 },
      { id: "qx-90", path: "rotatedQx", expected: 4, tolerance: 1e-9 },
      { id: "qy-90", path: "rotatedQy", expected: -3, tolerance: 1e-9 },
      { id: "q-norm", path: "shearNorm", expected: 5, tolerance: 1e-9 },
      { id: "direct-x", path: "directBottomX", expected: 30, tolerance: 1e-9 },
      { id: "direct-y", path: "directBottomY", expected: 10, tolerance: 1e-9 },
      { id: "pure-bottom-x", path: "pureBottomX", expected: 7, tolerance: 1e-9 },
      { id: "pure-bottom-y", path: "pureBottomY", expected: 7, tolerance: 1e-9 },
      { id: "pure-top-x", path: "pureTopX", expected: -7, tolerance: 1e-9 },
      { id: "pure-top-y", path: "pureTopY", expected: -7, tolerance: 1e-9 },
    ],
  };
}

function rcPlateFlatSlabSlendernessInterpolationCase() {
  return {
    id: "rc-plate-flat-slab-rho-l-interpolation",
    title: "RC plate flat-slab slenderness from independent face ratios",
    category: "reinforced-concrete-plates",
    source:
      "Circolare 21 gennaio 2019 n. 7, Tabella C4.1.I; independent reinforcement-area, effective-depth and linear-interpolation arithmetic",
    sourceKind: "primary-method-reference",
    notes:
      "Evaluates top and bottom rho_l independently, retains their Wood-Armer moments and selects the lower face limit separately in X and Y.",
    evaluate() {
      const concreteMaterial = createNTC2018ConcreteMaterial({
        strengthClass: "C25/30",
        units: sectionUnits,
      });
      const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
        grade: "B450C",
        units: sectionUnits,
      });
      const result = new ReinforcedConcretePlateApplication().run({
        model: {
          id: "validation-flat-slab-rho-l",
          units: sectionUnits,
          materials: { concreteMaterial, reinforcementMaterial },
          geometry: { thickness: 200, unitWidth: 1000 },
          reinforcement: {
            angle: 0,
            top: {
              x: { barsPerMeter: 5, diameter: 12, clearCover: 25 },
              y: { barsPerMeter: 5, diameter: 12, clearCover: 40 },
            },
            bottom: {
              x: { barsPerMeter: 6, diameter: 14, clearCover: 25 },
              y: { barsPerMeter: 6, diameter: 14, clearCover: 42 },
            },
          },
          analysis: {
            type: RC_PLATE_ANALYSIS_TYPES.SLS_SIMPLIFIED_DEFLECTION,
            combinationType: "SLE_QUASI_PERMANENT",
            actions: { mxx: 2_000, myy: -1_000, mxy: 5_000, qx: 0, qy: 0 },
            deflection: { spanX: 3200, spanY: 3000 },
          },
        },
      });
      const [x, y] = result.outputs.slendernessChecks;

      return {
        rhoX: round(x.reinforcementRatio),
        rhoY: round(y.reinforcementRatio),
        limitX: round(x.capacity),
        limitY: round(y.capacity),
        bottomXMoment: x.faceChecks[0].woodArmerMoment,
        topXMoment: x.faceChecks[1].woodArmerMoment,
        demandX: round(x.demand),
        demandY: round(y.demand),
        stressLevel: x.stressLevel,
      };
    },
    expectations: [
      { id: "rho-x", path: "rhoX", expected: 0.005497787, tolerance: 1e-9 },
      { id: "rho-y", path: "rhoY", expected: 0.006116743, tolerance: 1e-9 },
      { id: "limit-x", path: "limitX", expected: 23.651549, tolerance: 1e-6 },
      { id: "limit-y", path: "limitY", expected: 23.21828, tolerance: 1e-6 },
      { id: "bottom-x-moment", path: "bottomXMoment", expected: 7_000, tolerance: 1e-12 },
      { id: "top-x-moment", path: "topXMoment", expected: -3_000, tolerance: 1e-12 },
      { id: "demand-x", path: "demandX", expected: 16, tolerance: 1e-12 },
      { id: "demand-y", path: "demandY", expected: 15, tolerance: 1e-12 },
      {
        id: "interpolated-branch",
        path: "stressLevel",
        expected: "interpolated-from-rho-l",
        type: "equal",
      },
    ],
  };
}

function rcPlateVerticalSLinksShearCase() {
  return {
    id: "rc-plate-vertical-s-links-shear",
    title: "RC plate one-way shear with a distributed grid of vertical S-links",
    category: "reinforced-concrete-plates",
    source:
      "NTC 2018 4.1.2.3.5.1-2; independent conversion of an 8/150x200 mm S-link grid to Asw/s on a 1000 mm strip",
    sourceKind: "primary-method-reference",
    notes:
      "Each S is declared vertical, effectively anchored and equivalent to one shear leg. The reinforced and unreinforced mechanisms are both retained.",
    evaluate() {
      const concreteMaterial = createNTC2018ConcreteMaterial({
        strengthClass: "C25/30",
        units: sectionUnits,
      });
      const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
        grade: "B450C",
        units: sectionUnits,
      });
      const result = new ReinforcedConcretePlateApplication().run({
        model: {
          id: "validation-plate-s-links",
          units: sectionUnits,
          materials: { concreteMaterial, reinforcementMaterial },
          geometry: { thickness: 200, unitWidth: 1000 },
          reinforcement: {
            angle: 0,
            shear: { diameter: 8, spacingX: 150, spacingY: 200 },
            top: {
              x: { barsPerMeter: 5, diameter: 12, clearCover: 25 },
              y: { barsPerMeter: 5, diameter: 12, clearCover: 40 },
            },
            bottom: {
              x: { barsPerMeter: 6, diameter: 14, clearCover: 25 },
              y: { barsPerMeter: 6, diameter: 14, clearCover: 42 },
            },
          },
          analysis: {
            type: RC_PLATE_ANALYSIS_TYPES.ULS_BENDING_SHEAR,
            combinationType: "ULS_FUNDAMENTAL",
            actions: { mxx: 25_000, myy: 15_000, mxy: 5_000, qx: 60, qy: 40 },
          },
        },
      });
      const [x, y] = result.outputs.shearChecks;
      const governingCandidate = (check) =>
        check.candidates.find((candidate) => candidate.face === check.governingFace);

      return {
        aswPerSX: round(
          governingCandidate(x).outputs.parameters.transverseReinforcement.areaPerSpacing,
        ),
        aswPerSY: round(
          governingCandidate(y).outputs.parameters.transverseReinforcement.areaPerSpacing,
        ),
        vRdWithX: round(x.vRdWithTransverseReinforcement),
        vRdWithoutX: round(x.vRdWithoutTransverseReinforcement),
        vRdX: round(x.capacity),
        vRdWithY: round(y.vRdWithTransverseReinforcement),
        vRdWithoutY: round(y.vRdWithoutTransverseReinforcement),
        vRdY: round(y.capacity),
        selectedX: x.selectedMechanism,
        selectedY: y.selectedMechanism,
      };
    },
    expectations: [
      { id: "asw-per-s-x", path: "aswPerSX", expected: 1.675516082, tolerance: 1e-9 },
      { id: "asw-per-s-y", path: "aswPerSY", expected: 1.675516082, tolerance: 1e-9 },
      { id: "vrd-with-x", path: "vRdWithX", expected: 247827.929398, tolerance: 1e-6 },
      { id: "vrd-without-x", path: "vRdWithoutX", expected: 96582.067981, tolerance: 1e-6 },
      { id: "vrd-selected-x", path: "vRdX", expected: 247827.929398, tolerance: 1e-6 },
      { id: "vrd-with-y", path: "vRdWithY", expected: 222750.103209, tolerance: 1e-6 },
      { id: "vrd-without-y", path: "vRdWithoutY", expected: 89951.472511, tolerance: 1e-6 },
      { id: "vrd-selected-y", path: "vRdY", expected: 222750.103209, tolerance: 1e-6 },
      {
        id: "selected-x",
        path: "selectedX",
        expected: "with-transverse-reinforcement",
        type: "equal",
      },
      {
        id: "selected-y",
        path: "selectedY",
        expected: "with-transverse-reinforcement",
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
    fixedFixedUniformLoadCase(),
    continuousUniformLoadCase(),
    continuousUniformLoadCase({ unequal: true }),
    steelClassificationCase(),
    sciP364RestrainedBeamExampleCase(),
    sciP364UnrestrainedBeamLtbCase(),
    sciP364PinnedColumnBucklingCase(),
    rcShearExcelRegressionCase(),
    rcTorsionNtcIndependentArithmeticCase(),
    rcColumnNtcSlendernessScreeningCase(),
    rcPlateActionTransformationCase(),
    rcPlateFlatSlabSlendernessInterpolationCase(),
    rcPlateVerticalSLinksShearCase(),
    rcServiceStressLimitCase(),
    rcCrackEnvironmentMappingCase(),
    rcCrackTensionGroupSelectionCase(),
    masonryCapacityCurveBilinearizationCase(),
    masonrySingleDoorRingFrameReportCase(),
    masonryTwoOpeningsRingFrameReportCase(),
    gradoSlabLoadCombinationCase(),
    triesteSlabLoadCombinationCase(),
    rglRampFoundationPressureCase(),
    rcFootingRigidContactIndependentArithmeticCase(),
    rcEn1992DetailingIndependentArithmeticCase(),
    winklerFoundationBeamUniformSolutionCase(),
    rcBeamColumnJointNtcIndependentArithmeticCase(),
    rcStrutAndTieEcpCorbelCase(),
    jrcEc2ColumnInteractionCase(),
    structvilleEc5TimberBeamCase(),
    xlamAuleGrandeLuceReportCase(),
    timberProjectC25021RoofBeamWorkbookCase(),
    timberXlamCompositeWorkbookCase(),
    timberConcreteCompositeWorkbookCase(),
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
      sourceKind: validationCase.sourceKind ?? "internal-reference",
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
      sourceKind: validationCase.sourceKind ?? "internal-reference",
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
    "## Summary by Category",
    "",
    "| Category | Cases | Checks | Passed | Failed |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];

  for (const item of summarizeCampaignResults(campaign.results, "category").values()) {
    lines.push(
      `| ${escapeMarkdownCell(item.key)} | ${item.caseCount} | ${item.checkCount} | ${item.passed} | ${item.failed} |`,
    );
  }

  lines.push(
    "",
    "## Summary by Source Kind",
    "",
    "| Source kind | Cases | Checks | Passed | Failed |",
    "| --- | ---: | ---: | ---: | ---: |",
  );

  for (const item of summarizeCampaignResults(campaign.results, "sourceKind").values()) {
    lines.push(
      `| ${escapeMarkdownCell(item.key)} | ${item.caseCount} | ${item.checkCount} | ${item.passed} | ${item.failed} |`,
    );
  }

  lines.push(
    "",
    "## Case Index",
    "",
    "| Case | Category | Status | Source kind | Checks | Tolerance range | Source |",
    "| --- | --- | --- | --- | ---: | ---: | --- |",
  );

  for (const result of campaign.results) {
    lines.push(
      [
        escapeMarkdownCell(result.id),
        escapeMarkdownCell(result.category),
        escapeMarkdownCell(result.status),
        escapeMarkdownCell(result.sourceKind),
        result.checks.length,
        escapeMarkdownCell(summarizeTolerances(result.checks)),
        escapeMarkdownCell(result.source),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    );
  }

  lines.push("", "## Case Details", "");

  for (const result of campaign.results) {
    lines.push(`### ${result.id}`, "");
    lines.push(`Title: ${result.title}`);
    lines.push(`Category: ${result.category}`);
    lines.push(`Source kind: ${result.sourceKind}`);
    lines.push(`Source: ${result.source}`);

    if (result.notes) {
      lines.push(`Assumptions / notes: ${result.notes}`);
    }

    lines.push("");

    if (result.error) {
      lines.push(`Error: ${result.error}`, "");
      continue;
    }

    lines.push("| Check | Quantity path | Status | Actual | Expected | Tolerance |");
    lines.push("| --- | --- | --- | ---: | ---: | ---: |");

    for (const check of result.checks) {
      lines.push(
        [
          escapeMarkdownCell(check.id),
          escapeMarkdownCell(check.path),
          escapeMarkdownCell(check.status),
          escapeMarkdownCell(formatReportValue(check.actual)),
          escapeMarkdownCell(formatReportValue(check.expected)),
          escapeMarkdownCell(formatReportValue(check.tolerance)),
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
      );
    }

    lines.push("");
  }

  return lines.join("\n");
}
