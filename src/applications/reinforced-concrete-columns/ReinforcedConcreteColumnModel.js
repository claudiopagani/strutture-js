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

export class ReinforcedConcreteColumnModel {
  constructor({
    id,
    section,
    concreteMaterial = section?.concreteMaterial ?? null,
    reinforcementMaterial = section?.reinforcementMaterial ?? null,
    length,
    stability = {},
    actions = {},
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
    };
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
