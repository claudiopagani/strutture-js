import { ReinforcedConcreteSectionModel } from "../../reinforced-concrete-sections/models/ReinforcedConcreteSectionModel.js";
import { ReinforcedConcreteSectionVerification } from "../../reinforced-concrete-sections/checks/ReinforcedConcreteSectionVerification.js";
import { createPlateStripSection } from "../sections/createPlateStripSection.js";
import { enrichPlateCheck } from "./plateCheckUtils.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });
const METHOD = "wood-armer-equivalent-strip-rc-uls-uniaxial-fiber-solver";

function plateStripMesh(model) {
  return {
    targetFiberCount: model.analysis.mesh?.targetFiberCount ?? 40,
    ...model.analysis.mesh,
    method: "uniaxial-strips",
  };
}

export function verifyPlateBending({ model, transformedState } = {}) {
  const results = [];

  for (const woodArmerMoment of transformedState.woodArmer.moments) {
    const { direction, face, value } = woodArmerMoment;
    const strip = createPlateStripSection({ model, direction });
    const mEd = value * model.geometry.unitWidth;
    const sectionModel = new ReinforcedConcreteSectionModel({
      id: `${model.id}-${transformedState.id}-${face}-${direction}-uls`,
      section: strip.section,
      materials: model.materials,
      analysisType: "uls-uniaxial-resistance",
      analysisSettings: {
        compressedEdge: face === "bottom" ? "top" : "bottom",
      },
      mesh: plateStripMesh(model),
      solver: model.analysis.solver,
      actions: { nEd: 0, mEd },
      units: INTERNAL_UNITS,
    });
    const sectionResult = new ReinforcedConcreteSectionVerification().verify(sectionModel);
    const baseCheck = sectionResult.checks[0] ?? {
      id: "uls-uniaxial-bending",
      description: "Uniaxial plate-strip bending resistance at NEd = 0",
      demand: Math.abs(mEd),
      capacity: sectionResult.capacity,
      utilizationRatio: sectionResult.utilizationRatio,
      ok: sectionResult.status === "ok",
    };
    const check = enrichPlateCheck(baseCheck, {
      id: `rc-plate-uls-bending-${transformedState.id}-${face}-${direction}`,
      direction,
      face,
      analysisType: model.analysis.type,
      combinationType: transformedState.combinationType,
      stateId: transformedState.id,
      method: METHOD,
    });

    results.push({
      id: woodArmerMoment.id,
      stateId: transformedState.id,
      direction,
      face,
      analysisType: model.analysis.type,
      combinationType: transformedState.combinationType,
      method: METHOD,
      mEd,
      mRd: sectionResult.outputs.MxRd,
      demand: check.demand,
      capacity: check.capacity,
      utilizationRatio: check.utilizationRatio,
      governingReinforcement: `${face}-${direction}`,
      neutralAxisDepth: sectionResult.outputs.neutralAxisDepth,
      failureMode: sectionResult.outputs.failureMode,
      concreteStripCount: sectionResult.outputs.fiberCount,
      concreteDiscretization: "uniaxial-strips",
      ultimateStrains: sectionResult.outputs.extremes,
      strainField: sectionResult.outputs.strainField,
      status: sectionResult.status,
      check,
      warnings: sectionResult.warnings,
      assumptions: sectionResult.assumptions,
    });
  }

  return results;
}
