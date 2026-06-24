import { CrossSection } from "./CrossSection.js";
import { createSteelProfileSection } from "./createSteelProfileSection.js";
import { STEEL_PROFILE_AXIS_CONVENTION } from "./steelProfileCatalog.js";
import {
  calculateSectionMassProperties,
  rotateSecondMoments,
} from "./SectionMassProperties.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });
const PRODUCT_TOLERANCE = 1e-6;

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function angleToRadians(value = 0, units = "rad") {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return units === "deg" ? (value * Math.PI) / 180 : value;
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function mirroredProduct(productOfInertiaYZ, mirrorY, mirrorZ) {
  const sign = (mirrorY ? -1 : 1) * (mirrorZ ? -1 : 1);
  return sign * finiteOrZero(productOfInertiaYZ);
}

function transformPoint({ y, z }, {
  centroidY,
  centroidZ,
  mirrorY,
  mirrorZ,
  rotation,
}) {
  const localY = mirrorY ? -y : y;
  const localZ = mirrorZ ? -z : z;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);

  return {
    y: centroidY + localY * c - localZ * s,
    z: centroidZ + localY * s + localZ * c,
  };
}

function boundsFromPoints(points) {
  return {
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxZ: Math.max(...points.map((point) => point.z)),
  };
}

function sectionDimensions(section) {
  const h = section.height ?? section.convertedCatalogProperties?.h;
  const b = section.width ?? section.convertedCatalogProperties?.b;
  const tw = section.webThickness ?? section.convertedCatalogProperties?.tw;
  const tf = section.flangeThickness ?? section.convertedCatalogProperties?.tf;

  return { h, b, tw, tf };
}

function upnOutline(section) {
  const { h, b, tw, tf } = sectionDimensions(section);

  if (![h, b, tw, tf].every(isFinitePositive)) {
    return null;
  }

  return [
    { y: 0, z: 0 },
    { y: 0, z: b },
    { y: tf, z: b },
    { y: tf, z: tw },
    { y: h - tf, z: tw },
    { y: h - tf, z: b },
    { y: h, z: b },
    { y: h, z: 0 },
  ];
}

function angleOutline(section) {
  const { h, b, tw, tf } = sectionDimensions(section);
  const t = Math.max(tw ?? 0, tf ?? 0);

  if (![h, b, t].every(isFinitePositive)) {
    return null;
  }

  return [
    { y: 0, z: 0 },
    { y: 0, z: b },
    { y: t, z: b },
    { y: t, z: t },
    { y: h, z: t },
    { y: h, z: 0 },
  ];
}

function fallbackOutline(section) {
  const { h, b } = sectionDimensions(section);

  if (![h, b].every(isFinitePositive)) {
    return null;
  }

  return [
    { y: -h / 2, z: -b / 2 },
    { y: -h / 2, z: b / 2 },
    { y: h / 2, z: b / 2 },
    { y: h / 2, z: -b / 2 },
  ];
}

function nominalOutline(section) {
  const family = String(section?.family ?? "").toUpperCase();

  if (family === "UPN") {
    return upnOutline(section);
  }

  if (family === "L" || family === "LU") {
    return angleOutline(section);
  }

  return fallbackOutline(section);
}

function centeredNominalGeometry(section) {
  const outline = nominalOutline(section);

  if (!outline) {
    const { h, b } = sectionDimensions(section);

    if (![h, b].every(isFinitePositive)) {
      throw new Error(`Compound steel component ${section.profileName ?? section.name} requires height and width.`);
    }

    return {
      centroidY: 0,
      centroidZ: 0,
      productOfInertiaYZ: 0,
      points: fallbackOutline(section),
      bounds: {
        minY: -h / 2,
        maxY: h / 2,
        minZ: -b / 2,
        maxZ: b / 2,
      },
      metadata: {
        source: "fallback-bounding-box",
      },
    };
  }

  const properties = calculateSectionMassProperties({ points: outline });
  const centeredPoints = outline.map((point) => ({
    y: point.y - properties.centroidY,
    z: point.z - properties.centroidZ,
  }));

  return {
    centroidY: properties.centroidY,
    centroidZ: properties.centroidZ,
    productOfInertiaYZ: properties.productOfInertiaYZ,
    points: centeredPoints,
    bounds: boundsFromPoints(centeredPoints),
    metadata: {
      source: "nominal-profile-outline",
      family: section.family,
    },
  };
}

function localProductOfInertia(section, geometry) {
  return finiteOrZero(
    section.productOfInertiaYZ ??
      section.convertedCatalogProperties?.Iyz ??
      section.metadata?.productOfInertiaYZ ??
      geometry.productOfInertiaYZ,
  );
}

function resolveComponentSection(component, defaultUnits) {
  if (component.section) {
    return component.section;
  }

  if (!component.profileName) {
    throw new Error("Compound steel components require either section or profileName.");
  }

  return createSteelProfileSection({
    profileName: component.profileName,
    units: defaultUnits,
  });
}

function normalizeComponent(component, index, resolver, defaultUnits) {
  const section = resolveComponentSection(component, defaultUnits);
  const geometry = centeredNominalGeometry(section);
  const rotation = angleToRadians(
    component.rotation ?? component.alpha ?? 0,
    component.rotationUnits ?? component.angleUnits ?? "rad",
  );
  const mirrorY = Boolean(component.mirrorY);
  const mirrorZ = Boolean(component.mirrorZ);
  const centroidY = resolver.length(component.centroidY ?? component.y ?? 0);
  const centroidZ = resolver.length(component.centroidZ ?? component.z ?? 0);
  const localProduct = mirroredProduct(
    localProductOfInertia(section, geometry),
    mirrorY,
    mirrorZ,
  );
  const rotated = rotateSecondMoments({
    inertiaY: section.inertiaY,
    inertiaZ: section.inertiaZ,
    productOfInertiaYZ: localProduct,
    alpha: rotation,
  });
  const transformedPoints = geometry.points.map((point) =>
    transformPoint(point, {
      centroidY,
      centroidZ,
      mirrorY,
      mirrorZ,
      rotation,
    }));

  return {
    id: component.id ?? `component-${index + 1}`,
    role: component.role ?? "generic",
    section,
    profileName: section.profileName ?? component.profileName ?? null,
    family: section.family ?? null,
    centroidY,
    centroidZ,
    rotation,
    mirrorY,
    mirrorZ,
    area: section.area,
    inertiaY: rotated.inertiaY,
    inertiaZ: rotated.inertiaZ,
    productOfInertiaYZ:
      Math.abs(rotated.productOfInertiaYZ) <= PRODUCT_TOLERANCE
        ? 0
        : rotated.productOfInertiaYZ,
    torsionalConstant: section.torsionalConstant,
    shearAreaY: section.shearAreaY,
    shearAreaZ: section.shearAreaZ,
    massPerLength: section.massPerLength,
    transformedPoints,
    bounds: boundsFromPoints(transformedPoints),
    localGeometry: {
      centroidY: geometry.centroidY,
      centroidZ: geometry.centroidZ,
      bounds: geometry.bounds,
      metadata: geometry.metadata,
    },
    metadata: {
      ...component.metadata,
    },
  };
}

function maxDistance(values, centroid) {
  return Math.max(...values.map((value) => Math.abs(value - centroid)));
}

function calculateCompoundProperties(components) {
  const area = components.reduce((sum, component) => sum + component.area, 0);

  if (!isFinitePositive(area)) {
    throw new Error("Compound steel section requires a positive total area.");
  }

  const centroidY =
    components.reduce(
      (sum, component) => sum + component.area * component.centroidY,
      0,
    ) / area;
  const centroidZ =
    components.reduce(
      (sum, component) => sum + component.area * component.centroidZ,
      0,
    ) / area;
  const inertiaY = components.reduce(
    (sum, component) =>
      sum +
      component.inertiaY +
      component.area * (component.centroidY - centroidY) ** 2,
    0,
  );
  const inertiaZ = components.reduce(
    (sum, component) =>
      sum +
      component.inertiaZ +
      component.area * (component.centroidZ - centroidZ) ** 2,
    0,
  );
  const productOfInertiaYZ = components.reduce(
    (sum, component) =>
      sum +
      component.productOfInertiaYZ +
      component.area *
        (component.centroidY - centroidY) *
        (component.centroidZ - centroidZ),
    0,
  );
  const minY = Math.min(...components.map((component) => component.bounds.minY));
  const maxY = Math.max(...components.map((component) => component.bounds.maxY));
  const minZ = Math.min(...components.map((component) => component.bounds.minZ));
  const maxZ = Math.max(...components.map((component) => component.bounds.maxZ));
  const elasticSectionModulusY = inertiaY / maxDistance([minY, maxY], centroidY);
  const elasticSectionModulusZ = inertiaZ / maxDistance([minZ, maxZ], centroidZ);

  return {
    area,
    centroidY,
    centroidZ,
    inertiaY,
    inertiaZ,
    productOfInertiaYZ:
      Math.abs(productOfInertiaYZ) <= PRODUCT_TOLERANCE ? 0 : productOfInertiaYZ,
    torsionalConstant: components.reduce(
      (sum, component) => sum + finiteOrZero(component.torsionalConstant),
      0,
    ),
    shearAreaY: components.reduce(
      (sum, component) => sum + finiteOrZero(component.shearAreaY),
      0,
    ),
    shearAreaZ: components.reduce(
      (sum, component) => sum + finiteOrZero(component.shearAreaZ),
      0,
    ),
    massPerLength: components.reduce(
      (sum, component) => sum + finiteOrZero(component.massPerLength),
      0,
    ),
    elasticSectionModulusY,
    elasticSectionModulusZ,
    height: maxY - minY,
    width: maxZ - minZ,
    bounds: {
      minY,
      maxY,
      minZ,
      maxZ,
    },
    outlinePoints: [
      { y: minY, z: minZ },
      { y: minY, z: maxZ },
      { y: maxY, z: maxZ },
      { y: maxY, z: minZ },
    ],
  };
}

export class SteelCompoundProfileSection extends CrossSection {
  constructor({
    id = null,
    name = "Compound steel profile section",
    components,
    units = null,
    metadata = {},
  }) {
    assertExplicitUnitSystem(units, "SteelCompoundProfileSection");

    if (!Array.isArray(components) || components.length === 0) {
      throw new Error("SteelCompoundProfileSection requires at least one component.");
    }

    const resolver = createUnitResolver(units, INTERNAL_UNITS);
    const resolvedComponents = components.map((component, index) =>
      normalizeComponent(component, index, resolver, units));
    const properties = calculateCompoundProperties(resolvedComponents);

    super({
      id,
      name,
      area: properties.area,
      centroidY: properties.centroidY,
      centroidZ: properties.centroidZ,
      inertiaY: properties.inertiaY,
      inertiaZ: properties.inertiaZ,
      productOfInertiaYZ: properties.productOfInertiaYZ,
      torsionalConstant: properties.torsionalConstant,
      shearAreaY: properties.shearAreaY,
      shearAreaZ: properties.shearAreaZ,
      elasticSectionModulusY: properties.elasticSectionModulusY,
      elasticSectionModulusZ: properties.elasticSectionModulusZ,
      height: properties.height,
      width: properties.width,
      outlinePoints: properties.outlinePoints,
      units: INTERNAL_UNITS,
      metadata: {
        ...metadata,
        shape: "steel-compound-profile",
        componentCount: resolvedComponents.length,
        bounds: properties.bounds,
        plasticModulusModel: "not-computed",
        torsionModel: "sum-of-component-st-venant-constants",
        axisConvention: STEEL_PROFILE_AXIS_CONVENTION,
        sourceUnitSystem: resolver.sourceUnitSystem,
      },
    });

    this.components = resolvedComponents;
    this.family = "COMPOUND";
    this.profileName = id ?? name;
    this.massPerLength = properties.massPerLength;
    this.bounds = { ...properties.bounds };
    this.axisConvention = STEEL_PROFILE_AXIS_CONVENTION;
    this.inertiaAboutY = properties.inertiaZ;
    this.inertiaAboutZ = properties.inertiaY;
    this.inertiaYY = properties.inertiaZ;
    this.inertiaZZ = properties.inertiaY;
    this.elasticSectionModulusAboutY = properties.elasticSectionModulusZ;
    this.elasticSectionModulusAboutZ = properties.elasticSectionModulusY;
    this.elasticSectionModulusYY = properties.elasticSectionModulusZ;
    this.elasticSectionModulusZZ = properties.elasticSectionModulusY;
    this.shearAreaAlongY = properties.shearAreaY;
    this.shearAreaAlongZ = properties.shearAreaZ;
  }

  getComponent(role) {
    return this.components.find((component) => component.role === role) ?? null;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      family: this.family,
      profileName: this.profileName,
      massPerLength: this.massPerLength,
      bounds: { ...this.bounds },
      axisConvention: { ...this.axisConvention },
      inertiaAboutY: this.inertiaAboutY,
      inertiaAboutZ: this.inertiaAboutZ,
      inertiaYY: this.inertiaYY,
      inertiaZZ: this.inertiaZZ,
      elasticSectionModulusAboutY: this.elasticSectionModulusAboutY,
      elasticSectionModulusAboutZ: this.elasticSectionModulusAboutZ,
      elasticSectionModulusYY: this.elasticSectionModulusYY,
      elasticSectionModulusZZ: this.elasticSectionModulusZZ,
      shearAreaAlongY: this.shearAreaAlongY,
      shearAreaAlongZ: this.shearAreaAlongZ,
      components: this.components.map((component) => ({
        id: component.id,
        role: component.role,
        profileName: component.profileName,
        family: component.family,
        centroidY: component.centroidY,
        centroidZ: component.centroidZ,
        rotation: component.rotation,
        mirrorY: component.mirrorY,
        mirrorZ: component.mirrorZ,
        bounds: { ...component.bounds },
        metadata: { ...component.metadata },
      })),
    };
  }
}

export function createSteelCompoundProfileSection(options) {
  return new SteelCompoundProfileSection(options);
}

export function createDoubleUPNBackToBackSection({
  profileName,
  gap = 0,
  webGap = gap,
  units = null,
  id = null,
  name = null,
  metadata = {},
} = {}) {
  assertExplicitUnitSystem(units, "createDoubleUPNBackToBackSection");

  const baseSection = createSteelProfileSection({ profileName, units });

  if (baseSection.family !== "UPN") {
    throw new Error("createDoubleUPNBackToBackSection requires a UPN profile.");
  }

  const resolver = createUnitResolver(units, INTERNAL_UNITS);
  const resolvedGap = resolver.length(webGap);
  const geometry = centeredNominalGeometry(baseSection);
  const centroidFromBack = geometry.centroidZ;

  if (!Number.isFinite(resolvedGap) || resolvedGap < 0) {
    throw new Error("Double UPN back-to-back gap must be a non-negative length.");
  }

  return new SteelCompoundProfileSection({
    id: id ?? `2${profileName}-BACK-TO-BACK`,
    name: name ?? `2${profileName} dorso-dorso`,
    units: INTERNAL_UNITS,
    components: [
      {
        id: `${profileName}-left`,
        role: "left-channel",
        section: baseSection,
        centroidY: 0,
        centroidZ: -(resolvedGap / 2 + centroidFromBack),
        mirrorZ: true,
      },
      {
        id: `${profileName}-right`,
        role: "right-channel",
        section: baseSection,
        centroidY: 0,
        centroidZ: resolvedGap / 2 + centroidFromBack,
      },
    ],
    metadata: {
      ...metadata,
      layout: "double-upn-back-to-back",
      baseProfileName: profileName,
      gap: resolvedGap,
      gapDefinition: "clear distance between external UPN web backs",
    },
  });
}

export function createDoubleAngleOpposedSection({
  profileName,
  separationY = 0,
  separationZ = 0,
  gapY = separationY,
  gapZ = separationZ,
  units = null,
  id = null,
  name = null,
  metadata = {},
} = {}) {
  assertExplicitUnitSystem(units, "createDoubleAngleOpposedSection");

  const baseSection = createSteelProfileSection({ profileName, units });

  if (baseSection.family !== "L" && baseSection.family !== "LU") {
    throw new Error("createDoubleAngleOpposedSection requires an L or LU profile.");
  }

  const resolver = createUnitResolver(units, INTERNAL_UNITS);
  const resolvedSeparationY = resolver.length(gapY);
  const resolvedSeparationZ = resolver.length(gapZ);
  const geometry = centeredNominalGeometry(baseSection);

  if (
    !Number.isFinite(resolvedSeparationY) ||
    !Number.isFinite(resolvedSeparationZ)
  ) {
    throw new Error("Double angle opposed section requires finite separationY and separationZ.");
  }

  const firstHeelY = -resolvedSeparationY / 2;
  const firstHeelZ = -resolvedSeparationZ / 2;
  const secondHeelY = resolvedSeparationY / 2;
  const secondHeelZ = resolvedSeparationZ / 2;

  return new SteelCompoundProfileSection({
    id: id ?? `2${profileName}-OPPOSED`,
    name: name ?? `2${profileName} contrapposti`,
    units: INTERNAL_UNITS,
    components: [
      {
        id: `${profileName}-first`,
        role: "first-angle",
        section: baseSection,
        centroidY: firstHeelY + geometry.centroidY,
        centroidZ: firstHeelZ + geometry.centroidZ,
      },
      {
        id: `${profileName}-opposed`,
        role: "opposed-angle",
        section: baseSection,
        centroidY: secondHeelY - geometry.centroidY,
        centroidZ: secondHeelZ - geometry.centroidZ,
        mirrorY: true,
        mirrorZ: true,
      },
    ],
    metadata: {
      ...metadata,
      layout: "double-angle-opposed",
      baseProfileName: profileName,
      separationY: resolvedSeparationY,
      separationZ: resolvedSeparationZ,
      separationDefinition: "distance between the two angle heel vertices before opposition",
    },
  });
}
