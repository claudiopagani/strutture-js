import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import {
  validateFemCapabilitiesContract,
  validateFemEntityMappingContract,
  validateGlobalFemAnalysisContract,
  validateGlobalFemModelContract,
  validateGlobalFemResultContract,
} from "../../domain/fem/index.js";
import { extractGlobalFemDemands } from "./GlobalFemDemandExtractor.js";
import { classifyGlobalFemStructuralEntities } from "./GlobalFemStructuralClassifier.js";
import { evaluateGlobalFemVerificationReadiness } from "./GlobalFemVerificationReadiness.js";
import {
  GLOBAL_FEM_CLASSIFICATION_PROPOSAL_VERSION,
  GLOBAL_FEM_POSTPROCESSING_PROFILES,
  GLOBAL_FEM_POSTPROCESSING_PROFILE_VALUES,
} from "./classificationPolicy.js";

function demandOnlyClassification(model) {
  return {
    schema: "strutture-js/fem-structural-classification-proposal",
    version: GLOBAL_FEM_CLASSIFICATION_PROPOSAL_VERSION,
    modelId: model.id,
    modelHash: model.hash,
    policy: null,
    members: [],
    surfaces: [],
    storeys: [],
    diaphragms: [],
    joints: [],
    diagnostics: [],
    warnings: [],
    summary: { confirmed: 0, proposed: 0, ambiguous: 0 },
    metadata: { skippedForDemandOnlyProfile: true },
  };
}

function confirmedOnlyClassification(proposal) {
  const collections = ["members", "surfaces", "storeys", "diaphragms", "joints"];
  const confirmed = Object.fromEntries(collections.map((name) => [
    name,
    proposal[name].filter((item) => item.classification.status === "confirmed"),
  ]));
  return {
    ...proposal,
    ...confirmed,
    warnings: [],
    summary: {
      confirmed: Object.values(confirmed).flat().length,
      proposed: 0,
      ambiguous: 0,
    },
    metadata: { confirmedEntitiesOnly: true },
  };
}

function validationSummary(validation) {
  if (!validation) return null;
  return {
    ok: validation.ok,
    errors: validation.errors.map((item) => ({ ...item })),
    warnings: validation.warnings.map((item) => ({ ...item })),
  };
}

function validateContracts(input) {
  const capabilities = validateFemCapabilitiesContract(input.capabilities);
  const model = validateGlobalFemModelContract(input.model);
  const analysis = validateGlobalFemAnalysisContract(input.analysis, {
    model: model.ok ? model.value : null,
    capabilities: capabilities.ok ? capabilities.value : null,
  });
  const mapping = input.mapping == null ? null : validateFemEntityMappingContract(input.mapping, {
    model: model.ok ? model.value : null,
  });
  const result = validateGlobalFemResultContract(input.result, {
    model: model.ok ? model.value : null,
    analysis: analysis.ok ? analysis.value : null,
    capabilities: capabilities.ok ? capabilities.value : null,
    mapping: mapping?.ok ? mapping.value : null,
  });
  return { capabilities, model, analysis, mapping, result };
}

function coreContractsAreValid(validations) {
  return ["capabilities", "model", "analysis", "result"]
    .every((name) => validations[name].ok);
}

function collectWarnings(validations, classification = null, technicalResult = null) {
  return [
    ...Object.values(validations)
      .filter(Boolean)
      .flatMap((validation) => validation.warnings.map((item) => ({ ...item }))),
    ...(classification?.warnings ?? []).map((item) => ({ ...item })),
    ...(technicalResult?.status === "partial" ? [{
      code: "FEM_ANALYSIS_PARTIAL",
      path: "$.result.status",
      message:
        "The FEM result is partial; only assessments whose declared capabilities and data are present can be ready.",
    }] : []),
  ];
}

export class GlobalFemPostProcessingApplication extends StructuralApplication {
  constructor() {
    super({
      id: "global-fem-postprocessing",
      name: "Global FEM Postprocessing",
      description:
        "Solver-neutral validation, assisted structural classification and demand extraction from global FEM contracts.",
      domain: "fem",
      supportedCodes: ["method-neutral"],
      tags: ["fem", "postprocessing", "classification", "demand-extraction", "readiness"],
      metadata: {
        maturity: "partial",
        limitations: [
          "assisted classifications are proposals and never authorize final normative verification",
          "reinforcement, ductility, use and seismic project data are never inferred",
          "global orchestration of reinforced-concrete normative checks is not implemented",
        ],
      },
    });
  }

  run(input = {}) {
    const profile = input.profile ?? GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED;
    if (!GLOBAL_FEM_POSTPROCESSING_PROFILE_VALUES.includes(profile)) {
      throw new Error(`Unsupported global FEM postprocessing profile: ${profile}.`);
    }
    const validations = validateContracts(input);
    const serializedValidations = Object.fromEntries(
      Object.entries(validations).map(([name, validation]) => [
        name,
        validationSummary(validation),
      ]),
    );

    if (!coreContractsAreValid(validations)) {
      const errors = Object.values(validations)
        .filter(Boolean)
        .flatMap((validation) => validation.errors.map((item) => ({ ...item })));
      return new CalculationResult({
        applicationId: this.id,
        status: RESULT_STATUS.NOT_ANALYZED,
        summary: "Global FEM postprocessing was not run because one or more core contracts are invalid.",
        outputs: { profile, validations: serializedValidations },
        warnings: [...collectWarnings(validations), ...errors],
        assumptions: [],
        metadata: { domain: this.domain, normativeVerificationPerformed: false },
      });
    }

    const capabilities = validations.capabilities.value;
    const model = validations.model.value;
    const analysis = validations.analysis.value;
    const result = validations.result.value;
    const mapping = validations.mapping?.value ?? null;
    const classificationProposal = profile === GLOBAL_FEM_POSTPROCESSING_PROFILES.DEMAND_ONLY
      ? demandOnlyClassification(model)
      : classifyGlobalFemStructuralEntities({
        model,
        mapping,
        policy: input.classificationPolicy,
      });
    const classification = profile === GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED
      ? confirmedOnlyClassification(classificationProposal)
      : classificationProposal;
    const demands = extractGlobalFemDemands({ model, analysis, result, classification });
    const readiness = evaluateGlobalFemVerificationReadiness({
      profile,
      validations,
      mappingValidation: validations.mapping,
      classification,
      capabilities,
      model,
      analysis,
      result,
      projectContext: input.projectContext,
      designData: input.designData,
      requestedAssessments: input.requestedAssessments,
    });
    const ready = readiness.readyForRequestedProcessing;

    return new CalculationResult({
      applicationId: this.id,
      status: ready ? RESULT_STATUS.OK : RESULT_STATUS.NOT_ANALYZED,
      summary: ready
        ? "Global FEM contracts were postprocessed; no normative verification was performed."
        : "Global FEM contracts were read, but requested processing is incomplete.",
      outputs: {
        profile,
        validations: serializedValidations,
        classification,
        demands,
        readiness,
      },
      warnings: collectWarnings(validations, classification, result),
      assumptions: [
        "Geometric classifications are non-normative proposals until confirmed by an explicit mapping.",
        "Element actions and shell resultants retain the solver-neutral contract sign conventions and local axes.",
      ],
      metadata: {
        domain: this.domain,
        normativeVerificationPerformed: false,
        classificationProposalVersion: classification.version,
        demandSetVersion: demands.version,
        readinessReportVersion: readiness.version,
      },
    });
  }
}
