import {
  FEM_CONTRACT_SCHEMAS,
  addError,
  crossProduct,
  dotProduct,
  finalizeValidation,
  normalized,
  throwForInvalidContract,
  validateArray,
  validateAxes,
  validateBoolean,
  validateFinite,
  validateFiniteVector,
  validateHeader,
  validateId,
  validateIdArray,
  validateRecord,
  validateReferences,
  validateString,
  validateUniqueIds,
  validateUnits,
  vectorBetween,
  withContractHeader,
} from "./FemContractValidation.js";

const DOF_NAMES = ["ux", "uy", "uz", "rx", "ry", "rz"];
const GROUP_TARGETS = new Map([
  ["nodes", "nodes"],
  ["line-elements", "lineElements"],
  ["shell-elements", "shellElements"],
  ["links", "links"],
  ["diaphragms", "diaphragms"],
  ["storeys", "storeys"],
  ["section-cuts", "sectionCuts"],
]);

function requireCollections(input, errors) {
  const names = [
    "nodes",
    "materials",
    "sections",
    "lineElements",
    "shellElements",
    "supports",
    "links",
    "constraints",
    "diaphragms",
    "storeys",
    "groups",
    "sectionCuts",
  ];

  for (const name of names) {
    validateArray(input[name], `$.${name}`, errors);
  }
}

function validateGlobalCoordinateSystem(system, errors) {
  if (!validateRecord(system, "$.globalCoordinateSystem", errors)) return;

  validateId(system.id, "$.globalCoordinateSystem.id", errors);
  validateString(system.type, "$.globalCoordinateSystem.type", errors, {
    allowed: ["cartesian"],
  });
  validateString(system.handedness, "$.globalCoordinateSystem.handedness", errors, {
    allowed: ["right"],
  });
  validateString(system.verticalAxis, "$.globalCoordinateSystem.verticalAxis", errors, {
    allowed: ["X", "Y", "Z"],
  });
  validateString(
    system.rotationConvention,
    "$.globalCoordinateSystem.rotationConvention",
    errors,
    { allowed: ["right-hand-rule"] },
  );
  validateFiniteVector(system.origin, "$.globalCoordinateSystem.origin", errors);
  validateAxes(system.axes, "$.globalCoordinateSystem.axes", errors);

  if (validateFiniteVector(
    system.gravityDirection,
    "$.globalCoordinateSystem.gravityDirection",
    errors,
  )) {
    const direction = normalized(system.gravityDirection);
    if (!direction) {
      addError(
        errors,
        "FEM_DEGENERATE_VECTOR",
        "$.globalCoordinateSystem.gravityDirection",
        "Gravity direction must be non-zero.",
      );
    }
  }
}

function validateNodes(nodes, errors) {
  const index = validateUniqueIds(nodes, "$.nodes", errors);
  nodes?.forEach((node, itemIndex) => {
    validateFiniteVector(node.coordinates, `$.nodes[${itemIndex}].coordinates`, errors);
    if (node.metadata != null) {
      validateRecord(node.metadata, `$.nodes[${itemIndex}].metadata`, errors);
    }
  });
  return index;
}

function validateMaterials(materials, errors) {
  const index = validateUniqueIds(materials, "$.materials", errors);
  materials?.forEach((material, itemIndex) => {
    validateString(material.type, `$.materials[${itemIndex}].type`, errors);
    validateRecord(material.properties, `$.materials[${itemIndex}].properties`, errors);
  });
  return index;
}

function validateSections(sections, materialIndex, errors) {
  const index = validateUniqueIds(sections, "$.sections", errors);
  sections?.forEach((section, itemIndex) => {
    const path = `$.sections[${itemIndex}]`;
    validateString(section.type, `${path}.type`, errors, {
      allowed: ["line", "shell", "solid"],
    });
    if (validateId(section.materialId, `${path}.materialId`, errors) &&
        !materialIndex.has(section.materialId)) {
      addError(
        errors,
        "FEM_UNKNOWN_REFERENCE",
        `${path}.materialId`,
        `${path}.materialId references unknown material ${section.materialId}.`,
      );
    }
    validateRecord(section.properties, `${path}.properties`, errors);
  });
  return index;
}

function validateOffsets(offsets, path, errors) {
  if (offsets == null) return;
  if (!validateRecord(offsets, path, errors)) return;

  for (const end of ["start", "end"]) {
    const endPath = `${path}.${end}`;
    if (!validateRecord(offsets[end], endPath, errors)) continue;
    validateString(offsets[end].referenceSystem, `${endPath}.referenceSystem`, errors, {
      allowed: ["global", "local"],
    });
    validateFiniteVector(offsets[end].vector, `${endPath}.vector`, errors);
  }
}

function validateLineElements(lineElements, indices, errors) {
  const index = validateUniqueIds(lineElements, "$.lineElements", errors);

  lineElements?.forEach((element, itemIndex) => {
    const path = `$.lineElements[${itemIndex}]`;
    if (validateIdArray(element.nodeIds, `${path}.nodeIds`, errors, { minLength: 2 }) &&
        element.nodeIds.length !== 2) {
      addError(
        errors,
        "FEM_INVALID_CONNECTIVITY",
        `${path}.nodeIds`,
        "A line element must reference exactly two distinct nodes.",
      );
    }
    validateReferences(element.nodeIds, indices.nodes, `${path}.nodeIds`, errors, "node");

    for (const [key, target, label] of [
      ["sectionId", indices.sections, "section"],
      ["materialId", indices.materials, "material"],
    ]) {
      if (validateId(element[key], `${path}.${key}`, errors) && !target.has(element[key])) {
        addError(
          errors,
          "FEM_UNKNOWN_REFERENCE",
          `${path}.${key}`,
          `${path}.${key} references unknown ${label} ${element[key]}.`,
        );
      }
    }
    const section = indices.sections.get(element.sectionId);
    if (section && section.type !== "line") {
      addError(
        errors,
        "FEM_SECTION_TYPE_MISMATCH",
        `${path}.sectionId`,
        `${path} requires a line section.`,
      );
    }
    if (section && section.materialId !== element.materialId) {
      addError(
        errors,
        "FEM_MATERIAL_REFERENCE_MISMATCH",
        `${path}.materialId`,
        `${path}.materialId must match the referenced section materialId.`,
      );
    }

    const axesValid = validateAxes(element.localAxes, `${path}.localAxes`, errors);
    validateOffsets(element.offsets, `${path}.offsets`, errors);

    const start = indices.nodes.get(element.nodeIds?.[0])?.coordinates;
    const end = indices.nodes.get(element.nodeIds?.[1])?.coordinates;
    const direction = start && end ? normalized(vectorBetween(start, end)) : null;
    if (start && end && !direction) {
      addError(
        errors,
        "FEM_DEGENERATE_ELEMENT",
        `${path}.nodeIds`,
        `${path} has coincident end nodes.`,
      );
    } else if (direction && axesValid && dotProduct(direction, element.localAxes.x) < 1 - 1e-8) {
      addError(
        errors,
        "FEM_LOCAL_AXIS_MISMATCH",
        `${path}.localAxes.x`,
        `${path}.localAxes.x must point from nodeIds[0] to nodeIds[1].`,
      );
    }
  });

  return index;
}

function validateShellElements(shellElements, indices, errors) {
  const index = validateUniqueIds(shellElements, "$.shellElements", errors);

  shellElements?.forEach((element, itemIndex) => {
    const path = `$.shellElements[${itemIndex}]`;
    const connectivityValid = validateIdArray(
      element.nodeIds,
      `${path}.nodeIds`,
      errors,
      { minLength: 3 },
    );
    if (connectivityValid && ![3, 4].includes(element.nodeIds.length)) {
      addError(
        errors,
        "FEM_INVALID_CONNECTIVITY",
        `${path}.nodeIds`,
        "A shell element must reference three or four distinct nodes.",
      );
    }
    validateReferences(element.nodeIds, indices.nodes, `${path}.nodeIds`, errors, "node");

    for (const [key, target, label] of [
      ["sectionId", indices.sections, "section"],
      ["materialId", indices.materials, "material"],
    ]) {
      if (validateId(element[key], `${path}.${key}`, errors) && !target.has(element[key])) {
        addError(
          errors,
          "FEM_UNKNOWN_REFERENCE",
          `${path}.${key}`,
          `${path}.${key} references unknown ${label} ${element[key]}.`,
        );
      }
    }
    const section = indices.sections.get(element.sectionId);
    if (section && section.type !== "shell") {
      addError(
        errors,
        "FEM_SECTION_TYPE_MISMATCH",
        `${path}.sectionId`,
        `${path} requires a shell section.`,
      );
    }
    if (section && section.materialId !== element.materialId) {
      addError(
        errors,
        "FEM_MATERIAL_REFERENCE_MISMATCH",
        `${path}.materialId`,
        `${path}.materialId must match the referenced section materialId.`,
      );
    }

    const axesValid = validateAxes(element.localAxes, `${path}.localAxes`, errors);
    validateString(element.faceConvention, `${path}.faceConvention`, errors, {
      allowed: ["positive-local-z"],
    });

    const coordinates = element.nodeIds?.slice(0, 3)
      .map((nodeId) => indices.nodes.get(nodeId)?.coordinates);
    if (coordinates?.length === 3 && coordinates.every(Boolean)) {
      const firstEdge = vectorBetween(coordinates[0], coordinates[1]);
      const secondEdge = vectorBetween(coordinates[0], coordinates[2]);
      const normal = normalized(crossProduct(firstEdge, secondEdge));
      if (!normal) {
        addError(
          errors,
          "FEM_DEGENERATE_ELEMENT",
          `${path}.nodeIds`,
          `${path} has degenerate shell connectivity.`,
        );
      } else if (axesValid && dotProduct(normal, element.localAxes.z) < 1 - 1e-8) {
        addError(
          errors,
          "FEM_LOCAL_AXIS_MISMATCH",
          `${path}.localAxes.z`,
          `${path}.localAxes.z must follow the connectivity right-hand rule.`,
        );
      }
    }
  });

  return index;
}

function validateSupports(supports, nodeIndex, errors) {
  const index = validateUniqueIds(supports, "$.supports", errors);
  supports?.forEach((support, itemIndex) => {
    const path = `$.supports[${itemIndex}]`;
    if (validateId(support.nodeId, `${path}.nodeId`, errors) &&
        !nodeIndex.has(support.nodeId)) {
      addError(
        errors,
        "FEM_UNKNOWN_REFERENCE",
        `${path}.nodeId`,
        `${path}.nodeId references unknown node ${support.nodeId}.`,
      );
    }
    if (validateRecord(support.restraints, `${path}.restraints`, errors)) {
      for (const dof of DOF_NAMES) {
        validateBoolean(support.restraints[dof], `${path}.restraints.${dof}`, errors);
      }
    }
  });
  return index;
}

function validateLinks(links, nodeIndex, errors) {
  const index = validateUniqueIds(links, "$.links", errors);
  links?.forEach((link, itemIndex) => {
    const path = `$.links[${itemIndex}]`;
    if (validateIdArray(link.nodeIds, `${path}.nodeIds`, errors, { minLength: 2 }) &&
        link.nodeIds.length !== 2) {
      addError(errors, "FEM_INVALID_CONNECTIVITY", `${path}.nodeIds`, "A link needs two nodes.");
    }
    validateReferences(link.nodeIds, nodeIndex, `${path}.nodeIds`, errors, "node");
    validateString(link.type, `${path}.type`, errors);
    validateAxes(link.localAxes, `${path}.localAxes`, errors);
    validateRecord(link.properties, `${path}.properties`, errors);
  });
  return index;
}

function validateConstraints(constraints, nodeIndex, errors) {
  const index = validateUniqueIds(constraints, "$.constraints", errors);
  constraints?.forEach((constraint, itemIndex) => {
    const path = `$.constraints[${itemIndex}]`;
    validateString(constraint.type, `${path}.type`, errors);
    if (validateId(constraint.masterNodeId, `${path}.masterNodeId`, errors) &&
        !nodeIndex.has(constraint.masterNodeId)) {
      addError(
        errors,
        "FEM_UNKNOWN_REFERENCE",
        `${path}.masterNodeId`,
        `${path}.masterNodeId references unknown node ${constraint.masterNodeId}.`,
      );
    }
    validateIdArray(constraint.slaveNodeIds, `${path}.slaveNodeIds`, errors, { minLength: 1 });
    validateReferences(
      constraint.slaveNodeIds,
      nodeIndex,
      `${path}.slaveNodeIds`,
      errors,
      "node",
    );
    if (validateArray(constraint.dofs, `${path}.dofs`, errors)) {
      constraint.dofs.forEach((dof, dofIndex) => {
        validateString(dof, `${path}.dofs[${dofIndex}]`, errors, { allowed: DOF_NAMES });
      });
    }
  });
  return index;
}

function validateDiaphragms(diaphragms, nodeIndex, errors) {
  const index = validateUniqueIds(diaphragms, "$.diaphragms", errors);
  diaphragms?.forEach((diaphragm, itemIndex) => {
    const path = `$.diaphragms[${itemIndex}]`;
    validateString(diaphragm.type, `${path}.type`, errors, {
      allowed: ["rigid", "semi-rigid"],
    });
    validateIdArray(diaphragm.nodeIds, `${path}.nodeIds`, errors, { minLength: 3 });
    validateReferences(diaphragm.nodeIds, nodeIndex, `${path}.nodeIds`, errors, "node");
    if (validateRecord(diaphragm.plane, `${path}.plane`, errors)) {
      validateFiniteVector(diaphragm.plane.origin, `${path}.plane.origin`, errors);
      validateAxes(diaphragm.plane.localAxes, `${path}.plane.localAxes`, errors);
    }
  });
  return index;
}

function validateStoreys(storeys, diaphragmIndex, errors) {
  const index = validateUniqueIds(storeys, "$.storeys", errors);
  const levelIndices = new Set();
  storeys?.forEach((storey, itemIndex) => {
    const path = `$.storeys[${itemIndex}]`;
    validateString(storey.name, `${path}.name`, errors);
    validateFinite(storey.elevation, `${path}.elevation`, errors);
    if (validateFinite(storey.levelIndex, `${path}.levelIndex`, errors, { integer: true })) {
      if (levelIndices.has(storey.levelIndex)) {
        addError(
          errors,
          "FEM_DUPLICATE_LEVEL_INDEX",
          `${path}.levelIndex`,
          `Duplicate storey levelIndex ${storey.levelIndex}.`,
        );
      }
      levelIndices.add(storey.levelIndex);
    }
    validateIdArray(storey.diaphragmIds, `${path}.diaphragmIds`, errors);
    validateReferences(
      storey.diaphragmIds,
      diaphragmIndex,
      `${path}.diaphragmIds`,
      errors,
      "diaphragm",
    );
  });
  return index;
}

function validateSectionCuts(sectionCuts, elementIndices, errors) {
  const index = validateUniqueIds(sectionCuts, "$.sectionCuts", errors);
  sectionCuts?.forEach((sectionCut, itemIndex) => {
    const path = `$.sectionCuts[${itemIndex}]`;
    if (validateRecord(sectionCut.plane, `${path}.plane`, errors)) {
      validateFiniteVector(sectionCut.plane.origin, `${path}.plane.origin`, errors);
      validateAxes(sectionCut.plane.localAxes, `${path}.plane.localAxes`, errors);
    }
    validateIdArray(sectionCut.lineElementIds, `${path}.lineElementIds`, errors);
    validateIdArray(sectionCut.shellElementIds, `${path}.shellElementIds`, errors);
    validateReferences(
      sectionCut.lineElementIds,
      elementIndices.lineElements,
      `${path}.lineElementIds`,
      errors,
      "line element",
    );
    validateReferences(
      sectionCut.shellElementIds,
      elementIndices.shellElements,
      `${path}.shellElementIds`,
      errors,
      "shell element",
    );
  });
  return index;
}

function validateGroups(groups, indices, errors) {
  const index = validateUniqueIds(groups, "$.groups", errors);
  groups?.forEach((group, itemIndex) => {
    const path = `$.groups[${itemIndex}]`;
    if (!validateString(group.entityType, `${path}.entityType`, errors, {
      allowed: [...GROUP_TARGETS.keys()],
    })) return;

    validateIdArray(group.entityIds, `${path}.entityIds`, errors, { minLength: 1 });
    const targetName = GROUP_TARGETS.get(group.entityType);
    validateReferences(
      group.entityIds,
      indices[targetName],
      `${path}.entityIds`,
      errors,
      group.entityType,
    );
  });
  return index;
}

export function validateGlobalFemModelContract(input) {
  const errors = [];
  const warnings = [];

  if (validateHeader(input, FEM_CONTRACT_SCHEMAS.model, errors)) {
    validateId(input.id, "$.id", errors);
    validateId(input.hash, "$.hash", errors);
    validateUnits(input.units, "$.units", errors);
    validateGlobalCoordinateSystem(input.globalCoordinateSystem, errors);
    requireCollections(input, errors);

    const nodes = validateNodes(input.nodes, errors);
    const materials = validateMaterials(input.materials, errors);
    const sections = validateSections(input.sections, materials, errors);
    const lineElements = validateLineElements(
      input.lineElements,
      { nodes, materials, sections },
      errors,
    );
    const shellElements = validateShellElements(
      input.shellElements,
      { nodes, materials, sections },
      errors,
    );
    const supports = validateSupports(input.supports, nodes, errors);
    const links = validateLinks(input.links, nodes, errors);
    const constraints = validateConstraints(input.constraints, nodes, errors);
    const diaphragms = validateDiaphragms(input.diaphragms, nodes, errors);
    const storeys = validateStoreys(input.storeys, diaphragms, errors);
    const sectionCuts = validateSectionCuts(
      input.sectionCuts,
      { lineElements, shellElements },
      errors,
    );
    const indices = {
      nodes,
      materials,
      sections,
      lineElements,
      shellElements,
      supports,
      links,
      constraints,
      diaphragms,
      storeys,
      sectionCuts,
    };
    validateGroups(input.groups, indices, errors);

    if (input.metadata != null) {
      validateRecord(input.metadata, "$.metadata", errors);
    }
  }

  return finalizeValidation(input, errors, warnings);
}

export function createGlobalFemModelContract(input) {
  const candidate = withContractHeader(input, FEM_CONTRACT_SCHEMAS.model);
  return throwForInvalidContract(
    "GlobalFemModelContract",
    validateGlobalFemModelContract(candidate),
  );
}
