const DEFAULT_SECTION_ROTATION = Object.freeze({
  alpha: 0,
  units: "rad",
  convention: "roof-slope",
  primaryAxis: "principalY",
});

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function normalizeAngleUnits(units) {
  const normalized = String(units ?? "rad").trim().toLowerCase();
  const aliases = {
    radians: "rad",
    radian: "rad",
    deg: "deg",
    degree: "deg",
    degrees: "deg",
    gradi: "deg",
  };

  return aliases[normalized] ?? normalized;
}

function angleToRadians(alpha, units) {
  if (!Number.isFinite(alpha)) {
    throw new Error("sectionRotation.alpha must be a finite number.");
  }

  const normalizedUnits = normalizeAngleUnits(units);

  if (normalizedUnits === "rad") {
    return alpha;
  }

  if (normalizedUnits === "deg") {
    return (alpha * Math.PI) / 180;
  }

  throw new Error(`Unsupported sectionRotation angle units: ${units}.`);
}

export function normalizeSectionRotation(sectionRotation = null) {
  if (sectionRotation == null) {
    return { ...DEFAULT_SECTION_ROTATION };
  }

  if (typeof sectionRotation === "number") {
    return {
      ...DEFAULT_SECTION_ROTATION,
      alpha: sectionRotation,
      inputAlpha: sectionRotation,
    };
  }

  if (typeof sectionRotation !== "object") {
    throw new Error("sectionRotation must be a number or an object.");
  }

  const inputUnits =
    sectionRotation.inputUnits ??
    sectionRotation.units ??
    sectionRotation.angleUnits ??
    "rad";
  const inputAlpha =
    sectionRotation.inputAlpha ??
    sectionRotation.alpha ??
    sectionRotation.angle ??
    sectionRotation.value ??
    0;

  return {
    ...DEFAULT_SECTION_ROTATION,
    ...sectionRotation,
    alpha: angleToRadians(inputAlpha, inputUnits),
    units: "rad",
    inputAlpha,
    inputUnits: normalizeAngleUnits(inputUnits),
    convention: sectionRotation.convention ?? DEFAULT_SECTION_ROTATION.convention,
    primaryAxis: sectionRotation.primaryAxis ?? DEFAULT_SECTION_ROTATION.primaryAxis,
  };
}

export function sectionRotationFactors(sectionRotation = null) {
  const rotation = normalizeSectionRotation(sectionRotation);

  return {
    rotation,
    cos: Math.cos(rotation.alpha),
    sin: Math.sin(rotation.alpha),
  };
}

export function splitPrincipalActions({ n = 0, v = 0, m = 0 } = {}, sectionRotation = null) {
  const { rotation, cos, sin } = sectionRotationFactors(sectionRotation);

  return {
    n,
    vY: v * cos,
    vZ: v * sin,
    mY: m * cos,
    mZ: m * sin,
    alpha: rotation.alpha,
    convention: rotation.convention,
    primaryAxis: rotation.primaryAxis,
  };
}

export function equivalentVerticalRigidity({
  y,
  z,
  sectionRotation = null,
  label = "rigidity",
} = {}) {
  const { rotation, cos, sin } = sectionRotationFactors(sectionRotation);

  if (Math.abs(rotation.alpha) <= 1e-14) {
    return {
      value: y,
      source: `${label}-principal-y`,
      rotation,
    };
  }

  if (!Number.isFinite(y) || y <= 0) {
    throw new Error(`${label}Y must be positive when sectionRotation is used.`);
  }

  if (!Number.isFinite(z) || z <= 0) {
    throw new Error(`${label}Z must be positive when sectionRotation is used.`);
  }

  return {
    value: 1 / (cos ** 2 / y + sin ** 2 / z),
    source: `${label}-harmonic-projection-yz`,
    rotation,
  };
}

export function applySectionRotationToBeamProperties({
  properties,
  sectionRotation = null,
  flexuralRigidityY = null,
  flexuralRigidityZ = null,
  shearRigidityY = null,
  shearRigidityZ = null,
} = {}) {
  const rotation = normalizeSectionRotation(sectionRotation);
  const flexuralY = finiteOrNull(flexuralRigidityY ?? properties.flexuralRigidityY);
  const flexuralZ = finiteOrNull(flexuralRigidityZ ?? properties.flexuralRigidityZ);
  const shearY = finiteOrNull(shearRigidityY ?? properties.shearRigidityY);
  const shearZ = finiteOrNull(shearRigidityZ ?? properties.shearRigidityZ);
  const flexural = equivalentVerticalRigidity({
    y: flexuralY ?? properties.flexuralRigidity,
    z: flexuralZ,
    sectionRotation: rotation,
    label: "flexuralRigidity",
  });
  const canResolveShear =
    Number.isFinite(shearY ?? properties.shearRigidity) &&
    (Math.abs(rotation.alpha) <= 1e-14 || Number.isFinite(shearZ));
  const shear = canResolveShear
    ? equivalentVerticalRigidity({
        y: shearY ?? properties.shearRigidity,
        z: shearZ,
        sectionRotation: rotation,
        label: "shearRigidity",
      })
    : {
        value: properties.shearRigidity ?? null,
        source: "shearRigidity-unavailable",
        rotation,
      };

  return {
    ...properties,
    flexuralRigidity: flexural.value,
    shearRigidity: shear.value,
    flexuralRigidityY: flexuralY ?? properties.flexuralRigidity,
    flexuralRigidityZ: flexuralZ,
    shearRigidityY: shearY ?? properties.shearRigidity ?? null,
    shearRigidityZ: shearZ,
    metadata: {
      ...properties.metadata,
      sectionRotation: {
        alpha: rotation.alpha,
        inputAlpha: rotation.inputAlpha ?? rotation.alpha,
        inputUnits: rotation.inputUnits ?? rotation.units,
        convention: rotation.convention,
        primaryAxis: rotation.primaryAxis,
      },
      principalAxes: {
        alpha: rotation.alpha,
        convention: rotation.convention,
        primaryAxis: rotation.primaryAxis,
      },
      flexuralRigidityY: flexuralY ?? properties.flexuralRigidity,
      flexuralRigidityZ: flexuralZ,
      shearRigidityY: shearY ?? properties.shearRigidity ?? null,
      shearRigidityZ: shearZ,
      verticalFlexuralRigiditySource: flexural.source,
      verticalShearRigiditySource: shear.source,
    },
  };
}

export { DEFAULT_SECTION_ROTATION };
