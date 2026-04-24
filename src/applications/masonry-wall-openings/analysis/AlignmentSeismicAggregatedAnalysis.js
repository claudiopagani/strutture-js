import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { round, uniqueStrings } from "../../../core/results/checkUtils.js";
import { FrameElement2DTimoshenkoRigidOffsets } from "../../../domain/fem/index.js";
import { DenseLinearSolver } from "../../../domain/math/DenseLinearSolver.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { SteelRingFramePushoverAnalysis } from "../../steel-frames/analysis/SteelRingFramePushoverAnalysis.js";
import { extractEquivalentFrameMembers } from "../geometry/extractEquivalentFrameMembers.js";
import { sanitizeAlignmentOpenings } from "../geometry/sanitizeAlignmentOpenings.js";
import { resolveAlignmentMechanicalState } from "../materials/resolveAlignmentMechanicalState.js";
import { resolveMasonryMaterialProperty } from "../materials/resolveMasonryMaterialProperty.js";
import { bilinearizeCapacityCurve } from "./AlignmentCapacityBilinearization.js";
import { AlignmentStaticAnalysis } from "./AlignmentStaticAnalysis.js";

const DEFAULT_TOP_ROTATION = "free";
const DEFAULT_DRIFT_SHEAR = 0.005;
const DEFAULT_RING_FRAME_MAX_DISPLACEMENT = 0.03;
const DEFAULT_RING_FRAME_MAX_STEPS = 60;
const DEFAULT_RING_FRAME_MAX_ITERATIONS = 60;
const DEFAULT_RING_FRAME_CONTROL_INCREMENT_RATIO = 1 / 20;
const KAPPA_TOE_CRUSHING = 1 / 0.85;
const SHEAR_CORRECTION_FACTOR = 5 / 6;
const STEEL_RING_FRAME_USER_UNITS = Object.freeze({ force: "kN", length: "m" });
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
    throw new Error(`Unsupported pier topRotation option: ${value}.`);
  }

  return resolved;
}

function minPositive(values = []) {
  const finitePositiveValues = values.filter(
    (value) => Number.isFinite(value) && value > EPS,
  );

  return finitePositiveValues.length > 0
    ? Math.min(...finitePositiveValues)
    : null;
}

function maxFinite(values = []) {
  const finiteValues = values.filter(Number.isFinite);

  return finiteValues.length > 0 ? Math.max(...finiteValues) : null;
}

function postFailureDisplacement(displacement) {
  return displacement + Math.max(displacement * 1e-6, 1e-6);
}

function normalizeCurvePoint(point, index) {
  return {
    id: point.id ?? `point-${index + 1}`,
    displacement:
      Number.isFinite(point.displacement)
        ? point.displacement
        : point.controlDisplacement,
    baseShear:
      Number.isFinite(point.baseShear) ? point.baseShear : point.force,
  };
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

function roundCurvePoints(points = []) {
  return points.map((point) => ({
    id: point.id,
    displacement: round(point.displacement),
    baseShear: round(point.baseShear),
  }));
}

function resolvePierElasticStiffness({
  pier,
  elasticModulus,
  shearModulus,
  topRotation,
  warnings,
}) {
  const length =
    Number.isFinite(pier.effectiveLength) && pier.effectiveLength > EPS
      ? pier.effectiveLength
      : pier.length;
  const deformableHeight =
    Number.isFinite(pier.deformableHeight) && pier.deformableHeight > EPS
      ? pier.deformableHeight
      : pier.height;
  const area = length * pier.thickness;
  const inertia = (pier.thickness * length ** 3) / 12;
  const bendingStiffnessFactor = topRotation === "fixed" ? 12 : 3;
  const components = [];

  if (
    Number.isFinite(elasticModulus) &&
    elasticModulus > EPS &&
    Number.isFinite(shearModulus) &&
    shearModulus > EPS
  ) {
    const element = new FrameElement2DTimoshenkoRigidOffsets({
      id: `${pier.id}-elastic-stiffness-probe`,
      startNode: { id: `${pier.id}-elastic-base`, x: 0, y: 0 },
      endNode: { id: `${pier.id}-elastic-top`, x: 0, y: pier.height },
      axialRigidity: elasticModulus * area,
      flexuralRigidity: elasticModulus * inertia,
      shearRigidity: shearModulus * area,
      shearCorrectionFactor: SHEAR_CORRECTION_FACTOR,
      rigidStartOffset: pier.rigidBottomLength ?? 0,
      rigidEndOffset: pier.rigidTopLength ?? 0,
    });
    const stiffnessMatrix = element.globalStiffness();
    const prescribedDofs = new Map([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 1],
    ]);

    if (topRotation === "fixed") {
      prescribedDofs.set(5, 0);
    }

    const unknownDofs = [3, 4, 5].filter((dof) => !prescribedDofs.has(dof));
    const prescribedEntries = [...prescribedDofs.entries()];
    const fullDisplacements = new Array(6).fill(0);

    for (const [dof, value] of prescribedEntries) {
      fullDisplacements[dof] = value;
    }

    if (unknownDofs.length > 0) {
      const reducedStiffness = unknownDofs.map((rowDof) =>
        unknownDofs.map((columnDof) => stiffnessMatrix[rowDof][columnDof]),
      );
      const reducedLoad = unknownDofs.map((rowDof) =>
        -prescribedEntries.reduce(
          (sum, [columnDof, value]) =>
            sum + stiffnessMatrix[rowDof][columnDof] * value,
          0,
        ),
      );
      const solution = new DenseLinearSolver().solve(
        reducedStiffness,
        reducedLoad,
      );

      unknownDofs.forEach((dof, index) => {
        fullDisplacements[dof] = solution[index];
      });
    }

    const forceVector = stiffnessMatrix.map((row) =>
      row.reduce(
        (sum, value, index) => sum + value * fullDisplacements[index],
        0,
      ),
    );
    const stiffness = Math.abs(forceVector[3]);

    if (Number.isFinite(stiffness) && stiffness > EPS) {
      return stiffness;
    }

    warnings.push(
      `Pier ${pier.id} could not resolve a positive condensed FEM elastic stiffness; the lateral stiffness uses the closed-form available components only.`,
    );
  }

  if (Number.isFinite(elasticModulus) && elasticModulus > EPS) {
    const bendingStiffness =
      (bendingStiffnessFactor * elasticModulus * inertia) /
      deformableHeight ** 3;

    if (Number.isFinite(bendingStiffness) && bendingStiffness > EPS) {
      components.push(bendingStiffness);
    }
  } else {
    warnings.push(
      `Pier ${pier.id} could not resolve a finite masonry elastic modulus; the lateral stiffness uses the available components only.`,
    );
  }

  if (Number.isFinite(shearModulus) && shearModulus > EPS) {
    const shearStiffness =
      (SHEAR_CORRECTION_FACTOR * shearModulus * area) / deformableHeight;

    if (Number.isFinite(shearStiffness) && shearStiffness > EPS) {
      components.push(shearStiffness);
    }
  } else {
    warnings.push(
      `Pier ${pier.id} could not resolve a finite masonry shear modulus; the lateral stiffness uses the available components only.`,
    );
  }

  if (components.length === 0) {
    return null;
  }

  const compliance = components.reduce((sum, stiffness) => sum + 1 / stiffness, 0);

  return compliance > EPS ? 1 / compliance : null;
}

function resolveFlexuralCapacity({
  axialForce,
  compressiveStrength,
  thickness,
  length,
  mechanismHeight,
}) {
  if (
    !Number.isFinite(axialForce) ||
    axialForce <= EPS ||
    !Number.isFinite(compressiveStrength) ||
    compressiveStrength <= EPS
  ) {
    return {
      V: null,
      MRd: null,
      compressionRatio: null,
    };
  }

  const compressionRatio =
    axialForce / (compressiveStrength * thickness * length);
  const reduction = 1 - KAPPA_TOE_CRUSHING * compressionRatio;
  const V =
    (axialForce / 2) * (length / mechanismHeight) * Math.max(reduction, 0);
  const MRd = V * mechanismHeight;

  return {
    V: V > EPS ? V : 0,
    MRd: MRd > EPS ? MRd : 0,
    compressionRatio,
  };
}

function resolveBedJointSlidingCapacity({
  cohesion,
  axialForce,
  thickness,
  length,
  mechanismHeight,
}) {
  if (!Number.isFinite(cohesion) || cohesion <= EPS) {
    return {
      V: null,
      compressedLength: null,
      eccentricity: null,
    };
  }

  if (!Number.isFinite(axialForce) || axialForce <= EPS) {
    return {
      V: cohesion * thickness * length,
      compressedLength: length,
      eccentricity: 0,
    };
  }

  const numerator = cohesion * thickness * length + 0.4 * axialForce;
  const denominator = 1 + (2 * cohesion * thickness * mechanismHeight) / axialForce;
  const V = numerator / denominator;
  const eccentricity = (V * mechanismHeight) / axialForce;
  const compressedLength = Math.max(0, Math.min(length, length - 2 * eccentricity));

  return {
    V: V > EPS ? V : 0,
    compressedLength,
    eccentricity,
  };
}

function resolveDiagonalCrackingCapacity({
  tensileStrength,
  axialForce,
  thickness,
  length,
  height,
}) {
  if (!Number.isFinite(tensileStrength) || tensileStrength <= EPS) {
    return {
      V: null,
      aspectFactor: null,
    };
  }

  const aspectFactor = Math.min(Math.max(height / length, 1), 1.5);
  const baseTerm = tensileStrength * thickness * length;
  const amplification = Math.max(1 + axialForce / baseTerm, 0);

  return {
    V: (baseTerm / aspectFactor) * Math.sqrt(amplification),
    aspectFactor,
  };
}

function resolveFlexuralDriftCapacity({
  axialForce,
  compressiveStrength,
  thickness,
  length,
}) {
  if (
    !Number.isFinite(axialForce) ||
    axialForce <= EPS ||
    !Number.isFinite(compressiveStrength) ||
    compressiveStrength <= EPS
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      0.0125 * (1 - axialForce / (compressiveStrength * thickness * length)),
      0.01,
    ),
  );
}

function buildPierContribution({
  alignment,
  pier,
  staticPier,
  topRotation,
  shearDriftCapacity = DEFAULT_DRIFT_SHEAR,
  warnings,
}) {
  if (!staticPier) {
    warnings.push(
      `Pier ${pier.id} was skipped in the seismic aggregation because no seismic axial-force state was available.`,
    );
    return null;
  }

  const length =
    Number.isFinite(pier.effectiveLength) && pier.effectiveLength > EPS
      ? pier.effectiveLength
      : pier.length;
  const height = pier.height;
  const mechanismHeight = topRotation === "fixed" ? height / 2 : height;
  const baseAxialForce = Math.max(0, staticPier.baseReaction ?? 0);
  const midHeightAxialForce = Math.max(
    0,
    (staticPier.axialForce ?? 0) + (staticPier.selfWeight ?? 0) / 2,
  );
  const compressiveStrength = resolveMasonryMaterialProperty({
    material: pier.material,
    aliases: ["fm"],
    targetUnits: alignment.units,
  });
  const bedJointCohesion = resolveMasonryMaterialProperty({
    material: pier.material,
    aliases: ["fv0"],
    targetUnits: alignment.units,
  });
  const shearStrength = resolveMasonryMaterialProperty({
    material: pier.material,
    aliases: ["tau0"],
    targetUnits: alignment.units,
  });
  const tensileStrength =
    Number.isFinite(shearStrength) && shearStrength > EPS
      ? 1.5 * shearStrength
      : null;
  const elasticModulus = resolveMasonryMaterialProperty({
    material: pier.material,
    aliases: ["E", "elasticModulus"],
    targetUnits: alignment.units,
  });
  const shearModulus = resolveMasonryMaterialProperty({
    material: pier.material,
    aliases: ["G", "shearModulus"],
    targetUnits: alignment.units,
  });

  if (!Number.isFinite(compressiveStrength) || compressiveStrength <= EPS) {
    warnings.push(
      `Pier ${pier.id} was skipped in the seismic aggregation because no finite masonry compressive strength fm could be resolved.`,
    );
    return null;
  }

  const flexural = resolveFlexuralCapacity({
    axialForce: baseAxialForce,
    compressiveStrength,
    thickness: pier.thickness,
    length,
    mechanismHeight,
  });
  const bedJointSliding = resolveBedJointSlidingCapacity({
    cohesion: bedJointCohesion,
    axialForce: midHeightAxialForce,
    thickness: pier.thickness,
    length,
    mechanismHeight,
  });
  const diagonalCracking = resolveDiagonalCrackingCapacity({
    tensileStrength,
    axialForce: midHeightAxialForce,
    thickness: pier.thickness,
    length,
    height,
  });
  const governingShearCapacity = minPositive([
    bedJointSliding.V,
    diagonalCracking.V,
  ]);
  const governingForce = minPositive([flexural.V, governingShearCapacity]);

  if (!Number.isFinite(governingForce) || governingForce <= EPS) {
    warnings.push(
      `Pier ${pier.id} produced no positive in-plane seismic resistance and was excluded from the aggregated capacity curve.`,
    );
    return null;
  }

  const governingFamily =
    Number.isFinite(flexural.V) &&
    flexural.V > EPS &&
    flexural.V <= (governingShearCapacity ?? Number.POSITIVE_INFINITY) + EPS
      ? "flexural"
      : "shear";
  const governingMode =
    governingFamily === "flexural"
      ? "rocking-toe-crushing"
      : bedJointSliding.V != null &&
          bedJointSliding.V <= (diagonalCracking.V ?? Number.POSITIVE_INFINITY) + EPS
        ? "bed-joint-sliding"
        : "diagonal-cracking";
  const driftCapacity =
    governingFamily === "flexural"
      ? resolveFlexuralDriftCapacity({
          axialForce: baseAxialForce,
          compressiveStrength,
          thickness: pier.thickness,
          length,
        })
      : shearDriftCapacity;

  if (!Number.isFinite(driftCapacity) || driftCapacity <= EPS) {
    warnings.push(
      `Pier ${pier.id} produced a non-positive drift capacity and was excluded from the aggregated capacity curve.`,
    );
    return null;
  }

  const ultimateDisplacement = driftCapacity * height;
  let stiffness = resolvePierElasticStiffness({
    pier,
    elasticModulus,
    shearModulus,
    topRotation,
    warnings,
  });

  if (!Number.isFinite(stiffness) || stiffness <= EPS) {
    const fallbackYieldDisplacement = Math.max(
      Math.min(0.2 * ultimateDisplacement, 0.001 * height),
      0.05 * ultimateDisplacement,
    );

    stiffness = governingForce / fallbackYieldDisplacement;
    warnings.push(
      `Pier ${pier.id} uses a fallback elastic stiffness because no finite E/G combination was available for the Timoshenko estimate.`,
    );
  }

  const maximumYieldDisplacement = 0.95 * ultimateDisplacement;
  let yieldDisplacement = governingForce / stiffness;

  if (yieldDisplacement >= maximumYieldDisplacement) {
    yieldDisplacement = maximumYieldDisplacement;
    stiffness = governingForce / yieldDisplacement;
    warnings.push(
      `Pier ${pier.id} reached a yield displacement beyond its drift capacity; the elastic branch was capped at 95% of du to keep a consistent first-release contribution curve.`,
    );
  }

  const curvePoints = [
    {
      id: `${pier.id}-origin`,
      displacement: 0,
      baseShear: 0,
    },
    {
      id: `${pier.id}-yield`,
      displacement: yieldDisplacement,
      baseShear: governingForce,
    },
    {
      id: `${pier.id}-ultimate`,
      displacement: ultimateDisplacement,
      baseShear: governingForce,
    },
    {
      id: `${pier.id}-failure`,
      displacement: postFailureDisplacement(ultimateDisplacement),
      baseShear: 0,
    },
  ];

  return {
    id: pier.id,
    contributorType: "pier",
    wallId: pier.wallId,
    topRotation,
    curvePoints,
    stiffness,
    yieldDisplacement,
    ultimateDisplacement,
    peakBaseShear: governingForce,
    governingFamily,
    governingMode,
    axialForces: {
      base: baseAxialForce,
      midHeight: midHeightAxialForce,
    },
    mechanics: {
      flexural: {
        V: flexural.V,
        MRd: flexural.MRd,
        compressionRatio: flexural.compressionRatio,
      },
      bedJointSliding: {
        V: bedJointSliding.V,
        compressedLength: bedJointSliding.compressedLength,
        eccentricity: bedJointSliding.eccentricity,
      },
      diagonalCracking: {
        V: diagonalCracking.V,
        aspectFactor: diagonalCracking.aspectFactor,
      },
    },
    driftCapacity,
  };
}

function resolveRingFrameCount(ringFrame) {
  const candidates = [
    ringFrame?.frameCount,
    ringFrame?.parallelFrameCount,
    ringFrame?.framesInThickness,
    ringFrame?.parallelFrames,
    ringFrame?.count,
  ];

  return Math.max(
    1,
    Math.round(
      candidates.find((value) => Number.isFinite(value) && value > 0) ?? 1,
    ),
  );
}

function resolveRingFrameSections(ringFrame = {}) {
  if (ringFrame.memberSections) {
    return ringFrame.memberSections;
  }

  const defaultProfile =
    ringFrame.profileName ??
    ringFrame.profile ??
    ringFrame.sectionProfileName ??
    ringFrame.columnProfileName ??
    ringFrame.topBeamProfileName ??
    null;
  const columns =
    ringFrame.columns ?? ringFrame.column ?? ringFrame.columnProfileName ?? defaultProfile;
  const topBeam =
    ringFrame.topBeam ??
    ringFrame.architrave ??
    ringFrame.topBeamProfileName ??
    defaultProfile;
  const bottomBeam =
    ringFrame.bottomBeam ??
    ringFrame.bottomChord ??
    ringFrame.bottomBeamProfileName ??
    topBeam;

  if (!columns || !topBeam) {
    return null;
  }

  return {
    leftColumn: ringFrame.leftColumn ?? columns,
    rightColumn: ringFrame.rightColumn ?? columns,
    topBeam,
    bottomBeam,
  };
}

function resolveRingFrameMemberOrientations(ringFrame = {}) {
  const orientations =
    ringFrame.memberOrientations ??
    ringFrame.memberOrientation ??
    ringFrame.sectionOrientations ??
    ringFrame.sectionOrientation ??
    ringFrame.orientations ??
    ringFrame.orientation ??
    {};

  if (typeof orientations === "string") {
    return { columns: orientations, topBeam: orientations, bottomBeam: orientations };
  }

  return {
    ...orientations,
    columns:
      orientations.columns ??
      orientations.column ??
      ringFrame.columnOrientation ??
      ringFrame.columnsOrientation,
    leftColumn:
      orientations.leftColumn ??
      orientations.leftPier ??
      ringFrame.leftColumnOrientation,
    rightColumn:
      orientations.rightColumn ??
      orientations.rightPier ??
      ringFrame.rightColumnOrientation,
    topBeam:
      orientations.topBeam ??
      orientations.architrave ??
      ringFrame.topBeamOrientation ??
      ringFrame.architraveOrientation,
    bottomBeam:
      orientations.bottomBeam ??
      orientations.bottomChord ??
      ringFrame.bottomBeamOrientation ??
      ringFrame.bottomChordOrientation,
  };
}

function buildRingFrameContribution({
  alignment,
  opening,
  warnings,
}) {
  const ringFrame = opening.ringFrame;

  if (!ringFrame) {
    return null;
  }

  const memberSections = resolveRingFrameSections(ringFrame);

  if (!memberSections) {
    warnings.push(
      `Opening ${opening.id} has a ringFrame definition but no member sections/profile names, so the steel pushover contribution was skipped.`,
    );
    return {
      id: `${alignment.id}-ring-frame-${opening.id}`,
      contributorType: "ring-frame",
      openingId: opening.id,
      status: "not-analyzed",
      frameCount: resolveRingFrameCount(ringFrame),
      curvePoints: [],
      analysisWarnings: [],
    };
  }

  const frameCount = resolveRingFrameCount(ringFrame);
  const maxControlDisplacement = Math.max(
    ringFrame.solver?.maxControlDisplacement ??
      ringFrame.solver?.maxDisplacement ??
      ringFrame.maxControlDisplacement ??
      DEFAULT_RING_FRAME_MAX_DISPLACEMENT,
    DEFAULT_RING_FRAME_MAX_DISPLACEMENT,
  );
  const controlDisplacementIncrement =
    ringFrame.solver?.controlDisplacementIncrement ??
    ringFrame.solver?.controlIncrement ??
    ringFrame.controlDisplacementIncrement ??
    ringFrame.controlIncrement ??
    maxControlDisplacement * DEFAULT_RING_FRAME_CONTROL_INCREMENT_RATIO;
  const toSteelUnits = createUnitResolver(
    alignment.units,
    STEEL_RING_FRAME_USER_UNITS,
  );
  const fromSteelUnits = createUnitResolver(
    STEEL_RING_FRAME_USER_UNITS,
    alignment.units,
  );

  try {
    const result = new SteelRingFramePushoverAnalysis().analyze({
      model: {
        id: `${alignment.id}-ring-frame-${opening.id}`,
        units: STEEL_RING_FRAME_USER_UNITS,
        geometry: {
          width: toSteelUnits.length(opening.width),
          height: toSteelUnits.length(opening.height),
        },
        memberSections,
        memberOrientations: resolveRingFrameMemberOrientations(ringFrame),
        material:
          ringFrame.material ??
          ringFrame.materialGrade ??
          ringFrame.grade ??
          "S275",
        baseCondition:
          ringFrame.baseCondition ??
          (ringFrame.includeBottomBeam ? "pinned-base-with-bottom-beam" : "fixed-base"),
        includeBottomBeam: ringFrame.includeBottomBeam,
        loading: {
          controlNode: ringFrame.controlNode ?? "top-left",
          referenceHorizontalForce: toSteelUnits.force(
            ringFrame.referenceHorizontalForce ??
              ringFrame.horizontalForce ??
              ringFrame.Fh ??
              1000,
          ),
        },
        solver: {
          controlDisplacementIncrement:
            toSteelUnits.length(controlDisplacementIncrement),
          maxControlDisplacement:
            toSteelUnits.length(maxControlDisplacement),
          tolerance: ringFrame.solver?.tolerance ?? 1e-6,
          maxIterations:
            ringFrame.solver?.maxIterations ?? DEFAULT_RING_FRAME_MAX_ITERATIONS,
          maxSteps: ringFrame.solver?.maxSteps ?? DEFAULT_RING_FRAME_MAX_STEPS,
          yieldTolerance: ringFrame.solver?.yieldTolerance ?? 1e-9,
        },
      },
    });
    const curvePoints = result.outputs.capacityCurve.points.map((point, index) => ({
      id: `${alignment.id}-ring-frame-${opening.id}-point-${index + 1}`,
      displacement: fromSteelUnits.length(point.controlDisplacement),
      baseShear: fromSteelUnits.force(point.baseShear) * frameCount,
    }));

    if (frameCount > 1) {
      warnings.push(
        `Opening ${opening.id} scales the steel ring-frame contribution by ${frameCount} because multiple identical parallel frames were declared through the ringFrame count.`,
      );
    }

    return {
      id: `${alignment.id}-ring-frame-${opening.id}`,
      contributorType: "ring-frame",
      openingId: opening.id,
      status: result.status,
      frameCount,
      curvePoints,
      maxBaseShear:
        maxFinite(curvePoints.map((point) => point.baseShear)) ?? 0,
      ultimateDisplacement: curvePoints.at(-1)?.displacement ?? 0,
      analysisWarnings: result.warnings,
      assumptions: result.assumptions,
      metadata: {
        analysisType: result.metadata?.analysisType ?? "steel-ring-frame-pushover",
        baseCondition: result.metadata?.baseCondition ?? null,
        includeBottomBeam: result.metadata?.includeBottomBeam ?? null,
        memberOrientations:
          result.metadata?.memberOrientations ??
          result.outputs?.frameIdealization?.metadata?.memberOrientations ??
          null,
      },
    };
  } catch (error) {
    warnings.push(
      `Opening ${opening.id} could not build the steel ring-frame pushover contribution: ${error.message}`,
    );

    return {
      id: `${alignment.id}-ring-frame-${opening.id}`,
      contributorType: "ring-frame",
      openingId: opening.id,
      status: "not-analyzed",
      frameCount,
      curvePoints: [],
      analysisWarnings: [error.message],
      assumptions: [],
      metadata: {},
    };
  }
}

function buildAggregateCapacityCurve(contributors = []) {
  const displacements = [
    ...new Set(
      contributors.flatMap((contributor) =>
        contributor.curvePoints.map((point) => point.displacement),
      ),
    ),
  ]
    .filter(Number.isFinite)
    .sort((left, right) => left - right);

  return displacements.map((displacement, index) => ({
    id: `global-point-${index + 1}`,
    displacement,
    baseShear: contributors.reduce(
      (sum, contributor) =>
        sum + interpolateCurve(contributor.curvePoints, displacement),
      0,
    ),
  }));
}

export class AlignmentSeismicAggregatedAnalysis {
  analyze({
    alignment,
    stage = "design",
    options = {},
    sanitizedOpenings = null,
    extractedMembers = null,
    staticResult = null,
    resolvedAlignmentState = null,
  } = {}) {
    if (!alignment) {
      throw new Error(
        "AlignmentSeismicAggregatedAnalysis requires an alignment model.",
      );
    }

    const warnings = [];
    const assumptions = [
      "The first seismic release follows the official minimum method described in todo.md: the global capacity curve is the sum of the individual pier and ring-frame contributions at a common top-displacement axis.",
      "Pier axial forces are taken from the static vertical analysis in seismic combination: base reaction for flexural capacity and drift, mid-height compression for shear capacity.",
      "Each masonry pier is represented by an elastic-perfectly-plastic contribution up to its drift-based ultimate displacement, followed by a drop to zero resistance.",
    ];
    const topRotation = normalizeTopRotation(
      options.topRotation ?? DEFAULT_TOP_ROTATION,
    );
    const shearDriftCapacity = Number.isFinite(options.shearDriftCapacity)
      && options.shearDriftCapacity > EPS
      ? options.shearDriftCapacity
      : DEFAULT_DRIFT_SHEAR;
    const mechanicalState =
      resolvedAlignmentState ??
      resolveAlignmentMechanicalState({
        alignment,
        stage,
        options: options.materialResolution ?? options,
      });
    const resolvedAlignment = mechanicalState.alignment;
    const includeSpandrels = Boolean(options.includeSpandrels);

    if (includeSpandrels) {
      warnings.push(
        "Explicit spandrel contributions are not yet modeled in the aggregated seismic analysis; the first release still uses the selected topRotation boundary condition on piers.",
      );
    }

    const resolvedSanitizedOpenings =
      sanitizedOpenings ??
      sanitizeAlignmentOpenings({ alignment: resolvedAlignment }).openings;
    const extracted = extractEquivalentFrameMembers({
      alignment: resolvedAlignment,
      sanitizedOpenings: resolvedSanitizedOpenings,
    });
    const seismicStaticResult =
      staticResult ??
      new AlignmentStaticAnalysis().analyze({
        alignment: resolvedAlignment,
        stage,
        options: {
          ...(options.staticOptions ?? {}),
          combinationType:
            options.verticalCombinationType ?? "SEISMIC",
        },
        sanitizedOpenings: resolvedSanitizedOpenings,
        extractedMembers: extracted,
        resolvedAlignmentState: mechanicalState,
      });
    const staticPiersById = Object.fromEntries(
      (seismicStaticResult.outputs?.piers ?? []).map((pier) => [pier.id, pier]),
    );
    const pierContributions = extracted.piers
      .map((pier) =>
        buildPierContribution({
          alignment: resolvedAlignment,
          pier,
          staticPier: staticPiersById[pier.id],
          topRotation,
          shearDriftCapacity,
          warnings,
        }),
      )
      .filter(Boolean);
    const ringFrameContributions = resolvedSanitizedOpenings
      .filter((opening) => opening.ringFrame)
      .map((opening) =>
        buildRingFrameContribution({
          alignment: resolvedAlignment,
          opening,
          warnings,
        }),
      );
    const activeContributors = [
      ...pierContributions,
      ...ringFrameContributions.filter(
        (contributor) => contributor.curvePoints.length > 1,
      ),
    ];

    if (activeContributors.length === 0) {
      return new CalculationResult({
        applicationId: "masonry-wall-openings",
        status: "not-verified",
        summary:
          "Aggregated seismic analysis could not build any active masonry-pier or steel-ring-frame contribution.",
        outputs: {
          stage,
          topRotation,
          includeSpandrels,
          capacityCurve: {
            units: {
              displacement: resolvedAlignment.units.length,
              baseShear: resolvedAlignment.units.force,
            },
            points: [],
            maxBaseShear: 0,
            ultimateDisplacement: 0,
          },
        },
        warnings: uniqueStrings([
          ...warnings,
          ...mechanicalState.warnings,
          ...(seismicStaticResult.warnings ?? []),
        ]),
        assumptions: uniqueStrings([
          ...assumptions,
          ...mechanicalState.assumptions,
          ...(seismicStaticResult.assumptions ?? []),
          ...extracted.assumptions,
        ]),
        metadata: {
          stage,
          topRotation,
          mechanicalState: mechanicalState.metadata,
          contributorCount: 0,
        },
      });
    }

    const capacityCurvePoints = buildAggregateCapacityCurve(activeContributors);
    const bilinearization = bilinearizeCapacityCurve({
      points: capacityCurvePoints,
      options: {
        dropRatio: options.capacityDropRatio,
      },
    });
    const maxBaseShear =
      maxFinite(capacityCurvePoints.map((point) => point.baseShear)) ?? 0;
    const status = bilinearization.status === "ok" ? "ok" : "not-verified";

    return new CalculationResult({
      applicationId: "masonry-wall-openings",
      status,
      summary:
        "Aggregated seismic capacity analysis of the masonry wall alignment completed by summing the individual pier contributions and the available steel ring-frame pushover curves.",
      outputs: {
        stage,
        topRotation,
        includeSpandrels,
        verticalCombinationType:
          seismicStaticResult.outputs?.combinationType ?? "SEISMIC",
        capacityCurve: {
          units: {
            displacement: resolvedAlignment.units.length,
            baseShear: resolvedAlignment.units.force,
          },
          points: roundCurvePoints(capacityCurvePoints),
          maxBaseShear: round(maxBaseShear),
          ultimateDisplacement: round(bilinearization.du),
        },
        bilinearization: {
          status: bilinearization.status,
          ks: round(bilinearization.ks),
          Vy: round(bilinearization.Vy),
          du: round(bilinearization.du),
          yieldDisplacement: round(bilinearization.yieldDisplacement),
          actualEnergy: round(bilinearization.actualEnergy),
          bilinearEnergy: round(bilinearization.bilinearEnergy),
          peakPoint: bilinearization.peakPoint
            ? {
                displacement: round(bilinearization.peakPoint.displacement),
                baseShear: round(bilinearization.peakPoint.baseShear),
              }
            : null,
          secantPoint: bilinearization.secantPoint
            ? {
                displacement: round(bilinearization.secantPoint.displacement),
                baseShear: round(bilinearization.secantPoint.baseShear),
              }
            : null,
          ultimatePoint: bilinearization.ultimatePoint
            ? {
                displacement: round(bilinearization.ultimatePoint.displacement),
                baseShear: round(bilinearization.ultimatePoint.baseShear),
              }
            : null,
        },
        piers: pierContributions.map((contributor) => ({
          id: contributor.id,
          wallId: contributor.wallId,
          topRotation: contributor.topRotation,
          stiffness: round(contributor.stiffness),
          yieldDisplacement: round(contributor.yieldDisplacement),
          ultimateDisplacement: round(contributor.ultimateDisplacement),
          peakBaseShear: round(contributor.peakBaseShear),
          governingFamily: contributor.governingFamily,
          governingMode: contributor.governingMode,
          driftCapacity: round(contributor.driftCapacity),
          axialForces: {
            base: round(contributor.axialForces.base),
            midHeight: round(contributor.axialForces.midHeight),
          },
          mechanics: {
            flexural: {
              V: round(contributor.mechanics.flexural.V),
              MRd: round(contributor.mechanics.flexural.MRd),
              compressionRatio: round(
                contributor.mechanics.flexural.compressionRatio,
              ),
            },
            bedJointSliding: {
              V: round(contributor.mechanics.bedJointSliding.V),
              compressedLength: round(
                contributor.mechanics.bedJointSliding.compressedLength,
              ),
              eccentricity: round(
                contributor.mechanics.bedJointSliding.eccentricity,
              ),
            },
            diagonalCracking: {
              V: round(contributor.mechanics.diagonalCracking.V),
              aspectFactor: round(
                contributor.mechanics.diagonalCracking.aspectFactor,
              ),
            },
          },
          curvePoints: roundCurvePoints(contributor.curvePoints),
        })),
        ringFrames: ringFrameContributions.map((contributor) => ({
          id: contributor.id,
          openingId: contributor.openingId,
          status: contributor.status,
          frameCount: contributor.frameCount,
          maxBaseShear: round(contributor.maxBaseShear),
          ultimateDisplacement: round(contributor.ultimateDisplacement),
          metadata: contributor.metadata,
          curvePoints: roundCurvePoints(contributor.curvePoints),
        })),
        staticReference: {
          combinationType:
            seismicStaticResult.outputs?.combinationType ?? "SEISMIC",
          piers: (seismicStaticResult.outputs?.piers ?? []).map((pier) => ({
            id: pier.id,
            axialForce: round(pier.axialForce),
            selfWeight: round(pier.selfWeight),
            baseReaction: round(pier.baseReaction),
          })),
        },
      },
      warnings: uniqueStrings([
        ...warnings,
        ...mechanicalState.warnings,
        ...(seismicStaticResult.warnings ?? []),
        ...ringFrameContributions.flatMap(
          (contributor) => contributor.analysisWarnings ?? [],
        ),
        ...bilinearization.warnings,
      ]),
      assumptions: uniqueStrings([
        ...assumptions,
        ...mechanicalState.assumptions,
        ...(seismicStaticResult.assumptions ?? []),
        ...extracted.assumptions,
        ...ringFrameContributions.flatMap(
          (contributor) => contributor.assumptions ?? [],
        ),
      ]),
      metadata: {
        stage,
        topRotation,
        mechanicalState: mechanicalState.metadata,
        contributorCount: activeContributors.length,
        pierCount: pierContributions.length,
        ringFrameCount: ringFrameContributions.filter(
          (contributor) => contributor.curvePoints.length > 1,
        ).length,
        spandrelCount: extracted.spandrels.length,
        capacityPointCount: capacityCurvePoints.length,
      },
    });
  }
}
