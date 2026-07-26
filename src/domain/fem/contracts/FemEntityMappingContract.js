import {
  FEM_CONTRACT_SCHEMAS,
  addError,
  finalizeValidation,
  indexById,
  throwForInvalidContract,
  validateArray,
  validateHeader,
  validateId,
  validateIdArray,
  validateRecord,
  validateReferences,
  validateString,
  validateUniqueIds,
  withContractHeader,
} from "./FemContractValidation.js";
import {
  validateResistanceAxisTransformation,
  validateSurfaceResistanceAxisTransformation,
} from "../ResistanceAxisMapping.js";

function validateAxisMappings({
  mappings,
  path,
  sourceIdKey,
  assignedIds,
  sourceCoordinateSystem,
  transformationValidator = validateResistanceAxisTransformation,
  errors,
}) {
  if (mappings == null) return;
  if (!validateArray(mappings, path, errors)) return;
  const mappedIds = new Set();
  mappings.forEach((mapping, itemIndex) => {
    const itemPath = `${path}[${itemIndex}]`;
    if (!validateRecord(mapping, itemPath, errors)) return;
    if (validateId(mapping[sourceIdKey], `${itemPath}.${sourceIdKey}`, errors)) {
      if (!assignedIds.includes(mapping[sourceIdKey])) {
        addError(
          errors,
          "FEM_UNKNOWN_REFERENCE",
          `${itemPath}.${sourceIdKey}`,
          `${mapping[sourceIdKey]} is not assigned to the mapped structural entity.`,
        );
      } else if (mappedIds.has(mapping[sourceIdKey])) {
        addError(
          errors,
          "FEM_AMBIGUOUS_ENTITY_MAPPING",
          `${itemPath}.${sourceIdKey}`,
          `${mapping[sourceIdKey]} has more than one resistance-axis mapping.`,
        );
      }
      mappedIds.add(mapping[sourceIdKey]);
    }
    validateString(
      mapping.sourceCoordinateSystem,
      `${itemPath}.sourceCoordinateSystem`,
      errors,
      { allowed: [sourceCoordinateSystem] },
    );
    validateId(
      mapping.resistanceCoordinateSystemId,
      `${itemPath}.resistanceCoordinateSystemId`,
      errors,
    );
    try {
      transformationValidator(mapping.sourceToResistance);
    } catch (error) {
      addError(
        errors,
        "FEM_INVALID_AXIS_TRANSFORMATION",
        `${itemPath}.sourceToResistance`,
        error.message,
      );
    }
  });
  if (mappings.length > 0) {
    assignedIds.forEach((id) => {
      if (!mappedIds.has(id)) {
        addError(
          errors,
          "FEM_MAPPING_INCOMPLETE",
          path,
          `${id} has no resistance-axis mapping.`,
        );
      }
    });
  }
}

function registerAssignments(ids, assignmentIndex, path, errors) {
  ids?.forEach((id, itemIndex) => {
    if (assignmentIndex.has(id)) {
      addError(
        errors,
        "FEM_AMBIGUOUS_ENTITY_MAPPING",
        `${path}[${itemIndex}]`,
        `${id} is already mapped by ${assignmentIndex.get(id)}.`,
      );
      return;
    }
    assignmentIndex.set(id, path);
  });
}

function validateMembers(members, modelIndices, errors) {
  const index = validateUniqueIds(members, "$.members", errors);
  const assignments = new Map();
  members?.forEach((member, itemIndex) => {
    const path = `$.members[${itemIndex}]`;
    validateString(member.role, `${path}.role`, errors, {
      allowed: ["beam", "column", "brace", "other"],
    });
    validateIdArray(member.lineElementIds, `${path}.lineElementIds`, errors, { minLength: 1 });
    if (modelIndices) {
      validateReferences(
        member.lineElementIds,
        modelIndices.lineElements,
        `${path}.lineElementIds`,
        errors,
        "line element",
      );
    }
    validateAxisMappings({
      mappings: member.lineActionMappings,
      path: `${path}.lineActionMappings`,
      sourceIdKey: "lineElementId",
      assignedIds: member.lineElementIds ?? [],
      sourceCoordinateSystem: "element-local",
      errors,
    });
    registerAssignments(member.lineElementIds, assignments, `${path}.lineElementIds`, errors);
  });
  return { index, assignments };
}

function validateWalls(walls, modelIndices, errors) {
  const index = validateUniqueIds(walls, "$.walls", errors);
  const assignments = new Map();
  walls?.forEach((wall, itemIndex) => {
    const path = `$.walls[${itemIndex}]`;
    validateIdArray(wall.shellElementIds, `${path}.shellElementIds`, errors, { minLength: 1 });
    validateIdArray(wall.sectionCutIds, `${path}.sectionCutIds`, errors);
    validateIdArray(wall.storeyIds, `${path}.storeyIds`, errors, { minLength: 1 });
    if (modelIndices) {
      validateReferences(
        wall.shellElementIds,
        modelIndices.shellElements,
        `${path}.shellElementIds`,
        errors,
        "shell element",
      );
      validateReferences(
        wall.sectionCutIds,
        modelIndices.sectionCuts,
        `${path}.sectionCutIds`,
        errors,
        "section cut",
      );
      validateReferences(
        wall.storeyIds,
        modelIndices.storeys,
        `${path}.storeyIds`,
        errors,
        "storey",
      );
    }
    validateAxisMappings({
      mappings: wall.sectionCutActionMappings,
      path: `${path}.sectionCutActionMappings`,
      sourceIdKey: "sectionCutId",
      assignedIds: wall.sectionCutIds ?? [],
      sourceCoordinateSystem: "section-cut-local",
      errors,
    });
    registerAssignments(wall.shellElementIds, assignments, `${path}.shellElementIds`, errors);
  });
  return { index, assignments };
}

function validateSlabs(slabs, modelIndices, shellAssignments, errors) {
  const index = validateUniqueIds(slabs, "$.slabs", errors);
  slabs?.forEach((slab, itemIndex) => {
    const path = `$.slabs[${itemIndex}]`;
    validateIdArray(slab.shellElementIds, `${path}.shellElementIds`, errors, { minLength: 1 });
    validateIdArray(slab.diaphragmIds, `${path}.diaphragmIds`, errors);
    if (validateId(slab.storeyId, `${path}.storeyId`, errors) && modelIndices &&
        !modelIndices.storeys.has(slab.storeyId)) {
      addError(
        errors,
        "FEM_UNKNOWN_REFERENCE",
        `${path}.storeyId`,
        `${path}.storeyId references unknown storey ${slab.storeyId}.`,
      );
    }
    if (modelIndices) {
      validateReferences(
        slab.shellElementIds,
        modelIndices.shellElements,
        `${path}.shellElementIds`,
        errors,
        "shell element",
      );
      validateReferences(
        slab.diaphragmIds,
        modelIndices.diaphragms,
        `${path}.diaphragmIds`,
        errors,
        "diaphragm",
      );
    }
    validateAxisMappings({
      mappings: slab.shellResultantMappings,
      path: `${path}.shellResultantMappings`,
      sourceIdKey: "shellElementId",
      assignedIds: slab.shellElementIds ?? [],
      sourceCoordinateSystem: "element-local",
      transformationValidator:
        validateSurfaceResistanceAxisTransformation,
      errors,
    });
    registerAssignments(slab.shellElementIds, shellAssignments, `${path}.shellElementIds`, errors);
  });
  return index;
}

function validatePunchingConnections({
  connections,
  slabIndex,
  modelIndices,
  errors,
}) {
  if (connections == null) return new Map();
  const index = validateUniqueIds(
    connections,
    "$.punchingConnections",
    errors,
  );
  connections.forEach((connection, itemIndex) => {
    const path = `$.punchingConnections[${itemIndex}]`;
    const slab = slabIndex.get(connection.slabId);
    if (validateId(connection.slabId, `${path}.slabId`, errors) &&
        !slab) {
      addError(
        errors,
        "FEM_UNKNOWN_REFERENCE",
        `${path}.slabId`,
        `${path}.slabId references unknown slab ${connection.slabId}.`,
      );
    }
    if (validateId(connection.nodeId, `${path}.nodeId`, errors) &&
        modelIndices && !modelIndices.nodes.has(connection.nodeId)) {
      addError(
        errors,
        "FEM_UNKNOWN_REFERENCE",
        `${path}.nodeId`,
        `${path}.nodeId references unknown node ${connection.nodeId}.`,
      );
    }
    validateIdArray(
      connection.shellElementIds,
      `${path}.shellElementIds`,
      errors,
      { minLength: 1 },
    );
    connection.shellElementIds?.forEach((shellElementId, shellIndex) => {
      if (!slab?.shellElementIds?.includes(shellElementId)) {
        addError(
          errors,
          "FEM_UNKNOWN_REFERENCE",
          `${path}.shellElementIds[${shellIndex}]`,
          `${shellElementId} is not assigned to slab ${connection.slabId}.`,
        );
      }
    });
    if (validateArray(
      connection.supportLineElementEnds,
      `${path}.supportLineElementEnds`,
      errors,
    ) && connection.supportLineElementEnds.length === 0) {
      addError(
        errors,
        "FEM_ARRAY_TOO_SHORT",
        `${path}.supportLineElementEnds`,
        "A punching connection needs at least one supporting member end.",
      );
    }
    connection.supportLineElementEnds?.forEach((end, endIndex) => {
      const endPath = `${path}.supportLineElementEnds[${endIndex}]`;
      if (!validateRecord(end, endPath, errors)) return;
      const element = modelIndices?.lineElements.get(end.lineElementId);
      if (validateId(
        end.lineElementId,
        `${endPath}.lineElementId`,
        errors,
      ) && modelIndices && !element) {
        addError(
          errors,
          "FEM_UNKNOWN_REFERENCE",
          `${endPath}.lineElementId`,
          `${end.lineElementId} is not a model line element.`,
        );
      }
      validateString(end.end, `${endPath}.end`, errors, {
        allowed: ["start", "end"],
      });
      const expectedNodeId = end.end === "start"
        ? element?.nodeIds?.[0]
        : element?.nodeIds?.[1];
      if (element && expectedNodeId !== connection.nodeId) {
        addError(
          errors,
          "FEM_JOINT_END_MISMATCH",
          endPath,
          `${end.lineElementId}.${end.end} is not connected to punching ` +
            `node ${connection.nodeId}.`,
        );
      }
    });
  });
  return index;
}

function validateFoundations(foundations, modelIndices, errors) {
  if (foundations == null) {
    return { index: new Map(), assignments: new Map() };
  }
  const index = validateUniqueIds(foundations, "$.foundations", errors);
  const assignments = new Map();
  foundations.forEach((foundation, itemIndex) => {
    const path = `$.foundations[${itemIndex}]`;
    validateString(foundation.type, `${path}.type`, errors, {
      allowed: [
        "isolated-footing",
        "foundation-beam",
        "raft",
        "pile-cap",
        "other",
      ],
    });
    validateIdArray(
      foundation.supportIds,
      `${path}.supportIds`,
      errors,
      { minLength: 1 },
    );
    validateIdArray(
      foundation.supportNodeIds,
      `${path}.supportNodeIds`,
      errors,
      { minLength: 1 },
    );
    if (foundation.supportIds?.length !==
        foundation.supportNodeIds?.length) {
      addError(
        errors,
        "FEM_MAPPING_INCOMPLETE",
        path,
        "supportIds and supportNodeIds must have the same length.",
      );
    }
    foundation.supportIds?.forEach((supportId, supportIndex) => {
      const support = modelIndices?.supports.get(supportId);
      if (modelIndices && !support) {
        addError(
          errors,
          "FEM_UNKNOWN_REFERENCE",
          `${path}.supportIds[${supportIndex}]`,
          `${supportId} is not a model support.`,
        );
      } else if (
        support &&
        support.nodeId !== foundation.supportNodeIds?.[supportIndex]
      ) {
        addError(
          errors,
          "FEM_SUPPORT_NODE_MISMATCH",
          `${path}.supportNodeIds[${supportIndex}]`,
          `${supportId} belongs to node ${support.nodeId}.`,
        );
      }
    });
    validateAxisMappings({
      mappings: foundation.supportReactionMappings,
      path: `${path}.supportReactionMappings`,
      sourceIdKey: "supportNodeId",
      assignedIds: foundation.supportNodeIds ?? [],
      sourceCoordinateSystem: "global",
      errors,
    });
    if (
      !Array.isArray(foundation.supportReactionMappings) ||
      foundation.supportReactionMappings.length !==
        (foundation.supportNodeIds?.length ?? 0)
    ) {
      addError(
        errors,
        "FEM_MAPPING_INCOMPLETE",
        `${path}.supportReactionMappings`,
        `Foundation ${foundation.id} requires one reaction-axis mapping ` +
          "for every support node.",
      );
    }
    registerAssignments(
      foundation.supportIds,
      assignments,
      `${path}.supportIds`,
      errors,
    );
  });
  if (modelIndices) {
    for (const supportId of modelIndices.supports.keys()) {
      if (!assignments.has(supportId)) {
        addError(
          errors,
          "FEM_MAPPING_INCOMPLETE",
          "$.foundations",
          `Support ${supportId} is not mapped to a foundation.`,
        );
      }
    }
  }
  return { index, assignments };
}

function validateStoreyMappings(storeys, modelIndices, errors) {
  const index = validateUniqueIds(storeys, "$.storeys", errors);
  const mappedStoreys = new Set();
  storeys?.forEach((storey, itemIndex) => {
    const path = `$.storeys[${itemIndex}]`;
    if (validateId(storey.storeyId, `${path}.storeyId`, errors)) {
      if (mappedStoreys.has(storey.storeyId)) {
        addError(
          errors,
          "FEM_AMBIGUOUS_ENTITY_MAPPING",
          `${path}.storeyId`,
          `Storey ${storey.storeyId} is mapped more than once.`,
        );
      }
      mappedStoreys.add(storey.storeyId);
      if (modelIndices && !modelIndices.storeys.has(storey.storeyId)) {
        addError(
          errors,
          "FEM_UNKNOWN_REFERENCE",
          `${path}.storeyId`,
          `${path}.storeyId references unknown storey ${storey.storeyId}.`,
        );
      }
    }

    for (const [key, targetName, label] of [
      ["nodeIds", "nodes", "node"],
      ["diaphragmIds", "diaphragms", "diaphragm"],
      ["lineElementIds", "lineElements", "line element"],
      ["shellElementIds", "shellElements", "shell element"],
    ]) {
      validateIdArray(storey[key], `${path}.${key}`, errors);
      if (modelIndices) {
        validateReferences(
          storey[key],
          modelIndices[targetName],
          `${path}.${key}`,
          errors,
          label,
        );
      }
    }
  });
  return { index, mappedStoreys };
}

function validateJoints(joints, modelIndices, errors) {
  const index = validateUniqueIds(joints, "$.joints", errors);
  const mappedNodes = new Set();
  joints?.forEach((joint, itemIndex) => {
    const path = `$.joints[${itemIndex}]`;
    if (validateId(joint.nodeId, `${path}.nodeId`, errors)) {
      if (mappedNodes.has(joint.nodeId)) {
        addError(
          errors,
          "FEM_AMBIGUOUS_ENTITY_MAPPING",
          `${path}.nodeId`,
          `Node ${joint.nodeId} is mapped to more than one structural joint.`,
        );
      }
      mappedNodes.add(joint.nodeId);
      if (modelIndices && !modelIndices.nodes.has(joint.nodeId)) {
        addError(
          errors,
          "FEM_UNKNOWN_REFERENCE",
          `${path}.nodeId`,
          `${path}.nodeId references unknown node ${joint.nodeId}.`,
        );
      }
    }
    if (validateArray(joint.lineElementEnds, `${path}.lineElementEnds`, errors)) {
      joint.lineElementEnds.forEach((end, endIndex) => {
        const endPath = `${path}.lineElementEnds[${endIndex}]`;
        if (!validateRecord(end, endPath, errors)) return;
        if (validateId(end.lineElementId, `${endPath}.lineElementId`, errors) &&
            modelIndices && !modelIndices.lineElements.has(end.lineElementId)) {
          addError(
            errors,
            "FEM_UNKNOWN_REFERENCE",
            `${endPath}.lineElementId`,
            `${endPath}.lineElementId references unknown line element ${end.lineElementId}.`,
          );
        }
        validateString(end.end, `${endPath}.end`, errors, { allowed: ["start", "end"] });

        const element = modelIndices?.lineElements.get(end.lineElementId);
        const expectedNodeId = end.end === "start" ? element?.nodeIds?.[0] : element?.nodeIds?.[1];
        if (element && expectedNodeId !== joint.nodeId) {
          addError(
            errors,
            "FEM_JOINT_END_MISMATCH",
            endPath,
            `${end.lineElementId}.${end.end} is not connected to joint node ${joint.nodeId}.`,
          );
        }
      });
    }
  });
  return index;
}

function validateCoverage(model, assignments, mappedStoreys, errors) {
  model.lineElements.forEach((element) => {
    if (!assignments.lineElements.has(element.id)) {
      addError(
        errors,
        "FEM_MAPPING_INCOMPLETE",
        "$.members",
        `Line element ${element.id} is not mapped to a structural member.`,
      );
    }
  });
  model.shellElements.forEach((element) => {
    if (!assignments.shellElements.has(element.id)) {
      addError(
        errors,
        "FEM_MAPPING_INCOMPLETE",
        "$.walls",
        `Shell element ${element.id} is not mapped to a wall or slab.`,
      );
    }
  });
  model.storeys.forEach((storey) => {
    if (!mappedStoreys.has(storey.id)) {
      addError(
        errors,
        "FEM_MAPPING_INCOMPLETE",
        "$.storeys",
        `Storey ${storey.id} has no explicit semantic mapping.`,
      );
    }
  });
}

export function validateFemEntityMappingContract(input, { model = null } = {}) {
  const errors = [];
  const warnings = [];

  if (validateHeader(input, FEM_CONTRACT_SCHEMAS.mapping, errors)) {
    validateId(input.id, "$.id", errors);
    validateId(input.modelId, "$.modelId", errors);
    validateId(input.modelHash, "$.modelHash", errors);
    for (const collection of ["members", "walls", "slabs", "storeys", "joints"]) {
      validateArray(input[collection], `$.${collection}`, errors);
    }
    if (input.punchingConnections != null) {
      validateArray(
        input.punchingConnections,
        "$.punchingConnections",
        errors,
      );
    }
    if (input.foundations != null) {
      validateArray(input.foundations, "$.foundations", errors);
    }

    if (model && (input.modelId !== model.id || input.modelHash !== model.hash)) {
      addError(
        errors,
        "FEM_MODEL_ASSOCIATION_MISMATCH",
        "$.modelId",
        "Mapping modelId/modelHash do not match the supplied model.",
      );
    }

    const modelIndices = model ? {
      nodes: indexById(model.nodes),
      lineElements: indexById(model.lineElements),
      shellElements: indexById(model.shellElements),
      diaphragms: indexById(model.diaphragms),
      storeys: indexById(model.storeys),
      sectionCuts: indexById(model.sectionCuts),
      supports: indexById(model.supports),
    } : null;

    const members = validateMembers(input.members, modelIndices, errors);
    const walls = validateWalls(input.walls, modelIndices, errors);
    const shellAssignments = new Map(walls.assignments);
    const slabs = validateSlabs(
      input.slabs,
      modelIndices,
      shellAssignments,
      errors,
    );
    validatePunchingConnections({
      connections: input.punchingConnections,
      slabIndex: slabs,
      modelIndices,
      errors,
    });
    validateFoundations(input.foundations, modelIndices, errors);
    const storeys = validateStoreyMappings(input.storeys, modelIndices, errors);
    validateJoints(input.joints, modelIndices, errors);

    if (model) {
      validateCoverage(
        model,
        {
          lineElements: members.assignments,
          shellElements: shellAssignments,
        },
        storeys.mappedStoreys,
        errors,
      );
    }

    if (input.metadata != null) {
      validateRecord(input.metadata, "$.metadata", errors);
    }
  }

  return finalizeValidation(input, errors, warnings);
}

export function createFemEntityMappingContract(input, options = {}) {
  const candidate = withContractHeader(input, FEM_CONTRACT_SCHEMAS.mapping);
  return throwForInvalidContract(
    "FemEntityMappingContract",
    validateFemEntityMappingContract(candidate, options),
  );
}
