import { LinearStaticSolver2D } from "../fem/LinearStaticSolver2D.js";
import {
  SingleBeamModel,
  createBeamAnalysisContext,
  groupLoadsByCase,
  loadsForCombination,
  normalizeCombinations,
} from "./SingleBeamInput.js";
import { createEnvelopes } from "./SingleBeamEnvelopes.js";
import { SingleBeamFemBuilder } from "./SingleBeamFemBuilder.js";
import {
  sampleBeamResult,
  sectionRotationWarnings,
} from "./SingleBeamResults.js";

export {
  BEAM_SUPPORT_PRESETS,
  resolveBeamSupportPreset,
} from "./SingleBeamInput.js";
export { SingleBeamFemBuilder } from "./SingleBeamFemBuilder.js";
export { SingleBeamModel };

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });
export class SingleBeamAnalysis {
  constructor({
    femBuilder = new SingleBeamFemBuilder(),
    linearSolver = null,
  } = {}) {
    this.femBuilder = femBuilder;
    this.linearSolver = linearSolver;
  }

  analyze(input = {}) {
    const model = input instanceof SingleBeamModel ? input : new SingleBeamModel(input);
    const loadCaseGroups = groupLoadsByCase(model.loads);
    const loadCases = {};

    for (const [loadCaseId, loads] of loadCaseGroups.entries()) {
      loadCases[loadCaseId] = this.solve(model, loads, {
        loadCaseId,
        resultType: "load-case",
      });
    }

    const combinations = {};
    const combinationDefinitions = normalizeCombinations(
      model.combinations,
      [...loadCaseGroups.keys()],
    );

    for (const combination of combinationDefinitions) {
      combinations[combination.id] = {
        ...this.solve(
          model,
          loadsForCombination(model.loads, combination.factors),
          {
            combinationId: combination.id,
            resultType: "combination",
            factors: combination.factors,
            ...combination.metadata,
          },
        ),
        factors: { ...combination.factors },
        name: combination.name,
      };
    }

    return {
      id: model.id,
      units: model.units,
      analysisModel: model.analysisModel,
      loadCases,
      combinations,
      envelopes: createEnvelopes(loadCases, combinations),
      warnings: sectionRotationWarnings(model.sectionRotation),
      metadata: {
        ...model.metadata,
        generatedBy: "SingleBeamAnalysis",
      },
    };
  }

  solve(model, loads, context) {
    const analysisContext = createBeamAnalysisContext(model, loads, context);
    const femModel = this.femBuilder.build(model, {
      loads,
      context: analysisContext,
    });
    const solver = new LinearStaticSolver2D({
      linearSolver: this.linearSolver ?? undefined,
    });
    const solution = solver.solve(femModel);

    return {
      id: context.loadCaseId ?? context.combinationId ?? model.id,
      resultType: context.resultType,
      loads: loads.map((load) => ({
        id: load.id,
        actionType: load.actionType,
        loadCaseId: load.loadCaseId,
        loadDurationClass: load.loadDurationClass ?? null,
        factor: load.factor ?? 1,
      })),
      context: {
        resultType: analysisContext.resultType,
        limitState: analysisContext.limitState ?? null,
        combinationType: analysisContext.combinationType ?? null,
        serviceCombination: analysisContext.serviceCombination ?? null,
        leadingLoadCaseId: analysisContext.leadingLoadCaseId ?? null,
        leadingActionId: analysisContext.leadingActionId ?? null,
        leadingVariableCategory: analysisContext.leadingVariableCategory ?? null,
        accompanyingLoadCaseIds: [
          ...(analysisContext.accompanyingLoadCaseIds ?? []),
        ],
        loadCaseFactors: { ...analysisContext.loadCaseFactors },
        activeLoads: analysisContext.activeLoads.map((load) => ({ ...load })),
        governingLoadDurationClass:
          analysisContext.governingLoadDurationClass,
        governingLoad: analysisContext.governingLoad
          ? { ...analysisContext.governingLoad }
          : null,
        sectionRotation: { ...model.sectionRotation },
      },
      ...sampleBeamResult({
        model,
        femModel,
        solution,
        sectionProperties: femModel.sectionProperties,
        femUnits: FEM_UNITS,
      }),
    };
  }
}
