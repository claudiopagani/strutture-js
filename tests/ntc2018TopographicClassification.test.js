import test from "node:test";
import assert from "node:assert/strict";

import {
  CalculationResult,
  NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD,
  TERRAIN_ELEVATION_GRID_SCHEMA_VERSION,
  classifyNTC2018Topography,
  normalizeTerrainElevationGrid,
} from "../src/index.js";

function buildGrid({
  gridSize = 101,
  radiusM = 500,
  elevationAt = () => 200,
  mutatePoint = (point) => point,
  provenance = null,
} = {}) {
  const spacingM = 10;
  const center = { lat: 43.123, lon: 11.456 };
  const points = [];

  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const northOffsetM = radiusM - row * spacingM;
      const eastOffsetM = -radiusM + col * spacingM;
      const elevation = elevationAt({
        x: eastOffsetM,
        y: northOffsetM,
        row,
        col,
      });
      const point = {
        row,
        col,
        northOffsetM,
        eastOffsetM,
        lat: center.lat + northOffsetM / 111320,
        lon: center.lon + eastOffsetM / 82000,
        elevation,
        elevation_m: elevation,
        source: "TINITALY",
        resolution_m: 10,
        method: "bilinear",
        nodata: false,
      };

      points.push(mutatePoint(point, points.length));
    }
  }

  return {
    center,
    radiusM,
    gridSize,
    spacingM,
    extentM: radiusM * 2,
    points,
    provenance,
  };
}

test("terrain grid normalization preserves the generic serializable contract", () => {
  const payload = buildGrid({
    gridSize: 51,
    radiusM: 250,
    provenance: {
      kind: "external-service",
      reference: "terrain extraction result terrain-42",
      datasetVersion: "1.1",
    },
  });
  payload.points.reverse();
  const grid = normalizeTerrainElevationGrid(payload);

  assert.equal(grid.schemaVersion, TERRAIN_ELEVATION_GRID_SCHEMA_VERSION);
  assert.equal(grid.gridSize, 51);
  assert.equal(grid.spacingM, 10);
  assert.equal(grid.cells.length, 2601);
  assert.deepEqual(grid.orientation, {
    rowOrder: "north-to-south",
    columnOrder: "west-to-east",
  });
  assert.equal(grid.cells[0].row, 0);
  assert.equal(grid.cells[0].column, 0);
  assert.equal(grid.cells[0].northOffsetM, 250);
  assert.equal(grid.cells[0].eastOffsetM, -250);
  assert.equal(grid.quality.missingElevationCount, 0);
  assert.equal(grid.provenance.kind, "external-service");
  assert.doesNotThrow(() => JSON.stringify(grid));
});

test("validated raster procedure classifies flat terrain as T1", () => {
  const result = classifyNTC2018Topography({ terrainGrid: buildGrid() });
  const classification = result.outputs.classification;

  assert.equal(result instanceof CalculationResult, true);
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.schemaVersion, "ntc2018-topographic-classification/v1");
  assert.equal(classification.class, "T1");
  assert.equal(classification.amplificationFactorST, 1);
  assert.equal(classification.mode, "full-article");
  assert.equal(classification.isArticleCompliant, true);
  assert.equal(classification.preprocessingMode, "article-40m-smoothed");
  assert.ok(classification.slopeDeg < 0.1);
  assert.equal(classification.ridgeAtCenter, false);
  assert.deepEqual(result.outputs.terrainGrid.datasetSources, ["TINITALY"]);
  assert.deepEqual(result.outputs.terrainGrid.sourceResolutionsM, [10]);
  assert.equal(result.metadata.networkAccessPerformed, false);
  assert.doesNotThrow(() => JSON.stringify(result.toJSON()));
});

test("validated raster procedure classifies a steep non-ridge slope as T2", () => {
  const terrainGrid = buildGrid({
    elevationAt: ({ x }) => 220 + Math.tan((20 * Math.PI) / 180) * x,
  });
  const result = classifyNTC2018Topography({ terrainGrid });
  const classification = result.outputs.classification;

  assert.equal(result.status, "ok");
  assert.equal(classification.class, "T2");
  assert.equal(classification.amplificationFactorST, 1.2);
  assert.ok(classification.slopeDeg > 18);
  assert.ok(classification.slopeDeg < 22);
  assert.equal(classification.slopeDirection.direction.x, 1);
  assert.ok(Math.abs(classification.slopeDirection.direction.y) < 1e-12);
  assert.equal(classification.ridgeAtCenter, false);
});

test("validated raster procedure classifies a high ridge as T4", () => {
  const terrainGrid = buildGrid({
    elevationAt: ({ x, y }) =>
      200 +
      240 *
        Math.exp(-(x * x) / (2 * 40 * 40)) *
        Math.exp(-(y * y) / (2 * 260 * 260)),
  });
  const result = classifyNTC2018Topography({ terrainGrid });
  const classification = result.outputs.classification;

  assert.equal(result.status, "ok");
  assert.equal(classification.class, "T4");
  assert.equal(classification.amplificationFactorST, 1.4);
  assert.equal(classification.ridgeAtCenter, true);
  assert.equal(classification.h30Center, true);
  assert.equal(classification.h60Center, true);
  assert.ok(classification.tpiCenterM > 5);
});

test("250 m mode remains explicitly diagnostic", () => {
  const result = classifyNTC2018Topography({
    terrainGrid: buildGrid({ gridSize: 51, radiusM: 250 }),
  });
  const classification = result.outputs.classification;

  assert.equal(result.status, "ok");
  assert.equal(classification.mode, "quick-250");
  assert.equal(classification.isArticleCompliantScale, false);
  assert.match(result.warnings.join(" "), /diagnostic/i);
});

test("more than five percent missing elevations do not yield a category", () => {
  const result = classifyNTC2018Topography({
    terrainGrid: buildGrid({
      mutatePoint: (point, index) => index < 620
        ? {
            ...point,
            elevation: null,
            elevation_m: null,
            nodata: true,
          }
        : point,
    }),
  });

  assert.equal(result.status, "not-verified");
  assert.equal(result.outputs.classification.class, null);
  assert.equal(result.outputs.classification.isReliable, false);
  assert.match(result.warnings.join(" "), /5%/);
});

test("method metadata exposes the validated numerical scope", () => {
  assert.equal(
    NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD.id,
    "mascandola-et-al-2021",
  );
  assert.equal(NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD.rawCellSizeM, 10);
  assert.equal(NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD.fullScaleRadiusM, 500);
  assert.deepEqual(
    NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD.supportedGridSizes,
    [51, 101],
  );
});
