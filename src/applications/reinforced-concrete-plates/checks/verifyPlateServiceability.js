import { ReinforcedConcreteServiceabilityVerification } from "../../reinforced-concrete-sections/checks/ReinforcedConcreteServiceabilityVerification.js";
import { createPlateStripSection } from "../sections/createPlateStripSection.js";
import { enrichPlateCheck } from "./plateCheckUtils.js";

const METHOD = "wood-armer-equivalent-strip-ntc2018-sle-serviceability";

function plateStripMesh(model) {
  return {
    targetFiberCount: model.analysis.mesh?.targetFiberCount ?? 40,
    ...model.analysis.mesh,
    method: "uniaxial-strips",
  };
}

export function verifyPlateServiceability({ model, transformedState } = {}) {
  const results = [];

  for (const woodArmerMoment of transformedState.woodArmer.moments) {
    const { direction, face, value } = woodArmerMoment;
    const strip = createPlateStripSection({ model, direction });
    const mEd = value * model.geometry.unitWidth;
    const mesh = plateStripMesh(model);
    const serviceResult = new ReinforcedConcreteServiceabilityVerification({
      serviceability: model.analysis.serviceability,
      mesh,
      solver: model.analysis.solver,
    }).verify({
      section: strip.section,
      concreteMaterial: model.materials.concreteMaterial,
      reinforcementMaterial: model.materials.reinforcementMaterial,
      actions: { nEd: 0, mEd },
      combinationType: transformedState.combinationType,
      serviceability: model.analysis.serviceability,
      mesh,
      solver: model.analysis.solver,
    });
    const checks = serviceResult.checks.map((check, index) => enrichPlateCheck(check, {
      id: `rc-plate-sle-${transformedState.id}-${face}-${direction}-${check.id}-${index + 1}`,
      direction,
      face,
      analysisType: model.analysis.type,
      combinationType: transformedState.combinationType,
      stateId: transformedState.id,
      method: METHOD,
    }));
    results.push({
      id: woodArmerMoment.id,
      stateId: transformedState.id,
      direction,
      face,
      analysisType: model.analysis.type,
      combinationType: transformedState.combinationType,
      method: METHOD,
      terminology: "Tensione nella striscia equivalente Wood-Armer",
      mEd,
      status: serviceResult.status,
      utilizationRatio: serviceResult.utilizationRatio,
      concreteCompression: serviceResult.outputs.concreteCompression,
      steelStress: serviceResult.outputs.steelStress,
      crackWidthClass: serviceResult.outputs.crackWidthClass,
      crackControlGroupId: serviceResult.outputs.crackControlGroupId,
      tensileBars: serviceResult.outputs.tensileBars,
      strainField: serviceResult.outputs.strainField,
      concreteStripCount: serviceResult.outputs.fiberCount,
      concreteDiscretization: "uniaxial-strips",
      checks,
      serviceStressChecks: checks.filter((check) => !check.id.includes("rc-sle-crack")),
      crackingChecks: checks.filter((check) => check.id.includes("rc-sle-crack")),
      warnings: serviceResult.warnings,
      assumptions: serviceResult.assumptions,
    });
  }

  return results;
}
