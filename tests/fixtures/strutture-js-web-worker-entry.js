import {
  ReinforcedConcreteSection,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcementBar,
  RectangularSection,
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
  const model = createWorkerSmokeModel();
  const result = new ReinforcedConcreteSectionApplication().run({ model });

  return {
    applicationId: result.applicationId,
    status: result.status,
    analysisType: result.outputs.analysisType,
    fiberCount: result.outputs.fiberCount,
    warningCount: result.warnings.length,
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
