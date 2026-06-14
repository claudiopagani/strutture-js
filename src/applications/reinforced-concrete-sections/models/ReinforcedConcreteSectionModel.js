// @ts-check

import {
  assertExplicitUnitSystem,
  convertUnitProperties,
  createUnitResolver,
  convertPointCoordinates,
} from "../../../domain/units/UnitSystem.js";

/**
 * Explicit source unit system for RC section input.
 *
 * Actions are accepted in this unit system and normalized internally to N and
 * mm. Geometry/reinforcement/material payloads remain DTO/domain objects for
 * downstream solvers to interpret.
 *
 * @typedef {Object} ReinforcedConcreteSectionUnitSystem
 * @property {string} force
 * @property {string} length
 */

/**
 * @typedef {Object} ReinforcedConcreteSectionActionsInput
 * @property {number} [nEd] Axial force in source force units.
 * @property {number} [axialForce] Axial force alias in source force units.
 * @property {number} [mEd] Alias of mxEd in source force*length units.
 * @property {number} [mxEd] Mzz component, positive by the right-hand rule around +z.
 * @property {number} [myEd] Myy component, positive by the right-hand rule around +y.
 * @property {number[]} [nValues] Axial force sampling values in source force units.
 */

/**
 * @typedef {Object} ReinforcedConcreteSectionReferencePointInput
 * @property {string} [type]
 * @property {{ y?: number, z?: number }|null} [coordinates] Coordinates in source length units.
 */

/**
 * Public DTO for reinforced-concrete section analyses.
 *
 * The constructor normalizes action forces/moments and reference point
 * coordinates to the internal N-mm unit system while keeping the remaining
 * structural DTO payloads shallow-copied.
 *
 * @typedef {Object} ReinforcedConcreteSectionModelInput
 * @property {string} id
 * @property {unknown} [section]
 * @property {Record<string, unknown>} [geometry]
 * @property {Record<string, unknown>} [reinforcement]
 * @property {Record<string, unknown>} [materials]
 * @property {Record<string, unknown>} [constitutiveModels]
 * @property {string} [analysisType]
 * @property {Record<string, unknown>} [analysisSettings]
 * @property {Record<string, unknown>} [mesh]
 * @property {Record<string, unknown>} [solver]
 * @property {ReinforcedConcreteSectionActionsInput & Record<string, unknown>} [actions]
 * @property {ReinforcedConcreteSectionReferencePointInput} [referencePoint]
 * @property {ReinforcedConcreteSectionUnitSystem} units
 * @property {Record<string, unknown>} [metadata]
 */

export class ReinforcedConcreteSectionModel {
  /**
   * @param {ReinforcedConcreteSectionModelInput} input
   */
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
