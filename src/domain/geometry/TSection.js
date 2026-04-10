import { CrossSection } from "./CrossSection.js";
import { createUnitResolver } from "../units/UnitSystem.js";

export class TSection extends CrossSection {
  constructor({
    flangeWidth,
    flangeThickness,
    webWidth,
    webHeight,
    id = null,
    name = null,
    units = null,
    metadata = {},
  }) {
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });
    const resolvedFlangeWidth = unitResolver.length(flangeWidth);
    const resolvedFlangeThickness = unitResolver.length(flangeThickness);
    const resolvedWebWidth = unitResolver.length(webWidth);
    const resolvedWebHeight = unitResolver.length(webHeight);

    if (!Number.isFinite(resolvedFlangeWidth) || resolvedFlangeWidth <= 0) {
      throw new Error("A positive T-section flangeWidth is required.");
    }

    if (!Number.isFinite(resolvedFlangeThickness) || resolvedFlangeThickness <= 0) {
      throw new Error("A positive T-section flangeThickness is required.");
    }

    if (!Number.isFinite(resolvedWebWidth) || resolvedWebWidth <= 0) {
      throw new Error("A positive T-section webWidth is required.");
    }

    if (!Number.isFinite(resolvedWebHeight) || resolvedWebHeight <= 0) {
      throw new Error("A positive T-section webHeight is required.");
    }

    if (resolvedWebWidth > resolvedFlangeWidth) {
      throw new Error("T-section webWidth cannot exceed flangeWidth.");
    }

    const flangeArea = resolvedFlangeWidth * resolvedFlangeThickness;
    const webArea = resolvedWebWidth * resolvedWebHeight;
    const area = flangeArea + webArea;
    const totalHeight = resolvedFlangeThickness + resolvedWebHeight;

    const flangeCentroidY = resolvedWebHeight + resolvedFlangeThickness / 2;
    const webCentroidY = resolvedWebHeight / 2;
    const centroidY =
      (flangeArea * flangeCentroidY + webArea * webCentroidY) / area;

    const inertiaY =
      (resolvedFlangeWidth * resolvedFlangeThickness ** 3) / 12 +
      flangeArea * (flangeCentroidY - centroidY) ** 2 +
      (resolvedWebWidth * resolvedWebHeight ** 3) / 12 +
      webArea * (webCentroidY - centroidY) ** 2;

    const inertiaZ =
      (resolvedFlangeThickness * resolvedFlangeWidth ** 3) / 12 +
      (resolvedWebHeight * resolvedWebWidth ** 3) / 12;

    super({
      id,
      name:
        name ??
        `T ${resolvedFlangeWidth}x${resolvedFlangeThickness}/${resolvedWebWidth}x${resolvedWebHeight}`,
      area,
      centroidY,
      centroidZ: resolvedFlangeWidth / 2,
      inertiaY,
      inertiaZ,
      elasticSectionModulusY:
        inertiaY / Math.max(totalHeight - centroidY, centroidY),
      elasticSectionModulusZ: inertiaZ / (resolvedFlangeWidth / 2),
      height: totalHeight,
      width: resolvedFlangeWidth,
      outlinePoints: [
        { y: 0, z: (resolvedFlangeWidth - resolvedWebWidth) / 2 },
        { y: 0, z: (resolvedFlangeWidth + resolvedWebWidth) / 2 },
        { y: resolvedWebHeight, z: (resolvedFlangeWidth + resolvedWebWidth) / 2 },
        { y: resolvedWebHeight, z: resolvedFlangeWidth },
        { y: totalHeight, z: resolvedFlangeWidth },
        { y: totalHeight, z: 0 },
        { y: resolvedWebHeight, z: 0 },
        { y: resolvedWebHeight, z: (resolvedFlangeWidth - resolvedWebWidth) / 2 },
      ],
      metadata: {
        ...metadata,
        shape: "t-section",
        unitSystem: units ? unitResolver.unitSystem : metadata.unitSystem,
      },
    });

    this.flangeWidth = resolvedFlangeWidth;
    this.flangeThickness = resolvedFlangeThickness;
    this.webWidth = resolvedWebWidth;
    this.webHeight = resolvedWebHeight;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      flangeWidth: this.flangeWidth,
      flangeThickness: this.flangeThickness,
      webWidth: this.webWidth,
      webHeight: this.webHeight,
    };
  }
}
