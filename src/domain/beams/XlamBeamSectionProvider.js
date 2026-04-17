import { applySectionRotationToBeamProperties } from "./SectionRotation.js";

const DEFAULT_UNITS = Object.freeze({ force: "N", length: "mm" });

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function materialValue(material, keys, fallback = null) {
  for (const key of keys) {
    if (Number.isFinite(material?.[key])) {
      return material[key];
    }
  }

  return fallback;
}

function resolveBeamShearRigidity(section, material, shear) {
  if (Number.isFinite(shear.shearStiffness) && shear.shearStiffness > 1) {
    return {
      value: shear.shearStiffness,
      source: "xlam-panel-shear-stiffness",
    };
  }

  const g0 = materialValue(material, ["g0Mean", "shearModulus"]);
  const g90 = materialValue(material, ["g90Mean"], Number.isFinite(g0) ? g0 / 10 : null);
  const crossThickness = section.crossLayers().reduce(
    (sum, layer) => sum + layer.thickness,
    0,
  );
  const activeThickness = section.activeThickness();

  if (Number.isFinite(g90) && crossThickness > 0) {
    return {
      value: g90 * section.effectiveWidth * crossThickness,
      source: "rolling-shear-cross-layers",
    };
  }

  return {
    value: g0 * section.effectiveWidth * activeThickness,
    source: "longitudinal-shear-active-layers",
  };
}

export class XlamBeamSectionProvider {
  constructor({
    section,
    material,
    includeCrossLayerBending = false,
    shearOptions = {},
    kdef = null,
    useFinalStiffness = false,
    metadata = {},
  } = {}) {
    if (!section) {
      throw new Error("XlamBeamSectionProvider requires a section.");
    }

    if (!material) {
      throw new Error("XlamBeamSectionProvider requires a material.");
    }

    this.section = section;
    this.material = material;
    this.includeCrossLayerBending = includeCrossLayerBending;
    this.shearOptions = { ...shearOptions };
    this.kdef = kdef ?? material.kdef ?? material.metadata?.kdef ?? null;
    this.useFinalStiffness = useFinalStiffness;
    this.metadata = { ...metadata };
  }

  getElasticBeamProperties(context = {}) {
    const e0 = materialValue(this.material, ["e0Mean", "elasticModulus"]);
    const bendingStiffness = this.section.calculateBendingStiffness(
      this.material,
      {
        includeCrossLayerBending: this.includeCrossLayerBending,
      },
    );
    const shear = this.section.calculateShearStiffness(
      this.material,
      this.shearOptions,
    );
    const beamShearRigidity = resolveBeamShearRigidity(
      this.section,
      this.material,
      shear,
    );
    const finalStiffness =
      context.deformationState === "final" ||
      context.serviceCombination === "final" ||
      context.serviceCombination === "quasi-permanent" ||
      this.useFinalStiffness;
    const stiffnessReduction =
      finalStiffness && Number.isFinite(this.kdef) ? 1 + this.kdef : 1;

    assertPositive(e0, "XLAM longitudinal modulus");
    assertPositive(this.section.area, "XLAM active area");
    assertPositive(bendingStiffness, "XLAM bending stiffness");
    assertPositive(beamShearRigidity.value, "XLAM beam shear stiffness");

    const properties = {
      axialRigidity: (e0 * this.section.area) / stiffnessReduction,
      flexuralRigidity: bendingStiffness / stiffnessReduction,
      shearRigidity: beamShearRigidity.value / stiffnessReduction,
      shearCorrectionFactor: 1,
      units: DEFAULT_UNITS,
      metadata: {
        ...this.metadata,
        provider: "XlamBeamSectionProvider",
        source: "xlam-strip-timoshenko",
        layerThicknesses: [...this.section.layerThicknesses],
        activeLayerIndexes: [...this.section.activeLayerIndexes],
        effectiveWidth: this.section.effectiveWidth,
        totalThickness: this.section.totalThickness(),
        activeThickness: this.section.activeThickness(),
        includeCrossLayerBending: this.includeCrossLayerBending,
        shearCorrectionCoefficient: shear.shearCorrectionCoefficient,
        shearAreaWeighted: shear.shearAreaWeighted,
        rawPanelShearStiffness: shear.shearStiffness,
        beamShearRigiditySource: beamShearRigidity.source,
        kdef: this.kdef,
        finalStiffness,
        stiffnessReduction,
      },
    };

    return applySectionRotationToBeamProperties({
      properties,
      sectionRotation: context.sectionRotation,
      flexuralRigidityY: bendingStiffness / stiffnessReduction,
      flexuralRigidityZ:
        Number.isFinite(this.section.inertiaZ)
          ? (e0 * this.section.inertiaZ) / stiffnessReduction
          : null,
      shearRigidityY: beamShearRigidity.value / stiffnessReduction,
      shearRigidityZ:
        Number.isFinite(materialValue(this.material, ["g0Mean", "shearModulus"])) &&
        Number.isFinite(this.section.area)
          ? (materialValue(this.material, ["g0Mean", "shearModulus"]) * this.section.area) /
            stiffnessReduction
          : null,
    });
  }
}

export function createXlamBeamSectionProvider(options = {}) {
  return new XlamBeamSectionProvider(options);
}
