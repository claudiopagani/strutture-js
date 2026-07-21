import { assertExplicitUnitSystem } from "../units/UnitSystem.js";
import { AxialPileLoadScenario } from "./AxialPileLoadScenario.js";
import { DeepFoundationModel } from "./DeepFoundationModel.js";
import { GeotechnicalDesignSituation } from
  "./GeotechnicalDesignSituation.js";
import { GroundModel } from "./GroundModel.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";
import { VerticalStressProfile } from "./VerticalStressProfile.js";

export const AXIAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION =
  "axial-pile-capacity-result/v1";

export const AXIAL_PILE_CAPACITY_REFERENCE =
  "USACE EM 1110-2-2906 (1991), paragraphs 4-3a(1)-(4), equations for axial pile capacity";

const TOLERANCE = 1e-10;
const USACE_LAYER_PROXIMITY_MINIMUM = 1.524;

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

function normalizeGroundModel(value, units) {
  return value instanceof GroundModel
    ? value
    : new GroundModel({ ...value, units: value?.units ?? units });
}

function normalizeDesignSituation(value, groundModel, units) {
  return value instanceof GeotechnicalDesignSituation
    ? value
    : new GeotechnicalDesignSituation({
        ...value,
        groundModel,
        units: value?.units ?? units,
      });
}

function normalizePile(value, units) {
  return value instanceof DeepFoundationModel
    ? value
    : new DeepFoundationModel({ ...value, units: value?.units ?? units });
}

function normalizeScenario(value, units) {
  return value instanceof AxialPileLoadScenario
    ? value
    : new AxialPileLoadScenario({ ...value, units: value?.units ?? units });
}

function cap(value, maximum) {
  return maximum == null ? value : Math.min(value, maximum);
}

function averageCappedLinear(topValue, bottomValue, maximum) {
  if (maximum == null) return (topValue + bottomValue) / 2;
  const top = Math.max(topValue, 0);
  const bottom = Math.max(bottomValue, 0);
  if (top <= maximum && bottom <= maximum) return (top + bottom) / 2;
  if (top >= maximum && bottom >= maximum) return maximum;
  const low = Math.min(top, bottom);
  const high = Math.max(top, bottom);
  const lowFraction = (maximum - low) / (high - low);
  return lowFraction * (low + maximum) / 2 +
    (1 - lowFraction) * maximum;
}

function shaftLayerIntervals(profile, topElevation, toeElevation) {
  return profile.layers.flatMap((layer) => {
    const top = Math.min(layer.topElevation, topElevation);
    const bottom = Math.max(layer.bottomElevation, toeElevation);
    if (top <= bottom + TOLERANCE) return [];
    return [{ layer, topElevation: top, bottomElevation: bottom }];
  });
}

function resolveLayerParameters(designSituation, groundModel, layer) {
  return designSituation.resolveParameterSet({
    groundModel,
    layerId: layer.id,
    materialId: layer.materialId,
  });
}

function requireStrengthModel(parameterResolution, expected, method, layerId) {
  const actual = parameterResolution.parameterSet.strength.model;
  if (actual !== expected) {
    throw new Error(
      `${method} in layer ${layerId} requires strength model ${expected}, not ${actual}.`,
    );
  }
}

function betaStressLimit(method) {
  let limit = method.maximumEffectiveVerticalStress;
  if (method.maximumUnitResistance != null && method.beta > 0) {
    const unitLimit = method.maximumUnitResistance / method.beta;
    limit = limit == null ? unitLimit : Math.min(limit, unitLimit);
  }
  return limit;
}

function calculateEffectiveStressShaft({
  interval,
  method,
  stressProfile,
  shaftPerimeter,
}) {
  const breakpoints = stressProfile.breakpoints({
    topElevation: interval.topElevation,
    bottomElevation: interval.bottomElevation,
  });
  const stressLimit = betaStressLimit(method);
  const subsegments = [];
  let resistance = 0;
  for (let index = 0; index < breakpoints.length - 1; index += 1) {
    const topElevation = breakpoints[index];
    const bottomElevation = breakpoints[index + 1];
    const length = topElevation - bottomElevation;
    const topStress = Math.max(
      stressProfile.evaluate(topElevation).effectiveVerticalStress,
      0,
    );
    const bottomStress = Math.max(
      stressProfile.evaluate(bottomElevation).effectiveVerticalStress,
      0,
    );
    const averageEffectiveStress = averageCappedLinear(
      topStress,
      bottomStress,
      stressLimit,
    );
    const averageUnitResistance = cap(
      method.beta * averageEffectiveStress,
      method.maximumUnitResistance,
    );
    const sideArea = shaftPerimeter * length;
    const segmentResistance = averageUnitResistance * sideArea;
    resistance += segmentResistance;
    subsegments.push({
      topElevation,
      bottomElevation,
      length,
      effectiveVerticalStress: {
        top: topStress,
        bottom: bottomStress,
        averageAfterLimit: averageEffectiveStress,
        limit: stressLimit,
      },
      averageUnitResistance,
      sideArea,
      resistance: segmentResistance,
    });
  }
  return { resistance, subsegments };
}

function calculateShaftLayer({
  interval,
  method,
  parameterResolution,
  stressProfile,
  shaftPerimeter,
}) {
  const length = interval.topElevation - interval.bottomElevation;
  const sideArea = shaftPerimeter * length;
  let resistance;
  let averageUnitResistance;
  let subsegments = [];
  if (method.method === "alpha-undrained") {
    requireStrengthModel(
      parameterResolution,
      "total-stress-undrained",
      method.method,
      interval.layer.id,
    );
    const undrainedShearStrength =
      parameterResolution.parameterSet.strength.undrainedShearStrength;
    averageUnitResistance = cap(
      method.adhesionFactor * undrainedShearStrength,
      method.maximumUnitResistance,
    );
    resistance = averageUnitResistance * sideArea;
  } else if (method.method === "effective-stress") {
    requireStrengthModel(
      parameterResolution,
      "mohr-coulomb-effective",
      method.method,
      interval.layer.id,
    );
    const calculated = calculateEffectiveStressShaft({
      interval,
      method,
      stressProfile,
      shaftPerimeter,
    });
    resistance = calculated.resistance;
    subsegments = calculated.subsegments;
    averageUnitResistance = resistance / sideArea;
  } else {
    averageUnitResistance = cap(
      method.assignedUnitResistance,
      method.maximumUnitResistance,
    );
    resistance = averageUnitResistance * sideArea;
  }
  return {
    layerId: interval.layer.id,
    materialId: interval.layer.materialId,
    topElevation: interval.topElevation,
    bottomElevation: interval.bottomElevation,
    length,
    shaftPerimeter,
    sideArea,
    method: structuredClone(method),
    parameterResolution,
    averageUnitResistance,
    resistance,
    subsegments,
  };
}

function toeLayer(profile, bearingLayerId, toeElevation) {
  const layer = profile.layers.find(({ id }) => id === bearingLayerId);
  if (!layer) {
    throw new Error(`Unknown base bearing layer: ${bearingLayerId}.`);
  }
  const isAtOrBelowTop = toeElevation <= layer.topElevation + TOLERANCE;
  const isAboveBottom = toeElevation > layer.bottomElevation + TOLERANCE;
  if (!isAtOrBelowTop || !isAboveBottom) {
    throw new Error(
      `Pile toe elevation ${toeElevation} is not in bearing layer ${layer.id}; at an interface select the layer below the toe explicitly.`,
    );
  }
  return layer;
}

function calculateBase({
  profile,
  groundModel,
  designSituation,
  pile,
  method,
  stressProfile,
}) {
  const layer = toeLayer(
    profile,
    method.bearingLayerId,
    pile.placement.toeElevation,
  );
  const parameterResolution = resolveLayerParameters(
    designSituation,
    groundModel,
    layer,
  );
  const toeStress = stressProfile.evaluate(pile.placement.toeElevation);
  let unitResistance;
  if (method.method === "undrained-nc") {
    requireStrengthModel(
      parameterResolution,
      "total-stress-undrained",
      method.method,
      layer.id,
    );
    unitResistance = method.bearingCapacityFactor *
      parameterResolution.parameterSet.strength.undrainedShearStrength;
  } else if (method.method === "effective-stress-nq") {
    requireStrengthModel(
      parameterResolution,
      "mohr-coulomb-effective",
      method.method,
      layer.id,
    );
    unitResistance = method.bearingCapacityFactor * Math.min(
      Math.max(toeStress.effectiveVerticalStress, 0),
      method.maximumEffectiveVerticalStress ?? Infinity,
    );
  } else {
    unitResistance = method.assignedUnitResistance;
  }
  unitResistance = cap(unitResistance, method.maximumUnitResistance);
  return {
    status: "included",
    layerId: layer.id,
    materialId: layer.materialId,
    toeElevation: pile.placement.toeElevation,
    baseArea: pile.geometry.baseArea,
    method: structuredClone(method),
    parameterResolution,
    stressAtToe: toeStress,
    unitResistance,
    resistance: unitResistance * pile.geometry.baseArea,
  };
}

function layerBoundaryAssessment(profile, pile) {
  const influenceDistance = Math.max(
    USACE_LAYER_PROXIMITY_MINIMUM,
    8 * pile.geometry.equivalentDiameter,
  );
  const boundaries = profile.layers.slice(1).map((layer) => ({
    elevation: layer.topElevation,
    distanceFromToe: Math.abs(layer.topElevation - pile.placement.toeElevation),
    lowerLayerId: layer.id,
  })).sort((left, right) => left.distanceFromToe - right.distanceFromToe);
  const nearby = boundaries.filter(({ distanceFromToe }) =>
    distanceFromToe <= influenceDistance + TOLERANCE);
  return {
    status: nearby.length > 0 ? "review-required" : "no-boundary-in-screening-zone",
    influenceDistance,
    criterion:
      "screen for dissimilar layers within max(1.524 m, 8 equivalent diameters); no automatic resistance reduction",
    nearbyBoundaries: nearby,
  };
}

function capacityConversion({ scenario, shaftResistance, baseResistance }) {
  const conversion = scenario.resistanceConversion;
  if (conversion == null) {
    return {
      status: "not-performed",
      calculatedUltimateResistance: shaftResistance + baseResistance,
      convertedResistance: null,
      reason:
        "No explicit resistance conversion was supplied; no design resistance is inferred.",
    };
  }
  const convertedShaft = shaftResistance / conversion.shaftDivisor;
  const convertedBase = scenario.direction === "compression"
    ? baseResistance / conversion.baseDivisor
    : 0;
  return {
    status: "performed",
    model: conversion.model,
    calculatedUltimateResistance: shaftResistance + baseResistance,
    convertedShaftResistance: convertedShaft,
    convertedBaseResistance: convertedBase,
    convertedResistance:
      (convertedShaft + convertedBase) / conversion.overallDivisor,
    conversion: structuredClone(conversion),
  };
}

export class AxialPileCapacityAnalysis {
  analyze({
    groundModel: groundModelInput,
    designSituation: designSituationInput,
    pile: pileInput,
    scenario: scenarioInput,
    profileId = null,
    units = null,
  } = {}) {
    try {
      assertExplicitUnitSystem(units, "AxialPileCapacityAnalysis");
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
          summary: "Axial pile capacity requires limitState=ULS.",
        });
      }
      if (designSituation.seismic.model !== "none") {
        return result({
          status: "not-supported",
          summary:
            "Seismic axial pile capacity is not implemented in this static solver.",
        });
      }
      const pile = normalizePile(pileInput, units);
      const scenario = normalizeScenario(scenarioInput, units);
      const profile = groundModel.getProfile(
        profileId ?? designSituation.spatialSelection.profileId,
      );
      if (!profile) {
        return result({
          status: "not-supported",
          summary: "A GroundProfile is required for axial pile capacity.",
        });
      }
      if (
        pile.placement.soilContactTopElevation >
          profile.groundSurfaceElevation + TOLERANCE
      ) {
        throw new Error(
          "Pile soilContactTopElevation cannot be above the GroundProfile surface.",
        );
      }
      if (
        pile.placement.toeElevation <= profile.bottomElevation + TOLERANCE ||
        pile.placement.soilContactTopElevation >
          profile.groundSurfaceElevation + TOLERANCE
      ) {
        throw new Error(
          "The GroundProfile must contain the complete soil-contact shaft and extend below the pile toe.",
        );
      }
      const intervals = shaftLayerIntervals(
        profile,
        pile.placement.soilContactTopElevation,
        pile.placement.toeElevation,
      );
      if (intervals.length === 0) {
        throw new Error("No GroundProfile layer intersects the pile shaft.");
      }
      const stressProfile = new VerticalStressProfile({
        profile,
        surcharge: scenario.surfaceSurcharge,
      });
      const shaftContributions = intervals.map((interval) => {
        const method = scenario.shaftResistanceByLayer[interval.layer.id];
        if (!method) {
          throw new Error(
            `Missing shaft-resistance definition for intersected layer ${interval.layer.id}.`,
          );
        }
        return calculateShaftLayer({
          interval,
          method,
          parameterResolution: resolveLayerParameters(
            designSituation,
            groundModel,
            interval.layer,
          ),
          stressProfile,
          shaftPerimeter: pile.geometry.shaftPerimeter,
        });
      });
      const shaftResistance = shaftContributions.reduce(
        (sum, contribution) => sum + contribution.resistance,
        0,
      );
      const base = scenario.direction === "compression"
        ? calculateBase({
            profile,
            groundModel,
            designSituation,
            pile,
            method: scenario.baseResistance,
            stressProfile,
          })
        : {
            status: "not-included",
            reason: "Pile tip resistance is excluded from tension capacity.",
            resistance: 0,
          };
      const boundaryAssessment = scenario.direction === "compression"
        ? layerBoundaryAssessment(profile, pile)
        : {
            status: "not-applicable",
            reason:
              "Pile tip resistance is excluded from the selected tension capacity.",
            influenceDistance: null,
            nearbyBoundaries: [],
          };
      const conversion = capacityConversion({
        scenario,
        shaftResistance,
        baseResistance: base.resistance,
      });
      const demand = scenario.action?.axialForce ?? null;
      const verification = demand == null
        ? {
            status: "not-performed",
            reason: "No pile-head axial action was supplied.",
            demand: null,
            capacity: conversion.convertedResistance,
            utilizationRatio: null,
          }
        : conversion.status !== "performed"
          ? {
              status: "not-performed",
              reason:
                "An action was supplied, but design verification requires an explicit resistance conversion.",
              demand,
              capacity: null,
              utilizationRatio: null,
              calculatedUltimateCapacityRatio:
                demand / conversion.calculatedUltimateResistance,
            }
          : {
              status: demand <= conversion.convertedResistance + TOLERANCE
                ? "ok"
                : "not-verified",
              demand,
              capacity: conversion.convertedResistance,
              utilizationRatio: demand / conversion.convertedResistance,
              ok: demand <= conversion.convertedResistance + TOLERANCE,
            };
      const status = verification.status === "not-verified"
        ? "not-verified"
        : "ok";
      const warnings = [
        ...(scenario.resistanceConversion == null
          ? [
              "No normative or project resistance conversion is implicit; the reported total is a calculated ultimate resistance only.",
            ]
          : []),
        ...(scenario.action != null && !scenario.action.includesPileSelfWeight
          ? [
              "The pile-head action does not declare pile self-weight as included; self-weight is not added by this geotechnical solver.",
            ]
          : []),
        ...(boundaryAssessment.status === "review-required"
          ? [
              "A material boundary lies in the USACE toe screening zone; its influence on base resistance must be assessed by the selected method or reflected in assigned coefficients.",
            ]
          : []),
        "Peak shaft resistance compatibility between different layers is not solved; layer contributions are summed from the supplied method coefficients.",
      ];

      return result({
        status,
        summary: status === "not-verified"
          ? "Axial pile capacity was calculated, but the explicit design check is not verified."
          : "Single vertical pile axial capacity analysis completed.",
        outputs: {
          schemaVersion: AXIAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION,
          groundModelId: groundModel.id,
          designSituationId: designSituation.id,
          profileId: profile.id,
          pile: pile.toJSON(),
          scenario: scenario.toJSON(),
          shaft: {
            resistance: shaftResistance,
            contributions: shaftContributions,
          },
          base,
          capacity: {
            direction: scenario.direction,
            calculatedUltimateShaftResistance: shaftResistance,
            calculatedUltimateBaseResistance: base.resistance,
            calculatedUltimateResistance: conversion.calculatedUltimateResistance,
            convertedResistance: conversion.convertedResistance,
            conversion,
          },
          demand: scenario.action == null
            ? null
            : {
                axialForce: scenario.action.axialForce,
                direction: scenario.direction,
                referencePoint: scenario.action.referencePoint,
                basis: scenario.action.basis,
              },
          verification,
          checks: verification.status === "not-performed"
            ? []
            : [{
                id: "axial-geotechnical-resistance",
                demand: verification.demand,
                capacity: verification.capacity,
                utilizationRatio: verification.utilizationRatio,
                ok: verification.ok,
              }],
          utilizationRatio: verification.utilizationRatio,
          toeLayerBoundaryAssessment: boundaryAssessment,
          structuralCoupling: {
            level: "single-pile-capacity-mode",
            pileId: pile.id,
            actionReferencePoint: "pile-head",
            capacityMode: {
              status: "available",
              direction: scenario.direction,
              calculatedUltimateResistance:
                conversion.calculatedUltimateResistance,
              convertedResistance: conversion.convertedResistance,
            },
            responseMode: {
              status: "not-implemented",
              reason:
                "Axial t-z and q-z transfer laws require a separately sourced and validated response model.",
            },
            pileGroupTransfer: {
              status: "not-implemented",
              reason:
                "Pile-cap load distribution, group efficiency and pile interaction are outside the single-pile increment.",
            },
            structuralVerification: {
              status: "not-analyzed",
              reason:
                "Structural resistance of the pile section is checked by a structural module using pile actions.",
            },
          },
        },
        warnings,
        assumptions: [
          "The pile is single, vertical and has constant shaft perimeter and base area.",
          "Shaft resistance is integrated independently over each intersected GroundProfile layer.",
          "Effective-stress shaft resistance uses beta times effective vertical stress; beta may be assigned directly or resolved as K tan(delta).",
          "Undrained shaft resistance uses alpha times undrained shear strength.",
          "Compression capacity is shaft plus tip resistance; tension capacity contains shaft resistance only.",
          "Groundwater is hydrostatic as represented by GroundProfile and affects effective vertical stress.",
          "Negative skin friction, settlement, cyclic degradation, pile groups, inclined piles and seismic effects are excluded.",
        ],
        metadata: {
          references: [AXIAL_PILE_CAPACITY_REFERENCE],
          sourceUrl:
            "https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-2906.pdf",
          designSituation: designSituation.toJSON(),
          units: {
            force: GEOTECHNICAL_INTERNAL_UNITS.force,
            length: GEOTECHNICAL_INTERNAL_UNITS.length,
            stress: "kN/m2",
          },
        },
      });
    } catch (error) {
      return result({
        status: "failed",
        summary: "Axial pile capacity analysis failed.",
        warnings: [error.message],
        metadata: { errorName: error.name },
      });
    }
  }
}
