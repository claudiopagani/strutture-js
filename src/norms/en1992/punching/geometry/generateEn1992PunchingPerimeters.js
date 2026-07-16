import { PunchingControlPerimeter } from "../../../../domain/slabs/punching/index.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });
const GEOMETRY_TOLERANCE = 1e-6;

function line(start, end) {
  return { type: "line", start, end };
}

function arc(center, radius, startAngle, sweepAngle) {
  return { type: "arc", center, radius, startAngle, sweepAngle };
}

function rectangleBounds(footprint) {
  return {
    xMin: footprint.center.x - footprint.sizeX / 2,
    xMax: footprint.center.x + footprint.sizeX / 2,
    yMin: footprint.center.y - footprint.sizeY / 2,
    yMax: footprint.center.y + footprint.sizeY / 2,
  };
}

function slabRectangleBounds(boundary) {
  if (!Array.isArray(boundary) || boundary.length !== 4) {
    throw new Error("Generated edge and corner perimeters require a four-sided rectangular slab boundary.");
  }

  const xValues = [...new Set(boundary.map((point) => point.x))];
  const yValues = [...new Set(boundary.map((point) => point.y))];

  if (xValues.length !== 2 || yValues.length !== 2) {
    throw new Error("Generated edge and corner perimeters require an axis-aligned slab boundary in the connection local frame.");
  }

  return {
    xMin: Math.min(...xValues),
    xMax: Math.max(...xValues),
    yMin: Math.min(...yValues),
    yMax: Math.max(...yValues),
  };
}

function pointInRing(point, ring) {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const first = ring[index];
    const second = ring[previous];
    const crosses = (first.y > point.y) !== (second.y > point.y)
      && point.x < (second.x - first.x) * (point.y - first.y)
        / (second.y - first.y) + first.x;

    if (crosses) {
      inside = !inside;
    }
  }

  return inside;
}

function pointSegmentDistance(point, first, second) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const denominator = dx ** 2 + dy ** 2;
  const parameter = denominator === 0
    ? 0
    : Math.min(1, Math.max(0,
      ((point.x - first.x) * dx + (point.y - first.y) * dy) / denominator));

  return Math.hypot(
    point.x - (first.x + parameter * dx),
    point.y - (first.y + parameter * dy),
  );
}

function conservativeBoundaryClearance(connection) {
  const footprint = connection.support.footprint;
  const center = footprint.center;
  const boundary = connection.slab.boundary;

  if (!pointInRing(center, boundary)) {
    return -Infinity;
  }

  const centerDistance = boundary.reduce((minimum, point, index) => {
    const next = boundary[(index + 1) % boundary.length];
    return Math.min(minimum, pointSegmentDistance(center, point, next));
  }, Infinity);
  const boundingRadius = footprint.shape === "circle"
    ? footprint.diameter / 2
    : Math.hypot(footprint.sizeX / 2, footprint.sizeY / 2);

  return centerDistance - boundingRadius;
}

function close(first, second) {
  return Math.abs(first - second) <= GEOMETRY_TOLERANCE;
}

function createPerimeter({
  id,
  codeId,
  role,
  position,
  offset,
  segments,
  closed,
  clause,
  metadata = {},
}) {
  return new PunchingControlPerimeter({
    id,
    codeId,
    role,
    position,
    offset,
    units: INTERNAL_UNITS,
    components: [{ closed, segments }],
    source: {
      method: "generated",
      standard: codeId,
      clause,
    },
    metadata,
  });
}

function interiorRectangleSegments(footprint, offset) {
  const { xMin, xMax, yMin, yMax } = rectangleBounds(footprint);
  const segments = [line(
    { x: xMin, y: yMax + offset },
    { x: xMax, y: yMax + offset },
  )];

  if (offset > 0) {
    segments.push(arc({ x: xMax, y: yMax }, offset, Math.PI / 2, -Math.PI / 2));
  }

  segments.push(line(
    { x: xMax + offset, y: yMax },
    { x: xMax + offset, y: yMin },
  ));

  if (offset > 0) {
    segments.push(arc({ x: xMax, y: yMin }, offset, 0, -Math.PI / 2));
  }

  segments.push(line(
    { x: xMax, y: yMin - offset },
    { x: xMin, y: yMin - offset },
  ));

  if (offset > 0) {
    segments.push(arc({ x: xMin, y: yMin }, offset, -Math.PI / 2, -Math.PI / 2));
  }

  segments.push(line(
    { x: xMin - offset, y: yMin },
    { x: xMin - offset, y: yMax },
  ));

  if (offset > 0) {
    segments.push(arc({ x: xMin, y: yMax }, offset, Math.PI, -Math.PI / 2));
  }

  return segments;
}

function interiorCircleSegments(footprint, offset) {
  return [arc(
    footprint.center,
    footprint.diameter / 2 + offset,
    0,
    2 * Math.PI,
  )];
}

function edgeRectangleSegments(footprint, offset, activeNormalLength) {
  const { xMax, yMin, yMax } = rectangleBounds(footprint);
  const xStart = xMax - activeNormalLength;
  const segments = [line(
    { x: xStart, y: yMax + offset },
    { x: xMax, y: yMax + offset },
  )];

  if (offset > 0) {
    segments.push(arc({ x: xMax, y: yMax }, offset, Math.PI / 2, -Math.PI / 2));
  }

  segments.push(line(
    { x: xMax + offset, y: yMax },
    { x: xMax + offset, y: yMin },
  ));

  if (offset > 0) {
    segments.push(arc({ x: xMax, y: yMin }, offset, 0, -Math.PI / 2));
  }

  segments.push(line(
    { x: xMax, y: yMin - offset },
    { x: xStart, y: yMin - offset },
  ));

  return segments;
}

function cornerRectangleSegments(footprint, offset, activeX, activeY) {
  const { xMax, yMax } = rectangleBounds(footprint);
  const segments = [line(
    { x: xMax - activeX, y: yMax + offset },
    { x: xMax, y: yMax + offset },
  )];

  if (offset > 0) {
    segments.push(arc({ x: xMax, y: yMax }, offset, Math.PI / 2, -Math.PI / 2));
  }

  segments.push(line(
    { x: xMax + offset, y: yMax },
    { x: xMax + offset, y: yMax - activeY },
  ));

  return segments;
}

function allocateCornerSupportFaceLengths(sizeX, sizeY, effectiveDepth) {
  const target = Math.min(3 * effectiveDepth, sizeX + sizeY);
  let activeX = Math.min(sizeX, 1.5 * effectiveDepth);
  let activeY = Math.min(sizeY, 1.5 * effectiveDepth);
  let remaining = target - activeX - activeY;

  if (remaining > 0) {
    const addX = Math.min(remaining, sizeX - activeX);
    activeX += addX;
    remaining -= addX;
    activeY += Math.min(remaining, sizeY - activeY);
  }

  return { activeX, activeY, target };
}

function validateCanonicalExternalGeometry(connection, requiredOffset) {
  const footprint = connection.support.footprint;

  if (footprint.shape !== "rectangle" || Math.abs(footprint.rotation) > GEOMETRY_TOLERANCE) {
    throw new Error("Generated edge and corner perimeters require an axis-aligned rectangular support footprint.");
  }

  const slab = slabRectangleBounds(connection.slab.boundary);
  const support = rectangleBounds(footprint);

  if (!close(support.xMin, slab.xMin)) {
    throw new Error("Canonical external-support geometry requires the support negative-X face on the slab free edge.");
  }

  if (connection.support.position === "corner" && !close(support.yMin, slab.yMin)) {
    throw new Error("Canonical corner geometry requires the support negative-Y face on the second slab free edge.");
  }

  if (connection.support.position === "edge") {
    if (support.yMin - requiredOffset < slab.yMin || support.yMax + requiredOffset > slab.yMax) {
      throw new Error("The generated edge-column control perimeter intersects another slab edge.");
    }
  }

  if (
    support.xMax + requiredOffset > slab.xMax
    || (connection.support.position === "corner" && support.yMax + requiredOffset > slab.yMax)
  ) {
    throw new Error("The generated control perimeter exceeds the available slab boundary.");
  }
}

function validateInteriorDimensions(connection, effectiveDepth, requiredOffset) {
  const footprint = connection.support.footprint;

  if (footprint.shape === "rectangle") {
    if (Math.abs(footprint.rotation) > GEOMETRY_TOLERANCE) {
      throw new Error("Generated rectangular perimeters currently require support.footprint.rotation = 0.");
    }

    if (footprint.sizeX > 3 * effectiveDepth || footprint.sizeY > 3 * effectiveDepth) {
      throw new Error("Generated interior perimeters for elongated supports greater than 3d are not implemented.");
    }
  }

  if (conservativeBoundaryClearance(connection) < requiredOffset) {
    throw new Error("The generated interior control perimeter exceeds the conservatively evaluated slab boundary clearance.");
  }
}

function generate2004(connection, codeId, effectiveDepth) {
  const position = connection.support.position;
  const footprint = connection.support.footprint;
  const requiredOffset = 2 * effectiveDepth;

  if (position === "interior") {
    validateInteriorDimensions(connection, effectiveDepth, requiredOffset);
    const supportSegments = footprint.shape === "circle"
      ? interiorCircleSegments(footprint, 0)
      : interiorRectangleSegments(footprint, 0);
    const basicSegments = footprint.shape === "circle"
      ? interiorCircleSegments(footprint, requiredOffset)
      : interiorRectangleSegments(footprint, requiredOffset);

    return [
      createPerimeter({
        id: "support-face-u0",
        codeId,
        role: "support-face",
        position,
        offset: 0,
        segments: supportSegments,
        closed: true,
        clause: "6.4.5(3)",
      }),
      createPerimeter({
        id: "basic-control-u1",
        codeId,
        role: "basic-control",
        position,
        offset: requiredOffset,
        segments: basicSegments,
        closed: true,
        clause: "6.4.2",
      }),
    ];
  }

  validateCanonicalExternalGeometry(connection, requiredOffset);

  if (footprint.sizeX > 3 * effectiveDepth || footprint.sizeY > 3 * effectiveDepth) {
    throw new Error("Generated 2004 perimeters for external supports with a side greater than 3d are not implemented.");
  }

  if (position === "edge") {
    return [
      createPerimeter({
        id: "support-face-u0",
        codeId,
        role: "support-face",
        position,
        offset: 0,
        segments: edgeRectangleSegments(
          footprint,
          0,
          Math.min(footprint.sizeX, 1.5 * effectiveDepth),
        ),
        closed: false,
        clause: "6.4.5(3)",
      }),
      createPerimeter({
        id: "basic-control-u1",
        codeId,
        role: "basic-control",
        position,
        offset: requiredOffset,
        segments: edgeRectangleSegments(footprint, requiredOffset, footprint.sizeX),
        closed: false,
        clause: "6.4.2, Figure 6.15",
      }),
    ];
  }

  const supportLengths = allocateCornerSupportFaceLengths(
    footprint.sizeX,
    footprint.sizeY,
    effectiveDepth,
  );

  return [
    createPerimeter({
      id: "support-face-u0",
      codeId,
      role: "support-face",
      position,
      offset: 0,
      segments: cornerRectangleSegments(
        footprint,
        0,
        supportLengths.activeX,
        supportLengths.activeY,
      ),
      closed: false,
      clause: "6.4.5(3)",
      metadata: { targetLength: supportLengths.target },
    }),
    createPerimeter({
      id: "basic-control-u1",
      codeId,
      role: "basic-control",
      position,
      offset: requiredOffset,
      segments: cornerRectangleSegments(
        footprint,
        requiredOffset,
        footprint.sizeX,
        footprint.sizeY,
      ),
      closed: false,
      clause: "6.4.2, Figure 6.16",
    }),
  ];
}

function generate2023(connection, codeId, effectiveDepth) {
  const position = connection.support.position;
  const footprint = connection.support.footprint;
  const requiredOffset = effectiveDepth / 2;

  if (position === "interior") {
    validateInteriorDimensions(connection, effectiveDepth, requiredOffset);
    const supportSegments = footprint.shape === "circle"
      ? interiorCircleSegments(footprint, 0)
      : interiorRectangleSegments(footprint, 0);
    const basicSegments = footprint.shape === "circle"
      ? interiorCircleSegments(footprint, requiredOffset)
      : interiorRectangleSegments(footprint, requiredOffset);

    return [
      createPerimeter({
        id: "support-perimeter-b0",
        codeId,
        role: "support-face",
        position,
        offset: 0,
        segments: supportSegments,
        closed: true,
        clause: "8.4.2",
      }),
      createPerimeter({
        id: "basic-control-b0.5",
        codeId,
        role: "basic-control",
        position,
        offset: requiredOffset,
        segments: basicSegments,
        closed: true,
        clause: "8.4.2",
      }),
    ];
  }

  validateCanonicalExternalGeometry(connection, requiredOffset);

  if (position === "edge" && footprint.sizeY > 3 * effectiveDepth) {
    throw new Error("Generated 2023 edge perimeters with a column side parallel to the edge greater than 3dv are not implemented.");
  }

  if (position === "edge") {
    const activeNormal = Math.min(footprint.sizeX, 1.5 * effectiveDepth);

    return [
      createPerimeter({
        id: "support-perimeter-b0",
        codeId,
        role: "support-face",
        position,
        offset: 0,
        segments: edgeRectangleSegments(footprint, 0, activeNormal),
        closed: false,
        clause: "8.4.2",
      }),
      createPerimeter({
        id: "basic-control-b0.5",
        codeId,
        role: "basic-control",
        position,
        offset: requiredOffset,
        segments: edgeRectangleSegments(footprint, requiredOffset, activeNormal),
        closed: false,
        clause: "8.4.2",
      }),
    ];
  }

  const activeX = Math.min(footprint.sizeX, 1.5 * effectiveDepth);
  const activeY = Math.min(footprint.sizeY, 1.5 * effectiveDepth);

  return [
    createPerimeter({
      id: "support-perimeter-b0",
      codeId,
      role: "support-face",
      position,
      offset: 0,
      segments: cornerRectangleSegments(footprint, 0, activeX, activeY),
      closed: false,
      clause: "8.4.2",
    }),
    createPerimeter({
      id: "basic-control-b0.5",
      codeId,
      role: "basic-control",
      position,
      offset: requiredOffset,
      segments: cornerRectangleSegments(footprint, requiredOffset, activeX, activeY),
      closed: false,
      clause: "8.4.2",
    }),
  ];
}

export function generateEn1992PunchingPerimeters({
  connection,
  codeId,
  edition,
  effectiveDepth,
}) {
  if (!connection?.support?.position) {
    throw new Error("Generated punching perimeters require support.position.");
  }

  if (!["interior", "edge", "corner"].includes(connection.support.position)) {
    throw new Error(`Unsupported support position: ${connection.support.position}.`);
  }

  if (!Number.isFinite(effectiveDepth) || effectiveDepth <= 0) {
    throw new Error("Generated punching perimeters require a positive effectiveDepth.");
  }

  if (connection.slab.openings.length > 0) {
    throw new Error("Generated punching perimeters with slab openings are not implemented.");
  }

  if (!["rectangle", "circle"].includes(connection.support.footprint.shape)) {
    throw new Error("Generated punching perimeters require a rectangular or circular footprint.");
  }

  if (connection.support.position !== "interior" && connection.support.footprint.shape === "circle") {
    throw new Error("Generated circular edge and corner support perimeters are not implemented.");
  }

  return edition === "2004"
    ? generate2004(connection, codeId, effectiveDepth)
    : generate2023(connection, codeId, effectiveDepth);
}

/**
 * Generates an additional concentric control perimeter for punching
 * reinforcement checks. The same geometric limitations as the basic
 * generated perimeter apply.
 */
export function generateEn1992PunchingPerimeterAtOffset({
  connection,
  codeId,
  edition,
  effectiveDepth,
  offset,
  role = "outer-control",
  id = `${role}-at-${offset}`,
}) {
  if (!Number.isFinite(offset) || offset <= 0) {
    throw new Error("An additional punching perimeter requires a positive offset.");
  }

  if (connection.slab.openings.length > 0) {
    throw new Error("Generated additional perimeters with slab openings are not implemented.");
  }

  const position = connection.support.position;
  const footprint = connection.support.footprint;

  if (position === "interior") {
    validateInteriorDimensions(connection, effectiveDepth, offset);
    const segments = footprint.shape === "circle"
      ? interiorCircleSegments(footprint, offset)
      : interiorRectangleSegments(footprint, offset);

    return createPerimeter({
      id,
      codeId,
      role,
      position,
      offset,
      segments,
      closed: true,
      clause: edition === "2004" ? "6.4.5(4)" : "8.4.4",
    });
  }

  validateCanonicalExternalGeometry(connection, offset);

  if (footprint.shape !== "rectangle") {
    throw new Error("Generated additional external perimeters require a rectangular support.");
  }

  if (position === "edge") {
    const activeNormal = edition === "2004"
      ? footprint.sizeX
      : Math.min(footprint.sizeX, 1.5 * effectiveDepth);

    return createPerimeter({
      id,
      codeId,
      role,
      position,
      offset,
      segments: edgeRectangleSegments(footprint, offset, activeNormal),
      closed: false,
      clause: edition === "2004" ? "6.4.5(4)" : "8.4.4",
    });
  }

  const activeX = edition === "2004"
    ? footprint.sizeX
    : Math.min(footprint.sizeX, 1.5 * effectiveDepth);
  const activeY = edition === "2004"
    ? footprint.sizeY
    : Math.min(footprint.sizeY, 1.5 * effectiveDepth);

  return createPerimeter({
    id,
    codeId,
    role,
    position,
    offset,
    segments: cornerRectangleSegments(footprint, offset, activeX, activeY),
    closed: false,
    clause: edition === "2004" ? "6.4.5(4)" : "8.4.4",
  });
}
