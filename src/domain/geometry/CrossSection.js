import {
  assertExplicitUnitSystem,
  createUnitResolver,
  convertPointCoordinates,
} from "../units/UnitSystem.js";

export class CrossSection {
  constructor({
    id = null,
    name,
    area,
    centroidY = null,
    centroidZ = null,
    inertiaY = null,
    inertiaZ = null,
    torsionalConstant = null,
    shearAreaY = null,
    shearAreaZ = null,
    elasticSectionModulusY = null,
    elasticSectionModulusZ = null,
    plasticSectionModulusY = null,
    plasticSectionModulusZ = null,
    height = null,
    width = null,
    outlinePoints = [],
    units = null,
    metadata = {},
  }) {
    if (!name) {
      throw new Error("A cross-section name is required.");
    }

    assertExplicitUnitSystem(units, "CrossSection");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    const resolvedArea = unitResolver.area(area);

    if (!Number.isFinite(resolvedArea) || resolvedArea <= 0) {
      throw new Error("A positive cross-section area is required.");
    }

    this.id = id;
    this.name = name;
    this.area = resolvedArea;
    this.centroidY = unitResolver.length(centroidY);
    this.centroidZ = unitResolver.length(centroidZ);
    this.inertiaY = unitResolver.inertia(inertiaY);
    this.inertiaZ = unitResolver.inertia(inertiaZ);
    this.torsionalConstant = unitResolver.inertia(torsionalConstant);
    this.shearAreaY = unitResolver.area(shearAreaY);
    this.shearAreaZ = unitResolver.area(shearAreaZ);
    this.elasticSectionModulusY = unitResolver.sectionModulus(elasticSectionModulusY);
    this.elasticSectionModulusZ = unitResolver.sectionModulus(elasticSectionModulusZ);
    this.plasticSectionModulusY = unitResolver.sectionModulus(plasticSectionModulusY);
    this.plasticSectionModulusZ = unitResolver.sectionModulus(plasticSectionModulusZ);
    this.height = unitResolver.length(height);
    this.width = unitResolver.length(width);
    this.outlinePoints = outlinePoints.map((point) =>
      convertPointCoordinates(point, unitResolver, ["y", "z"]));
    this.metadata = {
      ...metadata,
      unitSystem: units ? unitResolver.unitSystem : metadata.unitSystem,
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      area: this.area,
      centroidY: this.centroidY,
      centroidZ: this.centroidZ,
      inertiaY: this.inertiaY,
      inertiaZ: this.inertiaZ,
      torsionalConstant: this.torsionalConstant,
      shearAreaY: this.shearAreaY,
      shearAreaZ: this.shearAreaZ,
      elasticSectionModulusY: this.elasticSectionModulusY,
      elasticSectionModulusZ: this.elasticSectionModulusZ,
      plasticSectionModulusY: this.plasticSectionModulusY,
      plasticSectionModulusZ: this.plasticSectionModulusZ,
      height: this.height,
      width: this.width,
      outlinePoints: this.outlinePoints.map((point) => ({ ...point })),
      metadata: { ...this.metadata },
    };
  }
}
