import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../../domain/units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });

function positiveLength(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive length.`);
  }

  return value;
}

function convertShearAxis(input, resolver, label) {
  if (!input) return null;

  return {
    ...input,
    vEd: resolver.force(Number(input.vEd ?? 0)),
    bw: resolver.length(Number(input.bw)),
    effectiveDepth: resolver.length(Number(input.effectiveDepth)),
    longitudinalReinforcementArea: resolver.area(
      Number(input.longitudinalReinforcementArea),
    ),
    transverseReinforcement: input.transverseReinforcement
      ? {
          ...input.transverseReinforcement,
          areaPerSpacing: resolver.length(
            Number(input.transverseReinforcement.areaPerSpacing),
          ),
          spacing: input.transverseReinforcement.spacing == null
            ? null
            : resolver.length(Number(input.transverseReinforcement.spacing)),
          area: input.transverseReinforcement.area == null
            ? null
            : resolver.area(Number(input.transverseReinforcement.area)),
        }
      : null,
    label,
  };
}

function convertDetailing(input, resolver) {
  if (!input) return null;

  const length = (value) => value == null ? null : resolver.length(Number(value));
  const area = (value) => value == null ? null : resolver.area(Number(value));

  return {
    ...structuredClone(input),
    longitudinal: input.longitudinal
      ? {
          ...input.longitudinal,
          area: area(input.longitudinal.area),
          minimumBarDiameter: length(input.longitudinal.minimumBarDiameter),
          maximumBarDiameter: length(input.longitudinal.maximumBarDiameter),
          maximumBarSpacing: length(input.longitudinal.maximumBarSpacing),
        }
      : null,
    transverse: input.transverse
      ? {
          ...input.transverse,
          diameter: length(input.transverse.diameter),
          spacing: length(input.transverse.spacing),
        }
      : null,
    confinement: input.confinement
      ? {
          ...input.confinement,
          coreWidth: length(input.confinement.coreWidth),
          coreDepth: length(input.confinement.coreDepth),
          volumePerSet: input.confinement.volumePerSet == null
            ? null
            : resolver.convert(Number(input.confinement.volumePerSet), {
                lengthExponent: 3,
              }),
          restrainedBarSpacings: (input.confinement.restrainedBarSpacings ?? [])
            .map((value) => length(value)),
        }
      : null,
    anchorage: input.anchorage
      ? {
          ...input.anchorage,
          barDiameter: length(input.anchorage.barDiameter),
          availableLength: length(input.anchorage.availableLength),
        }
      : null,
  };
}

export class ReinforcedConcreteColumnModel {
  constructor({
    id,
    section,
    concreteMaterial = section?.concreteMaterial ?? null,
    reinforcementMaterial = section?.reinforcementMaterial ?? null,
    length,
    stability = {},
    actions = {},
    shear = null,
    detailing = null,
    mesh = { targetFiberCount: 120 },
    solver = { tolerance: 1e-6, maxIterations: 100 },
    units = null,
    metadata = {},
  } = {}) {
    if (!id) {
      throw new Error("A reinforced concrete column model id is required.");
    }

    if (!section) {
      throw new Error("ReinforcedConcreteColumnModel requires a section.");
    }

    assertExplicitUnitSystem(units, "ReinforcedConcreteColumnModel");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);
    const resolvedLength = positiveLength(
      resolver.length(length),
      "ReinforcedConcreteColumnModel length",
    );
    const effectiveLengthMx = resolver.length(
      stability.effectiveLengthMx ??
        stability.effectiveLengthY ??
        stability.l0y ??
        length,
    );
    const effectiveLengthMy = resolver.length(
      stability.effectiveLengthMy ??
        stability.effectiveLengthZ ??
        stability.l0z ??
        length,
    );

    positiveLength(effectiveLengthMx, "stability.effectiveLengthMx");
    positiveLength(effectiveLengthMy, "stability.effectiveLengthMy");

    this.id = id;
    this.section = section;
    this.concreteMaterial = concreteMaterial;
    this.reinforcementMaterial = reinforcementMaterial;
    this.length = resolvedLength;
    this.stability = {
      ...stability,
      effectiveLengthMx,
      effectiveLengthMy,
      compressionSignConvention:
        stability.compressionSignConvention ?? "compression-negative",
      designMomentsIncludeSecondOrder:
        stability.designMomentsIncludeSecondOrder ?? false,
      secondOrderMethod:
        stability.secondOrderMethod ?? "ntc2018-nominal-stiffness",
      creepCoefficient: stability.creepCoefficient == null
        ? null
        : Number(stability.creepCoefficient),
      momentDistributionFactor: stability.momentDistributionFactor == null
        ? 1
        : Number(stability.momentDistributionFactor),
      includeImperfectionWhenMomentIsZero:
        stability.includeImperfectionWhenMomentIsZero ?? true,
    };
    this.actions = {
      ...actions,
      nEd: resolver.force(actions.nEd ?? actions.n ?? 0),
      mxEd: resolver.moment(actions.mxEd ?? actions.mzEd ?? 0),
      myEd: resolver.moment(actions.myEd ?? 0),
      mxEdTotal: resolver.moment(
        actions.mxEdTotal ?? actions.mzEdTotal ?? null,
      ),
      myEdTotal: resolver.moment(actions.myEdTotal ?? null),
      vxEd: resolver.force(actions.vxEd ?? 0),
      vyEd: resolver.force(actions.vyEd ?? 0),
    };
    this.shear = shear
      ? {
          x: convertShearAxis(shear.x, resolver, "x"),
          y: convertShearAxis(shear.y, resolver, "y"),
          capacityDesign: shear.capacityDesign
            ? {
                ...shear.capacityDesign,
                clearLength: resolver.length(
                  Number(shear.capacityDesign.clearLength ?? length),
                ),
                endMomentsX: (shear.capacityDesign.endMomentsX ?? [])
                  .map((value) => resolver.moment(Number(value))),
                endMomentsY: (shear.capacityDesign.endMomentsY ?? [])
                  .map((value) => resolver.moment(Number(value))),
              }
            : null,
        }
      : null;
    this.detailing = convertDetailing(detailing, resolver);
    this.mesh = { ...mesh };
    this.solver = { ...solver };
    this.units = INTERNAL_UNITS;
    this.metadata = {
      ...metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
    };
  }
}
