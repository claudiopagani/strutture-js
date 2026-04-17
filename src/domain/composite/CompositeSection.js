import { CrossSection } from "../geometry/CrossSection.js";
import { assertExplicitUnitSystem } from "../units/UnitSystem.js";

function maxDistance(values, centroid) {
  return Math.max(...values.map((value) => Math.abs(value - centroid)));
}

export class CompositeSection extends CrossSection {
  constructor({
    id = null,
    name = "Composite section",
    components,
    units = null,
    metadata = {},
  }) {
    if (!Array.isArray(components) || components.length === 0) {
      throw new Error("CompositeSection requires at least one component.");
    }

    assertExplicitUnitSystem(units, "CompositeSection");

    const transformedArea = components.reduce(
      (sum, component) => sum + component.transformedArea(),
      0,
    );

    const centroidY =
      components.reduce(
        (sum, component) =>
          sum + component.transformedArea() * component.centroidY,
        0,
      ) / transformedArea;

    const centroidZ =
      components.reduce(
        (sum, component) =>
          sum + component.transformedArea() * component.centroidZ,
        0,
      ) / transformedArea;

    const inertiaY = components.reduce(
      (sum, component) =>
        sum +
        component.transformedInertiaY() +
        component.transformedArea() * (component.centroidY - centroidY) ** 2,
      0,
    );

    const inertiaZ = components.reduce(
      (sum, component) =>
        sum +
        component.transformedInertiaZ() +
        component.transformedArea() * (component.centroidZ - centroidZ) ** 2,
      0,
    );
    const productOfInertiaYZ = components.reduce(
      (sum, component) =>
        sum +
        component.transformedProductOfInertiaYZ() +
        component.transformedArea() *
          (component.centroidY - centroidY) *
          (component.centroidZ - centroidZ),
      0,
    );

    const topFiberY = Math.max(
      ...components.map(
        (component) =>
          component.centroidY + (component.section.height ?? 0) / 2,
      ),
    );

    const bottomFiberY = Math.min(
      ...components.map(
        (component) =>
          component.centroidY - (component.section.height ?? 0) / 2,
      ),
    );

    const rightFiberZ = Math.max(
      ...components.map(
        (component) =>
          component.centroidZ + (component.section.width ?? 0) / 2,
      ),
    );

    const leftFiberZ = Math.min(
      ...components.map(
        (component) =>
          component.centroidZ - (component.section.width ?? 0) / 2,
      ),
    );

    super({
      id,
      name,
      area: transformedArea,
      centroidY,
      centroidZ,
      inertiaY,
      inertiaZ,
      productOfInertiaYZ,
      elasticSectionModulusY:
        inertiaY / maxDistance([topFiberY, bottomFiberY], centroidY),
      elasticSectionModulusZ:
        inertiaZ / maxDistance([rightFiberZ, leftFiberZ], centroidZ),
      height: topFiberY - bottomFiberY,
      width: rightFiberZ - leftFiberZ,
      units,
      metadata: {
        ...metadata,
        shape: "composite",
      },
    });

    this.components = [...components];
  }

  getComponent(role) {
    return this.components.find((component) => component.role === role) ?? null;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      components: this.components.map((component) => component.toJSON()),
    };
  }
}
