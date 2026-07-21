import { assertExplicitUnitSystem } from "../units/UnitSystem.js";
import { DeepFoundationModel } from "./DeepFoundationModel.js";
import { GeotechnicalDesignSituation } from
  "./GeotechnicalDesignSituation.js";
import { GroundModel } from "./GroundModel.js";
import { LateralPileLoadScenario } from "./LateralPileLoadScenario.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";
import { rankineEarthPressureCoefficients } from
  "./earthPressureCoefficients.js";

export const LATERAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION =
  "lateral-pile-capacity-result/v1";

export const LATERAL_PILE_BROMS_REFERENCE =
  "FHWA GEC 9, FHWA-HIF-18-031 (2018), section 6.5, equations 6-8 through 6-17";

const TOLERANCE = 1e-10;

class LateralPileNotSupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = "LateralPileNotSupportedError";
  }
}

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
  return value instanceof LateralPileLoadScenario
    ? value
    : new LateralPileLoadScenario({ ...value, units: value?.units ?? units });
}

function intersectedLayers(profile, topElevation, bottomElevation) {
  return profile.layers.filter((layer) => {
    const top = Math.min(layer.topElevation, topElevation);
    const bottom = Math.max(layer.bottomElevation, bottomElevation);
    return top > bottom + TOLERANCE;
  });
}

function resolveParameters({ designSituation, groundModel, layer }) {
  return designSituation.resolveParameterSet({
    groundModel,
    layerId: layer.id,
    materialId: layer.materialId,
  });
}

function bisectionRoot({ evaluate, lower, upper, tolerance = 1e-12 }) {
  let left = lower;
  let right = upper;
  let leftValue = evaluate(left);
  let rightValue = evaluate(right);
  if (leftValue > 0 || rightValue < 0) {
    throw new Error("Invalid root bracket in lateral pile analysis.");
  }
  for (let iteration = 0; iteration < 160; iteration += 1) {
    const middle = (left + right) / 2;
    const middleValue = evaluate(middle);
    if (
      Math.abs(middleValue) <= tolerance ||
      right - left <= tolerance * Math.max(1, Math.abs(middle))
    ) {
      return middle;
    }
    if (middleValue > 0) {
      right = middle;
      rightValue = middleValue;
    } else {
      left = middle;
      leftValue = middleValue;
    }
  }
  return (left + right) / 2;
}

function cohesiveResponse({
  lateralShear,
  overturningMoment,
  width,
  undrainedShearStrength,
  soilReactionFactor = 1,
}) {
  const unitReaction = 9 * undrainedShearStrength * width *
    soilReactionFactor;
  const f = lateralShear / unitReaction;
  const maximumMoment = overturningMoment + lateralShear *
    (1.5 * width + 0.5 * f);
  const g = Math.sqrt(
    maximumMoment /
      (2.25 * undrainedShearStrength * width * soilReactionFactor),
  );
  const requiredEmbedment = 1.5 * width + f + g;
  return {
    unitUltimateSoilReaction: unitReaction,
    topZeroResistanceDepth: 1.5 * width,
    f,
    g,
    zeroShearDepth: 1.5 * width + f,
    maximumMoment,
    requiredEmbedment,
  };
}

function cohesiveCapacity({
  embedment,
  overturningMoment,
  width,
  undrainedShearStrength,
  soilReactionFactor = 1,
}) {
  const zeroShear = cohesiveResponse({
    lateralShear: 0,
    overturningMoment,
    width,
    undrainedShearStrength,
    soilReactionFactor,
  });
  if (zeroShear.requiredEmbedment > embedment + TOLERANCE) return 0;
  const evaluate = (lateralShear) => cohesiveResponse({
    lateralShear,
    overturningMoment,
    width,
    undrainedShearStrength,
    soilReactionFactor,
  }).requiredEmbedment - embedment;
  let upper = Math.max(
    1,
    9 * undrainedShearStrength * width *
      Math.max(embedment - 1.5 * width, 0) * soilReactionFactor,
  );
  while (evaluate(upper) < 0) upper *= 2;
  return bisectionRoot({ evaluate, lower: 0, upper });
}

function cohesionlessRequiredEmbedment({
  lateralShear,
  overturningMoment,
  width,
  effectiveUnitWeight,
  passiveCoefficient,
  soilReactionFactor = 1,
}) {
  const coefficient = 0.5 * effectiveUnitWeight * width *
    passiveCoefficient * soilReactionFactor;
  if (lateralShear === 0 && overturningMoment === 0) return 0;
  const evaluate = (length) => coefficient * length ** 3 -
    lateralShear * length - overturningMoment;
  const stationary = lateralShear > 0
    ? Math.sqrt(lateralShear / (3 * coefficient))
    : 0;
  let upper = Math.max(1, 2 * stationary);
  while (evaluate(upper) < 0) upper *= 2;
  return bisectionRoot({ evaluate, lower: stationary, upper });
}

function cohesionlessResponse({
  lateralShear,
  overturningMoment,
  width,
  effectiveUnitWeight,
  passiveCoefficient,
  soilReactionFactor = 1,
}) {
  const reactionGradient = 3 * width * effectiveUnitWeight *
    passiveCoefficient * soilReactionFactor;
  const f = lateralShear === 0
    ? 0
    : Math.sqrt(2 * lateralShear / reactionGradient);
  const maximumMoment = overturningMoment + lateralShear * f -
    width * effectiveUnitWeight * passiveCoefficient *
      soilReactionFactor * f ** 3 / 2;
  return {
    soilReactionGradient: reactionGradient,
    f,
    zeroShearDepth: f,
    maximumMoment,
    requiredEmbedment: cohesionlessRequiredEmbedment({
      lateralShear,
      overturningMoment,
      width,
      effectiveUnitWeight,
      passiveCoefficient,
      soilReactionFactor,
    }),
  };
}

function cohesionlessCapacity({
  embedment,
  overturningMoment,
  width,
  effectiveUnitWeight,
  passiveCoefficient,
  soilReactionFactor = 1,
}) {
  return Math.max(
    0,
    0.5 * effectiveUnitWeight * width * embedment ** 2 *
      passiveCoefficient * soilReactionFactor -
      overturningMoment / embedment,
  );
}

function effectiveUnitWeight(profile, material, toeElevation) {
  if (profile.groundwater.model !== "hydrostatic") {
    return {
      value: material.unitWeight.bulk,
      condition: "dry-or-groundwater-not-modeled",
    };
  }
  const waterTable = profile.groundwater.waterTableElevation;
  if (waterTable <= toeElevation + TOLERANCE) {
    return {
      value: material.unitWeight.bulk,
      condition: "water-table-at-or-below-pile-toe",
    };
  }
  if (waterTable >= profile.groundSurfaceElevation - TOLERANCE) {
    if (!Number.isFinite(material.unitWeight.saturated)) {
      throw new Error(
        `SoilMaterial ${material.id} requires saturated unit weight for a submerged Broms branch.`,
      );
    }
    const value = material.unitWeight.saturated -
      profile.groundwater.waterUnitWeight;
    if (value <= 0) {
      throw new Error("Submerged effective unit weight must be positive.");
    }
    return {
      value,
      condition: "water-table-at-or-above-ground-surface",
    };
  }
  throw new LateralPileNotSupportedError(
    "Broms cohesionless short-pile equations require a single linear effective-overburden gradient; a water table within the embedment requires a p-y or other compatible analysis.",
  );
}

function soilReactionIdealization({
  branch,
  response,
  embedment,
}) {
  if (branch === "cohesive-undrained") {
    const reversalStart = response.zeroShearDepth + response.g / 2;
    return {
      model: "broms-cohesive-rectangular-with-toe-reversal",
      distributedSegments: [{
        fromDepth: 0,
        toDepth: response.topZeroResistanceDepth,
        reactionPerLength: 0,
      }, {
        fromDepth: response.topZeroResistanceDepth,
        toDepth: Math.min(reversalStart, embedment),
        reactionPerLength: response.unitUltimateSoilReaction,
      }, {
        fromDepth: Math.min(reversalStart, embedment),
        toDepth: embedment,
        reactionPerLength: -response.unitUltimateSoilReaction,
      }],
    };
  }
  return {
    model: "broms-cohesionless-triangular-with-concentrated-toe-reaction",
    distributedSegments: [{
      fromDepth: 0,
      toDepth: embedment,
      reactionPerLengthAtStart: 0,
      reactionPerLengthAtEnd: response.soilReactionGradient * embedment,
    }],
  };
}

function analyzeBranch({
  scenario,
  pile,
  profile,
  material,
  parameterResolution,
  soilReactionFactor,
}) {
  const width = pile.geometry.equivalentDiameter;
  const embedment = pile.placement.soilContactLength;
  const actions = scenario.action;
  if (scenario.soilBranch === "cohesive-undrained") {
    const strength = parameterResolution.parameterSet.strength;
    if (strength.model !== "total-stress-undrained") {
      throw new Error(
        "The cohesive-undrained Broms branch requires total-stress-undrained parameters.",
      );
    }
    if (embedment <= 1.5 * width + TOLERANCE) {
      throw new LateralPileNotSupportedError(
        "The cohesive Broms mechanism requires embedment greater than 1.5 pile widths.",
      );
    }
    const inputs = {
      lateralShear: actions.lateralShear,
      overturningMoment: actions.overturningMoment,
      width,
      undrainedShearStrength: strength.undrainedShearStrength,
      soilReactionFactor,
    };
    return {
      branch: scenario.soilBranch,
      parameters: {
        undrainedShearStrength: strength.undrainedShearStrength,
        ultimateReactionCoefficient: 9,
        topZeroResistanceDepthRatio: 1.5,
      },
      nominalLateralCapacity: cohesiveCapacity({
        ...inputs,
        embedment,
      }),
      response: cohesiveResponse(inputs),
    };
  }

  const strength = parameterResolution.parameterSet.strength;
  if (strength.model !== "mohr-coulomb-effective") {
    throw new Error(
      "The cohesionless-drained Broms branch requires mohr-coulomb-effective parameters.",
    );
  }
  if (strength.cohesion > TOLERANCE) {
    throw new LateralPileNotSupportedError(
      "The cohesionless Broms branch requires zero effective cohesion.",
    );
  }
  const effectiveWeight = effectiveUnitWeight(
    profile,
    material,
    pile.placement.toeElevation,
  );
  const passiveCoefficient = rankineEarthPressureCoefficients({
    frictionAngle: strength.frictionAngle,
  }).passive;
  const inputs = {
    lateralShear: actions.lateralShear,
    overturningMoment: actions.overturningMoment,
    width,
    effectiveUnitWeight: effectiveWeight.value,
    passiveCoefficient,
    soilReactionFactor,
  };
  return {
    branch: scenario.soilBranch,
    parameters: {
      frictionAngle: strength.frictionAngle,
      passiveCoefficient,
      effectiveUnitWeight: effectiveWeight.value,
      groundwaterCondition: effectiveWeight.condition,
      passiveWidthMultiplier: 3,
    },
    nominalLateralCapacity: cohesionlessCapacity({
      ...inputs,
      embedment,
    }),
    response: cohesionlessResponse(inputs),
  };
}

export class LateralPileCapacityAnalysis {
  analyze({
    groundModel: groundModelInput,
    designSituation: designSituationInput,
    pile: pileInput,
    scenario: scenarioInput,
    profileId = null,
    units = null,
  } = {}) {
    try {
      assertExplicitUnitSystem(units, "LateralPileCapacityAnalysis");
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
          summary: "Broms lateral capacity requires limitState=ULS.",
        });
      }
      if (designSituation.seismic.model !== "none") {
        return result({
          status: "not-supported",
          summary:
            "Seismic or cyclic lateral pile response is outside the static Broms solver.",
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
          summary: "A GroundProfile is required for lateral pile capacity.",
        });
      }
      if (
        Math.abs(
          pile.placement.soilContactTopElevation -
            profile.groundSurfaceElevation,
        ) > TOLERANCE
      ) {
        throw new LateralPileNotSupportedError(
          "Broms requires the soil-contact top at ground surface; transfer elevated-head shear and moment to groundline.",
        );
      }
      if (pile.placement.toeElevation <= profile.bottomElevation + TOLERANCE) {
        throw new Error("GroundProfile must extend below the pile toe.");
      }
      const layers = intersectedLayers(
        profile,
        pile.placement.soilContactTopElevation,
        pile.placement.toeElevation,
      );
      if (layers.length !== 1) {
        throw new LateralPileNotSupportedError(
          "Broms short-pile capacity is restricted to one homogeneous soil layer over the full embedment; use a p-y analysis for stratified profiles.",
        );
      }
      const layer = layers[0];
      const material = groundModel.getMaterial(layer.materialId);
      const parameterResolution = resolveParameters({
        designSituation,
        groundModel,
        layer,
      });
      const nominal = analyzeBranch({
        scenario,
        pile,
        profile,
        material,
        parameterResolution,
        soilReactionFactor: 1,
      });
      const conversion = scenario.resistanceConversion;
      const converted = conversion == null
        ? null
        : analyzeBranch({
            scenario,
            pile,
            profile,
            material,
            parameterResolution,
            soilReactionFactor: conversion.factor,
          });
      const selected = converted ?? nominal;
      const capacity = selected.nominalLateralCapacity;
      const demand = scenario.action.lateralShear;
      const verification = conversion == null
        ? {
            status: "not-performed",
            reason:
              "Broms is not calibrated to a general LRFD format; an explicit soil-reaction conversion is required for a design check.",
            demand,
            capacity: null,
            utilizationRatio: null,
            nominalCapacityRatio: nominal.nominalLateralCapacity > 0
              ? demand / nominal.nominalLateralCapacity
              : null,
          }
        : {
            status: capacity > 0 && demand <= capacity + TOLERANCE
              ? "ok"
              : "not-verified",
            demand,
            capacity,
            utilizationRatio: capacity > 0 ? demand / capacity : null,
            ok: capacity > 0 && demand <= capacity + TOLERANCE,
          };
      const status = verification.status === "not-verified"
        ? "not-verified"
        : "ok";
      const response = selected.response;
      const embedment = pile.placement.soilContactLength;
      const reactionIdealization = soilReactionIdealization({
        branch: scenario.soilBranch,
        response,
        embedment,
      });

      return result({
        status,
        summary: status === "not-verified"
          ? "Broms short-pile capacity was calculated, but the explicit lateral resistance check is not verified."
          : "Broms short, rigid, free-head pile capacity analysis completed.",
        outputs: {
          schemaVersion: LATERAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION,
          groundModelId: groundModel.id,
          designSituationId: designSituation.id,
          profileId: profile.id,
          pile: pile.toJSON(),
          scenario: scenario.toJSON(),
          soil: {
            layerId: layer.id,
            materialId: material.id,
            parameterResolution,
            branch: scenario.soilBranch,
            parameters: nominal.parameters,
          },
          mechanism: {
            method: scenario.method,
            headCondition: scenario.headCondition,
            behaviorClassification:
              scenario.behaviorAssertion.classification,
            availableEmbedment: embedment,
            nominal: {
              lateralCapacity: nominal.nominalLateralCapacity,
              response: nominal.response,
            },
            converted: converted == null
              ? { status: "not-performed" }
              : {
                  status: "performed",
                  lateralCapacity: converted.nominalLateralCapacity,
                  response: converted.response,
                  conversion: structuredClone(conversion),
                },
            selectedResponse: response,
            soilReactionIdealization: reactionIdealization,
          },
          demand: {
            lateralShear: demand,
            overturningMoment: scenario.action.overturningMoment,
            referencePoint: scenario.action.referencePoint,
            basis: scenario.action.basis,
          },
          capacity: {
            nominalLateralResistance: nominal.nominalLateralCapacity,
            convertedLateralResistance:
              converted?.nominalLateralCapacity ?? null,
            selectedLateralResistance: capacity,
          },
          verification,
          checks: verification.status === "not-performed"
            ? []
            : [{
                id: "lateral-geotechnical-resistance",
                demand: verification.demand,
                capacity: verification.capacity,
                utilizationRatio: verification.utilizationRatio,
                ok: verification.ok,
              }],
          utilizationRatio: verification.utilizationRatio,
          structuralCoupling: {
            level: "single-pile-lateral-capacity-mode",
            pileId: pile.id,
            actionReferencePoint: scenario.action.referencePoint,
            actionDirection: scenario.action.direction,
            actionEffects: {
              groundlineShear: demand,
              groundlineMoment: scenario.action.overturningMoment,
              maximumPileMoment: response.maximumMoment,
              maximumPileMomentDepth: response.zeroShearDepth,
            },
            capacityMode: {
              status: "available",
              nominalLateralResistance: nominal.nominalLateralCapacity,
              convertedLateralResistance:
                converted?.nominalLateralCapacity ?? null,
            },
            responseMode: {
              status: "not-implemented",
              reason:
                "Broms is a fully mobilized limit-equilibrium mechanism and does not provide pile displacement, rotation, stiffness or p-y state.",
            },
            structuralVerification: {
              status: "not-analyzed",
              demand: {
                maximumBendingMoment: response.maximumMoment,
                groundlineShear: demand,
              },
              reason:
                "The structural pile section must be checked separately, including axial-force interaction where applicable.",
            },
          },
        },
        warnings: [
          ...(conversion == null
            ? [
                "No design resistance is inferred because FHWA notes that the short-pile Broms method is not calibrated to the LRFD framework.",
              ]
            : []),
          "Broms assumes fully mobilized soil reactions independently of actual displacement and does not calculate serviceability response.",
          "The short-rigid classification is an explicit project assertion; this solver does not infer it from pile EI or soil stiffness.",
          "Structural resistance, axial-lateral interaction, cyclic loading, group effects and lateral ground movement are excluded.",
        ],
        assumptions: [
          "The pile is vertical, uniform, short, rigid and free to rotate at the groundline.",
          "The complete embedment lies in one homogeneous soil layer with horizontal ground.",
          "Applied shear and overturning moment act in the same sense and are already transferred to groundline.",
          scenario.soilBranch === "cohesive-undrained"
            ? "The upper 1.5 pile widths provide no lateral soil resistance and the remaining ultimate reaction is 9 su B."
            : "The ultimate lateral soil reaction is three pile widths times Rankine passive effective horizontal stress.",
          "Pile-head displacement and rotation are not calculated by the limit-equilibrium method.",
        ],
        metadata: {
          references: [LATERAL_PILE_BROMS_REFERENCE],
          sourceUrl:
            "https://www.fhwa.dot.gov/engineering/geotech/pubs/hif18031.pdf",
          designSituation: designSituation.toJSON(),
          units: {
            force: GEOTECHNICAL_INTERNAL_UNITS.force,
            moment: "kN.m",
            length: GEOTECHNICAL_INTERNAL_UNITS.length,
            soilReaction: "kN/m",
          },
        },
      });
    } catch (error) {
      const notSupported = error instanceof LateralPileNotSupportedError;
      return result({
        status: notSupported ? "not-supported" : "failed",
        summary: notSupported
          ? error.message
          : "Lateral pile capacity analysis failed.",
        warnings: notSupported ? [] : [error.message],
        metadata: { errorName: error.name },
      });
    }
  }
}
