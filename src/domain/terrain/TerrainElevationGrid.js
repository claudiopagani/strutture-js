export const TERRAIN_ELEVATION_GRID_SCHEMA_VERSION =
  "terrain-elevation-grid/v1";

function toFiniteNumber(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function requirePositiveNumber(value, fieldName) {
  const numericValue = toFiniteNumber(value);

  if (numericValue == null || numericValue <= 0) {
    throw new Error(`${fieldName} must be a finite positive number.`);
  }

  return numericValue;
}

function resolveGridSize(data, points) {
  const declaredSize = Number(data?.gridSize);

  if (Number.isInteger(declaredSize) && declaredSize >= 2) {
    return declaredSize;
  }

  const inferredSize = Math.sqrt(points.length);

  if (Number.isInteger(inferredSize) && inferredSize >= 2) {
    return inferredSize;
  }

  throw new Error(
    "gridSize must be an integer greater than one or inferable from a square points array.",
  );
}

function toGridIndex(value, fallback) {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) ? numericValue : fallback;
}

function getPointElevation(point) {
  if (point?.nodata === true || point?.isNoData === true) {
    return null;
  }

  return toFiniteNumber(
    point?.elevationM ??
      point?.elevation_m ??
      point?.elevation,
  );
}

function toPointMatrix(points, gridSize) {
  const matrix = Array.from({ length: gridSize }, () =>
    Array(gridSize).fill(null),
  );

  points.forEach((point, index) => {
    const fallbackRow = Math.floor(index / gridSize);
    const fallbackColumn = index % gridSize;
    const row = toGridIndex(point?.row, fallbackRow);
    const column = toGridIndex(point?.col ?? point?.column, fallbackColumn);

    if (
      row >= 0 &&
      row < gridSize &&
      column >= 0 &&
      column < gridSize
    ) {
      matrix[row][column] = point;
    }
  });

  return matrix;
}

function averageCoordinate(matrix, gridSize, fixedIndex, axis, coordinate) {
  const values = [];

  for (let index = 0; index < gridSize; index += 1) {
    const row = axis === "row" ? fixedIndex : index;
    const column = axis === "column" ? fixedIndex : index;
    const value = toFiniteNumber(matrix[row]?.[column]?.[coordinate]);

    if (value != null) {
      values.push(value);
    }
  }

  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}

function shouldFlipRows(matrix, gridSize) {
  const firstNorthOffset = averageCoordinate(
    matrix,
    gridSize,
    0,
    "row",
    "northOffsetM",
  );
  const lastNorthOffset = averageCoordinate(
    matrix,
    gridSize,
    gridSize - 1,
    "row",
    "northOffsetM",
  );

  if (firstNorthOffset != null && lastNorthOffset != null) {
    return firstNorthOffset < lastNorthOffset;
  }

  const firstLatitude = averageCoordinate(matrix, gridSize, 0, "row", "lat");
  const lastLatitude = averageCoordinate(
    matrix,
    gridSize,
    gridSize - 1,
    "row",
    "lat",
  );

  return firstLatitude != null && lastLatitude != null
    ? firstLatitude < lastLatitude
    : false;
}

function shouldFlipColumns(matrix, gridSize) {
  const firstEastOffset = averageCoordinate(
    matrix,
    gridSize,
    0,
    "column",
    "eastOffsetM",
  );
  const lastEastOffset = averageCoordinate(
    matrix,
    gridSize,
    gridSize - 1,
    "column",
    "eastOffsetM",
  );

  if (firstEastOffset != null && lastEastOffset != null) {
    return firstEastOffset > lastEastOffset;
  }

  const firstLongitude = averageCoordinate(
    matrix,
    gridSize,
    0,
    "column",
    "lon",
  );
  const lastLongitude = averageCoordinate(
    matrix,
    gridSize,
    gridSize - 1,
    "column",
    "lon",
  );

  return firstLongitude != null && lastLongitude != null
    ? firstLongitude > lastLongitude
    : false;
}

function cloneSerializableObject(value) {
  if (value == null) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("provenance must be a serializable object when provided.");
  }

  return { ...value };
}

export function normalizeTerrainElevationGrid(data = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("A terrain elevation grid object is required.");
  }

  if (!Array.isArray(data.points)) {
    throw new Error("points must be an array.");
  }

  const points = data.points;
  const gridSize = resolveGridSize(data, points);
  const spacingM = requirePositiveNumber(data.spacingM, "spacingM");
  const halfIndex = (gridSize - 1) / 2;
  const sourceMatrix = toPointMatrix(points, gridSize);
  const flipRows = shouldFlipRows(sourceMatrix, gridSize);
  const flipColumns = shouldFlipColumns(sourceMatrix, gridSize);
  const cells = [];

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const point = sourceMatrix[row]?.[column] ?? {};
      const normalizedRow = flipRows ? gridSize - 1 - row : row;
      const normalizedColumn = flipColumns
        ? gridSize - 1 - column
        : column;
      const elevationM = getPointElevation(point);
      const isNoData =
        point.nodata === true ||
        point.isNoData === true ||
        elevationM == null;

      cells.push({
        row: normalizedRow,
        column: normalizedColumn,
        sourceRow: toGridIndex(point.row, row),
        sourceColumn: toGridIndex(point.col ?? point.column, column),
        eastOffsetM:
          toFiniteNumber(point.eastOffsetM) ??
          (normalizedColumn - halfIndex) * spacingM,
        northOffsetM:
          toFiniteNumber(point.northOffsetM) ??
          (halfIndex - normalizedRow) * spacingM,
        latitudeDeg: toFiniteNumber(point.lat ?? point.latitudeDeg),
        longitudeDeg: toFiniteNumber(point.lon ?? point.longitudeDeg),
        elevationM,
        isNoData,
        isInterpolated: point.isInterpolated === true,
        isFallback:
          point.fallback === true ||
          point.isFallback === true ||
          String(point.source ?? "").toLowerCase() === "external",
        source: point.source ?? null,
        sourceResolutionM: toFiniteNumber(
          point.resolution_m ?? point.resolutionM ?? point.sourceResolutionM,
        ),
        samplingMethod: point.method ?? point.samplingMethod ?? null,
      });
    }
  }

  cells.sort((left, right) =>
    left.row === right.row
      ? left.column - right.column
      : left.row - right.row,
  );

  const eastOffsets = cells.map((cell) => cell.eastOffsetM);
  const northOffsets = cells.map((cell) => cell.northOffsetM);
  const extentFromData = toFiniteNumber(data.extentM);
  const derivedExtentM = spacingM * (gridSize - 1);
  const extentM = extentFromData && extentFromData > 0
    ? extentFromData
    : derivedExtentM;
  const radiusFromData = toFiniteNumber(data.radiusM);
  const radiusM = radiusFromData && radiusFromData > 0
    ? radiusFromData
    : extentM / 2;
  const missingElevationCount = cells.filter(
    (cell) => cell.elevationM == null || cell.isNoData,
  ).length;

  return {
    schemaVersion: TERRAIN_ELEVATION_GRID_SCHEMA_VERSION,
    center: {
      latitudeDeg: toFiniteNumber(
        data.center?.latitudeDeg ?? data.center?.lat,
      ),
      longitudeDeg: toFiniteNumber(
        data.center?.longitudeDeg ?? data.center?.lon,
      ),
    },
    radiusM,
    extentM,
    gridSize,
    spacingM,
    orientation: {
      rowOrder: "north-to-south",
      columnOrder: "west-to-east",
    },
    bounds: {
      westM: Math.min(...eastOffsets),
      eastM: Math.max(...eastOffsets),
      southM: Math.min(...northOffsets),
      northM: Math.max(...northOffsets),
    },
    cells,
    quality: {
      expectedPointCount: gridSize * gridSize,
      receivedPointCount: points.length,
      missingElevationCount,
      missingRatio: missingElevationCount / (gridSize * gridSize),
      fallbackCount: cells.filter((cell) => cell.isFallback).length,
      interpolatedCount: cells.filter((cell) => cell.isInterpolated).length,
    },
    provenance: cloneSerializableObject(data.provenance),
  };
}
