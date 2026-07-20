import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { GroundProfile } from "./GroundProfile.js";
import { SoilStructureInterface } from "./SoilStructureInterface.js";
import {
  GEOTECHNICAL_INTERNAL_UNITS,
} from "./SoilMaterial.js";
import { PressureDiagram2D } from "./PressureDiagram2D.js";
import { VerticalStressProfile } from "./VerticalStressProfile.js";
import { optimizeLayeredPseudostaticTrialWedge } from
  "./LayeredPseudostaticTrialWedge.js";
import {
  coulombActiveEarthPressureCoefficient,
  coulombPassiveEarthPressureCoefficient,
  jakyAtRestCoefficient,
  mononobeOkabeActiveEarthPressureCoefficient,
  rankineEarthPressureCoefficients,
} from "./earthPressureCoefficients.js";

export const EARTH_PRESSURE_STATES = Object.freeze([
  "active",
  "passive",
  "at-rest",
  "seismic-active",
]);

export const EARTH_PRESSURE_METHODS = Object.freeze([
  "rankine",
  "coulomb-active",
  "coulomb-passive",
  "at-rest-explicit",
  "jaky-nc",
  "mononobe-okabe-active",
  "trial-wedge-pseudostatic",
]);

function unique(values) {
  return [...new Set(values)];
}

function normalizeAngle(value, units, label) {
  if (value == null) return 0;
  if (!Number.isFinite(Number(value))) throw new Error(`${label} must be finite.`);
  if (units === "rad") return Number(value);
  if (units === "deg") return Number(value) * Math.PI / 180;
  throw new Error(`${label} requires angleUnits equal to "deg" or "rad".`);
}

function geotechnicalCalculationResult({
  status,
  summary,
  outputs = {},
  warnings = [],
  assumptions = [],
  metadata = {},
}) {
  return { status, summary, outputs, warnings, assumptions, metadata };
}

function defaultMethod(state) {
  if (state === "active" || state === "passive") return "rankine";
  if (state === "at-rest") return "at-rest-explicit";
  if (state === "seismic-active") return "mononobe-okabe-active";
  return null;
}

function selectedParameterSet({
  material,
  layer,
  parameterSetId,
  parameterSetByLayer,
  parameterSetByMaterial,
}) {
  const selectedId = parameterSetByLayer?.[layer.id] ??
    parameterSetByMaterial?.[material.id] ?? parameterSetId ?? null;
  return material.getParameterSet(selectedId);
}

function methodForLayer({
  state,
  method,
  parameterSet,
  interfaceAngle,
  wallInclination,
  backfillInclination,
}) {
  const strength = parameterSet.strength;

  if (method === "rankine") {
    if (strength.model === "total-stress-undrained") {
      return {
        coefficient: 1,
        normalFactor: 1,
        tangentFactor: 0,
        cohesionContribution: state === "active"
          ? -2 * strength.undrainedShearStrength
          : 2 * strength.undrainedShearStrength,
        stressBasis: "total",
        metadata: {
          active: 1,
          passive: 1,
          basis: "horizontal-total-stress",
          method: "rankine-undrained-phi-zero",
          reference:
            "USACE EM 1110-2-2502 (1989), sections 3-12b(7) and 3-12c(2)",
        },
      };
    }
    if (strength.model !== "mohr-coulomb-effective") {
      return { unsupported: `Unsupported Rankine strength model: ${strength.model}.` };
    }
    const coefficients = rankineEarthPressureCoefficients({
      frictionAngle: strength.frictionAngle,
    });
    return {
      coefficient: state === "active"
        ? coefficients.active
        : coefficients.passive,
      normalFactor: 1,
      tangentFactor: 0,
      cohesionContribution: state === "active"
        ? -2 * strength.cohesion * Math.sqrt(coefficients.active)
        : 2 * strength.cohesion * Math.sqrt(coefficients.passive),
      stressBasis: "effective",
      metadata: coefficients,
    };
  }

  if (method === "at-rest-explicit") {
    if (!parameterSet.atRest) {
      return {
        unsupported:
          `Parameter set ${parameterSet.id} has no assigned at-rest coefficient.`,
      };
    }
    return {
      coefficient: parameterSet.atRest.coefficient,
      normalFactor: 1,
      tangentFactor: 0,
      cohesionContribution: 0,
      stressBasis: strength.model === "total-stress-undrained"
        ? "total"
        : "effective",
      metadata: {
        basis: strength.model === "total-stress-undrained"
          ? "horizontal-total-stress"
          : "horizontal-effective-stress",
        method: parameterSet.atRest.method,
        reference: parameterSet.atRest.metadata?.reference ?? null,
      },
    };
  }

  if (method === "jaky-nc") {
    if (strength.model !== "mohr-coulomb-effective") {
      return {
        unsupported:
          "The Jaky correlation requires drained effective-stress parameters.",
      };
    }
    const coefficient = jakyAtRestCoefficient({
      frictionAngle: strength.frictionAngle,
    });
    return {
      coefficient: coefficient.coefficient,
      normalFactor: 1,
      tangentFactor: 0,
      cohesionContribution: 0,
      stressBasis: "effective",
      metadata: coefficient,
    };
  }

  if (method === "coulomb-active" || method === "coulomb-passive") {
    if (strength.model !== "mohr-coulomb-effective") {
      return {
        unsupported:
          "The implemented Coulomb coefficients require drained effective-stress parameters.",
      };
    }
    if (strength.cohesion !== 0) {
      return {
        unsupported:
          "The implemented Coulomb coefficient is limited to cohesionless soil.",
      };
    }
    const coefficient = method === "coulomb-active"
      ? coulombActiveEarthPressureCoefficient({
          frictionAngle: strength.frictionAngle,
          interfaceFrictionAngle: interfaceAngle,
          wallInclinationFromVertical: wallInclination,
          backfillInclination,
        })
      : coulombPassiveEarthPressureCoefficient({
          frictionAngle: strength.frictionAngle,
          interfaceFrictionAngle: interfaceAngle,
          wallInclinationFromVertical: wallInclination,
          backfillInclination,
        });
    return {
      coefficient: coefficient.coefficient,
      normalFactor: Math.cos(interfaceAngle),
      tangentFactor: method === "coulomb-active"
        ? Math.sin(interfaceAngle)
        : -Math.sin(interfaceAngle),
      cohesionContribution: 0,
      stressBasis: "effective",
      metadata: coefficient,
    };
  }

  return { unsupported: `Unsupported static earth-pressure method: ${method}.` };
}

function pressurePoint({
  elevation,
  verticalStress,
  layerMethod,
  state,
}) {
  const stress = verticalStress.evaluate(elevation);
  const usesTotalStress = layerMethod.stressBasis === "total";
  const selfWeight = layerMethod.coefficient * (
    usesTotalStress
      ? stress.totalSoilOverburden
      : stress.effectiveSoilOverburden
  );
  const surcharge = layerMethod.coefficient * stress.surcharge;
  const surfaceWater = usesTotalStress
    ? layerMethod.coefficient * stress.surfaceWaterPressure
    : 0;
  const rawSoil = selfWeight + surcharge + surfaceWater +
    layerMethod.cohesionContribution;
  const effectiveMagnitude = state === "active"
    ? Math.max(0, rawSoil)
    : rawSoil;
  const soilNormal = effectiveMagnitude * layerMethod.normalFactor;
  const soilTangent = effectiveMagnitude * layerMethod.tangentFactor;
  const waterNormal = usesTotalStress ? 0 : stress.porePressure;

  return {
    elevation,
    verticalStress: stress,
    coefficient: layerMethod.coefficient,
    stressBasis: layerMethod.stressBasis,
    rawSoil,
    rawEffectiveSoil: usesTotalStress ? null : rawSoil,
    rawTotalStressSoil: usesTotalStress ? rawSoil : null,
    soilNormal,
    soilTangent,
    effectiveSoilNormal: usesTotalStress ? null : soilNormal,
    effectiveSoilTangent: usesTotalStress ? null : soilTangent,
    totalStressSoilNormal: usesTotalStress ? soilNormal : null,
    totalStressSoilTangent: usesTotalStress ? soilTangent : null,
    waterNormal,
    totalNormal: soilNormal + waterNormal,
    totalTangent: soilTangent,
    components: {
      selfWeight,
      surcharge,
      surfaceWater,
      cohesion: layerMethod.cohesionContribution,
    },
  };
}

function splitAtTensionCutoff({ top, bottom, evaluate }) {
  const topPoint = evaluate(top);
  const bottomPoint = evaluate(bottom);
  if (
    topPoint.rawSoil >= 0 ||
    bottomPoint.rawSoil <= 0
  ) {
    return [{ topElevation: top, bottomElevation: bottom }];
  }

  const ratio = -topPoint.rawSoil /
    (bottomPoint.rawSoil - topPoint.rawSoil);
  const zeroElevation = top + ratio * (bottom - top);

  return [
    { topElevation: top, bottomElevation: zeroElevation },
    { topElevation: zeroElevation, bottomElevation: bottom },
  ];
}

function intersectingLayers(profile, topElevation, bottomElevation) {
  return profile.layers.filter((layer) =>
    layer.bottomElevation < topElevation &&
    layer.topElevation > bottomElevation);
}

function resolveSoilStructureInterface({
  input,
  interfaceParameterSetId,
  profile,
  topElevation,
  bottomElevation,
  parameterSetId,
  parameterSetByLayer,
  parameterSetByMaterial,
  allowIndicativeValues,
}) {
  const isModel = input instanceof SoilStructureInterface ||
    input?.schemaVersion === "soil-structure-interface/v1" ||
    (Array.isArray(input?.parameterSets) && input?.wallSurface?.typeId);

  if (!isModel) {
    const frictionAngle = normalizeAngle(
      input?.frictionAngle ?? 0,
      input?.angleUnits ?? "rad",
      "interface.frictionAngle",
    );
    return {
      frictionAngle,
      warnings: [],
      metadata: {
        model: "direct-input",
        frictionAngle,
        units: { angle: "rad" },
      },
    };
  }

  const interfaceModel = input instanceof SoilStructureInterface
    ? input
    : new SoilStructureInterface(input);
  const selectedInterfaceSet = interfaceModel.getParameterSet(
    interfaceParameterSetId,
  );
  if (
    selectedInterfaceSet.basis === "indicative" &&
    !allowIndicativeValues
  ) {
    return {
      unsupported:
        "Indicative wall-soil interface parameters were not authorized for calculation.",
      warnings: [
        `Interface ${interfaceModel.id} selects indicative parameter set ${selectedInterfaceSet.id}.`,
      ],
    };
  }

  const soilFrictionAngles = intersectingLayers(
    profile,
    topElevation,
    bottomElevation,
  ).map((layer) => {
    const material = profile.getMaterial(layer.materialId);
    const selected = selectedParameterSet({
      material,
      layer,
      parameterSetId,
      parameterSetByLayer,
      parameterSetByMaterial,
    });
    return selected.strength.model === "mohr-coulomb-effective"
      ? selected.strength.frictionAngle
      : 0;
  });
  const resolution = interfaceModel.resolveFrictionAngle({
    soilFrictionAngles,
    parameterSetId: selectedInterfaceSet.id,
  });
  const warnings = [];
  if (selectedInterfaceSet.basis === "indicative") {
    warnings.push(
      `Interface ${interfaceModel.id} uses indicative parameters explicitly authorized by the caller.`,
    );
  }
  if (Object.keys(selectedInterfaceSet.provenance ?? {}).length === 0) {
    warnings.push(
      `Interface parameter set ${selectedInterfaceSet.id} has no provenance metadata.`,
    );
  }
  if (resolution.cappedBySoilFriction) {
    warnings.push(
      "The nominal wall-soil interface angle was capped at the governing soil friction angle.",
    );
  }

  return {
    frictionAngle: resolution.frictionAngle,
    warnings,
    metadata: resolution,
  };
}

function trialWedgeLayerState(parameterSet) {
  const strength = parameterSet.strength;
  if (strength.model === "mohr-coulomb-effective") {
    return {
      parameterSetId: parameterSet.id,
      stressBasis: "effective",
      frictionAngle: strength.frictionAngle,
      cohesion: strength.cohesion,
    };
  }
  if (strength.model === "total-stress-undrained") {
    return {
      parameterSetId: parameterSet.id,
      stressBasis: "total",
      frictionAngle: 0,
      cohesion: strength.undrainedShearStrength,
    };
  }

  return null;
}

function trialWedgeAnalysis({
  profile,
  topElevation,
  bottomElevation,
  surcharge,
  interfaceAngle,
  interfaceResolution,
  wallInclination,
  backfillInclination,
  parameterSetId,
  parameterSetByLayer,
  parameterSetByMaterial,
  allowIndicativeValues,
  seismic,
}) {
  const tolerance = 1e-10 * Math.max(
    1,
    Math.abs(profile.groundSurfaceElevation),
  );
  if (Math.abs(topElevation - profile.groundSurfaceElevation) > tolerance) {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary:
        "The trial-wedge method requires the wall top at the retained ground surface.",
    });
  }
  if (profile.groundwater.model !== "none") {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary:
        "The first layered pseudostatic trial-wedge implementation does not include groundwater or slip-plane uplift.",
    });
  }

  const layers = intersectingLayers(profile, topElevation, bottomElevation);
  const layerStates = new Map();
  const warnings = [
    ...(interfaceResolution?.warnings ?? []),
    "The layered wedge uses the USACE constant-inclination approximation: one planar slip angle is optimized through all materials.",
    "The trial-wedge method determines a resultant thrust, not a unique pressure distribution or application elevation.",
  ];
  const parameterMetadata = [];

  for (const layer of layers) {
    const material = profile.getMaterial(layer.materialId);
    const parameterSet = selectedParameterSet({
      material,
      layer,
      parameterSetId,
      parameterSetByLayer,
      parameterSetByMaterial,
    });
    if (parameterSet.basis === "indicative" && !allowIndicativeValues) {
      return geotechnicalCalculationResult({
        status: "not-supported",
        summary: "Indicative catalog parameters were not authorized for calculation.",
        warnings: [
          `Layer ${layer.id} selects indicative parameter set ${parameterSet.id}.`,
        ],
      });
    }
    if (parameterSet.basis === "indicative") {
      warnings.push(
        `Layer ${layer.id} uses indicative parameters explicitly authorized by the caller.`,
      );
    }
    if (Object.keys(parameterSet.provenance ?? {}).length === 0) {
      warnings.push(
        `Parameter set ${parameterSet.id} for layer ${layer.id} has no provenance metadata.`,
      );
    }

    const state = trialWedgeLayerState(parameterSet);
    if (!state) {
      return geotechnicalCalculationResult({
        status: "not-supported",
        summary: `Unsupported trial-wedge strength model: ${parameterSet.strength.model}.`,
      });
    }
    layerStates.set(layer.id, state);
    parameterMetadata.push({
      layerId: layer.id,
      materialId: material.id,
      parameterSetId: parameterSet.id,
      basis: parameterSet.basis,
      drainage: parameterSet.drainage,
      stressBasis: state.stressBasis,
    });
  }

  const governingSoilFrictionAngle = Math.min(
    ...[...layerStates.values()].map(({ frictionAngle }) => frictionAngle),
  );
  if (interfaceAngle > governingSoilFrictionAngle + 1e-14) {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary:
        "The trial-wedge method requires interface friction delta not greater than the governing soil friction angle.",
      warnings: unique(warnings),
      metadata: {
        interfaceFrictionAngle: interfaceAngle,
        governingSoilFrictionAngle,
      },
    });
  }

  const kh = Number(seismic?.kh);
  const kv = Number(seismic?.kv ?? 0);
  const topState = layerStates.get(profile.layers[0].id);
  const inertiaAngle = Number.isFinite(kh) && Number.isFinite(kv) && kv < 1
    ? Math.atan(kh / (1 - kv))
    : null;
  if (
    topState?.cohesion === 0 &&
    Number.isFinite(inertiaAngle) &&
    topState.frictionAngle <= backfillInclination + inertiaAngle
  ) {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary:
        "The cohesionless retained slope has no admissible pseudostatic equilibrium because phi <= beta + inertia angle.",
    });
  }
  if (surcharge > 0) {
    warnings.push(
      "Uniform surcharge is included as a vertical boundary force; seismic inertia is applied to soil weight only.",
    );
  }
  if ([...layerStates.values()].some(({ cohesion }) => cohesion > 0)) {
    warnings.push(
      "Cohesion is included along the trial slip plane; a water-filled tension crack is not generated automatically.",
    );
  }

  let seismicSolution;
  let staticSolution;
  try {
    const common = {
      profile,
      layerStates,
      topElevation,
      bottomElevation,
      backfillInclination,
      wallInclinationFromVertical: wallInclination,
      interfaceFrictionAngle: interfaceAngle,
      surcharge,
      search: seismic?.search,
    };
    seismicSolution = optimizeLayeredPseudostaticTrialWedge({
      ...common,
      horizontalSeismicCoefficient: kh,
      verticalSeismicCoefficient: kv,
    });
    staticSolution = optimizeLayeredPseudostaticTrialWedge({
      ...common,
      horizontalSeismicCoefficient: 0,
      verticalSeismicCoefficient: 0,
    });
  } catch (error) {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary: error.message,
      warnings: unique(warnings),
      metadata: { method: "trial-wedge-pseudostatic" },
    });
  }

  const seismicMagnitude = seismicSolution.critical.thrust;
  const staticMagnitude = staticSolution.critical.thrust;
  const makeForce = (magnitude) => ({
    magnitude,
    normal: magnitude * Math.cos(interfaceAngle),
    tangent: magnitude * Math.sin(interfaceAngle),
    applicationElevation: null,
  });
  const homogeneousKeys = unique(parameterMetadata.map(({ materialId, parameterSetId }) =>
    `${materialId}:${parameterSetId}`));
  let homogeneousEquivalentCoefficient = null;
  if (homogeneousKeys.length === 1) {
    const material = profile.getMaterial(parameterMetadata[0].materialId);
    const height = topElevation - bottomElevation;
    homogeneousEquivalentCoefficient = seismicMagnitude /
      (0.5 * material.unitWeight.bulk * height ** 2);
  }

  return geotechnicalCalculationResult({
    status: "ok",
    summary:
      `Layered pseudostatic trial-wedge thrust calculated for GroundProfile ${profile.id}.`,
    outputs: {
      profileId: profile.id,
      state: "seismic-active",
      method: "trial-wedge-pseudostatic",
      interface: interfaceResolution?.metadata ?? {
        model: "direct-input",
        frictionAngle: interfaceAngle,
      },
      geometry: {
        wallInclinationFromVertical: wallInclination,
        wallInclinationPositiveDirection:
          "wall-top-toward-retained-ground",
        backfillInclination,
        backfillInclinationPositiveDirection: "rises-away-from-wall",
      },
      diagram: null,
      resultants: {
        seismicTotal: makeForce(seismicMagnitude),
        staticReference: makeForce(staticMagnitude),
        seismicIncrement: makeForce(seismicMagnitude - staticMagnitude),
      },
      criticalWedges: {
        seismic: seismicSolution.critical,
        static: staticSolution.critical,
      },
      homogeneousEquivalentCoefficient,
      search: {
        seismic: seismicSolution.search,
        static: staticSolution.search,
      },
    },
    warnings: unique(warnings),
    assumptions: [
      "The wall and retained surface are planar, and a planar active failure mechanism can develop.",
      "Horizontal layer boundaries extend away from the wall; the uppermost material extends to an inclined retained surface.",
      "Pseudostatic inertia is uniform within each soil weight and liquefaction is excluded.",
    ],
    metadata: {
      units: {
        forcePerUnitWidth: "kN/m",
        stress: "kN/m2",
        unitWeight: "kN/m3",
        length: "m",
        elevation: "m",
        crossSectionArea: "m2",
        angle: "rad",
      },
      method: "constant-inclination-layered-trial-wedge-pseudostatic",
      methodApproximation: "USACE-3-13c-4b",
      references: seismicSolution.metadata.references,
      parameterSets: parameterMetadata,
      geometry: {
        wallInclinationFromVertical: wallInclination,
        wallInclinationPositiveDirection:
          "wall-top-toward-retained-ground",
        backfillInclination,
        backfillInclinationPositiveDirection: "rises-away-from-wall",
      },
      seismic: { kh, kv, inertiaAngle },
      interface: interfaceResolution?.metadata ?? {
        model: "direct-input",
        frictionAngle: interfaceAngle,
      },
      distributionModel: "resultant-only",
    },
  });
}

function staticAnalysis({
  profile,
  state,
  method,
  topElevation,
  bottomElevation,
  surcharge,
  interfaceAngle,
  interfaceResolution,
  wallInclination,
  backfillInclination,
  parameterSetId,
  parameterSetByLayer,
  parameterSetByMaterial,
  allowIndicativeValues,
}) {
  const elevationTolerance = 1e-10 * Math.max(
    1,
    Math.abs(profile.groundSurfaceElevation),
  );
  if (method === "rankine" && !["active", "passive"].includes(state)) {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary: "Rankine is available only for active or passive pressure.",
    });
  }
  if (method === "coulomb-active" && state !== "active") {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary: "The Coulomb implementation currently covers active pressure only.",
    });
  }
  if (method === "coulomb-passive" && state !== "passive") {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary: "The Coulomb passive method is available only for passive pressure.",
    });
  }
  if (
    (method === "coulomb-active" || method === "coulomb-passive") &&
    Math.abs(topElevation - profile.groundSurfaceElevation) > elevationTolerance
  ) {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary:
        "Closed-form Coulomb pressure requires the wall top at the retained ground surface.",
    });
  }
  if (method.startsWith("at-rest") || method === "jaky-nc") {
    if (state !== "at-rest") {
      return geotechnicalCalculationResult({
        status: "not-supported",
      summary: `${method} is available only for the at-rest state.`,
      });
    }
  }
  if (
    Math.abs(wallInclination) > 1e-14 ||
    Math.abs(backfillInclination) > 1e-14
  ) {
    if (method !== "coulomb-active" && method !== "coulomb-passive") {
      return geotechnicalCalculationResult({
        status: "not-supported",
        summary:
          `${method} does not cover inclined walls or retained surfaces; use a Coulomb or trial-wedge method.`,
      });
    }
    if (profile.groundwater.model !== "none") {
      return geotechnicalCalculationResult({
        status: "not-supported",
        summary:
          "Inclined Coulomb geometry is restricted to profiles without groundwater in this release.",
      });
    }
  }
  if (
    Math.abs(interfaceAngle) > 1e-14 &&
    method !== "coulomb-active" &&
    method !== "coulomb-passive"
  ) {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary:
        `${method} does not use soil-wall friction; set interface.frictionAngle to zero.`,
    });
  }

  const layers = intersectingLayers(profile, topElevation, bottomElevation);
  const layerStates = new Map();
  const warnings = [...(interfaceResolution?.warnings ?? [])];
  const assumptions = [
    "The retained surface and wall face are planar.",
  ];

  for (const layer of layers) {
    const material = profile.getMaterial(layer.materialId);
    const parameterSet = selectedParameterSet({
      material,
      layer,
      parameterSetId,
      parameterSetByLayer,
      parameterSetByMaterial,
    });
    if (parameterSet.basis === "indicative" && !allowIndicativeValues) {
      return geotechnicalCalculationResult({
        status: "not-supported",
        summary: "Indicative catalog parameters were not authorized for calculation.",
        warnings: [
          `Layer ${layer.id} selects indicative parameter set ${parameterSet.id}.`,
        ],
      });
    }
    if (parameterSet.basis === "indicative") {
      warnings.push(
        `Layer ${layer.id} uses indicative parameters explicitly authorized by the caller.`,
      );
    }
    if (Object.keys(parameterSet.provenance ?? {}).length === 0) {
      warnings.push(
        `Parameter set ${parameterSet.id} for layer ${layer.id} has no provenance metadata.`,
      );
    }

    let resolvedMethod;
    try {
      resolvedMethod = methodForLayer({
        state,
        method,
        parameterSet,
        interfaceAngle,
        wallInclination,
        backfillInclination,
      });
    } catch (error) {
      return geotechnicalCalculationResult({
        status: "not-supported",
        summary: error.message,
        warnings,
      });
    }
    if (resolvedMethod.unsupported) {
      return geotechnicalCalculationResult({
        status: "not-supported",
        summary: resolvedMethod.unsupported,
        warnings,
      });
    }
    warnings.push(...(resolvedMethod.metadata?.warnings ?? []));
    layerStates.set(layer.id, { material, parameterSet, method: resolvedMethod });
  }

  if (method === "coulomb-active" || method === "coulomb-passive") {
    const materialAndSetIds = unique([...layerStates.values()].map(({ material, parameterSet }) =>
      `${material.id}:${parameterSet.id}`));
    if (materialAndSetIds.length !== 1) {
      return geotechnicalCalculationResult({
        status: "not-supported",
        summary:
          "Closed-form Coulomb pressure is restricted to a homogeneous retained soil.",
        warnings,
      });
    }
  }

  const verticalStress = new VerticalStressProfile({ profile, surcharge });
  const breakpoints = verticalStress.breakpoints({
    topElevation,
    bottomElevation,
  });
  const segments = [];
  let tensionCutoffApplied = false;

  for (let index = 0; index < breakpoints.length - 1; index += 1) {
    const intervalTop = breakpoints[index];
    const intervalBottom = breakpoints[index + 1];
    if (intervalTop <= intervalBottom) continue;
    const midpoint = (intervalTop + intervalBottom) / 2;
    const layer = profile.getLayerAtElevation(midpoint);
    const layerState = layerStates.get(layer.id);
    const evaluate = (elevation) => pressurePoint({
      elevation,
      verticalStress,
      layerMethod: layerState.method,
      state,
    });
    const subdivisions = state === "active"
      ? splitAtTensionCutoff({
          top: intervalTop,
          bottom: intervalBottom,
          evaluate,
        })
      : [{ topElevation: intervalTop, bottomElevation: intervalBottom }];

    if (subdivisions.length > 1) tensionCutoffApplied = true;

    for (const subdivision of subdivisions) {
      const top = evaluate(subdivision.topElevation);
      const bottom = evaluate(subdivision.bottomElevation);
      if (top.rawSoil < 0 || bottom.rawSoil < 0) {
        tensionCutoffApplied = true;
      }
      segments.push({
        id: `${layer.id}-${segments.length + 1}`,
        layerId: layer.id,
        materialId: layerState.material.id,
        parameterSetId: layerState.parameterSet.id,
        topElevation: subdivision.topElevation,
        bottomElevation: subdivision.bottomElevation,
        top,
        bottom,
        coefficient: layerState.method.coefficient,
        coefficientMetadata: structuredClone(layerState.method.metadata),
      });
    }
  }

  if (tensionCutoffApplied) {
    warnings.push(
      "Negative active soil pressures were clipped to zero; water-filled tension cracking requires a separate design scenario when relevant.",
    );
  }
  if (state === "passive") {
    warnings.push(
      "Full passive resistance requires sufficient compatible wall movement and may require normative or construction-related reductions.",
    );
  }
  if (method === "jaky-nc") {
    assumptions.push(
      "The selected layers are normally consolidated for the Jaky at-rest correlation.",
    );
  }
  if (method === "coulomb-active" || method === "coulomb-passive") {
    assumptions.push(
      "The retained soil is homogeneous and cohesionless, and a planar Coulomb failure wedge can develop.",
    );
  }
  if (method === "coulomb-passive") {
    warnings.push(
      "Coulomb passive pressure assumes a planar failure surface; full passive resistance requires compatible movement and is sensitive to wall friction.",
    );
  }
  if ([...layerStates.values()].some(({ method: layerMethod }) =>
    layerMethod.stressBasis === "total")) {
    assumptions.push(
      "Layers using undrained strength are evaluated in total stress with phi_u=0; pore-water pressure is not added as a separate component in those layers.",
    );
  }
  if ([...layerStates.values()].some(({ method: layerMethod }) =>
    layerMethod.stressBasis === "effective")) {
    assumptions.push(
      "For effective-stress layers, hydrostatic pore-water pressure is added separately to soil pressure.",
    );
  }

  const stressBases = unique([...layerStates.values()].map(({ method: layerMethod }) =>
    layerMethod.stressBasis));

  const diagram = new PressureDiagram2D({
    profileId: profile.id,
    state,
    method: {
      id: method,
      version: "1",
    },
    topElevation,
    bottomElevation,
    segments,
    metadata: {
      effectiveStressAnalysis: stressBases.includes("effective"),
      totalStressAnalysis: stressBases.includes("total"),
      stressBases,
      tensionCutoffApplied,
      pressureDistributionBasis: "per-unit-vertical-projection",
      geometry: {
        wallInclinationFromVertical: wallInclination,
        wallInclinationPositiveDirection:
          "wall-top-toward-retained-ground",
        backfillInclination,
        backfillInclinationPositiveDirection: "rises-away-from-wall",
      },
    },
  });

  return geotechnicalCalculationResult({
    status: "ok",
    summary: `${state} lateral earth pressure calculated for GroundProfile ${profile.id}.`,
    outputs: {
      profileId: profile.id,
      state,
      method,
      interface: interfaceResolution?.metadata ?? {
        model: "direct-input",
        frictionAngle: interfaceAngle,
      },
      geometry: {
        wallInclinationFromVertical: wallInclination,
        wallInclinationPositiveDirection:
          "wall-top-toward-retained-ground",
        backfillInclination,
        backfillInclinationPositiveDirection: "rises-away-from-wall",
      },
      diagram: diagram.toJSON(),
    },
    warnings: unique(warnings),
    assumptions,
    metadata: {
      units: diagram.units,
      method,
      parameterSets: [...layerStates.entries()].map(([layerId, layerState]) => ({
        layerId,
        materialId: layerState.material.id,
        parameterSetId: layerState.parameterSet.id,
        basis: layerState.parameterSet.basis,
        drainage: layerState.parameterSet.drainage,
      })),
    },
  });
}

function seismicActiveAnalysis({
  profile,
  topElevation,
  bottomElevation,
  surcharge,
  interfaceAngle,
  interfaceResolution,
  parameterSetId,
  parameterSetByLayer,
  parameterSetByMaterial,
  allowIndicativeValues,
  seismic,
}) {
  const elevationTolerance = 1e-10 * Math.max(
    1,
    Math.abs(profile.groundSurfaceElevation),
  );
  if (
    Math.abs(topElevation - profile.groundSurfaceElevation) > elevationTolerance
  ) {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary:
        "Closed-form Mononobe-Okabe requires the wall top at the retained ground surface.",
    });
  }
  const layers = intersectingLayers(profile, topElevation, bottomElevation);
  if (layers.length !== 1) {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary:
        "Closed-form Mononobe-Okabe is restricted to one homogeneous layer; use the separate trial-wedge method for layered ground.",
    });
  }
  if (profile.groundwater.model !== "none") {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary:
        "The first Mononobe-Okabe implementation does not cover groundwater; provide a dry homogeneous profile.",
    });
  }
  if (Math.abs(surcharge) > 1e-14) {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary:
        "The first Mononobe-Okabe implementation is restricted to zero surcharge.",
    });
  }

  const layer = layers[0];
  const material = profile.getMaterial(layer.materialId);
  const parameterSet = selectedParameterSet({
    material,
    layer,
    parameterSetId,
    parameterSetByLayer,
    parameterSetByMaterial,
  });
  const warnings = [...(interfaceResolution?.warnings ?? [])];
  if (parameterSet.basis === "indicative" && !allowIndicativeValues) {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary: "Indicative catalog parameters were not authorized for calculation.",
      warnings: [
        `Layer ${layer.id} selects indicative parameter set ${parameterSet.id}.`,
      ],
    });
  }
  if (parameterSet.basis === "indicative") {
    warnings.push(
      `Layer ${layer.id} uses indicative parameters explicitly authorized by the caller.`,
    );
  }
  if (Object.keys(parameterSet.provenance ?? {}).length === 0) {
    warnings.push(
      `Parameter set ${parameterSet.id} for layer ${layer.id} has no provenance metadata.`,
    );
  }
  if (parameterSet.strength.model !== "mohr-coulomb-effective") {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary: "Mononobe-Okabe requires drained effective-stress parameters.",
    });
  }
  if (parameterSet.strength.cohesion !== 0) {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary: "The classical Mononobe-Okabe implementation requires cohesionless soil.",
    });
  }

  let coefficient;
  let staticCoefficient;
  try {
    coefficient = mononobeOkabeActiveEarthPressureCoefficient({
      frictionAngle: parameterSet.strength.frictionAngle,
      interfaceFrictionAngle: interfaceAngle,
      horizontalSeismicCoefficient: seismic?.kh,
      verticalSeismicCoefficient: seismic?.kv ?? 0,
    });
    staticCoefficient = coulombActiveEarthPressureCoefficient({
      frictionAngle: parameterSet.strength.frictionAngle,
      interfaceFrictionAngle: interfaceAngle,
    });
  } catch (error) {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary: error.message,
      metadata: { method: "mononobe-okabe-active" },
    });
  }

  const height = topElevation - bottomElevation;
  const gamma = material.unitWeight.bulk;
  const totalMagnitude = 0.5 * gamma * height ** 2 *
    coefficient.equivalentCoefficient;
  const staticMagnitude = 0.5 * gamma * height ** 2 *
    staticCoefficient.coefficient;
  const makeForce = (magnitude, applicationElevation = null) => ({
    magnitude,
    normal: magnitude * Math.cos(interfaceAngle),
    tangent: magnitude * Math.sin(interfaceAngle),
    applicationElevation,
  });
  const distributionModel = seismic?.distributionModel ?? "resultant-only";
  let diagram = null;
  let applicationElevation = null;

  if (distributionModel === "triangular-equivalent") {
    const bottomMagnitude = gamma * height * coefficient.equivalentCoefficient;
    const point = (elevation, magnitude) => ({
      elevation,
      coefficient: coefficient.equivalentCoefficient,
      stressBasis: "effective",
      rawSoil: magnitude,
      rawEffectiveSoil: magnitude,
      rawTotalStressSoil: null,
      soilNormal: magnitude * Math.cos(interfaceAngle),
      soilTangent: magnitude * Math.sin(interfaceAngle),
      effectiveSoilNormal: magnitude * Math.cos(interfaceAngle),
      effectiveSoilTangent: magnitude * Math.sin(interfaceAngle),
      totalStressSoilNormal: null,
      totalStressSoilTangent: null,
      waterNormal: 0,
      totalNormal: magnitude * Math.cos(interfaceAngle),
      totalTangent: magnitude * Math.sin(interfaceAngle),
      components: { selfWeight: magnitude, surcharge: 0, cohesion: 0 },
    });
    diagram = new PressureDiagram2D({
      profileId: profile.id,
      state: "seismic-active",
      method: { id: "mononobe-okabe-active", version: "1" },
      topElevation,
      bottomElevation,
      segments: [{
        id: `${layer.id}-seismic-equivalent`,
        layerId: layer.id,
        materialId: material.id,
        parameterSetId: parameterSet.id,
        topElevation,
        bottomElevation,
        top: point(topElevation, 0),
        bottom: point(bottomElevation, bottomMagnitude),
        coefficient: coefficient.equivalentCoefficient,
        coefficientMetadata: coefficient,
      }],
      metadata: {
        distributionModel,
        distributionIsAssumed: true,
      },
    });
    applicationElevation = diagram.resultants.totalNormal.applicationElevation;
    warnings.push(
      "A triangular equivalent seismic distribution was explicitly requested; Mononobe-Okabe determines thrust, not a unique pressure distribution.",
    );
  } else if (distributionModel !== "resultant-only") {
    return geotechnicalCalculationResult({
      status: "not-supported",
      summary: `Unsupported Mononobe-Okabe distribution model: ${distributionModel}.`,
    });
  }

  const seismicTotal = makeForce(totalMagnitude, applicationElevation);
  const staticReference = makeForce(staticMagnitude, null);
  const seismicIncrement = {
    magnitude: totalMagnitude - staticMagnitude,
    normal: seismicTotal.normal - staticReference.normal,
    tangent: seismicTotal.tangent - staticReference.tangent,
    applicationElevation: null,
  };

  return geotechnicalCalculationResult({
    status: "ok",
    summary: `Mononobe-Okabe active thrust calculated for GroundProfile ${profile.id}.`,
    outputs: {
      profileId: profile.id,
      state: "seismic-active",
      method: "mononobe-okabe-active",
      interface: interfaceResolution?.metadata ?? {
        model: "direct-input",
        frictionAngle: interfaceAngle,
      },
      diagram: diagram?.toJSON() ?? null,
      resultants: {
        seismicTotal,
        staticReference,
        seismicIncrement,
      },
      coefficients: {
        seismic: coefficient,
        static: staticCoefficient,
      },
    },
    warnings,
    assumptions: [
      "The wall is vertical, the retained surface is horizontal and planar, and the wall can yield enough to mobilize active conditions.",
      "The retained soil is homogeneous, dry, cohesionless and not susceptible to liquefaction.",
      "The surcharge is zero and the soil-wall interface friction is fully mobilized.",
    ],
    metadata: {
      units: {
        forcePerUnitWidth: "kN/m",
        elevation: "m",
        angle: "rad",
      },
      method: "mononobe-okabe-active-vertical-wall-horizontal-ground",
      parameterSetId: parameterSet.id,
      parameterBasis: parameterSet.basis,
      distributionModel,
      interface: interfaceResolution?.metadata ?? {
        model: "direct-input",
        frictionAngle: interfaceAngle,
      },
    },
  });
}

export class LateralEarthPressureAnalysis {
  analyze({
    profile: profileInput,
    state,
    method = null,
    geometry = {},
    interface: soilStructureInterface = {},
    interfaceParameterSetId = null,
    surcharge = 0,
    parameterSetId = null,
    parameterSetByLayer = {},
    parameterSetByMaterial = {},
    allowIndicativeValues = false,
    seismic = {},
    units = null,
  } = {}) {
    try {
      assertExplicitUnitSystem(units, "LateralEarthPressureAnalysis");
      const profile = profileInput instanceof GroundProfile
        ? profileInput
        : new GroundProfile(profileInput);
      if (!EARTH_PRESSURE_STATES.includes(state)) {
        throw new Error(`Unsupported earth-pressure state: ${state}.`);
      }
      const selectedMethod = method ?? defaultMethod(state);
      if (!EARTH_PRESSURE_METHODS.includes(selectedMethod)) {
        throw new Error(`Unsupported earth-pressure method: ${selectedMethod}.`);
      }
      const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
      const topElevation = geometry.topElevation == null
        ? profile.groundSurfaceElevation
        : resolver.length(Number(geometry.topElevation));
      const bottomElevation = geometry.bottomElevation == null
        ? profile.bottomElevation
        : resolver.length(Number(geometry.bottomElevation));
      if (
        !Number.isFinite(topElevation) ||
        !Number.isFinite(bottomElevation) ||
        topElevation <= bottomElevation
      ) {
        throw new Error("geometry requires topElevation above bottomElevation.");
      }
      if (
        topElevation > profile.groundSurfaceElevation + 1e-10 ||
        bottomElevation < profile.bottomElevation - 1e-10
      ) {
        throw new Error("The wall reference line must lie inside the GroundProfile.");
      }

      const geometryAngleUnits = geometry.angleUnits ?? "rad";
      const wallInclination = normalizeAngle(
        geometry.wallInclinationFromVertical ?? 0,
        geometryAngleUnits,
        "geometry.wallInclinationFromVertical",
      );
      const backfillInclination = normalizeAngle(
        geometry.backfillInclination ?? 0,
        geometryAngleUnits,
        "geometry.backfillInclination",
      );
      if (
        (Math.abs(wallInclination) > 1e-14 ||
          Math.abs(backfillInclination) > 1e-14) &&
        !["coulomb-active", "coulomb-passive", "trial-wedge-pseudostatic"].includes(
          selectedMethod,
        )
      ) {
        return geotechnicalCalculationResult({
          status: "not-supported",
          summary:
            `${selectedMethod} does not support the selected wall or retained-surface inclination.`,
        });
      }

      const interfaceResolution = resolveSoilStructureInterface({
        input: soilStructureInterface,
        interfaceParameterSetId,
        profile,
        topElevation,
        bottomElevation,
        parameterSetId,
        parameterSetByLayer,
        parameterSetByMaterial,
        allowIndicativeValues,
      });
      if (interfaceResolution.unsupported) {
        return geotechnicalCalculationResult({
          status: "not-supported",
          summary: interfaceResolution.unsupported,
          warnings: interfaceResolution.warnings,
        });
      }
      const interfaceAngle = interfaceResolution.frictionAngle;
      const normalizedSurcharge = resolver.stress(Number(surcharge ?? 0));
      if (!Number.isFinite(normalizedSurcharge) || normalizedSurcharge < 0) {
        throw new Error("surcharge must be non-negative.");
      }

      if (state === "seismic-active") {
        if (selectedMethod === "trial-wedge-pseudostatic") {
          return trialWedgeAnalysis({
            profile,
            topElevation,
            bottomElevation,
            surcharge: normalizedSurcharge,
            interfaceAngle,
            interfaceResolution,
            wallInclination,
            backfillInclination,
            parameterSetId,
            parameterSetByLayer,
            parameterSetByMaterial,
            allowIndicativeValues,
            seismic,
          });
        }
        if (selectedMethod !== "mononobe-okabe-active") {
          return geotechnicalCalculationResult({
            status: "not-supported",
            summary: `${selectedMethod} is not available for seismic-active pressure.`,
          });
        }
        return seismicActiveAnalysis({
          profile,
          topElevation,
          bottomElevation,
          surcharge: normalizedSurcharge,
          interfaceAngle,
          interfaceResolution,
          parameterSetId,
          parameterSetByLayer,
          parameterSetByMaterial,
          allowIndicativeValues,
          seismic,
        });
      }

      if (selectedMethod === "trial-wedge-pseudostatic") {
        return geotechnicalCalculationResult({
          status: "not-supported",
          summary:
            "trial-wedge-pseudostatic is available for the seismic-active state only.",
        });
      }

      return staticAnalysis({
        profile,
        state,
        method: selectedMethod,
        topElevation,
        bottomElevation,
        surcharge: normalizedSurcharge,
        interfaceAngle,
        interfaceResolution,
        wallInclination,
        backfillInclination,
        parameterSetId,
        parameterSetByLayer,
        parameterSetByMaterial,
        allowIndicativeValues,
      });
    } catch (error) {
      return geotechnicalCalculationResult({
        status: "failed",
        summary: "Lateral earth-pressure analysis failed.",
        warnings: [error.message],
        metadata: { errorName: error.name },
      });
    }
  }
}
