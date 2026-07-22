export const GLOBAL_FEM_CONTRACT_VERSION = 0;

export const FEM_CONTRACT_SCHEMAS = Object.freeze({
  capabilities: "strutture-js/fem-capabilities",
  model: "strutture-js/global-fem-model",
  analysis: "strutture-js/global-fem-analysis",
  mapping: "strutture-js/fem-entity-mapping",
  result: "strutture-js/global-fem-result",
});

export const FEM_ANALYSIS_CAPABILITY_KEYS = Object.freeze([
  "linearStatic",
  "secondOrder",
  "modal",
  "responseSpectrum",
  "nonlinearStatic",
  "timeHistory",
]);

export const FEM_ELEMENT_CAPABILITY_KEYS = Object.freeze([
  "line",
  "shell",
  "solid",
  "link",
]);

export const FEM_RESULT_CAPABILITY_KEYS = Object.freeze([
  "nodalDisplacements",
  "reactions",
  "lineElementActions",
  "shellResultants",
  "stresses",
  "strains",
  "modes",
  "sectionCuts",
  "storeyResults",
  "equilibriumResiduals",
]);

export const FEM_ANALYSIS_TYPES = Object.freeze([
  "linear-static",
  "second-order-static",
  "modal",
  "response-spectrum",
  "nonlinear-static",
  "time-history",
]);

export const FEM_RESULT_STATUS_VALUES = Object.freeze([
  "completed",
  "completed-with-warnings",
  "partial",
  "failed",
  "not-supported",
]);

export const GLOBAL_FEM_REQUIRED_UNIT_KEYS = Object.freeze([
  "length",
  "force",
  "mass",
  "time",
  "angle",
  "moment",
  "stress",
  "strain",
  "acceleration",
  "frequency",
  "lineForce",
  "lineMoment",
]);

const AMBIGUOUS_UNIT_TOKENS = new Set([
  "",
  "-",
  "?",
  "default",
  "metric",
  "si",
  "unspecified",
  "unknown",
]);

export function diagnostic(code, path, message) {
  return { code, path, message };
}

export function addError(errors, code, path, message) {
  errors.push(diagnostic(code, path, message));
}

export function addWarning(warnings, code, path, message) {
  warnings.push(diagnostic(code, path, message));
}

export function isRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validateRecord(value, path, errors, { required = true } = {}) {
  if (value == null && !required) return false;
  if (isRecord(value)) return true;

  addError(errors, "FEM_EXPECTED_OBJECT", path, `${path} must be a plain object.`);
  return false;
}

export function validateArray(value, path, errors, { required = true } = {}) {
  if (value == null && !required) return false;
  if (Array.isArray(value)) return true;

  addError(errors, "FEM_EXPECTED_ARRAY", path, `${path} must be an array.`);
  return false;
}

export function validateId(value, path, errors) {
  if (typeof value === "string" && value.trim().length > 0) return true;

  addError(
    errors,
    "FEM_INVALID_ID",
    path,
    `${path} must be a non-empty stable string identifier.`,
  );
  return false;
}

export function validateString(value, path, errors, { allowed = null } = {}) {
  if (typeof value !== "string" || value.trim().length === 0) {
    addError(errors, "FEM_INVALID_STRING", path, `${path} must be a non-empty string.`);
    return false;
  }

  if (allowed && !allowed.includes(value)) {
    addError(
      errors,
      "FEM_UNSUPPORTED_VALUE",
      path,
      `${path} must be one of: ${allowed.join(", ")}.`,
    );
    return false;
  }

  return true;
}

export function validateBoolean(value, path, errors) {
  if (typeof value === "boolean") return true;

  addError(errors, "FEM_EXPLICIT_BOOLEAN_REQUIRED", path, `${path} must be true or false.`);
  return false;
}

export function validateFinite(value, path, errors, options = {}) {
  const { positive = false, nonNegative = false, integer = false } = options;

  if (!Number.isFinite(value)) {
    addError(errors, "FEM_NON_FINITE_NUMBER", path, `${path} must be finite.`);
    return false;
  }
  if (positive && value <= 0) {
    addError(errors, "FEM_POSITIVE_NUMBER_REQUIRED", path, `${path} must be positive.`);
    return false;
  }
  if (nonNegative && value < 0) {
    addError(errors, "FEM_NON_NEGATIVE_NUMBER_REQUIRED", path, `${path} must be non-negative.`);
    return false;
  }
  if (integer && !Number.isInteger(value)) {
    addError(errors, "FEM_INTEGER_REQUIRED", path, `${path} must be an integer.`);
    return false;
  }

  return true;
}

export function validateFiniteVector(value, path, errors) {
  if (!validateRecord(value, path, errors)) return false;

  let valid = true;
  for (const component of ["x", "y", "z"]) {
    valid = validateFinite(value[component], `${path}.${component}`, errors) && valid;
  }
  return valid;
}

function vectorNorm(vector) {
  return Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);
}

function dot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

export function validateAxes(axes, path, errors, { tolerance = 1e-8 } = {}) {
  if (!validateRecord(axes, path, errors)) return false;

  const validVectors = ["x", "y", "z"].map((axis) =>
    validateFiniteVector(axes[axis], `${path}.${axis}`, errors));

  if (validVectors.some((valid) => !valid)) return false;

  let valid = true;
  for (const axis of ["x", "y", "z"]) {
    const norm = vectorNorm(axes[axis]);
    if (Math.abs(norm - 1) > tolerance) {
      addError(
        errors,
        "FEM_AXIS_NOT_UNIT",
        `${path}.${axis}`,
        `${path}.${axis} must be a unit vector; received norm ${norm}.`,
      );
      valid = false;
    }
  }

  for (const [left, right] of [["x", "y"], ["y", "z"], ["z", "x"]]) {
    const scalarProduct = dot(axes[left], axes[right]);
    if (Math.abs(scalarProduct) > tolerance) {
      addError(
        errors,
        "FEM_AXES_NOT_ORTHOGONAL",
        path,
        `${path}.${left} and ${path}.${right} must be orthogonal.`,
      );
      valid = false;
    }
  }

  const handedness = dot(cross(axes.x, axes.y), axes.z);
  if (Math.abs(handedness - 1) > tolerance) {
    addError(
      errors,
      "FEM_AXES_NOT_RIGHT_HANDED",
      path,
      `${path} must be a non-degenerate right-handed orthonormal frame.`,
    );
    valid = false;
  }

  return valid;
}

export function validateUnits(units, path, errors) {
  if (!validateRecord(units, path, errors)) return false;

  let valid = true;
  for (const key of GLOBAL_FEM_REQUIRED_UNIT_KEYS) {
    const unit = units[key];
    if (typeof unit !== "string" || AMBIGUOUS_UNIT_TOKENS.has(unit.trim().toLowerCase())) {
      addError(
        errors,
        "FEM_UNIT_MISSING_OR_AMBIGUOUS",
        `${path}.${key}`,
        `${path}.${key} must be an explicit, unambiguous unit symbol.`,
      );
      valid = false;
    }
  }
  return valid;
}

export function validateHeader(value, schema, errors) {
  if (!validateRecord(value, "$", errors)) return false;

  let valid = true;
  if (value.schema !== schema) {
    addError(
      errors,
      "FEM_SCHEMA_MISMATCH",
      "$.schema",
      `$.schema must be ${schema}.`,
    );
    valid = false;
  }
  if (value.version !== GLOBAL_FEM_CONTRACT_VERSION) {
    addError(
      errors,
      "FEM_VERSION_MISMATCH",
      "$.version",
      `$.version must be the candidate schema version ${GLOBAL_FEM_CONTRACT_VERSION}.`,
    );
    valid = false;
  }
  return valid;
}

export function validateUniqueIds(items, path, errors) {
  if (!Array.isArray(items)) return new Map();

  const index = new Map();
  items.forEach((item, itemIndex) => {
    const itemPath = `${path}[${itemIndex}]`;
    if (!validateRecord(item, itemPath, errors)) return;
    if (!validateId(item.id, `${itemPath}.id`, errors)) return;

    if (index.has(item.id)) {
      addError(
        errors,
        "FEM_DUPLICATE_ID",
        `${itemPath}.id`,
        `Duplicate id ${item.id} in ${path}.`,
      );
      return;
    }
    index.set(item.id, item);
  });
  return index;
}

export function validateIdArray(value, path, errors, { minLength = 0 } = {}) {
  if (!validateArray(value, path, errors)) return false;
  let valid = true;
  if (value.length < minLength) {
    addError(
      errors,
      "FEM_ARRAY_TOO_SHORT",
      path,
      `${path} must contain at least ${minLength} entries.`,
    );
    valid = false;
  }

  const seen = new Set();
  value.forEach((id, index) => {
    if (!validateId(id, `${path}[${index}]`, errors)) {
      valid = false;
      return;
    }
    if (seen.has(id)) {
      addError(
        errors,
        "FEM_DUPLICATE_REFERENCE",
        `${path}[${index}]`,
        `${path} contains duplicate reference ${id}.`,
      );
      valid = false;
    }
    seen.add(id);
  });
  return valid;
}

export function validateReferences(ids, targetIndex, path, errors, targetLabel) {
  if (!Array.isArray(ids)) return;
  ids.forEach((id, index) => {
    if (typeof id === "string" && !targetIndex.has(id)) {
      addError(
        errors,
        "FEM_UNKNOWN_REFERENCE",
        `${path}[${index}]`,
        `${path}[${index}] references unknown ${targetLabel} ${id}.`,
      );
    }
  });
}

export function validateSerializable(value, path, errors, ancestors = new Set()) {
  const valueType = typeof value;
  if (value === null || valueType === "string" || valueType === "boolean") return true;
  if (valueType === "number") {
    if (Number.isFinite(value)) return true;
    addError(errors, "FEM_NOT_JSON_SERIALIZABLE", path, `${path} contains a non-finite number.`);
    return false;
  }
  if (["undefined", "bigint", "function", "symbol"].includes(valueType)) {
    addError(errors, "FEM_NOT_JSON_SERIALIZABLE", path, `${path} is not JSON-serializable.`);
    return false;
  }
  if (ancestors.has(value)) {
    addError(errors, "FEM_NOT_JSON_SERIALIZABLE", path, `${path} contains a circular reference.`);
    return false;
  }
  if (!Array.isArray(value) && !isRecord(value)) {
    addError(errors, "FEM_NOT_JSON_SERIALIZABLE", path, `${path} must contain only plain JSON values.`);
    return false;
  }
  if (!Array.isArray(value) && Object.getOwnPropertySymbols(value).length > 0) {
    addError(errors, "FEM_NOT_JSON_SERIALIZABLE", path, `${path} contains symbol keys.`);
    return false;
  }

  ancestors.add(value);
  let valid = true;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      valid = validateSerializable(entry, `${path}[${index}]`, errors, ancestors) && valid;
    });
  } else {
    for (const [key, entry] of Object.entries(value)) {
      valid = validateSerializable(entry, `${path}.${key}`, errors, ancestors) && valid;
    }
  }
  ancestors.delete(value);
  return valid;
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function finalizeValidation(value, errors, warnings) {
  const serializable = validateSerializable(value, "$", errors);
  return {
    ok: errors.length === 0,
    value: serializable ? cloneJson(value) : null,
    errors,
    warnings,
  };
}

export function withContractHeader(input, schema) {
  return {
    ...(isRecord(input) ? input : {}),
    schema,
    version: GLOBAL_FEM_CONTRACT_VERSION,
  };
}

export function throwForInvalidContract(label, validation) {
  if (validation.ok) return validation.value;

  const details = validation.errors
    .map((item) => `[${item.code}] ${item.path}: ${item.message}`)
    .join(" ");
  throw new Error(`Invalid ${label}: ${details}`);
}

export function sameJsonValue(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => sameJsonValue(entry, right[index]));
  }
  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) =>
        key === rightKeys[index] && sameJsonValue(left[key], right[key]));
  }
  return false;
}

export function indexById(items = []) {
  return new Map(items.map((item) => [item.id, item]));
}

export function vectorBetween(start, end) {
  return {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  };
}

export function normalized(vector) {
  const norm = vectorNorm(vector);
  if (!Number.isFinite(norm) || norm <= 0) return null;
  return { x: vector.x / norm, y: vector.y / norm, z: vector.z / norm };
}

export function dotProduct(left, right) {
  return dot(left, right);
}

export function crossProduct(left, right) {
  return cross(left, right);
}
