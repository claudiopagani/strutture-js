import { createUnitResolver } from "../units/UnitSystem.js";
import { createElementLoadIndex } from "../fem/ElementLoadIndex.js";
import { coordinateAtStation } from "./SingleBeamStations.js";
import { splitPrincipalActions } from "./SectionRotation.js";

const DEFAULT_SECTION_PROPERTY_UNITS = Object.freeze({ force: "N", length: "mm" });
const SECTION_ROTATION_2D_WARNING =
  "Section rotation alpha is non-zero: SingleBeamAnalysis remains a 2D FEM model. Vertical deflection uses equivalent projected EI/GA and actions are split into principal components; torsion and independent weak-axis transverse displacement are not modeled.";

export function sectionRotationWarnings(sectionRotation) {
  return Math.abs(sectionRotation?.alpha ?? 0) > 1e-14
    ? [SECTION_ROTATION_2D_WARNING]
    : [];
}

export function convertBeamProperties(properties, targetUnits) {
  const propertyUnits = properties.units ?? DEFAULT_SECTION_PROPERTY_UNITS;
  const resolver = createUnitResolver(propertyUnits, targetUnits);
  const flexural = (value) =>
    value == null
      ? null
      : resolver.convert(value, {
          forceExponent: 1,
          lengthExponent: 2,
        });
  const converted = {
    axialRigidity: resolver.force(properties.axialRigidity),
    flexuralRigidity: flexural(properties.flexuralRigidity),
    flexuralRigidityY: flexural(properties.flexuralRigidityY),
    flexuralRigidityZ: flexural(properties.flexuralRigidityZ),
    shearRigidity:
      properties.shearRigidity == null
        ? null
        : resolver.force(properties.shearRigidity),
    shearRigidityY:
      properties.shearRigidityY == null
        ? null
        : resolver.force(properties.shearRigidityY),
    shearRigidityZ:
      properties.shearRigidityZ == null
        ? null
        : resolver.force(properties.shearRigidityZ),
    shearCorrectionFactor: properties.shearCorrectionFactor ?? null,
    units: targetUnits,
    metadata: { ...properties.metadata },
  };

  return converted;
}

function convertDisplacementMap(displacementByNode, resolver) {
  return Object.fromEntries(
    Object.entries(displacementByNode).map(([nodeId, values]) => [
      nodeId,
      {
        ux: resolver.length(values.ux ?? 0),
        uy: resolver.length(values.uy ?? 0),
        rz: values.rz ?? 0,
      },
    ]),
  );
}

function convertReactionMap(reactionByNode, resolver) {
  return Object.fromEntries(
    Object.entries(reactionByNode).map(([nodeId, values]) => [
      nodeId,
      {
        ux: resolver.force(values.ux ?? 0),
        uy: resolver.force(values.uy ?? 0),
        rz: resolver.moment(values.rz ?? 0),
      },
    ]),
  );
}

function extremum(samples, key, compare) {
  if (samples.length === 0) {
    return null;
  }

  return samples.reduce((selected, sample) =>
    compare(sample[key], selected[key]) ? sample : selected,
  );
}

function summarizeInternalForces(samples) {
  return {
    maxAxialForce: extremum(samples, "n", (a, b) => a > b),
    minAxialForce: extremum(samples, "n", (a, b) => a < b),
    maxShearForce: extremum(samples, "v", (a, b) => a > b),
    minShearForce: extremum(samples, "v", (a, b) => a < b),
    maxShearForceY: extremum(samples, "vY", (a, b) => a > b),
    minShearForceY: extremum(samples, "vY", (a, b) => a < b),
    maxShearForceZ: extremum(samples, "vZ", (a, b) => a > b),
    minShearForceZ: extremum(samples, "vZ", (a, b) => a < b),
    maxBendingMoment: extremum(samples, "m", (a, b) => a > b),
    minBendingMoment: extremum(samples, "m", (a, b) => a < b),
    maxBendingMomentY: extremum(samples, "mY", (a, b) => a > b),
    minBendingMomentY: extremum(samples, "mY", (a, b) => a < b),
    maxBendingMomentZ: extremum(samples, "mZ", (a, b) => a > b),
    minBendingMomentZ: extremum(samples, "mZ", (a, b) => a < b),
    maxAbsBendingMoment: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.m) > Math.abs(selected.m) ? sample : selected,
      samples[0] ?? null,
    ),
    maxAbsBendingMomentY: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.mY ?? 0) > Math.abs(selected.mY ?? 0) ? sample : selected,
      samples[0] ?? null,
    ),
    maxAbsBendingMomentZ: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.mZ ?? 0) > Math.abs(selected.mZ ?? 0) ? sample : selected,
      samples[0] ?? null,
    ),
    maxAbsShearForceY: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.vY ?? 0) > Math.abs(selected.vY ?? 0) ? sample : selected,
      samples[0] ?? null,
    ),
    maxAbsShearForceZ: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.vZ ?? 0) > Math.abs(selected.vZ ?? 0) ? sample : selected,
      samples[0] ?? null,
    ),
  };
}

function summarizeReactions(samples) {
  return {
    maxHorizontalReaction: extremum(samples, "ux", (a, b) => a > b),
    minHorizontalReaction: extremum(samples, "ux", (a, b) => a < b),
    maxVerticalReaction: extremum(samples, "uy", (a, b) => a > b),
    minVerticalReaction: extremum(samples, "uy", (a, b) => a < b),
    maxSupportMomentReaction: extremum(samples, "rz", (a, b) => a > b),
    minSupportMomentReaction: extremum(samples, "rz", (a, b) => a < b),
    maxAbsHorizontalReaction: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.ux) > Math.abs(selected.ux) ? sample : selected,
      samples[0] ?? null,
    ),
    maxAbsVerticalReaction: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.uy) > Math.abs(selected.uy) ? sample : selected,
      samples[0] ?? null,
    ),
    maxAbsSupportMomentReaction: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.rz) > Math.abs(selected.rz) ? sample : selected,
      samples[0] ?? null,
    ),
  };
}

export function sampleBeamResult({
  model,
  femModel,
  solution,
  sectionProperties,
  femUnits,
  elementLoadIndex = null,
}) {
  const resolver = createUnitResolver(femUnits, model.units);
  const displacementByNode = convertDisplacementMap(
    solution.displacementByNode,
    resolver,
  );
  const reactionByNode = convertReactionMap(solution.reactionByNode, resolver);
  const nodeResults = femModel.nodes.map((node) => ({
    id: node.id,
    station: resolver.length(node.metadata.station ?? 0),
    x: resolver.length(node.x),
    y: resolver.length(node.y),
    displacement: displacementByNode[node.id],
    reaction: reactionByNode[node.id],
  }));
  const supports = femModel.supports.map((support) => ({
    id: support.id,
    nodeId: support.node.id,
    station: resolver.length(support.metadata.station ?? 0),
    type: support.metadata.type ?? null,
    restraints: { ...support.restraints },
    reaction: reactionByNode[support.node.id],
  }));
  const reactionSamples = supports.map((support) => ({
    supportId: support.id,
    nodeId: support.nodeId,
    station: support.station,
    type: support.type,
    ux: support.reaction?.ux ?? 0,
    uy: support.reaction?.uy ?? 0,
    rz: support.reaction?.rz ?? 0,
  }));
  const internalForceSamples = [];
  const resolvedElementLoadIndex =
    elementLoadIndex ?? createElementLoadIndex(femModel.loads ?? []);

  for (const element of femModel.elements) {
    const elementLoads = resolvedElementLoadIndex.get(element);
    const localStations = [0, element.length() / 2, element.length()];
    const samples = element.sampleInternalForces({
      displacements: solution.displacements,
      dofRegistry: solution.dofRegistry,
      loads: elementLoads,
      stations: localStations,
    });

    for (const sample of samples) {
      const station = (element.metadata.startStation ?? 0) + sample.x;
      const coordinates = coordinateAtStation(femModel.geometry, station);
      const principalActions = splitPrincipalActions(
        {
          n: resolver.force(sample.n),
          v: resolver.force(sample.v),
          m: resolver.moment(sample.m),
        },
        model.sectionRotation,
      );

      internalForceSamples.push({
        elementId: element.id,
        station: resolver.length(station),
        x: resolver.length(coordinates.x),
        y: resolver.length(coordinates.y),
        n: resolver.force(sample.n),
        v: resolver.force(sample.v),
        m: resolver.moment(sample.m),
        vY: principalActions.vY,
        vZ: principalActions.vZ,
        mY: principalActions.mY,
        mZ: principalActions.mZ,
        principalActions,
      });
    }
  }

  const displacementSamples = nodeResults.map((node) => ({
    nodeId: node.id,
    station: node.station,
    x: node.x,
    y: node.y,
    ux: node.displacement.ux,
    uy: node.displacement.uy,
    rz: node.displacement.rz,
  }));
  const maxAbsVerticalDisplacement = displacementSamples.reduce(
    (selected, sample) =>
      Math.abs(sample.uy) > Math.abs(selected.uy) ? sample : selected,
    displacementSamples[0] ?? null,
  );

  return {
    units: model.units,
    geometry: femModel.outputGeometry,
    sectionProperties: convertBeamProperties(sectionProperties, model.units),
    sectionRotation: { ...model.sectionRotation },
    warnings: sectionRotationWarnings(model.sectionRotation),
    nodes: nodeResults,
    supports,
    displacementByNode,
    reactionByNode,
    reactions: {
      samples: reactionSamples,
      ...summarizeReactions(reactionSamples),
    },
    displacements: {
      samples: displacementSamples,
      maxAbsVerticalDisplacement,
    },
    internalForces: {
      samples: internalForceSamples,
      ...summarizeInternalForces(internalForceSamples),
    },
    fem: {
      nodeCount: femModel.nodes.length,
      elementCount: femModel.elements.length,
      loadCount: femModel.allLoads.length,
    },
  };
}
