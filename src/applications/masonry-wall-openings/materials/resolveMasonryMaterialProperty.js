import { createUnitResolver } from "../../../domain/units/UnitSystem.js";

function firstFinite(values = []) {
  return values.find((value) => Number.isFinite(value)) ?? null;
}

function resolveMaterialUnitSystem(material) {
  return material?.units ?? material?.metadata?.unitSystem ?? null;
}

function convertValueToTargetUnits(value, quantity, material, targetUnits) {
  if (!Number.isFinite(value) || !targetUnits) {
    return value;
  }

  const resolver = createUnitResolver(
    resolveMaterialUnitSystem(material),
    targetUnits,
  );

  if (quantity === "volumeLoad") {
    return resolver.volumeLoad(value);
  }

  if (quantity === "length") {
    return resolver.length(value);
  }

  return resolver.stress(value);
}

export function resolveMasonryMaterialProperty({
  material,
  aliases = [],
  targetUnits = null,
  quantity = "stress",
} = {}) {
  if (!material) {
    return null;
  }

  const adjustedProperties =
    typeof material.adjustedProperties === "function"
      ? material.adjustedProperties()
      : material.adjustedProperties;
  const sources = [
    material.improvedMechanicalProperties,
    adjustedProperties,
    material.stateOfFactProperties,
    material.originalMechanicalProperties,
    material.baseProperties,
    material.properties,
    material,
  ].filter(Boolean);

  for (const source of sources) {
    const value = firstFinite(aliases.map((alias) => source?.[alias]));

    if (Number.isFinite(value)) {
      return convertValueToTargetUnits(
        value,
        quantity,
        material,
        targetUnits,
      );
    }
  }

  if (typeof material.adjustedProperty === "function") {
    const value = firstFinite(
      aliases.map((alias) => material.adjustedProperty(alias)),
    );

    if (Number.isFinite(value)) {
      return convertValueToTargetUnits(
        value,
        quantity,
        material,
        targetUnits,
      );
    }
  }

  return null;
}

export function resolveMasonryUnitWeight({
  material,
  targetUnits = null,
} = {}) {
  return resolveMasonryMaterialProperty({
    material,
    aliases: ["w", "density"],
    targetUnits,
    quantity: "volumeLoad",
  });
}
