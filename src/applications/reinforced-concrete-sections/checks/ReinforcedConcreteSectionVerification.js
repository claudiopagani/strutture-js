import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import { runMomentCurvatureWorkflow } from "../workflows/momentCurvatureWorkflow.js";
import { runServiceStressWorkflow } from "../workflows/serviceStressWorkflow.js";
import { runUlsBiaxialDomainWorkflow } from "../workflows/ulsBiaxialDomainWorkflow.js";
import { runUlsUniaxialDomainWorkflow } from "../workflows/ulsUniaxialDomainWorkflow.js";
import { runUlsUniaxialResistanceWorkflow } from "../workflows/ulsUniaxialResistanceWorkflow.js";

const SECTION_WORKFLOWS = new Map([
  ["service-stress", runServiceStressWorkflow],
  ["uls-biaxial-domain", runUlsBiaxialDomainWorkflow],
  ["moment-curvature", runMomentCurvatureWorkflow],
  ["uls-uniaxial-domain", runUlsUniaxialDomainWorkflow],
  ["uls-uniaxial-resistance", runUlsUniaxialResistanceWorkflow],
]);

function missingSectionResult(input, { code, metadata }) {
  const { sectionId = null, loadCase = null } = input;

  return new VerificationResult({
    applicationId: "reinforced-concrete-sections",
    status: RESULT_STATUS.NOT_ANALYZED,
    summary: "RC section verification requires a section.",
    warnings: [
      "RC section verification was not run because the section input is missing.",
    ],
    metadata: {
      code,
      sectionId,
      loadCase,
      ...metadata,
    },
  });
}

function unsupportedAnalysisTypeResult(model, { code, metadata }) {
  return new VerificationResult({
    applicationId: "reinforced-concrete-sections",
    status: RESULT_STATUS.NOT_IMPLEMENTED,
    summary: `RC section analysis type ${model.analysisType} is not implemented yet.`,
    warnings: [
      "Only uls-uniaxial-resistance, uls-uniaxial-domain, uls-biaxial-domain, service-stress and moment-curvature are wired to the fiber solvers.",
    ],
    metadata: {
      code,
      sectionId: model.id,
      analysisType: model.analysisType,
      ...metadata,
    },
  });
}

export class ReinforcedConcreteSectionVerification {
  constructor({ code = "NTC2018", metadata = {} } = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  verify(modelOrOptions = {}) {
    if (!modelOrOptions?.section) {
      return missingSectionResult(modelOrOptions, {
        code: this.code,
        metadata: this.metadata,
      });
    }

    const model = modelOrOptions;
    const analysisType = model.analysisType ?? "uls-uniaxial-resistance";
    const workflow = SECTION_WORKFLOWS.get(analysisType);

    if (!workflow) {
      return unsupportedAnalysisTypeResult(
        {
          ...model,
          analysisType,
        },
        {
          code: this.code,
          metadata: this.metadata,
        },
      );
    }

    return workflow(
      {
        ...model,
        analysisType,
      },
      {
        code: this.code,
        metadata: this.metadata,
      },
    );
  }
}
