import { DenseLinearSolver } from "../math/DenseLinearSolver.js";
import { assertExplicitUnitSystem } from "../units/UnitSystem.js";
import { EmbeddedRetainingWallModel } from
  "./EmbeddedRetainingWallModel.js";
import { EmbeddedRetainingWallScenario } from
  "./EmbeddedRetainingWallScenario.js";
import { GeotechnicalDesignSituation } from
  "./GeotechnicalDesignSituation.js";
import { GroundModel } from "./GroundModel.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const EMBEDDED_RETAINING_WALL_RESULT_SCHEMA_VERSION =
  "embedded-retaining-wall-result/v1";

export const EMBEDDED_RETAINING_WALL_REFERENCES = Object.freeze([
  "FHWA GEC 4, FHWA-IF-99-015 (1999), chapters 5 and 8",
  "FHWA-HRT-10-077 (2013), chapter 6 staged finite-element modeling features",
]);

const SOURCE_URLS = Object.freeze([
  "https://www.fhwa.dot.gov/engineering/geotech/pubs/if99015.pdf",
  "https://www.fhwa.dot.gov/publications/research/infrastructure/10077/006.cfm",
]);
const TOLERANCE = 1e-10;
const SIDES = Object.freeze(["retained", "excavation"]);

class EmbeddedWallNotSupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = "EmbeddedWallNotSupportedError";
  }
}

function result({
  status,
  summary,
  outputs = {},
  warnings = [],
  assumptions = [],
  metadata = {},
}) {
  return { status, summary, outputs, warnings, assumptions, metadata };
}

function normalizeGroundModel(value, units) {
  return value instanceof GroundModel
    ? value
    : new GroundModel({ ...value, units: value?.units ?? units });
}

function normalizeDesignSituation(value, groundModel, units) {
  return value instanceof GeotechnicalDesignSituation
    ? value
    : new GeotechnicalDesignSituation({
        ...value,
        groundModel,
        units: value?.units ?? units,
      });
}

function normalizeWall(value, units) {
  return value instanceof EmbeddedRetainingWallModel
    ? value
    : new EmbeddedRetainingWallModel({
        ...value,
        units: value?.units ?? units,
      });
}

function normalizeScenario(value, units) {
  return value instanceof EmbeddedRetainingWallScenario
    ? value
    : new EmbeddedRetainingWallScenario({
        ...value,
        units: value?.units ?? units,
      });
}

function zeroVector(size) {
  return new Array(size).fill(0);
}

function zeroMatrix(size) {
  return Array.from({ length: size }, () => zeroVector(size));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function matrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce(
    (sum, value, index) => sum + value * vector[index],
    0,
  ));
}

function maxAbs(values) {
  return values.reduce(
    (maximum, value) => Math.max(maximum, Math.abs(value)),
    0,
  );
}

function addUnique(values, candidate, tolerance = TOLERANCE) {
  if (!values.some((value) => Math.abs(value - candidate) <= tolerance)) {
    values.push(candidate);
  }
}

function addBoundary(boundaries, value, wall) {
  if (
    value < wall.topElevation - TOLERANCE &&
    value > wall.toeElevation + TOLERANCE
  ) {
    addUnique(boundaries, value);
  }
}

function sideSign(side) {
  return side === "retained" ? 1 : -1;
}

function buildMesh({ groundModel, wall, scenario }) {
  const boundaries = [wall.topElevation, wall.toeElevation];
  for (const segment of wall.flexuralRigiditySegments) {
    addBoundary(boundaries, segment.topElevation, wall);
    addBoundary(boundaries, segment.bottomElevation, wall);
  }
  for (const side of SIDES) {
    const sideDefinition = scenario.soilResponse.sides[side];
    const profile = groundModel.getProfile(sideDefinition.profileId);
    for (const layer of profile.layers) {
      addBoundary(boundaries, layer.topElevation, wall);
      addBoundary(boundaries, layer.bottomElevation, wall);
    }
    for (const curve of Object.values(sideDefinition.curvesByLayer)) {
      for (const station of curve.stations) {
        addBoundary(
          boundaries,
          profile.groundSurfaceElevation - station.depth,
          wall,
        );
      }
    }
  }
  for (const support of scenario.supports) {
    addBoundary(boundaries, support.elevation, wall);
  }
  for (const stage of scenario.stages) {
    addBoundary(boundaries, stage.retainedGroundElevation, wall);
    addBoundary(boundaries, stage.excavationGroundElevation, wall);
    for (const action of stage.nodalActions) {
      addBoundary(boundaries, action.elevation, wall);
    }
    for (const load of stage.pressureLoads) {
      for (const segment of load.segments) {
        addBoundary(boundaries, segment.topElevation, wall);
        addBoundary(boundaries, segment.bottomElevation, wall);
      }
    }
  }
  boundaries.sort((left, right) => right - left);

  const elevations = [];
  for (let interval = 0; interval < boundaries.length - 1; interval += 1) {
    const top = boundaries[interval];
    const bottom = boundaries[interval + 1];
    const length = top - bottom;
    const subdivisions = Math.max(
      1,
      Math.ceil(length / scenario.discretization.maxElementLength),
    );
    if (interval === 0) elevations.push(top);
    for (let index = 1; index <= subdivisions; index += 1) {
      elevations.push(top - length * index / subdivisions);
    }
  }

  const nodes = elevations.map((elevation, index) => ({
    id: `embedded-wall-node-${index + 1}`,
    index,
    elevation,
    depthFromWallHead: wall.topElevation - elevation,
    isWallHead: index === 0,
    isWallToe: index === elevations.length - 1,
  }));
  const elements = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const start = nodes[index];
    const end = nodes[index + 1];
    const midpointElevation = (start.elevation + end.elevation) / 2;
    const section = wall.flexuralRigidityAtElevation(midpointElevation);
    elements.push({
      id: `embedded-wall-element-${index + 1}`,
      index,
      startNodeIndex: start.index,
      endNodeIndex: end.index,
      topElevation: start.elevation,
      bottomElevation: end.elevation,
      midpointElevation,
      length: start.elevation - end.elevation,
      sectionId: section.id,
      flexuralRigidity: section.flexuralRigidity,
    });
  }
  return { nodes, elements };
}

function beamElementStiffness(flexuralRigidity, length) {
  const factor = flexuralRigidity / length ** 3;
  return [
    [12 * factor, 6 * length * factor, -12 * factor, 6 * length * factor],
    [
      6 * length * factor,
      4 * length ** 2 * factor,
      -6 * length * factor,
      2 * length ** 2 * factor,
    ],
    [-12 * factor, -6 * length * factor, 12 * factor, -6 * length * factor],
    [
      6 * length * factor,
      2 * length ** 2 * factor,
      -6 * length * factor,
      4 * length ** 2 * factor,
    ],
  ];
}

function elementDofIndices(element) {
  return [
    2 * element.startNodeIndex,
    2 * element.startNodeIndex + 1,
    2 * element.endNodeIndex,
    2 * element.endNodeIndex + 1,
  ];
}

function assembleBeam(mesh) {
  const size = 2 * mesh.nodes.length;
  const stiffness = zeroMatrix(size);
  const elementStiffnesses = [];
  for (const element of mesh.elements) {
    const local = beamElementStiffness(
      element.flexuralRigidity,
      element.length,
    );
    const indices = elementDofIndices(element);
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        stiffness[indices[row]][indices[column]] += local[row][column];
      }
    }
    elementStiffnesses.push(local);
  }
  return { stiffness, elementStiffnesses };
}

function buildNodeContributions(mesh) {
  const contributions = mesh.nodes.map(() => []);
  for (const element of mesh.elements) {
    const contribution = {
      elementId: element.id,
      samplingElevation: element.midpointElevation,
      tributaryLength: element.length / 2,
    };
    contributions[element.startNodeIndex].push({ ...contribution });
    contributions[element.endNodeIndex].push({ ...contribution });
  }
  return contributions;
}

function findNodeIndexAtElevation(mesh, elevation, label) {
  const node = mesh.nodes.find((candidate) =>
    Math.abs(candidate.elevation - elevation) <= TOLERANCE);
  if (!node) throw new Error(`${label} is not represented in the wall mesh.`);
  return node.index;
}

function bracketStations(stations, depth) {
  if (stations.length === 1 || depth <= stations[0].depth) {
    return { left: stations[0], right: stations[0], ratio: 0 };
  }
  if (depth >= stations.at(-1).depth) {
    return { left: stations.at(-1), right: stations.at(-1), ratio: 0 };
  }
  for (let index = 1; index < stations.length; index += 1) {
    if (depth <= stations[index].depth) {
      const left = stations[index - 1];
      const right = stations[index];
      return {
        left,
        right,
        ratio: (depth - left.depth) / (right.depth - left.depth),
      };
    }
  }
  return { left: stations.at(-1), right: stations.at(-1), ratio: 0 };
}

function evaluateLayerCurve(layerCurve, depth, closureDisplacement) {
  const bracket = bracketStations(layerCurve.stations, depth);
  const left = bracket.left.law.evaluate(closureDisplacement);
  const right = bracket.right === bracket.left
    ? left
    : bracket.right.law.evaluate(closureDisplacement);
  const interpolate = (leftValue, rightValue) =>
    (leftValue + bracket.ratio * (rightValue - leftValue)) *
      layerCurve.reactionMultiplier;
  return {
    closureDisplacement,
    effectivePressure: interpolate(
      left.effectivePressure,
      right.effectivePressure,
    ),
    tangentModulus: interpolate(
      left.tangentModulus,
      right.tangentModulus,
    ),
    pressureAtZero: interpolate(left.pressureAtZero, right.pressureAtZero),
    interpolation: {
      leftStationDepth: bracket.left.depth,
      rightStationDepth: bracket.right.depth,
      ratio: bracket.ratio,
      leftLawId: bracket.left.law.id,
      rightLawId: bracket.right.law.id,
    },
    extrapolated: left.extrapolated || right.extrapolated,
  };
}

function groundElevation(stage, side) {
  return side === "retained"
    ? stage.retainedGroundElevation
    : stage.excavationGroundElevation;
}

function resolveField(groundModel, stage, side, sideDefinition) {
  const stageSelection = stage.porePressureFieldIdBySide;
  const id = Object.hasOwn(stageSelection, side)
    ? stageSelection[side]
    : sideDefinition.defaultPorePressureFieldId;
  return id == null ? null : groundModel.getPorePressureField(id);
}

function emptySideResponse(side, displacement) {
  return {
    side,
    displacement,
    closureDisplacement: -sideSign(side) * displacement,
    activeTributaryLength: 0,
    effectiveSoilForceOnWall: 0,
    waterForceOnWall: 0,
    totalForceOnWall: 0,
    internalResistance: 0,
    tangentStiffness: 0,
    contributions: [],
    extrapolated: false,
  };
}

function evaluateSoilConfiguration({
  groundModel,
  wall,
  scenario,
  stage,
  mesh,
  nodeContributions,
  displacements,
}) {
  const size = displacements.length;
  const internalForce = zeroVector(size);
  const tangentDiagonal = zeroVector(size);
  const nodeResponses = mesh.nodes.map((node) => ({
    nodeId: node.id,
    retained: emptySideResponse(
      "retained",
      displacements[2 * node.index],
    ),
    excavation: emptySideResponse(
      "excavation",
      displacements[2 * node.index],
    ),
  }));

  for (const side of SIDES) {
    const sign = sideSign(side);
    const definition = scenario.soilResponse.sides[side];
    const profile = groundModel.getProfile(definition.profileId);
    const field = resolveField(groundModel, stage, side, definition);
    const contactTop = groundElevation(stage, side);
    for (const node of mesh.nodes) {
      const displacement = displacements[2 * node.index];
      const closureDisplacement = -sign * displacement;
      const evaluated = [];
      for (const contribution of nodeContributions[node.index]) {
        const z = contribution.samplingElevation;
        if (
          z > contactTop + TOLERANCE ||
          z > profile.groundSurfaceElevation + TOLERANCE ||
          z < profile.bottomElevation - TOLERANCE
        ) {
          continue;
        }
        const layer = profile.getLayerAtElevation(z);
        const layerCurve = definition.curvesByLayer[layer.id];
        if (!layerCurve) {
          throw new Error(
            `No ${side}-side wall-soil curve exists for layer ${layer.id}.`,
          );
        }
        const depth = profile.groundSurfaceElevation - z;
        const response = evaluateLayerCurve(
          layerCurve,
          depth,
          closureDisplacement,
        );
        const waterPressure = field == null
          ? 0
          : Math.max(0, field.porePressureAt({
              x: definition.xCoordinate,
              z,
            }));
        const effectiveForceOnWall = sign * response.effectivePressure *
          wall.analysisWidth * contribution.tributaryLength;
        const waterForceOnWall = sign * waterPressure * wall.analysisWidth *
          contribution.tributaryLength;
        const totalForceOnWall = effectiveForceOnWall + waterForceOnWall;
        const tangentStiffness = response.tangentModulus *
          wall.analysisWidth * contribution.tributaryLength;
        evaluated.push({
          ...contribution,
          layerId: layer.id,
          materialId: layer.materialId,
          depthBelowProfileSurface: depth,
          closureDisplacement,
          effectivePressure: response.effectivePressure,
          waterPressure,
          totalPressureMagnitude: response.effectivePressure + waterPressure,
          effectiveForceOnWall,
          waterForceOnWall,
          totalForceOnWall,
          internalResistance: -totalForceOnWall,
          tangentStiffness,
          interpolation: response.interpolation,
          extrapolated: response.extrapolated,
        });
      }
      const sideResponse = nodeResponses[node.index][side];
      sideResponse.contributions = evaluated;
      sideResponse.activeTributaryLength = evaluated.reduce(
        (sum, item) => sum + item.tributaryLength,
        0,
      );
      for (const item of evaluated) {
        sideResponse.effectiveSoilForceOnWall += item.effectiveForceOnWall;
        sideResponse.waterForceOnWall += item.waterForceOnWall;
        sideResponse.totalForceOnWall += item.totalForceOnWall;
        sideResponse.internalResistance += item.internalResistance;
        sideResponse.tangentStiffness += item.tangentStiffness;
      }
      sideResponse.extrapolated = evaluated.some(
        ({ extrapolated }) => extrapolated,
      );
      internalForce[2 * node.index] += sideResponse.internalResistance;
      tangentDiagonal[2 * node.index] += sideResponse.tangentStiffness;
    }
  }
  return { internalForce, tangentDiagonal, nodeResponses };
}

function supportDirection(support) {
  return support.actionDirection === "toward-retained-side" ? -1 : 1;
}

function evaluateSupportConfiguration({
  scenario,
  stage,
  mesh,
  displacements,
  supportReferenceDisplacements,
}) {
  const size = displacements.length;
  const internalForce = zeroVector(size);
  const tangentDiagonal = zeroVector(size);
  const active = new Set(stage.activeSupportIds);
  const responses = [];
  for (const support of scenario.supports) {
    const nodeIndex = findNodeIndexAtElevation(
      mesh,
      support.elevation,
      `Support ${support.id}`,
    );
    if (!active.has(support.id)) {
      responses.push({
        supportId: support.id,
        nodeIndex,
        nodeId: mesh.nodes[nodeIndex].id,
        elevation: support.elevation,
        status: "inactive",
        scalarForce: 0,
        actualForceOnWall: 0,
        tangentStiffness: 0,
        capacity: support.capacity,
        utilizationRatio: 0,
      });
      continue;
    }
    const direction = supportDirection(support);
    const referenceDisplacement = supportReferenceDisplacements.get(
      support.id,
    ) ?? 0;
    const displacement = displacements[2 * nodeIndex];
    const deformation = -direction *
      (displacement - referenceDisplacement);
    const trialScalarForce = support.prestress + support.stiffness * deformation;
    const scalarForce = support.behavior === "unilateral"
      ? Math.max(0, trialScalarForce)
      : trialScalarForce;
    const engaged = support.behavior === "bilateral" || trialScalarForce > 0;
    const actualForceOnWall = direction * scalarForce;
    const resistance = -actualForceOnWall;
    const tangentStiffness = engaged ? support.stiffness : 0;
    internalForce[2 * nodeIndex] += resistance;
    tangentDiagonal[2 * nodeIndex] += tangentStiffness;
    responses.push({
      supportId: support.id,
      nodeIndex,
      nodeId: mesh.nodes[nodeIndex].id,
      elevation: support.elevation,
      status: engaged ? "active" : "slack",
      referenceDisplacement,
      displacement,
      deformation,
      trialScalarForce,
      scalarForce,
      actualForceOnWall,
      internalResistance: resistance,
      tangentStiffness,
      capacity: structuredClone(support.capacity),
      utilizationRatio: support.capacity == null
        ? null
        : Math.abs(scalarForce) / support.capacity.maximumForce,
    });
  }
  return { internalForce, tangentDiagonal, responses };
}

function pressureAtElevation(segment, elevation) {
  const ratio = (segment.topElevation - elevation) /
    (segment.topElevation - segment.bottomElevation);
  return segment.topPressure + ratio *
    (segment.bottomPressure - segment.topPressure);
}

function segmentAtElevation(segments, elevation) {
  return segments.find((segment) =>
    elevation <= segment.topElevation + TOLERANCE &&
    elevation >= segment.bottomElevation - TOLERANCE) ?? null;
}

function consistentLinearLoad(topLoad, bottomLoad, length) {
  return [
    length * (7 * topLoad + 3 * bottomLoad) / 20,
    length ** 2 * (3 * topLoad + 2 * bottomLoad) / 60,
    length * (3 * topLoad + 7 * bottomLoad) / 20,
    -(length ** 2) * (2 * topLoad + 3 * bottomLoad) / 60,
  ];
}

function externalConfiguration({ wall, stage, mesh }) {
  const size = 2 * mesh.nodes.length;
  const vector = zeroVector(size);
  const elementVectors = mesh.elements.map(() => [0, 0, 0, 0]);
  const elementLineLoads = mesh.elements.map(() => ({ top: 0, bottom: 0 }));
  const pressureLoadResults = [];
  for (const load of stage.pressureLoads) {
    const sign = sideSign(load.side);
    let totalForce = 0;
    let momentAboutWallHead = 0;
    for (const element of mesh.elements) {
      const segment = segmentAtElevation(
        load.segments,
        element.midpointElevation,
      );
      if (!segment) continue;
      const topPressure = pressureAtElevation(segment, element.topElevation);
      const bottomPressure = pressureAtElevation(
        segment,
        element.bottomElevation,
      );
      const topLoad = sign * load.scale * topPressure * wall.analysisWidth;
      const bottomLoad = sign * load.scale * bottomPressure *
        wall.analysisWidth;
      const local = consistentLinearLoad(
        topLoad,
        bottomLoad,
        element.length,
      );
      const indices = elementDofIndices(element);
      for (let index = 0; index < 4; index += 1) {
        vector[indices[index]] += local[index];
        elementVectors[element.index][index] += local[index];
      }
      elementLineLoads[element.index].top += topLoad;
      elementLineLoads[element.index].bottom += bottomLoad;
      const elementForce = local[0] + local[2];
      const elementMoment = local[0] *
          mesh.nodes[element.startNodeIndex].depthFromWallHead +
        local[1] +
        local[2] * mesh.nodes[element.endNodeIndex].depthFromWallHead +
        local[3];
      totalForce += elementForce;
      momentAboutWallHead += elementMoment;
    }
    pressureLoadResults.push({
      id: load.id,
      side: load.side,
      category: load.category,
      component: load.component,
      totalForce,
      momentAboutWallHead,
      provenance: structuredClone(load.provenance),
    });
  }
  const nodalActionResults = [];
  for (const action of stage.nodalActions) {
    const nodeIndex = findNodeIndexAtElevation(
      mesh,
      action.elevation,
      `Nodal action ${action.id}`,
    );
    vector[2 * nodeIndex] += action.force;
    vector[2 * nodeIndex + 1] += action.moment;
    nodalActionResults.push({
      ...structuredClone(action),
      nodeIndex,
      nodeId: mesh.nodes[nodeIndex].id,
    });
  }
  return {
    vector,
    elementVectors,
    elementLineLoads,
    pressureLoadResults,
    nodalActionResults,
  };
}

function emptyConfiguration(size, mesh) {
  return {
    soil: {
      internalForce: zeroVector(size),
      tangentDiagonal: zeroVector(size),
      nodeResponses: mesh.nodes.map((node) => ({
        nodeId: node.id,
        retained: emptySideResponse("retained", 0),
        excavation: emptySideResponse("excavation", 0),
      })),
    },
    supports: {
      internalForce: zeroVector(size),
      tangentDiagonal: zeroVector(size),
      responses: [],
    },
    external: {
      vector: zeroVector(size),
      elementVectors: mesh.elements.map(() => [0, 0, 0, 0]),
      elementLineLoads: mesh.elements.map(() => ({ top: 0, bottom: 0 })),
      pressureLoadResults: [],
      nodalActionResults: [],
    },
  };
}

function evaluateConfiguration({
  groundModel,
  wall,
  scenario,
  stage,
  mesh,
  nodeContributions,
  displacements,
  supportReferenceDisplacements,
}) {
  if (stage == null) return emptyConfiguration(displacements.length, mesh);
  return {
    soil: evaluateSoilConfiguration({
      groundModel,
      wall,
      scenario,
      stage,
      mesh,
      nodeContributions,
      displacements,
    }),
    supports: evaluateSupportConfiguration({
      scenario,
      stage,
      mesh,
      displacements,
      supportReferenceDisplacements,
    }),
    external: externalConfiguration({ wall, stage, mesh }),
  };
}

function combineTransition({
  transitionFactor,
  displacements,
  beamStiffness,
  previous,
  current,
}) {
  const previousFactor = 1 - transitionFactor;
  const internalForce = matrixVector(beamStiffness, displacements);
  const tangentStiffness = cloneMatrix(beamStiffness);
  const externalLoad = zeroVector(displacements.length);
  for (let index = 0; index < displacements.length; index += 1) {
    internalForce[index] += previousFactor * (
      previous.soil.internalForce[index] +
      previous.supports.internalForce[index]
    ) + transitionFactor * (
      current.soil.internalForce[index] +
      current.supports.internalForce[index]
    );
    tangentStiffness[index][index] += previousFactor * (
      previous.soil.tangentDiagonal[index] +
      previous.supports.tangentDiagonal[index]
    ) + transitionFactor * (
      current.soil.tangentDiagonal[index] +
      current.supports.tangentDiagonal[index]
    );
    externalLoad[index] = previousFactor * previous.external.vector[index] +
      transitionFactor * current.external.vector[index];
  }
  return { internalForce, tangentStiffness, externalLoad };
}

function residualMetrics({ residual, evaluation, freeIndices, wallLength }) {
  const forceValues = [];
  const momentValues = [];
  for (let index = 0; index < residual.length; index += 1) {
    const collection = index % 2 === 0 ? forceValues : momentValues;
    collection.push(
      residual[index],
      evaluation.externalLoad[index],
      evaluation.internalForce[index],
    );
  }
  const forceScale = Math.max(1, maxAbs(forceValues));
  const momentScale = Math.max(
    1,
    maxAbs(momentValues),
    forceScale * Math.max(1, wallLength),
  );
  const relative = freeIndices.map((index) =>
    Math.abs(residual[index]) /
      (index % 2 === 0 ? forceScale : momentScale));
  return {
    freeResidualInfNorm: maxAbs(freeIndices.map((index) => residual[index])),
    relativeFreeResidualInfNorm: maxAbs(relative),
    forceScale,
    momentScale,
  };
}

function solveTransitionTarget({
  targetFactor,
  initialDisplacements,
  freeIndices,
  wallLength,
  scenario,
  evaluate,
  linearSolver,
}) {
  let displacements = [...initialDisplacements];
  let evaluation = evaluate(displacements, targetFactor);
  let lineSearchReductions = 0;
  let metrics = null;
  if (freeIndices.length === 0) {
    const residual = evaluation.externalLoad.map((value, index) =>
      value - evaluation.internalForce[index]);
    return {
      converged: true,
      displacements,
      evaluation,
      iterations: 0,
      lineSearchReductions,
      metrics: residualMetrics({
        residual,
        evaluation,
        freeIndices,
        wallLength,
      }),
    };
  }

  for (let iteration = 1; iteration <= scenario.solver.maxIterations;
    iteration += 1) {
    const residual = evaluation.externalLoad.map((value, index) =>
      value - evaluation.internalForce[index]);
    metrics = residualMetrics({
      residual,
      evaluation,
      freeIndices,
      wallLength,
    });
    if (metrics.relativeFreeResidualInfNorm <=
      scenario.solver.relativeResidualTolerance) {
      return {
        converged: true,
        displacements,
        evaluation,
        iterations: iteration - 1,
        lineSearchReductions,
        metrics,
      };
    }
    const reducedTangent = freeIndices.map((row) =>
      freeIndices.map((column) => evaluation.tangentStiffness[row][column]));
    const reducedResidual = freeIndices.map((index) => residual[index]);
    let correction;
    try {
      correction = linearSolver.solve(reducedTangent, reducedResidual);
    } catch (error) {
      return {
        converged: false,
        reason: "singular-tangent",
        error: error.message,
        iterations: iteration,
        lineSearchReductions,
        displacements,
        evaluation,
        metrics,
      };
    }
    const correctionEquivalent = maxAbs(correction.map((value, index) =>
      freeIndices[index] % 2 === 0
        ? value
        : value * Math.max(1, wallLength)));
    if (correctionEquivalent <= scenario.solver.displacementTolerance) {
      return {
        converged: false,
        reason: "displacement-stagnation",
        iterations: iteration,
        lineSearchReductions,
        displacements,
        evaluation,
        metrics,
      };
    }

    let accepted = null;
    for (let reduction = 0;
      reduction <= scenario.solver.maxLineSearchReductions;
      reduction += 1) {
      const factor = 0.5 ** reduction;
      const candidate = [...displacements];
      for (let index = 0; index < freeIndices.length; index += 1) {
        candidate[freeIndices[index]] += factor * correction[index];
      }
      const candidateEvaluation = evaluate(candidate, targetFactor);
      const candidateResidual = candidateEvaluation.externalLoad.map(
        (value, index) => value - candidateEvaluation.internalForce[index],
      );
      const candidateMetrics = residualMetrics({
        residual: candidateResidual,
        evaluation: candidateEvaluation,
        freeIndices,
        wallLength,
      });
      if (
        candidateMetrics.relativeFreeResidualInfNorm <
          metrics.relativeFreeResidualInfNorm ||
        candidateMetrics.relativeFreeResidualInfNorm <=
          scenario.solver.relativeResidualTolerance
      ) {
        accepted = {
          displacements: candidate,
          evaluation: candidateEvaluation,
          metrics: candidateMetrics,
        };
        lineSearchReductions += reduction;
        break;
      }
    }
    if (!accepted) {
      return {
        converged: false,
        reason: "line-search-failed",
        iterations: iteration,
        lineSearchReductions,
        displacements,
        evaluation,
        metrics,
      };
    }
    displacements = accepted.displacements;
    evaluation = accepted.evaluation;
    metrics = accepted.metrics;
  }
  return {
    converged: false,
    reason: "max-iterations",
    iterations: scenario.solver.maxIterations,
    lineSearchReductions,
    displacements,
    evaluation,
    metrics,
  };
}

function solveStageTransition({
  groundModel,
  wall,
  scenario,
  previousStage,
  currentStage,
  mesh,
  nodeContributions,
  beamStiffness,
  fixedIndices,
  initialDisplacements,
  supportReferenceDisplacements,
  linearSolver,
}) {
  const fixed = new Set(fixedIndices);
  const freeIndices = Array.from(
    { length: initialDisplacements.length },
    (_, index) => index,
  ).filter((index) => !fixed.has(index));
  const evaluate = (displacements, transitionFactor) => {
    const previous = evaluateConfiguration({
      groundModel,
      wall,
      scenario,
      stage: previousStage,
      mesh,
      nodeContributions,
      displacements,
      supportReferenceDisplacements,
    });
    const current = evaluateConfiguration({
      groundModel,
      wall,
      scenario,
      stage: currentStage,
      mesh,
      nodeContributions,
      displacements,
      supportReferenceDisplacements,
    });
    return {
      ...combineTransition({
        transitionFactor,
        displacements,
        beamStiffness,
        previous,
        current,
      }),
      previous,
      current,
    };
  };
  const baseIncrement = 1 / scenario.solver.incrementsPerStage;
  let increment = baseIncrement;
  let achievedFactor = 0;
  let displacements = [...initialDisplacements];
  let finalEvaluation = evaluate(displacements, 0);
  let cutbacks = 0;
  let totalIterations = 0;
  let totalLineSearchReductions = 0;
  const history = [];
  let failure = null;

  while (achievedFactor < 1 - TOLERANCE) {
    const target = Math.min(1, achievedFactor + increment);
    const solved = solveTransitionTarget({
      targetFactor: target,
      initialDisplacements: displacements,
      freeIndices,
      wallLength: wall.topElevation - wall.toeElevation,
      scenario,
      evaluate,
      linearSolver,
    });
    totalIterations += solved.iterations;
    totalLineSearchReductions += solved.lineSearchReductions;
    if (!solved.converged) {
      if (increment / 2 < scenario.solver.minimumStageIncrement) {
        failure = solved;
        break;
      }
      increment /= 2;
      cutbacks += 1;
      continue;
    }
    achievedFactor = target;
    displacements = solved.displacements;
    finalEvaluation = solved.evaluation;
    history.push({
      transitionFactor: achievedFactor,
      increment,
      iterations: solved.iterations,
      lineSearchReductions: solved.lineSearchReductions,
      relativeResidualInfNorm: solved.metrics.relativeFreeResidualInfNorm,
      maximumAbsoluteDisplacement: maxAbs(
        mesh.nodes.map((node) => displacements[2 * node.index]),
      ),
    });
    if (increment < baseIncrement) {
      increment = Math.min(baseIncrement, 2 * increment);
    }
  }
  return {
    converged: achievedFactor >= 1 - TOLERANCE,
    achievedFactor,
    displacements,
    evaluation: finalEvaluation,
    fixedIndices,
    freeIndices,
    cutbacks,
    totalIterations,
    totalLineSearchReductions,
    history,
    failure: failure == null
      ? null
      : {
          reason: failure.reason,
          error: failure.error ?? null,
          iterations: failure.iterations,
          metrics: failure.metrics,
        },
  };
}

function fixedDofIndices(mesh, wall) {
  const fixed = new Set();
  const head = mesh.nodes[0].index;
  const toe = mesh.nodes.at(-1).index;
  if (wall.headCondition.translation === "fixed") fixed.add(2 * head);
  if (wall.headCondition.rotation === "fixed") fixed.add(2 * head + 1);
  if (wall.toeCondition.translation === "fixed") fixed.add(2 * toe);
  if (wall.toeCondition.rotation === "fixed") fixed.add(2 * toe + 1);
  return [...fixed].sort((left, right) => left - right);
}

function sectionSampleDepths(element, startShear, lineLoad) {
  const length = element.length;
  const gradient = (lineLoad.bottom - lineLoad.top) / length;
  const depths = [0, length];
  if (Math.abs(gradient) <= TOLERANCE) {
    if (Math.abs(lineLoad.top) > TOLERANCE) {
      const shearRoot = -startShear / lineLoad.top;
      if (shearRoot > TOLERANCE && shearRoot < length - TOLERANCE) {
        depths.push(shearRoot);
      }
    }
  } else {
    const discriminant = lineLoad.top ** 2 - 2 * gradient * startShear;
    if (discriminant >= 0) {
      for (const root of [
        (-lineLoad.top - Math.sqrt(discriminant)) / gradient,
        (-lineLoad.top + Math.sqrt(discriminant)) / gradient,
      ]) {
        if (root > TOLERANCE && root < length - TOLERANCE) {
          depths.push(root);
        }
      }
    }
    const loadRoot = -lineLoad.top / gradient;
    if (loadRoot > TOLERANCE && loadRoot < length - TOLERANCE) {
      depths.push(loadRoot);
    }
  }
  return [...new Set(depths)].sort((left, right) => left - right);
}

function elementResponses({
  mesh,
  elementStiffnesses,
  displacements,
  elementExternalLoads,
  elementLineLoads,
}) {
  return mesh.elements.map((element, index) => {
    const indices = elementDofIndices(element);
    const localDisplacements = indices.map((dof) => displacements[dof]);
    const elasticEndForces = matrixVector(
      elementStiffnesses[index],
      localDisplacements,
    );
    const equivalentLoad = elementExternalLoads[index];
    const lineLoad = elementLineLoads[index];
    const endForces = elasticEndForces.map((value, forceIndex) =>
      value - equivalentLoad[forceIndex]);
    const loadGradient = (lineLoad.bottom - lineLoad.top) / element.length;
    const sectionForces = sectionSampleDepths(
      element,
      endForces[0],
      lineLoad,
    ).map((localDepth) => {
      const shearForce = endForces[0] + lineLoad.top * localDepth +
        loadGradient * localDepth ** 2 / 2;
      const bendingMoment = -endForces[1] +
        endForces[0] * localDepth +
        lineLoad.top * localDepth ** 2 / 2 +
        loadGradient * localDepth ** 3 / 6;
      return {
        localDepth,
        depthFromWallHead:
          mesh.nodes[element.startNodeIndex].depthFromWallHead + localDepth,
        elevation:
          mesh.nodes[element.startNodeIndex].elevation - localDepth,
        shearForce,
        bendingMoment,
      };
    });
    return {
      ...element,
      localDisplacements,
      equivalentAssignedPressureLoad: [...equivalentLoad],
      assignedLineLoad: { ...lineLoad },
      endForces: {
        startShear: endForces[0],
        startMoment: endForces[1],
        endShear: endForces[2],
        endMoment: endForces[3],
      },
      sectionForces,
    };
  });
}

function selectAbsoluteExtreme(values, property) {
  return values.reduce((selected, value) =>
    selected == null || Math.abs(value[property]) > Math.abs(selected[property])
      ? value
      : selected, null);
}

function momentOfVectorAboutHead(vector, mesh) {
  return mesh.nodes.reduce((sum, node) =>
    sum + vector[2 * node.index] * node.depthFromWallHead +
      vector[2 * node.index + 1], 0);
}

function translationalSum(vector) {
  return vector.reduce((sum, value, index) =>
    index % 2 === 0 ? sum + value : sum, 0);
}

function buildStageOutput({
  stage,
  stageIndex,
  mesh,
  wall,
  scenario,
  solution,
  beam,
  finalConfiguration,
}) {
  const nodes = mesh.nodes.map((node) => ({
    ...node,
    displacement: solution.displacements[2 * node.index],
    rotation: solution.displacements[2 * node.index + 1],
    soil: finalConfiguration.soil.nodeResponses[node.index],
  }));
  const elements = elementResponses({
    mesh,
    elementStiffnesses: beam.elementStiffnesses,
    displacements: solution.displacements,
    elementExternalLoads: finalConfiguration.external.elementVectors,
    elementLineLoads: finalConfiguration.external.elementLineLoads,
  });
  const sectionForces = elements.flatMap(({ sectionForces: values }) => values);
  const maximumMoment = selectAbsoluteExtreme(
    sectionForces,
    "bendingMoment",
  );
  const maximumShear = selectAbsoluteExtreme(sectionForces, "shearForce");
  const maximumDisplacement = selectAbsoluteExtreme(nodes, "displacement");

  const fullInternalForce = matrixVector(
    beam.stiffness,
    solution.displacements,
  ).map((value, index) => value +
    finalConfiguration.soil.internalForce[index] +
    finalConfiguration.supports.internalForce[index]);
  const residualInternalMinusExternal = fullInternalForce.map(
    (value, index) => value - finalConfiguration.external.vector[index],
  );
  const constraintReactions = solution.fixedIndices.map((dofIndex) => ({
    dofIndex,
    nodeIndex: Math.floor(dofIndex / 2),
    nodeId: mesh.nodes[Math.floor(dofIndex / 2)].id,
    degreeOfFreedom: dofIndex % 2 === 0 ? "translation" : "rotation",
    value: residualInternalMinusExternal[dofIndex],
  }));
  const constraintVector = zeroVector(2 * mesh.nodes.length);
  for (const reaction of constraintReactions) {
    constraintVector[reaction.dofIndex] = reaction.value;
  }
  const actualSoilVector = finalConfiguration.soil.internalForce.map(
    (value) => -value,
  );
  const actualSupportVector = finalConfiguration.supports.internalForce.map(
    (value) => -value,
  );
  const externalVector = finalConfiguration.external.vector;
  const totalExternalForce = translationalSum(externalVector);
  const totalSoilForce = translationalSum(actualSoilVector);
  const totalSupportForce = translationalSum(actualSupportVector);
  const totalConstraintForce = translationalSum(constraintVector);
  const forceResidual = totalExternalForce + totalSoilForce +
    totalSupportForce + totalConstraintForce;
  const externalMoment = momentOfVectorAboutHead(externalVector, mesh);
  const soilMoment = momentOfVectorAboutHead(actualSoilVector, mesh);
  const supportMoment = momentOfVectorAboutHead(actualSupportVector, mesh);
  const constraintMoment = momentOfVectorAboutHead(constraintVector, mesh);
  const momentResidual = externalMoment + soilMoment + supportMoment +
    constraintMoment;
  const forceScale = Math.max(
    1,
    Math.abs(totalExternalForce),
    Math.abs(totalSoilForce),
    Math.abs(totalSupportForce),
  );
  const momentScale = Math.max(
    1,
    Math.abs(externalMoment),
    Math.abs(soilMoment),
    forceScale * (wall.topElevation - wall.toeElevation),
  );
  const supportChecks = finalConfiguration.supports.responses
    .filter(({ status }) => status !== "inactive")
    .map((response) => ({
      id: `support-${response.supportId}-capacity`,
      supportId: response.supportId,
      status: response.capacity == null
        ? "not-analyzed"
        : response.utilizationRatio <= 1 + 1e-10 ? "ok" : "failed",
      demand: Math.abs(response.scalarForce),
      capacity: response.capacity?.maximumForce ?? null,
      utilizationRatio: response.utilizationRatio,
      units: "kN",
    }));
  const extrapolated = nodes.flatMap((node) => SIDES
    .filter((side) => node.soil[side].extrapolated)
    .map((side) => ({ nodeId: node.id, side })));

  return {
    id: stage.id,
    name: stage.name,
    index: stageIndex,
    status: solution.converged ? "ok" : "failed",
    stageDefinition: structuredClone(stage),
    response: {
      converged: solution.converged,
      achievedTransitionFactor: solution.achievedFactor,
      nodes,
      elements,
      supports: finalConfiguration.supports.responses,
      pressureLoads: finalConfiguration.external.pressureLoadResults,
      nodalActions: finalConfiguration.external.nodalActionResults,
      extrema: {
        maximumAbsoluteDisplacement: maximumDisplacement,
        maximumAbsoluteBendingMoment: maximumMoment,
        maximumAbsoluteShearForce: maximumShear,
      },
      extrapolatedCurveLocations: extrapolated,
    },
    equilibrium: {
      totalExternalForce,
      totalSoilForce,
      totalSupportForce,
      totalConstraintForce,
      forceResidual,
      normalizedForceResidual: Math.abs(forceResidual) / forceScale,
      externalMomentAboutWallHead: externalMoment,
      soilMomentAboutWallHead: soilMoment,
      supportMomentAboutWallHead: supportMoment,
      constraintMomentAboutWallHead: constraintMoment,
      momentResidual,
      normalizedMomentResidual: Math.abs(momentResidual) / momentScale,
      maximumFreeDofResidual: maxAbs(solution.freeIndices.map((index) =>
        residualInternalMinusExternal[index])),
      constraintReactions,
    },
    convergence: {
      strategy: scenario.solver.strategy,
      converged: solution.converged,
      achievedTransitionFactor: solution.achievedFactor,
      acceptedIncrements: solution.history.length,
      cutbacks: solution.cutbacks,
      totalIterations: solution.totalIterations,
      totalLineSearchReductions: solution.totalLineSearchReductions,
      history: solution.history,
      failure: solution.failure,
    },
    checks: supportChecks,
    utilizationRatio: supportChecks.reduce((maximum, check) =>
      check.utilizationRatio == null
        ? maximum
        : Math.max(maximum ?? 0, check.utilizationRatio), null),
  };
}

function validateInput({ groundModel, designSituation, wall, scenario }) {
  const isSeismicSituation = designSituation.seismic.model !== "none" ||
    designSituation.situationType === "seismic";
  const isPseudostaticScenario = scenario.loadingCondition === "pseudostatic";
  if (isSeismicSituation !== isPseudostaticScenario) {
    throw new EmbeddedWallNotSupportedError(
      "Design situation and embedded-wall loading condition must both be static or both be pseudostatic.",
    );
  }
  for (const side of SIDES) {
    const definition = scenario.soilResponse.sides[side];
    const profile = groundModel.getProfile(definition.profileId);
    if (profile.bottomElevation >= wall.toeElevation - TOLERANCE) {
      throw new Error(
        `${side}-side GroundProfile must extend below the wall toe.`,
      );
    }
    for (const [layerId, curve] of Object.entries(definition.curvesByLayer)) {
      const layer = profile.layers.find(({ id }) => id === layerId);
      if (!layer) {
        throw new Error(`${side}-side curves reference unknown layer ${layerId}.`);
      }
      const topDepth = profile.groundSurfaceElevation - layer.topElevation;
      const bottomDepth = profile.groundSurfaceElevation -
        layer.bottomElevation;
      for (const station of curve.stations) {
        if (station.depth < topDepth - TOLERANCE ||
          station.depth > bottomDepth + TOLERANCE) {
          throw new Error(
            `${side}-side station depth ${station.depth} lies outside layer ${layerId}.`,
          );
        }
      }
    }
    if (definition.defaultPorePressureFieldId != null) {
      groundModel.getPorePressureField(
        definition.defaultPorePressureFieldId,
      );
    }
    for (const stage of scenario.stages) {
      const stageElevation = groundElevation(stage, side);
      if (stageElevation > profile.groundSurfaceElevation + TOLERANCE ||
        stageElevation < profile.bottomElevation - TOLERANCE) {
        throw new Error(
          `${side}-side ground elevation in stage ${stage.id} lies outside profile ${profile.id}.`,
        );
      }
      if (Object.hasOwn(stage.porePressureFieldIdBySide, side) &&
        stage.porePressureFieldIdBySide[side] != null) {
        groundModel.getPorePressureField(
          stage.porePressureFieldIdBySide[side],
        );
      }
    }
  }
  for (const support of scenario.supports) {
    if (support.elevation > wall.topElevation + TOLERANCE ||
      support.elevation < wall.toeElevation - TOLERANCE) {
      throw new Error(`Support ${support.id} lies outside the wall.`);
    }
  }
  for (const stage of scenario.stages) {
    for (const action of stage.nodalActions) {
      if (action.elevation > wall.topElevation + TOLERANCE ||
        action.elevation < wall.toeElevation - TOLERANCE) {
        throw new Error(`Nodal action ${action.id} lies outside the wall.`);
      }
    }
  }
}

function activateNewSupports({
  previousStage,
  currentStage,
  scenario,
  mesh,
  displacements,
  references,
}) {
  const previouslyActive = new Set(previousStage?.activeSupportIds ?? []);
  const currentlyActive = new Set(currentStage.activeSupportIds);
  for (const support of scenario.supports) {
    if (currentlyActive.has(support.id) && !previouslyActive.has(support.id)) {
      const nodeIndex = findNodeIndexAtElevation(
        mesh,
        support.elevation,
        `Support ${support.id}`,
      );
      references.set(support.id, displacements[2 * nodeIndex]);
    }
  }
}

function buildOutputs({
  groundModel,
  designSituation,
  wall,
  scenario,
  mesh,
  stageOutputs,
}) {
  const finalStage = stageOutputs.at(-1);
  const allMoments = stageOutputs.map((stage) => ({
    stageId: stage.id,
    ...stage.response.extrema.maximumAbsoluteBendingMoment,
  }));
  const allShears = stageOutputs.map((stage) => ({
    stageId: stage.id,
    ...stage.response.extrema.maximumAbsoluteShearForce,
  }));
  const allDisplacements = stageOutputs.map((stage) => ({
    stageId: stage.id,
    ...stage.response.extrema.maximumAbsoluteDisplacement,
  }));
  const maximumMoment = selectAbsoluteExtreme(allMoments, "bendingMoment");
  const maximumShear = selectAbsoluteExtreme(allShears, "shearForce");
  const maximumDisplacement = selectAbsoluteExtreme(
    allDisplacements,
    "displacement",
  );
  const checks = stageOutputs.flatMap((stage) => stage.checks.map((check) => ({
    ...check,
    stageId: stage.id,
  })));
  const utilizationRatio = checks.reduce((maximum, check) =>
    check.utilizationRatio == null
      ? maximum
      : Math.max(maximum ?? 0, check.utilizationRatio), null);
  return {
    schemaVersion: EMBEDDED_RETAINING_WALL_RESULT_SCHEMA_VERSION,
    groundModelId: groundModel.id,
    designSituationId: designSituation.id,
    wall: wall.toJSON(),
    scenario: scenario.toJSON(),
    mesh: {
      model: scenario.discretization.model,
      nodeCount: mesh.nodes.length,
      elementCount: mesh.elements.length,
      maxElementLength: scenario.discretization.maxElementLength,
      nodes: mesh.nodes.map((node) => ({ ...node })),
      elements: mesh.elements.map((element) => ({ ...element })),
    },
    stages: stageOutputs,
    finalStage,
    demand: {
      maximumAbsoluteDisplacement: maximumDisplacement,
      maximumAbsoluteBendingMoment: maximumMoment,
      maximumAbsoluteShearForce: maximumShear,
      supportForces: stageOutputs.flatMap((stage) =>
        stage.response.supports
          .filter(({ status }) => status !== "inactive")
          .map((support) => ({
            stageId: stage.id,
            supportId: support.supportId,
            force: support.scalarForce,
          }))),
    },
    capacity: {
      wallStructuralResistance: null,
      supportCapacities: scenario.supports.map((support) => ({
        supportId: support.id,
        capacity: structuredClone(support.capacity),
      })),
    },
    checks,
    utilizationRatio,
    structuralCoupling: {
      level: "staged-reduced-order-soil-structure-interaction",
      responseMode: {
        status: stageOutputs.every(({ status }) => status === "ok")
          ? "available"
          : "failed",
        wallId: wall.id,
        analysisWidth: wall.analysisWidth,
        stages: stageOutputs.map((stage) => ({
          stageId: stage.id,
          nodalState: stage.response.nodes.map((node) => ({
            nodeId: node.id,
            elevation: node.elevation,
            displacement: node.displacement,
            rotation: node.rotation,
            retainedSoilForceOnWall: node.soil.retained.totalForceOnWall,
            excavationSoilForceOnWall:
              node.soil.excavation.totalForceOnWall,
            retainedTangentStiffness:
              node.soil.retained.tangentStiffness,
            excavationTangentStiffness:
              node.soil.excavation.tangentStiffness,
          })),
          supportState: stage.response.supports,
        })),
      },
      actionEffects: {
        maximumBendingMoment: maximumMoment,
        maximumShearForce: maximumShear,
      },
      structuralVerification: {
        status: "not-analyzed",
        reason:
          "Wall and support resistances require material-specific structural verifiers consuming these action effects.",
      },
      continuumBridge: {
        status: "reduced-order-model",
        wallElements: "Euler-Bernoulli-beam-strip",
        soilInterfaces:
          "independent-memoryless-effective-pressure-displacement-springs",
        constructionStages: "deterministic-sequence",
      },
    },
  };
}

export class EmbeddedRetainingWallAnalysis {
  constructor({ linearSolver = new DenseLinearSolver() } = {}) {
    this.linearSolver = linearSolver;
  }

  analyze({
    groundModel: groundModelInput,
    designSituation: designSituationInput,
    wall: wallInput,
    scenario: scenarioInput,
    units = null,
  } = {}) {
    try {
      assertExplicitUnitSystem(units, "EmbeddedRetainingWallAnalysis");
      const groundModel = normalizeGroundModel(groundModelInput, units);
      const designSituation = normalizeDesignSituation(
        designSituationInput,
        groundModel,
        units,
      );
      designSituation.validateAgainst(groundModel);
      const wall = normalizeWall(wallInput, units);
      const scenario = normalizeScenario(scenarioInput, units);
      validateInput({ groundModel, designSituation, wall, scenario });
      const mesh = buildMesh({ groundModel, wall, scenario });
      const beam = assembleBeam(mesh);
      const nodeContributions = buildNodeContributions(mesh);
      const fixedIndices = fixedDofIndices(mesh, wall);
      let displacements = zeroVector(2 * mesh.nodes.length);
      let previousStage = null;
      const supportReferenceDisplacements = new Map();
      const stageOutputs = [];
      for (let index = 0; index < scenario.stages.length; index += 1) {
        const currentStage = scenario.stages[index];
        activateNewSupports({
          previousStage,
          currentStage,
          scenario,
          mesh,
          displacements,
          references: supportReferenceDisplacements,
        });
        const solution = solveStageTransition({
          groundModel,
          wall,
          scenario,
          previousStage,
          currentStage,
          mesh,
          nodeContributions,
          beamStiffness: beam.stiffness,
          fixedIndices,
          initialDisplacements: displacements,
          supportReferenceDisplacements,
          linearSolver: this.linearSolver,
        });
        const finalConfiguration = evaluateConfiguration({
          groundModel,
          wall,
          scenario,
          stage: currentStage,
          mesh,
          nodeContributions,
          displacements: solution.displacements,
          supportReferenceDisplacements,
        });
        stageOutputs.push(buildStageOutput({
          stage: currentStage,
          stageIndex: index,
          mesh,
          wall,
          scenario,
          solution,
          beam,
          finalConfiguration,
        }));
        displacements = solution.displacements;
        if (!solution.converged) break;
        previousStage = currentStage;
      }
      const outputs = buildOutputs({
        groundModel,
        designSituation,
        wall,
        scenario,
        mesh,
        stageOutputs,
      });
      const converged = stageOutputs.length === scenario.stages.length &&
        stageOutputs.every(({ status }) => status === "ok");
      const failedCheck = outputs.checks.some(({ status }) =>
        status === "failed");
      const status = !converged
        ? "failed"
        : failedCheck ? "not-verified" : "ok";
      const extrapolationCount = stageOutputs.reduce((sum, stage) =>
        sum + stage.response.extrapolatedCurveLocations.length, 0);
      return result({
        status,
        summary: !converged
          ? "Embedded retaining-wall analysis stopped before the final construction stage."
          : failedCheck
            ? "Embedded retaining-wall response completed, but an assigned support capacity was exceeded."
            : "Staged embedded retaining-wall analysis completed.",
        outputs,
        warnings: [
          ...(extrapolationCount > 0 ? [
            "One or more wall-soil laws were evaluated outside their assigned displacement range; inspect each stage extrapolatedCurveLocations.",
          ] : []),
          "Assigned pressure-displacement curves are project inputs; parameter selection, calibration and sensitivity remain the designer's responsibility.",
          "The analysis does not perform an automatic mesh-convergence study.",
          "Ground-anchor design is available through geotechnical-ground-anchors; wall/waler structural resistance and global stability remain separate consuming workflows.",
          "Basal heave, piping and hydraulic uplift are outside the selected embedded-wall application scope and are not analyzed.",
          ...(scenario.loadingCondition === "pseudostatic" ? [
            "Pseudostatic pressure diagrams are assigned loads; wall inertia and dynamic or cyclic soil response are not generated automatically.",
          ] : []),
        ],
        assumptions: [
          "The wall is vertical and represented by an Euler-Bernoulli beam strip with assigned piecewise-constant EI.",
          "Each side is represented by independent effective-pressure versus closure springs lumped by tributary element length.",
          "Pore pressure is evaluated independently from the selected PorePressureField2D and added to effective soil pressure.",
          "Stages interpolate deterministically between complete preceding and current configurations.",
          "New supports are installed at the displacement reached before their activation; assigned prestress is then applied during the stage transition.",
          "Soil reaction laws are memoryless envelopes without hysteresis, stress history or permanent deformation.",
        ],
        metadata: {
          references: [...EMBEDDED_RETAINING_WALL_REFERENCES],
          sourceUrls: [...SOURCE_URLS],
          designSituation: designSituation.toJSON(),
          units: {
            force: "kN",
            length: "m",
            pressure: "kN/m2",
            moment: "kN.m",
            flexuralRigidity: "kN.m2",
            supportStiffness: "kN/m",
            wallSoilTangentModulus: "kN/m3",
          },
        },
      });
    } catch (error) {
      const notSupported = error instanceof EmbeddedWallNotSupportedError;
      return result({
        status: notSupported ? "not-supported" : "failed",
        summary: notSupported
          ? error.message
          : "Embedded retaining-wall analysis failed.",
        warnings: notSupported ? [] : [error.message],
        metadata: { errorName: error.name },
      });
    }
  }
}
