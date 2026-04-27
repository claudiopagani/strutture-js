/**
 * Explicit unit system used by public beam inputs and reports.
 *
 * Values are user-facing units on input. `SingleBeamAnalysis` performs the
 * internal normalization before solving.
 *
 * @typedef {Object} SingleBeamDesignUnitSystem
 * @property {string} force
 * @property {string} length
 */

/**
 * Serializable metadata bag kept on the model and report output.
 *
 * @typedef {Record<string, unknown>} SingleBeamDesignMetadata
 */

/**
 * Input accepted by `SingleBeamAnalysis`.
 *
 * The object is intentionally open because it may contain domain instances
 * such as sections, materials, section providers, custom element classes and
 * solver hooks. `toJSON()` serializes non-plain values into safe DTO payloads.
 *
 * @typedef {Record<string, unknown> & {
 *   id?: string,
 *   units?: SingleBeamDesignUnitSystem,
 *   geometry?: Record<string, unknown>,
 *   supports?: unknown,
 *   loads?: unknown,
 *   combinations?: unknown,
 *   discretization?: Record<string, unknown>,
 *   verificationStations?: unknown,
 *   sectionRotation?: Record<string, unknown>
 * }} SingleBeamAnalysisInputDto
 */

/**
 * Public DTO used to create a single-beam design workflow.
 *
 * @typedef {Object} SingleBeamDesignModelInput
 * @property {string} id Stable model/report id.
 * @property {string|null} [title] Display title. Defaults to `id`.
 * @property {string} [description]
 * @property {SingleBeamDesignUnitSystem|null} [units] User input units. Defaults to `beamInput.units`.
 * @property {SingleBeamAnalysisInputDto} beamInput Beam analysis input in user units.
 * @property {unknown} [section] Optional domain section instance or DTO.
 * @property {unknown} [material] Optional domain material instance or DTO.
 * @property {unknown} [verification] Optional verifier, verifier descriptor or callback.
 * @property {Record<string, unknown>} [report] Report generation options.
 * @property {SingleBeamDesignMetadata} [metadata]
 */

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function toSerializable(value, seen = new WeakSet()) {
  if (value == null || typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "function") {
    return {
      type: "function",
      name: value.name || null,
    };
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return {
      type: "circular-reference",
    };
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item, seen));
  }

  if (typeof value.toJSON === "function" && !isPlainObject(value)) {
    return toSerializable(value.toJSON(), seen);
  }

  const output = {};

  for (const [key, item] of Object.entries(value)) {
    output[key] = toSerializable(item, seen);
  }

  return output;
}

function describeProvider(provider) {
  if (!provider) {
    return null;
  }

  return {
    type: provider.constructor?.name ?? "SectionProvider",
    metadata: toSerializable(provider.metadata ?? null),
  };
}

function serializeBeamInput(input = {}) {
  const {
    sectionProvider,
    elementClass,
    linearSolver,
    ...serializableInput
  } = input;

  return {
    ...toSerializable(serializableInput),
    sectionProvider: describeProvider(sectionProvider),
    elementClass: elementClass?.name ?? null,
    linearSolver: linearSolver?.constructor?.name ?? null,
  };
}

function serializeVerification(verification) {
  if (!verification) {
    return null;
  }

  if (typeof verification === "function") {
    return {
      type: "function",
      name: verification.name || null,
    };
  }

  const verifier = verification.verifier ?? verification;

  return {
    type: verifier.constructor?.name ?? "Verifier",
    input: toSerializable(verification.input ?? null),
    metadata: toSerializable(verification.metadata ?? null),
  };
}

export class SingleBeamDesignModel {
  /**
   * @param {SingleBeamDesignModelInput} [input]
   */
  constructor({
    id,
    title = null,
    description = "",
    units = null,
    beamInput = null,
    section = null,
    material = null,
    verification = null,
    report = {},
    metadata = {},
  } = {}) {
    if (!id) {
      throw new Error("SingleBeamDesignModel requires an id.");
    }

    if (!beamInput) {
      throw new Error("SingleBeamDesignModel requires a beamInput.");
    }

    this.id = id;
    this.title = title ?? id;
    this.description = description;
    this.units = units ?? beamInput.units ?? null;
    this.beamInput = {
      id,
      ...beamInput,
    };
    this.section = section;
    this.material = material;
    this.verification = verification;
    this.report = { ...report };
    this.metadata = { ...metadata };
  }

  /**
   * @returns {SingleBeamAnalysisInputDto}
   */
  toAnalysisInput() {
    return {
      ...this.beamInput,
      id: this.beamInput.id ?? this.id,
    };
  }

  /**
   * @returns {Record<string, unknown>}
   */
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      units: toSerializable(this.units),
      beamInput: serializeBeamInput(this.beamInput),
      section: toSerializable(this.section),
      material: toSerializable(this.material),
      verification: serializeVerification(this.verification),
      report: toSerializable(this.report),
      metadata: toSerializable(this.metadata),
    };
  }
}
