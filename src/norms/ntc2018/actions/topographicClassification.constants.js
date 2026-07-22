export const RAW_CELL_SIZE_M = 10;
export const WORKING_CELL_SIZE_M = 40;
export const TPI_RADIUS_ARTICLE_M = 500;
export const TPI_THRESHOLD_M = 5;
export const SLOPE_THRESHOLD_DEG = 15;
export const H30_THRESHOLD_M = 30;
export const H60_THRESHOLD_M = 60;
export const H_WINDOW_CELLS_40M = 5;
export const SMOOTHING_WINDOW_CELLS = 3;
export const RIDGE_MIN_CONNECTED_CELLS = 5;
export const RIDGE_DILATION_CELLS_40M = 3;
export const RIDGE_DILATION_M = 120;

export const TOPOGRAPHIC_AMPLIFICATION_FACTORS = {
  T1: 1.0,
  T2: 1.2,
  T3: 1.2,
  T4: 1.4,
};

export const TOPOGRAPHIC_CLASSIFICATION_MODES = {
  "full-article": {
    mode: "full-article",
    radiusM: 500,
    gridSize: 101,
    label: "Articolo",
    description: "procedura principale conforme alla scala TPI 500 m",
    isArticleCompliantScale: true,
  },
  "quick-250": {
    mode: "quick-250",
    radiusM: 250,
    gridSize: 51,
    label: "Multiscala",
    description: "stima multiscala, non pienamente conforme all'articolo",
    isArticleCompliantScale: false,
  },
};

export const DEFAULT_TOPOGRAPHIC_PREPROCESSING_MODE = "article-40m-smoothed";

export const TOPOGRAPHIC_PREPROCESSING_MODES = {
  "article-40m-smoothed": {
    mode: "article-40m-smoothed",
    label: "Articolo",
    description: "resampling 40 m e smoothing 3x3",
    workingCellSizeM: WORKING_CELL_SIZE_M,
    smoothingWindowCells: SMOOTHING_WINDOW_CELLS,
    hWindowCells: H_WINDOW_CELLS_40M,
    ridgeDilationCells: RIDGE_DILATION_CELLS_40M,
    ridgeDilationM: RIDGE_DILATION_M,
    ridgeMinConnectedCells: RIDGE_MIN_CONNECTED_CELLS,
    isArticleCompliantPreprocessing: true,
  },
};

