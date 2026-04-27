import { createUnitResolver } from "../units/UnitSystem.js";
import {
  DISTRIBUTED_LOAD_TYPES,
  POINT_LOAD_TYPES,
} from "./SingleBeamInput.js";

function assertFinite(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`SingleBeamAnalysis requires a finite ${label}.`);
  }
}

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`SingleBeamAnalysis requires a positive ${label}.`);
  }
}

function normalizePoint(point, unitResolver, label) {
  if (!point || typeof point !== "object") {
    throw new Error(`SingleBeamAnalysis requires geometry.${label}.`);
  }

  assertFinite(point.x, `geometry.${label}.x`);
  assertFinite(point.y, `geometry.${label}.y`);

  return {
    x: unitResolver.length(point.x),
    y: unitResolver.length(point.y),
  };
}

export function resolveGeometry(geometry, sourceUnits, targetUnits) {
  const unitResolver = createUnitResolver(sourceUnits, targetUnits);
  const start = normalizePoint(geometry?.start, unitResolver, "start");
  const end = normalizePoint(geometry?.end, unitResolver, "end");
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx ** 2 + dy ** 2);

  assertPositive(length, "beam length");

  return {
    start,
    end,
    dx,
    dy,
    length,
    horizontalSpan: Math.abs(dx),
    c: dx / length,
    s: dy / length,
  };
}

export function coordinateAtStation(geometry, station) {
  const ratio = station / geometry.length;

  return {
    x: geometry.start.x + geometry.dx * ratio,
    y: geometry.start.y + geometry.dy * ratio,
  };
}

function addStation(stations, station, tolerance) {
  if (!stations.some((existing) => Math.abs(existing - station) <= tolerance)) {
    stations.push(station);
  }
}

function sortStations(stations) {
  return [...stations].sort((a, b) => a - b);
}

export function resolveStation(value, geometry, unitResolver, label, defaultValue = null) {
  if (value == null) {
    return defaultValue;
  }

  if (value === "start") {
    return 0;
  }

  if (value === "end" || value === "span" || value === "length") {
    return geometry.length;
  }

  const station = unitResolver.length(value);

  assertFinite(station, label);

  if (station < -1e-12 || station > geometry.length + 1e-12) {
    throw new Error(`${label} must lie within the beam length.`);
  }

  return Math.min(geometry.length, Math.max(0, station));
}

function addDiscretizationStations(stations, geometry, unitResolver, discretization = {}) {
  const elementCount = discretization.elementCount ?? null;
  const maxElementLength =
    discretization.maxElementLength == null
      ? null
      : unitResolver.length(discretization.maxElementLength);
  const rawUserStations =
    discretization.stations ??
    discretization.userStations ??
    discretization.checkStations ??
    [];
  const userStations = Array.isArray(rawUserStations)
    ? rawUserStations
    : [rawUserStations];

  if (elementCount !== null) {
    if (!Number.isInteger(elementCount) || elementCount <= 0) {
      throw new Error("discretization.elementCount must be a positive integer.");
    }

    for (let index = 1; index < elementCount; index += 1) {
      addStation(stations, (geometry.length * index) / elementCount, 1e-9);
    }
  }

  if (maxElementLength !== null) {
    assertPositive(maxElementLength, "discretization.maxElementLength");

    const count = Math.ceil(geometry.length / maxElementLength);

    for (let index = 1; index < count; index += 1) {
      addStation(stations, (geometry.length * index) / count, 1e-9);
    }
  }

  for (const [index, station] of userStations.entries()) {
    addStation(
      stations,
      resolveStation(
        station,
        geometry,
        unitResolver,
        `discretization.stations[${index}]`,
      ),
      1e-9,
    );
  }
}

function normalizeVerificationStationMode(mode) {
  const normalized = String(mode ?? "combined").trim().toLowerCase();
  const aliases = {
    automatic: "auto",
    declared: "combined",
    grid: "auto",
    selected: "combined",
    fem: "all",
    samples: "all",
  };

  return aliases[normalized] ?? normalized;
}

function addVerificationStations(stations, geometry, unitResolver, verificationStations = null) {
  if (!verificationStations || verificationStations.enabled === false) {
    return;
  }

  const options = Array.isArray(verificationStations)
    ? { mode: "user", userStations: verificationStations }
    : verificationStations;
  const hasDeclaredStations =
    options.count != null ||
    options.stationCount != null ||
    options.userStations != null ||
    options.stations != null ||
    options.checkStations != null;
  const mode = normalizeVerificationStationMode(
    options.mode ?? (hasDeclaredStations ? "combined" : "all"),
  );
  const count = options.count ?? options.stationCount ?? null;
  const rawUserStations =
    options.userStations ??
    options.stations ??
    options.checkStations ??
    [];
  const userStations = Array.isArray(rawUserStations)
    ? rawUserStations
    : [rawUserStations];

  if (count != null && ["auto", "combined"].includes(mode)) {
    if (!Number.isInteger(count) || count < 2) {
      throw new Error("verificationStations.count must be an integer greater than or equal to 2.");
    }

    for (let index = 1; index < count - 1; index += 1) {
      addStation(stations, (geometry.length * index) / (count - 1), 1e-9);
    }
  }

  if (["user", "combined"].includes(mode)) {
    for (const [index, station] of userStations.entries()) {
      addStation(
        stations,
        resolveStation(
          station,
          geometry,
          unitResolver,
          `verificationStations.userStations[${index}]`,
        ),
        1e-9,
      );
    }
  }
}

export function collectBeamStations({
  geometry,
  unitResolver,
  discretization = {},
  verificationStations = null,
  supports = [],
  loads = [],
  tolerance = 1e-9,
}) {
  const stations = [0, geometry.length];

  addDiscretizationStations(stations, geometry, unitResolver, discretization);
  addVerificationStations(stations, geometry, unitResolver, verificationStations);

  for (const support of supports) {
    addStation(
      stations,
      resolveStation(
        support.position ?? support.x ?? support.station,
        geometry,
        unitResolver,
        `support ${support.id} position`,
        support.position === "end" ? geometry.length : 0,
      ),
      tolerance,
    );
  }

  for (const load of loads) {
    const type = load.type ?? "uniform";

    if (DISTRIBUTED_LOAD_TYPES.has(type)) {
      addStation(
        stations,
        resolveStation(load.from ?? load.start, geometry, unitResolver, `load ${load.id} start`, 0),
        tolerance,
      );
      addStation(
        stations,
        resolveStation(load.to ?? load.end, geometry, unitResolver, `load ${load.id} end`, geometry.length),
        tolerance,
      );
      continue;
    }

    if (POINT_LOAD_TYPES.has(type)) {
      addStation(
        stations,
        resolveStation(
          load.x ?? load.position ?? load.station,
          geometry,
          unitResolver,
          `load ${load.id} position`,
          geometry.length / 2,
        ),
        tolerance,
      );
      continue;
    }

    throw new Error(`Unsupported beam load type: ${type}.`);
  }

  return sortStations(stations);
}
