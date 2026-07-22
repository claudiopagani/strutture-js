import {
  GLOBAL_FEM_POSTPROCESSING_PROFILES,
  GLOBAL_FEM_POSTPROCESSING_PROFILE_VALUES,
} from "./classificationPolicy.js";

export const GLOBAL_FEM_READINESS_REPORT_VERSION = 0;

export const GLOBAL_FEM_READINESS_ASSESSMENTS = Object.freeze({
  GENERIC_DEMANDS: "generic-demands",
  SEMANTIC_DEMANDS: "semantic-demands",
  GLOBAL_DISPLACEMENT_DATA: "global-displacement-data",
  MODAL_DATA: "modal-data",
  SECOND_ORDER_DATA: "second-order-data",
  RC_MEMBER_VERIFICATION: "rc-member-verification",
  RC_WALL_VERIFICATION: "rc-wall-verification",
  RC_JOINT_VERIFICATION: "rc-joint-verification",
  CAPACITY_DESIGN: "capacity-design",
  COMPLETE_NTC2018_BUILDING_VERIFICATION: "complete-ntc2018-building-verification",
});

export const GLOBAL_FEM_READINESS_ASSESSMENT_VALUES = Object.freeze(
  Object.values(GLOBAL_FEM_READINESS_ASSESSMENTS),
);

const IMPLEMENTED_ASSESSMENTS = new Set([
  GLOBAL_FEM_READINESS_ASSESSMENTS.GENERIC_DEMANDS,
  GLOBAL_FEM_READINESS_ASSESSMENTS.SEMANTIC_DEMANDS,
  GLOBAL_FEM_READINESS_ASSESSMENTS.GLOBAL_DISPLACEMENT_DATA,
  GLOBAL_FEM_READINESS_ASSESSMENTS.MODAL_DATA,
  GLOBAL_FEM_READINESS_ASSESSMENTS.SECOND_ORDER_DATA,
]);

const NORMATIVE_ASSESSMENTS = new Set([
  GLOBAL_FEM_READINESS_ASSESSMENTS.RC_MEMBER_VERIFICATION,
  GLOBAL_FEM_READINESS_ASSESSMENTS.RC_WALL_VERIFICATION,
  GLOBAL_FEM_READINESS_ASSESSMENTS.RC_JOINT_VERIFICATION,
  GLOBAL_FEM_READINESS_ASSESSMENTS.CAPACITY_DESIGN,
  GLOBAL_FEM_READINESS_ASSESSMENTS.COMPLETE_NTC2018_BUILDING_VERIFICATION,
]);

function missing(code, path, message) {
  return { code, path, message };
}

function isPresent(value) {
  return value !== null && value !== undefined && value !== "";
}

function collectionIds(value) {
  if (Array.isArray(value)) return new Set(value.map((item) => item?.id).filter(Boolean));
  if (value && typeof value === "object") return new Set(Object.keys(value));
  return new Set();
}

function requirePaths(target, definitions) {
  return definitions.flatMap(([path, value, message]) =>
    isPresent(value) ? [] : [missing("FEM_REQUIRED_INPUT_MISSING", path, message)]);
}

function contractMissing(validations, result) {
  if (!validations) {
    return [missing(
      "FEM_CONTRACT_VALIDATION_MISSING",
      "$",
      "Validated FEM capabilities, model, analysis and result are required.",
    )];
  }
  const invalid = ["capabilities", "model", "analysis", "result"].flatMap((name) =>
    validations[name]?.ok ? [] : [missing(
      "FEM_CONTRACT_INVALID",
      `$.${name}`,
      `${name} contains contract validation errors.`,
    )]);
  if (result && ["failed", "not-supported"].includes(result.status)) {
    invalid.push(missing(
      "FEM_ANALYSIS_NOT_COMPLETED",
      "$.result.status",
      `The FEM analysis status is ${result.status}; completed results are required.`,
    ));
  }
  return invalid;
}

function mappingState(profile, mappingValidation, classification) {
  if (profile === GLOBAL_FEM_POSTPROCESSING_PROFILES.DEMAND_ONLY) {
    return { confirmed: false, provisional: false, missing: [] };
  }
  if (mappingValidation?.ok) {
    return { confirmed: true, provisional: false, missing: [] };
  }
  const ambiguous = classification.summary.ambiguous;
  const unsafeMappingErrors = (mappingValidation?.errors ?? []).filter((item) =>
    item.code !== "FEM_MAPPING_INCOMPLETE");
  if (unsafeMappingErrors.length > 0) {
    return {
      confirmed: false,
      provisional: false,
      missing: unsafeMappingErrors.map((item) => missing(
        item.code,
        `$.mapping${item.path === "$" ? "" : item.path.slice(1)}`,
        item.message,
      )),
    };
  }
  if (profile === GLOBAL_FEM_POSTPROCESSING_PROFILES.ASSISTED && ambiguous === 0) {
    return {
      confirmed: false,
      provisional: true,
      missing: [missing(
        "FEM_MAPPING_CONFIRMATION_REQUIRED",
        "$.mapping",
        "Assisted classifications must be reviewed and converted to a complete FemEntityMappingContract.",
      )],
    };
  }
  return {
    confirmed: false,
    provisional: false,
    missing: [missing(
      ambiguous > 0 ? "FEM_CLASSIFICATION_AMBIGUOUS" : "FEM_MAPPING_REQUIRED",
      "$.mapping",
      ambiguous > 0
        ? "Ambiguous classifications must be resolved before role-dependent processing."
        : "A valid and complete FemEntityMappingContract is required.",
    )],
  };
}

function resultDataMissing(assessmentId, capabilities, model, analysis, result) {
  const results = result?.results ?? {};
  switch (assessmentId) {
    case GLOBAL_FEM_READINESS_ASSESSMENTS.GENERIC_DEMANDS: {
      const canReadLines = model.lineElements.length === 0 ||
        (capabilities.results.lineElementActions && (results.lineElementActions?.length ?? 0) > 0);
      const canReadShells = model.shellElements.length === 0 ||
        (capabilities.results.shellResultants && (results.shellResultants?.length ?? 0) > 0);
      return [
        ...(!canReadLines ? [missing(
          "FEM_LINE_ACTIONS_UNAVAILABLE",
          "$.result.results.lineElementActions",
          "Line elements exist but line-element actions are unavailable.",
        )] : []),
        ...(!canReadShells ? [missing(
          "FEM_SHELL_RESULTANTS_UNAVAILABLE",
          "$.result.results.shellResultants",
          "Shell elements exist but shell resultants are unavailable.",
        )] : []),
      ];
    }
    case GLOBAL_FEM_READINESS_ASSESSMENTS.SEMANTIC_DEMANDS:
      return resultDataMissing(
        GLOBAL_FEM_READINESS_ASSESSMENTS.GENERIC_DEMANDS,
        capabilities,
        model,
        analysis,
        result,
      );
    case GLOBAL_FEM_READINESS_ASSESSMENTS.GLOBAL_DISPLACEMENT_DATA:
      return capabilities.results.nodalDisplacements &&
        (results.nodalDisplacements?.length ?? 0) > 0
        ? []
        : [missing(
          "FEM_NODAL_DISPLACEMENTS_UNAVAILABLE",
          "$.result.results.nodalDisplacements",
          "Nodal displacements were not declared and supplied.",
        )];
    case GLOBAL_FEM_READINESS_ASSESSMENTS.MODAL_DATA:
      return capabilities.analyses.modal && capabilities.results.modes &&
        analysis.procedures.some((procedure) => procedure.type === "modal") &&
        (results.modes?.length ?? 0) > 0
        ? []
        : [missing(
          "FEM_MODAL_DATA_UNAVAILABLE",
          "$.result.results.modes",
          "A modal procedure, modal capability and modal results are required.",
        )];
    case GLOBAL_FEM_READINESS_ASSESSMENTS.SECOND_ORDER_DATA:
      return capabilities.analyses.secondOrder && analysis.procedures.some((procedure) =>
        procedure.type === "second-order-static" || procedure.secondOrder?.enabled === true)
        ? []
        : [missing(
          "FEM_SECOND_ORDER_DATA_UNAVAILABLE",
          "$.analysis.procedures",
          "Second-order capability and an enabled second-order procedure are required.",
        )];
    default:
      return [];
  }
}

function missingMemberDesignData(classification, designData) {
  const available = collectionIds(designData?.members);
  return classification.members
    .filter((member) => ["beam", "column"].includes(member.classification.role))
    .flatMap((member) => available.has(member.id) ? [] : [missing(
      "FEM_MEMBER_DESIGN_DATA_MISSING",
      `$.designData.members.${member.id}`,
      `Explicit section, materials and reinforcement data are required for member ${member.id}.`,
    )]);
}

function missingWallDesignData(classification, designData) {
  const available = collectionIds(designData?.walls);
  return classification.surfaces
    .filter((surface) => surface.classification.role === "wall")
    .flatMap((surface) => available.has(surface.id) ? [] : [missing(
      "FEM_WALL_DESIGN_DATA_MISSING",
      `$.designData.walls.${surface.id}`,
      `Explicit geometry, materials and reinforcement data are required for wall ${surface.id}.`,
    )]);
}

function missingSlabDesignData(classification, designData) {
  const available = collectionIds(designData?.slabs);
  return classification.surfaces
    .filter((surface) => surface.classification.role === "slab")
    .flatMap((surface) => available.has(surface.id) ? [] : [missing(
      "FEM_SLAB_DESIGN_DATA_MISSING",
      `$.designData.slabs.${surface.id}`,
      `Explicit geometry, materials and reinforcement data are required for slab ${surface.id}.`,
    )]);
}

function missingJointDesignData(classification, designData) {
  const available = collectionIds(designData?.joints);
  return classification.joints.flatMap((joint) => available.has(joint.id) ? [] : [missing(
    "FEM_JOINT_DESIGN_DATA_MISSING",
    `$.designData.joints.${joint.id}`,
    `Explicit geometry, reinforcement and confinement data are required for joint ${joint.id}.`,
  )]);
}

function projectContextMissing(projectContext, { seismic = false, dissipative = false } = {}) {
  const base = requirePaths(projectContext, [
    ["$.projectContext.intendedUse", projectContext?.intendedUse, "Intended use is required."],
    ["$.projectContext.nominalLife", projectContext?.nominalLife, "Nominal life is required."],
    ["$.projectContext.useClass", projectContext?.useClass, "Use class is required."],
  ]);
  if (seismic) {
    base.push(...requirePaths(projectContext, [[
      "$.projectContext.seismicParameters",
      projectContext?.seismicParameters,
      "Explicit seismic parameters are required.",
    ]]));
  }
  if (dissipative) {
    base.push(...requirePaths(projectContext, [
      [
        "$.projectContext.ductilityClass",
        projectContext?.ductilityClass,
        "The ductility class must be explicitly assigned.",
      ],
      [
        "$.projectContext.dissipativeBehavior",
        projectContext?.dissipativeBehavior,
        "Dissipative or non-dissipative behavior must be explicitly assigned.",
      ],
    ]));
  }
  return base;
}

function combinationMissing(analysis, requiredLimitStates) {
  const available = new Set(analysis.combinations.map((item) => item.limitState));
  return requiredLimitStates.flatMap((limitState) => available.has(limitState) ? [] : [missing(
    "FEM_REQUIRED_COMBINATION_MISSING",
    "$.analysis.combinations",
    `At least one ${limitState} combination is required.`,
  )]);
}

function assessmentMissing({
  assessmentId,
  baseMissing,
  mapping,
  classification,
  capabilities,
  model,
  analysis,
  result,
  projectContext,
  designData,
}) {
  const items = [...baseMissing];
  if (assessmentId === GLOBAL_FEM_READINESS_ASSESSMENTS.SEMANTIC_DEMANDS) {
    items.push(...mapping.missing);
  }
  items.push(...resultDataMissing(assessmentId, capabilities, model, analysis, result));

  if (assessmentId === GLOBAL_FEM_READINESS_ASSESSMENTS.RC_MEMBER_VERIFICATION) {
    items.push(...resultDataMissing(
      GLOBAL_FEM_READINESS_ASSESSMENTS.GENERIC_DEMANDS,
      capabilities,
      model,
      analysis,
      result,
    ));
    items.push(...mapping.missing);
    items.push(...missingMemberDesignData(classification, designData));
    items.push(...projectContextMissing(projectContext));
    items.push(...combinationMissing(analysis, ["ultimate", "serviceability"]));
  }
  if (assessmentId === GLOBAL_FEM_READINESS_ASSESSMENTS.RC_WALL_VERIFICATION) {
    items.push(...resultDataMissing(
      GLOBAL_FEM_READINESS_ASSESSMENTS.GENERIC_DEMANDS,
      capabilities,
      model,
      analysis,
      result,
    ));
    items.push(...mapping.missing);
    items.push(...missingWallDesignData(classification, designData));
    items.push(...projectContextMissing(projectContext, { seismic: true }));
    items.push(...combinationMissing(analysis, ["ultimate", "serviceability", "seismic"]));
  }
  if (assessmentId === GLOBAL_FEM_READINESS_ASSESSMENTS.RC_JOINT_VERIFICATION) {
    items.push(...resultDataMissing(
      GLOBAL_FEM_READINESS_ASSESSMENTS.GENERIC_DEMANDS,
      capabilities,
      model,
      analysis,
      result,
    ));
    items.push(...mapping.missing);
    items.push(...missingJointDesignData(classification, designData));
    items.push(...projectContextMissing(projectContext, { seismic: true, dissipative: true }));
    items.push(...combinationMissing(analysis, ["ultimate", "seismic"]));
  }
  if (assessmentId === GLOBAL_FEM_READINESS_ASSESSMENTS.CAPACITY_DESIGN) {
    items.push(...resultDataMissing(
      GLOBAL_FEM_READINESS_ASSESSMENTS.GENERIC_DEMANDS,
      capabilities,
      model,
      analysis,
      result,
    ));
    items.push(...mapping.missing);
    items.push(...missingMemberDesignData(classification, designData));
    items.push(...missingWallDesignData(classification, designData));
    items.push(...projectContextMissing(projectContext, { seismic: true, dissipative: true }));
    items.push(...combinationMissing(analysis, ["seismic"]));
  }
  if (assessmentId ===
      GLOBAL_FEM_READINESS_ASSESSMENTS.COMPLETE_NTC2018_BUILDING_VERIFICATION) {
    items.push(...mapping.missing);
    items.push(...missingMemberDesignData(classification, designData));
    items.push(...missingWallDesignData(classification, designData));
    items.push(...missingSlabDesignData(classification, designData));
    items.push(...missingJointDesignData(classification, designData));
    items.push(...projectContextMissing(projectContext, { seismic: true, dissipative: true }));
    items.push(...combinationMissing(
      analysis,
      ["ultimate", "serviceability", "seismic"],
    ));
    items.push(...resultDataMissing(
      GLOBAL_FEM_READINESS_ASSESSMENTS.GENERIC_DEMANDS,
      capabilities,
      model,
      analysis,
      result,
    ));
    items.push(...resultDataMissing(
      GLOBAL_FEM_READINESS_ASSESSMENTS.MODAL_DATA,
      capabilities,
      model,
      analysis,
      result,
    ));
    items.push(...resultDataMissing(
      GLOBAL_FEM_READINESS_ASSESSMENTS.GLOBAL_DISPLACEMENT_DATA,
      capabilities,
      model,
      analysis,
      result,
    ));
  }
  return items.filter((item, index, array) =>
    array.findIndex((candidate) =>
      candidate.code === item.code && candidate.path === item.path &&
      candidate.message === item.message) === index);
}

function resolveAssessmentStatus({ implementationStatus, inputStatus }) {
  if (inputStatus === "blocked") return "blocked";
  if (implementationStatus === "not-implemented") return "not-implemented";
  if (inputStatus === "provisional") return "provisional";
  return "ready";
}

export function evaluateGlobalFemVerificationReadiness({
  profile,
  validations,
  mappingValidation = null,
  classification,
  capabilities,
  model,
  analysis,
  result,
  projectContext = null,
  designData = null,
  requestedAssessments = null,
} = {}) {
  if (!GLOBAL_FEM_POSTPROCESSING_PROFILE_VALUES.includes(profile)) {
    throw new Error(`Unsupported global FEM postprocessing profile: ${profile}.`);
  }
  if (!classification || !capabilities || !model || !analysis || !result) {
    throw new Error("Global FEM readiness requires validated contracts and classification.");
  }
  const requested = requestedAssessments ?? [
    GLOBAL_FEM_READINESS_ASSESSMENTS.GENERIC_DEMANDS,
    ...(profile === GLOBAL_FEM_POSTPROCESSING_PROFILES.DEMAND_ONLY
      ? []
      : [GLOBAL_FEM_READINESS_ASSESSMENTS.SEMANTIC_DEMANDS]),
  ];
  const unknown = requested.filter((item) =>
    !GLOBAL_FEM_READINESS_ASSESSMENT_VALUES.includes(item));
  if (unknown.length > 0) {
    throw new Error(`Unsupported global FEM readiness assessment: ${unknown.join(", ")}.`);
  }

  const baseMissing = contractMissing(validations, result);
  const mapping = mappingState(profile, mappingValidation, classification);
  const assessments = requested.map((assessmentId) => {
    const missingInputs = assessmentMissing({
      assessmentId,
      baseMissing,
      mapping,
      classification,
      capabilities,
      model,
      analysis,
      result,
      projectContext,
      designData,
    });
    const implementationStatus = IMPLEMENTED_ASSESSMENTS.has(assessmentId)
      ? "available"
      : "not-implemented";
    const inputStatus = missingInputs.length === 0
      ? (assessmentId === GLOBAL_FEM_READINESS_ASSESSMENTS.SEMANTIC_DEMANDS &&
        mapping.provisional ? "provisional" : "ready")
      : (assessmentId === GLOBAL_FEM_READINESS_ASSESSMENTS.SEMANTIC_DEMANDS &&
        mapping.provisional && missingInputs.every((item) =>
          item.code === "FEM_MAPPING_CONFIRMATION_REQUIRED") ? "provisional" : "blocked");
    return {
      id: assessmentId,
      normative: NORMATIVE_ASSESSMENTS.has(assessmentId),
      implementationStatus,
      inputStatus,
      status: resolveAssessmentStatus({ implementationStatus, inputStatus }),
      missingInputs,
    };
  });

  return {
    schema: "strutture-js/global-fem-verification-readiness",
    version: GLOBAL_FEM_READINESS_REPORT_VERSION,
    profile,
    model: { id: model.id, hash: model.hash },
    analysis: { id: analysis.id, hash: analysis.hash },
    assessments,
    readyForRequestedProcessing: assessments.every((item) =>
      ["ready", "provisional"].includes(item.status)),
    normativeVerificationEligible: assessments.some((item) => item.normative) &&
      assessments.filter((item) => item.normative).every((item) => item.status === "ready") &&
      mapping.confirmed,
    mapping: {
      confirmed: mapping.confirmed,
      provisional: mapping.provisional,
      ambiguousClassificationCount: classification.summary.ambiguous,
    },
  };
}
