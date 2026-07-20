import {
  calculateNTC2018MasonryPierFlexuralCapacity,
  calculateNTC2018MasonryPierIrregularDiagonalCapacity,
  calculateNTC2018MasonryPierRegularDiagonalCapacity,
  calculateNTC2018MasonryPierSlidingCapacity,
  selectNTC2018MasonryPierGoverningCapacity,
} from "./ntc2018MasonryPierCapacity.js";
import { calculateNTC2018MasonryPierUltimateDisplacement } from "./ntc2018MasonryPierDeformation.js";
import { calculateNTC2018MasonryPierElasticStiffness } from "./ntc2018MasonryPierStiffness.js";

function normalizeTexture(value = "irregular") {
  const normalized = String(value).trim().toLowerCase();

  if (normalized !== "irregular" && normalized !== "regular") {
    throw new Error(`Unsupported masonryTexture: ${value}.`);
  }

  return normalized;
}

function responseAtDisplacement({ displacement, stiffness, resistance, yieldDisplacement, ultimateDisplacement }) {
  if (!Number.isFinite(displacement)) return null;

  const sign = displacement < 0 ? -1 : 1;
  const absoluteDisplacement = Math.abs(displacement);

  if (absoluteDisplacement > ultimateDisplacement) {
    return {
      displacement,
      force: 0,
      tangent: 0,
      branch: "failed",
    };
  }

  if (absoluteDisplacement <= yieldDisplacement) {
    return {
      displacement,
      force: stiffness * displacement,
      tangent: stiffness,
      branch: "elastic",
    };
  }

  return {
    displacement,
    force: sign * resistance,
    tangent: 0,
    branch: "plastic-plateau",
  };
}
/**
 * Pure NTC 2018 / Circular 2019 bilinear pier evaluator. All inputs must use a
 * coherent unit system and resistance inputs must already be the values to use
 * in nonlinear analysis (mean values, divided by FC for existing construction).
 */
export function evaluateNTC2018MasonryPier({
  geometry,
  material,
  actions,
  options = {},
  lateralDisplacement = null,
}) {
  const texture = normalizeTexture(options.masonryTexture);
  const length = geometry.length;
  const height = geometry.height;
  const thickness = geometry.thickness;
  const deformableHeight = geometry.deformableHeight ?? height;
  const boundaryCondition = options.boundaryCondition ?? "cantilever";
  const shearSpan = options.shearSpan ??
    (boundaryCondition === "fixed-fixed" ? height / 2 : height);
  const axialCompression = Math.max(0, actions.axialCompression ?? 0);
  const shearAxialCompression = Math.max(
    0,
    actions.shearAxialCompression ?? axialCompression,
  );
  const flexural = calculateNTC2018MasonryPierFlexuralCapacity({
    axialCompression,
    compressiveStrength: material.compressiveStrength,
    length,
    thickness,
    shearSpan,
  });
  const sliding = calculateNTC2018MasonryPierSlidingCapacity({
    axialCompression: shearAxialCompression,
    cohesion: material.cohesion,
    shearStrengthLimit: material.shearStrengthLimit,
    length,
    thickness,
    shearSpan,
  });
  const diagonal = texture === "regular"
    ? calculateNTC2018MasonryPierRegularDiagonalCapacity({
        axialCompression: shearAxialCompression,
        cohesion: material.cohesion,
        interlockingCoefficient: material.interlockingCoefficient,
        localFrictionCoefficient: material.localFrictionCoefficient,
        blockTensileStrength: material.blockTensileStrength,
        length,
        thickness,
        height,
      })
    : calculateNTC2018MasonryPierIrregularDiagonalCapacity({
        axialCompression: shearAxialCompression,
        referenceShearStrength: material.referenceShearStrength,
        diagonalTensileStrength: material.diagonalTensileStrength,
        length,
        thickness,
        height,
      });
  const capacities = [flexural, sliding, diagonal];
  const missing = capacities
    .filter((capacity) => !capacity.available)
    .map((capacity) => ({
      mechanism: capacity.mechanism,
      parameters: capacity.missing,
    }));
  const governing = missing.length === 0
    ? selectNTC2018MasonryPierGoverningCapacity(capacities)
    : null;

  let stiffness = null;
  const stiffnessMissing = [];

  if (!Number.isFinite(material.elasticModulus) || material.elasticModulus <= 0) {
    stiffnessMissing.push("elasticModulus");
  }
  if (!Number.isFinite(material.shearModulus) || material.shearModulus <= 0) {
    stiffnessMissing.push("shearModulus");
  }

  if (stiffnessMissing.length === 0) {
    stiffness = calculateNTC2018MasonryPierElasticStiffness({
      elasticModulus: material.elasticModulus,
      shearModulus: material.shearModulus,
      length,
      thickness,
      deformableHeight,
      boundaryCondition,
      shearCorrectionFactor: options.shearCorrectionFactor,
      crackedStiffnessFactor: options.crackedStiffnessFactor,
    });
  }

  if (!governing || !stiffness) {
    return {
      complete: false,
      geometry: { ...geometry, deformableHeight },
      actions: { axialCompression, shearAxialCompression },
      options: { ...options, masonryTexture: texture, boundaryCondition, shearSpan },
      capacities: { flexural, sliding, diagonal },
      governing: null,
      stiffness,
      deformation: null,
      yieldDisplacement: null,
      curve: [],
      response: null,
      missing: [
        ...missing,
        ...(stiffnessMissing.length > 0
          ? [{ mechanism: "elastic-stiffness", parameters: stiffnessMissing }]
          : []),
      ],
    };
  }

  const deformation = calculateNTC2018MasonryPierUltimateDisplacement({
    height,
    mechanism: governing.mechanism,
    scope: options.scope,
    modernPerforatedBlocks: options.modernPerforatedBlocks,
  });
  const yieldDisplacement = governing.capacity / stiffness.totalStiffness;
  const consistentBilinear = yieldDisplacement < deformation.ultimateDisplacement;
  const curve = consistentBilinear
    ? [
        { id: "origin", displacement: 0, force: 0 },
        { id: "yield", displacement: yieldDisplacement, force: governing.capacity },
        {
          id: "ultimate",
          displacement: deformation.ultimateDisplacement,
          force: governing.capacity,
        },
      ]
    : [];

  return {
    complete: true,
    consistentBilinear,
    geometry: { ...geometry, deformableHeight },
    actions: { axialCompression, shearAxialCompression },
    options: { ...options, masonryTexture: texture, boundaryCondition, shearSpan },
    capacities: { flexural, sliding, diagonal },
    governing,
    stiffness,
    deformation,
    yieldDisplacement,
    curve,
    response: consistentBilinear
      ? responseAtDisplacement({
          displacement: lateralDisplacement,
          stiffness: stiffness.totalStiffness,
          resistance: governing.capacity,
          yieldDisplacement,
          ultimateDisplacement: deformation.ultimateDisplacement,
        })
      : null,
    missing: [],
  };
}
