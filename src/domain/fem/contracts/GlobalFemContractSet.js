import {
  createFemCapabilitiesContract,
  validateFemCapabilitiesContract,
} from "./FemCapabilitiesContract.js";
import {
  createFemEntityMappingContract,
  validateFemEntityMappingContract,
} from "./FemEntityMappingContract.js";
import {
  createGlobalFemAnalysisContract,
  validateGlobalFemAnalysisContract,
} from "./GlobalFemAnalysisContract.js";
import {
  createGlobalFemModelContract,
  validateGlobalFemModelContract,
} from "./GlobalFemModelContract.js";
import {
  createGlobalFemResultContract,
  validateGlobalFemResultContract,
} from "./GlobalFemResultContract.js";

export function validateGlobalFemContractSet(input = {}) {
  const capabilities = validateFemCapabilitiesContract(input.capabilities);
  const model = validateGlobalFemModelContract(input.model);
  const analysis = validateGlobalFemAnalysisContract(input.analysis, {
    model: input.model,
    capabilities: input.capabilities,
  });
  const mapping = validateFemEntityMappingContract(input.mapping, {
    model: input.model,
  });
  const result = validateGlobalFemResultContract(input.result, {
    model: input.model,
    analysis: input.analysis,
    capabilities: input.capabilities,
    mapping: input.mapping,
  });
  const validations = { capabilities, model, analysis, mapping, result };
  const errors = Object.values(validations).flatMap((validation) => validation.errors);
  const warnings = Object.values(validations).flatMap((validation) => validation.warnings);

  return {
    ok: errors.length === 0,
    value: Object.values(validations).every((validation) => validation.value !== null)
      ? Object.fromEntries(
        Object.entries(validations).map(([key, validation]) => [key, validation.value]),
      )
      : null,
    errors,
    warnings,
    contracts: validations,
  };
}

export function createGlobalFemContractSet(input = {}) {
  const capabilities = createFemCapabilitiesContract(input.capabilities);
  const model = createGlobalFemModelContract(input.model);
  const analysis = createGlobalFemAnalysisContract(input.analysis, { model, capabilities });
  const mapping = createFemEntityMappingContract(input.mapping, { model });
  const result = createGlobalFemResultContract(input.result, {
    model,
    analysis,
    capabilities,
    mapping,
  });

  return { capabilities, model, analysis, mapping, result };
}
