import { CrossSection } from "./CrossSection.js";
import { createUnitResolver } from "../units/UnitSystem.js";

export class RectangularSection extends CrossSection {
  constructor({
    width,
    height,
    id = null,
    name = null,
    units = null,
    metadata = {},
  }) {
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });
    const resolvedWidth = unitResolver.length(width);
    const resolvedHeight = unitResolver.length(height);

    if (!Number.isFinite(resolvedWidth) || resolvedWidth <= 0) {
      throw new Error("A positive rectangular section width is required.");
    }

    if (!Number.isFinite(resolvedHeight) || resolvedHeight <= 0) {
      throw new Error("A positive rectangular section height is required.");
    }

    const area = resolvedWidth * resolvedHeight;
    const inertiaY = (resolvedWidth * resolvedHeight ** 3) / 12;
    const inertiaZ = (resolvedHeight * resolvedWidth ** 3) / 12;

    super({
      id,
      name: name ?? `Rectangular ${resolvedWidth}x${resolvedHeight}`,
      area,
      centroidY: resolvedHeight / 2,
      centroidZ: resolvedWidth / 2,
      inertiaY,
      inertiaZ,
      elasticSectionModulusY: inertiaY / (resolvedHeight / 2),
      elasticSectionModulusZ: inertiaZ / (resolvedWidth / 2),
      height: resolvedHeight,
      width: resolvedWidth,
      outlinePoints: [
        { y: 0, z: 0 },
        { y: 0, z: resolvedWidth },
        { y: resolvedHeight, z: resolvedWidth },
        { y: resolvedHeight, z: 0 },
      ],
      metadata: {
        ...metadata,
        shape: "rectangular",
        unitSystem: units ? unitResolver.unitSystem : metadata.unitSystem,
      },
    });
  }
}
