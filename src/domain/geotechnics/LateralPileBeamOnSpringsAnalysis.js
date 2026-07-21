import { DenseLinearSolver } from "../math/DenseLinearSolver.js";
import { assertExplicitUnitSystem } from "../units/UnitSystem.js";
import { DeepFoundationModel } from "./DeepFoundationModel.js";
import { GeotechnicalDesignSituation } from
  "./GeotechnicalDesignSituation.js";
import { GroundModel } from "./GroundModel.js";
import { LateralPileResponseScenario } from
  "./LateralPileResponseScenario.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const LATERAL_PILE_PY_RESULT_SCHEMA_VERSION =
  "lateral-pile-py-result/v1";

export const LATERAL_PILE_PY_REFERENCE =
  "FHWA GEC 9, FHWA-HIF-18-031 (2018), sections 6.3 and 6.3.1, equations 6-1 through 6-5";

const TOLERANCE = 1e-10;

class LateralPileResponseNotSupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = "LateralPileResponseNotSupportedError";
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

function normalizePile(value, units) {
  return value instanceof DeepFoundationModel
    ? value
    : new DeepFoundationModel({ ...value, units: value?.units ?? units });
}

function normalizeScenario(value, units) {
  return value instanceof LateralPileResponseScenario
    ? value
    : new LateralPileResponseScenario({
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

function buildMesh({ profile, pile, maxElementLength }) {
  const headElevation = pile.placement.headElevation;
  const soilTop = pile.placement.soilContactTopElevation;
  const toeElevation = pile.placement.toeElevation;
  const boundaries = [];
  addUnique(boundaries, headElevation);
  addUnique(boundaries, soilTop);
  addUnique(boundaries, toeElevation);

  for (const layer of profile.layers) {
    for (const elevation of [layer.topElevation, layer.bottomElevation]) {
      if (
        elevation < soilTop - TOLERANCE &&
        elevation > toeElevation + TOLERANCE
      ) {
        addUnique(boundaries, elevation);
      }
    }
  }
  boundaries.sort((left, right) => right - left);

  const elevations = [];
  for (let interval = 0; interval < boundaries.length - 1; interval += 1) {
    const top = boundaries[interval];
    const bottom = boundaries[interval + 1];
    const length = top - bottom;
    const count = Math.max(1, Math.ceil(length / maxElementLength));
    if (interval === 0) elevations.push(top);
    for (let index = 1; index <= count; index += 1) {
      elevations.push(top - length * index / count);
    }
  }

  const nodes = elevations.map((elevation, index) => ({
    id: `py-node-${index + 1}`,
    index,
    elevation,
    depthFromPileHead: headElevation - elevation,
    depthBelowGround: profile.groundSurfaceElevation - elevation,
    inSoil: elevation <= soilTop + TOLERANCE,
    isPileHead: index === 0,
    isGroundline: Math.abs(elevation - soilTop) <= TOLERANCE,
    isPileToe: index === elevations.length - 1,
  }));
  const elements = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const start = nodes[index];
    const end = nodes[index + 1];
    const midpointElevation = (start.elevation + end.elevation) / 2;
    const inSoil = midpointElevation <= soilTop + TOLERANCE;
    const layer = inSoil
      ? profile.getLayerAtElevation(midpointElevation)
      : null;
    elements.push({
      id: `py-element-${index + 1}`,
      index,
      startNodeIndex: start.index,
      endNodeIndex: end.index,
      length: start.elevation - end.elevation,
      midpointElevation,
      midpointDepthBelowGround:
        profile.groundSurfaceElevation - midpointElevation,
      inSoil,
      layerId: layer?.id ?? null,
      materialId: layer?.materialId ?? null,
    });
  }
  return { nodes, elements };
}

function beamElementStiffness(flexuralRigidity, length) {
  const factor = flexuralRigidity / length ** 3;
  const l = length;
  return [
    [12 * factor, 6 * l * factor, -12 * factor, 6 * l * factor],
    [6 * l * factor, 4 * l ** 2 * factor, -6 * l * factor, 2 * l ** 2 * factor],
    [-12 * factor, -6 * l * factor, 12 * factor, -6 * l * factor],
    [6 * l * factor, 2 * l ** 2 * factor, -6 * l * factor, 4 * l ** 2 * factor],
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

function assembleBeamStiffness(mesh, flexuralRigidity) {
  const size = 2 * mesh.nodes.length;
  const stiffness = zeroMatrix(size);
  const elementStiffnesses = [];
  for (const element of mesh.elements) {
    const local = beamElementStiffness(flexuralRigidity, element.length);
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

function springContributions(mesh) {
  const contributions = mesh.nodes.map(() => []);
  for (const element of mesh.elements) {
    if (!element.inSoil) continue;
    const item = {
      elementId: element.id,
      layerId: element.layerId,
      materialId: element.materialId,
      samplingDepth: element.midpointDepthBelowGround,
      tributaryLength: element.length / 2,
    };
    contributions[element.startNodeIndex].push({ ...item });
    contributions[element.endNodeIndex].push({ ...item });
  }
  return contributions;
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

function evaluateLayerLaw(layerCurve, depth, displacement) {
  const { left, right, ratio } = bracketStations(
    layerCurve.stations,
    depth,
  );
  const leftResponse = left.law.evaluate(displacement);
  const rightResponse = right === left
    ? leftResponse
    : right.law.evaluate(displacement);
  const interpolate = (leftValue, rightValue) =>
    (leftValue + ratio * (rightValue - leftValue)) *
      layerCurve.reactionMultiplier;
  const mobilizedResistancePerLength = interpolate(
    leftResponse.mobilizedResistancePerLength,
    rightResponse.mobilizedResistancePerLength,
  );
  return {
    mobilizedResistancePerLength,
    soilReactionOnPilePerLength: -mobilizedResistancePerLength,
    tangentModulus: interpolate(
      leftResponse.tangentModulus,
      rightResponse.tangentModulus,
    ),
    secantModulus: interpolate(
      leftResponse.secantModulus,
      rightResponse.secantModulus,
    ),
    interpolation: {
      leftStationDepth: left.depth,
      rightStationDepth: right.depth,
      ratio,
      leftLawId: left.law.id,
      rightLawId: right.law.id,
    },
    extrapolated:
      leftResponse.extrapolated || rightResponse.extrapolated,
  };
}

function evaluateSystem({
  displacements,
  beamStiffness,
  nodeContributions,
  curvesByLayer,
}) {
  const tangentStiffness = beamStiffness.map((row) => [...row]);
  const internalForce = matrixVector(beamStiffness, displacements);
  const springResponses = nodeContributions.map((contributions, nodeIndex) => {
    const displacement = displacements[2 * nodeIndex];
    const evaluated = contributions.map((contribution) => {
      const layerCurve = curvesByLayer[contribution.layerId];
      const response = evaluateLayerLaw(
        layerCurve,
        contribution.samplingDepth,
        displacement,
      );
      return {
        ...contribution,
        ...response,
        lumpedMobilizedResistance:
          response.mobilizedResistancePerLength *
          contribution.tributaryLength,
        lumpedSoilReactionOnPile:
          response.soilReactionOnPilePerLength *
          contribution.tributaryLength,
        lumpedTangentStiffness:
          response.tangentModulus * contribution.tributaryLength,
      };
    });
    const mobilizedResistance = evaluated.reduce(
      (sum, response) => sum + response.lumpedMobilizedResistance,
      0,
    );
    const tangentStiffnessValue = evaluated.reduce(
      (sum, response) => sum + response.lumpedTangentStiffness,
      0,
    );
    internalForce[2 * nodeIndex] += mobilizedResistance;
    tangentStiffness[2 * nodeIndex][2 * nodeIndex] +=
      tangentStiffnessValue;
    return {
      displacement,
      tributaryLength: contributions.reduce(
        (sum, contribution) => sum + contribution.tributaryLength,
        0,
      ),
      mobilizedResistance,
      soilReactionOnPile: -mobilizedResistance,
      tangentStiffness: tangentStiffnessValue,
      secantStiffness: Math.abs(displacement) > 0
        ? mobilizedResistance / displacement
        : tangentStiffnessValue,
      contributions: evaluated,
      extrapolated: evaluated.some((response) => response.extrapolated),
    };
  });
  return {
    internalForce,
    tangentStiffness,
    springResponses,
  };
}

function fixedDofIndices(mesh, scenario) {
  const fixed = new Set();
  const head = mesh.nodes[0].index;
  const toe = mesh.nodes.at(-1).index;
  if (scenario.headCondition.translation === "fixed") fixed.add(2 * head);
  if (scenario.headCondition.rotation === "fixed") fixed.add(2 * head + 1);
  if (scenario.tipCondition.translation === "fixed") fixed.add(2 * toe);
  if (scenario.tipCondition.rotation === "fixed") fixed.add(2 * toe + 1);
  return [...fixed].sort((left, right) => left - right);
}

function externalLoadVector(mesh, scenario) {
  const vector = zeroVector(2 * mesh.nodes.length);
  const node = scenario.action.referencePoint === "pile-head"
    ? mesh.nodes[0]
    : mesh.nodes.find(({ isGroundline }) => isGroundline);
  if (!node) {
    throw new Error("The p-y mesh contains no action reference node.");
  }
  vector[2 * node.index] = scenario.action.lateralShear;
  vector[2 * node.index + 1] = scenario.action.overturningMoment;
  return { vector, nodeIndex: node.index };
}

function residualMetrics({
  residual,
  freeIndices,
  scenario,
  pileLength,
}) {
  const forceScale = Math.max(
    1,
    Math.abs(scenario.action.lateralShear),
    Math.abs(scenario.action.overturningMoment) / Math.max(pileLength, 1),
  );
  const momentScale = Math.max(
    1,
    Math.abs(scenario.action.overturningMoment),
    Math.abs(scenario.action.lateralShear) * Math.max(pileLength, 1),
  );
  const relativeValues = freeIndices.map((index) =>
    Math.abs(residual[index]) / (index % 2 === 0 ? forceScale : momentScale));
  return {
    freeResidualInfNorm: maxAbs(freeIndices.map((index) => residual[index])),
    relativeFreeResidualInfNorm: maxAbs(relativeValues),
    forceScale,
    momentScale,
  };
}

function solveLoadTarget({
  targetLoadFactor,
  initialDisplacements,
  externalLoad,
  freeIndices,
  scenario,
  pileLength,
  evaluate,
  linearSolver,
}) {
  let displacements = [...initialDisplacements];
  let lineSearchReductions = 0;
  let lastEvaluation = evaluate(displacements);
  let lastMetrics = null;

  if (freeIndices.length === 0) {
    return {
      converged: true,
      displacements,
      evaluation: lastEvaluation,
      iterations: 0,
      lineSearchReductions,
      metrics: residualMetrics({
        residual: externalLoad.map((value, index) =>
          targetLoadFactor * value - lastEvaluation.internalForce[index]),
        freeIndices,
        scenario,
        pileLength,
      }),
    };
  }

  for (
    let iteration = 1;
    iteration <= scenario.solver.maxIterations;
    iteration += 1
  ) {
    const residual = externalLoad.map((value, index) =>
      targetLoadFactor * value - lastEvaluation.internalForce[index]);
    lastMetrics = residualMetrics({
      residual,
      freeIndices,
      scenario,
      pileLength,
    });
    if (
      lastMetrics.relativeFreeResidualInfNorm <=
        scenario.solver.relativeResidualTolerance
    ) {
      return {
        converged: true,
        displacements,
        evaluation: lastEvaluation,
        iterations: iteration - 1,
        lineSearchReductions,
        metrics: lastMetrics,
      };
    }

    const reducedTangent = freeIndices.map((row) =>
      freeIndices.map((column) =>
        lastEvaluation.tangentStiffness[row][column]));
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
        evaluation: lastEvaluation,
        metrics: lastMetrics,
      };
    }
    const correctionEquivalent = maxAbs(
      correction.map((value, index) =>
        freeIndices[index] % 2 === 0
          ? value
          : value * Math.max(pileLength, 1)),
    );
    if (correctionEquivalent <= scenario.solver.displacementTolerance) {
      return {
        converged: false,
        reason: "displacement-stagnation",
        iterations: iteration,
        lineSearchReductions,
        displacements,
        evaluation: lastEvaluation,
        metrics: lastMetrics,
      };
    }

    let accepted = null;
    for (
      let reduction = 0;
      reduction <= scenario.solver.maxLineSearchReductions;
      reduction += 1
    ) {
      const factor = 0.5 ** reduction;
      const candidate = [...displacements];
      for (let index = 0; index < freeIndices.length; index += 1) {
        candidate[freeIndices[index]] += factor * correction[index];
      }
      const evaluation = evaluate(candidate);
      const candidateResidual = externalLoad.map((value, index) =>
        targetLoadFactor * value - evaluation.internalForce[index]);
      const metrics = residualMetrics({
        residual: candidateResidual,
        freeIndices,
        scenario,
        pileLength,
      });
      if (
        metrics.relativeFreeResidualInfNorm <
          lastMetrics.relativeFreeResidualInfNorm ||
        metrics.relativeFreeResidualInfNorm <=
          scenario.solver.relativeResidualTolerance
      ) {
        accepted = { candidate, evaluation, metrics, factor };
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
        evaluation: lastEvaluation,
        metrics: lastMetrics,
      };
    }
    displacements = accepted.candidate;
    lastEvaluation = accepted.evaluation;
    lastMetrics = accepted.metrics;
  }

  return {
    converged: false,
    reason: "max-iterations",
    iterations: scenario.solver.maxIterations,
    lineSearchReductions,
    displacements,
    evaluation: lastEvaluation,
    metrics: lastMetrics,
  };
}

function solveIncrementally({
  mesh,
  scenario,
  beamStiffness,
  nodeContributions,
  externalLoad,
  fixedIndices,
  linearSolver,
}) {
  const size = 2 * mesh.nodes.length;
  const fixed = new Set(fixedIndices);
  const freeIndices = Array.from({ length: size }, (_, index) => index)
    .filter((index) => !fixed.has(index));
  const evaluate = (displacements) => evaluateSystem({
    displacements,
    beamStiffness,
    nodeContributions,
    curvesByLayer: scenario.soilResponse.curvesByLayer,
  });
  const baseIncrement = 1 / scenario.solver.loadSteps;
  let increment = baseIncrement;
  let loadFactor = 0;
  let displacements = zeroVector(size);
  let finalEvaluation = evaluate(displacements);
  let cutbacks = 0;
  let totalIterations = 0;
  let totalLineSearchReductions = 0;
  const history = [];
  let failure = null;

  while (loadFactor < 1 - TOLERANCE) {
    const target = Math.min(1, loadFactor + increment);
    const step = solveLoadTarget({
      targetLoadFactor: target,
      initialDisplacements: displacements,
      externalLoad,
      freeIndices,
      scenario,
      pileLength: mesh.nodes.at(-1).depthFromPileHead,
      evaluate,
      linearSolver,
    });
    totalIterations += step.iterations;
    totalLineSearchReductions += step.lineSearchReductions;
    if (!step.converged) {
      if (increment / 2 < scenario.solver.minimumLoadIncrement) {
        failure = step;
        break;
      }
      increment /= 2;
      cutbacks += 1;
      continue;
    }
    loadFactor = target;
    displacements = step.displacements;
    finalEvaluation = step.evaluation;
    history.push({
      loadFactor,
      increment,
      iterations: step.iterations,
      lineSearchReductions: step.lineSearchReductions,
      relativeResidualInfNorm: step.metrics.relativeFreeResidualInfNorm,
      headDisplacement: displacements[0],
      headRotation: displacements[1],
    });
    if (increment < baseIncrement) {
      increment = Math.min(baseIncrement, 2 * increment);
    }
  }

  return {
    converged: loadFactor >= 1 - TOLERANCE,
    achievedLoadFactor: loadFactor,
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

function validateLayerCurves({ profile, pile, scenario, mesh }) {
  const usedLayerIds = new Set(
    mesh.elements.filter(({ inSoil }) => inSoil).map(({ layerId }) => layerId),
  );
  for (const layerId of usedLayerIds) {
    if (!scenario.soilResponse.curvesByLayer[layerId]) {
      throw new Error(`No assigned p-y curve exists for soil layer ${layerId}.`);
    }
  }
  const groundSurface = profile.groundSurfaceElevation;
  for (const [layerId, layerCurve] of Object.entries(
    scenario.soilResponse.curvesByLayer,
  )) {
    const layer = profile.layers.find(({ id }) => id === layerId);
    if (!layer) {
      throw new Error(`Assigned p-y curves reference unknown layer ${layerId}.`);
    }
    const topDepth = groundSurface - layer.topElevation;
    const bottomDepth = groundSurface - layer.bottomElevation;
    for (const station of layerCurve.stations) {
      if (
        station.depth < topDepth - TOLERANCE ||
        station.depth > bottomDepth + TOLERANCE
      ) {
        throw new Error(
          `P-y station depth ${station.depth} lies outside layer ${layerId}.`,
        );
      }
    }
  }
  if (
    pile.placement.soilContactTopElevation > profile.groundSurfaceElevation +
      TOLERANCE
  ) {
    throw new Error("Pile soil contact cannot begin above ground surface.");
  }
}

function elementResponses({
  mesh,
  elementStiffnesses,
  displacements,
  flexuralRigidity,
}) {
  return mesh.elements.map((element, index) => {
    const indices = elementDofIndices(element);
    const localDisplacements = indices.map((dof) => displacements[dof]);
    const endForces = matrixVector(
      elementStiffnesses[index],
      localDisplacements,
    );
    const sectionForces = [0, element.length].map((localDepth) => ({
      localDepth,
      depthFromPileHead:
        mesh.nodes[element.startNodeIndex].depthFromPileHead + localDepth,
      elevation:
        mesh.nodes[element.startNodeIndex].elevation - localDepth,
      shearForce: endForces[0],
      bendingMoment: -endForces[1] + endForces[0] * localDepth,
    }));
    return {
      ...element,
      flexuralRigidity,
      localDisplacements,
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
  return values.reduce(
    (selected, value) =>
      selected == null || Math.abs(value[property]) > Math.abs(selected[property])
        ? value
        : selected,
    null,
  );
}

function buildOutputs({
  groundModel,
  designSituation,
  profile,
  pile,
  scenario,
  mesh,
  solution,
  externalLoad,
  actionNodeIndex,
  elementStiffnesses,
}) {
  const elements = elementResponses({
    mesh,
    elementStiffnesses,
    displacements: solution.displacements,
    flexuralRigidity: scenario.flexuralRigidity.value,
  });
  const sectionForces = elements.flatMap(({ sectionForces: samples }) =>
    samples);
  const maximumMoment = selectAbsoluteExtreme(sectionForces, "bendingMoment");
  const maximumShear = selectAbsoluteExtreme(sectionForces, "shearForce");
  const nodes = mesh.nodes.map((node) => ({
    ...node,
    displacement: solution.displacements[2 * node.index],
    rotation: solution.displacements[2 * node.index + 1],
    spring: solution.evaluation.springResponses[node.index],
  }));
  const appliedAtAchievedFactor = externalLoad.map((value) =>
    solution.achievedLoadFactor * value);
  const algebraicResidual = appliedAtAchievedFactor.map((value, index) =>
    value - solution.evaluation.internalForce[index]);
  const supportReactions = solution.fixedIndices.map((dofIndex) => ({
    dofIndex,
    nodeIndex: Math.floor(dofIndex / 2),
    nodeId: mesh.nodes[Math.floor(dofIndex / 2)].id,
    degreeOfFreedom: dofIndex % 2 === 0 ? "translation" : "rotation",
    value:
      solution.evaluation.internalForce[dofIndex] -
      appliedAtAchievedFactor[dofIndex],
  }));
  const totalSoilReaction = nodes.reduce(
    (sum, node) => sum + node.spring.soilReactionOnPile,
    0,
  );
  const totalTranslationSupportReaction = supportReactions
    .filter(({ degreeOfFreedom }) => degreeOfFreedom === "translation")
    .reduce((sum, reaction) => sum + reaction.value, 0);
  const appliedShear = appliedAtAchievedFactor[2 * actionNodeIndex];
  const appliedNodalMoment =
    appliedAtAchievedFactor[2 * actionNodeIndex + 1];
  const forceEquilibriumResidual =
    appliedShear + totalSoilReaction + totalTranslationSupportReaction;
  const forceScale = Math.max(1, Math.abs(appliedShear));
  const actionNode = nodes[actionNodeIndex];
  const appliedMomentAboutPileHead =
    appliedNodalMoment + appliedShear * actionNode.depthFromPileHead;
  const soilReactionMomentAboutPileHead = nodes.reduce(
    (sum, node) =>
      sum + node.spring.soilReactionOnPile * node.depthFromPileHead,
    0,
  );
  const supportReactionMomentAboutPileHead = supportReactions.reduce(
    (sum, reaction) =>
      sum + (reaction.degreeOfFreedom === "translation"
        ? reaction.value * nodes[reaction.nodeIndex].depthFromPileHead
        : reaction.value),
    0,
  );
  const momentEquilibriumResidual =
    appliedMomentAboutPileHead +
    soilReactionMomentAboutPileHead +
    supportReactionMomentAboutPileHead;
  const momentScale = Math.max(
    1,
    Math.abs(appliedMomentAboutPileHead),
    Math.abs(appliedShear) * mesh.nodes.at(-1).depthFromPileHead,
  );
  const extrapolatedNodes = nodes
    .filter(({ spring }) => spring.extrapolated)
    .map(({ id }) => id);

  return {
    schemaVersion: LATERAL_PILE_PY_RESULT_SCHEMA_VERSION,
    groundModelId: groundModel.id,
    designSituationId: designSituation.id,
    profileId: profile.id,
    pile: pile.toJSON(),
    scenario: scenario.toJSON(),
    mesh: {
      model: scenario.discretization.model,
      nodeCount: mesh.nodes.length,
      elementCount: mesh.elements.length,
      maxElementLength: scenario.discretization.maxElementLength,
      nodes: mesh.nodes.map((node) => ({ ...node })),
      elements: mesh.elements.map((element) => ({ ...element })),
    },
    response: {
      achievedLoadFactor: solution.achievedLoadFactor,
      converged: solution.converged,
      actionPoint: {
        nodeId: actionNode.id,
        nodeIndex: actionNode.index,
        elevation: actionNode.elevation,
        displacement: actionNode.displacement,
        rotation: actionNode.rotation,
      },
      pileHead: {
        nodeId: nodes[0].id,
        displacement: nodes[0].displacement,
        rotation: nodes[0].rotation,
      },
      nodes,
      elements,
      extrema: {
        maximumAbsoluteBendingMoment: maximumMoment,
        maximumAbsoluteShearForce: maximumShear,
        maximumAbsoluteDisplacement: selectAbsoluteExtreme(
          nodes,
          "displacement",
        ),
      },
      extrapolatedCurveNodeIds: extrapolatedNodes,
    },
    equilibrium: {
      appliedShear,
      totalSoilReaction,
      totalTranslationSupportReaction,
      forceEquilibriumResidual,
      normalizedForceEquilibriumResidual:
        Math.abs(forceEquilibriumResidual) / forceScale,
      appliedMomentAboutPileHead,
      soilReactionMomentAboutPileHead,
      supportReactionMomentAboutPileHead,
      momentEquilibriumResidual,
      normalizedMomentEquilibriumResidual:
        Math.abs(momentEquilibriumResidual) / momentScale,
      maximumFreeDofResidual: maxAbs(
        solution.freeIndices.map((index) => algebraicResidual[index]),
      ),
      supportReactions,
    },
    convergence: {
      strategy: scenario.solver.strategy,
      converged: solution.converged,
      achievedLoadFactor: solution.achievedLoadFactor,
      acceptedSteps: solution.history.length,
      cutbacks: solution.cutbacks,
      totalIterations: solution.totalIterations,
      totalLineSearchReductions: solution.totalLineSearchReductions,
      history: solution.history,
      failure: solution.failure,
    },
    demand: {
      lateralShear: scenario.action.lateralShear,
      overturningMoment: scenario.action.overturningMoment,
      referencePoint: scenario.action.referencePoint,
      basis: scenario.action.basis,
    },
    capacity: null,
    checks: [],
    utilizationRatio: null,
    structuralCoupling: {
      level: "single-pile-nonlinear-py-response",
      pileId: pile.id,
      responseMode: {
        status: solution.converged ? "available" : "failed",
        meshNodeCount: mesh.nodes.length,
        flexuralRigidity: scenario.flexuralRigidity.value,
        nodalState: nodes.map((node) => ({
          nodeId: node.id,
          elevation: node.elevation,
          displacement: node.displacement,
          rotation: node.rotation,
          soilReactionOnPile: node.spring.soilReactionOnPile,
          tangentStiffness: node.spring.tangentStiffness,
        })),
      },
      actionEffects: {
        maximumBendingMoment: maximumMoment,
        maximumShearForce: maximumShear,
      },
      structuralVerification: {
        status: "not-analyzed",
        reason:
          "The response supplies pile actions; section resistance and axial-force interaction require a separate structural verifier.",
      },
      continuumBridge: {
        model: "one-dimensional-independent-p-y-springs",
        status: "reduced-order-model",
        excludedEffects: [
          "three-dimensional soil continuum interaction",
          "installation effects",
          "pile-group interaction",
        ],
      },
    },
  };
}

export class LateralPileBeamOnSpringsAnalysis {
  constructor({ linearSolver = new DenseLinearSolver() } = {}) {
    this.linearSolver = linearSolver;
  }

  analyze({
    groundModel: groundModelInput,
    designSituation: designSituationInput,
    pile: pileInput,
    scenario: scenarioInput,
    profileId = null,
    units = null,
  } = {}) {
    try {
      assertExplicitUnitSystem(units, "LateralPileBeamOnSpringsAnalysis");
      const groundModel = normalizeGroundModel(groundModelInput, units);
      const designSituation = normalizeDesignSituation(
        designSituationInput,
        groundModel,
        units,
      );
      designSituation.validateAgainst(groundModel);
      if (designSituation.seismic.model !== "none") {
        throw new LateralPileResponseNotSupportedError(
          "The current p-y solver is static monotonic and does not support seismic or cyclic response.",
        );
      }
      const pile = normalizePile(pileInput, units);
      const scenario = normalizeScenario(scenarioInput, units);
      const profile = groundModel.getProfile(
        profileId ?? designSituation.spatialSelection.profileId,
      );
      if (!profile) {
        throw new LateralPileResponseNotSupportedError(
          "A GroundProfile is required for the p-y beam-on-springs analysis.",
        );
      }
      if (
        Math.abs(
          pile.placement.soilContactTopElevation -
            profile.groundSurfaceElevation,
        ) > TOLERANCE
      ) {
        throw new LateralPileResponseNotSupportedError(
          "The current p-y mesh requires pile soil contact to start at the GroundProfile surface.",
        );
      }
      if (pile.placement.toeElevation <= profile.bottomElevation + TOLERANCE) {
        throw new Error("GroundProfile must extend below the pile toe.");
      }

      const mesh = buildMesh({
        profile,
        pile,
        maxElementLength: scenario.discretization.maxElementLength,
      });
      validateLayerCurves({ profile, pile, scenario, mesh });
      const beam = assembleBeamStiffness(
        mesh,
        scenario.flexuralRigidity.value,
      );
      const nodeContributions = springContributions(mesh);
      const external = externalLoadVector(mesh, scenario);
      const fixedIndices = fixedDofIndices(mesh, scenario);
      const solution = solveIncrementally({
        mesh,
        scenario,
        beamStiffness: beam.stiffness,
        nodeContributions,
        externalLoad: external.vector,
        fixedIndices,
        linearSolver: this.linearSolver,
      });
      const outputs = buildOutputs({
        groundModel,
        designSituation,
        profile,
        pile,
        scenario,
        mesh,
        solution,
        externalLoad: external.vector,
        actionNodeIndex: external.nodeIndex,
        elementStiffnesses: beam.elementStiffnesses,
      });
      const status = solution.converged ? "ok" : "failed";
      const extrapolationWarning =
        outputs.response.extrapolatedCurveNodeIds.length > 0
          ? [
              "One or more p-y laws were evaluated beyond their last displacement point; inspect response.extrapolatedCurveNodeIds and the assigned extrapolation rule.",
            ]
          : [];

      return result({
        status,
        summary: solution.converged
          ? "Static nonlinear beam-on-p-y-springs analysis completed."
          : "The nonlinear p-y analysis did not reach the full requested load.",
        outputs,
        warnings: [
          ...extrapolationWarning,
          "P-y curves are assigned empirical inputs; their suitability, parameter provenance and sensitivity remain a project responsibility.",
          "No automatic mesh-convergence study is performed; repeat the analysis with a finer maxElementLength.",
          "Pile axial load, geometric stiffness, shear deformation and nonlinear flexural rigidity are not included in this increment.",
          "Cyclic degradation, gapping, permanent deformation, group effects and lateral ground movement are excluded.",
        ],
        assumptions: [
          "The pile is a vertical Euler-Bernoulli beam with constant assigned flexural rigidity.",
          "Soil is represented by independent, symmetric, static-monotonic p-y springs lumped by tributary element length.",
          "Layer interfaces are mesh boundaries; a node on an interface receives separate half-element contributions from the adjacent layers.",
          "The initial relative displacement between pile and soil is zero.",
          "Head and tip restraints are ideal translational or rotational constraints.",
        ],
        metadata: {
          references: [LATERAL_PILE_PY_REFERENCE],
          sourceUrl:
            "https://www.fhwa.dot.gov/engineering/geotech/pubs/hif18031.pdf",
          designSituation: designSituation.toJSON(),
          units: {
            force: GEOTECHNICAL_INTERNAL_UNITS.force,
            length: GEOTECHNICAL_INTERNAL_UNITS.length,
            moment: "kN.m",
            flexuralRigidity: "kN.m2",
            soilReactionPerLength: "kN/m",
            pYModulus: "kN/m2",
          },
        },
      });
    } catch (error) {
      const notSupported =
        error instanceof LateralPileResponseNotSupportedError;
      return result({
        status: notSupported ? "not-supported" : "failed",
        summary: notSupported
          ? error.message
          : "Lateral pile beam-on-springs analysis failed.",
        warnings: notSupported ? [] : [error.message],
        metadata: { errorName: error.name },
      });
    }
  }
}
