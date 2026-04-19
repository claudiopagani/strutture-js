export const round = (value, decimals = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

export function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

export function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

export function utilizationCheck({
  id,
  description,
  demand,
  capacity,
  metadata = {},
  strictCapacity = true,
}) {
  if (strictCapacity) {
    assertPositive(capacity, `${id} capacity`);
  }

  const utilizationRatio = isFinitePositive(capacity)
    ? Math.abs(demand) / capacity
    : null;

  return {
    id,
    description,
    demand: round(Math.abs(demand)),
    capacity: round(capacity),
    utilizationRatio: round(utilizationRatio),
    ok: Number.isFinite(utilizationRatio) && utilizationRatio <= 1,
    metadata,
  };
}

export function governingCheck(checks) {
  return checks.reduce((selected, check) => {
    if (!Number.isFinite(check.utilizationRatio)) {
      return selected;
    }

    if (!selected || check.utilizationRatio > selected.utilizationRatio) {
      return check;
    }

    return selected;
  }, null);
}

export function uniqueStrings(values) {
  return [
    ...new Set(values.filter((value) => typeof value === "string" && value.length > 0)),
  ];
}
