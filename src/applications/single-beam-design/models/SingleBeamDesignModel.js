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

  toAnalysisInput() {
    return {
      ...this.beamInput,
      id: this.beamInput.id ?? this.id,
    };
  }

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

