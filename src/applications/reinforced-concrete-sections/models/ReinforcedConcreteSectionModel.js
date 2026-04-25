import {
  assertExplicitUnitSystem,
  convertUnitProperties,
  createUnitResolver,
  convertPointCoordinates,
} from "../../../domain/units/UnitSystem.js";

export class ReinforcedConcreteSectionModel {
  constructor({
    id,
    section = null,
    geometry = {},
    reinforcement = {},
    materials = {},
    constitutiveModels = {},
    analysisType = "uls-uniaxial-resistance",
    analysisSettings = {},
    mesh = {},
    solver = {},
    actions = {},
    referencePoint = {
      type: "concrete-centroid",
      coordinates: null,
    },
    units = null,
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A reinforced concrete section model id is required.");
    }

    assertExplicitUnitSystem(units, "ReinforcedConcreteSectionModel");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    this.id = id;
    this.section = section;
    this.geometry = { ...geometry };
    this.reinforcement = { ...reinforcement };
    this.materials = { ...materials };
    this.constitutiveModels = { ...constitutiveModels };
    this.analysisType = analysisType;
    this.analysisSettings = { ...analysisSettings };
    this.mesh = { ...mesh };
    this.solver = { ...solver };
    this.actions = convertUnitProperties(actions, {
      nEd: unitResolver.force,
      axialForce: unitResolver.force,
      mEd: unitResolver.moment,
      mxEd: unitResolver.moment,
      myEd: unitResolver.moment,
      nValues: (values) =>
        Array.isArray(values)
          ? values.map((value) => unitResolver.force(value))
          : values,
    });
    this.referencePoint = {
      type: referencePoint?.type ?? "concrete-centroid",
      coordinates: referencePoint?.coordinates == null
        ? null
        : convertPointCoordinates(referencePoint.coordinates, unitResolver, ["y", "z"]),
    };
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }
}
