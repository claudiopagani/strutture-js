import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { evaluateNTC2018MasonryPier } from "../../../norms/ntc2018/masonry/index.js";
import { MasonryPierModel } from "./MasonryPierModel.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });

function normalizeScope(value = "existing") {
  const normalized = String(value).trim().toLowerCase();

  if (normalized !== "existing") {
    throw new Error(
      `Unsupported NTC 2018 masonry pier scope: ${value}. The autonomous three-mechanism model currently covers existing unreinforced masonry only.`,
    );
  }

  return normalized;
}

function normalizeTexture(value = "irregular") {
  const normalized = String(value).trim().toLowerCase();

  if (normalized !== "irregular" && normalized !== "regular") {
    throw new Error(`Unsupported NTC 2018 masonry texture: ${value}.`);
  }

  return normalized;
}

function normalizeBoundaryCondition(value = "cantilever") {
  const normalized = String(value).trim().toLowerCase();
  const aliases = new Map([
    ["cantilever", "cantilever"],
    ["free", "cantilever"],
    ["fixed-fixed", "fixed-fixed"],
    ["fixed", "fixed-fixed"],
  ]);
  const resolved = aliases.get(normalized);

  if (!resolved) {
    throw new Error(`Unsupported NTC 2018 pier boundary condition: ${value}.`);
  }

  return resolved;
}

function finiteOrNull(value, converter = (item) => item) {
  return Number.isFinite(value) ? converter(value) : null;
}

/**
 * Autonomous bilinear NTC 2018 / Circular 2019 masonry-pier model.
 *
 * The class intentionally remains separate from CyclicMasonryPier2D: this is
 * a normative capacity envelope, not a cyclic constitutive macroelement.
 */
export class NTC2018MasonryPierModel extends MasonryPierModel {
  constructor({
    units,
    geometry = {},
    material = null,
    actions = {},
    design = {},
    idealization = {},
    normative = {},
    ...rest
  }) {
    const unitResolver = createUnitResolver(units, INTERNAL_UNITS);

    super({
      units,
      geometry,
      material,
      actions,
      design,
      idealization,
      ...rest,
    });

    const scope = normalizeScope(normative.scope);
    const strengthConfidenceFactor =
      scope === "existing" ? this.resolvedConfidenceFactor() : 1;

    if (
      !Number.isFinite(strengthConfidenceFactor) ||
      strengthConfidenceFactor <= 0
    ) {
      throw new Error(
        "NTC2018MasonryPierModel requires a positive confidence factor for existing masonry.",
      );
    }

    const blockCompressiveStrength = finiteOrNull(
      normative.blockCompressiveStrength,
      unitResolver.stress,
    );
    const blockTensileStrength = finiteOrNull(
      normative.blockTensileStrength,
      unitResolver.stress,
    );
    const explicitShearStrengthLimit = finiteOrNull(
      normative.shearStrengthLimit,
      unitResolver.stress,
    );
    const effectiveStrength = (value) =>
      Number.isFinite(value) ? value / strengthConfidenceFactor : null;
    const effectiveBlockCompression = effectiveStrength(blockCompressiveStrength);

    this.normative = {
      scope,
      analysisType: "nonlinear-static",
      limitState: "SLC",
      masonryTexture: normalizeTexture(normative.masonryTexture),
      modernPerforatedBlocks: Boolean(normative.modernPerforatedBlocks),
      boundaryCondition: normalizeBoundaryCondition(
        normative.boundaryCondition ??
          (normative.topRotation === "fixed" ? "fixed-fixed" : "cantilever"),
      ),
      effectiveLength:
        finiteOrNull(geometry.effectiveLength, unitResolver.length) ??
        this.geometry.length,
      shearSpan: finiteOrNull(normative.shearSpan, unitResolver.length),
      crackedStiffnessFactor:
        normative.crackedStiffnessFactor == null
          ? 0.5
          : Number(normative.crackedStiffnessFactor),
      shearCorrectionFactor:
        normative.shearCorrectionFactor ??
        this.idealization.shearCorrectionFactor ??
        5 / 6,
      shearAxialCompression: finiteOrNull(
        actions.shearAxialForce ?? actions.midHeightAxialForce,
        unitResolver.force,
      ),
      lateralDisplacement: finiteOrNull(
        actions.lateralDisplacement,
        unitResolver.length,
      ),
      interlockingCoefficient: finiteOrNull(
        normative.interlockingCoefficient,
      ),
      localFrictionCoefficient:
        normative.localFrictionCoefficient == null
          ? 0.577
          : Number(normative.localFrictionCoefficient),
      diagonalTensileStrength: effectiveStrength(
        finiteOrNull(normative.diagonalTensileStrength, unitResolver.stress),
      ),
      blockCompressiveStrength: effectiveBlockCompression,
      blockTensileStrength: effectiveStrength(
        blockTensileStrength ??
          (Number.isFinite(blockCompressiveStrength)
            ? 0.1 * blockCompressiveStrength
            : null),
      ),
      shearStrengthLimit: effectiveStrength(
        explicitShearStrengthLimit ??
          (Number.isFinite(blockCompressiveStrength)
            ? (0.065 * blockCompressiveStrength) / 0.7
            : null),
      ),
      strengthConfidenceFactor,
    };
  }

  resolvedNormativeMaterial() {
    const confidenceFactor = this.normative.strengthConfidenceFactor;
    const reduceStrength = (value) =>
      Number.isFinite(value) ? value / confidenceFactor : null;

    return {
      compressiveStrength: reduceStrength(this.resolveMaterialProperty("fm")),
      cohesion: reduceStrength(this.resolveMaterialProperty("fv0")),
      referenceShearStrength: reduceStrength(
        this.resolveMaterialProperty("tau0"),
      ),
      diagonalTensileStrength: this.normative.diagonalTensileStrength,
      shearStrengthLimit: this.normative.shearStrengthLimit,
      blockCompressiveStrength: this.normative.blockCompressiveStrength,
      blockTensileStrength: this.normative.blockTensileStrength,
      interlockingCoefficient: this.normative.interlockingCoefficient,
      localFrictionCoefficient: this.normative.localFrictionCoefficient,
      elasticModulus: this.resolvedElasticModulus(),
      shearModulus: this.resolvedShearModulus(),
    };
  }

  evaluate({ lateralDisplacement = this.normative.lateralDisplacement } = {}) {
    const axialCompression = Math.max(0, this.compressiveAxialForce());

    return evaluateNTC2018MasonryPier({
      geometry: {
        height: this.geometry.height,
        length: this.normative.effectiveLength,
        thickness: this.geometry.thickness,
        deformableHeight: this.deformableHeight(),
      },
      material: this.resolvedNormativeMaterial(),
      actions: {
        axialCompression,
        shearAxialCompression:
          this.normative.shearAxialCompression ?? axialCompression,
      },
      options: {
        scope: this.normative.scope,
        masonryTexture: this.normative.masonryTexture,
        modernPerforatedBlocks: this.normative.modernPerforatedBlocks,
        boundaryCondition: this.normative.boundaryCondition,
        shearSpan: this.normative.shearSpan,
        crackedStiffnessFactor: this.normative.crackedStiffnessFactor,
        shearCorrectionFactor: this.normative.shearCorrectionFactor,
      },
      lateralDisplacement,
    });
  }

  toJSON() {
    return {
      ...super.toJSON(),
      modelType: "ntc2018-masonry-pier-bilinear",
      normative: { ...this.normative },
    };
  }
}
