import {
  FEM_ANALYSIS_CAPABILITY_KEYS,
  FEM_CONTRACT_SCHEMAS,
  FEM_ELEMENT_CAPABILITY_KEYS,
  FEM_RESULT_CAPABILITY_KEYS,
  addWarning,
  finalizeValidation,
  throwForInvalidContract,
  validateBoolean,
  validateHeader,
  validateId,
  validateRecord,
  validateString,
  withContractHeader,
} from "./FemContractValidation.js";

function validateCapabilityGroup(group, keys, path, errors, warnings) {
  if (!validateRecord(group, path, errors)) return;

  for (const key of keys) {
    const itemPath = `${path}.${key}`;
    if (!validateBoolean(group[key], itemPath, errors)) continue;

    if (!group[key]) {
      addWarning(
        warnings,
        "FEM_CAPABILITY_UNAVAILABLE",
        itemPath,
        `${itemPath} is explicitly unavailable; consumers must not infer or synthesize it.`,
      );
    }
  }
}

export function validateFemCapabilitiesContract(input) {
  const errors = [];
  const warnings = [];

  if (validateHeader(input, FEM_CONTRACT_SCHEMAS.capabilities, errors)) {
    validateId(input.id, "$.id", errors);

    if (validateRecord(input.solver, "$.solver", errors)) {
      validateId(input.solver.id, "$.solver.id", errors);
      validateString(input.solver.name, "$.solver.name", errors);
      validateString(input.solver.version, "$.solver.version", errors);
    }

    validateCapabilityGroup(
      input.analyses,
      FEM_ANALYSIS_CAPABILITY_KEYS,
      "$.analyses",
      errors,
      warnings,
    );
    validateCapabilityGroup(
      input.elements,
      FEM_ELEMENT_CAPABILITY_KEYS,
      "$.elements",
      errors,
      warnings,
    );
    validateCapabilityGroup(
      input.results,
      FEM_RESULT_CAPABILITY_KEYS,
      "$.results",
      errors,
      warnings,
    );

    if (input.metadata != null) {
      validateRecord(input.metadata, "$.metadata", errors);
    }
  }

  return finalizeValidation(input, errors, warnings);
}

export function createFemCapabilitiesContract(input) {
  const candidate = withContractHeader(input, FEM_CONTRACT_SCHEMAS.capabilities);
  return throwForInvalidContract(
    "FemCapabilitiesContract",
    validateFemCapabilitiesContract(candidate),
  );
}
