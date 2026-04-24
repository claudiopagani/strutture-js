import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { round, uniqueStrings } from "../../../core/results/checkUtils.js";
import { DofRegistry } from "../../../domain/fem/DofRegistry.js";
import { DisplacementControlNonlinearStaticSolver2D } from "../../../domain/fem/nonlinear/DisplacementControlNonlinearStaticSolver2D.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { bilinearizeCapacityCurve } from "./AlignmentCapacityBilinearization.js";
import { AlignmentSeismicAggregatedAnalysis } from "./AlignmentSeismicAggregatedAnalysis.js";
import { MasonryEquivalentFrameBuilder } from "./MasonryEquivalentFrameBuilder.js";
import { createMasonryEquivalentFrameContributorDefinition } from "./MasonryEquivalentFramePushoverInternalForces.js";
import { MasonryEquivalentFramePushoverSolver2D } from "./MasonryEquivalentFramePushoverSolver2D.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });
const DEFAULT_TOP_ROTATION = "free";
const DEFAULT_CONTROL_POINT_COUNT = 120;
const DEFAULT_SAMPLE_COUNT = 6;
const DEFAULT_TOLERANCE = 1e-6;
const DEFAULT_MAX_ITERATIONS = 60;
const DEFAULT_YIELD_TOLERANCE = 1e-9;
const LARGE_PLASTIC_MOMENT = 1e18;
const EPS = 1e-9;

function normalizeTopRotation(value = DEFAULT_TOP_ROTATION) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  const aliases = new Map([
    ["free", "free"],
    ["libera", "free"],
    ["hinged", "free"],
    ["fixed", "fixed"],
    ["fissa", "fixed"],
    ["incastrata", "fixed"],
    ["clamped", "fixed"],
  ]);

  const resolved = aliases.get(normalized);

  if (!resolved) {
    throw new Error(`Unsupported masonry pier topRotation option: ${value}.`);
  }

  return resolved;
}

function createZeroMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(0));
}

function createZeroVector(size) {
  return new Array(size).fill(0);
}

function transpose(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

function multiplyMatrices(left, right) {
  if (left.length === 0 || right.length === 0) {
    return createZeroMatrix(left.length);
  }

  return left.map((leftRow) =>
    right[0].map((_, column) =>
      leftRow.reduce((sum, value, index) => sum + value * right[index][column], 0),
    ),
  );
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0),
  );
}

function subtractMatrices(left, right) {
  return left.map((row, rowIndex) =>
    row.map((value, columnIndex) => value - right[rowIndex][columnIndex]),
  );
}

function addVectors(left, right) {
  return left.map((value, index) => value + right[index]);
}

function scalarVector(scalar, vector) {
  return vector.map((value) => scalar * value);
}

function invertSmallDenseMatrix(matrix) {
  if (matrix.length === 1 && matrix[0].length === 1) {
    const pivot = matrix[0][0];

    if (!Number.isFinite(pivot) || Math.abs(pivot) <= EPS) {
      throw new Error("Plastic hinge condensation pivot must be finite and non-zero.");
    }

    return [[1 / pivot]];
  }

  if (matrix.length !== 2 || matrix[0].length !== 2 || matrix[1].length !== 2) {
    throw new Error(
      "Masonry pier pushover supports condensation of at most two rotational hinges.",
    );
  }

  const [[a, b], [c, d]] = matrix;
  const determinant = a * d - b * c;

  if (!Number.isFinite(determinant) || Math.abs(determinant) <= EPS) {
    throw new Error("Plastic hinge condensation determinant must be finite and non-zero.");
  }

  return [
    [d / determinant, -b / determinant],
    [-c / determinant, a / determinant],
  ];
}

function signLabel(value) {
  if (!Number.isFinite(value) || value >= 0) {
    return "positive";
  }

  return "negative";
}

function plasticGeneralizedForce(sign, plasticMoment) {
  return sign === "negative" ? plasticMoment : -plasticMoment;
}

function cloneHingeState(state = null) {
  return {
    start: state?.start ?? null,
    end: state?.end ?? null,
    shear: state?.shear ?? null,
    history: [...(state?.history ?? [])],
  };
}

function activeHingeCount(state = null) {
  return (
    Number(state?.start != null) +
    Number(state?.end != null) +
    Number(state?.shear != null)
  );
}

function withActivation(state, position, sign, metadata = {}) {
  if (state?.[position] != null) {
    return cloneHingeState(state);
  }

  return {
    ...cloneHingeState(state),
    [position]: sign,
    history: [
      ...(state?.history ?? []),
      {
        type: "plastic-hinge-activation",
        position,
        sign,
        ...metadata,
      },
    ],
  };
}

function activationDelta(previousState, nextState) {
  const events = [];

  if (previousState?.start == null && nextState?.start != null) {
    events.push({ position: "start", sign: nextState.start });
  }

  if (previousState?.end == null && nextState?.end != null) {
    events.push({ position: "end", sign: nextState.end });
  }

  return events;
}

function rotationIndex(position) {
  return position === "end" ? 5 : 2;
}

function releasedPositions(state = null) {
  return ["start", "end"].filter((position) => state?.[position] != null);
}

function responseForState(element, localDisplacements, state, plasticMomentsByPosition) {
  const localElasticStiffness = element.localStiffness();
  const positions = releasedPositions(state);

  if (positions.length === 0) {
    return {
      localEndForces: multiplyMatrixVector(localElasticStiffness, localDisplacements),
      tangentLocalStiffness: localElasticStiffness,
      plasticRotations: [],
    };
  }

  const h = Array.from({ length: 6 }, () => new Array(positions.length).fill(0));

  positions.forEach((position, columnIndex) => {
    h[rotationIndex(position)][columnIndex] = -1;
  });

  const ht = transpose(h);
  const kaa = multiplyMatrices(ht, multiplyMatrices(localElasticStiffness, h));
  const htkd = multiplyMatrixVector(
    ht,
    multiplyMatrixVector(localElasticStiffness, localDisplacements),
  );
  const prescribedGeneralizedForce = positions.map((position) =>
    plasticGeneralizedForce(state[position], plasticMomentsByPosition[position]),
  );
  const inverseKaa = invertSmallDenseMatrix(kaa);
  const plasticRotations = multiplyMatrixVector(
    inverseKaa,
    prescribedGeneralizedForce.map(
      (value, index) => value - htkd[index],
    ),
  );
  const localElasticDisplacements = addVectors(
    localDisplacements,
    multiplyMatrixVector(h, plasticRotations),
  );
  const localEndForces = multiplyMatrixVector(
    localElasticStiffness,
    localElasticDisplacements,
  );
  const tangentLocalStiffness = subtractMatrices(
    localElasticStiffness,
    multiplyMatrices(
      multiplyMatrices(localElasticStiffness, h),
      multiplyMatrices(inverseKaa, multiplyMatrices(ht, localElasticStiffness)),
    ),
  );

  return {
    localEndForces,
    tangentLocalStiffness,
    plasticRotations,
  };
}

function activateMissingHinges(
  localEndForces,
  state,
  plasticMomentsByPosition,
  yieldTolerance,
  elementId,
) {
  let updatedState = cloneHingeState(state);

  for (const position of ["start", "end"]) {
    if (updatedState[position] != null) {
      continue;
    }

    const plasticMoment = plasticMomentsByPosition[position];

    if (!Number.isFinite(plasticMoment) || plasticMoment <= 0) {
      continue;
    }

    const localMoment = localEndForces[rotationIndex(position)];
    const activationThreshold =
      plasticMoment * (1 - Math.max(0, yieldTolerance ?? DEFAULT_YIELD_TOLERANCE));

    if (Math.abs(localMoment) >= activationThreshold) {
      updatedState = withActivation(updatedState, position, signLabel(localMoment), {
        elementId,
        plasticMoment,
        trialMoment: localMoment,
      });
    }
  }

  return updatedState;
}

function baseShearFromEvaluation(frame, evaluation) {
  const constrainedUxIndices = (frame.supports ?? [])
    .filter((support) => support.isRestrained?.("ux") ?? support.restraints?.ux)
    .map((support) => frame.dofRegistry.getIndex(support.node, "ux"));

  return Math.abs(
    constrainedUxIndices.reduce(
      (sum, index) => sum + (evaluation?.internalForceVector?.[index] ?? 0),
      0,
    ),
  );
}

function maxFinite(values = []) {
  const finiteValues = values.filter(Number.isFinite);

  return finiteValues.length > 0 ? Math.max(...finiteValues) : null;
}

function interpolateCurve(points = [], displacement) {
  if (!Number.isFinite(displacement) || points.length === 0) {
    return 0;
  }

  if (displacement <= points[0].displacement + EPS) {
    return points[0].baseShear;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const startPoint = points[index];
    const endPoint = points[index + 1];

    if (displacement > endPoint.displacement + EPS) {
      continue;
    }

    const deltaDisplacement = endPoint.displacement - startPoint.displacement;

    if (deltaDisplacement <= EPS) {
      return endPoint.baseShear;
    }

    const ratio = (displacement - startPoint.displacement) / deltaDisplacement;

    return (
      startPoint.baseShear +
      ratio * (endPoint.baseShear - startPoint.baseShear)
    );
  }

  return points.at(-1)?.baseShear ?? 0;
}

function metricDelta(id, label, aggregatedValue, femValue) {
  const delta =
    Number.isFinite(aggregatedValue) && Number.isFinite(femValue)
      ? femValue - aggregatedValue
      : null;
  const variationPercent =
    Number.isFinite(delta) &&
    Number.isFinite(aggregatedValue) &&
    Math.abs(aggregatedValue) > EPS
      ? (delta / aggregatedValue) * 100
      : null;

  return {
    id,
    label,
    aggregatedValue: round(aggregatedValue),
    femValue: round(femValue),
    delta: round(delta),
    variationPercent: round(variationPercent),
  };
}

function sampleCurveComparison({
  aggregatedCurve,
  femCurve,
  yieldDisplacement,
  ultimateDisplacement,
  sampleCount = DEFAULT_SAMPLE_COUNT,
}) {
  const intermediateFractions = Array.from(
    { length: Math.max(1, sampleCount) },
    (_, index) => (index + 1) / (sampleCount + 1),
  );
  const sampleDisplacements = [
    0,
    yieldDisplacement,
    ...intermediateFractions.map((ratio) => ratio * ultimateDisplacement),
    ultimateDisplacement,
  ]
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
    .filter((value, index, values) =>
      index === 0 || Math.abs(value - values[index - 1]) > 1e-8,
    );

  return sampleDisplacements.map((displacement, index) => {
    const aggregatedBaseShear = interpolateCurve(aggregatedCurve, displacement);
    const femBaseShear = interpolateCurve(femCurve, displacement);
    const delta = femBaseShear - aggregatedBaseShear;
    const variationPercent =
      Math.abs(aggregatedBaseShear) > EPS
        ? (delta / aggregatedBaseShear) * 100
        : null;

    return {
      id: `sample-${index + 1}`,
      displacement: round(displacement),
      aggregatedBaseShear: round(aggregatedBaseShear),
      femBaseShear: round(femBaseShear),
      delta: round(delta),
      variationPercent: round(variationPercent),
    };
  });
}

function buildReading(metricDeltas = []) {
  const metricById = Object.fromEntries(
    metricDeltas.map((metric) => [metric.id, metric]),
  );
  const thresholds = {
    ks: 10,
    Vy: 10,
    du: 5,
  };
  const failedMetric = ["ks", "Vy", "du"].find((metricId) => {
    const variationPercent = metricById[metricId]?.variationPercent;

    return Number.isFinite(variationPercent)
      ? Math.abs(variationPercent) > thresholds[metricId]
      : false;
  });
  const outcome = failedMetric ? "attention" : "consistent";

  return {
    outcome,
    headline:
      outcome === "consistent"
        ? "Il pushover FEM del maschio riproduce la curva aggregata con scarti contenuti su rigidezza, resistenza e deformabilita."
        : "Il pushover FEM del maschio mostra scarti non trascurabili rispetto alla curva aggregata e richiede una lettura cauta.",
    governingMetricId: failedMetric ?? "aligned-response",
    messages: [
      `Scarto rigidezza ks: ${round(metricById.ks?.variationPercent)}%.`,
      `Scarto resistenza Vy: ${round(metricById.Vy?.variationPercent)}%.`,
      `Scarto deformabilita du: ${round(metricById.du?.variationPercent)}%.`,
    ],
  };
}

function createSingleDofPushoverModel({
  referenceHorizontalForce,
  dofId = "masonry-pier-shear.ux",
}) {
  return {
    supports: [],
    referenceLoadVector: [referenceHorizontalForce],
    controlVector: [1],
    dofRegistry: {
      dofsPerNode: ["ux"],
      size() {
        return 1;
      },
      getDofIds() {
        return [dofId];
      },
      getIndex(nodeOrDofId, dof) {
        if (dof != null) {
          return 0;
        }

        if (nodeOrDofId !== dofId) {
          throw new Error(`Unknown DOF id ${nodeOrDofId}.`);
        }

        return 0;
      },
    },
  };
}

function solveShearControlledPushover({
  solver,
  stiffness,
  peakBaseShear,
  ultimateDisplacement,
  controlPointCount,
  tolerance = DEFAULT_TOLERANCE,
  maxIterations = DEFAULT_MAX_ITERATIONS,
}) {
  const yieldDisplacement = peakBaseShear / stiffness;
  const model = createSingleDofPushoverModel({
    referenceHorizontalForce: peakBaseShear,
  });
  const result = solver.solve({
    model,
    initialState: { yielded: false, sign: null },
    cloneState: (state) => ({ ...state }),
    controlDisplacementIncrement: ultimateDisplacement / controlPointCount,
    maxControlDisplacement: ultimateDisplacement,
    tolerance,
    maxIterations,
    maxSteps: controlPointCount + 2,
    evaluator: ({ displacements, state }) => {
      const displacement = displacements[0];
      const trialForce = stiffness * displacement;
      const shouldYield = Math.abs(trialForce) >= peakBaseShear - EPS;
      const nextState =
        state?.yielded || shouldYield
          ? {
              yielded: true,
              sign: Math.sign(trialForce) || state?.sign || 1,
            }
          : {
              yielded: false,
              sign: null,
            };
      const internalForce =
        nextState.yielded
          ? nextState.sign * peakBaseShear
          : trialForce;
      const tangentStiffness =
        nextState.yielded
          ? [[0]]
          : [[stiffness]];

      return {
        internalForceVector: [internalForce],
        tangentStiffnessMatrix: tangentStiffness,
        state: nextState,
        events:
          !state?.yielded && nextState.yielded
            ? [
                {
                  type: "shear-yield",
                  sign: nextState.sign,
                },
              ]
            : [],
      };
    },
    pointBuilder: ({ evaluation, state }) => ({
      baseShear: evaluation ? Math.abs(evaluation.internalForceVector[0]) : 0,
      hingeCount: Number(state?.yielded),
    }),
  });

  return {
    result,
    yieldDisplacement,
  };
}

function evaluatePierFrame({
  frame,
  displacements,
  state = null,
  plasticMomentsByPosition,
  yieldTolerance = DEFAULT_YIELD_TOLERANCE,
}) {
  const element = frame.elements?.[0];

  if (!element) {
    throw new Error("Masonry pier pushover requires a single frame element.");
  }

  const previousState = cloneHingeState(state);
  const localDisplacements = element.localDisplacements(
    displacements,
    frame.dofRegistry,
  );
  let trialState = cloneHingeState(previousState);
  let response = null;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    response = responseForState(
      element,
      localDisplacements,
      trialState,
      plasticMomentsByPosition,
    );
    const updatedState = activateMissingHinges(
      response.localEndForces,
      trialState,
      plasticMomentsByPosition,
      yieldTolerance,
      element.id,
    );

    if (
      updatedState.start === trialState.start &&
      updatedState.end === trialState.end
    ) {
      break;
    }

    trialState = updatedState;
  }

  const transformation = element.transformationMatrix();
  const tangentGlobalStiffness = multiplyMatrices(
    transpose(transformation),
    multiplyMatrices(response.tangentLocalStiffness, transformation),
  );
  const globalEndForces = multiplyMatrixVector(
    transpose(transformation),
    response.localEndForces,
  );
  const dofIds = element.getDofIds(frame.dofRegistry);
  const indices = dofIds.map((dofId) => frame.dofRegistry.getIndex(dofId));
  const internalForceVector = createZeroVector(frame.dofRegistry.size());
  const tangentStiffnessMatrix = createZeroMatrix(frame.dofRegistry.size());

  for (let localRow = 0; localRow < indices.length; localRow += 1) {
    const globalRow = indices[localRow];

    internalForceVector[globalRow] += globalEndForces[localRow];

    for (let localColumn = 0; localColumn < indices.length; localColumn += 1) {
      const globalColumn = indices[localColumn];

      tangentStiffnessMatrix[globalRow][globalColumn] +=
        tangentGlobalStiffness[localRow][localColumn];
    }
  }

  return {
    internalForceVector,
    tangentStiffnessMatrix,
    state: trialState,
    events: activationDelta(previousState, trialState).map((event) => ({
      ...event,
      type: "plastic-hinge-activation",
      elementId: element.id,
      plasticMoment: plasticMomentsByPosition[event.position],
    })),
    responses: [
      {
        elementId: element.id,
        localEndForces: [...response.localEndForces],
        globalEndForces: [...globalEndForces],
        plasticRotations: [...response.plasticRotations],
        hingeState: cloneHingeState(trialState),
      },
    ],
  };
}

function buildSinglePierFrame({
  frameBuilder = new MasonryEquivalentFrameBuilder(),
  alignment,
  stage,
  topRotation,
  pierId,
  referenceHorizontalForce = 1,
}) {
  const frame = frameBuilder.build({
    alignment,
    stage,
    options: { topRotation },
  });
  const selectedPier =
    pierId == null
      ? frame.pierFrames.length === 1
        ? frame.pierFrames[0]
        : null
      : frame.pierFrames.find((pier) => pier.id === pierId) ?? null;

  if (!selectedPier) {
    throw new Error(
      pierId == null
        ? "Masonry pier pushover comparison requires a single extracted pier or an explicit pierId."
        : `Pier ${pierId} was not found in the equivalent-frame model.`,
    );
  }

  const nodes = frame.model.nodes.filter(
    (node) =>
      node.id === selectedPier.baseNodeId || node.id === selectedPier.topNodeId,
  );
  const elements = frame.model.elements.filter(
    (element) => element.id === selectedPier.elementId,
  );
  const supports = frame.model.supports.filter(
    (support) =>
      support.metadata?.sourcePierId === selectedPier.id ||
      support.node?.id === selectedPier.baseNodeId ||
      support.node?.id === selectedPier.topNodeId,
  );
  const dofRegistry = new DofRegistry();

  dofRegistry.registerNodes(nodes);
  dofRegistry.registerElements(elements);
  dofRegistry.registerNodes(supports.map((support) => support.node));

  const topNode = nodes.find((node) => node.id === selectedPier.topNodeId);
  const referenceLoadVector = new Array(dofRegistry.size()).fill(0);
  const controlVector = new Array(dofRegistry.size()).fill(0);

  referenceLoadVector[dofRegistry.getIndex(topNode, "ux")] =
    referenceHorizontalForce;
  controlVector[dofRegistry.getIndex(topNode, "ux")] = 1;

  return {
    id: `${alignment.id}-${selectedPier.id}-pushover-frame`,
    nodes,
    elements,
    supports,
    dofRegistry,
    referenceLoadVector,
    controlVector,
    controlNode: topNode,
    sourceFrame: frame,
    selectedPier,
  };
}

export class MasonryPierCapacityCurveComparisonAnalysis {
  constructor({
    aggregatedAnalysis = new AlignmentSeismicAggregatedAnalysis(),
    frameBuilder = new MasonryEquivalentFrameBuilder(),
    frameSolver = new MasonryEquivalentFramePushoverSolver2D(),
    nonlinearSolver = new DisplacementControlNonlinearStaticSolver2D(),
  } = {}) {
    this.aggregatedAnalysis = aggregatedAnalysis;
    this.frameBuilder = frameBuilder;
    this.frameSolver = frameSolver;
    this.nonlinearSolver = nonlinearSolver;
  }

  analyze({
    alignment,
    stage = "design",
    options = {},
    aggregatedResult: precomputedAggregatedResult = null,
  } = {}) {
    if (!alignment) {
      throw new Error(
        "MasonryPierCapacityCurveComparisonAnalysis requires an alignment model.",
      );
    }

    const topRotation = normalizeTopRotation(
      options.topRotation ?? DEFAULT_TOP_ROTATION,
    );
    const aggregatedResult =
      precomputedAggregatedResult ??
      this.aggregatedAnalysis.analyze({
        alignment,
        stage,
        options: {
          ...options,
          topRotation,
        },
      });
    const aggregatedPiers = aggregatedResult.outputs?.piers ?? [];
    const selectedPier =
      options.pierId == null
        ? aggregatedPiers.length === 1
          ? aggregatedPiers[0]
          : null
        : aggregatedPiers.find((pier) => pier.id === options.pierId) ?? null;

    if (!selectedPier) {
      return new CalculationResult({
        applicationId: "masonry-wall-openings",
        status: "not-verified",
        summary:
          "Pier capacity-curve comparison could not select a unique masonry pier from the aggregated analysis output.",
        outputs: {
          stage,
          topRotation,
          availablePierIds: aggregatedPiers.map((pier) => pier.id),
        },
        warnings: uniqueStrings([
          ...(aggregatedResult.warnings ?? []),
          "Select an explicit pierId when the alignment contains more than one pier.",
        ]),
        assumptions: uniqueStrings([
          ...(aggregatedResult.assumptions ?? []),
          "The first FEM/non-linear comparison is scoped to a single masonry pier so the equivalent-frame pushover can be interpreted directly against the aggregated contribution curve.",
        ]),
        metadata: {
          comparisonType: "masonry-pier-capacity-curve",
          stage,
          topRotation,
        },
      });
    }

    const toFem = createUnitResolver(alignment.units, FEM_UNITS);
    const fromFem = createUnitResolver(FEM_UNITS, alignment.units);
    const singlePierFrame = buildSinglePierFrame({
      frameBuilder: this.frameBuilder,
      alignment,
      stage,
      topRotation,
      pierId: selectedPier.id,
      referenceHorizontalForce: Math.max(1, toFem.force(selectedPier.peakBaseShear)),
    });
    const controlPointCount = Math.max(
      20,
      Math.round(options.controlPointCount ?? DEFAULT_CONTROL_POINT_COUNT),
    );
    const contributorDefinition = createMasonryEquivalentFrameContributorDefinition({
      alignment,
      pier: selectedPier,
      topRotation,
    });
    const solverResult = this.frameSolver.solve({
      frame: singlePierFrame,
      contributorsByElementId: {
        [singlePierFrame.selectedPier.elementId]: contributorDefinition,
      },
      controlDisplacementIncrement:
        contributorDefinition.failureDisplacement / controlPointCount,
      maxControlDisplacement: contributorDefinition.failureDisplacement,
      tolerance: options.tolerance ?? DEFAULT_TOLERANCE,
      maxIterations: options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      maxSteps: controlPointCount + 2,
      yieldTolerance: options.yieldTolerance ?? DEFAULT_YIELD_TOLERANCE,
    });
    const contributorState =
      solverResult.hingeStatesByElementId?.[singlePierFrame.selectedPier.elementId] ??
      null;
    const femCurvePoints = solverResult.points.map((point, index) => ({
      id: `${selectedPier.id}-fem-point-${index + 1}`,
      displacement: round(fromFem.length(point.controlDisplacement)),
      baseShear: round(fromFem.force(point.baseShear)),
      hingeCount: point.hingeCount,
    }));
    const failureDisplacement = round(
      fromFem.length(contributorDefinition.failureDisplacement),
    );
    const comparisonCurvePoints = femCurvePoints.map((point) => ({
      id: point.id,
      displacement: point.displacement,
      baseShear: point.baseShear,
    }));
    const lastComparisonPoint = comparisonCurvePoints.at(-1);

    if (
      !lastComparisonPoint ||
      Math.abs(lastComparisonPoint.displacement - failureDisplacement) > 1e-8 ||
      Math.abs(lastComparisonPoint.baseShear) > 1e-8
    ) {
      comparisonCurvePoints.push({
        id: `${selectedPier.id}-fem-failure`,
        displacement: failureDisplacement,
        baseShear: 0,
      });
    }

    const femBilinearization = bilinearizeCapacityCurve({
      points: comparisonCurvePoints,
    });
    const metricDeltas = [
      metricDelta("ks", "Rigidezza iniziale ks", selectedPier.stiffness, femBilinearization.ks),
      metricDelta("Vy", "Taglio equivalente Vy", selectedPier.peakBaseShear, femBilinearization.Vy),
      metricDelta(
        "peakBaseShear",
        "Taglio massimo Vmax",
        selectedPier.peakBaseShear,
        maxFinite(comparisonCurvePoints.map((point) => point.baseShear)),
      ),
      metricDelta(
        "du",
        "Spostamento ultimo du",
        selectedPier.ultimateDisplacement,
        femBilinearization.du,
      ),
    ];
    const sampledCurvePoints = sampleCurveComparison({
      aggregatedCurve: selectedPier.curvePoints,
      femCurve: comparisonCurvePoints,
      yieldDisplacement: selectedPier.yieldDisplacement,
      ultimateDisplacement: selectedPier.ultimateDisplacement,
      sampleCount: options.sampleCount ?? DEFAULT_SAMPLE_COUNT,
    });
    const reading = buildReading(metricDeltas);

    return new CalculationResult({
      applicationId: "masonry-wall-openings",
      status: solverResult.points.length > 1 ? "ok" : "not-verified",
      summary:
        "Single-pier capacity-curve comparison completed by confronting the aggregated masonry contribution with the corresponding non-linear equivalent-frame response.",
      outputs: {
        stage,
        topRotation,
        pier: {
          id: selectedPier.id,
          wallId: selectedPier.wallId,
          topRotation: selectedPier.topRotation,
          governingFamily: selectedPier.governingFamily,
          governingMode: selectedPier.governingMode,
          mechanics: selectedPier.mechanics,
        },
        aggregated: {
          performanceSummary: {
            ks: round(selectedPier.stiffness),
            Vy: round(selectedPier.peakBaseShear),
            du: round(selectedPier.ultimateDisplacement),
            yieldDisplacement: round(selectedPier.yieldDisplacement),
            peakBaseShear: round(selectedPier.peakBaseShear),
            governingFamily: selectedPier.governingFamily,
            governingMode: selectedPier.governingMode,
          },
          capacityCurve: {
            units: {
              displacement: alignment.units.length,
              baseShear: alignment.units.force,
            },
            points: selectedPier.curvePoints,
          },
        },
        fem: {
          performanceSummary: {
            ks: round(femBilinearization.ks),
            Vy: round(femBilinearization.Vy),
            du: round(femBilinearization.du),
            yieldDisplacement: round(femBilinearization.yieldDisplacement),
            peakBaseShear: round(
              maxFinite(comparisonCurvePoints.map((point) => point.baseShear)),
            ),
            hingeCount: activeHingeCount(contributorState?.hingeState),
            mechanismModel: "equivalent-frame-hinges-and-shear-plateau",
          },
          capacityCurve: {
            units: {
              displacement: alignment.units.length,
              baseShear: alignment.units.force,
            },
            points: comparisonCurvePoints,
          },
          hingeEvents: solverResult.events.map((event, index) => ({
            id: `hinge-event-${index + 1}`,
            type: event.type,
            position: event.position,
            sign: event.sign,
            elementId: event.elementId ?? null,
            capacityKind: event.capacityKind ?? null,
            plasticCapacity:
              Number.isFinite(event.plasticCapacity) && event.capacityKind === "moment"
                ? round(fromFem.moment(event.plasticCapacity))
                : Number.isFinite(event.plasticCapacity) &&
                    event.capacityKind === "force"
                  ? round(fromFem.force(event.plasticCapacity))
                  : null,
            plasticMoment:
              Number.isFinite(event.plasticCapacity) && event.capacityKind === "moment"
                ? round(fromFem.moment(event.plasticCapacity))
                : null,
          })),
          finalState: {
            loadFactor: round(solverResult.finalLoadFactor),
            termination: solverResult.termination,
            failed: Boolean(contributorState?.failed),
            hingeState: cloneHingeState(contributorState?.hingeState),
          },
        },
        comparison: {
          metrics: metricDeltas,
          sampledCurvePoints,
        },
        reading,
      },
      warnings: uniqueStrings([
        ...(aggregatedResult.warnings ?? []),
        ...solverResult.warnings,
      ]),
      assumptions: uniqueStrings([
        ...(aggregatedResult.assumptions ?? []),
        ...solverResult.assumptions,
        "The single-pier comparison uses the same unified equivalent-frame masonry macroelement adopted by the wall-level pushover, with concentrated end plastic hinges and an internal perfectly plastic shear mechanism.",
        "The single-pier pushover uses the same MRd and du reference already adopted by the aggregated method, so the comparison isolates the consistency of the FEM force-displacement evolution.",
      ]),
      metadata: {
        comparisonType: "masonry-pier-capacity-curve",
        stage,
        topRotation,
        pierId: selectedPier.id,
        controlPointCount,
        generatedCurvePointCount: comparisonCurvePoints.length,
      },
    });
  }
}
