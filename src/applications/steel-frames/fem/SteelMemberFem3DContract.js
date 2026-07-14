const LIMIT_STATES = new Set(["ULS", "SLS", "SLU", "SLE"]);

const finiteOrNull = (value) => (Number.isFinite(value) ? value : null);

function firstFinite(...values) {
  return values.find((value) => Number.isFinite(value)) ?? null;
}

function normalizeLimitState(value) {
  const normalized = String(value ?? "").trim().toUpperCase();

  if (normalized === "ULS") return "SLU";
  if (normalized === "SLS") return "SLE";
  return normalized;
}

function entries(value) {
  return Array.isArray(value) ? value : Object.values(value ?? {});
}

function normalizeStation(sample = {}, index = 0) {
  const principal = sample.principalActions ?? {};
  const coordinates = sample.coordinates ?? sample.coordinate ?? {};
  const displacements = sample.displacements ?? {};
  const rotations = sample.rotations ?? {};
  const station = firstFinite(sample.station, sample.position, sample.s, sample.x);

  return {
    id: sample.id ?? `station-${index + 1}`,
    station,
    coordinates: {
      x: firstFinite(coordinates.x, sample.coordinateX, station),
      y: firstFinite(coordinates.y, sample.coordinateY),
      z: firstFinite(coordinates.z, sample.coordinateZ),
    },
    actions: {
      N: firstFinite(sample.N, sample.n),
      Vy: firstFinite(sample.Vy, sample.vY, principal.vY, sample.v),
      Vz: firstFinite(sample.Vz, sample.vZ, principal.vZ),
      My: firstFinite(sample.My, sample.mY, principal.mY, sample.m),
      Mz: firstFinite(sample.Mz, sample.mZ, principal.mZ),
      T: firstFinite(sample.T, sample.t, sample.torsion),
      B: firstFinite(sample.B, sample.bimoment, sample.warpingBimoment),
    },
    displacements: {
      u: firstFinite(sample.u, sample.ux, displacements.u, displacements.ux),
      v: firstFinite(
        sample.vDisplacement,
        sample.uy,
        displacements.v,
        displacements.uy,
        Number.isFinite(sample.Vy) ? sample.v : null,
      ),
      w: firstFinite(sample.w, sample.uz, displacements.w, displacements.uz),
    },
    rotations: {
      x: firstFinite(sample.rotationX, sample.rx, rotations.x, rotations.rx),
      y: firstFinite(sample.rotationY, sample.ry, rotations.y, rotations.ry),
      z: firstFinite(sample.rotationZ, sample.rz, rotations.z, rotations.rz),
    },
    momentDiagram: sample.momentDiagram ? { ...sample.momentDiagram } : null,
    metadata: { ...(sample.metadata ?? {}) },
  };
}

function normalizeCombination(result = {}, index = 0) {
  const context = result.context ?? {};
  const rawStations =
    result.stations ?? result.stationResults ?? result.internalForces?.samples ?? [];
  const limitState = normalizeLimitState(
    result.limitState ?? result.type ?? context.limitState,
  );

  return {
    id: String(result.combinationId ?? result.id ?? context.combinationId ?? `combination-${index + 1}`),
    limitState,
    combinationType:
      result.combinationType ?? context.combinationType ?? null,
    stations: entries(rawStations).map(normalizeStation),
    momentDiagram: result.momentDiagram ? { ...result.momentDiagram } : null,
    metadata: { ...(result.metadata ?? {}) },
  };
}

function normalizeEnd(raw = {}, id) {
  const coordinates = raw.coordinates ?? raw.coordinate ?? raw;

  return {
    id: raw.id ?? id,
    coordinates: {
      x: finiteOrNull(coordinates.x),
      y: finiteOrNull(coordinates.y),
      z: finiteOrNull(coordinates.z),
    },
    restraints: {
      ux: Boolean(raw.restraints?.ux),
      uy: Boolean(raw.restraints?.uy),
      uz: Boolean(raw.restraints?.uz),
      rx: Boolean(raw.restraints?.rx),
      ry: Boolean(raw.restraints?.ry),
      rz: Boolean(raw.restraints?.rz),
      warping: Boolean(raw.restraints?.warping),
    },
    metadata: { ...(raw.metadata ?? {}) },
  };
}

function normalizeMember(source = {}, analysisResult = {}) {
  const geometry = analysisResult.geometry ?? {};
  const rawSupports = analysisResult.supports ?? [];
  const startSupport = rawSupports.find((support) => support.station === 0) ?? {};
  const length = firstFinite(source.length, geometry.length, geometry.horizontalSpan);
  const endSupport = rawSupports.find((support) => support.station === length) ?? {};
  const ends = source.ends ?? {};
  const stability = source.stability ?? analysisResult.stability ?? {};

  return {
    id: source.id ?? analysisResult.memberId ?? analysisResult.id ?? null,
    length,
    ends: {
      start: normalizeEnd(ends.start ?? source.start ?? geometry.start ?? startSupport, "start"),
      end: normalizeEnd(ends.end ?? source.end ?? geometry.end ?? endSupport, "end"),
    },
    frameClassification: {
      sway: stability.sway ?? source.sway ?? null,
      nonSway: stability.nonSway ?? source.nonSway ?? null,
    },
    effectiveLengths: {
      y: finiteOrNull(stability.effectiveLengthY ?? stability.LcrY),
      z: finiteOrNull(stability.effectiveLengthZ ?? stability.LcrZ),
      torsional: finiteOrNull(stability.effectiveLengthTorsional ?? stability.LcrT),
    },
    effectiveLengthFactors: {
      y: finiteOrNull(stability.effectiveLengthFactorY ?? stability.kY),
      z: finiteOrNull(stability.effectiveLengthFactorZ ?? stability.kZ),
      torsional: finiteOrNull(stability.effectiveLengthFactorTorsional ?? stability.kT),
    },
    restraintSegments: entries(
      source.restraintSegments ?? stability.restraintSegments ?? stability.segments,
    ).map((segment, index) => ({
      id: segment.id ?? `restraint-segment-${index + 1}`,
      from: finiteOrNull(segment.from ?? segment.start),
      to: finiteOrNull(segment.to ?? segment.end),
      lateral: segment.lateral ?? segment.laterallyRestrained ?? null,
      torsional: segment.torsional ?? segment.torsionallyRestrained ?? null,
      warping: segment.warping ?? segment.warpingRestrained ?? null,
      momentDiagram: segment.momentDiagram ? { ...segment.momentDiagram } : null,
      metadata: { ...(segment.metadata ?? {}) },
    })),
    webPanels: entries(source.webPanels ?? analysisResult.webPanels).map((panel, index) => ({
      id: panel.id ?? `web-panel-${index + 1}`,
      from: finiteOrNull(panel.from ?? panel.start),
      to: finiteOrNull(panel.to ?? panel.end),
      length: firstFinite(panel.length, Number.isFinite(panel.to) && Number.isFinite(panel.from) ? panel.to - panel.from : null),
      endPost: panel.endPost ?? "non-rigid",
      stiffeners: entries(panel.stiffeners).map((stiffener) => ({ ...stiffener })),
      metadata: { ...(panel.metadata ?? {}) },
    })),
    stiffeners: entries(source.stiffeners ?? analysisResult.stiffeners).map((item) => ({ ...item })),
    concentratedLoads: entries(
      source.concentratedLoads ?? analysisResult.concentratedLoads,
    ).map((load, index) => ({
      id: load.id ?? `concentrated-load-${index + 1}`,
      combinationId: load.combinationId ?? null,
      station: firstFinite(load.station, load.position, load.x),
      force: firstFinite(load.force, load.FEd, load.value),
      bearingLength: firstFinite(load.bearingLength, load.ss),
      loadType: load.loadType ?? load.type ?? "internal",
      metadata: { ...(load.metadata ?? {}) },
    })),
    metadata: { ...(source.metadata ?? {}) },
  };
}

export function validateSteelMemberFem3DResult(analysisResult, { strict = false } = {}) {
  const errors = [];
  const warnings = [];
  const source = analysisResult?.fem3d ?? analysisResult ?? {};
  const rawCombinations = source.combinations ?? analysisResult?.combinations;
  const combinations = entries(rawCombinations).map(normalizeCombination);
  const member = normalizeMember(source.member ?? {}, analysisResult ?? {});

  if (!analysisResult || typeof analysisResult !== "object") {
    errors.push("analysisResult must be an object.");
  }
  if (!analysisResult?.units) errors.push("analysisResult.units is required.");
  if (combinations.length === 0) errors.push("At least one FEM combination is required.");
  if (strict) {
    if (!Number.isFinite(member.length) || member.length <= 0) {
      errors.push("member.length must be a positive number.");
    }
    for (const endId of ["start", "end"]) {
      for (const coordinate of ["x", "y", "z"]) {
        if (!Number.isFinite(member.ends[endId].coordinates[coordinate])) {
          errors.push(`member.ends.${endId}.coordinates.${coordinate} is required.`);
        }
      }
    }
    if (typeof member.frameClassification.sway !== "boolean" &&
        typeof member.frameClassification.nonSway !== "boolean") {
      errors.push("member frame classification requires sway or nonSway.");
    }
    for (const axis of ["y", "z"]) {
      if (!Number.isFinite(member.effectiveLengths[axis]) &&
          !Number.isFinite(member.effectiveLengthFactors[axis])) {
        errors.push(`member requires effective length or effective-length factor about ${axis}.`);
      }
    }
  }

  combinations.forEach((combination) => {
    if (!LIMIT_STATES.has(combination.limitState)) {
      errors.push(`Combination ${combination.id} requires limitState SLU/ULS or SLE/SLS.`);
    }
    if (combination.stations.length === 0) {
      errors.push(`Combination ${combination.id} requires at least one station.`);
    }
    combination.stations.forEach((station) => {
      if (!Number.isFinite(station.station)) {
        errors.push(`Combination ${combination.id}, ${station.id}: station is required.`);
      }
      for (const action of ["N", "Vy", "Vz", "My", "Mz", "T", "B"]) {
        if (!Number.isFinite(station.actions[action])) {
          const message = `Combination ${combination.id}, ${station.id}: action ${action} is missing.`;
          (strict ? errors : warnings).push(message);
        }
      }
      if (strict) {
        for (const coordinate of ["x", "y", "z"]) {
          if (!Number.isFinite(station.coordinates[coordinate])) {
            errors.push(`Combination ${combination.id}, ${station.id}: coordinate ${coordinate} is missing.`);
          }
        }
        for (const displacement of ["u", "v", "w"]) {
          if (!Number.isFinite(station.displacements[displacement])) {
            errors.push(`Combination ${combination.id}, ${station.id}: displacement ${displacement} is missing.`);
          }
        }
        for (const rotation of ["x", "y", "z"]) {
          if (!Number.isFinite(station.rotations[rotation])) {
            errors.push(`Combination ${combination.id}, ${station.id}: rotation ${rotation} is missing.`);
          }
        }
      }
    });
  });

  const value = {
    schema: "strutture-js/steel-member-fem-3d",
    version: 1,
    units: analysisResult?.units ? { ...analysisResult.units } : null,
    member,
    combinations,
    metadata: { ...(source.metadata ?? {}) },
  };

  return { ok: errors.length === 0, value, errors, warnings };
}

export function createSteelMemberFem3DResult(input, options = { strict: true }) {
  const validation = validateSteelMemberFem3DResult(input, options);

  if (!validation.ok) {
    throw new Error(`Invalid steel FEM 3D result: ${validation.errors.join(" ")}`);
  }

  return validation.value;
}

export function steelMemberFem3DToLegacyAnalysisResult(contract) {
  const combinations = Object.fromEntries(contract.combinations.map((combination) => {
    const samples = combination.stations.map((station) => ({
      id: station.id,
      station: station.station,
      n: station.actions.N ?? 0,
      v: station.actions.Vy ?? 0,
      m: station.actions.My ?? 0,
      vY: station.actions.Vy ?? 0,
      vZ: station.actions.Vz ?? 0,
      mY: station.actions.My ?? 0,
      mZ: station.actions.Mz ?? 0,
      t: station.actions.T ?? 0,
      bimoment: station.actions.B ?? 0,
      principalActions: {
        vY: station.actions.Vy ?? 0,
        vZ: station.actions.Vz ?? 0,
        mY: station.actions.My ?? 0,
        mZ: station.actions.Mz ?? 0,
      },
      coordinates: { ...station.coordinates },
      displacements: { ...station.displacements },
      rotations: { ...station.rotations },
    }));
    const deflectionSamples = combination.stations.filter((station) =>
      Number.isFinite(station.displacements.v));
    const maxDeflection = deflectionSamples.reduce((selected, station) =>
      !selected || Math.abs(station.displacements.v) > Math.abs(selected.displacements.v)
        ? station : selected, null);
    const entry = {
      id: combination.id,
      resultType: "steel-member-fem-3d-combination",
      units: { ...contract.units },
      context: {
        limitState: combination.limitState === "SLU" ? "ULS" : "SLE",
        combinationType: combination.combinationType,
        combinationId: combination.id,
      },
      geometry: { length: contract.member.length },
      supports: [
        { station: 0, restraints: { ...contract.member.ends.start.restraints } },
        { station: contract.member.length, restraints: { ...contract.member.ends.end.restraints } },
      ],
      internalForces: { samples },
      displacements: {
        maxAbsVerticalDisplacement: maxDeflection
          ? { station: maxDeflection.station, uy: maxDeflection.displacements.v }
          : null,
      },
      metadata: { ...combination.metadata },
    };
    return [combination.id, entry];
  }));

  return {
    id: contract.member.id,
    units: { ...contract.units },
    geometry: { length: contract.member.length },
    combinations,
    metadata: { schema: contract.schema, version: contract.version },
  };
}
