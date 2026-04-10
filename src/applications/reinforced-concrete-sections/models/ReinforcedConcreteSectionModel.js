import {
  assertExplicitUnitSystem,
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
    this.actions = {
      ...actions,
      nEd: unitResolver.force(actions.nEd),
      axialForce: unitResolver.force(actions.axialForce),
      mEd: unitResolver.moment(actions.mEd),
      mxEd: unitResolver.moment(actions.mxEd),
      myEd: unitResolver.moment(actions.myEd),
      nValues: Array.isArray(actions.nValues)
        ? actions.nValues.map((value) => unitResolver.force(value))
        : actions.nValues,
    };
    this.referencePoint = {
      type: referencePoint?.type ?? "concrete-centroid",
      coordinates: referencePoint?.coordinates == null
        ? null
        : convertPointCoordinates(referencePoint.coordinates, unitResolver, ["y", "z"]),
    };
    this.metadata = {
      ...metadata,
      unitSystem: units ? unitResolver.unitSystem : metadata.unitSystem,
    };
  }
}
