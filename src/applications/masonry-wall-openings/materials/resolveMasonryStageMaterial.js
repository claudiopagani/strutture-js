import { createUnitResolver } from "../../../domain/units/UnitSystem.js";

const STRENGTH_KEYS = ["fm", "tau0", "fv0"];
const STIFFNESS_KEYS = ["E", "G", "elasticModulus", "shearModulus"];

function stageKeyCandidates(stage) {
  return stage === "state-of-fact"
    ? ["state-of-fact", "stateOfFact", "state_of_fact", "ante-operam", "anteOperam"]
    : ["design", "post-operam", "postOperam", "improved"];
}

function firstObject(values = []) {
  return values.find(
    (value) => value && typeof value === "object" && !Array.isArray(value),
  );
}

function pickMechanicalProperties(source = {}) {
  if (!source || typeof source !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries({
      fm: source.fm,
      tau0: source.tau0,
      fv0: source.fv0,
      E: source.E ?? source.elasticModulus,
      G: source.G ?? source.shearModulus,
      density: source.density ?? source.w,
      w: source.w ?? source.density,
      mu: source.mu,
      phi: source.phi,
      elasticModulus: source.elasticModulus ?? source.E,
      shearModulus: source.shearModulus ?? source.G,
      poissonRatio: source.poissonRatio,
    }).filter(([, value]) => value != null),
  );
}

function materialUnitSystem(material) {
  return material?.units ?? material?.metadata?.unitSystem ?? null;
}

function convertPropertiesToTargetUnits(properties, material, targetUnits) {
  if (!targetUnits) {
    return { ...properties };
  }

  const resolver = createUnitResolver(materialUnitSystem(material), targetUnits);

  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => {
      if (!Number.isFinite(value)) {
        return [key, value];
      }

      if (key === "density" || key === "w") {
        return [key, resolver.volumeLoad(value)];
      }

      if (STRENGTH_KEYS.includes(key) || STIFFNESS_KEYS.includes(key)) {
        return [key, resolver.stress(value)];
      }

      return [key, value];
    }),
  );
}

function resolveVariantOverrides(material, stage, settings = {}) {
  const stageVariants = firstObject([
    material?.stageSelectionVariants?.[stage],
    material?.selectionVariants?.[stage],
    material?.selectionVariants,
  ]);

  if (!stageVariants) {
    return null;
  }

  return {
    ...(firstObject([
      stageVariants.strength?.[settings.strengthSelection],
      stageVariants.strengthSelection?.[settings.strengthSelection],
    ]) ?? {}),
    ...(firstObject([
      stageVariants.stiffness?.[settings.stiffnessSelection],
      stageVariants.stiffnessSelection?.[settings.stiffnessSelection],
    ]) ?? {}),
    ...(firstObject([
      stageVariants.stiffnessState?.[settings.stiffnessState],
      stageVariants.state?.[settings.stiffnessState],
    ]) ?? {}),
  };
}

function selectPropertySource(material, stage, settings = {}) {
  const originalProperties = firstObject([
    material?.originalMechanicalProperties,
    material?.baseProperties,
  ]);
  const stateOfFactProperties = firstObject([
    material?.stageProperties?.["state-of-fact"],
    material?.stageProperties?.stateOfFact,
    material?.stateOfFactProperties,
    material?.stageOfFactProperties,
    material?.anteOperamProperties,
  ]);
  const adjustedProperties =
    typeof material?.adjustedProperties === "function"
      ? material.adjustedProperties()
      : material?.adjustedProperties;
  const designProperties = firstObject([
    material?.stageProperties?.design,
    material?.designProperties,
    material?.postOperamProperties,
    material?.improvedMechanicalProperties,
    adjustedProperties,
  ]);
  const directProperties = pickMechanicalProperties(
    material?.properties && typeof material.properties === "object"
      ? material.properties
      : material ?? {},
  );

  if (settings.useCorrectiveModifiers === false && originalProperties) {
    return {
      sourceKey: "originalMechanicalProperties",
      properties: originalProperties,
      fallback: false,
    };
  }

  if (stage === "state-of-fact") {
    if (stateOfFactProperties) {
      return {
        sourceKey: "stateOfFactProperties",
        properties: stateOfFactProperties,
        fallback: false,
      };
    }

    if (originalProperties) {
      return {
        sourceKey: "originalMechanicalProperties",
        properties: originalProperties,
        fallback: true,
      };
    }

    return {
      sourceKey: "directProperties",
      properties: directProperties,
      fallback: true,
    };
  }

  if (designProperties) {
    return {
      sourceKey:
        material?.designProperties != null
          ? "designProperties"
          : material?.improvedMechanicalProperties != null
            ? "improvedMechanicalProperties"
            : adjustedProperties != null
              ? "adjustedProperties"
              : "stageProperties.design",
      properties: designProperties,
      fallback: false,
    };
  }

  if (stateOfFactProperties) {
    return {
      sourceKey: "stateOfFactProperties",
      properties: stateOfFactProperties,
      fallback: true,
    };
  }

  if (originalProperties) {
    return {
      sourceKey: "originalMechanicalProperties",
      properties: originalProperties,
      fallback: true,
    };
  }

  return {
    sourceKey: "directProperties",
    properties: directProperties,
    fallback: true,
  };
}

function resolveStageOverride(override = {}, stage) {
  const safeOverride = override ?? {};
  const candidates = stageKeyCandidates(stage);

  return firstObject([
    safeOverride.stageProperties?.[stage],
    ...candidates.map((key) => safeOverride.stageProperties?.[key]),
    safeOverride[stage],
    ...candidates.map((key) => safeOverride[key]),
    safeOverride.properties,
  ]);
}

function maybeDivideByConfidenceFactor(properties, confidenceFactor, settings = {}) {
  if (
    settings.divideByConfidenceFactor !== true ||
    !Number.isFinite(confidenceFactor) ||
    confidenceFactor <= 1
  ) {
    return {
      properties: { ...properties },
      applied: false,
    };
  }

  return {
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        Number.isFinite(value) &&
        (STRENGTH_KEYS.includes(key) || STIFFNESS_KEYS.includes(key))
          ? value / confidenceFactor
          : value,
      ]),
    ),
    applied: true,
  };
}

export function resolveMasonryStageMaterial({
  material,
  stage = "design",
  settings = {},
  override = null,
  targetUnits = null,
  contextId = null,
} = {}) {
  const warnings = [];
  const assumptions = [];

  if (!material) {
    return {
      material: null,
      resolvedProperties: null,
      warnings,
      assumptions,
      metadata: {
        stage,
        contextId,
        propertySource: "missing-material",
      },
    };
  }

  const sourceSelection = selectPropertySource(material, stage, settings);
  const variantOverrides = resolveVariantOverrides(material, stage, settings);
  const explicitOverride = resolveStageOverride(override, stage);
  const mergedProperties = {
    ...pickMechanicalProperties(sourceSelection.properties),
    ...pickMechanicalProperties(variantOverrides),
    ...pickMechanicalProperties(explicitOverride),
  };
  const convertedProperties = convertPropertiesToTargetUnits(
    mergedProperties,
    material,
    targetUnits,
  );
  const confidenceFactor = Number.isFinite(material.confidenceFactor)
    ? material.confidenceFactor
    : 1;
  const confidenceAdjusted = maybeDivideByConfidenceFactor(
    convertedProperties,
    confidenceFactor,
    settings,
  );

  if (sourceSelection.fallback) {
    warnings.push(
      `Material ${contextId ?? material.id ?? material.name ?? "unknown"} resolved ${stage} properties through the fallback source ${sourceSelection.sourceKey}.`,
    );
  }

  if (variantOverrides && Object.keys(variantOverrides).length > 0) {
    assumptions.push(
      `Material ${contextId ?? material.id ?? material.name ?? "unknown"} applied explicit selection variants for strength/stiffness presets during ${stage} resolution.`,
    );
  }

  if (explicitOverride && Object.keys(explicitOverride).length > 0) {
    assumptions.push(
      `Material ${contextId ?? material.id ?? material.name ?? "unknown"} applied explicit user overrides during ${stage} resolution.`,
    );
  }

  if (confidenceAdjusted.applied) {
    assumptions.push(
      `Material ${contextId ?? material.id ?? material.name ?? "unknown"} divided strength and stiffness properties by the confidence factor ${confidenceFactor} because divideByConfidenceFactor=true.`,
    );
  }

  const resolvedProperties = confidenceAdjusted.properties;
  const {
    w: _ignoredVolumeLoad,
    ...resolvedMaterialProperties
  } = resolvedProperties;
  const resolvedMaterial = {
    id: material.id ?? null,
    name: material.name ?? null,
    category: material.category ?? "masonry",
    masonryType: material.masonryType ?? material.metadata?.masonryTypologyName ?? null,
    unitType: material.unitType ?? null,
    mortarType: material.mortarType ?? null,
    conditionLevel: material.conditionLevel ?? null,
    knowledgeLevel: material.knowledgeLevel ?? null,
    confidenceFactor,
    units: targetUnits ?? materialUnitSystem(material) ?? null,
    ...resolvedMaterialProperties,
    metadata: {
      ...(material.metadata ?? {}),
      stageResolution: {
        stage,
        propertySource: sourceSelection.sourceKey,
        useCorrectiveModifiers: settings.useCorrectiveModifiers ?? true,
        divideByConfidenceFactor: settings.divideByConfidenceFactor ?? false,
        strengthSelection: settings.strengthSelection ?? null,
        stiffnessSelection: settings.stiffnessSelection ?? null,
        stiffnessState: settings.stiffnessState ?? null,
        overrideKeys: explicitOverride ? Object.keys(explicitOverride) : [],
        adoptedProperties: { ...resolvedProperties },
      },
    },
  };

  return {
    material: resolvedMaterial,
    resolvedProperties,
    warnings,
    assumptions,
    metadata: {
      stage,
      contextId,
      propertySource: sourceSelection.sourceKey,
      confidenceFactor,
      appliedVariantSelections: Boolean(
        variantOverrides && Object.keys(variantOverrides).length > 0,
      ),
      appliedOverride: Boolean(
        explicitOverride && Object.keys(explicitOverride).length > 0,
      ),
      dividedByConfidenceFactor: confidenceAdjusted.applied,
    },
  };
}
