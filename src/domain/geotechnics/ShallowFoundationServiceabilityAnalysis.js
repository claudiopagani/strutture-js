import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { GeotechnicalDesignSituation } from "./GeotechnicalDesignSituation.js";
import { GroundModel } from "./GroundModel.js";
import {
  ShallowFoundationActionState,
  ShallowFoundationModel,
} from "./ShallowFoundationModel.js";
import {
  calculateShallowFoundationEffectiveGeometry,
} from "./ShallowFoundationUltimateLimitStateAnalysis.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const SHALLOW_FOUNDATION_SLS_RESULT_SCHEMA_VERSION =
  "shallow-foundation-sls-result/v1";

export const SHALLOW_FOUNDATION_SETTLEMENT_METHODS = Object.freeze([
  "usace-schmertmann-cpt-2025",
  "usace-incremental-constrained-modulus-2025",
  "nist-pais-kausel-elastic-2012",
]);

const USACE_REFERENCE =
  "USACE EM 1110-1-1905 (31 July 2025), Chapters 3, 6 and 7, equations 6-8 through 6-11 and 7-10 and 7-16 through 7-26";
const NIST_REFERENCE =
  "NIST GCR 12-917-21 (2012), Section 2.2.1, Tables 2-2a and 2-2b, Pais and Kausel (1988) static rigid-foundation stiffness";
const TOLERANCE = 1e-10;

class NotSupportedError extends Error {}

function result({
  status,
  summary,
  outputs = {},
  warnings = [],
  assumptions = [],
  metadata = {},
}) {
  return { status, summary, outputs, warnings, assumptions, metadata };
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) throw new Error(`${label} must be positive.`);
  return number;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new Error(`${label} must be non-negative.`);
  return number;
}

function normalizeGroundModel(input, units) {
  return input instanceof GroundModel
    ? input
    : new GroundModel({ ...input, units: input?.units ?? units });
}

function normalizeDesignSituation(input, groundModel, units) {
  return input instanceof GeotechnicalDesignSituation
    ? input
    : new GeotechnicalDesignSituation({
        ...input,
        groundModelId: input?.groundModelId ?? groundModel.id,
        units: input?.units ?? units,
      });
}

function normalizeFoundation(input, units) {
  return input instanceof ShallowFoundationModel
    ? input
    : new ShallowFoundationModel({ ...input, units: input?.units ?? units });
}

function normalizeActions(input, units) {
  return input instanceof ShallowFoundationActionState
    ? input
    : new ShallowFoundationActionState({
        ...input,
        units: input?.units ?? units,
      });
}

function normalizeCriteria(criteria, resolver) {
  const maximumSettlement = criteria?.maximumSettlement == null
    ? null
    : positive(
        resolver.length(Number(criteria.maximumSettlement)),
        "criteria.maximumSettlement",
      );
  const maximumRotation = criteria?.maximumRotation == null
    ? null
    : positive(Number(criteria.maximumRotation), "criteria.maximumRotation");
  return { maximumSettlement, maximumRotation };
}

function normalizeSettings(settings, resolver, referenceWidth) {
  const maximumSublayerThickness = settings?.maximumSublayerThickness == null
    ? referenceWidth / 8
    : positive(
        resolver.length(Number(settings.maximumSublayerThickness)),
        "analysisSettings.maximumSublayerThickness",
      );
  const convergenceTolerance = positive(
    Number(settings?.convergenceTolerance ?? 0.001),
    "analysisSettings.convergenceTolerance",
  );
  const maximumRefinements = positive(
    Number(settings?.maximumRefinements ?? 6),
    "analysisSettings.maximumRefinements",
  );
  if (!Number.isInteger(maximumRefinements)) {
    throw new Error("analysisSettings.maximumRefinements must be an integer.");
  }
  const embedmentContact = settings?.embedmentContact ?? "surface-equivalent";
  if (!["surface-equivalent", "full-sidewall-contact"].includes(
    embedmentContact,
  )) {
    throw new Error(
      "analysisSettings.embedmentContact must be surface-equivalent or full-sidewall-contact.",
    );
  }
  const elasticAveragingDepth = settings?.elasticAveragingDepth == null
    ? referenceWidth
    : positive(
        resolver.length(Number(settings.elasticAveragingDepth)),
        "analysisSettings.elasticAveragingDepth",
      );
  return {
    maximumSublayerThickness,
    convergenceTolerance,
    maximumRefinements,
    embedmentContact,
    elasticAveragingDepth,
  };
}

function resolvedPorePressureField(groundModel, designSituation) {
  const id = designSituation.spatialSelection.porePressureFieldId;
  return id == null ? groundModel.getPorePressureField() :
    groundModel.getPorePressureField(id);
}

function waterContext({ profile, porePressureField, x }) {
  if (porePressureField?.model === "assigned-grid") {
    throw new NotSupportedError(
      "Assigned-grid pore pressure does not identify the saturated unit-weight field required by the settlement stress integration.",
    );
  }
  if (
    porePressureField &&
    ["hydrostatic-horizontal", "phreatic-line"].includes(
      porePressureField.model,
    )
  ) {
    return {
      waterElevation: porePressureField.waterElevationAt(x),
      waterUnitWeight: porePressureField.waterUnitWeight,
      source: `pore-pressure-field:${porePressureField.id}`,
    };
  }
  if (profile.groundwater.model === "hydrostatic") {
    return {
      waterElevation: profile.groundwater.waterTableElevation,
      waterUnitWeight: profile.groundwater.waterUnitWeight,
      source: `ground-profile:${profile.id}`,
    };
  }
  return { waterElevation: null, waterUnitWeight: null, source: "none" };
}

function porePressureAt({ porePressureField, water, x, elevation }) {
  if (porePressureField) {
    return porePressureField.porePressureAt({ x, z: elevation });
  }
  if (water.waterElevation == null) return 0;
  return water.waterUnitWeight * Math.max(
    water.waterElevation - elevation,
    0,
  );
}

function totalVerticalStressAt({
  groundModel,
  profile,
  elevation,
  water,
  preexistingSurfaceSurcharge,
}) {
  if (elevation > profile.groundSurfaceElevation + TOLERANCE) {
    throw new Error("Stress evaluation elevation lies above the ground surface.");
  }
  if (elevation < profile.bottomElevation - TOLERANCE) {
    throw new NotSupportedError(
      `GroundProfile ${profile.id} does not extend to elevation ${elevation}.`,
    );
  }
  let stress = preexistingSurfaceSurcharge;
  for (const layer of profile.layers) {
    const top = Math.min(layer.topElevation, profile.groundSurfaceElevation);
    const bottom = Math.max(layer.bottomElevation, elevation);
    if (bottom >= top - TOLERANCE) continue;
    const material = groundModel.getMaterial(layer.materialId);
    const breakpoints = [top, bottom];
    if (
      water.waterElevation != null &&
      water.waterElevation < top - TOLERANCE &&
      water.waterElevation > bottom + TOLERANCE
    ) {
      breakpoints.push(water.waterElevation);
    }
    breakpoints.sort((left, right) => right - left);
    for (let index = 0; index < breakpoints.length - 1; index += 1) {
      const segmentTop = breakpoints[index];
      const segmentBottom = breakpoints[index + 1];
      const midpoint = (segmentTop + segmentBottom) / 2;
      const saturated = water.waterElevation != null &&
        midpoint < water.waterElevation;
      const unitWeight = saturated
        ? material.unitWeight.saturated
        : material.unitWeight.bulk;
      if (unitWeight == null) {
        throw new NotSupportedError(
          `Material ${material.id} requires saturated unit weight below the water surface.`,
        );
      }
      stress += unitWeight * (segmentTop - segmentBottom);
    }
    if (layer.bottomElevation <= elevation + TOLERANCE) break;
  }
  return stress;
}

function initialEffectiveStressAt(input) {
  const totalStress = totalVerticalStressAt(input);
  const pressure = porePressureAt({
    porePressureField: input.porePressureField,
    water: input.water,
    x: input.x,
    elevation: input.elevation,
  });
  return {
    totalStress,
    porePressure: pressure,
    effectiveStress: totalStress - pressure,
  };
}

function settlementFootprint(foundation, effectiveGeometry) {
  if (foundation.shape === "strip") {
    return {
      width: effectiveGeometry.effectiveWidth,
      length: null,
      area: null,
      areaPerUnitLength: effectiveGeometry.effectiveAreaPerUnitLength,
      lengthToWidthRatio: Infinity,
    };
  }
  return {
    width: effectiveGeometry.effectiveWidth,
    length: effectiveGeometry.effectiveLength,
    area: effectiveGeometry.effectiveArea,
    areaPerUnitLength: null,
    lengthToWidthRatio:
      effectiveGeometry.effectiveLength / effectiveGeometry.effectiveWidth,
  };
}

function equivalentPressure({ foundation, effectiveGeometry, porePressure }) {
  const vertical = effectiveGeometry.actions.vertical;
  const loadedMeasure = foundation.shape === "strip"
    ? effectiveGeometry.effectiveAreaPerUnitLength
    : effectiveGeometry.effectiveArea;
  return {
    vertical,
    loadedMeasure,
    grossTotalPressure: vertical / loadedMeasure,
    grossEffectivePressure: vertical / loadedMeasure - porePressure,
  };
}

function sublayerBoundaries({
  profile,
  baseElevation,
  influenceDepth,
  maximumThickness,
  specialDepths = [],
}) {
  const bottomElevation = baseElevation - influenceDepth;
  if (bottomElevation < profile.bottomElevation - TOLERANCE) {
    throw new NotSupportedError(
      `GroundProfile ${profile.id} must extend at least ${influenceDepth} m below the foundation base.`,
    );
  }
  const boundaries = [0, influenceDepth];
  for (const depth of specialDepths) {
    if (depth > TOLERANCE && depth < influenceDepth - TOLERANCE) {
      boundaries.push(depth);
    }
  }
  for (const layer of profile.layers) {
    const depth = baseElevation - layer.bottomElevation;
    if (depth > TOLERANCE && depth < influenceDepth - TOLERANCE) {
      boundaries.push(depth);
    }
  }
  boundaries.sort((left, right) => left - right);
  const unique = boundaries.filter((value, index) =>
    index === 0 || Math.abs(value - boundaries[index - 1]) > TOLERANCE);
  const refined = [unique[0]];
  for (let index = 0; index < unique.length - 1; index += 1) {
    const start = unique[index];
    const end = unique[index + 1];
    const count = Math.max(1, Math.ceil((end - start) / maximumThickness));
    for (let segment = 1; segment <= count; segment += 1) {
      refined.push(start + (end - start) * segment / count);
    }
  }
  return refined;
}

function resolveSublayer({
  groundModel,
  designSituation,
  profile,
  baseElevation,
  depthTop,
  depthBottom,
  cache,
}) {
  const depthMidpoint = (depthTop + depthBottom) / 2;
  const elevation = baseElevation - depthMidpoint;
  const layer = profile.getLayerAtElevation(elevation);
  let resolved = cache.get(layer.id);
  if (!resolved) {
    resolved = designSituation.resolveDeformationParameterSet({
      groundModel,
      layerId: layer.id,
    });
    cache.set(layer.id, resolved);
  }
  return {
    depthTop,
    depthBottom,
    depthMidpoint,
    thickness: depthBottom - depthTop,
    elevation,
    layer,
    resolved,
  };
}

function relativeChange(current, previous) {
  return Math.abs(current - previous) / Math.max(Math.abs(current), 1e-12);
}

function integrateWithConvergence({
  groundModel,
  designSituation,
  profile,
  baseElevation,
  influenceDepth,
  initialMaximumThickness,
  specialDepths,
  convergenceTolerance,
  maximumRefinements,
  contribution,
}) {
  let previous = null;
  let last = null;
  const history = [];
  for (let refinement = 0; refinement <= maximumRefinements; refinement += 1) {
    const maximumThickness = initialMaximumThickness / 2 ** refinement;
    const boundaries = sublayerBoundaries({
      profile,
      baseElevation,
      influenceDepth,
      maximumThickness,
      specialDepths,
    });
    const cache = new Map();
    const sublayers = [];
    let settlement = 0;
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const sublayer = resolveSublayer({
        groundModel,
        designSituation,
        profile,
        baseElevation,
        depthTop: boundaries[index],
        depthBottom: boundaries[index + 1],
        cache,
      });
      const evaluated = contribution(sublayer);
      settlement += evaluated.settlement;
      sublayers.push({ ...sublayer, ...evaluated });
    }
    const change = previous == null ? null : relativeChange(settlement, previous);
    history.push({ refinement, maximumThickness, settlement, relativeChange: change });
    last = { settlement, sublayers, maximumThickness, change };
    if (change != null && change <= convergenceTolerance) {
      return {
        ...last,
        convergence: {
          converged: true,
          tolerance: convergenceTolerance,
          iterations: refinement + 1,
          relativeChange: change,
          history,
        },
      };
    }
    previous = settlement;
  }
  return {
    ...last,
    convergence: {
      converged: false,
      tolerance: convergenceTolerance,
      iterations: history.length,
      relativeChange: last.change,
      history,
    },
  };
}

/**
 * Approximate Boussinesq influence factors from USACE EM 1110-1-1905,
 * equations 6-8 through 6-11. Dimensions and depth use any consistent unit.
 */
export function calculateShallowFoundationVerticalStressInfluence({
  shape,
  width,
  length = null,
  depth,
} = {}) {
  const B = positive(width, "width");
  const z = nonNegative(depth, "depth");
  if (z <= TOLERANCE * Math.max(B, 1)) return 1;
  const normalizedShape = shape === "rectangular" && length != null &&
      Math.abs(length / B - 1) <= TOLERANCE
    ? "square"
    : shape;
  const ratio = B / (2 * z);
  if (normalizedShape === "circular") {
    return 1 - (1 / (1 + ratio ** 2)) ** 1.5;
  }
  if (normalizedShape === "square") {
    return 1 - (1 / (1 + ratio ** 2)) ** 1.76;
  }
  if (normalizedShape === "strip") {
    return 1 - (1 / (1 + ratio ** 1.38)) ** 2.6;
  }
  if (normalizedShape !== "rectangular") {
    throw new Error(`Unsupported influence-factor shape: ${shape}.`);
  }
  const L = positive(length, "length");
  const widthToLength = B / L;
  return 1 - (
    1 / (1 + ratio ** (1.38 + 0.62 * widthToLength))
  ) ** (2.6 - 0.84 * widthToLength);
}

/** Schmertmann et al. (1978) strain influence, USACE equations 7-19--7-23. */
export function calculateSchmertmannStrainInfluence({
  depth,
  width,
  lengthToWidthRatio,
  peakInfluence,
} = {}) {
  const z = nonNegative(depth, "depth");
  const B = positive(width, "width");
  const peak = positive(peakInfluence, "peakInfluence");
  const ratio = Math.min(
    Math.max(positive(lengthToWidthRatio, "lengthToWidthRatio"), 1),
    10,
  );
  const normalizedDepth = z / B;
  const axisymmetric = normalizedDepth <= 0.5
    ? 0.1 + normalizedDepth * (2 * peak - 0.2)
    : normalizedDepth <= 2
      ? 0.667 * peak * (2 - normalizedDepth)
      : 0;
  const planeStrain = normalizedDepth <= 1
    ? 0.2 + normalizedDepth * (peak - 0.2)
    : normalizedDepth <= 4
      ? 0.331 * peak * (4 - normalizedDepth)
      : 0;
  const interpolation = 0.111 * (ratio - 1);
  return {
    axisymmetric: Math.max(axisymmetric, 0),
    planeStrain: Math.max(planeStrain, 0),
    rectangular: Math.max(
      axisymmetric + interpolation * (planeStrain - axisymmetric),
      0,
    ),
    interpolation,
  };
}

/**
 * Static stiffness of a rigid rectangular footing on an elastic half-space.
 * B and L in the cited equations are half-width and half-length.
 */
export function calculateRigidFoundationElasticStiffness({
  width,
  length,
  embedmentDepth = 0,
  shearModulus,
  poissonRatio,
  embedmentContact = "surface-equivalent",
} = {}) {
  const fullWidth = positive(width, "width");
  const fullLength = positive(length, "length");
  if (fullWidth > fullLength) {
    throw new Error("Rigid-foundation stiffness requires width <= length.");
  }
  const G = positive(shearModulus, "shearModulus");
  const nu = finite(poissonRatio, "poissonRatio");
  if (nu < 0 || nu >= 0.5) {
    throw new Error("poissonRatio must satisfy 0 <= value < 0.5.");
  }
  const D = nonNegative(embedmentDepth, "embedmentDepth");
  if (!["surface-equivalent", "full-sidewall-contact"].includes(
    embedmentContact,
  )) {
    throw new Error(`Unsupported embedmentContact: ${embedmentContact}.`);
  }
  const B = fullWidth / 2;
  const L = fullLength / 2;
  const ratio = L / B;
  const surface = {
    vertical: G * B / (1 - nu) * (3.1 * ratio ** 0.75 + 1.6),
    rockingAboutShortAxis:
      G * B ** 3 / (1 - nu) * (3.73 * ratio ** 2.4 + 0.27),
    rockingAboutLongAxis:
      G * B ** 3 / (1 - nu) * (3.2 * ratio + 0.8),
  };
  const depthRatio = D / B;
  const modifiers = embedmentContact === "full-sidewall-contact"
    ? {
        vertical: 1 + (0.25 + 0.25 / ratio) * depthRatio ** 0.8,
        rockingAboutShortAxis: 1 + depthRatio +
          1.6 / (0.35 + ratio ** 4) * depthRatio ** 2,
        rockingAboutLongAxis: 1 + depthRatio +
          1.6 / (0.35 + ratio) * depthRatio ** 2,
      }
    : {
        vertical: 1,
        rockingAboutShortAxis: 1,
        rockingAboutLongAxis: 1,
      };
  return {
    halfWidth: B,
    halfLength: L,
    lengthToWidthRatio: ratio,
    surface,
    embedmentModifiers: modifiers,
    stiffness: {
      vertical: surface.vertical * modifiers.vertical,
      rockingAboutShortAxis:
        surface.rockingAboutShortAxis * modifiers.rockingAboutShortAxis,
      rockingAboutLongAxis:
        surface.rockingAboutLongAxis * modifiers.rockingAboutLongAxis,
    },
    embedmentContact,
    reference: NIST_REFERENCE,
  };
}

function parameterValidity({ parameterSet, stress, strain }) {
  const warnings = [];
  let withinRange = true;
  if (
    parameterSet.stressRange &&
    (stress < parameterSet.stressRange[0] - TOLERANCE ||
      stress > parameterSet.stressRange[1] + TOLERANCE)
  ) {
    withinRange = false;
    warnings.push(
      `Stress ${stress} lies outside the stated range for deformation set ${parameterSet.id}.`,
    );
  }
  if (
    parameterSet.strainRange &&
    (strain < parameterSet.strainRange[0] - TOLERANCE ||
      strain > parameterSet.strainRange[1] + TOLERANCE)
  ) {
    withinRange = false;
    warnings.push(
      `Strain ${strain} lies outside the stated range for deformation set ${parameterSet.id}.`,
    );
  }
  return { withinRange, warnings };
}

function commonSettlementContext({
  groundModel,
  designSituation,
  foundation,
  actionState,
  effectiveGeometry,
  preexistingSurfaceSurcharge,
}) {
  const profile = groundModel.getProfile(
    designSituation.spatialSelection.profileId,
  );
  if (!profile) {
    throw new NotSupportedError(
      "Shallow-foundation settlement requires a GroundProfile.",
    );
  }
  const baseElevation = foundation.placement.baseElevation;
  const embedmentDepth = profile.groundSurfaceElevation - baseElevation;
  if (embedmentDepth < -TOLERANCE) {
    throw new NotSupportedError(
      "The foundation base lies above the selected ground surface.",
    );
  }
  const porePressureField = resolvedPorePressureField(
    groundModel,
    designSituation,
  );
  const water = waterContext({
    profile,
    porePressureField,
    x: foundation.placement.x,
  });
  const baseStress = initialEffectiveStressAt({
    groundModel,
    profile,
    porePressureField,
    water,
    x: foundation.placement.x,
    elevation: baseElevation,
    preexistingSurfaceSurcharge,
  });
  const pressure = equivalentPressure({
    foundation,
    effectiveGeometry,
    porePressure: baseStress.porePressure,
  });
  const netFoundationPressure =
    pressure.grossEffectivePressure - baseStress.effectiveStress;
  if (netFoundationPressure <= TOLERANCE) {
    throw new NotSupportedError(
      "Net foundation pressure is non-positive; excavation rebound or uplift requires a different workflow.",
    );
  }
  return {
    profile,
    porePressureField,
    water,
    baseElevation,
    embedmentDepth,
    baseStress,
    pressure,
    netFoundationPressure,
    preexistingSurfaceSurcharge,
    footprint: settlementFootprint(foundation, effectiveGeometry),
  };
}

function analyzeSchmertmann({
  groundModel,
  designSituation,
  foundation,
  context,
  settings,
}) {
  if (foundation.shape === "circular" &&
      context.footprint.lengthToWidthRatio > 1 + 1e-8) {
    throw new NotSupportedError(
      "Eccentric circular foundations are outside the current Schmertmann shape interpolation.",
    );
  }
  const B = context.footprint.width;
  const rawRatio = foundation.shape === "strip"
    ? 10
    : Math.min(Math.max(context.footprint.lengthToWidthRatio, 1), 10);
  const shapeInterpolation = (rawRatio - 1) / 9;
  const peakDepth = B * (0.5 + 0.5 * shapeInterpolation);
  const peakStress = initialEffectiveStressAt({
    groundModel,
    profile: context.profile,
    porePressureField: context.porePressureField,
    water: context.water,
    x: foundation.placement.x,
    elevation: context.baseElevation - peakDepth,
    preexistingSurfaceSurcharge: context.preexistingSurfaceSurcharge,
  });
  if (peakStress.effectiveStress <= TOLERANCE) {
    throw new NotSupportedError(
      "The initial effective stress at the Schmertmann peak depth must be positive.",
    );
  }
  const peakInfluence = 0.5 + 0.1 * Math.sqrt(
    context.netFoundationPressure / peakStress.effectiveStress,
  );
  const embedmentFactor = Math.max(
    1 - 0.5 * context.baseStress.effectiveStress /
      context.netFoundationPressure,
    0.5,
  );
  const influenceDepth = rawRatio <= 1 + TOLERANCE ? 2 * B : 4 * B;
  const integration = integrateWithConvergence({
    groundModel,
    designSituation,
    profile: context.profile,
    baseElevation: context.baseElevation,
    influenceDepth,
    initialMaximumThickness: settings.maximumSublayerThickness,
    specialDepths: [0.5 * B, B, 2 * B, 4 * B],
    convergenceTolerance: settings.convergenceTolerance,
    maximumRefinements: settings.maximumRefinements,
    contribution: (sublayer) => {
      const parameterSet = sublayer.resolved.parameterSet;
      if (parameterSet.model !== "schmertmann-cpt") {
        throw new NotSupportedError(
          `Layer ${sublayer.layer.id} requires a schmertmann-cpt deformation set.`,
        );
      }
      const equivalentYoungModulus =
        (2.5 + shapeInterpolation) * parameterSet.coneTipResistance;
      const influence = calculateSchmertmannStrainInfluence({
        depth: sublayer.depthMidpoint,
        width: B,
        lengthToWidthRatio: rawRatio,
        peakInfluence,
      });
      const inducedStrain = embedmentFactor * context.netFoundationPressure *
        influence.rectangular / equivalentYoungModulus;
      const validity = parameterValidity({
        parameterSet,
        stress: context.netFoundationPressure,
        strain: inducedStrain,
      });
      return {
        materialId: sublayer.resolved.materialId,
        deformationParameterSetId: parameterSet.id,
        coneTipResistance: parameterSet.coneTipResistance,
        equivalentYoungModulus,
        strainInfluence: influence,
        inducedVerticalStrain: inducedStrain,
        settlement: inducedStrain * sublayer.thickness,
        parameterValidity: validity,
      };
    },
  });
  const warnings = integration.sublayers.flatMap(
    ({ parameterValidity: validity }) => validity.warnings,
  );
  return {
    method: "usace-schmertmann-cpt-2025",
    settlement: integration.settlement,
    rotation: null,
    localResponse: "perfectly-flexible-loaded-area-centerline",
    settlementComponent: "immediate",
    influenceDepth,
    factors: {
      peakDepth,
      peakInitialEffectiveStress: peakStress.effectiveStress,
      peakInfluence,
      embedmentFactor,
      timeFactor: 1,
      lengthToWidthRatio: rawRatio,
      shapeInterpolation,
    },
    sublayers: integration.sublayers,
    convergence: integration.convergence,
    parameterRangeVerified: warnings.length === 0,
    warnings,
    reference: USACE_REFERENCE,
    timeEffects: {
      status: "not-included",
      note: "The USACE C2 creep factor is fixed to 1.0 in this immediate-settlement workflow.",
    },
  };
}

function analyzeConstrainedModulus({
  groundModel,
  designSituation,
  foundation,
  context,
  settings,
}) {
  if (foundation.shape === "circular" &&
      context.footprint.lengthToWidthRatio > 1 + 1e-8) {
    throw new NotSupportedError(
      "Eccentric circular foundations are outside the current constrained-modulus influence formula.",
    );
  }
  const B = context.footprint.width;
  const influenceDepth = foundation.shape === "strip" ? 6 * B : 2 * B;
  const integration = integrateWithConvergence({
    groundModel,
    designSituation,
    profile: context.profile,
    baseElevation: context.baseElevation,
    influenceDepth,
    initialMaximumThickness: settings.maximumSublayerThickness,
    specialDepths: [],
    convergenceTolerance: settings.convergenceTolerance,
    maximumRefinements: settings.maximumRefinements,
    contribution: (sublayer) => {
      const parameterSet = sublayer.resolved.parameterSet;
      if (parameterSet.model !== "constrained-modulus") {
        throw new NotSupportedError(
          `Layer ${sublayer.layer.id} requires a constrained-modulus deformation set.`,
        );
      }
      if (parameterSet.settlementComponent !== "immediate") {
        throw new NotSupportedError(
          `Layer ${sublayer.layer.id} describes ${parameterSet.settlementComponent}; the time-dependent consolidation workflow is not implemented.`,
        );
      }
      const influence = calculateShallowFoundationVerticalStressInfluence({
        shape: foundation.shape,
        width: B,
        length: context.footprint.length,
        depth: sublayer.depthMidpoint,
      });
      const inducedStress = influence * context.netFoundationPressure;
      const inducedStrain = inducedStress / parameterSet.constrainedModulus;
      const validity = parameterValidity({
        parameterSet,
        stress: inducedStress,
        strain: inducedStrain,
      });
      return {
        materialId: sublayer.resolved.materialId,
        deformationParameterSetId: parameterSet.id,
        constrainedModulus: parameterSet.constrainedModulus,
        stressInfluence: influence,
        inducedVerticalStress: inducedStress,
        inducedVerticalStrain: inducedStrain,
        settlement: inducedStrain * sublayer.thickness,
        parameterValidity: validity,
      };
    },
  });
  const warnings = integration.sublayers.flatMap(
    ({ parameterValidity: validity }) => validity.warnings,
  );
  return {
    method: "usace-incremental-constrained-modulus-2025",
    settlement: integration.settlement,
    rotation: null,
    localResponse: "perfectly-flexible-loaded-area-centerline",
    settlementComponent: "immediate",
    influenceDepth,
    sublayers: integration.sublayers,
    convergence: integration.convergence,
    parameterRangeVerified: warnings.length === 0,
    warnings,
    reference: USACE_REFERENCE,
    timeEffects: {
      status: "not-included",
      note: "Only deformation sets explicitly classified as immediate are accepted.",
    },
  };
}

function sameElasticParameters(left, right) {
  const scale = Math.max(
    left.shearModulus,
    right.shearModulus,
    left.youngModulus,
    right.youngModulus,
    1,
  );
  return Math.abs(left.shearModulus - right.shearModulus) <= 1e-9 * scale &&
    Math.abs(left.youngModulus - right.youngModulus) <= 1e-9 * scale &&
    Math.abs(left.poissonRatio - right.poissonRatio) <= 1e-12;
}

function rigidCornerMovements({ foundation, settlement, rotationX, rotationY }) {
  const halfWidth = foundation.geometry.width / 2;
  const halfLength = foundation.geometry.length / 2;
  return [
    { id: "x-negative-y-negative", x: -halfWidth, y: -halfLength },
    { id: "x-positive-y-negative", x: halfWidth, y: -halfLength },
    { id: "x-positive-y-positive", x: halfWidth, y: halfLength },
    { id: "x-negative-y-positive", x: -halfWidth, y: halfLength },
  ].map((point) => ({
    ...point,
    settlement: settlement - rotationX * point.y + rotationY * point.x,
  }));
}

function analyzeElasticRigid({
  groundModel,
  designSituation,
  foundation,
  effectiveGeometry,
  context,
  settings,
}) {
  if (foundation.shape !== "rectangular") {
    throw new NotSupportedError(
      "The NIST/Pais-Kausel branch currently supports rectangular isolated foundations only.",
    );
  }
  if (effectiveGeometry.exactNoTensionKernUtilization > 1 + TOLERANCE) {
    throw new NotSupportedError(
      "NIST/Pais-Kausel uncoupled elastic stiffness requires full base contact; the resultant lies outside the no-tension kern.",
    );
  }
  const averagingDepth = settings.elasticAveragingDepth;
  const boundaries = sublayerBoundaries({
    profile: context.profile,
    baseElevation: context.baseElevation,
    influenceDepth: averagingDepth,
    maximumThickness: averagingDepth,
  });
  const cache = new Map();
  const resolved = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const sublayer = resolveSublayer({
      groundModel,
      designSituation,
      profile: context.profile,
      baseElevation: context.baseElevation,
      depthTop: boundaries[index],
      depthBottom: boundaries[index + 1],
      cache,
    });
    const parameterSet = sublayer.resolved.parameterSet;
    if (parameterSet.model !== "isotropic-elastic") {
      throw new NotSupportedError(
        `Layer ${sublayer.layer.id} requires an isotropic-elastic deformation set.`,
      );
    }
    if (parameterSet.settlementComponent !== "immediate") {
      throw new NotSupportedError(
        "The elastic rigid-foundation branch accepts immediate-response parameter sets only.",
      );
    }
    resolved.push({ ...sublayer, parameterSet });
  }
  const representative = resolved[0].parameterSet;
  if (!resolved.every(({ parameterSet }) =>
    sameElasticParameters(parameterSet, representative))) {
    throw new NotSupportedError(
      "NIST/Pais-Kausel static stiffness assumes a homogeneous equivalent half-space; selected elastic parameters vary within the averaging depth.",
    );
  }
  const stiffness = calculateRigidFoundationElasticStiffness({
    width: foundation.geometry.width,
    length: foundation.geometry.length,
    embedmentDepth: context.embedmentDepth,
    shearModulus: representative.shearModulus,
    poissonRatio: representative.poissonRatio,
    embedmentContact: settings.embedmentContact,
  });
  const originalArea = foundation.geometry.area;
  const grossTotalPressure = effectiveGeometry.actions.vertical / originalArea;
  const grossEffectivePressure = grossTotalPressure -
    context.baseStress.porePressure;
  const netFoundationPressure = grossEffectivePressure -
    context.baseStress.effectiveStress;
  if (netFoundationPressure <= TOLERANCE) {
    throw new NotSupportedError(
      "Net rigid-foundation pressure is non-positive; excavation rebound requires a different workflow.",
    );
  }
  const netVerticalForce = netFoundationPressure * originalArea;
  const actions = effectiveGeometry.actions;
  const settlement = netVerticalForce / stiffness.stiffness.vertical;
  const rotationX = actions.momentX /
    stiffness.stiffness.rockingAboutShortAxis;
  const rotationY = actions.momentY /
    stiffness.stiffness.rockingAboutLongAxis;
  const rotationMagnitude = Math.hypot(rotationX, rotationY);
  const strainEstimate = Math.max(
    settlement / foundation.geometry.width,
    Math.abs(rotationX),
    Math.abs(rotationY),
  );
  const validity = parameterValidity({
    parameterSet: representative,
    stress: netFoundationPressure,
    strain: strainEstimate,
  });
  const warnings = [...validity.warnings];
  if (representative.modulusDefinition === "small-strain") {
    warnings.push(
      "A small-strain modulus was supplied without an explicit strain-compatible reduction; SLS movements may be underestimated.",
    );
  }
  return {
    method: "nist-pais-kausel-elastic-2012",
    settlement,
    rotation: {
      x: rotationX,
      y: rotationY,
      magnitude: rotationMagnitude,
      signConvention: "right-hand-rule-about-local-axis",
    },
    cornerMovements: rigidCornerMovements({
      foundation,
      settlement,
      rotationX,
      rotationY,
    }),
    localResponse: "rigid-foundation-uncoupled-static-stiffness",
    settlementComponent: "immediate",
    stiffness,
    pressure: {
      vertical: effectiveGeometry.actions.vertical,
      loadedMeasure: originalArea,
      grossTotalPressure,
      grossEffectivePressure,
      netFoundationPressure,
    },
    netVerticalForce,
    representativeDeformationParameterSet: structuredClone(representative),
    averagingDepth,
    selectedLayers: resolved.map(({ layer, resolved: selection }) => ({
      layerId: layer.id,
      materialId: selection.materialId,
      deformationParameterSetId: selection.parameterSetId,
    })),
    convergence: null,
    parameterRangeVerified:
      validity.withinRange && representative.modulusDefinition !== "small-strain",
    warnings,
    reference: NIST_REFERENCE,
    timeEffects: {
      status: "not-included",
      note: "Static strain-compatible or secant elastic response only.",
    },
  };
}

function movementChecks({ methodResult, effectiveGeometry, criteria }) {
  const checks = [{
    id: "full-compression-kern",
    status: effectiveGeometry.exactNoTensionKernUtilization <= 1 + TOLERANCE
      ? "ok"
      : "failed",
    ok: effectiveGeometry.exactNoTensionKernUtilization <= 1 + TOLERANCE,
    demand: effectiveGeometry.exactNoTensionKernUtilization,
    capacity: 1,
    utilizationRatio: effectiveGeometry.exactNoTensionKernUtilization,
  }];
  if (methodResult.convergence) {
    checks.push({
      id: "settlement-integration-convergence",
      status: methodResult.convergence.converged ? "ok" : "failed",
      ok: methodResult.convergence.converged,
      demand: methodResult.convergence.relativeChange,
      capacity: methodResult.convergence.tolerance,
      utilizationRatio: methodResult.convergence.relativeChange == null
        ? null
        : methodResult.convergence.relativeChange /
          methodResult.convergence.tolerance,
    });
  }
  if (criteria.maximumSettlement != null) {
    checks.push({
      id: "maximum-settlement",
      status: methodResult.settlement <= criteria.maximumSettlement
        ? "ok"
        : "failed",
      ok: methodResult.settlement <= criteria.maximumSettlement,
      demand: methodResult.settlement,
      capacity: criteria.maximumSettlement,
      utilizationRatio: methodResult.settlement / criteria.maximumSettlement,
    });
  }
  if (criteria.maximumRotation != null) {
    if (!methodResult.rotation) {
      throw new NotSupportedError(
        "A maximum rotation criterion requires the NIST/Pais-Kausel rigid-foundation method in this increment.",
      );
    }
    checks.push({
      id: "maximum-rotation",
      status: methodResult.rotation.magnitude <= criteria.maximumRotation
        ? "ok"
        : "failed",
      ok: methodResult.rotation.magnitude <= criteria.maximumRotation,
      demand: methodResult.rotation.magnitude,
      capacity: criteria.maximumRotation,
      utilizationRatio:
        methodResult.rotation.magnitude / criteria.maximumRotation,
    });
  }
  return checks;
}

function movementState({ foundation, actionState, methodResult }) {
  return {
    schemaVersion: "shallow-foundation-movement-state/v1",
    foundationId: foundation.id,
    actionStateId: actionState.id,
    placement: { ...foundation.placement },
    settlement: methodResult.settlement,
    rotation: methodResult.rotation
      ? { ...methodResult.rotation }
      : { status: "not-evaluated", x: null, y: null, magnitude: null },
    method: methodResult.method,
    referencePoint: "foundation-base-center",
    verticalConvention: "settlement-positive-downward",
    units: { ...GEOTECHNICAL_INTERNAL_UNITS },
  };
}

export class ShallowFoundationServiceabilityAnalysis {
  analyze({
    groundModel: groundModelInput,
    designSituation: designSituationInput,
    foundation: foundationInput,
    actionState: actionStateInput,
    method,
    preexistingSurfaceSurcharge = 0,
    criteria = {},
    analysisSettings = {},
    units = null,
  } = {}) {
    try {
      assertExplicitUnitSystem(units, "ShallowFoundationServiceabilityAnalysis");
      const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
      if (!SHALLOW_FOUNDATION_SETTLEMENT_METHODS.includes(method)) {
        throw new Error(`Unsupported shallow-foundation SLS method: ${method}.`);
      }
      const groundModel = normalizeGroundModel(groundModelInput, units);
      const designSituation = normalizeDesignSituation(
        designSituationInput,
        groundModel,
        units,
      );
      designSituation.validateAgainst(groundModel);
      if (designSituation.limitState !== "SLS") {
        throw new Error("Shallow-foundation serviceability requires limitState SLS.");
      }
      if (designSituation.seismic.model !== "none") {
        throw new NotSupportedError(
          "Seismic settlement is outside the static SLS workflow.",
        );
      }
      if (designSituation.timeCondition === "long-term") {
        throw new NotSupportedError(
          "Long-term settlement requires the separate consolidation and creep workflow.",
        );
      }
      const foundation = normalizeFoundation(foundationInput, units);
      const actionState = normalizeActions(actionStateInput, units);
      const effectiveGeometry =
        calculateShallowFoundationEffectiveGeometry({
          foundation,
          actionState,
        });
      const referenceWidth = method === "nist-pais-kausel-elastic-2012" &&
          foundation.shape === "rectangular"
        ? foundation.geometry.width
        : effectiveGeometry.effectiveWidth;
      const normalizedSettings = normalizeSettings(
        analysisSettings,
        resolver,
        referenceWidth,
      );
      const normalizedCriteria = normalizeCriteria(criteria, resolver);
      const surcharge = nonNegative(
        resolver.stress(Number(preexistingSurfaceSurcharge)),
        "preexistingSurfaceSurcharge",
      );
      const context = commonSettlementContext({
        groundModel,
        designSituation,
        foundation,
        actionState,
        effectiveGeometry,
        preexistingSurfaceSurcharge: surcharge,
      });
      let methodResult;
      if (method === "usace-schmertmann-cpt-2025") {
        methodResult = analyzeSchmertmann({
          groundModel,
          designSituation,
          foundation,
          context,
          settings: normalizedSettings,
        });
      } else if (
        method === "usace-incremental-constrained-modulus-2025"
      ) {
        methodResult = analyzeConstrainedModulus({
          groundModel,
          designSituation,
          foundation,
          context,
          settings: normalizedSettings,
        });
      } else {
        methodResult = analyzeElasticRigid({
          groundModel,
          designSituation,
          foundation,
          effectiveGeometry,
          context,
          settings: normalizedSettings,
        });
      }
      const checks = movementChecks({
        methodResult,
        effectiveGeometry,
        criteria: normalizedCriteria,
      });
      const warnings = [...new Set([
        ...methodResult.warnings,
        ...(designSituation.timeCondition === "not-specified"
          ? [
              "The design situation has no time condition; the result is limited to the explicitly immediate response.",
            ]
          : []),
        ...(effectiveGeometry.exactNoTensionKernUtilization > 1 + TOLERANCE
          ? [
              "The resultant lies outside the no-tension kern; the equivalent-area settlement remains an estimate and full contact is not verified.",
            ]
          : []),
        ...(effectiveGeometry.actions.horizontalMagnitude > TOLERANCE
          ? [
              "Horizontal actions are retained in the action state but lateral SLS movement is not evaluated.",
            ]
          : []),
      ])];
      const utilizationRatios = checks
        .map(({ utilizationRatio }) => utilizationRatio)
        .filter(Number.isFinite);
      const notVerified = checks.some(({ ok }) => ok === false) ||
        !methodResult.parameterRangeVerified;
      const state = movementState({ foundation, actionState, methodResult });
      const outputs = {
        schemaVersion: SHALLOW_FOUNDATION_SLS_RESULT_SCHEMA_VERSION,
        foundation: foundation.toJSON(),
        actionState: actionState.toJSON(),
        designSituation: designSituation.toJSON(),
        method,
        effectiveGeometry,
        stressAtBase: {
          preexistingSurfaceSurcharge: surcharge,
          ...context.baseStress,
          ...(methodResult.pressure ?? context.pressure),
          netFoundationPressure: methodResult.pressure?.netFoundationPressure ??
            context.netFoundationPressure,
        },
        groundwater: {
          source: context.water.source,
          waterElevation: context.water.waterElevation,
          waterUnitWeight: context.water.waterUnitWeight,
        },
        settlement: {
          value: methodResult.settlement,
          component: methodResult.settlementComponent,
          method: methodResult.method,
          localResponse: methodResult.localResponse,
          timeEffects: methodResult.timeEffects,
        },
        rotation: methodResult.rotation ?? {
          status: "not-evaluated-by-selected-method",
          x: null,
          y: null,
          magnitude: null,
        },
        cornerMovements: methodResult.cornerMovements ?? [],
        methodResult,
        movementState: state,
        checks,
        demand: {
          settlement: methodResult.settlement,
          rotation: methodResult.rotation?.magnitude ?? null,
        },
        capacity: {
          maximumSettlement: normalizedCriteria.maximumSettlement,
          maximumRotation: normalizedCriteria.maximumRotation,
        },
        utilizationRatio: utilizationRatios.length > 0
          ? Math.max(...utilizationRatios)
          : null,
        structuralCoupling: {
          movementState: state,
          staticSecantStiffness: methodResult.stiffness?.stiffness ?? null,
          stiffnessStatus: methodResult.stiffness
            ? "available-for-rigid-point-support-model"
            : "not-derived-from-a-single-settlement-value",
          contactModel: methodResult.stiffness
            ? "full-contact-rigid-foundation"
            : "flexible-equivalent-loaded-area",
          femLimit: methodResult.stiffness
            ? "Uncoupled elastic half-space stiffness is not a nonlinear contact or continuum model."
            : "A single centerline settlement must not be converted automatically into distributed springs.",
        },
        units: { ...GEOTECHNICAL_INTERNAL_UNITS },
      };
      return result({
        status: notVerified ? "not-verified" : "ok",
        summary: notVerified
          ? "Static shallow-foundation SLS movement calculated with one or more limitations or failed explicit checks."
          : "Static shallow-foundation SLS movement calculated.",
        outputs,
        warnings,
        assumptions: [
          "Static loading and small movements.",
          "Foundation actions are resultants at the base and include applicable permanent foundation weight.",
          "Consolidation, creep, excavation rebound and seismic settlement are excluded.",
          methodResult.localResponse ===
              "rigid-foundation-uncoupled-static-stiffness"
            ? "The selected elastic parameters represent a homogeneous equivalent half-space over the declared averaging depth."
            : "The stress/strain settlement method represents a perfectly flexible equivalent loaded area at its centerline.",
        ],
        metadata: {
          method,
          references: method === "nist-pais-kausel-elastic-2012"
            ? [NIST_REFERENCE]
            : [USACE_REFERENCE],
          unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
          sourceUnitSystem: resolver.sourceUnitSystem,
        },
      });
    } catch (error) {
      if (error instanceof NotSupportedError) {
        return result({
          status: "not-supported",
          summary: "The requested shallow-foundation SLS case is outside the implemented method.",
          warnings: [error.message],
          metadata: {
            schemaVersion: SHALLOW_FOUNDATION_SLS_RESULT_SCHEMA_VERSION,
            method: method ?? null,
          },
        });
      }
      return result({
        status: "failed",
        summary: "Shallow-foundation SLS analysis failed.",
        warnings: [error instanceof Error ? error.message : String(error)],
        metadata: {
          schemaVersion: SHALLOW_FOUNDATION_SLS_RESULT_SCHEMA_VERSION,
          method: method ?? null,
        },
      });
    }
  }
}

export function calculateShallowFoundationDifferentialMovement({
  firstMovement,
  secondMovement,
  horizontalDistance = null,
  criteria = {},
  units = null,
} = {}) {
  assertExplicitUnitSystem(units, "calculateShallowFoundationDifferentialMovement");
  const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
  const firstResolver = createUnitResolver(
    firstMovement?.units ?? units,
    GEOTECHNICAL_INTERNAL_UNITS,
  );
  const secondResolver = createUnitResolver(
    secondMovement?.units ?? units,
    GEOTECHNICAL_INTERNAL_UNITS,
  );
  const firstSettlement = firstResolver.length(finite(
    firstMovement?.settlement,
    "firstMovement.settlement",
  ));
  const secondSettlement = secondResolver.length(finite(
    secondMovement?.settlement,
    "secondMovement.settlement",
  ));
  const firstX = firstResolver.length(finite(
    firstMovement?.placement?.x ?? 0,
    "firstMovement.placement.x",
  ));
  const firstY = firstResolver.length(finite(
    firstMovement?.placement?.y ?? 0,
    "firstMovement.placement.y",
  ));
  const secondX = secondResolver.length(finite(
    secondMovement?.placement?.x ?? 0,
    "secondMovement.placement.x",
  ));
  const secondY = secondResolver.length(finite(
    secondMovement?.placement?.y ?? 0,
    "secondMovement.placement.y",
  ));
  const dx = secondX - firstX;
  const dy = secondY - firstY;
  const distance = horizontalDistance == null
    ? Math.hypot(dx, dy)
    : positive(
        resolver.length(Number(horizontalDistance)),
        "horizontalDistance",
      );
  if (distance <= TOLERANCE) {
    throw new Error("Differential movement requires a positive support distance.");
  }
  const differentialSettlement = secondSettlement - firstSettlement;
  const angularDistortion = Math.abs(differentialSettlement) / distance;
  const maximumDifferentialSettlement =
    criteria.maximumDifferentialSettlement == null
      ? null
      : positive(
          resolver.length(Number(criteria.maximumDifferentialSettlement)),
          "criteria.maximumDifferentialSettlement",
        );
  const maximumAngularDistortion = criteria.maximumAngularDistortion == null
    ? null
    : positive(
        Number(criteria.maximumAngularDistortion),
        "criteria.maximumAngularDistortion",
      );
  const checks = [];
  if (maximumDifferentialSettlement != null) {
    checks.push({
      id: "maximum-differential-settlement",
      ok: Math.abs(differentialSettlement) <= maximumDifferentialSettlement,
      demand: Math.abs(differentialSettlement),
      capacity: maximumDifferentialSettlement,
      utilizationRatio:
        Math.abs(differentialSettlement) / maximumDifferentialSettlement,
    });
  }
  if (maximumAngularDistortion != null) {
    checks.push({
      id: "maximum-angular-distortion",
      ok: angularDistortion <= maximumAngularDistortion,
      demand: angularDistortion,
      capacity: maximumAngularDistortion,
      utilizationRatio: angularDistortion / maximumAngularDistortion,
    });
  }
  for (const check of checks) check.status = check.ok ? "ok" : "failed";
  const ratios = checks.map(({ utilizationRatio }) => utilizationRatio);
  return {
    schemaVersion: "shallow-foundation-differential-movement/v1",
    status: checks.some(({ ok }) => !ok) ? "not-verified" : "ok",
    firstFoundationId: firstMovement?.foundationId ?? null,
    secondFoundationId: secondMovement?.foundationId ?? null,
    supportDistance: distance,
    differentialSettlement,
    absoluteDifferentialSettlement: Math.abs(differentialSettlement),
    angularDistortion,
    checks,
    demand: {
      differentialSettlement: Math.abs(differentialSettlement),
      angularDistortion,
    },
    capacity: {
      maximumDifferentialSettlement,
      maximumAngularDistortion,
    },
    utilizationRatio: ratios.length > 0 ? Math.max(...ratios) : null,
    units: { ...GEOTECHNICAL_INTERNAL_UNITS },
  };
}
