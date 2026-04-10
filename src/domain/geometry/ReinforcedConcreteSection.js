import { CrossSection } from "./CrossSection.js";
import { CompositeSection } from "../composite/CompositeSection.js";
import { CompositeSectionComponent } from "../composite/CompositeSectionComponent.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

export class ReinforcedConcreteSection extends CrossSection {
  constructor({
    id = null,
    name = "Reinforced concrete section",
    concreteSection,
    reinforcementBars = [],
    concreteMaterial = null,
    reinforcementMaterial = null,
    referenceModularRatio = 1,
    units = null,
    metadata = {},
  }) {
    if (!concreteSection) {
      throw new Error("ReinforcedConcreteSection requires a concreteSection.");
    }

    assertExplicitUnitSystem(
      units ?? concreteSection.metadata?.unitSystem ?? reinforcementBars[0]?.metadata?.unitSystem,
      "ReinforcedConcreteSection",
    );

    const resolvedUnits =
      units ??
      concreteSection.metadata?.unitSystem ??
      reinforcementBars[0]?.metadata?.unitSystem ??
      null;

    const concreteComponent = new CompositeSectionComponent({
      name: "Concrete core",
      section: concreteSection,
      material: concreteMaterial,
      centroidY: concreteSection.centroidY ?? concreteSection.height / 2,
      centroidZ: concreteSection.centroidZ ?? concreteSection.width / 2,
      modularRatio: 1,
      role: "concrete",
      units: resolvedUnits,
    });

    const reinforcementComponents = reinforcementBars.map((bar, index) =>
      new CompositeSectionComponent({
        id: bar.id ?? `rebar-${index + 1}`,
        name: bar.name ?? `Rebar ${index + 1}`,
        section: new CrossSection({
          name: `Equivalent bar ${index + 1}`,
          area: bar.area,
          centroidY: 0,
          centroidZ: 0,
          inertiaY: 0,
          inertiaZ: 0,
          height: 0,
          width: 0,
          units: resolvedUnits,
        }),
        material: bar.material ?? reinforcementMaterial,
        centroidY: bar.y,
        centroidZ: bar.z ?? concreteSection.centroidZ ?? concreteSection.width / 2,
        modularRatio: referenceModularRatio,
        role: "reinforcement",
        units: resolvedUnits,
        metadata: {
          reinforcementArea: bar.area,
          reinforcementDiameter: bar.diameter,
        },
      }),
    );

    const transformed = new CompositeSection({
      name,
      components: [concreteComponent, ...reinforcementComponents],
      units: resolvedUnits,
      metadata,
    });

    super({
      id,
      name,
      area: concreteSection.area,
      centroidY: transformed.centroidY,
      centroidZ: transformed.centroidZ,
      inertiaY: transformed.inertiaY,
      inertiaZ: transformed.inertiaZ,
      elasticSectionModulusY: transformed.elasticSectionModulusY,
      elasticSectionModulusZ: transformed.elasticSectionModulusZ,
      height: concreteSection.height,
      width: concreteSection.width,
      outlinePoints: concreteSection.outlinePoints,
      units: resolvedUnits,
      metadata: {
        ...metadata,
        shape: "reinforced-concrete",
      },
    });

    this.concreteSection = concreteSection;
    this.reinforcementBars = [...reinforcementBars];
    this.concreteMaterial = concreteMaterial;
    this.reinforcementMaterial = reinforcementMaterial;
    this.transformedSection = transformed;
  }

  totalReinforcementArea() {
    return this.reinforcementBars.reduce((sum, bar) => sum + bar.area, 0);
  }

  getConcreteOutlinePoints() {
    return this.concreteSection.outlinePoints.map((point) => ({ ...point }));
  }

  getReinforcementBars() {
    return [...this.reinforcementBars];
  }

  getBoundingBox() {
    const outlinePoints = this.getConcreteOutlinePoints();

    if (outlinePoints.length > 0) {
      const yValues = outlinePoints.map((point) => point.y);
      const zValues = outlinePoints.map((point) => point.z);

      return {
        minY: Math.min(...yValues),
        maxY: Math.max(...yValues),
        minZ: Math.min(...zValues),
        maxZ: Math.max(...zValues),
      };
    }

    const centroidY = this.concreteSection.centroidY ?? this.centroidY ?? 0;
    const centroidZ = this.concreteSection.centroidZ ?? this.centroidZ ?? 0;
    const height = this.concreteSection.height ?? this.height ?? 0;
    const width = this.concreteSection.width ?? this.width ?? 0;

    return {
      minY: centroidY - height / 2,
      maxY: centroidY + height / 2,
      minZ: centroidZ - width / 2,
      maxZ: centroidZ + width / 2,
    };
  }

  getReferencePoint(type = "concrete-centroid", coordinates = null) {
    const unitResolver = createUnitResolver(
      coordinates?.units ?? null,
      { force: "N", length: "mm" },
    );

    switch (type) {
      case "concrete-centroid":
        return {
          y: this.concreteSection.centroidY,
          z: this.concreteSection.centroidZ,
        };
      case "transformed-centroid":
        return {
          y: this.centroidY,
          z: this.centroidZ,
        };
      case "section-center": {
        const bounds = this.getBoundingBox();

        return {
          y: (bounds.minY + bounds.maxY) / 2,
          z: (bounds.minZ + bounds.maxZ) / 2,
        };
      }
      case "custom":
        if (
          !coordinates ||
          !Number.isFinite(coordinates.y) ||
          !Number.isFinite(coordinates.z)
        ) {
          throw new Error(
            "ReinforcedConcreteSection custom reference point requires finite y and z coordinates.",
          );
        }

        return {
          y: unitResolver.length(coordinates.y),
          z: unitResolver.length(coordinates.z),
        };
      default:
        throw new Error(`Unsupported reference point type: ${type}.`);
    }
  }

  toJSON() {
    return {
      ...super.toJSON(),
      concreteSection: this.concreteSection.toJSON(),
      reinforcementBars: this.reinforcementBars.map((bar) => bar.toJSON()),
      concreteMaterial:
        this.concreteMaterial?.toJSON?.() ?? this.concreteMaterial,
      reinforcementMaterial:
        this.reinforcementMaterial?.toJSON?.() ?? this.reinforcementMaterial,
      transformedSection: this.transformedSection.toJSON(),
    };
  }
}
