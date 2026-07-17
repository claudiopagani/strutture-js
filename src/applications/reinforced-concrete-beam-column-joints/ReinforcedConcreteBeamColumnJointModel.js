import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../../domain/units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }

  return value;
}

function nonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be non-negative.`);
  }

  return value;
}

function finite(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }

  return value;
}

function ratios(input = {}) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      nonNegative(Number(value), `confinement.${key}`),
    ]),
  );
}

function normalizeAnchor(input, resolver, label) {
  if (!input) return null;

  return {
    ...input,
    diameter: positive(
      resolver.length(Number(input.diameter)),
      `${label}.diameter`,
    ),
    availableLength: positive(
      resolver.length(Number(input.availableLength)),
      `${label}.availableLength`,
    ),
    designSteelStress: input.designSteelStress == null
      ? null
      : positive(
          resolver.stress(Number(input.designSteelStress)),
          `${label}.designSteelStress`,
        ),
    fctd: input.fctd == null
      ? null
      : positive(resolver.stress(Number(input.fctd)), `${label}.fctd`),
  };
}

export class ReinforcedConcreteBeamColumnJointModel {
  constructor({
    id,
    directionId = "x",
    jointType,
    ductilityClass,
    tensionMethod = "diagonal-tension",
    geometry = {},
    materials = {},
    actions = {},
    beamReinforcement = {},
    jointHoops = {},
    confinement = {},
    capacityHierarchy = {},
    anchorage = {},
    eccentricity = {},
    units = null,
    metadata = {},
  } = {}) {
    if (!id) {
      throw new Error("A reinforced-concrete beam-column joint id is required.");
    }

    assertExplicitUnitSystem(units, "ReinforcedConcreteBeamColumnJointModel");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);
    const concreteMaterial = materials.concreteMaterial;
    const reinforcementMaterial = materials.reinforcementMaterial;
    const transverseReinforcementMaterial =
      materials.transverseReinforcementMaterial ?? reinforcementMaterial;

    if (!concreteMaterial || !reinforcementMaterial ||
        !transverseReinforcementMaterial) {
      throw new Error(
        "Concrete, longitudinal reinforcement and transverse reinforcement materials are required.",
      );
    }

    const columnWidth = positive(
      resolver.length(Number(geometry.columnWidth)),
      "geometry.columnWidth",
    );
    const columnDepth = positive(
      resolver.length(Number(geometry.columnDepth)),
      "geometry.columnDepth",
    );
    const beamWidth = positive(
      resolver.length(Number(geometry.beamWidth)),
      "geometry.beamWidth",
    );
    const beamHeight = positive(
      resolver.length(Number(geometry.beamHeight)),
      "geometry.beamHeight",
    );
    const columnLongitudinalLayerDistance = positive(
      resolver.length(Number(geometry.columnLongitudinalLayerDistance)),
      "geometry.columnLongitudinalLayerDistance",
    );
    const beamLongitudinalLayerDistance = positive(
      resolver.length(Number(geometry.beamLongitudinalLayerDistance)),
      "geometry.beamLongitudinalLayerDistance",
    );

    if (columnLongitudinalLayerDistance >= columnDepth) {
      throw new Error(
        "geometry.columnLongitudinalLayerDistance must be smaller than columnDepth.",
      );
    }

    if (beamLongitudinalLayerDistance >= beamHeight) {
      throw new Error(
        "geometry.beamLongitudinalLayerDistance must be smaller than beamHeight.",
      );
    }

    const hierarchyExempt = capacityHierarchy.exempt === true;

    if (!hierarchyExempt && capacityHierarchy.preReducedForMomentSigns !== true) {
      throw new Error(
        "capacityHierarchy.preReducedForMomentSigns must be true: the local verifier does not infer member moment signs.",
      );
    }

    this.id = id;
    this.directionId = directionId;
    this.jointType = String(jointType ?? "").toLowerCase();
    this.ductilityClass = ductilityClass;
    this.tensionMethod = tensionMethod;
    this.geometry = {
      columnWidth,
      columnDepth,
      beamWidth,
      beamHeight,
      columnLongitudinalLayerDistance,
      beamLongitudinalLayerDistance,
    };
    this.materials = {
      concreteMaterial,
      reinforcementMaterial,
      transverseReinforcementMaterial,
      fctd: materials.fctd == null
        ? null
        : positive(resolver.stress(Number(materials.fctd)), "materials.fctd"),
    };
    this.actions = {
      columnAxialForce: nonNegative(
        resolver.force(Number(actions.columnAxialForce ?? actions.nEd ?? 0)),
        "actions.columnAxialForce",
      ),
      columnShearAbove: finite(
        resolver.force(Number(actions.columnShearAbove ?? actions.vc ?? 0)),
        "actions.columnShearAbove",
      ),
      axialForceConvention: "compression-positive",
      columnShearConvention:
        "signed in the same direction as the beam reinforcement resultant and subtracted from it",
    };
    this.beamReinforcement = {
      topArea: nonNegative(
        resolver.area(Number(beamReinforcement.topArea)),
        "beamReinforcement.topArea",
      ),
      bottomArea: nonNegative(
        resolver.area(Number(beamReinforcement.bottomArea)),
        "beamReinforcement.bottomArea",
      ),
    };
    this.jointHoops = {
      diameter: positive(
        resolver.length(Number(jointHoops.diameter)),
        "jointHoops.diameter",
      ),
      totalArea: positive(
        resolver.area(Number(jointHoops.totalArea)),
        "jointHoops.totalArea",
      ),
      areaPerSet: positive(
        resolver.area(Number(jointHoops.areaPerSet)),
        "jointHoops.areaPerSet",
      ),
      spacing: positive(
        resolver.length(Number(jointHoops.spacing)),
        "jointHoops.spacing",
      ),
    };
    this.confinement = {
      faceCoverageRatios: ratios(confinement.faceCoverageRatios),
      oppositeBeamOverlapRatios: ratios(
        confinement.oppositeBeamOverlapRatios,
      ),
      adjacentColumnHoops: {
        controllingAreaPerSet: positive(
          resolver.area(Number(
            confinement.adjacentColumnHoops?.controllingAreaPerSet,
          )),
          "confinement.adjacentColumnHoops.controllingAreaPerSet",
        ),
        controllingSpacing: positive(
          resolver.length(Number(
            confinement.adjacentColumnHoops?.controllingSpacing,
          )),
          "confinement.adjacentColumnHoops.controllingSpacing",
        ),
      },
    };
    this.capacityHierarchy = hierarchyExempt
      ? {
          exempt: true,
          exemptReason: capacityHierarchy.exemptReason ?? null,
        }
      : {
          exempt: false,
          beamMomentResistanceSum: positive(
            resolver.moment(Number(capacityHierarchy.beamMomentResistanceSum)),
            "capacityHierarchy.beamMomentResistanceSum",
          ),
          effectiveColumnMomentResistance: positive(
            resolver.moment(Number(
              capacityHierarchy.effectiveColumnMomentResistance,
            )),
            "capacityHierarchy.effectiveColumnMomentResistance",
          ),
          preReducedForMomentSigns: true,
        };
    this.anchorage = {
      topBars: normalizeAnchor(anchorage.topBars, resolver, "anchorage.topBars"),
      bottomBars: normalizeAnchor(
        anchorage.bottomBars,
        resolver,
        "anchorage.bottomBars",
      ),
    };
    const beamAxisOffset = resolver.length(Number(eccentricity.beamAxisOffset ?? 0));
    if (!Number.isFinite(beamAxisOffset)) {
      throw new Error("eccentricity.beamAxisOffset must be finite.");
    }
    this.eccentricity = {
      beamAxisOffset,
      transferLeverArm: eccentricity.transferLeverArm == null
        ? null
        : positive(
            resolver.length(Number(eccentricity.transferLeverArm)),
            "eccentricity.transferLeverArm",
          ),
      reinforcementArea: eccentricity.reinforcementArea == null
        ? 0
        : nonNegative(
            resolver.area(Number(eccentricity.reinforcementArea)),
            "eccentricity.reinforcementArea",
          ),
    };
    this.units = INTERNAL_UNITS;
    this.metadata = {
      ...metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
    };
  }
}
