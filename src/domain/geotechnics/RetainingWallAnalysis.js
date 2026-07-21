import { RectangularFootingContactAnalysis } from
  "../foundations/RectangularFootingContactAnalysis.js";
import { assertExplicitUnitSystem } from "../units/UnitSystem.js";
import { CircularSlopeStabilityAnalysis } from
  "./CircularSlopeStabilityAnalysis.js";
import { GeotechnicalDesignSituation } from
  "./GeotechnicalDesignSituation.js";
import { GroundModel } from "./GroundModel.js";
import { LateralEarthPressureAnalysis } from
  "./LateralEarthPressureAnalysis.js";
import {
  RetainingWallLoadScenario,
} from "./RetainingWallLoadScenario.js";
import {
  RetainingWallModel,
  calculateRetainingWallPolygonProperties,
} from "./RetainingWallModel.js";
import {
  ShallowFoundationActionState,
} from "./ShallowFoundationModel.js";
import {
  ShallowFoundationUltimateLimitStateAnalysis,
  calculateShallowFoundationEffectiveGeometry,
  calculateShallowFoundationSlidingResistance,
} from "./ShallowFoundationUltimateLimitStateAnalysis.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION =
  "retaining-wall-analysis-result/v1";

const USACE_2022_REFERENCE =
  "USACE EM 1110-2-2502 (2022), Retaining and Flood Walls";
const USACE_2022_URL =
  "https://www.publications.usace.army.mil/Portals/76/Users/182/86/2486/EM%201110-2-2502.pdf";
const USACE_1989_REFERENCE =
  "USACE EM 1110-2-2502 (1989), Chapter 4, Stability Analysis";
const USACE_1989_URL =
  "https://www.publications.usace.army.mil/portals/76/publications/engineermanuals/em_1110-2-2502.pdf";
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
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

function normalizeWall(input, units) {
  return input instanceof RetainingWallModel
    ? input
    : new RetainingWallModel({ ...input, units: input?.units ?? units });
}

function normalizeScenario(input, units) {
  return input instanceof RetainingWallLoadScenario
    ? input
    : new RetainingWallLoadScenario({
        ...input,
        units: input?.units ?? units,
      });
}

function notSupported(message) {
  const error = new Error(message);
  error.name = "RetainingWallNotSupportedError";
  return error;
}

function makeLoad({
  id,
  name = null,
  category,
  source,
  forceX,
  forceZ,
  point,
  metadata = {},
}) {
  const momentAboutToe = point.x * forceZ - point.z * forceX;
  return {
    id,
    name: name ?? id,
    category,
    source,
    force: { x: forceX, z: forceZ },
    applicationPoint: { ...point },
    momentAboutToe,
    metadata: structuredClone(metadata ?? {}),
  };
}

function interpolateFaceX(face, z) {
  const ratio = (z - face.bottom.z) / (face.top.z - face.bottom.z);
  return face.bottom.x + ratio * (face.top.x - face.bottom.x);
}

function pressureComponentLoad({
  id,
  category,
  side,
  component,
  magnitude,
  applicationElevation,
  wall,
  face,
  inclination,
  applicationX = null,
  mobilizationFactor = 1,
}) {
  if (Math.abs(magnitude) <= TOLERANCE || applicationElevation == null) {
    return null;
  }
  const z = applicationElevation - wall.baseGlobalElevation;
  const x = applicationX ?? interpolateFaceX(face, z);
  const scaled = magnitude * mobilizationFactor;
  let forceX;
  let forceZ;
  if (side === "retained") {
    if (component === "normal") {
      forceX = -scaled * Math.cos(inclination);
      forceZ = scaled * Math.sin(inclination);
    } else {
      forceX = -scaled * Math.sin(inclination);
      forceZ = -scaled * Math.cos(inclination);
    }
  } else if (component === "normal") {
    forceX = scaled * Math.cos(inclination);
    forceZ = -scaled * Math.sin(inclination);
  } else {
    forceX = -scaled * Math.sin(inclination);
    forceZ = -scaled * Math.cos(inclination);
  }
  return makeLoad({
    id,
    category,
    source: `${side}-earth-pressure`,
    forceX,
    forceZ,
    point: { x, z },
    metadata: {
      side,
      component,
      unscaledMagnitude: magnitude,
      mobilizationFactor,
      applicationElevation,
    },
  });
}

function buildPressureLoads({
  pressureResult,
  side,
  wall,
  face,
  inclination,
  applicationX = null,
  soilMobilizationFactor = 1,
  resultantApplicationHeightRatio = null,
}) {
  const outputs = pressureResult.outputs;
  if (outputs.diagram) {
    const resultants = outputs.diagram.resultants;
    return [
      pressureComponentLoad({
        id: `${side}-soil-normal`,
        category: side === "retained" ? "earth-pressure" : "passive-pressure",
        side,
        component: "normal",
        magnitude: resultants.soilNormal.forcePerUnitWidth,
        applicationElevation: resultants.soilNormal.applicationElevation,
        wall,
        face,
        inclination,
        applicationX,
        mobilizationFactor: soilMobilizationFactor,
      }),
      pressureComponentLoad({
        id: `${side}-soil-tangent`,
        category: side === "retained" ? "earth-pressure" : "passive-pressure",
        side,
        component: "tangent",
        magnitude: resultants.soilTangent.forcePerUnitWidth,
        applicationElevation: resultants.soilTangent.applicationElevation,
        wall,
        face,
        inclination,
        applicationX,
        mobilizationFactor: soilMobilizationFactor,
      }),
      pressureComponentLoad({
        id: `${side}-water-normal`,
        category: "water-pressure",
        side,
        component: "normal",
        magnitude: resultants.waterNormal.forcePerUnitWidth,
        applicationElevation: resultants.waterNormal.applicationElevation,
        wall,
        face,
        inclination,
        applicationX,
      }),
    ].filter(Boolean);
  }

  const seismic = outputs.resultants?.seismicTotal;
  if (!seismic) {
    throw notSupported(`${side} pressure output has neither a diagram nor a resultant.`);
  }
  const bottomElevation = wall.baseGlobalElevation + face.bottom.z;
  const topElevation = wall.baseGlobalElevation + face.top.z;
  const applicationElevation = seismic.applicationElevation ??
    (resultantApplicationHeightRatio == null
      ? null
      : bottomElevation +
        resultantApplicationHeightRatio * (topElevation - bottomElevation));
  if (applicationElevation == null) {
    throw notSupported(
      `${side} resultant-only pressure requires an explicit resultantApplicationHeightRatio.`,
    );
  }
  const z = applicationElevation - wall.baseGlobalElevation;
  const x = applicationX ?? interpolateFaceX(face, z);
  let forceX;
  let forceZ;
  if (side === "retained") {
    forceX = -seismic.normal * Math.cos(inclination) -
      seismic.tangent * Math.sin(inclination);
    forceZ = seismic.normal * Math.sin(inclination) -
      seismic.tangent * Math.cos(inclination);
  } else {
    forceX = seismic.normal * Math.cos(inclination) -
      seismic.tangent * Math.sin(inclination);
    forceZ = -seismic.normal * Math.sin(inclination) -
      seismic.tangent * Math.cos(inclination);
  }
  return [makeLoad({
    id: `${side}-seismic-total`,
    category: side === "retained" ? "seismic-earth-pressure" : "passive-pressure",
    source: `${side}-earth-pressure`,
    forceX: forceX * soilMobilizationFactor,
    forceZ: forceZ * soilMobilizationFactor,
    point: { x, z },
    metadata: {
      side,
      component: "seismic-total",
      resultantApplicationHeightRatio,
      assignedApplicationElevation: applicationElevation,
      mobilizationFactor: soilMobilizationFactor,
    },
  })];
}

function pressureInput({
  profile,
  state,
  method,
  topElevation,
  bottomElevation,
  wallInclinationFromVertical,
  backfillInclination,
  interfaceModel,
  interfaceParameterSetId,
  surcharge,
  parameterSetId,
  parameterSetByLayer,
  parameterSetByMaterial,
  allowIndicativeValues,
  seismic,
}) {
  return {
    profile,
    state,
    method,
    geometry: {
      topElevation,
      bottomElevation,
      wallInclinationFromVertical,
      backfillInclination,
      angleUnits: "rad",
    },
    interface: interfaceModel,
    interfaceParameterSetId,
    surcharge,
    parameterSetId,
    parameterSetByLayer,
    parameterSetByMaterial,
    allowIndicativeValues,
    seismic,
    units: GEOTECHNICAL_INTERNAL_UNITS,
  };
}

function clipAgainstElevation(polygon, elevation, keepAbove) {
  const output = [];
  const inside = (point) => keepAbove
    ? point.z >= elevation - TOLERANCE
    : point.z <= elevation + TOLERANCE;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const currentInside = inside(current);
    const nextInside = inside(next);
    if (currentInside) output.push(current);
    if (currentInside !== nextInside) {
      const ratio = (elevation - current.z) / (next.z - current.z);
      output.push({
        x: current.x + ratio * (next.x - current.x),
        z: elevation,
      });
    }
  }
  return output;
}

function clipToBand(polygon, bottom, top) {
  const belowTop = clipAgainstElevation(polygon, top, false);
  if (belowTop.length < 3) return [];
  return clipAgainstElevation(belowTop, bottom, true);
}

function retainedSoilPolygon(wall, backfillInclination) {
  const faceBottom = wall.retainedFace.bottom;
  const faceTop = wall.retainedFace.top;
  const heelBottom = wall.retainedSoil.heelPoint;
  if (faceTop.x >= heelBottom.x - TOLERANCE) {
    throw notSupported(
      "The retained face reaches or crosses the heel; an automatic soil-over-heel polygon cannot be formed.",
    );
  }
  const heelTop = {
    x: heelBottom.x,
    z: faceTop.z + Math.tan(backfillInclination) *
      (heelBottom.x - faceTop.x),
  };
  if (heelTop.z <= heelBottom.z + TOLERANCE) {
    throw notSupported(
      "The retained surface reaches the heel at or below its bearing point; an automatic soil-over-heel polygon cannot be formed.",
    );
  }
  const polygon = [faceBottom, heelBottom, heelTop, faceTop];
  const properties = calculateRetainingWallPolygonProperties(polygon);
  if (properties.area <= TOLERANCE) {
    throw notSupported("The automatic soil-over-heel polygon has zero area.");
  }
  return { polygon, heelTop };
}

function layerForElevation(profile, elevation) {
  if (elevation > profile.groundSurfaceElevation + TOLERANCE) {
    return profile.layers[0];
  }
  return profile.getLayerAtElevation(elevation);
}

function soilOverHeelLoads({ wall, profile, backfillInclination, warnings }) {
  const geometry = retainedSoilPolygon(wall, backfillInclination);
  const minimumZ = Math.min(...geometry.polygon.map(({ z }) => z));
  const maximumZ = Math.max(...geometry.polygon.map(({ z }) => z));
  const groundwaterElevation = profile.groundwater.model === "hydrostatic"
    ? profile.groundwater.waterTableElevation
    : null;
  const boundaries = new Set([minimumZ, maximumZ]);
  for (const layer of profile.layers) {
    boundaries.add(layer.topElevation - wall.baseGlobalElevation);
    boundaries.add(layer.bottomElevation - wall.baseGlobalElevation);
  }
  if (groundwaterElevation != null) {
    boundaries.add(groundwaterElevation - wall.baseGlobalElevation);
  }
  const sorted = [...boundaries]
    .filter((value) => value >= minimumZ - TOLERANCE &&
      value <= maximumZ + TOLERANCE)
    .sort((left, right) => left - right);
  const loads = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const bottom = sorted[index];
    const top = sorted[index + 1];
    if (top <= bottom + TOLERANCE) continue;
    const clipped = clipToBand(geometry.polygon, bottom, top);
    if (clipped.length < 3) continue;
    const properties = calculateRetainingWallPolygonProperties(clipped);
    if (properties.area <= TOLERANCE) continue;
    const globalMidElevation = wall.baseGlobalElevation + (bottom + top) / 2;
    const layer = layerForElevation(profile, globalMidElevation);
    const material = profile.getMaterial(layer.materialId);
    const saturated = groundwaterElevation != null &&
      globalMidElevation < groundwaterElevation - TOLERANCE;
    let unitWeight = saturated
      ? material.unitWeight.saturated
      : material.unitWeight.bulk;
    if (unitWeight == null) {
      unitWeight = material.unitWeight.bulk;
      warnings.push(
        `Material ${material.id} has no saturated unit weight; bulk unit weight was used below groundwater for soil over the heel.`,
      );
    }
    const weight = properties.area * unitWeight;
    loads.push(makeLoad({
      id: `soil-over-heel-${index + 1}`,
      category: "soil-over-heel",
      source: "retained-profile",
      forceX: 0,
      forceZ: -weight,
      point: properties.centroid,
      metadata: {
        seismicMassWeight: weight,
        layerId: layer.id,
        materialId: material.id,
        saturated,
        unitWeight,
        polygon: clipped,
        area: properties.area,
      },
    }));
  }
  return { loads, geometry };
}

function wallWeightLoads(wall) {
  return wall.components.map((component) => makeLoad({
    id: `wall-component-${component.id}`,
    name: component.name,
    category: "wall-self-weight",
    source: "retaining-wall-model",
    forceX: 0,
    forceZ: -component.weightPerUnitWidth,
    point: component.centroid,
    metadata: {
      seismicMassWeight: component.weightPerUnitWidth,
      componentId: component.id,
      role: component.role,
      area: component.area,
      unitWeight: component.unitWeight,
    },
  }));
}

function surchargeOverHeelLoad({ wall, scenario, soilGeometry }) {
  if (
    !scenario.retainedSide.includeSurchargeOverHeel ||
    scenario.retainedSide.surcharge <= TOLERANCE
  ) return null;
  const minimumX = wall.retainedFace.top.x;
  const maximumX = soilGeometry.heelTop.x;
  const width = maximumX - minimumX;
  if (width <= TOLERANCE) return null;
  const force = scenario.retainedSide.surcharge * width;
  return makeLoad({
    id: "retained-surcharge-over-heel",
    category: "surface-surcharge",
    source: "retained-side-surcharge",
    forceX: 0,
    forceZ: -force,
    point: {
      x: (minimumX + maximumX) / 2,
      z: (
        wall.retainedFace.top.z + soilGeometry.heelTop.z
      ) / 2,
    },
    metadata: {
      intensity: scenario.retainedSide.surcharge,
      horizontalLoadedWidth: width,
      seismicMassWeight: 0,
    },
  });
}

function hydrostaticPressureAtBase(profile, baseElevation) {
  if (!profile || profile.groundwater.model === "none") return 0;
  return profile.groundwater.waterUnitWeight * Math.max(
    profile.groundwater.waterTableElevation - baseElevation,
    0,
  );
}

function upliftLoad({ wall, scenario, heelProfile, toeProfile, warnings }) {
  const heelPressure = hydrostaticPressureAtBase(
    heelProfile,
    wall.baseGlobalElevation,
  );
  const toePressure = hydrostaticPressureAtBase(
    toeProfile,
    wall.baseGlobalElevation,
  );
  if (toeProfile == null && heelPressure > TOLERANCE) {
    warnings.push(
      "No front-side or foundation profile was supplied; zero hydrostatic pressure was assumed at the toe of the base.",
    );
  }
  if (scenario.baseUplift.model === "none") {
    if (
      (heelPressure > TOLERANCE || toePressure > TOLERANCE) &&
      !scenario.baseUplift.justification
    ) {
      warnings.push(
        "Base uplift was disabled despite groundwater at the base and no justification was supplied.",
      );
    }
    return {
      load: null,
      output: {
        model: "none",
        toePressure,
        heelPressure,
        reductionFactor: scenario.baseUplift.reductionFactor,
        justification: scenario.baseUplift.justification,
      },
    };
  }
  const factor = scenario.baseUplift.reductionFactor;
  const width = wall.base.width;
  const uplift = factor * width * (toePressure + heelPressure) / 2;
  const denominator = toePressure + heelPressure;
  const distanceFromToe = denominator <= TOLERANCE
    ? width / 2
    : width * (toePressure + 2 * heelPressure) /
      (3 * denominator);
  return {
    load: uplift <= TOLERANCE ? null : makeLoad({
      id: "base-uplift",
      category: "base-uplift",
      source: "hydrostatic-base-pressure",
      forceX: 0,
      forceZ: uplift,
      point: { x: wall.base.toeX + distanceFromToe, z: 0 },
      metadata: {
        toePressure,
        heelPressure,
        reductionFactor: factor,
        pressureDistribution: "linear",
      },
    }),
    output: {
      model: "linear-hydrostatic",
      toePressure,
      heelPressure,
      reductionFactor: factor,
      forcePerUnitWidth: uplift,
      distanceFromToe,
    },
  };
}

function appliedLoads(scenario) {
  return scenario.appliedLoads.map((load) => makeLoad({
    id: `applied-${load.id}`,
    name: load.name,
    category: load.category,
    source: "assigned-load",
    forceX: load.horizontalForce,
    forceZ: -load.verticalForce,
    point: load.point,
    metadata: load.metadata,
  }));
}

function seismicInertiaLoads(loads, designSituation, scenario) {
  if (designSituation.seismic.model !== "pseudostatic") return [];
  if (!scenario.seismicDirection) {
    throw notSupported(
      "A pseudostatic wall analysis requires an explicit seismicDirection.",
    );
  }
  const horizontalSign = scenario.seismicDirection === "retained-to-front"
    ? -1
    : 1;
  const { kh, kv } = designSituation.seismic;
  return loads.flatMap((load) => {
    const weight = load.metadata.seismicMassWeight ?? 0;
    if (weight <= TOLERANCE) return [];
    const inertia = [];
    if (Math.abs(kh) > TOLERANCE) {
      inertia.push(makeLoad({
        id: `${load.id}-horizontal-inertia`,
        category: "pseudostatic-inertia",
        source: load.id,
        forceX: horizontalSign * kh * weight,
        forceZ: 0,
        point: load.applicationPoint,
        metadata: { kh, massWeight: weight, seismicDirection: scenario.seismicDirection },
      }));
    }
    if (Math.abs(kv) > TOLERANCE) {
      inertia.push(makeLoad({
        id: `${load.id}-vertical-inertia`,
        category: "pseudostatic-inertia",
        source: load.id,
        forceX: 0,
        forceZ: kv * weight,
        point: load.applicationPoint,
        metadata: {
          kv,
          massWeight: weight,
          convention: "positive-kv-reduces-effective-gravity",
        },
      }));
    }
    return inertia;
  });
}

function totals(loads, wall) {
  const forceX = loads.reduce((sum, load) => sum + load.force.x, 0);
  const forceZ = loads.reduce((sum, load) => sum + load.force.z, 0);
  const momentAboutToe = loads.reduce(
    (sum, load) => sum + load.momentAboutToe,
    0,
  );
  const verticalDownward = -forceZ;
  const resultantDistanceFromToe = verticalDownward > TOLERANCE
    ? -momentAboutToe / verticalDownward
    : null;
  const baseCenterX = (wall.base.toeX + wall.base.heelX) / 2;
  return {
    forceX,
    forceZ,
    verticalDownward,
    momentAboutToe,
    resultantDistanceFromToe,
    resultantLocalX: resultantDistanceFromToe == null
      ? null
      : wall.base.toeX + resultantDistanceFromToe,
    eccentricityFromBaseCenter: resultantDistanceFromToe == null
      ? null
      : resultantDistanceFromToe - wall.base.width / 2,
    baseCenterX,
    momentForFoundationAction: resultantDistanceFromToe == null
      ? null
      : verticalDownward * (
          wall.base.toeX + resultantDistanceFromToe - baseCenterX
        ),
  };
}

function contactAnalysis(equilibrium, wall) {
  if (
    equilibrium.verticalDownward <= TOLERANCE ||
    equilibrium.momentForFoundationAction == null
  ) {
    return {
      status: "no-compressive-equilibrium",
      contactType: "none",
      reason: "The net downward base action is non-positive.",
    };
  }
  return new RectangularFootingContactAnalysis().analyze({
    widthX: wall.base.width,
    widthY: 1,
    nEd: equilibrium.verticalDownward,
    mxEd: 0,
    myEd: equilibrium.momentForFoundationAction,
  });
}

function actionStateFromEquilibrium(wall, scenario, equilibrium) {
  if (
    equilibrium.verticalDownward <= TOLERANCE ||
    equilibrium.momentForFoundationAction == null
  ) return null;
  return new ShallowFoundationActionState({
    id: `${wall.id}-${scenario.id}-base-actions`,
    basis: "per-unit-length",
    resultantScope: "total-at-foundation-base",
    actions: {
      verticalForcePerUnitLength: equilibrium.verticalDownward,
      horizontalForcePerUnitLength: equilibrium.forceX,
      momentPerUnitLength: equilibrium.momentForFoundationAction,
    },
    units: GEOTECHNICAL_INTERNAL_UNITS,
    metadata: {
      sourceRetainingWallId: wall.id,
      sourceScenarioId: scenario.id,
      baseUpliftAlreadyIncluded: true,
    },
  });
}

function derivedFoundationSituation({
  designSituation,
  groundModel,
  scenario,
}) {
  const original = designSituation.toJSON();
  const requested = scenario.foundation.parameterSelection;
  return new GeotechnicalDesignSituation({
    ...original,
    id: `${designSituation.id}-${scenario.id}-foundation`,
    name: `${designSituation.name} - retaining-wall base`,
    groundModel,
    profileId: scenario.foundation.profileId,
    porePressureFieldId: scenario.foundation.porePressureFieldId ??
      designSituation.spatialSelection.porePressureFieldId,
    sectionId: null,
    parameterSelection: {
      byMaterial: {
        ...designSituation.parameterSelection.byMaterial,
        ...requested.byMaterial,
      },
      byLayer: requested.byLayer,
      byInterface: {
        ...designSituation.parameterSelection.byInterface,
        ...requested.byInterface,
      },
    },
    units: GEOTECHNICAL_INTERNAL_UNITS,
  });
}

function foundationCoupling({
  wall,
  scenario,
  groundModel,
  designSituation,
  actionState,
}) {
  if (!scenario.foundation.enabled) {
    return {
      baseSliding: {
        status: "not-analyzed",
        reason: "Supply foundation data and a base interface to calculate sliding resistance.",
      },
      bearing: { status: "not-analyzed" },
      designSituation: null,
    };
  }
  if (!actionState) {
    return {
      baseSliding: {
        status: "not-analyzed",
        reason: "A positive compressive base action is required.",
      },
      bearing: {
        status: "not-analyzed",
        reason: "A positive compressive base action is required.",
      },
      designSituation: null,
    };
  }
  const foundation = wall.toShallowFoundationModel();
  const foundationSituation = derivedFoundationSituation({
    designSituation,
    groundModel,
    scenario,
  });
  const profile = groundModel.getProfile(scenario.foundation.profileId);
  const layer = profile.getLayerAtElevation(
    wall.baseGlobalElevation - Math.max(1e-8, wall.base.width * 1e-8),
  );
  const resolution = foundationSituation.resolveParameterSet({
    groundModel,
    layerId: layer.id,
  });
  let baseSliding;
  if (scenario.foundation.baseInterface == null) {
    baseSliding = {
      status: "not-analyzed",
      reason: "foundation.baseInterface is required for base sliding.",
    };
  } else {
    try {
      const selectedInterfaceParameterSetId =
        scenario.foundation.interfaceParameterSetId ??
        foundationSituation.resolveInterfaceParameterSetId(
          scenario.foundation.baseInterface.id,
        );
      const selectedInterfaceSet = scenario.foundation.baseInterface
        .getParameterSet(selectedInterfaceParameterSetId);
      if (
        selectedInterfaceSet.basis === "indicative" &&
        !scenario.foundation.allowIndicativeValues &&
        !designSituation.allowIndicativeValues
      ) {
        throw new Error(
          "Indicative base-interface parameters were not explicitly authorized.",
        );
      }
      const effectiveGeometry = calculateShallowFoundationEffectiveGeometry({
        foundation,
        actionState,
      });
      baseSliding = calculateShallowFoundationSlidingResistance({
        parameterSet: resolution.parameterSet,
        effectiveGeometry,
        porePressureAtBase: 0,
        interfaceModel: scenario.foundation.baseInterface,
        interfaceParameterSetId: selectedInterfaceParameterSetId,
        drainedAdhesionRatio: scenario.foundation.drainedAdhesionRatio,
        undrainedAdhesionRatio: scenario.foundation.undrainedAdhesionRatio,
      });
      baseSliding.metadata = {
        ...baseSliding.metadata,
        upliftTreatment: "included-in-action-resultant",
        baseLayerId: layer.id,
        parameterResolution: resolution,
      };
    } catch (error) {
      baseSliding = { status: "not-analyzed", reason: error.message };
    }
  }
  const bearing = scenario.foundation.bearing.enabled
    ? new ShallowFoundationUltimateLimitStateAnalysis().analyze({
        groundModel,
        designSituation: foundationSituation,
        foundation,
        actionState,
        profileId: scenario.foundation.profileId,
        porePressureFieldId: scenario.foundation.porePressureFieldId,
        surfaceSurcharge: scenario.foundation.surfaceSurcharge,
        bearingSelection: scenario.foundation.bearing.selection,
        baseUpliftTreatment: "included-in-action-resultant",
        sliding: {},
        criteria: scenario.foundation.bearing.criteria,
        units: GEOTECHNICAL_INTERNAL_UNITS,
      })
    : { status: "not-analyzed", summary: "Bearing analysis was disabled." };
  return {
    foundation: foundation.toJSON(),
    actionState: actionState.toJSON(),
    baseSliding,
    bearing,
    designSituation: foundationSituation.toJSON(),
  };
}

function slidingOutput({ loads, baseSliding, criteria }) {
  const towardToe = loads.reduce(
    (sum, load) => sum + Math.max(-load.force.x, 0),
    0,
  );
  const towardRetainedSide = loads.reduce(
    (sum, load) => sum + Math.max(load.force.x, 0),
    0,
  );
  const netForce = loads.reduce(
    (sum, load) => sum + load.force.x,
    0,
  );
  const direction = netForce <= 0
    ? "retained-to-front"
    : "front-to-retained";
  const grossDriving = direction === "retained-to-front"
    ? towardToe
    : towardRetainedSide;
  const opposing = direction === "retained-to-front"
    ? towardRetainedSide
    : towardToe;
  const netDemand = Math.abs(netForce);
  const baseResistance = baseSliding.status === "ok"
    ? baseSliding.capacity
    : null;
  const factorOfSafety = baseResistance == null || grossDriving <= TOLERANCE
    ? null
    : (baseResistance + opposing) / grossDriving;
  const required = criteria.minimumSlidingFactorOfSafety;
  return {
    status: baseResistance == null ? "not-analyzed" : "ok",
    direction,
    actionsTowardToe: towardToe,
    actionsTowardRetainedSide: towardRetainedSide,
    grossDrivingDemand: grossDriving,
    opposingExternalActions: opposing,
    netHorizontalDemand: netDemand,
    baseResistance,
    totalResistanceAgainstGrossDriving: baseResistance == null
      ? null
      : baseResistance + opposing,
    factorOfSafety,
    requiredFactorOfSafety: required,
    utilizationRatio: baseResistance == null || baseResistance <= TOLERANCE
      ? null
      : netDemand / baseResistance,
    ok: required == null
      ? null
      : grossDriving <= TOLERANCE
        ? true
        : factorOfSafety == null
          ? null
          : factorOfSafety >= required,
    baseCalculation: baseSliding,
  };
}

function overturningOutput(loads, criteria) {
  const overturningMoment = loads.reduce(
    (sum, load) => sum + Math.max(load.momentAboutToe, 0),
    0,
  );
  const resistingMoment = loads.reduce(
    (sum, load) => sum + Math.max(-load.momentAboutToe, 0),
    0,
  );
  const factorOfSafety = overturningMoment > TOLERANCE
    ? resistingMoment / overturningMoment
    : null;
  const required = criteria.minimumOverturningFactorOfSafety;
  return {
    referencePoint: "base-toe",
    overturningMoment,
    resistingMoment,
    netMoment: overturningMoment - resistingMoment,
    factorOfSafety,
    requiredFactorOfSafety: required,
    utilizationRatio: resistingMoment > TOLERANCE
      ? overturningMoment / resistingMoment
      : overturningMoment <= TOLERANCE ? 0 : null,
    ok: required == null
      ? null
      : overturningMoment <= TOLERANCE
        ? true
        : factorOfSafety == null
          ? null
          : factorOfSafety >= required,
  };
}

function globalStabilityCoupling({
  wall,
  scenario,
  groundModel,
  designSituation,
}) {
  if (!scenario.globalStability.enabled) return { status: "not-analyzed" };
  if (designSituation.seismic.model !== "none") {
    return {
      status: "not-supported",
      reason:
        "Pseudostatic wall inertia cannot be represented by the current vertical surface-surcharge coupling.",
    };
  }
  const input = scenario.globalStability.analysisInput;
  const surfaceSurcharges = [...(input.surfaceSurcharges ?? [])];
  let equivalentWallSurcharge = null;
  if (scenario.globalStability.includeWallWeightAsSurcharge) {
    const weight = wall.components.reduce(
      (sum, component) => sum + component.weightPerUnitWidth,
      0,
    );
    equivalentWallSurcharge = {
      id: `${wall.id}-equivalent-global-stability-surcharge`,
      intensity: weight / wall.base.width,
      minimumX: wall.toeGlobalX,
      maximumX: wall.heelGlobalX,
      units: GEOTECHNICAL_INTERNAL_UNITS,
      metadata: {
        sourceRetainingWallId: wall.id,
        representation: "uniform-vertical-equivalent-surcharge",
      },
    };
    surfaceSurcharges.push(equivalentWallSurcharge);
  }
  const analysis = new CircularSlopeStabilityAnalysis().analyze({
    ...input,
    groundModel,
    designSituation,
    surfaceSurcharges,
    units: input.units ?? scenario.globalStability.inputUnits ??
      GEOTECHNICAL_INTERNAL_UNITS,
  });
  return {
    status: analysis.status,
    fidelity: "screening-equivalent-surcharge",
    equivalentWallSurcharge,
    analysis,
    warning:
      "The circular global-stability solver represents wall self-weight as a vertical surface surcharge; wall geometry, wall-soil contact forces and structural inertia are not finite elements.",
  };
}

export class RetainingWallAnalysis {
  analyze({
    groundModel: groundModelInput,
    designSituation: designSituationInput,
    wall: wallInput,
    scenario: scenarioInput,
    units = null,
  } = {}) {
    try {
      assertExplicitUnitSystem(units, "RetainingWallAnalysis");
      const groundModel = normalizeGroundModel(groundModelInput, units);
      const designSituation = normalizeDesignSituation(
        designSituationInput,
        groundModel,
        units,
      );
      designSituation.validateAgainst(groundModel);
      const wall = normalizeWall(wallInput, units);
      const scenario = normalizeScenario(scenarioInput, units);
      const pseudostatic = designSituation.seismic.model === "pseudostatic";
      if (pseudostatic && scenario.retainedSide.state !== "seismic-active") {
        throw notSupported(
          "A pseudostatic design situation requires retainedSide.state=seismic-active.",
        );
      }
      if (!pseudostatic && scenario.retainedSide.state === "seismic-active") {
        throw notSupported(
          "A seismic-active pressure state requires a pseudostatic design situation.",
        );
      }

      const warnings = [];
      const assumptions = [];
      const retainedProfile = groundModel.getProfile(
        scenario.retainedSide.profileId,
      );
      const retainedTop = wall.toGlobalPoint(wall.retainedFace.top).z;
      const retainedBottom = wall.toGlobalPoint(wall.retainedFace.bottom).z;
      const seismic = pseudostatic
        ? {
            ...scenario.retainedSide.seismic,
            kh: designSituation.seismic.kh,
            kv: designSituation.seismic.kv,
          }
        : scenario.retainedSide.seismic;
      const retainedPressure = new LateralEarthPressureAnalysis().analyze(
        pressureInput({
          profile: retainedProfile,
          state: scenario.retainedSide.state,
          method: scenario.retainedSide.method,
          topElevation: retainedTop,
          bottomElevation: retainedBottom,
          wallInclinationFromVertical:
            wall.retainedFace.inclinationFromVertical,
          backfillInclination: scenario.retainedSide.backfillInclination,
          interfaceModel: scenario.retainedSide.interface,
          interfaceParameterSetId:
            scenario.retainedSide.interfaceParameterSetId ??
            (scenario.retainedSide.interface == null
              ? null
              : designSituation.resolveInterfaceParameterSetId(
                  scenario.retainedSide.interface.id,
                )),
          surcharge: scenario.retainedSide.surcharge,
          parameterSetId: scenario.retainedSide.parameterSetId,
          parameterSetByLayer: {
            ...(designSituation.spatialSelection.profileId ===
                scenario.retainedSide.profileId
              ? designSituation.parameterSelection.byLayer
              : {}),
            ...scenario.retainedSide.parameterSetByLayer,
          },
          parameterSetByMaterial:
            {
              ...designSituation.parameterSelection.byMaterial,
              ...scenario.retainedSide.parameterSetByMaterial,
            },
          allowIndicativeValues:
            scenario.retainedSide.allowIndicativeValues ||
            designSituation.allowIndicativeValues,
          seismic,
        }),
      );
      if (retainedPressure.status !== "ok") {
        return result({
          status: retainedPressure.status,
          summary: `Retained-side pressure is unavailable: ${retainedPressure.summary}`,
          outputs: {
            schemaVersion: RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION,
            wall: wall.toJSON(),
            scenario: scenario.toJSON(),
            retainedPressure,
          },
          warnings: retainedPressure.warnings,
          metadata: { stage: "retained-pressure" },
        });
      }
      warnings.push(...retainedPressure.warnings);
      assumptions.push(...retainedPressure.assumptions);
      const loads = [
        ...wallWeightLoads(wall),
        ...buildPressureLoads({
          pressureResult: retainedPressure,
          side: "retained",
          wall,
          face: wall.retainedFace,
          inclination: wall.retainedFace.inclinationFromVertical,
          resultantApplicationHeightRatio:
            scenario.retainedSide.resultantApplicationHeightRatio,
        }),
      ];

      let soilGeometry = null;
      if (scenario.includeSoilOverHeel) {
        const soil = soilOverHeelLoads({
          wall,
          profile: retainedProfile,
          backfillInclination: scenario.retainedSide.backfillInclination,
          warnings,
        });
        soilGeometry = soil.geometry;
        loads.push(...soil.loads);
        const surcharge = surchargeOverHeelLoad({
          wall,
          scenario,
          soilGeometry,
        });
        if (surcharge) loads.push(surcharge);
      }

      let frontPressure = null;
      let frontProfile = null;
      if (scenario.frontSide.enabled) {
        frontProfile = groundModel.getProfile(scenario.frontSide.profileId);
        const topElevation = scenario.frontSide.topElevation ??
          frontProfile.groundSurfaceElevation;
        const bottomElevation = scenario.frontSide.bottomElevation ??
          wall.baseGlobalElevation;
        const physicalInclination = scenario.frontSide.wallInclinationFromVertical ??
          0;
        frontPressure = new LateralEarthPressureAnalysis().analyze(
          pressureInput({
            profile: frontProfile,
            state: "passive",
            method: scenario.frontSide.method,
            topElevation,
            bottomElevation,
            wallInclinationFromVertical: -physicalInclination,
            backfillInclination: scenario.frontSide.backfillInclination,
            interfaceModel: scenario.frontSide.interface,
            interfaceParameterSetId:
              scenario.frontSide.interfaceParameterSetId ??
              (scenario.frontSide.interface == null
                ? null
                : designSituation.resolveInterfaceParameterSetId(
                    scenario.frontSide.interface.id,
                  )),
            surcharge: scenario.frontSide.surcharge,
            parameterSetId: scenario.frontSide.parameterSetId,
            parameterSetByLayer: {
              ...(designSituation.spatialSelection.profileId ===
                  scenario.frontSide.profileId
                ? designSituation.parameterSelection.byLayer
                : {}),
              ...scenario.frontSide.parameterSetByLayer,
            },
            parameterSetByMaterial:
              {
                ...designSituation.parameterSelection.byMaterial,
                ...scenario.frontSide.parameterSetByMaterial,
              },
            allowIndicativeValues:
              scenario.frontSide.allowIndicativeValues ||
              designSituation.allowIndicativeValues,
            seismic: {},
          }),
        );
        if (frontPressure.status !== "ok") {
          return result({
            status: frontPressure.status,
            summary: `Front-side pressure is unavailable: ${frontPressure.summary}`,
            outputs: {
              schemaVersion: RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION,
              wall: wall.toJSON(),
              scenario: scenario.toJSON(),
              retainedPressure,
              frontPressure,
            },
            warnings: unique([...warnings, ...frontPressure.warnings]),
            metadata: { stage: "front-pressure" },
          });
        }
        warnings.push(...frontPressure.warnings);
        assumptions.push(...frontPressure.assumptions);
        const face = {
          bottom: {
            x: scenario.frontSide.applicationX ?? wall.base.toeX,
            z: bottomElevation - wall.baseGlobalElevation,
          },
          top: {
            x: (scenario.frontSide.applicationX ?? wall.base.toeX) +
              (topElevation - bottomElevation) * Math.tan(physicalInclination),
            z: topElevation - wall.baseGlobalElevation,
          },
        };
        loads.push(...buildPressureLoads({
          pressureResult: frontPressure,
          side: "front",
          wall,
          face,
          inclination: physicalInclination,
          soilMobilizationFactor: scenario.frontSide.mobilizationFactor,
        }));
      }

      const toeWaterProfile = frontProfile ??
        (scenario.foundation.enabled
          ? groundModel.getProfile(scenario.foundation.profileId)
          : null);
      const uplift = upliftLoad({
        wall,
        scenario,
        heelProfile: retainedProfile,
        toeProfile: toeWaterProfile,
        warnings,
      });
      if (uplift.load) loads.push(uplift.load);
      loads.push(...appliedLoads(scenario));
      const massLoads = [...loads];
      const inertia = seismicInertiaLoads(
        massLoads,
        designSituation,
        scenario,
      );
      loads.push(...inertia);
      if (pseudostatic && scenario.retainedSide.surcharge > TOLERANCE) {
        warnings.push(
          "The surface surcharge contributes to earth pressure but receives no separate inertial force in the retaining-wall rigid-body equilibrium.",
        );
      }

      const equilibrium = totals(loads, wall);
      const contact = contactAnalysis(equilibrium, wall);
      const actionState = actionStateFromEquilibrium(
        wall,
        scenario,
        equilibrium,
      );
      const foundation = foundationCoupling({
        wall,
        scenario,
        groundModel,
        designSituation,
        actionState,
      });
      const sliding = slidingOutput({
        loads,
        baseSliding: foundation.baseSliding,
        criteria: scenario.criteria,
      });
      const overturning = overturningOutput(loads, scenario.criteria);
      const globalStability = globalStabilityCoupling({
        wall,
        scenario,
        groundModel,
        designSituation,
      });
      if (globalStability.warning) warnings.push(globalStability.warning);

      const checks = [{
        id: "compressive-base-equilibrium",
        demand: contact.equilibriumUtilization ?? null,
        capacity: 1,
        utilizationRatio: contact.equilibriumUtilization ?? null,
        ok: contact.status === "ok",
      }, {
        id: "full-base-contact",
        demand: contact.kernUtilizationX ?? null,
        capacity: 1,
        utilizationRatio: contact.kernUtilizationX ?? null,
        ok: scenario.criteria.requireFullBaseContact
          ? contact.contactType === "full"
          : null,
      }, {
        id: "base-sliding",
        demand: sliding.grossDrivingDemand,
        capacity: sliding.totalResistanceAgainstGrossDriving,
        utilizationRatio: sliding.utilizationRatio,
        factorOfSafety: sliding.factorOfSafety,
        requiredFactorOfSafety: sliding.requiredFactorOfSafety,
        ok: sliding.ok,
      }, {
        id: "overturning-about-toe",
        demand: overturning.overturningMoment,
        capacity: overturning.resistingMoment,
        utilizationRatio: overturning.utilizationRatio,
        factorOfSafety: overturning.factorOfSafety,
        requiredFactorOfSafety: overturning.requiredFactorOfSafety,
        ok: overturning.ok,
      }];
      if (foundation.bearing.outputs?.checks) {
        checks.push(...foundation.bearing.outputs.checks.map((check) => ({
          ...check,
          id: `foundation-${check.id}`,
        })));
      }
      const failedCheck = checks.some(({ ok }) => ok === false);
      const requestedNotSupported =
        (scenario.criteria.minimumSlidingFactorOfSafety != null &&
          sliding.status !== "ok") ||
        (scenario.foundation.enabled &&
          scenario.foundation.bearing.enabled &&
          foundation.bearing.status === "not-supported") ||
        (scenario.globalStability.enabled &&
          globalStability.status === "not-supported");
      const coupledFailed =
        (scenario.foundation.enabled &&
          scenario.foundation.bearing.enabled &&
          foundation.bearing.status === "failed") ||
        (scenario.globalStability.enabled &&
          globalStability.status === "failed");
      const status = coupledFailed
        ? "failed"
        : requestedNotSupported
          ? "not-supported"
          : failedCheck || foundation.bearing.status === "not-verified"
            ? "not-verified"
            : "ok";

      return result({
        status,
        summary: status === "ok"
          ? "Retaining-wall actions, rigid-body equilibrium and requested geotechnical couplings completed."
          : status === "not-verified"
            ? "Retaining-wall analysis completed, but one or more explicit checks are not verified."
            : status === "not-supported"
              ? "Retaining-wall equilibrium completed, but a requested coupled analysis is outside its supported field."
              : "Retaining-wall equilibrium completed, but a requested coupled analysis failed.",
        outputs: {
          schemaVersion: RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION,
          groundModelId: groundModel.id,
          designSituationId: designSituation.id,
          wall: wall.toJSON(),
          scenario: scenario.toJSON(),
          pressureActions: {
            retained: retainedPressure,
            front: frontPressure,
          },
          soilOverHeel: soilGeometry == null
            ? { status: "not-included" }
            : { status: "included", geometry: soilGeometry },
          baseUplift: uplift.output,
          loads,
          equilibrium,
          sliding,
          overturning,
          contact,
          foundation,
          globalStability,
          checks,
          demand: {
            horizontal: sliding.grossDrivingDemand,
            overturningMoment: overturning.overturningMoment,
            maximumBasePressure: contact.maximumPressure ?? null,
          },
          capacity: {
            baseSliding: sliding.totalResistanceAgainstGrossDriving,
            overturningMoment: overturning.resistingMoment,
            bearingPressure:
              foundation.bearing.outputs?.capacity?.bearingPressure ?? null,
          },
          utilizationRatio: Math.max(
            ...checks.map(({ utilizationRatio }) => utilizationRatio ?? 0),
          ),
          structuralCoupling: {
            level: "actions-and-contact-transfer",
            retainedFacePressureDiagram:
              retainedPressure.outputs.diagram ?? null,
            frontFacePressureDiagram:
              frontPressure?.outputs?.diagram ?? null,
            rigidBodyLoads: loads,
            baseActionState: actionState?.toJSON() ?? null,
            compressionOnlyContact: contact,
            foundationCapacity: foundation.bearing.outputs ?? null,
            structuralVerification: {
              status: "not-analyzed",
              reason:
                "Stem, heel, toe and reinforcement checks belong to a structural retaining-wall verifier consuming these actions.",
            },
            femTransfer: {
              status: "contract-available",
              pressureDiagramBasis: "per-unit-vertical-projection",
              signConvention: {
                x: "positive-from-toe-toward-retained-side",
                z: "positive-upward",
                moment: "positive-counterclockwise",
              },
            },
          },
        },
        warnings: unique([
          ...warnings,
          ...(frontPressure && scenario.frontSide.mobilizationFactor > 0
            ? [
                `Front passive soil resistance is multiplied by the explicit mobilization factor ${scenario.frontSide.mobilizationFactor}; water pressure is not reduced.`,
              ]
            : []),
          ...(foundation.baseSliding.status !== "ok"
            ? [`Base sliding was not analyzed: ${foundation.baseSliding.reason}`]
            : []),
          ...(contact.contactType !== "full"
            ? [
                "The base is not in full compression; use the reported compression-only contact distribution for structural base actions.",
              ]
            : []),
        ]),
        assumptions: unique([
          ...assumptions,
          "The wall is analyzed in plane strain per unit out-of-plane width.",
          "The wall and assigned soil-over-heel loads are rigid-body actions; structural deformation is not used to redistribute earth pressure.",
          "Earth pressure acts on the retained face, while soil self-weight over the heel is transferred as a separate vertical action.",
          "The base reaction is compression-only and is reconstructed from the net vertical force and moment resultant.",
          "No normative partial factors or default safety-factor limits are introduced by the method-neutral solver.",
          pseudostatic
            ? "Pseudostatic wall and soil-over-heel inertia use the assigned kh and kv coefficients and do not predict dynamic response or permanent displacement."
            : "Wall and soil-over-heel inertia are absent in the static design situation.",
        ]),
        metadata: {
          method: "two-dimensional-rigid-body-limit-equilibrium",
          references: [{
            reference: USACE_2022_REFERENCE,
            url: USACE_2022_URL,
          }, {
            reference: USACE_1989_REFERENCE,
            url: USACE_1989_URL,
          }],
          designSituation: designSituation.toJSON(),
          units: {
            length: "m",
            forcePerUnitWidth: "kN/m",
            momentPerUnitWidth: "kN.m/m",
            pressure: "kN/m2",
            unitWeight: "kN/m3",
            angle: "rad",
          },
        },
      });
    } catch (error) {
      return result({
        status: error.name === "RetainingWallNotSupportedError"
          ? "not-supported"
          : "failed",
        summary: error.name === "RetainingWallNotSupportedError"
          ? error.message
          : "Retaining-wall analysis failed.",
        warnings: [error.message],
        metadata: { errorName: error.name },
      });
    }
  }
}
