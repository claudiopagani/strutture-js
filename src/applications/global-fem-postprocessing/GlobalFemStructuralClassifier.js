import {
  GLOBAL_FEM_CLASSIFICATION_PROPOSAL_VERSION,
  normalizeGlobalFemClassificationPolicy,
} from "./classificationPolicy.js";

const DEGREES = 180 / Math.PI;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, minimum = -1, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function subtract(left, right) {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

function dot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function norm(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalized(vector) {
  const magnitude = norm(vector);
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) return null;
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  };
}

function scale(vector, factor) {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function add(left, right) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function averagePoints(points) {
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  return scale(points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }), 1 / points.length);
}

function angleBetweenDirections(left, right, { unoriented = false } = {}) {
  const normalizedLeft = normalized(left);
  const normalizedRight = normalized(right);
  if (!normalizedLeft || !normalizedRight) return null;
  const cosine = unoriented
    ? Math.abs(dot(normalizedLeft, normalizedRight))
    : dot(normalizedLeft, normalizedRight);
  return Math.acos(clamp(cosine)) * DEGREES;
}

function verticalCoordinate(point, origin, upward) {
  return dot(subtract(point, origin), upward);
}

function classification({ role, status, source, confidence, evidence, requiresConfirmation }) {
  return {
    role,
    status,
    source,
    confidence,
    evidence: [...evidence],
    requiresConfirmation,
  };
}

function confirmedClassification(
  role,
  evidence = ["explicit-semantic-mapping"],
  source = "explicit-mapping",
) {
  return classification({
    role,
    status: "confirmed",
    source,
    confidence: 1,
    evidence,
    requiresConfirmation: false,
  });
}

function confidenceFromAngle(angle) {
  return Number(clamp(1 - angle / 90, 0, 1).toFixed(6));
}

function classifyLineDirection(direction, gravityDirection, policy) {
  const angleFromVertical = angleBetweenDirections(direction, gravityDirection, {
    unoriented: true,
  });
  const angleFromHorizontal = 90 - angleFromVertical;
  const evidence = [
    `angle-from-vertical:${angleFromVertical.toFixed(6)}deg`,
    `angle-from-horizontal:${angleFromHorizontal.toFixed(6)}deg`,
  ];

  if (angleFromVertical <= policy.verticalToleranceDegrees) {
    return classification({
      role: "column",
      status: "proposed",
      source: "geometric-inference",
      confidence: confidenceFromAngle(angleFromVertical),
      evidence: [...evidence, "axis-near-parallel-to-gravity"],
      requiresConfirmation: true,
    });
  }

  if (angleFromHorizontal <= policy.horizontalToleranceDegrees) {
    return classification({
      role: "beam",
      status: "proposed",
      source: "geometric-inference",
      confidence: confidenceFromAngle(angleFromHorizontal),
      evidence: [...evidence, "axis-near-orthogonal-to-gravity"],
      requiresConfirmation: true,
    });
  }

  if (policy.maximumBeamInclinationDegrees != null &&
      angleFromHorizontal <= policy.maximumBeamInclinationDegrees) {
    return classification({
      role: "beam",
      status: "proposed",
      source: "configured-geometric-inference",
      confidence: confidenceFromAngle(angleFromHorizontal),
      evidence: [...evidence, "within-configured-sloped-beam-threshold"],
      requiresConfirmation: true,
    });
  }

  return classification({
    role: "other",
    status: "ambiguous",
    source: "geometric-inference",
    confidence: 0,
    evidence: [...evidence, "orientation-does-not-identify-structural-role"],
    requiresConfirmation: true,
  });
}

function classifyShellNormal(normal, gravityDirection, policy) {
  const angleNormalToVertical = angleBetweenDirections(normal, gravityDirection, {
    unoriented: true,
  });
  const evidence = [`normal-angle-from-gravity:${angleNormalToVertical.toFixed(6)}deg`];

  if (angleNormalToVertical <= policy.horizontalPlaneToleranceDegrees) {
    return classification({
      role: "slab",
      status: "proposed",
      source: "geometric-inference",
      confidence: confidenceFromAngle(angleNormalToVertical),
      evidence: [...evidence, "surface-plane-near-horizontal"],
      requiresConfirmation: true,
    });
  }

  const angleFromVerticalPlane = 90 - angleNormalToVertical;
  if (angleFromVerticalPlane <= policy.verticalPlaneToleranceDegrees) {
    return classification({
      role: "wall",
      status: "proposed",
      source: "geometric-inference",
      confidence: confidenceFromAngle(angleFromVerticalPlane),
      evidence: [...evidence, "surface-plane-near-vertical"],
      requiresConfirmation: true,
    });
  }

  return classification({
    role: "generic-shell",
    status: "proposed",
    source: "geometric-routing",
    confidence: 1,
    evidence: [...evidence, "surface-routed-to-generic-shell-processing"],
    requiresConfirmation: true,
  });
}

function modelCharacteristicLength(model) {
  if (model.nodes.length === 0) return 1;
  const values = model.nodes.map((node) => node.coordinates);
  const minimum = {
    x: Math.min(...values.map((item) => item.x)),
    y: Math.min(...values.map((item) => item.y)),
    z: Math.min(...values.map((item) => item.z)),
  };
  const maximum = {
    x: Math.max(...values.map((item) => item.x)),
    y: Math.max(...values.map((item) => item.y)),
    z: Math.max(...values.map((item) => item.z)),
  };
  return Math.max(norm(subtract(maximum, minimum)), 1);
}

function lineGeometry(element, nodeIndex) {
  const start = nodeIndex.get(element.nodeIds[0]).coordinates;
  const end = nodeIndex.get(element.nodeIds[1]).coordinates;
  return { start, end, direction: normalized(subtract(end, start)) };
}

function shellGeometry(element, nodeIndex) {
  const points = element.nodeIds.map((nodeId) => nodeIndex.get(nodeId).coordinates);
  return {
    points,
    normal: normalized(element.localAxes.z),
    centroid: averagePoints(points),
  };
}

function connectedLineComponents(elements, geometries, classificationById, policy) {
  const byNode = new Map();
  for (const element of elements) {
    for (const nodeId of element.nodeIds) {
      if (!byNode.has(nodeId)) byNode.set(nodeId, []);
      byNode.get(nodeId).push(element);
    }
  }

  const adjacency = new Map(elements.map((element) => [element.id, new Set()]));
  for (const incident of byNode.values()) {
    if (incident.length !== 2) continue;
    const [first, second] = incident;
    const firstClassification = classificationById.get(first.id);
    const secondClassification = classificationById.get(second.id);
    const angle = angleBetweenDirections(
      geometries.get(first.id).direction,
      geometries.get(second.id).direction,
      { unoriented: true },
    );
    if (first.sectionId === second.sectionId &&
        first.materialId === second.materialId &&
        firstClassification.role === secondClassification.role &&
        firstClassification.status === secondClassification.status &&
        angle <= policy.groupingAngleToleranceDegrees) {
      adjacency.get(first.id).add(second.id);
      adjacency.get(second.id).add(first.id);
    }
  }

  return connectedComponents(elements.map((element) => element.id), adjacency);
}

function shellPairIsCompatible(first, second, geometries, nodeIndex, policy, tolerance) {
  if (first.sectionId !== second.sectionId || first.materialId !== second.materialId) {
    return false;
  }
  const firstGeometry = geometries.get(first.id);
  const secondGeometry = geometries.get(second.id);
  const normalAngle = angleBetweenDirections(firstGeometry.normal, secondGeometry.normal);
  if (normalAngle == null || normalAngle > policy.groupingNormalToleranceDegrees) {
    return false;
  }

  const firstOrigin = nodeIndex.get(first.nodeIds[0]).coordinates;
  const secondOrigin = nodeIndex.get(second.nodeIds[0]).coordinates;
  return secondGeometry.points.every((point) =>
    Math.abs(dot(subtract(point, firstOrigin), firstGeometry.normal)) <= tolerance) &&
    firstGeometry.points.every((point) =>
      Math.abs(dot(subtract(point, secondOrigin), secondGeometry.normal)) <= tolerance);
}

function connectedShellComponents(elements, geometries, nodeIndex, policy, tolerance) {
  const edgeOwners = new Map();
  for (const element of elements) {
    for (let index = 0; index < element.nodeIds.length; index += 1) {
      const first = element.nodeIds[index];
      const second = element.nodeIds[(index + 1) % element.nodeIds.length];
      const key = [first, second].sort().join("|");
      if (!edgeOwners.has(key)) edgeOwners.set(key, []);
      edgeOwners.get(key).push(element);
    }
  }

  const adjacency = new Map(elements.map((element) => [element.id, new Set()]));
  for (const owners of edgeOwners.values()) {
    for (let firstIndex = 0; firstIndex < owners.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < owners.length; secondIndex += 1) {
        const first = owners[firstIndex];
        const second = owners[secondIndex];
        if (shellPairIsCompatible(first, second, geometries, nodeIndex, policy, tolerance)) {
          adjacency.get(first.id).add(second.id);
          adjacency.get(second.id).add(first.id);
        }
      }
    }
  }
  return connectedComponents(elements.map((element) => element.id), adjacency);
}

function connectedComponents(ids, adjacency) {
  const remaining = new Set(ids);
  const components = [];
  for (const root of [...ids].sort()) {
    if (!remaining.has(root)) continue;
    const stack = [root];
    const component = [];
    remaining.delete(root);
    while (stack.length > 0) {
      const current = stack.pop();
      component.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (!remaining.has(next)) continue;
        remaining.delete(next);
        stack.push(next);
      }
    }
    components.push(component.sort());
  }
  return components;
}

function confirmedMembers(mapping, coveredLineElements, validLineElementIds, diagnostics) {
  const members = [];
  for (const member of mapping?.members ?? []) {
    const accepted = [];
    for (const lineElementId of member.lineElementIds ?? []) {
      if (!validLineElementIds.has(lineElementId)) {
        diagnostics.push({
          code: "FEM_CLASSIFICATION_UNKNOWN_REFERENCE",
          severity: "error",
          entityId: lineElementId,
          message: `Explicit member ${member.id} references unknown line element ${lineElementId}.`,
        });
      } else if (coveredLineElements.has(lineElementId)) {
        diagnostics.push({
          code: "FEM_CLASSIFICATION_EXPLICIT_CONFLICT",
          severity: "error",
          entityId: lineElementId,
          message: `Line element ${lineElementId} has more than one explicit member assignment.`,
        });
      } else {
        coveredLineElements.add(lineElementId);
        accepted.push(lineElementId);
      }
    }
    members.push({
      id: member.id,
      lineElementIds: accepted,
      classification: confirmedClassification(member.role),
      metadata: clone(member.metadata ?? {}),
    });
  }
  return members;
}

function confirmedSurfaces(mapping, coveredShellElements, validShellElementIds, diagnostics) {
  const surfaces = [];
  for (const [collection, role] of [[mapping?.walls ?? [], "wall"], [mapping?.slabs ?? [], "slab"]]) {
    for (const surface of collection) {
      const accepted = [];
      for (const shellElementId of surface.shellElementIds ?? []) {
        if (!validShellElementIds.has(shellElementId)) {
          diagnostics.push({
            code: "FEM_CLASSIFICATION_UNKNOWN_REFERENCE",
            severity: "error",
            entityId: shellElementId,
            message: `Explicit surface ${surface.id} references unknown shell element ${shellElementId}.`,
          });
        } else if (coveredShellElements.has(shellElementId)) {
          diagnostics.push({
            code: "FEM_CLASSIFICATION_EXPLICIT_CONFLICT",
            severity: "error",
            entityId: shellElementId,
            message: `Shell element ${shellElementId} has more than one explicit surface assignment.`,
          });
        } else {
          coveredShellElements.add(shellElementId);
          accepted.push(shellElementId);
        }
      }
      surfaces.push({
        id: surface.id,
        shellElementIds: accepted,
        classification: confirmedClassification(role),
        storeyIds: role === "wall" ? [...(surface.storeyIds ?? [])] : [surface.storeyId].filter(Boolean),
        metadata: clone(surface.metadata ?? {}),
      });
    }
  }
  return surfaces;
}

function proposeMembers(model, mapping, nodeIndex, gravityDirection, policy, diagnostics) {
  const covered = new Set();
  const validIds = new Set(model.lineElements.map((element) => element.id));
  const members = confirmedMembers(mapping, covered, validIds, diagnostics);
  const elements = model.lineElements.filter((element) => !covered.has(element.id));
  const geometries = new Map(elements.map((element) => [element.id, lineGeometry(element, nodeIndex)]));
  const classificationById = new Map(elements.map((element) => [
    element.id,
    classifyLineDirection(geometries.get(element.id).direction, gravityDirection, policy.line),
  ]));
  const elementIndex = new Map(elements.map((element) => [element.id, element]));

  for (const component of connectedLineComponents(elements, geometries, classificationById, policy.line)) {
    const representative = classificationById.get(component[0]);
    members.push({
      id: `proposed-member:${component[0]}`,
      lineElementIds: component,
      classification: {
        ...representative,
        confidence: Math.min(...component.map((id) => classificationById.get(id).confidence)),
        evidence: [
          ...representative.evidence,
          component.length > 1
            ? "connected-collinear-elements-with-common-section-and-material"
            : "single-line-element",
        ],
      },
      metadata: {
        sectionIds: [...new Set(component.map((id) => elementIndex.get(id).sectionId))],
        materialIds: [...new Set(component.map((id) => elementIndex.get(id).materialId))],
      },
    });
  }
  return members;
}

function proposeSurfaces(model, mapping, nodeIndex, gravityDirection, policy, tolerance, diagnostics) {
  const covered = new Set();
  const validIds = new Set(model.shellElements.map((element) => element.id));
  const surfaces = confirmedSurfaces(mapping, covered, validIds, diagnostics);
  const elements = model.shellElements.filter((element) => !covered.has(element.id));
  const geometries = new Map(elements.map((element) => [element.id, shellGeometry(element, nodeIndex)]));
  const elementIndex = new Map(elements.map((element) => [element.id, element]));

  for (const component of connectedShellComponents(
    elements,
    geometries,
    nodeIndex,
    policy.shell,
    tolerance,
  )) {
    const representativeNormal = geometries.get(component[0]).normal;
    const surfaceClassification = classifyShellNormal(
      representativeNormal,
      gravityDirection,
      policy.shell,
    );
    const nodeIds = [...new Set(component.flatMap((id) => elementIndex.get(id).nodeIds))];
    surfaces.push({
      id: `proposed-surface:${component[0]}`,
      shellElementIds: component,
      classification: {
        ...surfaceClassification,
        evidence: [
          ...surfaceClassification.evidence,
          component.length > 1 ? "connected-coplanar-shell-mesh" : "single-shell-element",
        ],
      },
      centroid: averagePoints(nodeIds.map((nodeId) => nodeIndex.get(nodeId).coordinates)),
      normal: clone(representativeNormal),
      metadata: {
        sectionIds: [...new Set(component.map((id) => elementIndex.get(id).sectionId))],
        materialIds: [...new Set(component.map((id) => elementIndex.get(id).materialId))],
      },
    });
  }
  return surfaces;
}

function clusterElevations(values, tolerance) {
  const clusters = [];
  for (const value of [...values].sort((left, right) => left - right)) {
    const last = clusters.at(-1);
    if (!last || Math.abs(value - last.mean) > tolerance) {
      clusters.push({ values: [value], mean: value });
    } else {
      last.values.push(value);
      last.mean = last.values.reduce((sum, item) => sum + item, 0) / last.values.length;
    }
  }
  return clusters;
}

function proposeDiaphragms(model, nodeIndex, origin, upward, elevationTolerance) {
  const diaphragms = model.diaphragms.map((diaphragm) => ({
    id: diaphragm.id,
    nodeIds: [...diaphragm.nodeIds],
    classification: confirmedClassification(
      "diaphragm",
      ["explicit-model-diaphragm"],
      "explicit-model",
    ),
    sourceEntityId: diaphragm.id,
  }));
  const coveredConstraints = new Set();

  for (const constraint of model.constraints) {
    if (!/(diaphragm|rigid[-_ ]?floor|rigid[-_ ]?plane)/i.test(constraint.type)) continue;
    const nodeIds = [constraint.masterNodeId, ...(constraint.slaveNodeIds ?? [])];
    const elevations = nodeIds
      .map((nodeId) => nodeIndex.get(nodeId)?.coordinates)
      .filter(Boolean)
      .map((point) => verticalCoordinate(point, origin, upward));
    if (elevations.length < 3 || Math.max(...elevations) - Math.min(...elevations) > elevationTolerance) {
      continue;
    }
    coveredConstraints.add(constraint.id);
    diaphragms.push({
      id: `proposed-diaphragm:${constraint.id}`,
      nodeIds,
      classification: classification({
        role: "diaphragm",
        status: "proposed",
        source: "constraint-inference",
        confidence: 1,
        evidence: ["constraint-type-declares-rigid-plane", "constraint-nodes-are-coplanar"],
        requiresConfirmation: true,
      }),
      sourceEntityId: constraint.id,
    });
  }

  return { diaphragms, coveredConstraints };
}

function proposeStoreys(model, mapping, nodeIndex, surfaces, diaphragms, origin, upward, tolerance) {
  const storeys = [];
  const mappedIds = new Set();
  for (const storey of mapping?.storeys ?? []) {
    mappedIds.add(storey.storeyId);
    const modelStorey = model.storeys.find((item) => item.id === storey.storeyId);
    storeys.push({
      id: storey.id,
      storeyId: storey.storeyId,
      elevation: modelStorey?.elevation ?? null,
      nodeIds: [...(storey.nodeIds ?? [])],
      diaphragmIds: [...(storey.diaphragmIds ?? [])],
      classification: confirmedClassification("storey"),
    });
  }

  for (const modelStorey of model.storeys) {
    if (mappedIds.has(modelStorey.id)) continue;
    storeys.push({
      id: `proposed-storey:${modelStorey.id}`,
      storeyId: modelStorey.id,
      elevation: modelStorey.elevation,
      nodeIds: model.nodes
        .filter((node) => Math.abs(
          verticalCoordinate(node.coordinates, origin, upward) - modelStorey.elevation,
        ) <= tolerance)
        .map((node) => node.id),
      diaphragmIds: [...modelStorey.diaphragmIds],
      classification: classification({
        role: "storey",
        status: "proposed",
        source: "model-level-inference",
        confidence: 1,
        evidence: ["explicit-model-storey-without-confirmed-semantic-mapping"],
        requiresConfirmation: true,
      }),
    });
  }

  if (model.storeys.length > 0 || storeys.length > 0) return storeys;

  const candidateElevations = [];
  for (const diaphragm of diaphragms) {
    const points = diaphragm.nodeIds.map((nodeId) => nodeIndex.get(nodeId)?.coordinates).filter(Boolean);
    if (points.length > 0) {
      candidateElevations.push(verticalCoordinate(averagePoints(points), origin, upward));
    }
  }
  for (const surface of surfaces) {
    if (surface.classification.role === "slab") {
      candidateElevations.push(verticalCoordinate(surface.centroid, origin, upward));
    }
  }

  return clusterElevations(candidateElevations, tolerance).map((cluster, index) => {
    const elevation = cluster.mean;
    return {
      id: `proposed-storey:${index + 1}`,
      storeyId: `proposed-level:${index + 1}`,
      elevation,
      nodeIds: model.nodes
        .filter((node) => Math.abs(verticalCoordinate(node.coordinates, origin, upward) - elevation) <= tolerance)
        .map((node) => node.id),
      diaphragmIds: diaphragms
        .filter((diaphragm) => {
          const points = diaphragm.nodeIds.map((nodeId) => nodeIndex.get(nodeId)?.coordinates).filter(Boolean);
          return points.length > 0 && Math.abs(
            verticalCoordinate(averagePoints(points), origin, upward) - elevation,
          ) <= tolerance;
        })
        .map((diaphragm) => diaphragm.id),
      classification: classification({
        role: "storey",
        status: "proposed",
        source: "elevation-clustering",
        confidence: 1,
        evidence: ["horizontal-surface-or-diaphragm-elevation-cluster"],
        requiresConfirmation: true,
      }),
    };
  });
}

function proposeJoints(model, mapping, members, policy) {
  const joints = (mapping?.joints ?? []).map((joint) => ({
    id: joint.id,
    nodeId: joint.nodeId,
    lineElementEnds: clone(joint.lineElementEnds ?? []),
    classification: confirmedClassification("beam-column-joint"),
  }));
  const mappedNodes = new Set(joints.map((joint) => joint.nodeId));
  const memberByElement = new Map();
  for (const member of members) {
    for (const lineElementId of member.lineElementIds) {
      memberByElement.set(lineElementId, member);
    }
  }
  const incidentByNode = new Map(model.nodes.map((node) => [node.id, []]));
  for (const element of model.lineElements) {
    incidentByNode.get(element.nodeIds[0]).push({ element, end: "start" });
    incidentByNode.get(element.nodeIds[1]).push({ element, end: "end" });
  }

  for (const [nodeId, incident] of incidentByNode) {
    if (mappedNodes.has(nodeId)) continue;
    if (incident.length < policy.joints.minimumIncidentLineElements) continue;
    const roles = new Set(incident.map(({ element }) =>
      memberByElement.get(element.id)?.classification.role));
    if (!roles.has("beam") || !roles.has("column")) continue;
    const ambiguous = incident.some(({ element }) =>
      memberByElement.get(element.id)?.classification.status === "ambiguous");
    joints.push({
      id: `proposed-joint:${nodeId}`,
      nodeId,
      lineElementEnds: incident.map(({ element, end }) => ({
        lineElementId: element.id,
        end,
      })),
      classification: classification({
        role: "beam-column-joint",
        status: ambiguous ? "ambiguous" : "proposed",
        source: "connectivity-and-role-inference",
        confidence: ambiguous ? 0 : Math.min(...incident.map(({ element }) =>
          memberByElement.get(element.id).classification.confidence)),
        evidence: ["incident-beam-and-column-candidates-at-common-fem-node"],
        requiresConfirmation: true,
      }),
    });
  }
  return joints;
}

function proposalWarnings(proposal) {
  const all = [
    ...proposal.members,
    ...proposal.surfaces,
    ...proposal.storeys,
    ...proposal.diaphragms,
    ...proposal.joints,
  ];
  const proposed = all.filter((item) => item.classification.status === "proposed").length;
  const ambiguous = all.filter((item) => item.classification.status === "ambiguous").length;
  const warnings = [];
  if (proposed > 0) {
    warnings.push({
      code: "FEM_CLASSIFICATION_REQUIRES_CONFIRMATION",
      message: `${proposed} structural classifications are proposals and cannot authorize final normative verification.`,
    });
  }
  if (ambiguous > 0) {
    warnings.push({
      code: "FEM_CLASSIFICATION_AMBIGUOUS",
      message: `${ambiguous} structural classifications are ambiguous and block role-dependent checks.`,
    });
  }
  return warnings;
}

export function classifyGlobalFemStructuralEntities({
  model,
  mapping = null,
  policy: policyInput = {},
} = {}) {
  if (!model || !Array.isArray(model.nodes)) {
    throw new Error("Global FEM structural classification requires a model contract.");
  }
  const policy = normalizeGlobalFemClassificationPolicy(policyInput);
  const nodeIndex = new Map(model.nodes.map((node) => [node.id, node]));
  const gravityDirection = normalized(model.globalCoordinateSystem.gravityDirection);
  if (!gravityDirection) {
    throw new Error("Global FEM structural classification requires a non-degenerate gravity direction.");
  }
  const upward = scale(gravityDirection, -1);
  const origin = model.globalCoordinateSystem.origin;
  const characteristicLength = modelCharacteristicLength(model);
  const coplanarityTolerance = policy.shell.coplanarityTolerance ??
    characteristicLength * policy.storeys.relativeElevationTolerance;
  const elevationTolerance = policy.storeys.elevationTolerance ??
    characteristicLength * policy.storeys.relativeElevationTolerance;
  const diagnostics = [];

  const members = proposeMembers(
    model,
    mapping,
    nodeIndex,
    gravityDirection,
    policy,
    diagnostics,
  );
  const surfaces = proposeSurfaces(
    model,
    mapping,
    nodeIndex,
    gravityDirection,
    policy,
    coplanarityTolerance,
    diagnostics,
  );
  const { diaphragms } = proposeDiaphragms(
    model,
    nodeIndex,
    origin,
    upward,
    elevationTolerance,
  );
  const storeys = proposeStoreys(
    model,
    mapping,
    nodeIndex,
    surfaces,
    diaphragms,
    origin,
    upward,
    elevationTolerance,
  );
  const joints = proposeJoints(model, mapping, members, policy);

  const proposal = {
    schema: "strutture-js/fem-structural-classification-proposal",
    version: GLOBAL_FEM_CLASSIFICATION_PROPOSAL_VERSION,
    modelId: model.id,
    modelHash: model.hash,
    policy: {
      ...clone(policy),
      resolved: {
        characteristicLength,
        coplanarityTolerance,
        elevationTolerance,
        modelLengthUnit: model.units.length,
      },
    },
    members,
    surfaces,
    storeys,
    diaphragms,
    joints,
    diagnostics,
    warnings: [],
    summary: {},
  };
  proposal.warnings = proposalWarnings(proposal);
  proposal.summary = {
    confirmed: [members, surfaces, storeys, diaphragms, joints]
      .flat().filter((item) => item.classification.status === "confirmed").length,
    proposed: [members, surfaces, storeys, diaphragms, joints]
      .flat().filter((item) => item.classification.status === "proposed").length,
    ambiguous: [members, surfaces, storeys, diaphragms, joints]
      .flat().filter((item) => item.classification.status === "ambiguous").length,
  };
  return proposal;
}
