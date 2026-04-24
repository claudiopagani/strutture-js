import { assertExplicitUnitSystem, createUnitResolver } from "../../../domain/units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`MasonryPierModel requires a positive ${label}.`);
  }
}

function assertNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`MasonryPierModel requires a non-negative ${label}.`);
  }
}

function normalizeAxialForceConvention(value = "compression-positive") {
  const normalized = String(value).trim().toLowerCase();

  if (
    normalized === "compression-positive" ||
    normalized === "compression-negative" ||
    normalized === "absolute"
  ) {
    return normalized;
  }

  throw new Error(
    `Unsupported masonry pier axialForceConvention: ${value}.`,
  );
}

function normalizeReductionTableScheme(value = "hinged") {
  const normalized = String(value).trim().toLowerCase();

  if (normalized !== "hinged") {
    throw new Error(
      `MasonryPierModel supports only the "hinged" reductionTableScheme for Phi reduction factors. Received: ${value}.`,
    );
  }

  return normalized;
}

function normalizePlainMaterial(material) {
  if (!material || typeof material !== "object" || material.constructor !== Object) {
    return material;
  }

  const units = material.units ?? material.metadata?.unitSystem ?? null;

  if (!units) {
    return { ...material };
  }

  const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
  const convertProperties = (properties = {}) => ({
    ...properties,
    fm: unitResolver.stress(properties.fm),
    tau0: unitResolver.stress(properties.tau0),
    fv0: unitResolver.stress(properties.fv0),
    E: unitResolver.stress(properties.E),
    G: unitResolver.stress(properties.G),
    w: unitResolver.volumeLoad(properties.w),
  });

  return {
    ...material,
    fm: unitResolver.stress(material.fm),
    tau0: unitResolver.stress(material.tau0),
    fv0: unitResolver.stress(material.fv0),
    E: unitResolver.stress(material.E ?? material.elasticModulus),
    G: unitResolver.stress(material.G ?? material.shearModulus),
    w: unitResolver.volumeLoad(material.w ?? material.density),
    elasticModulus: unitResolver.stress(material.elasticModulus ?? material.E),
    shearModulus: unitResolver.stress(material.shearModulus ?? material.G),
    density: unitResolver.volumeLoad(material.density ?? material.w),
    baseProperties: convertProperties(material.baseProperties),
    originalMechanicalProperties: convertProperties(material.originalMechanicalProperties),
    stateOfFactProperties: convertProperties(material.stateOfFactProperties),
    improvedMechanicalProperties: convertProperties(material.improvedMechanicalProperties),
    units: INTERNAL_UNITS,
    metadata: {
      ...material.metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem:
        material.metadata?.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    },
  };
}

function finiteOrNull(value, converter) {
  if (value == null) {
    return null;
  }

  return converter(value);
}

function firstFinite(values = []) {
  return values.find((value) => Number.isFinite(value)) ?? null;
}

export class MasonryPierModel {
  constructor({
    id,
    units = null,
    geometry = {},
    material = null,
    actions = {},
    design = {},
    idealization = {},
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A masonry pier model id is required.");
    }

    assertExplicitUnitSystem(units, "MasonryPierModel");
    const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
    const resolvedHeight = unitResolver.length(geometry.height ?? geometry.h);
    const resolvedLength = unitResolver.length(
      geometry.length ?? geometry.L ?? geometry.b ?? geometry.width,
    );
    const resolvedThickness = unitResolver.length(
      geometry.thickness ?? geometry.t,
    );
    const resolvedRigidBottom = finiteOrNull(
      idealization.rigidEndZoneBottom ??
        idealization.rigidBottom ??
        idealization.bottomRigidZone,
      unitResolver.length,
    ) ?? 0;
    const resolvedRigidTop = finiteOrNull(
      idealization.rigidEndZoneTop ??
        idealization.rigidTop ??
        idealization.topRigidZone,
      unitResolver.length,
    ) ?? 0;

    assertPositive(resolvedHeight, "geometry.height");
    assertPositive(resolvedLength, "geometry.length");
    assertPositive(resolvedThickness, "geometry.thickness");
    assertNonNegative(resolvedRigidBottom, "idealization.rigidEndZoneBottom");
    assertNonNegative(resolvedRigidTop, "idealization.rigidEndZoneTop");

    if (resolvedRigidBottom + resolvedRigidTop >= resolvedHeight) {
      throw new Error(
        "MasonryPierModel rigid end zones must leave a positive deformable height.",
      );
    }

    this.id = id;
    this.units = INTERNAL_UNITS;
    this.geometry = {
      baseX: unitResolver.length(geometry.baseX ?? geometry.x ?? 0),
      baseY: unitResolver.length(geometry.baseY ?? geometry.y ?? 0),
      height: resolvedHeight,
      length: resolvedLength,
      thickness: resolvedThickness,
      transverseWallSpacing: finiteOrNull(
        geometry.transverseWallSpacing ?? geometry.a,
        unitResolver.length,
      ),
    };
    this.material = normalizePlainMaterial(material);
    this.actions = {
      axialForce: unitResolver.force(actions.axialForce ?? actions.N ?? 0),
      axialForceConvention: normalizeAxialForceConvention(
        actions.axialForceConvention,
      ),
      outOfPlaneMoment: unitResolver.moment(
        actions.outOfPlaneMoment ?? actions.Mv ?? 0,
      ),
      inPlaneMoment: unitResolver.moment(
        actions.inPlaneMoment ?? actions.ML ?? 0,
      ),
      outOfPlaneVerticalLoadEccentricity: unitResolver.length(
        actions.outOfPlaneVerticalLoadEccentricity ?? actions.es ?? 0,
      ),
      inPlaneVerticalLoadEccentricity: unitResolver.length(
        actions.inPlaneVerticalLoadEccentricity ?? actions.eL ?? actions.el ?? 0,
      ),
    };
    this.design = {
      gammaM: design.gammaM ?? design.gamma ?? null,
      confidenceFactor: design.confidenceFactor ?? design.FC ?? null,
      lateralRestraintFactor: design.lateralRestraintFactor ?? design.rho ?? null,
      constructionEccentricity: finiteOrNull(
        design.constructionEccentricity,
        unitResolver.length,
      ),
      unitWeight: finiteOrNull(
        design.unitWeight ?? design.w,
        unitResolver.volumeLoad,
      ),
      allowExtrapolation: Boolean(design.allowExtrapolation),
      reductionTableScheme: normalizeReductionTableScheme(
        design.reductionTableScheme,
      ),
    };
    this.idealization = {
      rigidEndZoneBottom: resolvedRigidBottom,
      rigidEndZoneTop: resolvedRigidTop,
      elementClass: String(
        idealization.elementClass ?? "frame-2d-timoshenko",
      )
        .trim()
        .toLowerCase(),
      shearCorrectionFactor:
        idealization.shearCorrectionFactor == null
          ? null
          : Number(idealization.shearCorrectionFactor),
      axialRigidity: finiteOrNull(
        idealization.axialRigidity,
        unitResolver.force,
      ),
      flexuralRigidity: finiteOrNull(
        idealization.flexuralRigidity,
        (value) =>
          unitResolver.convert(value, {
            forceExponent: 1,
            lengthExponent: 2,
          }),
      ),
      shearRigidity: finiteOrNull(
        idealization.shearRigidity,
        unitResolver.force,
      ),
    };
    this.metadata = {
      ...metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  grossArea() {
    return this.geometry.length * this.geometry.thickness;
  }

  inPlaneInertia() {
    return (this.geometry.thickness * this.geometry.length ** 3) / 12;
  }

  deformableHeight() {
    return (
      this.geometry.height -
      this.idealization.rigidEndZoneBottom -
      this.idealization.rigidEndZoneTop
    );
  }

  compressiveAxialForce() {
    const { axialForce, axialForceConvention } = this.actions;

    if (axialForceConvention === "compression-positive") {
      return axialForce;
    }

    if (axialForceConvention === "compression-negative") {
      return -axialForce;
    }

    return Math.abs(axialForce);
  }

  resolveMaterialProperty(propertyName) {
    const material = this.material;

    if (!material) {
      return null;
    }

    const adjustedProperties =
      typeof material.adjustedProperties === "function"
        ? material.adjustedProperties()
        : material.adjustedProperties;
    const aliases = {
      fm: ["fm"],
      tau0: ["tau0"],
      fv0: ["fv0"],
      E: ["E", "elasticModulus"],
      G: ["G", "shearModulus"],
      w: ["w", "density"],
    }[propertyName] ?? [propertyName];
    const sources = [
      material.improvedMechanicalProperties,
      adjustedProperties,
      material.stateOfFactProperties,
      material.originalMechanicalProperties,
      material.baseProperties,
      material.properties,
      material,
    ].filter(Boolean);

    for (const source of sources) {
      const value = firstFinite(aliases.map((alias) => source?.[alias]));

      if (Number.isFinite(value)) {
        return value;
      }
    }

    if (typeof material.adjustedProperty === "function") {
      const value = firstFinite(
        aliases.map((alias) => material.adjustedProperty(alias)),
      );

      if (Number.isFinite(value)) {
        return value;
      }
    }

    return null;
  }

  resolvedGammaM() {
    return this.design.gammaM ?? this.material?.metadata?.gammaM ?? null;
  }

  resolvedConfidenceFactor() {
    return this.design.confidenceFactor ?? this.material?.confidenceFactor ?? 1;
  }

  resolvedUnitWeight() {
    return (
      this.design.unitWeight ??
      this.resolveMaterialProperty("w") ??
      this.material?.density ??
      null
    );
  }

  resolvedConstructionEccentricity() {
    return this.design.constructionEccentricity ?? this.geometry.height / 200;
  }

  resolvedLateralRestraintFactor() {
    if (Number.isFinite(this.design.lateralRestraintFactor)) {
      return this.design.lateralRestraintFactor;
    }

    const spacing = this.geometry.transverseWallSpacing;

    if (!Number.isFinite(spacing) || spacing <= 0) {
      return 1;
    }

    const ratio = this.geometry.height / spacing;

    if (ratio <= 0.5) {
      return 1;
    }

    if (ratio <= 1.0) {
      return 1.5 - ratio;
    }

    return 1 / (1 + ratio ** 2);
  }

  resolvedElasticModulus() {
    return this.resolveMaterialProperty("E");
  }

  resolvedShearModulus() {
    return this.resolveMaterialProperty("G");
  }

  resolvedEquivalentFrameRigidities() {
    const axialOverride = this.idealization.axialRigidity;
    const flexuralOverride = this.idealization.flexuralRigidity;
    const shearOverride = this.idealization.shearRigidity;
    const elasticModulus = this.resolvedElasticModulus();
    const shearModulus = this.resolvedShearModulus();
    const grossArea = this.grossArea();
    const inertia = this.inPlaneInertia();

    return {
      axialRigidity:
        axialOverride ?? (Number.isFinite(elasticModulus) ? elasticModulus * grossArea : null),
      flexuralRigidity:
        flexuralOverride ??
        (Number.isFinite(elasticModulus) ? elasticModulus * inertia : null),
      shearRigidity:
        shearOverride ?? (Number.isFinite(shearModulus) ? shearModulus * grossArea : null),
      shearCorrectionFactor:
        this.idealization.shearCorrectionFactor ?? 5 / 6,
    };
  }

  toJSON() {
    return {
      id: this.id,
      units: { ...this.units },
      geometry: { ...this.geometry },
      material: this.material?.toJSON?.() ?? this.material,
      actions: { ...this.actions },
      design: { ...this.design },
      idealization: { ...this.idealization },
      metadata: { ...this.metadata },
    };
  }
}
