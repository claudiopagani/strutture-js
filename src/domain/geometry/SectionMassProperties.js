const DEFAULT_PRODUCT_TOLERANCE = 1e-12;

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function sectionProductOfInertia(section) {
  return finiteOrNull(
    section?.productOfInertiaYZ ??
      section?.inertiaYZ ??
      section?.Iyz ??
      section?.catalogProperties?.Iyz ??
      section?.metadata?.productOfInertiaYZ,
  );
}

function assertFinite(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`Section mass properties require a finite ${label}.`);
  }
}

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Section mass properties require a positive ${label}.`);
  }
}

function polygonPoint(point, index) {
  if (!point || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
    throw new Error(`Invalid polygon point for mass properties at index ${index}.`);
  }

  return {
    y: point.y,
    z: point.z,
  };
}

function calculatePolygonMassProperties(points) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new Error("Polygon mass properties require at least three points.");
  }

  const resolvedPoints = points.map(polygonPoint);
  let signedDoubleArea = 0;
  let centroidYFactor = 0;
  let centroidZFactor = 0;
  let inertiaYOrigin = 0;
  let inertiaZOrigin = 0;
  let productOrigin = 0;

  for (let index = 0; index < resolvedPoints.length; index += 1) {
    const current = resolvedPoints[index];
    const next = resolvedPoints[(index + 1) % resolvedPoints.length];
    const cross = current.z * next.y - next.z * current.y;

    signedDoubleArea += cross;
    centroidZFactor += (current.z + next.z) * cross;
    centroidYFactor += (current.y + next.y) * cross;
    inertiaYOrigin +=
      (current.y ** 2 + current.y * next.y + next.y ** 2) * cross;
    inertiaZOrigin +=
      (current.z ** 2 + current.z * next.z + next.z ** 2) * cross;
    productOrigin +=
      (
        2 * current.y * current.z +
        current.y * next.z +
        next.y * current.z +
        2 * next.y * next.z
      ) * cross;
  }

  const signedArea = signedDoubleArea / 2;
  const orientation = Math.sign(signedArea) || 1;
  const area = Math.abs(signedArea);

  if (area === 0) {
    throw new Error("Polygon mass properties require a non-zero area.");
  }

  const centroidZ = centroidZFactor / (6 * signedArea);
  const centroidY = centroidYFactor / (6 * signedArea);
  const inertiaY = orientation * (inertiaYOrigin / 12 - signedArea * centroidY ** 2);
  const inertiaZ = orientation * (inertiaZOrigin / 12 - signedArea * centroidZ ** 2);
  const productOfInertiaYZ =
    orientation * (productOrigin / 24 - signedArea * centroidY * centroidZ);

  return {
    area,
    centroidY,
    centroidZ,
    inertiaY: Math.abs(inertiaY),
    inertiaZ: Math.abs(inertiaZ),
    productOfInertiaYZ:
      Math.abs(productOfInertiaYZ) <= DEFAULT_PRODUCT_TOLERANCE
        ? 0
        : productOfInertiaYZ,
    metadata: {
      source: "polygon-outline",
      pointCount: resolvedPoints.length,
    },
  };
}

function calculateCompositeMassProperties(section) {
  const components = section?.components ?? [];

  if (!Array.isArray(components) || components.length === 0) {
    return null;
  }

  const transformedArea = components.reduce(
    (sum, component) => sum + component.transformedArea(),
    0,
  );

  assertPositive(transformedArea, "composite transformed area");

  const centroidY =
    components.reduce(
      (sum, component) => sum + component.transformedArea() * component.centroidY,
      0,
    ) / transformedArea;
  const centroidZ =
    components.reduce(
      (sum, component) => sum + component.transformedArea() * component.centroidZ,
      0,
    ) / transformedArea;
  const inertiaY = components.reduce((sum, component) => {
    const area = component.transformedArea();
    return (
      sum +
      component.transformedInertiaY() +
      area * (component.centroidY - centroidY) ** 2
    );
  }, 0);
  const inertiaZ = components.reduce((sum, component) => {
    const area = component.transformedArea();
    return (
      sum +
      component.transformedInertiaZ() +
      area * (component.centroidZ - centroidZ) ** 2
    );
  }, 0);
  const productOfInertiaYZ = components.reduce((sum, component) => {
    const area = component.transformedArea();
    const localProduct =
      component.modularRatio * finiteOrZero(sectionProductOfInertia(component.section));

    return (
      sum +
      localProduct +
      area * (component.centroidY - centroidY) * (component.centroidZ - centroidZ)
    );
  }, 0);

  return {
    area: transformedArea,
    centroidY,
    centroidZ,
    inertiaY,
    inertiaZ,
    productOfInertiaYZ:
      Math.abs(productOfInertiaYZ) <= DEFAULT_PRODUCT_TOLERANCE
        ? 0
        : productOfInertiaYZ,
    metadata: {
      source: "composite-transformed-components",
      componentCount: components.length,
    },
  };
}

export function rotateSecondMoments({
  inertiaY,
  inertiaZ,
  productOfInertiaYZ = 0,
  alpha = 0,
} = {}) {
  assertFinite(inertiaY, "inertiaY");
  assertFinite(inertiaZ, "inertiaZ");
  assertFinite(productOfInertiaYZ, "productOfInertiaYZ");
  assertFinite(alpha, "rotation angle alpha");

  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  const inertiaYRotated =
    inertiaY * c ** 2 + inertiaZ * s ** 2 + 2 * productOfInertiaYZ * s * c;
  const inertiaZRotated =
    inertiaY * s ** 2 + inertiaZ * c ** 2 - 2 * productOfInertiaYZ * s * c;
  const productOfInertiaYZRotated =
    (inertiaZ - inertiaY) * s * c +
    productOfInertiaYZ * (c ** 2 - s ** 2);

  return {
    inertiaY: inertiaYRotated,
    inertiaZ: inertiaZRotated,
    productOfInertiaYZ: productOfInertiaYZRotated,
    alpha,
  };
}

export function principalSecondMoments({
  inertiaY,
  inertiaZ,
  productOfInertiaYZ = 0,
} = {}) {
  assertFinite(inertiaY, "inertiaY");
  assertFinite(inertiaZ, "inertiaZ");
  assertFinite(productOfInertiaYZ, "productOfInertiaYZ");

  const average = (inertiaY + inertiaZ) / 2;
  const halfDifference = (inertiaY - inertiaZ) / 2;
  const radius = Math.sqrt(halfDifference ** 2 + productOfInertiaYZ ** 2);
  const principalInertiaMajor = average + radius;
  const principalInertiaMinor = average - radius;
  const principalAxisAngle =
    radius <= DEFAULT_PRODUCT_TOLERANCE
      ? 0
      : 0.5 * Math.atan2(2 * productOfInertiaYZ, inertiaY - inertiaZ);

  return {
    principalInertiaMajor,
    principalInertiaMinor,
    principalAxisAngle,
  };
}

export function calculateSectionMassProperties(sectionOrShape) {
  if (!sectionOrShape) {
    throw new Error("Section mass properties require a section or shape.");
  }

  const compositeProperties = calculateCompositeMassProperties(sectionOrShape);
  const outlineProperties =
    compositeProperties ??
    (
      Array.isArray(sectionOrShape.points)
        ? calculatePolygonMassProperties(sectionOrShape.points)
        : Array.isArray(sectionOrShape.outlinePoints) &&
            sectionOrShape.outlinePoints.length >= 3 &&
            sectionProductOfInertia(sectionOrShape) == null
          ? calculatePolygonMassProperties(sectionOrShape.outlinePoints)
          : null
    );
  const base = outlineProperties ?? {
    area: sectionOrShape.area,
    centroidY: sectionOrShape.centroidY,
    centroidZ: sectionOrShape.centroidZ,
    inertiaY: sectionOrShape.inertiaY,
    inertiaZ: sectionOrShape.inertiaZ,
    productOfInertiaYZ: sectionProductOfInertia(sectionOrShape) ?? 0,
    metadata: {
      source: "section-properties",
    },
  };

  assertPositive(base.area, "area");
  assertFinite(base.inertiaY, "inertiaY");
  assertFinite(base.inertiaZ, "inertiaZ");

  const principal = principalSecondMoments({
    inertiaY: base.inertiaY,
    inertiaZ: base.inertiaZ,
    productOfInertiaYZ: base.productOfInertiaYZ ?? 0,
  });

  return {
    area: base.area,
    centroidY: finiteOrNull(base.centroidY),
    centroidZ: finiteOrNull(base.centroidZ),
    inertiaY: base.inertiaY,
    inertiaZ: base.inertiaZ,
    productOfInertiaYZ: base.productOfInertiaYZ ?? 0,
    ...principal,
    radiusOfGyrationY: Math.sqrt(base.inertiaY / base.area),
    radiusOfGyrationZ: Math.sqrt(base.inertiaZ / base.area),
    metadata: {
      shape: sectionOrShape.metadata?.shape ?? sectionOrShape.shape ?? null,
      sectionId: sectionOrShape.id ?? null,
      sectionName: sectionOrShape.name ?? null,
      ...(base.metadata ?? {}),
    },
  };
}

export function resolvePrincipalSectionFrame(section) {
  const properties = calculateSectionMassProperties(section);

  return {
    alpha: properties.principalAxisAngle,
    inertiaY: properties.principalInertiaMajor,
    inertiaZ: properties.principalInertiaMinor,
    productOfInertiaYZ: 0,
    properties,
    metadata: {
      source: "section-mass-properties",
      sectionId: section?.id ?? null,
      sectionName: section?.name ?? null,
    },
  };
}
