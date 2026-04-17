import { applySectionRotationToBeamProperties } from "./SectionRotation.js";

const DEFAULT_PROPERTY_UNITS = Object.freeze({ force: "N", length: "mm" });

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function firstFinite(...values) {
  return values.find((value) => Number.isFinite(value));
}

function resolveUnits(...sources) {
  for (const source of sources) {
    const unitSystem = source?.units ?? source?.metadata?.unitSystem;

    if (unitSystem?.force && unitSystem?.length) {
      return unitSystem;
    }
  }

  return DEFAULT_PROPERTY_UNITS;
}

function normalizeBeamProperties(properties, fallbackUnits, fallbackMetadata = {}) {
  if (!properties || typeof properties !== "object") {
    throw new Error("Elastic beam properties must be returned as an object.");
  }

  const axialRigidity = firstFinite(
    properties.axialRigidity,
    properties.EA,
    properties.ea,
  );
  const flexuralRigidity = firstFinite(
    properties.flexuralRigidity,
    properties.effectiveFlexuralRigidity,
    properties.EI,
    properties.ei,
  );
  const shearRigidity = firstFinite(
    properties.shearRigidity,
    properties.effectiveShearRigidity,
    properties.GA,
    properties.ga,
  );

  assertPositive(axialRigidity, "axialRigidity");
  assertPositive(flexuralRigidity, "flexuralRigidity");

  if (shearRigidity !== undefined) {
    assertPositive(shearRigidity, "shearRigidity");
  }

  return {
    axialRigidity,
    flexuralRigidity,
    shearRigidity: shearRigidity ?? null,
    flexuralRigidityY: firstFinite(properties.flexuralRigidityY, properties.EIy, properties.EIY),
    flexuralRigidityZ: firstFinite(properties.flexuralRigidityZ, properties.EIz, properties.EIZ),
    shearRigidityY: firstFinite(properties.shearRigidityY, properties.GAy, properties.GAY),
    shearRigidityZ: firstFinite(properties.shearRigidityZ, properties.GAz, properties.GAZ),
    shearCorrectionFactor: properties.shearCorrectionFactor ?? null,
    units: resolveUnits(properties, { units: fallbackUnits }),
    metadata: {
      ...fallbackMetadata,
      ...properties.metadata,
    },
  };
}

function resolveShearModulus(material) {
  if (Number.isFinite(material?.shearModulus)) {
    return material.shearModulus;
  }

  if (
    Number.isFinite(material?.elasticModulus) &&
    Number.isFinite(material?.poissonRatio)
  ) {
    return material.elasticModulus / (2 * (1 + material.poissonRatio));
  }

  return null;
}

function resolveShearArea(section, shearAreaAxis) {
  const shearArea = section?.[shearAreaAxis];

  if (Number.isFinite(shearArea)) {
    return {
      shearArea,
      usesEffectiveShearArea: true,
    };
  }

  if (Number.isFinite(section?.area)) {
    return {
      shearArea: section.area,
      usesEffectiveShearArea: false,
    };
  }

  return {
    shearArea: null,
    usesEffectiveShearArea: false,
  };
}

function oppositeInertiaAxis(axis) {
  return axis === "inertiaZ" ? "inertiaY" : "inertiaZ";
}

function oppositeShearAreaAxis(axis) {
  return axis === "shearAreaZ" ? "shearAreaY" : "shearAreaZ";
}

function resolveBendingCoordinate(component, bendingInertiaAxis) {
  if (bendingInertiaAxis === "inertiaZ") {
    return component.centroidZ;
  }

  return component.centroidY;
}

function calculateCompositeFlexuralRigidity(section, material, inertiaAxis) {
  const pieces = section.components.map((component) => {
    const componentMaterial = component.material ?? material;
    const elasticModulus = componentMaterial?.elasticModulus;
    const area = component.section?.area;
    const inertia = component.section?.[inertiaAxis];
    const centroid = resolveBendingCoordinate(component, inertiaAxis);

    if (!Number.isFinite(elasticModulus) || !Number.isFinite(area) || !Number.isFinite(inertia)) {
      return null;
    }

    return {
      elasticModulus,
      area,
      inertia,
      centroid,
    };
  });

  if (pieces.some((piece) => piece === null)) {
    return null;
  }

  const axialRigidity = pieces.reduce(
    (sum, piece) => sum + piece.elasticModulus * piece.area,
    0,
  );
  const elasticCentroid =
    pieces.reduce(
      (sum, piece) => sum + piece.elasticModulus * piece.area * piece.centroid,
      0,
    ) / axialRigidity;

  return pieces.reduce(
    (sum, piece) =>
      sum +
      piece.elasticModulus *
        (piece.inertia + piece.area * (piece.centroid - elasticCentroid) ** 2),
    0,
  );
}

function calculateCompositeShearRigidity(section, material, shearAreaAxis) {
  const value = section.components.reduce((sum, component) => {
    const componentMaterial = component.material ?? material;
    const shearModulus = resolveShearModulus(componentMaterial);
    const { shearArea } = resolveShearArea(component.section, shearAreaAxis);

    return Number.isFinite(shearModulus) && Number.isFinite(shearArea)
      ? sum + shearModulus * shearArea
      : sum;
  }, 0);

  return value > 0 ? value : null;
}

function calculateSimpleSectionProperties({
  section,
  material,
  bendingInertiaAxis,
  shearAreaAxis,
  shearCorrectionFactor,
  units,
  context = {},
}) {
  const elasticModulus = material?.elasticModulus;
  const area = section?.area;
  const inertia = section?.[bendingInertiaAxis];

  assertPositive(elasticModulus, "material elasticModulus");
  assertPositive(area, "section area");
  assertPositive(inertia, `section ${bendingInertiaAxis}`);

  const shearModulus = resolveShearModulus(material);
  const { shearArea, usesEffectiveShearArea } = resolveShearArea(section, shearAreaAxis);
  const resolvedShearCorrectionFactor =
    shearCorrectionFactor ?? (usesEffectiveShearArea ? 1 : 5 / 6);
  const shearRigidity =
    Number.isFinite(shearModulus) && Number.isFinite(shearArea)
      ? shearModulus * shearArea
      : null;

  const oppositeInertia = section?.[oppositeInertiaAxis(bendingInertiaAxis)];
  const { shearArea: shearAreaOpposite } = resolveShearArea(
    section,
    oppositeShearAreaAxis(shearAreaAxis),
  );
  const normalized = normalizeBeamProperties(
    {
      axialRigidity: elasticModulus * area,
      flexuralRigidity: elasticModulus * inertia,
      shearRigidity,
      shearCorrectionFactor:
        shearRigidity === null ? null : resolvedShearCorrectionFactor,
      metadata: {
        source: "simple-section",
        bendingInertiaAxis,
        shearAreaAxis,
        usesEffectiveShearArea,
      },
    },
    units,
  );

  return applySectionRotationToBeamProperties({
    properties: normalized,
    sectionRotation: context.sectionRotation,
    flexuralRigidityY: elasticModulus * (section?.inertiaY ?? inertia),
    flexuralRigidityZ: Number.isFinite(section?.inertiaZ)
      ? elasticModulus * section.inertiaZ
      : Number.isFinite(oppositeInertia)
        ? elasticModulus * oppositeInertia
        : null,
    shearRigidityY:
      Number.isFinite(shearModulus) && Number.isFinite(section?.shearAreaY ?? section?.area)
        ? shearModulus * (section.shearAreaY ?? section.area)
        : null,
    shearRigidityZ:
      Number.isFinite(shearModulus) && Number.isFinite(shearAreaOpposite)
        ? shearModulus * shearAreaOpposite
        : null,
  });
}

function calculateCompositeSectionProperties({
  section,
  material,
  bendingInertiaAxis,
  shearAreaAxis,
  shearCorrectionFactor,
  units,
  context = {},
}) {
  const pieces = section.components.map((component) => {
    const componentMaterial = component.material ?? material;
    const elasticModulus = componentMaterial?.elasticModulus;
    const area = component.section?.area;
    const inertia = component.section?.[bendingInertiaAxis];
    const centroid = resolveBendingCoordinate(component, bendingInertiaAxis);

    assertPositive(elasticModulus, `component ${component.name ?? component.role} elasticModulus`);
    assertPositive(area, `component ${component.name ?? component.role} area`);
    assertPositive(inertia, `component ${component.name ?? component.role} ${bendingInertiaAxis}`);

    const shearModulus = resolveShearModulus(componentMaterial);
    const { shearArea } = resolveShearArea(component.section, shearAreaAxis);

    return {
      elasticModulus,
      area,
      inertia,
      centroid,
      shearRigidity:
        Number.isFinite(shearModulus) && Number.isFinite(shearArea)
          ? shearModulus * shearArea
          : 0,
    };
  });
  const axialRigidity = pieces.reduce(
    (sum, piece) => sum + piece.elasticModulus * piece.area,
    0,
  );
  const elasticCentroid =
    pieces.reduce(
      (sum, piece) => sum + piece.elasticModulus * piece.area * piece.centroid,
      0,
    ) / axialRigidity;
  const flexuralRigidity = pieces.reduce(
    (sum, piece) =>
      sum +
      piece.elasticModulus *
        (piece.inertia + piece.area * (piece.centroid - elasticCentroid) ** 2),
    0,
  );
  const shearRigidity = pieces.reduce(
    (sum, piece) => sum + piece.shearRigidity,
    0,
  );

  const flexuralRigidityY = calculateCompositeFlexuralRigidity(section, material, "inertiaY");
  const flexuralRigidityZ = calculateCompositeFlexuralRigidity(section, material, "inertiaZ");
  const shearRigidityY = calculateCompositeShearRigidity(section, material, "shearAreaY");
  const shearRigidityZ = calculateCompositeShearRigidity(section, material, "shearAreaZ");
  const normalized = normalizeBeamProperties(
    {
      axialRigidity,
      flexuralRigidity,
      shearRigidity: shearRigidity > 0 ? shearRigidity : null,
      shearCorrectionFactor: shearRigidity > 0 ? shearCorrectionFactor ?? 1 : null,
      metadata: {
        source: "composite-section-rigid-collaboration",
        bendingInertiaAxis,
        shearAreaAxis,
        elasticCentroid,
      },
    },
    units,
  );

  return applySectionRotationToBeamProperties({
    properties: normalized,
    sectionRotation: context.sectionRotation,
    flexuralRigidityY,
    flexuralRigidityZ,
    shearRigidityY,
    shearRigidityZ,
  });
}

export class ElasticBeamSectionProvider {
  constructor({
    section = null,
    material = null,
    source = null,
    propertyResolver = null,
    bendingInertiaAxis = "inertiaY",
    shearAreaAxis = "shearAreaY",
    shearCorrectionFactor = null,
    units = null,
    metadata = {},
  } = {}) {
    this.section = section;
    this.material = material;
    this.source = source ?? section;
    this.propertyResolver = propertyResolver;
    this.bendingInertiaAxis = bendingInertiaAxis;
    this.shearAreaAxis = shearAreaAxis;
    this.shearCorrectionFactor = shearCorrectionFactor;
    this.units = units ?? resolveUnits(section, material);
    this.metadata = { ...metadata };
  }

  getElasticBeamProperties(context = {}) {
    const fallbackUnits = this.units;
    const fallbackMetadata = {
      ...this.metadata,
      provider: "ElasticBeamSectionProvider",
    };

    if (typeof this.propertyResolver === "function") {
      const normalized = normalizeBeamProperties(
          this.propertyResolver({
            section: this.section,
            material: this.material,
            provider: this,
            context,
          }),
          fallbackUnits,
          fallbackMetadata,
        );

      return applySectionRotationToBeamProperties({
        properties: normalized,
        sectionRotation: context.sectionRotation,
      });
    }

    for (const methodName of [
      "getElasticBeamProperties",
      "calculateElasticBeamProperties",
    ]) {
      const method = this.source?.[methodName];

      if (typeof method === "function") {
        const normalized = normalizeBeamProperties(
          method.call(this.source, {
            section: this.section,
            material: this.material,
            bendingInertiaAxis: this.bendingInertiaAxis,
            shearAreaAxis: this.shearAreaAxis,
            shearCorrectionFactor: this.shearCorrectionFactor,
            context,
          }),
          fallbackUnits,
          fallbackMetadata,
        );

        return applySectionRotationToBeamProperties({
          properties: normalized,
          sectionRotation: context.sectionRotation,
        });
      }
    }

    if (!this.section) {
      throw new Error("ElasticBeamSectionProvider requires a section or propertyResolver.");
    }

    if (Array.isArray(this.section.components) && this.section.components.length > 0) {
      return calculateCompositeSectionProperties({
        section: this.section,
        material: this.material,
        bendingInertiaAxis: this.bendingInertiaAxis,
        shearAreaAxis: this.shearAreaAxis,
        shearCorrectionFactor: this.shearCorrectionFactor,
        units: fallbackUnits,
        context,
      });
    }

    if (!this.material) {
      throw new Error("ElasticBeamSectionProvider requires a material for simple sections.");
    }

    return calculateSimpleSectionProperties({
      section: this.section,
      material: this.material,
      bendingInertiaAxis: this.bendingInertiaAxis,
      shearAreaAxis: this.shearAreaAxis,
      shearCorrectionFactor: this.shearCorrectionFactor,
      units: fallbackUnits,
      context,
    });
  }
}

export function createElasticBeamSectionProvider(options = {}) {
  return new ElasticBeamSectionProvider(options);
}
