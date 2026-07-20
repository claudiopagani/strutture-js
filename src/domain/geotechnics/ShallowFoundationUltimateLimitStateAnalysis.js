import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { GeotechnicalDesignSituation } from "./GeotechnicalDesignSituation.js";
import { GroundModel } from "./GroundModel.js";
import {
  SHALLOW_FOUNDATION_ACTION_BASES,
  ShallowFoundationActionState,
  ShallowFoundationModel,
} from "./ShallowFoundationModel.js";
import { SoilStructureInterface } from "./SoilStructureInterface.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const SHALLOW_FOUNDATION_ULS_RESULT_SCHEMA_VERSION =
  "shallow-foundation-uls-result/v1";

export const SHALLOW_FOUNDATION_BEARING_METHODS = Object.freeze([
  "usace-meyerhof-2025",
  "fhwa-vesic-2002",
]);

export const SHALLOW_FOUNDATION_BEARING_SELECTIONS = Object.freeze([
  "minimum",
  "mean",
  "usace-meyerhof-2025",
  "fhwa-vesic-2002",
]);

const USACE_REFERENCE =
  "USACE EM 1110-1-1905 (31 July 2025), Chapter 5, equations 5-2 through 5-30 and Tables 5-2 through 5-4";
const FHWA_REFERENCE =
  "FHWA GEC 6, FHWA-IF-02-054 (2002), Chapter 5";
const TOLERANCE = 1e-10;

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

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new Error(`${label} must be non-negative.`);
  return number;
}

function positiveOrNull(value, label) {
  if (value == null) return null;
  const number = finite(value, label);
  if (number <= 0) throw new Error(`${label} must be positive when supplied.`);
  return number;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
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

function validateActionBasis(foundation, actions) {
  const expected = foundation.shape === "strip" ? "per-unit-length" : "total";
  if (!SHALLOW_FOUNDATION_ACTION_BASES.includes(actions.basis)) {
    throw new Error(`Unsupported action basis: ${actions.basis}.`);
  }
  if (actions.basis !== expected) {
    throw new Error(
      `${foundation.shape} foundations require ${expected} actions.`,
    );
  }
}

function totalActionComponents(actions) {
  const values = actions.actions;
  return {
    vertical: values.verticalForce,
    horizontalX: values.horizontalX,
    horizontalY: values.horizontalY,
    horizontalMagnitude: Math.hypot(values.horizontalX, values.horizontalY),
    momentX: values.momentX,
    momentY: values.momentY,
  };
}

function stripActionComponents(actions) {
  const values = actions.actions;
  return {
    vertical: values.verticalForcePerUnitLength,
    horizontalX: values.horizontalForcePerUnitLength,
    horizontalY: 0,
    horizontalMagnitude: Math.abs(values.horizontalForcePerUnitLength),
    momentX: 0,
    momentY: values.momentPerUnitLength,
  };
}

/**
 * Converts base moments to the effective dimensions used by the cited bearing
 * capacity methods. All values must already be in the geotechnical internal
 * unit system (kN, m).
 */
export function calculateShallowFoundationEffectiveGeometry({
  foundation,
  actionState,
} = {}) {
  if (!(foundation instanceof ShallowFoundationModel)) {
    throw new Error("foundation must be a ShallowFoundationModel.");
  }
  if (!(actionState instanceof ShallowFoundationActionState)) {
    throw new Error("actionState must be a ShallowFoundationActionState.");
  }
  validateActionBasis(foundation, actionState);
  const actions = foundation.shape === "strip"
    ? stripActionComponents(actionState)
    : totalActionComponents(actionState);
  const vertical = actions.vertical;

  if (foundation.shape === "circular") {
    const diameter = foundation.geometry.diameter;
    const radius = diameter / 2;
    const momentMagnitude = Math.hypot(actions.momentX, actions.momentY);
    const eccentricity = momentMagnitude / vertical;
    if (eccentricity >= radius - TOLERANCE * Math.max(radius, 1)) {
      throw new Error(
        "The circular-foundation resultant lies at or outside the base radius; a positive effective area does not exist.",
      );
    }

    if (eccentricity <= TOLERANCE * Math.max(radius, 1)) {
      return {
        shape: foundation.shape,
        eccentricity,
        eccentricityX: actions.momentY / vertical,
        eccentricityY: actions.momentX / vertical,
        effectiveWidth: diameter,
        effectiveLength: diameter,
        effectiveArea: foundation.geometry.area,
        shapeRatio: 1,
        originalWidth: diameter,
        originalLength: diameter,
        originalArea: foundation.geometry.area,
        middleThirdUtilization: 0,
        exactNoTensionKernUtilization: 0,
        compressiveEquilibriumUtilization: 0,
        actions,
      };
    }

    const effectiveArea = 2 * (
      radius ** 2 * Math.acos(eccentricity / radius) -
      eccentricity * Math.sqrt(radius ** 2 - eccentricity ** 2)
    );
    const ellipseWidth = 2 * (radius - eccentricity);
    const ellipseLength = 2 * radius * Math.sqrt(
      1 - (1 - ellipseWidth / (2 * radius)) ** 2,
    );
    const effectiveLength = Math.sqrt(
      effectiveArea * ellipseLength / ellipseWidth,
    );
    const effectiveWidth = effectiveLength * ellipseWidth / ellipseLength;
    return {
      shape: foundation.shape,
      eccentricity,
      eccentricityX: actions.momentY / vertical,
      eccentricityY: actions.momentX / vertical,
      effectiveWidth,
      effectiveLength,
      effectiveArea,
      shapeRatio: effectiveWidth / effectiveLength,
      originalWidth: diameter,
      originalLength: diameter,
      originalArea: foundation.geometry.area,
      middleThirdUtilization: 6 * eccentricity / diameter,
      exactNoTensionKernUtilization: 8 * eccentricity / diameter,
      compressiveEquilibriumUtilization: eccentricity / radius,
      actions,
    };
  }

  const width = foundation.geometry.width;
  const eccentricityWidth = Math.abs(actions.momentY) / vertical;
  const effectiveWidthOnAxis = width - 2 * eccentricityWidth;
  if (effectiveWidthOnAxis <= TOLERANCE * Math.max(width, 1)) {
    throw new Error(
      "The foundation resultant lies at or outside the width edge; a positive effective width does not exist.",
    );
  }

  if (foundation.shape === "strip") {
    return {
      shape: foundation.shape,
      eccentricity: eccentricityWidth,
      eccentricityWidth,
      effectiveWidth: effectiveWidthOnAxis,
      effectiveLength: null,
      effectiveArea: null,
      effectiveAreaPerUnitLength: effectiveWidthOnAxis,
      shapeRatio: 0,
      originalWidth: width,
      originalLength: null,
      originalArea: null,
      middleThirdUtilization: 6 * eccentricityWidth / width,
      exactNoTensionKernUtilization: 6 * eccentricityWidth / width,
      compressiveEquilibriumUtilization: 2 * eccentricityWidth / width,
      actions,
    };
  }

  const length = foundation.geometry.length;
  const eccentricityLength = Math.abs(actions.momentX) / vertical;
  const effectiveLengthOnAxis = length - 2 * eccentricityLength;
  if (effectiveLengthOnAxis <= TOLERANCE * Math.max(length, 1)) {
    throw new Error(
      "The foundation resultant lies at or outside the length edge; a positive effective area does not exist.",
    );
  }

  const effectiveWidth = Math.min(
    effectiveWidthOnAxis,
    effectiveLengthOnAxis,
  );
  const effectiveLength = Math.max(
    effectiveWidthOnAxis,
    effectiveLengthOnAxis,
  );
  return {
    shape: foundation.shape,
    eccentricity: Math.hypot(eccentricityWidth, eccentricityLength),
    eccentricityWidth,
    eccentricityLength,
    effectiveWidthOnWidthAxis: effectiveWidthOnAxis,
    effectiveLengthOnLengthAxis: effectiveLengthOnAxis,
    effectiveWidth,
    effectiveLength,
    effectiveArea: effectiveWidthOnAxis * effectiveLengthOnAxis,
    shapeRatio: effectiveWidth / effectiveLength,
    originalWidth: width,
    originalLength: length,
    originalArea: foundation.geometry.area,
    middleThirdUtilization: Math.max(
      6 * eccentricityWidth / width,
      6 * eccentricityLength / length,
    ),
    exactNoTensionKernUtilization:
      6 * eccentricityWidth / width + 6 * eccentricityLength / length,
    compressiveEquilibriumUtilization: Math.max(
      2 * eccentricityWidth / width,
      2 * eccentricityLength / length,
    ),
    actions,
  };
}

function groundwaterCorrection({
  method,
  waterTableDepth,
  embedmentDepth,
  originalWidth,
}) {
  if (waterTableDepth == null) {
    return { factor: 1, model: "dry-or-water-below-shear-zone" };
  }
  if (method === "usace-meyerhof-2025") {
    return {
      factor: Math.min(
        0.45 + 0.55 * Math.max(waterTableDepth - embedmentDepth, 0) /
          originalWidth,
        1,
      ),
      model: "USACE-EM-1110-1-1905-equation-5-19",
    };
  }
  return {
    factor: Math.min(
      0.5 + 0.5 * waterTableDepth /
        (1.5 * originalWidth + embedmentDepth),
      1,
    ),
    model: "FHWA-GEC6-equation-5-20",
  };
}

function drainedFactors({
  method,
  strength,
  geometry,
  embedmentDepth,
  horizontalToVerticalRatio,
}) {
  const phi = strength.frictionAngle;
  const phiDegrees = phi * 180 / Math.PI;
  const sinPhi = Math.sin(phi);
  const flowNumber = (1 + sinPhi) / (1 - sinPhi);
  const nq = flowNumber * Math.exp(Math.PI * Math.tan(phi));
  const nc = phi > 1e-10
    ? (nq - 1) / Math.tan(phi)
    : 2 + Math.PI;
  const nGamma = method === "usace-meyerhof-2025"
    ? (nq - 1) * Math.tan(1.4 * phi)
    : 2 * (nq + 1) * Math.tan(phi);
  const ratio = geometry.shapeRatio;
  const depthRatio = embedmentDepth / geometry.effectiveWidth;
  const beta = Math.atan(horizontalToVerticalRatio);
  const betaDegrees = beta * 180 / Math.PI;

  if (method === "usace-meyerhof-2025") {
    const iq = clamp(1 - betaDegrees / 90) ** 2;
    const iGamma = phiDegrees <= TOLERANCE
      ? (betaDegrees <= TOLERANCE ? 1 : 0)
      : clamp(1 - betaDegrees / phiDegrees) ** 2;
    return {
      bearing: { flowNumber, nc, nq, nGamma },
      shape: {
        c: 1 + 0.2 * flowNumber * ratio,
        q: 1 + 0.1 * flowNumber * ratio,
        gamma: 1 + 0.1 * flowNumber * ratio,
      },
      depth: {
        c: 1 + 0.2 * Math.sqrt(flowNumber) * depthRatio,
        q: 1 + 0.1 * Math.sqrt(flowNumber) * depthRatio,
        gamma: 1 + 0.1 * Math.sqrt(flowNumber) * depthRatio,
      },
      inclination: {
        beta,
        c: iq,
        q: iq,
        gamma: iGamma,
        policy: "included-with-shape-per-usace-2025",
      },
    };
  }

  const dq = Math.min(
    1 + 2 * Math.tan(phi) * (1 - sinPhi) ** 2 * Math.atan(depthRatio),
    1.4,
  );
  return {
    bearing: { flowNumber, nc, nq, nGamma },
    shape: {
      c: 1 + ratio * nq / nc,
      q: 1 + ratio * Math.tan(phi),
      gamma: 1 - 0.4 * ratio,
    },
    depth: { c: 1, q: dq, gamma: 1 },
    inclination: {
      beta,
      c: 1,
      q: 1,
      gamma: 1,
      policy: "omitted-per-fhwa-2002-recommendation-when-shape-is-used",
    },
  };
}

function undrainedFactors({
  method,
  geometry,
  embedmentDepth,
  horizontalToVerticalRatio,
}) {
  const ratio = geometry.shapeRatio;
  const beta = Math.atan(horizontalToVerticalRatio);
  const inclination = method === "usace-meyerhof-2025"
    ? clamp(1 - 1.3 * horizontalToVerticalRatio)
    : 1;
  return {
    bearing: {
      flowNumber: 1,
      nc: 2 + Math.PI,
      nq: 1,
      nGamma: 0,
    },
    shape: { c: 1 + 0.2 * ratio, q: 1, gamma: 1 },
    depth: {
      c: method === "usace-meyerhof-2025"
        ? Math.min(1 + 0.2 * embedmentDepth / geometry.effectiveWidth, 1.5)
        : 1,
      q: 1,
      gamma: 1,
    },
    inclination: {
      beta,
      c: inclination,
      q: 1,
      gamma: 1,
      policy: method === "usace-meyerhof-2025"
        ? "included-with-shape-per-usace-2025"
        : "omitted-per-fhwa-2002-recommendation-when-shape-is-used",
    },
  };
}

/**
 * Homogeneous general-shear bearing capacity kernel. Inputs use kN and m,
 * therefore stresses and unit weights use kN/m2 and kN/m3.
 */
export function calculateShallowFoundationBearingCapacity({
  method,
  parameterSet,
  effectiveGeometry,
  embedmentDepth,
  surchargeStress,
  totalUnitWeightBelowBase,
  waterTableDepth = null,
} = {}) {
  if (!SHALLOW_FOUNDATION_BEARING_METHODS.includes(method)) {
    throw new Error(`Unsupported shallow-foundation bearing method: ${method}.`);
  }
  if (!parameterSet?.strength) {
    throw new Error("A resolved soil parameter set is required.");
  }
  const depth = nonNegative(embedmentDepth, "embedmentDepth");
  const surcharge = nonNegative(surchargeStress, "surchargeStress");
  const unitWeight = nonNegative(
    totalUnitWeightBelowBase,
    "totalUnitWeightBelowBase",
  );
  const horizontalToVerticalRatio =
    effectiveGeometry.actions.horizontalMagnitude /
    effectiveGeometry.actions.vertical;
  const isDrained = parameterSet.strength.model === "mohr-coulomb-effective";
  const factors = isDrained
    ? drainedFactors({
        method,
        strength: parameterSet.strength,
        geometry: effectiveGeometry,
        embedmentDepth: depth,
        horizontalToVerticalRatio,
      })
    : undrainedFactors({
        method,
        geometry: effectiveGeometry,
        embedmentDepth: depth,
        horizontalToVerticalRatio,
      });
  const groundwater = groundwaterCorrection({
    method,
    waterTableDepth,
    embedmentDepth: depth,
    originalWidth: effectiveGeometry.originalWidth,
  });
  const effectiveUnitWeight = isDrained
    ? unitWeight * groundwater.factor
    : 0;
  const strength = parameterSet.strength;
  const cohesionStrength = isDrained
    ? strength.cohesion
    : strength.undrainedShearStrength;
  const cohesionContribution =
    factors.shape.c * factors.depth.c * factors.inclination.c *
    cohesionStrength * factors.bearing.nc;
  const surchargeContribution =
    factors.shape.q * factors.depth.q * factors.inclination.q *
    surcharge * factors.bearing.nq;
  const unitWeightContribution = isDrained
    ? factors.shape.gamma * factors.depth.gamma *
      factors.inclination.gamma * 0.5 * effectiveGeometry.effectiveWidth *
      effectiveUnitWeight * factors.bearing.nGamma
    : 0;
  const ultimateGrossBearingPressure = cohesionContribution +
    surchargeContribution + unitWeightContribution;

  return {
    method,
    drainage: parameterSet.drainage,
    strengthModel: strength.model,
    parameterSetId: parameterSet.id,
    parameterBasis: parameterSet.basis,
    factors,
    groundwater: {
      ...groundwater,
      waterTableDepth,
      inputTotalUnitWeight: unitWeight,
      effectiveUnitWeight,
    },
    contributions: {
      cohesion: cohesionContribution,
      surcharge: surchargeContribution,
      unitWeight: unitWeightContribution,
    },
    ultimateGrossBearingPressure,
    metadata: {
      reference: method === "usace-meyerhof-2025"
        ? USACE_REFERENCE
        : `${USACE_REFERENCE}; factors originally presented in ${FHWA_REFERENCE}`,
      baseInclinationFactor: 1,
      groundInclinationFactor: 1,
      units: {
        pressure: "kN/m2",
        unitWeight: "kN/m3",
        length: "m",
        angle: "rad",
      },
    },
  };
}

function localWaterState({ profile, field, foundation }) {
  const x = foundation.placement.x;
  const baseElevation = foundation.placement.baseElevation;
  if (field?.model === "assigned-grid") {
    return {
      unsupported:
        "Assigned-grid pore pressure is not sufficient to select total unit weights and the bearing-capacity groundwater correction; use a hydrostatic or phreatic-line field for this ULS method.",
    };
  }

  if (field && field.model !== "none") {
    return {
      waterElevation: field.waterElevationAt(x),
      waterUnitWeight: field.waterUnitWeight,
      porePressureAtBase: field.porePressureAt({ x, z: baseElevation }),
      source: `pore-pressure-field:${field.id}`,
    };
  }
  if (field?.model === "none") {
    return {
      waterElevation: null,
      waterUnitWeight: null,
      porePressureAtBase: 0,
      source: `pore-pressure-field:${field.id}`,
    };
  }
  const groundwater = profile.groundwater;
  if (groundwater.model === "hydrostatic") {
    return {
      waterElevation: groundwater.waterTableElevation,
      waterUnitWeight: groundwater.waterUnitWeight,
      porePressureAtBase: groundwater.waterUnitWeight * Math.max(
        groundwater.waterTableElevation - baseElevation,
        0,
      ),
      source: `ground-profile:${profile.id}`,
    };
  }
  return {
    waterElevation: null,
    waterUnitWeight: null,
    porePressureAtBase: 0,
    source: `ground-profile:${profile.id}`,
  };
}

function verticalStressAtBase({
  groundModel,
  profile,
  foundation,
  waterState,
  surcharge,
}) {
  const surface = profile.groundSurfaceElevation;
  const base = foundation.placement.baseElevation;
  let soilOverburden = 0;
  const contributions = [];
  for (const layer of profile.layers) {
    const top = Math.min(layer.topElevation, surface);
    const bottom = Math.max(layer.bottomElevation, base);
    if (bottom >= top - TOLERANCE) continue;
    const material = groundModel.getMaterial(layer.materialId);
    const boundaries = [top, bottom];
    const water = waterState.waterElevation;
    if (water != null && water < top - TOLERANCE && water > bottom + TOLERANCE) {
      boundaries.splice(1, 0, water);
    }
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const intervalTop = boundaries[index];
      const intervalBottom = boundaries[index + 1];
      const midpoint = (intervalTop + intervalBottom) / 2;
      const saturated = water != null && midpoint < water;
      const unitWeight = saturated
        ? material.unitWeight.saturated
        : material.unitWeight.bulk;
      if (!Number.isFinite(unitWeight)) {
        throw new Error(
          `SoilMaterial ${material.id} requires saturated unit weight below the selected water surface.`,
        );
      }
      const stress = unitWeight * (intervalTop - intervalBottom);
      soilOverburden += stress;
      contributions.push({
        layerId: layer.id,
        materialId: material.id,
        topElevation: intervalTop,
        bottomElevation: intervalBottom,
        saturated,
        unitWeight,
        stress,
      });
    }
    if (base >= layer.bottomElevation - TOLERANCE) break;
  }
  const totalVerticalStress = surcharge + soilOverburden;
  return {
    elevation: base,
    depth: surface - base,
    surcharge,
    soilOverburden,
    porePressure: waterState.porePressureAtBase,
    totalVerticalStress,
    effectiveVerticalStress:
      totalVerticalStress - waterState.porePressureAtBase,
    contributions,
    units: { stress: "kN/m2", elevation: "m", depth: "m" },
  };
}

function layerImmediatelyBelow(profile, elevation) {
  const scale = Math.max(1, Math.abs(elevation));
  const sample = elevation - 1e-9 * scale;
  return profile.getLayerAtElevation(sample);
}

function totalUnitWeightBelowBase({
  groundModel,
  layer,
  waterState,
  baseElevation,
  influenceDepth,
}) {
  const material = groundModel.getMaterial(layer.materialId);
  const waterIntersects = waterState.waterElevation != null &&
    waterState.waterElevation > baseElevation - influenceDepth;
  if (!waterIntersects) return material.unitWeight.bulk;
  if (!Number.isFinite(material.unitWeight.saturated)) {
    throw new Error(
      `SoilMaterial ${material.id} requires saturated unit weight because groundwater intersects the bearing shear zone.`,
    );
  }
  return material.unitWeight.saturated;
}

function methodMap({
  parameterSet,
  effectiveGeometry,
  embedmentDepth,
  stress,
  totalUnitWeight,
  waterTableDepth,
}) {
  const surchargeStress = parameterSet.drainage === "undrained"
    ? stress.totalVerticalStress
    : stress.effectiveVerticalStress;
  return Object.fromEntries(SHALLOW_FOUNDATION_BEARING_METHODS.map((method) => [
    method,
    calculateShallowFoundationBearingCapacity({
      method,
      parameterSet,
      effectiveGeometry,
      embedmentDepth,
      surchargeStress,
      totalUnitWeightBelowBase: totalUnitWeight,
      waterTableDepth,
    }),
  ]));
}

function punchingSpreadRatio({ foundation, geometry, strongLayerThickness }) {
  if (foundation.shape === "rectangular") {
    return (
      (geometry.effectiveWidthOnWidthAxis + strongLayerThickness) *
      (geometry.effectiveLengthOnLengthAxis + strongLayerThickness)
    ) / foundation.geometry.area;
  }
  if (foundation.shape === "strip") {
    return (geometry.effectiveWidth + strongLayerThickness) /
      geometry.effectiveWidth;
  }
  return null;
}

function selectCapacity(methodValues, selection) {
  const usace = methodValues["usace-meyerhof-2025"];
  const fhwa = methodValues["fhwa-vesic-2002"];
  if (selection === "usace-meyerhof-2025") return usace;
  if (selection === "fhwa-vesic-2002") return fhwa;
  if (selection === "mean") return (usace + fhwa) / 2;
  return Math.min(usace, fhwa);
}

function compare({ demand, capacity, minimumFactorOfSafety = null }) {
  const utilizationRatio = capacity > 0 ? demand / capacity : null;
  const factorOfSafety = demand > TOLERANCE ? capacity / demand : null;
  return {
    demand,
    capacity,
    utilizationRatio,
    factorOfSafety,
    requiredFactorOfSafety: minimumFactorOfSafety,
    ok: minimumFactorOfSafety == null || factorOfSafety == null
      ? null
      : factorOfSafety >= minimumFactorOfSafety,
  };
}

function normalizeInterface(input) {
  if (input == null) return null;
  return input instanceof SoilStructureInterface
    ? input
    : new SoilStructureInterface(input);
}

export function calculateShallowFoundationSlidingResistance({
  parameterSet,
  effectiveGeometry,
  porePressureAtBase,
  interfaceModel,
  interfaceParameterSetId = null,
  drainedAdhesionRatio = 0,
  undrainedAdhesionRatio = 0,
} = {}) {
  if (!(interfaceModel instanceof SoilStructureInterface)) {
    throw new Error("interfaceModel must be a SoilStructureInterface.");
  }
  const drainedRatio = nonNegative(
    drainedAdhesionRatio,
    "drainedAdhesionRatio",
  );
  const undrainedRatio = nonNegative(
    undrainedAdhesionRatio,
    "undrainedAdhesionRatio",
  );
  if (drainedRatio > 1 || undrainedRatio > 1) {
    throw new Error("Interface adhesion ratios must not exceed 1.");
  }
  const originalArea = effectiveGeometry.shape === "strip"
    ? effectiveGeometry.originalWidth
    : effectiveGeometry.originalArea;
  const adhesionArea = effectiveGeometry.exactNoTensionKernUtilization <= 1
    ? originalArea
    : effectiveGeometry.shape === "strip"
      ? effectiveGeometry.effectiveAreaPerUnitLength
      : effectiveGeometry.effectiveArea;
  const vertical = effectiveGeometry.actions.vertical;
  const uplift = porePressureAtBase * originalArea;
  const effectiveNormal = Math.max(vertical - uplift, 0);
  const horizontalDemand = effectiveGeometry.actions.horizontalMagnitude;
  const interfaceSet = interfaceModel.getParameterSet(interfaceParameterSetId);
  let friction = 0;
  let adhesion = 0;
  let interfaceResolution = null;

  if (parameterSet.drainage === "drained") {
    interfaceResolution = interfaceModel.resolveFrictionAngle({
      soilFrictionAngles: [parameterSet.strength.frictionAngle],
      parameterSetId: interfaceSet.id,
    });
    friction = effectiveNormal * Math.tan(interfaceResolution.frictionAngle);
    adhesion = drainedRatio * parameterSet.strength.cohesion * adhesionArea;
  } else {
    adhesion = undrainedRatio *
      parameterSet.strength.undrainedShearStrength * adhesionArea;
  }
  const resistance = friction + adhesion;
  return {
    status: "ok",
    drainage: parameterSet.drainage,
    demand: horizontalDemand,
    capacity: resistance,
    utilizationRatio: resistance > 0
      ? horizontalDemand / resistance
      : horizontalDemand <= TOLERANCE ? 0 : null,
    factorOfSafety: horizontalDemand > TOLERANCE
      ? resistance / horizontalDemand
      : null,
    components: { friction, adhesion },
    effectiveNormalForce: effectiveNormal,
    upliftForce: uplift,
    baseArea: originalArea,
    adhesionArea,
    interface: interfaceResolution ?? {
      interfaceId: interfaceModel.id,
      parameterSetId: interfaceSet.id,
      parameterBasis: interfaceSet.basis,
      wallSurface: structuredClone(interfaceModel.wallSurface),
      model: "undrained-adhesion-ratio",
      frictionAngle: null,
    },
    adhesionRatios: {
      drained: drainedRatio,
      undrained: undrainedRatio,
    },
    passiveResistance: {
      status: "not-analyzed",
      value: 0,
      reason:
        "Developed active/passive earth forces for embedded footings require a separate explicit sliding workflow.",
    },
    units: {
      force: effectiveGeometry.shape === "strip" ? "kN/m" : "kN",
      area: effectiveGeometry.shape === "strip" ? "m2/m" : "m2",
      stress: "kN/m2",
    },
    metadata: { reference: `${USACE_REFERENCE}, equations 5-28 through 5-30` },
  };
}

export class ShallowFoundationUltimateLimitStateAnalysis {
  analyze({
    groundModel: groundModelInput,
    designSituation: designSituationInput,
    foundation: foundationInput,
    actionState: actionStateInput,
    profileId = null,
    porePressureFieldId = null,
    surfaceSurcharge = 0,
    bearingSelection = "minimum",
    sliding = {},
    criteria = {},
    units = null,
  } = {}) {
    try {
      assertExplicitUnitSystem(
        units,
        "ShallowFoundationUltimateLimitStateAnalysis",
      );
      if (!SHALLOW_FOUNDATION_BEARING_SELECTIONS.includes(bearingSelection)) {
        throw new Error(`Unsupported bearingSelection: ${bearingSelection}.`);
      }
      const groundModel = normalizeGroundModel(groundModelInput, units);
      const designSituation = normalizeDesignSituation(
        designSituationInput,
        groundModel,
        units,
      );
      designSituation.validateAgainst(groundModel);
      if (designSituation.limitState !== "ULS") {
        return result({
          status: "not-supported",
          summary: "The shallow-foundation ULS solver requires limitState=ULS.",
        });
      }
      if (designSituation.seismic.model !== "none") {
        return result({
          status: "not-supported",
          summary:
            "Seismic shallow-foundation bearing and sliding are not implemented in this static ULS solver.",
        });
      }

      const foundation = normalizeFoundation(foundationInput, units);
      const actionState = normalizeActions(actionStateInput, units);
      validateActionBasis(foundation, actionState);
      const geometry = calculateShallowFoundationEffectiveGeometry({
        foundation,
        actionState,
      });
      const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
      const surcharge = nonNegative(
        resolver.stress(Number(surfaceSurcharge ?? 0)),
        "surfaceSurcharge",
      );
      const profile = groundModel.getProfile(
        profileId ?? designSituation.spatialSelection.profileId,
      );
      if (!profile) {
        return result({
          status: "not-supported",
          summary: "A GroundProfile is required for shallow-foundation ULS.",
        });
      }
      const base = foundation.placement.baseElevation;
      const embedmentDepth = profile.groundSurfaceElevation - base;
      if (embedmentDepth < -TOLERANCE) {
        throw new Error("The foundation base cannot lie above the ground surface.");
      }
      if (base <= profile.bottomElevation + TOLERANCE) {
        throw new Error(
          "The GroundProfile must extend below the foundation base.",
        );
      }
      const field = groundModel.getPorePressureField(
        porePressureFieldId ??
          designSituation.spatialSelection.porePressureFieldId,
      );
      const waterState = localWaterState({
        profile,
        field,
        foundation,
      });
      if (waterState.unsupported) {
        return result({
          status: "not-supported",
          summary: "The selected pore-pressure model is outside the ULS method.",
          warnings: [waterState.unsupported],
        });
      }
      if (
        waterState.waterElevation != null &&
        waterState.waterElevation > profile.groundSurfaceElevation + TOLERANCE
      ) {
        return result({
          status: "not-supported",
          summary: "External water above ground surface is not implemented.",
        });
      }
      const stress = verticalStressAtBase({
        groundModel,
        profile,
        foundation,
        waterState,
        surcharge,
      });
      const waterTableDepth = waterState.waterElevation == null
        ? null
        : profile.groundSurfaceElevation - waterState.waterElevation;
      const baseLayer = layerImmediatelyBelow(profile, base);
      const baseResolution = designSituation.resolveParameterSet({
        groundModel,
        layerId: baseLayer.id,
      });
      const baseParameterSet = baseResolution.parameterSet;
      const influenceDepth = foundation.shape === "strip"
        ? 4 * geometry.effectiveWidth
        : 2 * geometry.effectiveWidth;
      const baseUnitWeight = totalUnitWeightBelowBase({
        groundModel,
        layer: baseLayer,
        waterState,
        baseElevation: base,
        influenceDepth,
      });
      if (
        profile.bottomElevation >
          base - influenceDepth + TOLERANCE
      ) {
        return result({
          status: "not-supported",
          summary:
            "The GroundProfile does not extend through the required bearing/punch-through influence depth.",
          warnings: [
            `Extend profile ${profile.id} to elevation ${base - influenceDepth} m or lower.`,
          ],
        });
      }
      const baseMethods = methodMap({
        parameterSet: baseParameterSet,
        effectiveGeometry: geometry,
        embedmentDepth: Math.max(0, embedmentDepth),
        stress,
        totalUnitWeight: baseUnitWeight,
        waterTableDepth,
      });

      const warnings = [...baseResolution.warnings];
      const punchingCandidates = [];
      const unsupportedLayered = [];
      const typicalDepth = geometry.effectiveWidth;
      const maximumPunchingDepth = foundation.shape === "strip"
        ? 4 * geometry.effectiveWidth
        : 2 * geometry.effectiveWidth;
      const minimumPunchingDepth = foundation.shape === "strip"
        ? geometry.effectiveWidth
        : 0.5 * geometry.effectiveWidth;
      const lowerLayers = profile.layers.filter((layer) =>
        layer.topElevation < base - TOLERANCE &&
        base - layer.topElevation <= maximumPunchingDepth + TOLERANCE);

      for (const layer of lowerLayers) {
        const strongLayerThickness = base - layer.topElevation;
        const layerResolution = designSituation.resolveParameterSet({
          groundModel,
          layerId: layer.id,
        });
        const parameterSet = layerResolution.parameterSet;
        warnings.push(...layerResolution.warnings);
        if (
          layer.materialId === baseLayer.materialId &&
          parameterSet.id === baseParameterSet.id
        ) {
          continue;
        }
        if (foundation.shape === "circular") {
          unsupportedLayered.push(
            `Layer ${layer.id} enters the circular-foundation influence zone; the cited rectangular 2V:1H punch-through equation is not applied to circular foundations.`,
          );
          continue;
        }
        if (parameterSet.drainage !== "undrained") {
          if (strongLayerThickness <= typicalDepth + TOLERANCE) {
            unsupportedLayered.push(
              `Layer ${layer.id} with drained parameters enters the typical shear zone; a supported layered bearing-capacity model is required.`,
            );
          } else {
            warnings.push(
              `Drained layer ${layer.id} lies inside the maximum search depth but outside the typical shear-zone depth; no punch-through model is applied.`,
            );
          }
          continue;
        }
        if (strongLayerThickness < minimumPunchingDepth - TOLERANCE) {
          unsupportedLayered.push(
            `Undrained layer ${layer.id} begins too close to the base for the cited strong-over-weak 2V:1H punch-through range.`,
          );
          continue;
        }
        const layerMethods = methodMap({
          parameterSet,
          effectiveGeometry: geometry,
          embedmentDepth: Math.max(0, embedmentDepth),
          stress,
          totalUnitWeight: 0,
          waterTableDepth,
        });
        const spreadRatio = punchingSpreadRatio({
          foundation,
          geometry,
          strongLayerThickness,
        });
        punchingCandidates.push({
          layerId: layer.id,
          materialId: layer.materialId,
          parameterSetId: parameterSet.id,
          parameterBasis: parameterSet.basis,
          drainage: parameterSet.drainage,
          strongLayerThickness,
          spreadRatio,
          methods: Object.fromEntries(Object.entries(layerMethods).map(
            ([method, methodResult]) => [method, {
              ...methodResult,
              lowerLayerUltimateGrossBearingPressure:
                methodResult.ultimateGrossBearingPressure,
              ultimateGrossBearingPressure:
                methodResult.ultimateGrossBearingPressure * spreadRatio,
            }],
          )),
          metadata: {
            model: foundation.shape === "strip"
              ? "USACE-equation-5-18-continuous-2V1H"
              : "USACE-equation-5-17-isolated-2V1H",
            reference: USACE_REFERENCE,
          },
        });
      }

      if (unsupportedLayered.length > 0) {
        return result({
          status: "not-supported",
          summary:
            "The selected stratigraphy is outside the implemented homogeneous/strong-over-weak ULS models.",
          outputs: {
            schemaVersion: SHALLOW_FOUNDATION_ULS_RESULT_SCHEMA_VERSION,
            foundation: foundation.toJSON(),
            actionState: actionState.toJSON(),
            effectiveGeometry: geometry,
            baseMechanism: { layerId: baseLayer.id, methods: baseMethods },
          },
          warnings: unique([...warnings, ...unsupportedLayered]),
        });
      }

      const governingByMethod = {};
      for (const method of SHALLOW_FOUNDATION_BEARING_METHODS) {
        const mechanisms = [{
          type: "base-layer-general-shear",
          layerId: baseLayer.id,
          capacity: baseMethods[method].ultimateGrossBearingPressure,
        }, ...punchingCandidates.map((candidate) => ({
          type: "strong-over-weak-punch-through",
          layerId: candidate.layerId,
          capacity: candidate.methods[method].ultimateGrossBearingPressure,
        }))];
        const governing = mechanisms.reduce((current, candidate) =>
          candidate.capacity < current.capacity ? candidate : current);
        governingByMethod[method] = {
          ultimateGrossBearingPressure: governing.capacity,
          governingMechanism: governing,
          mechanisms,
        };
      }
      const methodCapacities = Object.fromEntries(
        Object.entries(governingByMethod).map(([method, value]) => [
          method,
          value.ultimateGrossBearingPressure,
        ]),
      );
      const selectedBearingCapacity = selectCapacity(
        methodCapacities,
        bearingSelection,
      );
      const upliftPressure = waterState.porePressureAtBase;
      const equivalentBearingPressure = foundation.shape === "strip"
        ? geometry.actions.vertical / geometry.effectiveWidth - upliftPressure
        : geometry.actions.vertical / geometry.effectiveArea - upliftPressure;
      if (equivalentBearingPressure <= TOLERANCE) {
        return result({
          status: "not-supported",
          summary:
            "Net equivalent bearing pressure is non-positive; uplift must be checked in a dedicated workflow.",
          warnings: unique(warnings),
        });
      }
      const bearingCriterion = positiveOrNull(
        criteria.minimumBearingFactorOfSafety,
        "criteria.minimumBearingFactorOfSafety",
      );
      const bearingCheck = compare({
        demand: equivalentBearingPressure,
        capacity: selectedBearingCapacity,
        minimumFactorOfSafety: bearingCriterion,
      });

      const interfaceModel = normalizeInterface(sliding.interface ?? null);
      const slidingCriterion = positiveOrNull(
        criteria.minimumSlidingFactorOfSafety,
        "criteria.minimumSlidingFactorOfSafety",
      );
      let slidingOutput;
      if (interfaceModel == null) {
        slidingOutput = {
          status: "not-analyzed",
          reason:
            "Supply a SoilStructureInterface and explicit adhesion ratios to calculate base sliding resistance.",
        };
      } else if (geometry.exactNoTensionKernUtilization > 1 + TOLERANCE) {
        slidingOutput = {
          status: "not-analyzed",
          reason:
            "The resultant lies outside the no-tension kern; determine the actual compression-contact area before using interface adhesion in sliding.",
        };
      } else if (sliding.includePassiveResistance === true) {
        return result({
          status: "not-supported",
          summary:
            "Embedded-footing passive resistance is not included in the base-only sliding workflow.",
          warnings: unique(warnings),
        });
      } else {
        slidingOutput = calculateShallowFoundationSlidingResistance({
          parameterSet: baseParameterSet,
          effectiveGeometry: geometry,
          porePressureAtBase: upliftPressure,
          interfaceModel,
          interfaceParameterSetId:
            sliding.interfaceParameterSetId ??
            designSituation.resolveInterfaceParameterSetId(interfaceModel.id),
          drainedAdhesionRatio: sliding.drainedAdhesionRatio ?? 0,
          undrainedAdhesionRatio: sliding.undrainedAdhesionRatio ?? 0,
        });
        slidingOutput.requiredFactorOfSafety = slidingCriterion;
        slidingOutput.ok = slidingCriterion == null ||
          slidingOutput.factorOfSafety == null
          ? null
          : slidingOutput.factorOfSafety >= slidingCriterion;
        if (slidingOutput.interface.parameterBasis === "indicative") {
          warnings.push(
            "An indicative soil-structure interface parameter was explicitly supplied; confirm it against project data before design use.",
          );
        }
      }

      const meanCapacity = (
        methodCapacities["usace-meyerhof-2025"] +
        methodCapacities["fhwa-vesic-2002"]
      ) / 2;
      const spread = Math.abs(
        methodCapacities["usace-meyerhof-2025"] -
        methodCapacities["fhwa-vesic-2002"],
      );
      const checks = [
        {
          id: "compressive-equilibrium",
          demand: geometry.compressiveEquilibriumUtilization,
          capacity: 1,
          utilizationRatio: geometry.compressiveEquilibriumUtilization,
          ok: geometry.compressiveEquilibriumUtilization < 1,
        },
        {
          id: "full-compression-kern",
          demand: geometry.exactNoTensionKernUtilization,
          capacity: 1,
          utilizationRatio: geometry.exactNoTensionKernUtilization,
          ok: geometry.exactNoTensionKernUtilization <= 1 + TOLERANCE,
        },
        { id: "bearing", ...bearingCheck },
        ...(slidingOutput.status === "ok"
          ? [{
              id: "base-sliding",
              demand: slidingOutput.demand,
              capacity: slidingOutput.capacity,
              utilizationRatio: slidingOutput.utilizationRatio,
              factorOfSafety: slidingOutput.factorOfSafety,
              requiredFactorOfSafety: slidingOutput.requiredFactorOfSafety,
              ok: slidingOutput.ok,
            }]
          : []),
      ];
      const isVerified = checks.every((check) => check.ok !== false);

      return result({
        status: isVerified ? "ok" : "not-verified",
        summary: isVerified
          ? "Static shallow-foundation bearing capacity and base sliding analysis completed."
          : "The shallow-foundation analysis completed, but one or more explicit checks are not verified.",
        outputs: {
          schemaVersion: SHALLOW_FOUNDATION_ULS_RESULT_SCHEMA_VERSION,
          groundModelId: groundModel.id,
          designSituationId: designSituation.id,
          foundation: foundation.toJSON(),
          actionState: actionState.toJSON(),
          effectiveGeometry: geometry,
          stressAtBase: stress,
          groundwater: {
            ...waterState,
            waterTableDepth,
          },
          bearing: {
            demand: equivalentBearingPressure,
            capacity: selectedBearingCapacity,
            utilizationRatio: bearingCheck.utilizationRatio,
            factorOfSafety: bearingCheck.factorOfSafety,
            selection: bearingSelection,
            selectedUltimateGrossBearingPressure: selectedBearingCapacity,
            methodCapacities,
            meanUltimateGrossBearingPressure: meanCapacity,
            methodAbsoluteSpread: spread,
            methodRelativeSpreadToMean: meanCapacity > 0 ? spread / meanCapacity : null,
            baseMechanism: {
              layerId: baseLayer.id,
              materialId: baseLayer.materialId,
              parameterResolution: baseResolution,
              methods: baseMethods,
            },
            punchThroughCandidates: punchingCandidates,
            governingByMethod,
          },
          sliding: slidingOutput,
          checks,
          demand: {
            equivalentBearingPressure,
            horizontal: geometry.actions.horizontalMagnitude,
          },
          capacity: {
            bearingPressure: selectedBearingCapacity,
            baseSliding: slidingOutput.capacity ?? null,
          },
          utilizationRatio: Math.max(
            bearingCheck.utilizationRatio ?? 0,
            slidingOutput.utilizationRatio ?? 0,
          ),
          structuralCoupling: {
            level: "one-way-geotechnical-capacity-transfer",
            foundationId: foundation.id,
            actionStateId: actionState.id,
            actionReferencePoint: actionState.referencePoint,
            ultimateResistances: {
              grossBearingPressure: selectedBearingCapacity,
              baseSliding: slidingOutput.capacity ?? null,
            },
            designConversion: {
              status: "required",
              reason:
                "A normative adapter must transform parameter values and ultimate resistances before they are assigned as design resistances to a structural foundation verifier.",
            },
          },
        },
        warnings: unique([
          ...warnings,
          ...(geometry.exactNoTensionKernUtilization > 1 + TOLERANCE
            ? [
                "The resultant lies outside the no-tension kern; bearing uses effective dimensions, while structural contact and overturning require a separate review.",
              ]
            : []),
          "The difference between the USACE/Meyerhof and FHWA/Vesic results is reported as method uncertainty; no normative resistance factor is applied.",
          ...(slidingOutput.status !== "ok"
            ? [`Base sliding was not analyzed: ${slidingOutput.reason}`]
            : []),
        ]),
        assumptions: [
          "The foundation base and adjacent ground surface are horizontal.",
          "The supplied action resultant acts at the base center and includes foundation self-weight and all other applicable permanent vertical loads.",
          "Bearing failure is represented by general shear with superposed Nc, Nq and Ngamma terms.",
          "USACE/Meyerhof includes shape and load-inclination factors; FHWA/Vesic omits inclination factors when shape factors are used, following the cited FHWA recommendation.",
          "Hydrostatic-horizontal and phreatic-line pore-pressure fields are represented by their local water elevation at the foundation center.",
          "The strong-over-weak check is limited to the cited 2V:1H punch-through model with an undrained weaker layer in its stated depth range.",
          "Passive resistance in front of an embedded footing, uplift resistance, settlements, consolidation and seismic effects are excluded.",
        ],
        metadata: {
          references: [USACE_REFERENCE, FHWA_REFERENCE],
          designSituation: designSituation.toJSON(),
          units: {
            force: foundation.shape === "strip" ? "kN/m" : "kN",
            moment: foundation.shape === "strip" ? "kN.m/m" : "kN.m",
            length: "m",
            pressure: "kN/m2",
            unitWeight: "kN/m3",
            angle: "rad",
          },
        },
      });
    } catch (error) {
      return result({
        status: "failed",
        summary: "Shallow-foundation ULS analysis failed.",
        warnings: [error.message],
        metadata: { errorName: error.name },
      });
    }
  }
}
