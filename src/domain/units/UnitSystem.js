const FORCE_UNIT_FACTORS = Object.freeze({
  N: 1,
  kN: 1e3,
  MN: 1e6,
});

const LENGTH_UNIT_FACTORS = Object.freeze({
  m: 1,
  dm: 1e-1,
  cm: 1e-2,
  mm: 1e-3,
});

const DEFAULT_TARGET_UNIT_SYSTEM = Object.freeze({
  force: "N",
  length: "m",
});

function assertSupportedUnit(label, value, supported) {
  if (value == null) {
    return;
  }

  if (!Object.hasOwn(supported, value)) {
    throw new Error(`Unsupported ${label} unit: ${value}.`);
  }
}

export function normalizeUnitSystem(
  units,
  defaultUnits = DEFAULT_TARGET_UNIT_SYSTEM,
) {
  if (units == null) {
    return null;
  }

  const normalized = {
    force: units.force ?? defaultUnits.force,
    length: units.length ?? defaultUnits.length,
  };

  assertSupportedUnit("force", normalized.force, FORCE_UNIT_FACTORS);
  assertSupportedUnit("length", normalized.length, LENGTH_UNIT_FACTORS);

  return normalized;
}

export function createUnitResolver(
  units,
  targetUnits = DEFAULT_TARGET_UNIT_SYSTEM,
) {
  const source = normalizeUnitSystem(units, targetUnits);
  const target = normalizeUnitSystem(targetUnits, DEFAULT_TARGET_UNIT_SYSTEM);

  if (source == null) {
    return {
      unitSystem: target,
      convert: (value) => value,
      length: (value) => value,
      area: (value) => value,
      volume: (value) => value,
      force: (value) => value,
      moment: (value) => value,
      lineLoad: (value) => value,
      areaLoad: (value) => value,
      volumeLoad: (value) => value,
      stress: (value) => value,
      translationalStiffness: (value) => value,
      rotationalStiffness: (value) => value,
      inertia: (value) => value,
      sectionModulus: (value) => value,
    };
  }

  const convert = (
    value,
    {
      forceExponent = 0,
      lengthExponent = 0,
    } = {},
  ) => {
    if (!Number.isFinite(value)) {
      return value;
    }

    const sourceFactor =
      FORCE_UNIT_FACTORS[source.force] ** forceExponent *
      LENGTH_UNIT_FACTORS[source.length] ** lengthExponent;
    const targetFactor =
      FORCE_UNIT_FACTORS[target.force] ** forceExponent *
      LENGTH_UNIT_FACTORS[target.length] ** lengthExponent;

    return value * (sourceFactor / targetFactor);
  };

  return {
    unitSystem: source,
    convert,
    length: (value) => convert(value, { lengthExponent: 1 }),
    area: (value) => convert(value, { lengthExponent: 2 }),
    volume: (value) => convert(value, { lengthExponent: 3 }),
    force: (value) => convert(value, { forceExponent: 1 }),
    moment: (value) => convert(value, { forceExponent: 1, lengthExponent: 1 }),
    lineLoad: (value) => convert(value, { forceExponent: 1, lengthExponent: -1 }),
    areaLoad: (value) => convert(value, { forceExponent: 1, lengthExponent: -2 }),
    volumeLoad: (value) => convert(value, { forceExponent: 1, lengthExponent: -3 }),
    stress: (value) => convert(value, { forceExponent: 1, lengthExponent: -2 }),
    translationalStiffness: (value) =>
      convert(value, { forceExponent: 1, lengthExponent: -1 }),
    rotationalStiffness: (value) =>
      convert(value, { forceExponent: 1, lengthExponent: 1 }),
    inertia: (value) => convert(value, { lengthExponent: 4 }),
    sectionModulus: (value) => convert(value, { lengthExponent: 3 }),
  };
}

export function convertPointCoordinates(point, resolver, coordinateKeys = ["x", "y", "z"]) {
  if (!point) {
    return point;
  }

  return coordinateKeys.reduce((acc, key) => {
    acc[key] = Number.isFinite(point[key]) ? resolver.length(point[key]) : point[key];
    return acc;
  }, { ...point });
}

export { FORCE_UNIT_FACTORS, LENGTH_UNIT_FACTORS };
