import {
  CyclicMasonryCompressionMaterial,
  CyclicMasonryPier2D,
  CyclicMasonryPierAnalysis2D,
  cyclicMasonryPierHistoryToCsv,
  CyclicMasonryShearMaterial,
  Node,
  SlidingStrengthModel,
  TurnsekSheppardModel,
} from "../src/index.js";

const UNITS = Object.freeze({ force: "kN", length: "m" });

function symmetricProtocol(amplitudes, maximumIncrement = 0.0001) {
  const points = [0];

  function appendRamp(target) {
    const start = points.at(-1);
    const increments = Math.max(
      1,
      Math.ceil(Math.abs(target - start) / maximumIncrement),
    );

    for (let index = 1; index <= increments; index += 1) {
      points.push(start + ((target - start) * index) / increments);
    }
  }

  for (const amplitude of amplitudes) {
    appendRamp(amplitude);
    appendRamp(0);
    appendRamp(-amplitude);
    appendRamp(0);
  }

  return points;
}

export function createCyclicMasonryValidationPier(
  definition,
  fiberCount = definition.fiberCount ?? 24,
) {
  const geometry = definition.geometry;
  const compression = definition.compression;
  const shear = definition.shear;
  const nodeI = new Node({ id: `${definition.id}-base`, x: 0, y: 0, units: UNITS });
  const nodeJ = new Node({
    id: `${definition.id}-top`,
    x: 0,
    y: geometry.height,
    units: UNITS,
  });
  const compressionMaterial = new CyclicMasonryCompressionMaterial({
    units: UNITS,
    elasticModulus: definition.elasticModulus,
    compressiveStrength: compression.compressiveStrength,
    peakStrain: compression.peakStrain,
    prePeakCurve: "linear",
    damageOnsetStrain: compression.damageOnsetStrain,
    ultimateStrain: compression.ultimateStrain,
    residualStrengthRatio: compression.residualStrengthRatio,
    unloadingStiffnessDegradation:
      compression.unloadingStiffnessDegradation,
    strengthDegradation: compression.strengthDegradation,
    energyDamageCoefficient: compression.energyDamageCoefficient,
    hingeLength: geometry.hingeLength,
    numericalTangentRatio: 1e-8,
    metadata: { parameterStatus: "validation-calibration" },
  });
  const shearMaterial = new CyclicMasonryShearMaterial({
    units: UNITS,
    shearModulus: definition.shearModulus,
    diagonalTensionModel: new TurnsekSheppardModel({
      units: UNITS,
      tensileStrength: shear.diagonalTensileStrength,
      shearStressDistributionFactor: shear.distributionFactor,
      damageCoefficient: shear.diagonalDamageCoefficient,
      crushingReductionCoefficient: shear.crushingReductionCoefficient,
    }),
    slidingModel: new SlidingStrengthModel({
      units: UNITS,
      cohesion: shear.cohesion,
      frictionCoefficient: shear.frictionCoefficient,
      residualCohesionRatio: shear.residualCohesionRatio,
      cohesionDamageCoefficient: shear.cohesionDamageCoefficient,
      frictionDamageCoefficient: shear.frictionDamageCoefficient,
    }),
    peakShearStrain: shear.peakShearStrain,
    ultimateShearStrain: shear.ultimateShearStrain,
    hardeningRatio: shear.hardeningRatio,
    residualStrengthRatio: shear.residualStrengthRatio,
    residualStrengthMode: shear.residualStrengthMode ?? "ratio",
    pinching: shear.pinching,
    stiffnessDegradation: shear.stiffnessDegradation,
    strengthDegradation: shear.strengthDegradation,
    numericalTangentRatio: 1e-8,
    metadata: { parameterStatus: "validation-calibration" },
  });

  return new CyclicMasonryPier2D({
    id: definition.id,
    nodeI,
    nodeJ,
    units: UNITS,
    height: geometry.height,
    width: geometry.width,
    thickness: geometry.thickness,
    hingeLength: geometry.hingeLength,
    deformableHeight: geometry.deformableHeight ?? geometry.height,
    elasticCoreHeight: geometry.elasticCoreHeight ?? geometry.height,
    elasticModulus: definition.elasticModulus,
    shearModulus: definition.shearModulus,
    effectiveShearAreaFactor: geometry.effectiveShearAreaFactor,
    fiberCount,
    compressionMaterial,
    shearMaterial,
    coupling: definition.coupling,
    localTolerance: definition.localTolerance ?? 1e-7,
    maxLocalIterations: 60,
    metadata: {
      purpose: "qualitative-validation-benchmark",
      parametersAreNormativeDefaults: false,
    },
  });
}

const COMMON = Object.freeze({
  geometry: Object.freeze({
    height: 2.5,
    width: 1,
    thickness: 0.25,
    hingeLength: 0.1,
    effectiveShearAreaFactor: 1,
  }),
  elasticModulus: 2e6,
  shearModulus: 8e5,
});

const DEFINITIONS = Object.freeze([
  {
    id: "A-rocking-low-compression",
    title: "Rocking at low compression",
    ...COMMON,
    axialCompression: 40,
    protocol: symmetricProtocol([0.006]),
    compression: {
      compressiveStrength: 4000,
      peakStrain: 0.002,
      damageOnsetStrain: 0.003,
      ultimateStrain: 0.012,
      residualStrengthRatio: 0.2,
      unloadingStiffnessDegradation: 0.2,
      strengthDegradation: 0.15,
      energyDamageCoefficient: 0,
    },
    shear: {
      diagonalTensileStrength: 220,
      distributionFactor: 1.2,
      diagonalDamageCoefficient: 0.7,
      crushingReductionCoefficient: 0.5,
      cohesion: 180,
      frictionCoefficient: 0.5,
      residualCohesionRatio: 0.2,
      cohesionDamageCoefficient: 1,
      frictionDamageCoefficient: 0,
      peakShearStrain: 0.006,
      ultimateShearStrain: 0.02,
      hardeningRatio: 0,
      residualStrengthRatio: 0.3,
      pinching: { enabled: true, factor: 0.55, recoveryRatio: 0.8 },
      stiffnessDegradation: { enabled: true, ductilityCoefficient: 0.05 },
      strengthDegradation: { enabled: true, ductilityCoefficient: 0.03 },
    },
    coupling: {
      useCurrentAxialForce: true,
      useCompressedLength: true,
      crushingShearReduction: true,
    },
  },
  {
    id: "B-mixed-intermediate-compression",
    title: "Mixed flexure-shear at intermediate compression",
    ...COMMON,
    axialCompression: 250,
    protocol: symmetricProtocol([0.004]),
    compression: {
      compressiveStrength: 4000,
      peakStrain: 0.002,
      damageOnsetStrain: 0.0025,
      ultimateStrain: 0.01,
      residualStrengthRatio: 0.2,
      unloadingStiffnessDegradation: 0.3,
      strengthDegradation: 0.2,
      energyDamageCoefficient: 0.02,
    },
    shear: {
      diagonalTensileStrength: 20,
      distributionFactor: 1.2,
      diagonalDamageCoefficient: 0.8,
      crushingReductionCoefficient: 0.5,
      cohesion: 100,
      frictionCoefficient: 0.35,
      residualCohesionRatio: 0.15,
      cohesionDamageCoefficient: 1,
      frictionDamageCoefficient: 0,
      peakShearStrain: 0.003,
      ultimateShearStrain: 0.012,
      hardeningRatio: 0.03,
      residualStrengthRatio: 0.25,
      pinching: { enabled: true, factor: 0.4, recoveryRatio: 0.75 },
      stiffnessDegradation: {
        enabled: true,
        ductilityCoefficient: 0.25,
        energyCoefficient: 0.04,
      },
      strengthDegradation: {
        enabled: true,
        ductilityCoefficient: 0.18,
        energyCoefficient: 0.03,
      },
    },
    coupling: {
      useCurrentAxialForce: true,
      useCompressedLength: true,
      crushingShearReduction: true,
    },
  },
  {
    id: "C-crushing-high-compression",
    title: "Alternating toe crushing at high compression",
    ...COMMON,
    axialCompression: 600,
    protocol: symmetricProtocol([0.005]),
    compression: {
      compressiveStrength: 4000,
      peakStrain: 0.002,
      damageOnsetStrain: 0.002,
      ultimateStrain: 0.008,
      residualStrengthRatio: 0.2,
      unloadingStiffnessDegradation: 0.55,
      strengthDegradation: 0.45,
      energyDamageCoefficient: 0.04,
    },
    shear: {
      diagonalTensileStrength: 150,
      distributionFactor: 1.2,
      diagonalDamageCoefficient: 0.8,
      crushingReductionCoefficient: 0.8,
      cohesion: 150,
      frictionCoefficient: 0.45,
      residualCohesionRatio: 0.2,
      cohesionDamageCoefficient: 1,
      frictionDamageCoefficient: 0,
      peakShearStrain: 0.004,
      ultimateShearStrain: 0.014,
      hardeningRatio: 0,
      residualStrengthRatio: 0.3,
      pinching: { enabled: true, factor: 0.4, recoveryRatio: 0.8 },
      stiffnessDegradation: { enabled: true, ductilityCoefficient: 0.15 },
      strengthDegradation: { enabled: true, ductilityCoefficient: 0.1 },
    },
    coupling: {
      useCurrentAxialForce: true,
      useCompressedLength: true,
      crushingShearReduction: true,
    },
  },
  {
    id: "D-sliding-low-cohesion",
    title: "Bed-joint sliding with low cohesion",
    ...COMMON,
    axialCompression: 100,
    protocol: symmetricProtocol([0.003]),
    compression: {
      compressiveStrength: 4000,
      peakStrain: 0.002,
      damageOnsetStrain: 0.003,
      ultimateStrain: 0.012,
      residualStrengthRatio: 0.2,
      unloadingStiffnessDegradation: 0.2,
      strengthDegradation: 0.1,
      energyDamageCoefficient: 0,
    },
    shear: {
      diagonalTensileStrength: 180,
      distributionFactor: 1.2,
      diagonalDamageCoefficient: 0.8,
      crushingReductionCoefficient: 0.4,
      cohesion: 2,
      frictionCoefficient: 0.08,
      residualCohesionRatio: 0,
      cohesionDamageCoefficient: 1,
      frictionDamageCoefficient: 0,
      peakShearStrain: 0.0025,
      ultimateShearStrain: 0.012,
      hardeningRatio: 0,
      residualStrengthRatio: 0.3,
      pinching: { enabled: true, factor: 0.25, recoveryRatio: 0.7 },
      stiffnessDegradation: { enabled: true, ductilityCoefficient: 0.3 },
      strengthDegradation: { enabled: true, ductilityCoefficient: 0.2 },
    },
    coupling: {
      useCurrentAxialForce: true,
      useCompressedLength: true,
      crushingShearReduction: true,
    },
  },
]);

function summarize(definition, analysis) {
  const points = analysis.points;
  const peakForce = Math.max(...points.map((point) => Math.abs(point.lateralForce)));
  const peakDamage = Math.max(...points.map((point) => point.compressionDamage));
  const peakShearDamage = Math.max(...points.map((point) => point.shearDamage));
  const minimumCompressedLength = Math.min(
    ...points.map((point) => point.compressedLength),
  );
  const final = points.at(-1);
  const activated = new Set(points.flatMap((point) => point.mechanismsActivated));

  return {
    id: definition.id,
    title: definition.title,
    status: analysis.status,
    axialCompression: definition.axialCompression,
    peakAbsoluteLateralForce: peakForce,
    minimumCompressedLength,
    peakCompressionDamage: peakDamage,
    peakShearDamage,
    finalResidualShearDeformation: final?.shearDeformation ?? 0,
    finalEnergyDissipated: final?.energyDissipated ?? 0,
    mechanismsActivated: [...activated],
    points,
    warnings: [...analysis.warnings],
  };
}

export function runCyclicMasonryPierBenchmark(definition, { fiberCount } = {}) {
  const pier = createCyclicMasonryValidationPier(definition, fiberCount);
  const analysis = new CyclicMasonryPierAnalysis2D().solve({
    element: pier,
    axialCompression: definition.axialCompression,
    lateralDisplacements: definition.protocol,
    tolerance: definition.analysisTolerance ?? 2e-6,
    maxIterations: 50,
  });

  return summarize(definition, analysis);
}

export function runCyclicMasonryPierValidationCampaign() {
  const results = DEFINITIONS.map((definition) =>
    runCyclicMasonryPierBenchmark(definition),
  );

  return {
    id: "cyclic-masonry-pier-validation-campaign-v1",
    status: results.every((result) => result.status === "ok")
      ? "ok"
      : "failed",
    parameterStatus: "illustrative-validation-calibration-not-normative",
    units: UNITS,
    caseCount: results.length,
    results,
  };
}

export function cyclicMasonryBenchmarkPointsToCsv(result) {
  return cyclicMasonryPierHistoryToCsv(result.points);
}

export function cyclicMasonryPierBenchmarkDefinitions() {
  return DEFINITIONS.map((definition) => ({
    ...definition,
    geometry: { ...definition.geometry },
    compression: { ...definition.compression },
    shear: { ...definition.shear },
    coupling: { ...definition.coupling },
    protocol: [...definition.protocol],
  }));
}

export function formatCyclicMasonryPierValidationReport(campaign) {
  const lines = [
    "# Cyclic masonry pier validation campaign",
    "",
    `Status: ${campaign.status}`,
    `Cases: ${campaign.caseCount}`,
    `Parameters: ${campaign.parameterStatus}`,
    "",
  ];

  for (const result of campaign.results) {
    lines.push(
      `- ${result.id}: ${result.status}; peak |V|=${result.peakAbsoluteLateralForce.toFixed(3)} kN; mechanisms=${result.mechanismsActivated.join("+") || "none"}`,
    );
  }

  return lines.join("\n");
}
