import {
  RectangularSection,
  ReinforcedConcreteBeamVerification,
  ReinforcedConcreteSection,
  ReinforcementBar,
  SingleBeamDesignModel,
  SteelMemberVerification,
  TimberBeamVerification,
  TimberConcreteCompositeBeamModel,
  TimberConcreteCompositeBeamSectionProvider,
  TimberConcreteCompositeBeamVerification,
  TimberDowelConnector,
  TimberMaterial,
  TimberXlamCompositeBeamModel,
  TimberXlamCompositeBeamSectionProvider,
  TimberXlamCompositeBeamVerification,
  XlamPanelSection,
  XlamMaterial,
  XlamBeamSectionProvider,
  XlamBeamVerification,
  createNTC2018BeamCombinations,
  createNTC2018ConcreteMaterial,
  createNTC2018PermanentAction,
  createNTC2018ReinforcementSteelMaterial,
  createNTC2018StructuralSteelMaterial,
  createNTC2018TimberMaterial,
  createNTC2018VariableAction,
  createReinforcedConcreteBeamSectionProvider,
  createSteelBeamSectionProvider,
  createSteelProfileSection,
  createLongitudinalReinforcementLayout,
  createTecnariaConnector,
  createTimberBeamSectionProvider,
  getNTC2018TimberKmod,
} from "../src/index.js";

const beamUnits = Object.freeze({ force: "kN", length: "m" });
const sectionUnits = Object.freeze({ force: "N", length: "mm" });
const compositeUnits = Object.freeze({ force: "N", length: "mm" });

function permanentAction(id, permanentClass = "G1") {
  return createNTC2018PermanentAction({
    id,
    permanentClass,
  });
}

function liveAction(id, category = "B") {
  return createNTC2018VariableAction({
    id,
    category,
  });
}

function timberKmodResolver({ loadDurationClass, serviceClass, materialType }) {
  return getNTC2018TimberKmod({
    materialType,
    serviceClass,
    loadDurationClass,
  });
}

function timberModel({
  id,
  title,
  description,
  strengthClass,
  width,
  height,
  span,
  g1,
  g2,
  live,
  deflectionLimitDenominator = 300,
}) {
  const section = new RectangularSection({
    width,
    height,
    units: sectionUnits,
  });
  const material = createNTC2018TimberMaterial({
    strengthClass,
    serviceClass: 1,
    units: sectionUnits,
  });
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -g1,
      action: permanentAction("ACT-G1", "G1"),
    },
    {
      id: "g2",
      loadCaseId: "G2",
      value: -g2,
      action: permanentAction("ACT-G2", "G2"),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -live,
      action: liveAction("ACT-LIVE"),
    },
  ];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_RARE", "SLE_QUASI_PERMANENT"],
    idPrefix: id,
  });
  const sectionProvider = createTimberBeamSectionProvider({
    section,
    material,
    gammaM: 1.5,
    kdef: 0.6,
    kmodResolver: timberKmodResolver,
  });

  return new SingleBeamDesignModel({
    id,
    title,
    description,
    units: beamUnits,
    section,
    material,
    beamInput: {
      units: beamUnits,
      geometry: {
        start: { x: 0, y: 0 },
        end: { x: span, y: 0 },
      },
      analysisModel: "timoshenko",
      sectionProvider,
      supports: {
        start: "hinge",
        end: "roller",
      },
      loads,
      combinations,
      discretization: {
        elementCount: 4,
        stations: [span / 2],
      },
    },
    verification: {
      verifier: new TimberBeamVerification({
        deflectionLimitDenominator,
      }),
      input: {
        beamId: id,
        section,
        material,
      },
    },
  });
}

export function createTimberC24BeamReportModel() {
  return timberModel({
    id: "timber-c24-report",
    title: "Trave in legno C24",
    description: "Trave appoggio-appoggio con carichi permanenti e variabile.",
    strengthClass: "C24",
    width: 140,
    height: 280,
    span: 4,
    g1: 0.8,
    g2: 0.4,
    live: 1,
  });
}

export function createGlulamGL24hBeamReportModel() {
  return timberModel({
    id: "glulam-gl24h-report",
    title: "Trave in legno lamellare GL24h",
    description: "Trave lamellare con luce maggiore e controllo di deformabilita.",
    strengthClass: "GL24h",
    width: 160,
    height: 360,
    span: 6,
    g1: 1.1,
    g2: 0.7,
    live: 1.6,
    deflectionLimitDenominator: 300,
  });
}

export function createTimberCantileverPointLoadReportModel() {
  const id = "timber-c24-cantilever-point-report";
  const span = 3;
  const section = new RectangularSection({
    width: 120,
    height: 260,
    units: sectionUnits,
  });
  const material = createNTC2018TimberMaterial({
    strengthClass: "C24",
    serviceClass: 1,
    units: sectionUnits,
  });
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      type: "uniform",
      value: -0.6,
      action: permanentAction("ACT-G1", "G1"),
    },
    {
      id: "tip-live",
      loadCaseId: "LIVE",
      type: "point",
      position: "end",
      value: -1.2,
      action: liveAction("ACT-LIVE"),
    },
  ];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_RARE", "SLE_QUASI_PERMANENT"],
    idPrefix: id,
  });

  return new SingleBeamDesignModel({
    id,
    title: "Mensola in legno C24",
    description: "Mensola in legno massiccio con carico puntuale in estremita.",
    units: beamUnits,
    section,
    material,
    beamInput: {
      units: beamUnits,
      geometry: {
        start: { x: 0, y: 0 },
        end: { x: span, y: 0 },
      },
      analysisModel: "timoshenko",
      sectionProvider: createTimberBeamSectionProvider({
        section,
        material,
        gammaM: 1.5,
        kdef: 0.6,
        kmodResolver: timberKmodResolver,
      }),
      supports: {
        start: "fixed",
      },
      loads,
      combinations,
      discretization: {
        elementCount: 6,
        stations: [span / 2, "end"],
      },
      verificationStations: {
        mode: "combined",
        count: 7,
        userStations: [span / 2, "end"],
      },
    },
    verification: {
      verifier: new TimberBeamVerification({
        deflectionLimitDenominator: 200,
      }),
      input: {
        beamId: id,
        section,
        material,
      },
    },
  });
}

export function createSteelIpeBeamReportModel() {
  const id = "steel-ipe200-report";
  const section = createSteelProfileSection({
    profileName: "IPE200",
    units: beamUnits,
  });
  const material = createNTC2018StructuralSteelMaterial({
    grade: "S275",
    units: beamUnits,
  });
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -3,
      action: permanentAction("ACT-G1", "G1"),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -2,
      action: liveAction("ACT-LIVE"),
    },
  ];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_RARE"],
    idPrefix: id,
  });

  return new SingleBeamDesignModel({
    id,
    title: "Trave in acciaio IPE200",
    description: "Trave appoggio-appoggio con profilo IPE, verifiche di sezione e stabilita N+Mzz.",
    units: beamUnits,
    section,
    material,
    beamInput: {
      units: beamUnits,
      geometry: {
        start: { x: 0, y: 0 },
        end: { x: 5, y: 0 },
      },
      analysisModel: "timoshenko",
      sectionProvider: createSteelBeamSectionProvider({
        section,
        material,
      }),
      supports: {
        start: "hinge",
        end: "roller",
      },
      loads,
      combinations,
      discretization: {
        elementCount: 4,
        stations: [2.5],
      },
    },
    verification: {
      verifier: new SteelMemberVerification({
        stability: {
          lateralTorsionalBuckling: {
            unbracedLength: 2.5,
          },
        },
      }),
      input: {
        memberId: id,
        section,
        material,
      },
    },
  });
}

export function createSteelCantileverReportModel() {
  const id = "steel-cantilever-s355-report";
  const section = createSteelProfileSection({
    profileName: "HEA200",
    units: beamUnits,
  });
  const material = createNTC2018StructuralSteelMaterial({
    grade: "S355",
    units: beamUnits,
  });
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      type: "uniform",
      value: -1.5,
      action: permanentAction("ACT-G1", "G1"),
    },
    {
      id: "tip-load",
      loadCaseId: "LIVE",
      type: "point",
      position: "end",
      value: -6,
      action: liveAction("ACT-LIVE"),
    },
  ];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_RARE"],
    idPrefix: id,
  });

  return new SingleBeamDesignModel({
    id,
    title: "Mensola in acciaio S355 HEA200",
    description: "Mensola con carico puntuale in estremita e verifiche di sezione e stabilita N+Mzz.",
    units: beamUnits,
    section,
    material,
    beamInput: {
      units: beamUnits,
      geometry: {
        start: { x: 0, y: 0 },
        end: { x: 3, y: 0 },
      },
      analysisModel: "timoshenko",
      sectionProvider: createSteelBeamSectionProvider({
        section,
        material,
      }),
      supports: {
        start: "fixed",
      },
      loads,
      combinations,
      discretization: {
        elementCount: 6,
        stations: [1.5, "end"],
      },
    },
    verification: {
      verifier: new SteelMemberVerification({
        stability: {
          lateralTorsionalBuckling: {
            criticalMoment: 180,
            criticalMomentSource: "example-user-input",
          },
        },
      }),
      input: {
        memberId: id,
        section,
        material,
      },
    },
  });
}

export function createSteelUpnUserMcrReportModel() {
  const id = "steel-upn200-user-mcr-report";
  const section = createSteelProfileSection({
    profileName: "UPN200",
    units: beamUnits,
  });
  const material = createNTC2018StructuralSteelMaterial({
    grade: "S275",
    units: beamUnits,
  });
  const span = 4.5;
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -2.5,
      action: permanentAction("ACT-G1", "G1"),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -1.8,
      action: liveAction("ACT-LIVE"),
    },
  ];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_RARE"],
    idPrefix: id,
  });

  return new SingleBeamDesignModel({
    id,
    title: "Trave in acciaio UPN200 con Mcr utente",
    description: "Profilo UPN verificato con momento critico elastico fornito dall'utente.",
    units: beamUnits,
    section,
    material,
    beamInput: {
      units: beamUnits,
      geometry: {
        start: { x: 0, y: 0 },
        end: { x: span, y: 0 },
      },
      analysisModel: "timoshenko",
      sectionProvider: createSteelBeamSectionProvider({
        section,
        material,
      }),
      supports: {
        start: "hinge",
        end: "roller",
      },
      loads,
      combinations,
      discretization: {
        elementCount: 6,
        stations: [span / 2],
      },
      verificationStations: {
        mode: "combined",
        count: 7,
        userStations: [span / 2],
      },
    },
    verification: {
      verifier: new SteelMemberVerification({
        stability: {
          lateralTorsionalBuckling: {
            criticalMoment: 120,
            criticalMomentSource: "example-user-mcr",
            unbracedLength: span,
          },
        },
      }),
      input: {
        memberId: id,
        section,
        material,
      },
    },
  });
}

export function createSteelCompressionInteractionReportModel() {
  const id = "steel-ipe200-compression-interaction-report";
  const section = createSteelProfileSection({
    profileName: "IPE200",
    units: beamUnits,
  });
  const material = createNTC2018StructuralSteelMaterial({
    grade: "S275",
    units: beamUnits,
  });
  const span = 5;
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -2.5,
      action: permanentAction("ACT-G1", "G1"),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -1.5,
      action: liveAction("ACT-LIVE"),
    },
    {
      id: "axial",
      loadCaseId: "AXIAL",
      type: "point",
      position: "end",
      direction: "x",
      value: -70,
      action: liveAction("ACT-AXIAL"),
    },
  ];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_RARE"],
    idPrefix: id,
  });

  return new SingleBeamDesignModel({
    id,
    title: "Trave in acciaio IPE200 con compressione",
    description: "Trave appoggio-appoggio con carico assiale e verifica di interazione N + Mzz.",
    units: beamUnits,
    section,
    material,
    beamInput: {
      units: beamUnits,
      geometry: {
        start: { x: 0, y: 0 },
        end: { x: span, y: 0 },
      },
      analysisModel: "timoshenko",
      sectionProvider: createSteelBeamSectionProvider({
        section,
        material,
      }),
      supports: {
        start: "hinge",
        end: "roller",
      },
      loads,
      combinations,
      discretization: {
        elementCount: 6,
        stations: [span / 2],
      },
      verificationStations: {
        mode: "combined",
        count: 7,
        userStations: [span / 2],
      },
    },
    verification: {
      verifier: new SteelMemberVerification({
        stability: {
          lateralTorsionalBuckling: {
            unbracedLength: span,
          },
        },
      }),
      input: {
        memberId: id,
        section,
        material,
      },
    },
  });
}

export function createRcElasticBeamReportModel() {
  const id = "rc-elastic-report";
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
      diameter: 20,
      count: 2,
      cover: 40,
    },
    top: {
      id: "top-main",
      diameter: 20,
      count: 2,
      cover: 40,
    },
  });
  const section = new ReinforcedConcreteSection({
    name: "RC 30x50",
    concreteSection,
    reinforcementBars: reinforcementLayout.reinforcementBars,
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio:
      reinforcementMaterial.elasticModulus / concreteMaterial.elasticModulus,
    metadata: {
      longitudinalReinforcementGroups:
        reinforcementLayout.longitudinalReinforcementGroups,
    },
    units: sectionUnits,
  });
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -8,
      action: permanentAction("ACT-G1", "G1"),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -5,
      action: liveAction("ACT-LIVE"),
    },
  ];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_RARE", "SLE_FREQUENT", "SLE_QUASI_PERMANENT"],
    idPrefix: id,
  });

  return new SingleBeamDesignModel({
    id,
    title: "Trave in c.a. elastica C25/30",
    description:
      "Analisi elastica non fessurata con rigidezza trasformata e prima verifica ULS di sezione da azioni FEM.",
    units: beamUnits,
    section,
    material: concreteMaterial,
    beamInput: {
      units: beamUnits,
      geometry: {
        start: { x: 0, y: 0 },
        end: { x: 5, y: 0 },
      },
      sectionProvider: createReinforcedConcreteBeamSectionProvider({
        section,
        stiffnessState: "transformed",
      }),
      supports: {
        start: "hinge",
        end: "roller",
      },
      loads,
      combinations,
      discretization: {
        elementCount: 5,
        stations: [2.5],
      },
    },
    metadata: {
      verificationScope: "uls-uniaxial-section-actions",
    },
    verification: {
      verifier: new ReinforcedConcreteBeamVerification({
        mesh: {
          targetFiberCount: 80,
        },
      }),
      input: {
        beamId: id,
        section,
        concreteMaterial,
        reinforcementMaterial,
        shear: {
          mode: "with-transverse-reinforcement",
          effectiveDepth: 450,
          longitudinalReinforcementGroupId: "bottom-main",
          transverseReinforcement: {
            type: "stirrups",
            diameter: 8,
            legs: 2,
            spacing: 150,
            material: reinforcementMaterial,
          },
          cotThetaMin: 1,
          cotThetaMax: 2.5,
        },
      },
    },
  });
}

export function createRcAggressiveCrackReportModel() {
  const id = "rc-aggressive-crack-report";
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
    name: "RC aggressive 30x50",
    concreteSection,
    reinforcementBars: reinforcementLayout.reinforcementBars,
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio:
      reinforcementMaterial.elasticModulus / concreteMaterial.elasticModulus,
    metadata: {
      longitudinalReinforcementGroups:
        reinforcementLayout.longitudinalReinforcementGroups,
    },
    units: sectionUnits,
  });
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -7,
      action: permanentAction("ACT-G1", "G1"),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -7,
      action: liveAction("ACT-LIVE"),
    },
  ];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_RARE", "SLE_FREQUENT", "SLE_QUASI_PERMANENT"],
    idPrefix: id,
  });
  const span = 5;

  return new SingleBeamDesignModel({
    id,
    title: "Trave in c.a. ambiente aggressivo",
    description: "Esempio mirato alla fessurazione indiretta SLE in ambiente aggressivo.",
    units: beamUnits,
    section,
    material: concreteMaterial,
    beamInput: {
      units: beamUnits,
      geometry: {
        start: { x: 0, y: 0 },
        end: { x: span, y: 0 },
      },
      sectionProvider: createReinforcedConcreteBeamSectionProvider({
        section,
        stiffnessState: "transformed",
      }),
      supports: {
        start: "hinge",
        end: "roller",
      },
      loads,
      combinations,
      discretization: {
        elementCount: 6,
        stations: [span / 2],
      },
      verificationStations: {
        mode: "combined",
        count: 7,
        userStations: [span / 2],
      },
    },
    metadata: {
      verificationScope: "rc-sle-aggressive-crack-control",
    },
    verification: {
      verifier: new ReinforcedConcreteBeamVerification({
        serviceability: {
          environment: "aggressive",
          deflection: {
            creepCoefficient: 2,
            includeShrinkage: false,
          },
        },
        mesh: {
          targetFiberCount: 80,
        },
      }),
      input: {
        beamId: id,
        section,
        concreteMaterial,
        reinforcementMaterial,
        shear: {
          mode: "with-transverse-reinforcement",
          effectiveDepth: 450,
          longitudinalReinforcementGroupId: "bottom-main",
          transverseReinforcement: {
            type: "stirrups",
            diameter: 8,
            legs: 2,
            spacing: 150,
            material: reinforcementMaterial,
          },
          cotThetaMin: 1,
          cotThetaMax: 2.5,
        },
      },
    },
  });
}

function createTimberConcreteCompositeReferenceModel() {
  const timber = createNTC2018TimberMaterial({
    strengthClass: "C24",
    kmod: 0.8,
    units: compositeUnits,
  });
  const concrete = createNTC2018ConcreteMaterial({
    strengthClass: "LC25/28",
    units: compositeUnits,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units: compositeUnits,
  });
  const reinforcement = new ReinforcementBar({
    diameter: 6,
    grade: "B450C",
    material: reinforcementMaterial,
    units: compositeUnits,
  });
  const connector = createTecnariaConnector({
    type: "MAXI",
    boardThickness: 0,
    units: compositeUnits,
  });

  return new TimberConcreteCompositeBeamModel({
    id: "timber-concrete-report-workflow",
    span: 4250,
    slabSection: new RectangularSection({ width: 1800, height: 60, units: compositeUnits }),
    timberSection: new RectangularSection({ width: 220, height: 250, units: compositeUnits }),
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
    units: compositeUnits,
  });
}

export function createTimberConcreteCompositeReportModel() {
  const id = "timber-concrete-report";
  const workflowModel = createTimberConcreteCompositeReferenceModel();
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -5,
      action: permanentAction("ACT-G1", "G1"),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -4,
      action: liveAction("ACT-LIVE"),
    },
  ];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_RARE"],
    idPrefix: id,
  });

  return new SingleBeamDesignModel({
    id,
    title: "Trave composta legno-calcestruzzo",
    description: "Trave collaborante con soletta in calcestruzzo e connettori.",
    units: compositeUnits,
    section: workflowModel.createIdealCompositeSection(),
    material: workflowModel.timberMaterial,
    beamInput: {
      units: compositeUnits,
      geometry: {
        start: { x: 0, y: 0 },
        end: { x: workflowModel.span, y: 0 },
      },
      analysisModel: "euler-bernoulli",
      sectionProvider: new TimberConcreteCompositeBeamSectionProvider({
        model: workflowModel,
      }),
      supports: {
        start: "hinge",
        end: "roller",
      },
      loads,
      combinations,
      discretization: {
        elementCount: 8,
        stations: [workflowModel.span / 2],
      },
    },
    verification: {
      verifier: new TimberConcreteCompositeBeamVerification(),
      input: {
        model: workflowModel,
      },
    },
  });
}

function createTimberXlamReferenceModel() {
  const xlamMaterial = new TimberMaterial({
    name: "XLAM top panel",
    strengthClass: "custom-xlam",
    elasticModulus: 11600,
    fmK: 24,
    fvK: 2.7,
    units: compositeUnits,
  });
  const timberMaterial = new TimberMaterial({
    name: "Glulam beam",
    strengthClass: "custom-glulam",
    elasticModulus: 12600,
    fmK: 28,
    fvK: 3.2,
    units: compositeUnits,
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
    units: compositeUnits,
  });

  return new TimberXlamCompositeBeamModel({
    id: "timber-xlam-report-workflow",
    span: 9200,
    xlamSection: new XlamPanelSection({
      effectiveWidth: 600,
      layerThicknesses: [0, 0, 30, 30, 30],
      activeLayerIndexes: [1, 3],
      units: compositeUnits,
    }),
    timberSection: new RectangularSection({
      width: 240,
      height: 440,
      units: compositeUnits,
    }),
    xlamMaterial,
    timberMaterial,
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
    units: compositeUnits,
  });
}

export function createTimberXlamCompositeReportModel() {
  const id = "timber-xlam-report";
  const workflowModel = createTimberXlamReferenceModel();
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -5.044,
      action: permanentAction("ACT-G1", "G1"),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -6.24,
      action: liveAction("ACT-LIVE"),
    },
  ];
  const combinations = [
    ...createNTC2018BeamCombinations({
      loads,
      types: ["ULS", "SLE_RARE"],
      idPrefix: id,
    }),
    {
      id: `${id}-SLE_FINAL-LIVE`,
      name: "SLE final LIVE",
      limitState: "SLE",
      combinationType: "SLE_FINAL",
      serviceCombination: "final",
      factors: {
        G1: 1,
        LIVE: 1,
      },
    },
  ];

  return new SingleBeamDesignModel({
    id,
    title: "Trave composta legno-XLAM",
    description: "Trave lignea collaborante con pannello XLAM e connessioni legno-legno.",
    units: compositeUnits,
    section: workflowModel.timberSection,
    material: workflowModel.timberMaterial,
    beamInput: {
      units: compositeUnits,
      geometry: {
        start: { x: 0, y: 0 },
        end: { x: workflowModel.span, y: 0 },
      },
      analysisModel: "timoshenko",
      sectionProvider: new TimberXlamCompositeBeamSectionProvider({
        model: workflowModel,
      }),
      supports: {
        start: "hinge",
        end: "roller",
      },
      loads,
      combinations,
      discretization: {
        elementCount: 10,
        stations: [workflowModel.span / 2],
      },
    },
    verification: {
      verifier: new TimberXlamCompositeBeamVerification(),
      input: {
        model: workflowModel,
      },
    },
  });
}

export function createXlamStripBeamReportModel() {
  const id = "xlam-strip-report";
  const span = 4.5;
  const section = new XlamPanelSection({
    effectiveWidth: 1000,
    layerThicknesses: [30, 20, 30, 20, 30],
    activeLayerIndexes: [0, 2, 4],
    units: sectionUnits,
  });
  const material = new XlamMaterial({
    name: "XLAM strip material",
    strengthClass: "custom-xlam",
    elasticModulus: 11000,
    e0Mean: 11000,
    e90Mean: 370,
    g0Mean: 690,
    g90Mean: 70,
    fmK: 24,
    fvK: 2.7,
    rollingShearStrength: 1.2,
    kdef: 0.8,
    units: sectionUnits,
  });
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -1.8,
      action: permanentAction("ACT-G1", "G1"),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -1.2,
      action: liveAction("ACT-LIVE"),
    },
  ];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_RARE", "SLE_QUASI_PERMANENT"],
    idPrefix: id,
  });

  return new SingleBeamDesignModel({
    id,
    title: "Striscia XLAM come trave",
    description: "Pannello XLAM modellato come striscia monodimensionale Timoshenko.",
    units: beamUnits,
    section,
    material,
    beamInput: {
      units: beamUnits,
      geometry: {
        start: { x: 0, y: 0 },
        end: { x: span, y: 0 },
      },
      analysisModel: "timoshenko",
      sectionProvider: new XlamBeamSectionProvider({
        section,
        material,
        kdef: 0.8,
      }),
      supports: {
        start: "hinge",
        end: "roller",
      },
      loads,
      combinations,
      discretization: {
        elementCount: 8,
        stations: [span / 2],
      },
      verificationStations: {
        mode: "combined",
        count: 9,
        userStations: [span / 2],
      },
    },
    verification: {
      verifier: new XlamBeamVerification({
        kmod: 0.8,
        gammaM: 1.45,
        deflectionLimitDenominator: 300,
      }),
      input: {
        beamId: id,
        section,
        material,
      },
    },
  });
}

export function createBeamReportExampleModels() {
  return [
    createTimberC24BeamReportModel(),
    createGlulamGL24hBeamReportModel(),
    createTimberCantileverPointLoadReportModel(),
    createSteelIpeBeamReportModel(),
    createSteelCantileverReportModel(),
    createSteelUpnUserMcrReportModel(),
    createSteelCompressionInteractionReportModel(),
    createRcElasticBeamReportModel(),
    createRcAggressiveCrackReportModel(),
    createTimberConcreteCompositeReportModel(),
    createTimberXlamCompositeReportModel(),
    createXlamStripBeamReportModel(),
  ];
}
