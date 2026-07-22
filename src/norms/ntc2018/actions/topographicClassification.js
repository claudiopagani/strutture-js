import {
  H30_THRESHOLD_M,
  H60_THRESHOLD_M,
  H_WINDOW_CELLS_40M,
  RAW_CELL_SIZE_M,
  DEFAULT_TOPOGRAPHIC_PREPROCESSING_MODE,
  RIDGE_DILATION_CELLS_40M,
  RIDGE_DILATION_M,
  RIDGE_MIN_CONNECTED_CELLS,
  SLOPE_THRESHOLD_DEG,
  SMOOTHING_WINDOW_CELLS,
  TOPOGRAPHIC_AMPLIFICATION_FACTORS,
  TOPOGRAPHIC_CLASSIFICATION_MODES,
  TOPOGRAPHIC_PREPROCESSING_MODES,
  TPI_RADIUS_ARTICLE_M,
  TPI_THRESHOLD_M,
  WORKING_CELL_SIZE_M,
} from "./topographicClassification.constants.js";

const ALLOWED_GRID_SIZES = [51, 101];
const MIN_TPI_COVERAGE_RATIO = 0.75;
const MAX_MISSING_RATIO_FOR_RELIABLE_CLASSIFICATION = 0.05;
const REQUIRED_SMOOTHING_VALID_CELLS = 7;
function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function createMatrix(rows, cols, value = null) {
  return Array.from({ length: rows }, () => Array(cols).fill(value));
}

function getModeForGridSize(gridSize) {
  return (
    Object.values(TOPOGRAPHIC_CLASSIFICATION_MODES).find(
      (mode) => mode.gridSize === gridSize
    ) ?? null
  );
}

function getPreprocessingMode(modeName) {
  return (
    TOPOGRAPHIC_PREPROCESSING_MODES[modeName] ??
    TOPOGRAPHIC_PREPROCESSING_MODES[DEFAULT_TOPOGRAPHIC_PREPROCESSING_MODE]
  );
}

function formatMissingRatio(ratio) {
  return `${(ratio * 100).toLocaleString("it-IT", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })}%`;
}

function addWarning(warnings, warning) {
  if (warning && !warnings.includes(warning)) {
    warnings.push(warning);
  }
}

function getCell(model, row, col) {
  return model?.cellMap?.get(`${row}:${col}`) ?? null;
}

function validateModel(model) {
  const warnings = [];
  const gridSize = Number(model?.gridSize);
  const spacingM = Number(model?.spacingM);
  const expectedPointCount = gridSize * gridSize;
  const rawCells = Array.isArray(model?.cells) ? model.cells : [];
  const missingCount = rawCells.filter(
    (cell) => cell?.rawElevation == null || cell?.isNoData === true
  ).length;
  const interpolatedCount = rawCells.filter((cell) => cell?.isInterpolated).length;
  const missingRatio = expectedPointCount > 0 ? missingCount / expectedPointCount : 1;
  let canClassify = true;

  if (!ALLOWED_GRID_SIZES.includes(gridSize)) {
    addWarning(
      warnings,
      "La procedura Mascandola et al. richiede una griglia 21x21, 51x51 o 101x101."
    );
    canClassify = false;
  }

  if (spacingM !== RAW_CELL_SIZE_M) {
    addWarning(warnings, "La procedura richiede una griglia DEM con passo 10 m.");
    canClassify = false;
  }

  if (!Array.isArray(rawCells) || rawCells.length !== expectedPointCount) {
    addWarning(warnings, "La griglia altimetrica non e quadrata o non e completa.");
    canClassify = false;
  }

  if (missingCount > 0 || interpolatedCount > 0) {
    addWarning(warnings, "La griglia altimetrica contiene celle mancanti/interpolate.");
  }

  if (missingRatio > MAX_MISSING_RATIO_FOR_RELIABLE_CLASSIFICATION) {
    addWarning(
      warnings,
      `Quote mancanti superiori al 5% (${formatMissingRatio(
        missingRatio
      )}); classificazione non affidabile.`
    );
    canClassify = false;
  }

  return {
    canClassify,
    warnings,
    gridSize,
    spacingM,
    missingCount,
    missingRatio,
  };
}

function buildRawElevationMatrix(model) {
  const matrix = createMatrix(model.gridSize, model.gridSize);

  for (let row = 0; row < model.gridSize; row += 1) {
    for (let col = 0; col < model.gridSize; col += 1) {
      const cell = getCell(model, row, col);
      matrix[row][col] =
        cell?.isNoData === true || cell?.rawElevation == null
          ? null
          : Number(cell.rawElevation);
    }
  }

  return matrix;
}

function interpolateRawElevation(model, matrix, x, y) {
  const xMin = Number.isFinite(model.xMin) ? model.xMin : -model.halfExtentM;
  const yMax = Number.isFinite(model.yMax) ? model.yMax : model.halfExtentM;
  const colFloat = (x - xMin) / model.spacingM;
  const rowFloat = (yMax - y) / model.spacingM;

  if (
    colFloat < 0 ||
    rowFloat < 0 ||
    colFloat > model.gridSize - 1 ||
    rowFloat > model.gridSize - 1
  ) {
    return null;
  }

  const col0 = Math.floor(colFloat);
  const row0 = Math.floor(rowFloat);
  const col1 = Math.min(col0 + 1, model.gridSize - 1);
  const row1 = Math.min(row0 + 1, model.gridSize - 1);
  const tx = colFloat - col0;
  const ty = rowFloat - row0;
  const topLeft = matrix[row0]?.[col0];
  const topRight = matrix[row0]?.[col1];
  const bottomLeft = matrix[row1]?.[col0];
  const bottomRight = matrix[row1]?.[col1];

  if (
    topLeft == null ||
    topRight == null ||
    bottomLeft == null ||
    bottomRight == null
  ) {
    return null;
  }

  const top = topLeft + (topRight - topLeft) * tx;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * tx;

  return top + (bottom - top) * ty;
}

function buildWorkingGrid(
  model,
  rawMatrix,
  cellSizeM = WORKING_CELL_SIZE_M
) {
  const halfExtentM = Number.isFinite(model.radiusM)
    ? model.radiusM
    : model.halfExtentM;
  const maxCoordinate =
    Math.floor(halfExtentM / cellSizeM) * cellSizeM;
  const size = Math.floor((maxCoordinate * 2) / cellSizeM) + 1;
  const elevations = createMatrix(size, size);
  const coordinates = createMatrix(size, size);

  for (let row = 0; row < size; row += 1) {
    const y = maxCoordinate - row * cellSizeM;

    for (let col = 0; col < size; col += 1) {
      const x = -maxCoordinate + col * cellSizeM;

      coordinates[row][col] = { x, y };
      elevations[row][col] = interpolateRawElevation(model, rawMatrix, x, y);
    }
  }

  return {
    elevations,
    coordinates,
    size,
    maxCoordinate,
    cellSizeM,
  };
}

export function smoothWorkingGrid(
  elevations,
  windowCells = SMOOTHING_WINDOW_CELLS
) {
  const rows = elevations.length;
  const cols = elevations[0]?.length ?? 0;

  if (windowCells <= 1) {
    return {
      elevations: elevations.map((row) => [...row]),
      reliable: elevations.map((row) => row.map((value) => value != null)),
    };
  }

  const smoothed = createMatrix(rows, cols);
  const reliable = createMatrix(rows, cols, false);
  const halfWindow = Math.floor(windowCells / 2);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let total = 0;
      let count = 0;

      for (let dr = -halfWindow; dr <= halfWindow; dr += 1) {
        for (let dc = -halfWindow; dc <= halfWindow; dc += 1) {
          const value = elevations[row + dr]?.[col + dc];

          if (value != null) {
            total += value;
            count += 1;
          }
        }
      }

      if (count >= REQUIRED_SMOOTHING_VALID_CELLS) {
        smoothed[row][col] = total / count;
        reliable[row][col] = true;
      }
    }
  }

  return {
    elevations: smoothed,
    reliable,
  };
}

export function computeSlopeAnalysisMap(
  dem,
  cellSizeM = WORKING_CELL_SIZE_M
) {
  const rows = dem.length;
  const cols = dem[0]?.length ?? 0;
  const slopes = createMatrix(rows, cols);
  const directions = createMatrix(rows, cols);
  const ratios = createMatrix(rows, cols);
  const neighborOffsets = [
    { dr: -1, dc: -1 },
    { dr: -1, dc: 0 },
    { dr: -1, dc: 1 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
    { dr: 1, dc: -1 },
    { dr: 1, dc: 0 },
    { dr: 1, dc: 1 },
  ];

  for (let row = 1; row < rows - 1; row += 1) {
    for (let col = 1; col < cols - 1; col += 1) {
      const centerElevation = dem[row][col];

      if (centerElevation == null) {
        continue;
      }

      let maxNeighbor = null;

      neighborOffsets.forEach(({ dr, dc }) => {
        const neighborElevation = dem[row + dr]?.[col + dc];

        if (neighborElevation == null) {
          return;
        }

        const distanceM = Math.hypot(dr * cellSizeM, dc * cellSizeM);
        const elevationDeltaM = neighborElevation - centerElevation;
        const absoluteRatio = Math.abs(elevationDeltaM) / distanceM;

        if (!maxNeighbor || absoluteRatio > maxNeighbor.ratio) {
          const xOffsetM = dc * cellSizeM;
          const yOffsetM = -dr * cellSizeM;
          const uphillSign = elevationDeltaM >= 0 ? 1 : -1;

          maxNeighbor = {
            ratio: absoluteRatio,
            direction: {
              x: (xOffsetM * uphillSign) / distanceM,
              y: (yOffsetM * uphillSign) / distanceM,
            },
            neighborOffset: {
              row: dr,
              col: dc,
              x: xOffsetM,
              y: yOffsetM,
            },
            elevationDeltaM,
            distanceM,
          };
        }
      });

      if (!maxNeighbor) {
        continue;
      }

      const slopeRad = Math.atan(maxNeighbor.ratio);

      slopes[row][col] = (slopeRad * 180) / Math.PI;
      ratios[row][col] = maxNeighbor.ratio;
      directions[row][col] = maxNeighbor;
    }
  }

  return {
    slopes,
    ratios,
    directions,
  };
}

export function computeSlopeMap(dem, cellSizeM = WORKING_CELL_SIZE_M) {
  return computeSlopeAnalysisMap(dem, cellSizeM).slopes;
}

function getTheoreticalCircleOffsets(radiusM, cellSizeM) {
  const maxOffset = Math.floor(radiusM / cellSizeM);
  const offsets = [];

  for (let dr = -maxOffset; dr <= maxOffset; dr += 1) {
    for (let dc = -maxOffset; dc <= maxOffset; dc += 1) {
      const distance = Math.hypot(dr * cellSizeM, dc * cellSizeM);

      if (distance <= radiusM) {
        offsets.push({ dr, dc });
      }
    }
  }

  return offsets;
}

export function computeTpiMap(
  dem40Smooth,
  cellSizeM = WORKING_CELL_SIZE_M,
  radiusM = TPI_RADIUS_ARTICLE_M
) {
  const rows = dem40Smooth.length;
  const cols = dem40Smooth[0]?.length ?? 0;
  const tpi = createMatrix(rows, cols);
  const coverage = createMatrix(rows, cols, 0);
  const offsets = getTheoreticalCircleOffsets(radiusM, cellSizeM);
  const expectedCount = offsets.length;
  const coverageWarnings = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const centerElevation = dem40Smooth[row][col];

      if (centerElevation == null) {
        continue;
      }

      let total = 0;
      let availableCount = 0;

      offsets.forEach(({ dr, dc }) => {
        const value = dem40Smooth[row + dr]?.[col + dc];

        if (value != null) {
          total += value;
          availableCount += 1;
        }
      });

      const coverageRatio = expectedCount > 0 ? availableCount / expectedCount : 0;
      coverage[row][col] = coverageRatio;

      if (coverageRatio < MIN_TPI_COVERAGE_RATIO || availableCount === 0) {
        coverageWarnings.push({ row, col, coverageRatio });
        continue;
      }

      tpi[row][col] = centerElevation - total / availableCount;
    }
  }

  return {
    tpi,
    coverage,
    coverageWarnings,
  };
}

export function computeElevationRangeMap(
  dem,
  windowCells = H_WINDOW_CELLS_40M
) {
  const rows = dem.length;
  const cols = dem[0]?.length ?? 0;
  const ranges = createMatrix(rows, cols);
  const h30 = createMatrix(rows, cols, null);
  const h60 = createMatrix(rows, cols, null);
  const halfWindow = Math.floor(windowCells / 2);

  for (let row = halfWindow; row < rows - halfWindow; row += 1) {
    for (let col = halfWindow; col < cols - halfWindow; col += 1) {
      const values = [];

      for (let dr = -halfWindow; dr <= halfWindow; dr += 1) {
        for (let dc = -halfWindow; dc <= halfWindow; dc += 1) {
          const value = dem[row + dr]?.[col + dc];

          if (value != null) {
            values.push(value);
          }
        }
      }

      if (values.length !== windowCells * windowCells) {
        continue;
      }

      const localRange = Math.max(...values) - Math.min(...values);

      ranges[row][col] = localRange;
      h30[row][col] = localRange >= H30_THRESHOLD_M;
      h60[row][col] = localRange >= H60_THRESHOLD_M;
    }
  }

  return {
    ranges,
    h30,
    h60,
  };
}

function buildRidgeZone(tpiMap) {
  return tpiMap.map((row) =>
    row.map((value) => value != null && value > TPI_THRESHOLD_M)
  );
}

function countBinaryNeighbors(matrix, row, col) {
  const neighbors = [
    matrix[row - 1]?.[col] ? 1 : 0,
    matrix[row - 1]?.[col + 1] ? 1 : 0,
    matrix[row]?.[col + 1] ? 1 : 0,
    matrix[row + 1]?.[col + 1] ? 1 : 0,
    matrix[row + 1]?.[col] ? 1 : 0,
    matrix[row + 1]?.[col - 1] ? 1 : 0,
    matrix[row]?.[col - 1] ? 1 : 0,
    matrix[row - 1]?.[col - 1] ? 1 : 0,
  ];
  const count = neighbors.reduce((total, value) => total + value, 0);
  let transitions = 0;

  for (let index = 0; index < neighbors.length; index += 1) {
    const current = neighbors[index];
    const next = neighbors[(index + 1) % neighbors.length];

    if (current === 0 && next === 1) {
      transitions += 1;
    }
  }

  return {
    neighbors,
    count,
    transitions,
  };
}

export function zhangSuenThinning(binaryMatrix) {
  const rows = binaryMatrix.length;
  const cols = binaryMatrix[0]?.length ?? 0;
  const output = binaryMatrix.map((row) => row.map(Boolean));
  let changed = true;

  while (changed) {
    changed = false;

    for (const step of [0, 1]) {
      const toRemove = [];

      for (let row = 1; row < rows - 1; row += 1) {
        for (let col = 1; col < cols - 1; col += 1) {
          if (!output[row][col]) {
            continue;
          }

          const { neighbors, count, transitions } = countBinaryNeighbors(
            output,
            row,
            col
          );
          const [p2, p3, p4, p5, p6, p7, p8] = neighbors;

          if (count < 2 || count > 6 || transitions !== 1) {
            continue;
          }

          const shouldRemove =
            step === 0
              ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0
              : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0;

          if (shouldRemove) {
            toRemove.push({ row, col });
          }
        }
      }

      if (toRemove.length) {
        changed = true;
        toRemove.forEach(({ row, col }) => {
          output[row][col] = false;
        });
      }
    }
  }

  return output;
}

function intersectRidgeWithH30(ridgeLine, h30Map) {
  return ridgeLine.map((row, rowIndex) =>
    row.map((value, colIndex) => value && h30Map[rowIndex]?.[colIndex] === true)
  );
}

function filterSmallComponents(binaryMatrix, minCells) {
  const rows = binaryMatrix.length;
  const cols = binaryMatrix[0]?.length ?? 0;
  const output = createMatrix(rows, cols, false);
  const visited = createMatrix(rows, cols, false);
  const directions = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!binaryMatrix[row][col] || visited[row][col]) {
        continue;
      }

      const stack = [{ row, col }];
      const component = [];
      visited[row][col] = true;

      while (stack.length) {
        const item = stack.pop();
        component.push(item);

        directions.forEach(([dr, dc]) => {
          const nextRow = item.row + dr;
          const nextCol = item.col + dc;

          if (
            nextRow >= 0 &&
            nextRow < rows &&
            nextCol >= 0 &&
            nextCol < cols &&
            binaryMatrix[nextRow][nextCol] &&
            !visited[nextRow][nextCol]
          ) {
            visited[nextRow][nextCol] = true;
            stack.push({ row: nextRow, col: nextCol });
          }
        });
      }

      if (component.length >= minCells) {
        component.forEach((item) => {
          output[item.row][item.col] = true;
        });
      }
    }
  }

  return output;
}

function dilateChebyshev(binaryMatrix, radiusCells) {
  const rows = binaryMatrix.length;
  const cols = binaryMatrix[0]?.length ?? 0;
  const output = createMatrix(rows, cols, false);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!binaryMatrix[row][col]) {
        continue;
      }

      for (let dr = -radiusCells; dr <= radiusCells; dr += 1) {
        for (let dc = -radiusCells; dc <= radiusCells; dc += 1) {
          const nextRow = row + dr;
          const nextCol = col + dc;

          if (
            nextRow >= 0 &&
            nextRow < rows &&
            nextCol >= 0 &&
            nextCol < cols
          ) {
            output[nextRow][nextCol] = true;
          }
        }
      }
    }
  }

  return output;
}

export function buildRidgeMap(
  tpiMap,
  h30Map,
  {
    minConnectedCells = RIDGE_MIN_CONNECTED_CELLS,
    dilationCells = RIDGE_DILATION_CELLS_40M,
  } = {}
) {
  const ridgeZone = buildRidgeZone(tpiMap);
  const ridgeLine = zhangSuenThinning(ridgeZone);
  const candidateRidge = intersectRidgeWithH30(ridgeLine, h30Map);
  const filteredRidge = filterSmallComponents(
    candidateRidge,
    minConnectedCells
  );
  const ridgeMap = dilateChebyshev(filteredRidge, dilationCells);

  return {
    ridgeZone,
    ridgeLine,
    candidateRidge,
    filteredRidge,
    ridgeMap,
  };
}

function addThresholdWarnings(warnings, result) {
  if (Number.isFinite(result.slopeDeg) && Math.abs(result.slopeDeg - SLOPE_THRESHOLD_DEG) < 2) {
    addWarning(
      warnings,
      "Pendenza prossima alla soglia 15°: classificazione T1/T2 sensibile alla risoluzione del DEM."
    );
  }

  if (Number.isFinite(result.tpiCenterM) && Math.abs(result.tpiCenterM - TPI_THRESHOLD_M) < 2) {
    addWarning(
      warnings,
      "TPI prossimo alla soglia 5 m: individuazione della cresta sensibile alla scala."
    );
  }

  if (
    Number.isFinite(result.localElevationRangeM) &&
    Math.abs(result.localElevationRangeM - H30_THRESHOLD_M) < 5
  ) {
    addWarning(warnings, "Dislivello locale prossimo alla soglia H30.");
  }

  if (
    Number.isFinite(result.localElevationRangeM) &&
    Math.abs(result.localElevationRangeM - H60_THRESHOLD_M) < 5
  ) {
    addWarning(
      warnings,
      "Dislivello locale prossimo alla soglia H60: distinzione T3/T4 sensibile."
    );
  }
}

function buildEmptyResult(model, mode, preprocessingMode, warnings) {
  const diagnostics = {
    gridSize: Number(model?.gridSize) || null,
    rawCellSizeM: RAW_CELL_SIZE_M,
    workingCellSizeM: preprocessingMode?.workingCellSizeM ?? WORKING_CELL_SIZE_M,
    smoothingWindowCells: preprocessingMode?.smoothingWindowCells ?? null,
    slopeMethod: "max-neighbor-3x3",
    tpiRadiusM: mode?.radiusM ?? null,
    tpiThresholdM: TPI_THRESHOLD_M,
    hWindowCells40m: H_WINDOW_CELLS_40M,
    hWindowCells: preprocessingMode?.hWindowCells ?? H_WINDOW_CELLS_40M,
    ridgeDilationCells:
      preprocessingMode?.ridgeDilationCells ?? RIDGE_DILATION_CELLS_40M,
    ridgeDilationM: preprocessingMode?.ridgeDilationM ?? RIDGE_DILATION_M,
  };

  return {
    class: null,
    category: null,
    amplificationFactorST: null,
    slopeDeg: null,
    slopePercent: null,
    slopeDirection: null,
    slopeMethod: "max-neighbor-3x3",
    tpiCenterM: null,
    isRidge: false,
    h30Center: null,
    h60Center: null,
    localElevationRangeM: null,
    ridgeAtCenter: false,
    mode: mode?.mode ?? null,
    preprocessingMode: preprocessingMode?.mode ?? null,
    preprocessingLabel: preprocessingMode?.label ?? null,
    isArticleCompliantScale: mode?.isArticleCompliantScale === true,
    isArticleCompliantPreprocessing:
      preprocessingMode?.isArticleCompliantPreprocessing === true,
    isArticleCompliant:
      mode?.isArticleCompliantScale === true &&
      preprocessingMode?.isArticleCompliantPreprocessing === true,
    isReliable: false,
    warnings,
    diagnostics,
  };
}

export default function classifyTopographyMascandola(model, options = {}) {
  const validation = validateModel(model);
  const mode = getModeForGridSize(validation.gridSize);
  const preprocessingMode = getPreprocessingMode(options.preprocessingMode);
  const warnings = [...validation.warnings];

  if (mode && !mode.isArticleCompliantScale) {
    addWarning(
      warnings,
      "La classificazione usa una scala ridotta rispetto all'articolo, che adotta TPI con raggio 500 m. Il risultato e diagnostico."
    );
  }

  if (!validation.canClassify || !mode) {
    return buildEmptyResult(model, mode, preprocessingMode, warnings);
  }

  const rawMatrix = buildRawElevationMatrix(model);
  const workingGrid = buildWorkingGrid(
    model,
    rawMatrix,
    preprocessingMode.workingCellSizeM
  );
  const processed = smoothWorkingGrid(
    workingGrid.elevations,
    preprocessingMode.smoothingWindowCells
  );
  const slopeAnalysis = computeSlopeAnalysisMap(
    processed.elevations,
    preprocessingMode.workingCellSizeM
  );
  const tpi = computeTpiMap(
    processed.elevations,
    preprocessingMode.workingCellSizeM,
    mode.radiusM
  );
  const elevationRanges = computeElevationRangeMap(
    processed.elevations,
    preprocessingMode.hWindowCells
  );
  const ridgeMaps = buildRidgeMap(tpi.tpi, elevationRanges.h30, {
    minConnectedCells: preprocessingMode.ridgeMinConnectedCells,
    dilationCells: preprocessingMode.ridgeDilationCells,
  });
  const centerIndex = Math.floor(workingGrid.size / 2);
  const centerSlopeDeg = slopeAnalysis.slopes[centerIndex]?.[centerIndex] ?? null;
  const centerSlopeRatio =
    slopeAnalysis.ratios[centerIndex]?.[centerIndex] ?? null;
  const centerSlopeDirection =
    slopeAnalysis.directions[centerIndex]?.[centerIndex] ?? null;
  const tpiCenterM = tpi.tpi[centerIndex]?.[centerIndex] ?? null;
  const h30Center = elevationRanges.h30[centerIndex]?.[centerIndex] ?? null;
  const h60Center = elevationRanges.h60[centerIndex]?.[centerIndex] ?? null;
  const localElevationRangeM =
    elevationRanges.ranges[centerIndex]?.[centerIndex] ?? null;
  const isRidge = ridgeMaps.ridgeZone[centerIndex]?.[centerIndex] === true;
  const ridgeAtCenter = ridgeMaps.ridgeMap[centerIndex]?.[centerIndex] === true;
  const isOnRidge = isRidge && h30Center === true;
  let topographicClass = null;
  let canClassifyCenter = Number.isFinite(centerSlopeDeg);

  if (tpiCenterM == null) {
    addWarning(warnings, "Copertura TPI insufficiente in corrispondenza del punto.");
    canClassifyCenter = false;
  }

  if (isOnRidge && h60Center == null) {
    addWarning(warnings, "Dislivello H60 non valutabile in corrispondenza del punto.");
    canClassifyCenter = false;
  }

  if (canClassifyCenter) {
    if (!isOnRidge) {
      topographicClass = centerSlopeDeg < SLOPE_THRESHOLD_DEG ? "T1" : "T2";
    } else {
      topographicClass = h60Center === true ? "T4" : "T3";
    }
  }

  const result = {
    class: topographicClass,
    category: topographicClass,
    amplificationFactorST:
      topographicClass == null
        ? null
        : TOPOGRAPHIC_AMPLIFICATION_FACTORS[topographicClass],
    slopeDeg: centerSlopeDeg,
    slopePercent: Number.isFinite(centerSlopeRatio)
      ? centerSlopeRatio * 100
      : null,
    slopeDirection: centerSlopeDirection,
    slopeMethod: "max-neighbor-3x3",
    tpiCenterM,
    isRidge,
    h30Center,
    h60Center,
    localElevationRangeM,
    ridgeAtCenter,
    mode: mode.mode,
    preprocessingMode: preprocessingMode.mode,
    preprocessingLabel: preprocessingMode.label,
    isArticleCompliantScale: mode.isArticleCompliantScale,
    isArticleCompliantPreprocessing:
      preprocessingMode.isArticleCompliantPreprocessing,
    isArticleCompliant:
      mode.isArticleCompliantScale &&
      preprocessingMode.isArticleCompliantPreprocessing,
    isReliable: topographicClass != null && validation.canClassify,
    warnings,
    diagnostics: {
      gridSize: validation.gridSize,
      rawCellSizeM: RAW_CELL_SIZE_M,
      workingCellSizeM: preprocessingMode.workingCellSizeM,
      smoothingWindowCells: preprocessingMode.smoothingWindowCells,
      slopeMethod: "max-neighbor-3x3",
      tpiRadiusM: mode.radiusM,
      tpiThresholdM: TPI_THRESHOLD_M,
      hWindowCells40m: H_WINDOW_CELLS_40M,
      hWindowCells: preprocessingMode.hWindowCells,
      ridgeDilationCells: preprocessingMode.ridgeDilationCells,
      ridgeDilationM: preprocessingMode.ridgeDilationM,
    },
    debug: {
      workingGridSize: workingGrid.size,
      tpiCoverageCenter: tpi.coverage[centerIndex]?.[centerIndex] ?? null,
      preprocessingDescription: preprocessingMode.description,
    },
  };

  addThresholdWarnings(warnings, result);

  if (["T3", "T4"].includes(topographicClass)) {
    addWarning(
      warnings,
      "La classificazione automatica individua una possibile amplificazione topografica; verificare la morfologia con profili topografici locali, soprattutto in configurazioni 3D complesse."
    );
  }

  return result;
}

