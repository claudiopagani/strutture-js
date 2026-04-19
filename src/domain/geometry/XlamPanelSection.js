import { CrossSection } from "./CrossSection.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });

export class XlamPanelSection extends CrossSection {
  constructor({
    id = null,
    name = "XLAM panel",
    effectiveWidth,
    layerThicknesses = [],
    activeLayerIndexes = [1, 3],
    units = null,
    metadata = {},
  }) {
    assertExplicitUnitSystem(units, "XlamPanelSection");
    const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
    const resolvedEffectiveWidth = unitResolver.length(effectiveWidth);
    const resolvedLayerThicknesses = layerThicknesses.map((thickness) =>
      unitResolver.length(thickness));

    if (!Number.isFinite(resolvedEffectiveWidth) || resolvedEffectiveWidth <= 0) {
      throw new Error("A positive XLAM effectiveWidth is required.");
    }

    if (!Array.isArray(resolvedLayerThicknesses) || resolvedLayerThicknesses.length === 0) {
      throw new Error("XLAM layerThicknesses are required.");
    }

    const layers = resolvedLayerThicknesses.map((thickness, index) => ({
      index,
      thickness: Number(thickness) || 0,
      active: activeLayerIndexes.includes(index),
    }));

    const activeLayers = layers.filter((layer) => layer.active && layer.thickness > 0);

    if (activeLayers.length === 0) {
      throw new Error("XLAM panel requires at least one active parallel layer.");
    }

    let currentY = 0;
    const layersWithPosition = layers.map((layer) => {
      const startY = currentY;
      currentY += layer.thickness;

      return {
        ...layer,
        startY,
        centroidY: startY + layer.thickness / 2,
      };
    });

    const activeArea = activeLayers.reduce(
      (sum, layer) => sum + resolvedEffectiveWidth * layer.thickness,
      0,
    );

    const centroidY =
      layersWithPosition
        .filter((layer) => layer.active && layer.thickness > 0)
        .reduce(
          (sum, layer) => sum + resolvedEffectiveWidth * layer.thickness * layer.centroidY,
          0,
        ) / activeArea;

    const inertiaY = layersWithPosition
      .filter((layer) => layer.active && layer.thickness > 0)
      .reduce((sum, layer) => {
        const own = (resolvedEffectiveWidth * layer.thickness ** 3) / 12;
        const shift = resolvedEffectiveWidth * layer.thickness * (layer.centroidY - centroidY) ** 2;

        return sum + own + shift;
      }, 0);

    super({
      id,
      name,
      area: activeArea,
      centroidY,
      centroidZ: resolvedEffectiveWidth / 2,
      inertiaY,
      inertiaZ: activeArea * resolvedEffectiveWidth ** 2 / 12,
      elasticSectionModulusY:
        inertiaY /
        Math.max(centroidY, currentY - centroidY),
      elasticSectionModulusZ:
        (activeArea * resolvedEffectiveWidth ** 2 / 12) / (resolvedEffectiveWidth / 2),
      height: currentY,
      width: resolvedEffectiveWidth,
      units: INTERNAL_UNITS,
      metadata: {
        ...metadata,
        shape: "xlam-panel",
        layerThicknesses: [...resolvedLayerThicknesses],
        activeLayerIndexes: [...activeLayerIndexes],
        unitSystem: INTERNAL_UNITS,
        sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
      },
    });

    this.effectiveWidth = resolvedEffectiveWidth;
    this.layerThicknesses = [...resolvedLayerThicknesses];
    this.activeLayerIndexes = [...activeLayerIndexes];
    this.layers = layersWithPosition;
    this.activeLayers = layersWithPosition.filter(
      (layer) => layer.active && layer.thickness > 0,
    );
  }

  activeThickness() {
    return this.activeLayers.reduce((sum, layer) => sum + layer.thickness, 0);
  }

  longitudinalLayers() {
    return this.layers.filter((layer) => layer.active && layer.thickness > 0);
  }

  crossLayers() {
    return this.layers.filter((layer) => !layer.active && layer.thickness > 0);
  }

  totalThickness() {
    return this.layerThicknesses.reduce((sum, thickness) => sum + thickness, 0);
  }

  calculateBendingStiffness(material, { includeCrossLayerBending = false } = {}) {
    const e0 = material.e0Mean ?? material.elasticModulus;
    const e90 = includeCrossLayerBending ? material.e90Mean ?? e0 / 30 : 0;

    const centroidY = this.centroidY;

    return this.layers.reduce((sum, layer) => {
      if (layer.thickness <= 0) {
        return sum;
      }

      const modulus = layer.active ? e0 : e90;
      const area = this.effectiveWidth * layer.thickness;
      const ownInertia = (this.effectiveWidth * layer.thickness ** 3) / 12;
      const shift = area * (layer.centroidY - centroidY) ** 2;

      return sum + modulus * (ownInertia + shift);
    }, 0);
  }

  calculateSystemStrengthFactor(boardCount, referenceBoardWidth = 250) {
    if (!Number.isFinite(boardCount) || boardCount <= 1) {
      return 1;
    }

    void referenceBoardWidth;
    return Math.min(1 + 0.025 * boardCount, 1.1);
  }

  calculateShearStiffness(material, { slicesPerLayer = 20 } = {}) {
    const e0 = material.e0Mean ?? material.elasticModulus;
    const e90 = material.e90Mean ?? e0 / 30;
    const g0 = material.g0Mean ?? e0 / 16;
    const g90 = material.g90Mean ?? g0 / 10;

    const totalHeight = this.totalThickness();
    const layerByY = (y) =>
      this.layers.find((layer) => y >= layer.startY && y <= layer.startY + layer.thickness) ??
      this.layers[this.layers.length - 1];

    let denominatorIntegral = 0;
    let shearAreaWeighted = 0;

    for (const layer of this.layers) {
      if (layer.thickness <= 0) {
        continue;
      }

      const dz = layer.thickness / slicesPerLayer;

      for (let slice = 0; slice < slicesPerLayer; slice += 1) {
        const y = layer.startY + (slice + 0.5) * dz;
        const currentLayer = layerByY(y);
        const modulus = currentLayer.active ? e0 : e90;
        const shearModulus = currentLayer.active ? g0 : g90;

        let staticMoment = 0;
        for (const upperLayer of this.layers) {
          if (upperLayer.thickness <= 0) {
            continue;
          }

          const top = upperLayer.startY + upperLayer.thickness;
          const bottom = upperLayer.startY;

          if (top <= y) {
            continue;
          }

          const contributingThickness =
            bottom >= y ? upperLayer.thickness : top - y;
          const centroid =
            bottom >= y ? upperLayer.centroidY : y + contributingThickness / 2;
          const localModulus = upperLayer.active ? e0 : e90;
          const area = this.effectiveWidth * contributingThickness;
          staticMoment += localModulus * area * (centroid - this.centroidY);
        }

        denominatorIntegral +=
          ((staticMoment ** 2) / (shearModulus * this.effectiveWidth)) * dz;
        shearAreaWeighted += shearModulus * this.effectiveWidth * dz;
      }
    }

    const bendingStiffness = this.calculateBendingStiffness(material);
    const shearCorrectionCoefficient =
      bendingStiffness / (shearAreaWeighted * denominatorIntegral);
    const shearStiffness = shearCorrectionCoefficient * shearAreaWeighted;

    return {
      bendingStiffness,
      shearAreaWeighted,
      shearCorrectionCoefficient,
      shearStiffness,
      slendernessLimitForApproximateMethod: 15,
      totalHeight,
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      effectiveWidth: this.effectiveWidth,
      layerThicknesses: [...this.layerThicknesses],
      activeLayerIndexes: [...this.activeLayerIndexes],
      layers: this.layers.map((layer) => ({ ...layer })),
    };
  }
}
