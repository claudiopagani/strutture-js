import {
  ReinforcedConcreteSection,
  GlobalFemPostProcessingApplication,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcedConcretePlateApplication,
  ReinforcedConcretePlateModel,
  ReinforcementBar,
  RectangularSection,
  createFemCapabilitiesContract,
  classifyGlobalFemStructuralEntities,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "strutture-js";

const units = { force: "N", length: "mm" };

function createWorkerSmokeModel() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "Worker smoke RC section",
    concreteSection: new RectangularSection({
      width: 300,
      height: 500,
      units,
    }),
    reinforcementBars: [
      new ReinforcementBar({
        id: "bottom-left",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "bottom-right",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 240,
        units,
      }),
      new ReinforcementBar({
        id: "top-left",
        diameter: 14,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "top-right",
        diameter: 14,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 240,
        units,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  return new ReinforcedConcreteSectionModel({
    id: "worker-smoke-rc-service-stress",
    section,
    analysisType: "service-stress",
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    mesh: {
      targetFiberCount: 80,
    },
    solver: {
      tolerance: 1e-3,
      maxIterations: 40,
    },
    actions: {
      nEd: 0,
      mxEd: 80_000_000,
      myEd: 0,
    },
    analysisSettings: {
      modularRatio: 15,
    },
    units,
  });
}

export function runWorkerSmoke() {
  const femCapabilities = createFemCapabilitiesContract({
    id: "worker-global-fem-smoke",
    solver: { id: "worker-smoke", name: "Worker smoke", version: "0" },
    analyses: {
      linearStatic: true,
      secondOrder: false,
      modal: false,
      responseSpectrum: false,
      nonlinearStatic: false,
      timeHistory: false,
    },
    elements: { line: true, shell: false, solid: false, link: false },
    results: {
      nodalDisplacements: true,
      reactions: true,
      lineElementActions: true,
      shellResultants: false,
      stresses: false,
      strains: false,
      modes: false,
      sectionCuts: false,
      storeyResults: false,
      equilibriumResiduals: true,
    },
    metadata: { environment: "web-worker" },
  });
  const model = createWorkerSmokeModel();
  const result = new ReinforcedConcreteSectionApplication().run({ model });
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const plateResult = new ReinforcedConcretePlateApplication().run({
    model: new ReinforcedConcretePlateModel({
      id: "worker-smoke-rc-plate",
      units,
      materials: { concreteMaterial, reinforcementMaterial },
      geometry: { thickness: 200 },
      reinforcement: {
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
        type: "SLS_SIMPLIFIED_DEFLECTION",
        combinationType: "SLE_QUASI_PERMANENT",
        actions: {},
        deflection: { spanX: 3000, spanY: 2800 },
      },
    }),
  });
  const femClassification = classifyGlobalFemStructuralEntities({
    model: {
      id: "worker-classification-model",
      hash: "sha256:worker-classification-model",
      units: { length: "m" },
      globalCoordinateSystem: {
        origin: { x: 0, y: 0, z: 0 },
        gravityDirection: { x: 0, y: 0, z: -1 },
      },
      nodes: [
        { id: "N1", coordinates: { x: 0, y: 0, z: 0 } },
        { id: "N2", coordinates: { x: 0, y: 0, z: 3 } },
      ],
      lineElements: [{
        id: "E1",
        nodeIds: ["N1", "N2"],
        sectionId: "S1",
        materialId: "M1",
      }],
      shellElements: [],
      constraints: [],
      diaphragms: [],
      storeys: [],
    },
  });
  const femPostprocessorManifest = new GlobalFemPostProcessingApplication().getManifest();

  return {
    applicationId: result.applicationId,
    status: result.status,
    analysisType: result.outputs.analysisType,
    fiberCount: result.outputs.fiberCount,
    warningCount: result.warnings.length,
    plateApplicationId: plateResult.applicationId,
    plateStatus: plateResult.status,
    plateCheckCount: plateResult.checks.length,
    globalFemCapabilitySchema: femCapabilities.schema,
    globalFemCapabilityVersion: femCapabilities.version,
    globalFemClassificationRole: femClassification.members[0].classification.role,
    globalFemPostprocessorId: femPostprocessorManifest.id,
  };
}

function handleMessage(event) {
  if (event.data?.type !== "run-smoke") {
    return;
  }

  try {
    self.postMessage({
      type: "smoke-result",
      ok: true,
      result: runWorkerSmoke(),
    });
  } catch (error) {
    self.postMessage({
      type: "smoke-result",
      ok: false,
      error: error?.message ?? String(error),
    });
  }
}

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  self.addEventListener("message", handleMessage);
}
