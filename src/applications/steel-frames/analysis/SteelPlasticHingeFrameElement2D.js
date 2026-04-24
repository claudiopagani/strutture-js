import { FrameElement2DEulerBernoulli } from "../../../domain/fem/elements/FrameElement2DEulerBernoulli.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { SteelPlasticHingeState } from "./SteelPlasticHingeState.js";

const ROTATION_INDEX_BY_POSITION = Object.freeze({
  start: 2,
  end: 5,
});
const SECTION_UNITS = Object.freeze({ force: "N", length: "mm" });
const DEFAULT_FEM_UNITS = Object.freeze({ force: "kN", length: "m" });

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`SteelPlasticHingeFrameElement2D requires a positive ${label}.`);
  }
}

function createZeroMatrix(rows, columns = rows) {
  return Array.from({ length: rows }, () => new Array(columns).fill(0));
}

function createZeroVector(size) {
  return new Array(size).fill(0);
}

function transpose(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return [];
  }

  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

function multiplyMatrices(left, right) {
  if (left.length === 0 || right.length === 0) {
    return createZeroMatrix(left.length, right[0]?.length ?? 0);
  }

  return left.map((leftRow) =>
    right[0].map((_, column) =>
      leftRow.reduce((sum, value, index) => sum + value * right[index][column], 0),
    ),
  );
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0),
  );
}

function subtractMatrices(left, right) {
  return left.map((row, rowIndex) =>
    row.map((value, columnIndex) => value - right[rowIndex][columnIndex]),
  );
}

function addVectors(left, right) {
  return left.map((value, index) => value + right[index]);
}

function scalarVector(value, vector) {
  return vector.map((entry) => value * entry);
}

function invertSmallDenseMatrix(matrix) {
  if (matrix.length === 1 && matrix[0].length === 1) {
    assertPositive(Math.abs(matrix[0][0]), "hinge condensation pivot");
    return [[1 / matrix[0][0]]];
  }

  if (matrix.length !== 2 || matrix[0].length !== 2 || matrix[1].length !== 2) {
    throw new Error(
      "SteelPlasticHingeFrameElement2D supports condensation of at most two plastic hinge rotations.",
    );
  }

  const [[a, b], [c, d]] = matrix;
  const determinant = a * d - b * c;

  assertPositive(Math.abs(determinant), "hinge condensation determinant");

  return [
    [d / determinant, -b / determinant],
    [-c / determinant, a / determinant],
  ];
}

function signLabel(value) {
  if (!Number.isFinite(value) || value === 0) {
    return "positive";
  }

  return value >= 0 ? "positive" : "negative";
}

function plasticGeneralizedForce(position, sign, plasticMoment) {
  const factor = sign === "negative" ? 1 : -1;

  return factor * plasticMoment;
}

function normalizeSectionOrientation(sectionOrientation = {}) {
  const orientation = sectionOrientation ?? {};
  const rawAxis =
    typeof orientation === "string"
      ? orientation
      : orientation.axis ??
        orientation.inPlaneAxis ??
        orientation.bendingAxis ??
        "y";
  const axis = String(rawAxis)
    .trim()
    .toLowerCase();
  const resolvedAxis =
    ["z", "weak", "minor", "weak-axis", "minor-axis", "asse-debole"].includes(axis)
      ? "z"
      : "y";

  return {
    axis: resolvedAxis,
    label:
      orientation.label ??
      (resolvedAxis === "z" ? "weak-axis-in-plane" : "strong-axis-in-plane"),
    rotationDegrees:
      Number.isFinite(orientation.rotationDegrees)
        ? orientation.rotationDegrees
        : resolvedAxis === "z"
          ? 90
          : 0,
    mounting:
      orientation.mounting ??
      orientation.openSide ??
      orientation.webSide ??
      null,
    inertiaProperty: resolvedAxis === "z" ? "inertiaZ" : "inertiaY",
    elasticSectionModulusProperty:
      resolvedAxis === "z"
        ? "elasticSectionModulusZ"
        : "elasticSectionModulusY",
    plasticSectionModulusProperty:
      resolvedAxis === "z"
        ? "plasticSectionModulusZ"
        : "plasticSectionModulusY",
  };
}

export class SteelPlasticHingeFrameElement2D {
  constructor({
    id,
    startNode,
    endNode,
    section,
    material,
    sectionOrientation = null,
    axialRigidity = null,
    flexuralRigidity = null,
    plasticMomentStart = null,
    plasticMomentEnd = null,
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A SteelPlasticHingeFrameElement2D id is required.");
    }

    this.id = id;
    this.type = "steel-frame-2d-plastic-hinge";
    this.startNode = startNode;
    this.endNode = endNode;
    this.nodes = [startNode, endNode];
    this.section = section;
    this.material = material;
    this.analysisUnits = startNode?.units ?? DEFAULT_FEM_UNITS;
    this.sectionOrientation = normalizeSectionOrientation(sectionOrientation);
    this.metadata = { ...metadata };
    this.axialRigidity = axialRigidity ?? this.defaultAxialRigidity();
    this.flexuralRigidity = flexuralRigidity ?? this.defaultFlexuralRigidity();
    this.elasticElement = new FrameElement2DEulerBernoulli({
      id: `${id}__elastic`,
      startNode,
      endNode,
      crossSection: section,
      material,
      axialRigidity: this.axialRigidity,
      flexuralRigidity: this.flexuralRigidity,
      bendingInertiaAxis: this.sectionOrientation.inertiaProperty,
      metadata,
    });
    this.plasticMomentStart =
      plasticMomentStart ?? this.defaultPlasticMomentCapacity();
    this.plasticMomentEnd =
      plasticMomentEnd ?? this.defaultPlasticMomentCapacity();

    assertPositive(this.plasticMomentStart, "plasticMomentStart");
    assertPositive(this.plasticMomentEnd, "plasticMomentEnd");
  }

  defaultPlasticMomentCapacity() {
    const property = this.sectionOrientation.plasticSectionModulusProperty;
    const sectionModulus = this.section?.[property];
    const designStrength = this.material?.fyd ?? this.material?.fyk;
    const resolver = createUnitResolver(SECTION_UNITS, this.analysisUnits);

    assertPositive(sectionModulus, `section ${property}`);
    assertPositive(designStrength, "material fyd");

    return resolver.moment(sectionModulus * designStrength);
  }

  defaultAxialRigidity() {
    const elasticModulus = this.material?.elasticModulus;
    const area = this.section?.area;
    const resolver = createUnitResolver(SECTION_UNITS, this.analysisUnits);

    assertPositive(elasticModulus, "material elasticModulus");
    assertPositive(area, "section area");

    return resolver.force(elasticModulus * area);
  }

  defaultFlexuralRigidity() {
    const elasticModulus = this.material?.elasticModulus;
    const property = this.sectionOrientation.inertiaProperty;
    const inertia = this.section?.[property];
    const resolver = createUnitResolver(SECTION_UNITS, this.analysisUnits);

    assertPositive(elasticModulus, "material elasticModulus");
    assertPositive(inertia, `section ${property}`);

    return resolver.convert(elasticModulus * inertia, {
      forceExponent: 1,
      lengthExponent: 2,
    });
  }

  plasticMomentCapacity(position) {
    return position === "end"
      ? this.plasticMomentEnd
      : this.plasticMomentStart;
  }

  getDofIds(dofRegistry) {
    return this.elasticElement.getDofIds(dofRegistry);
  }

  transformationMatrix() {
    return this.elasticElement.transformationMatrix();
  }

  localElasticStiffness() {
    return this.elasticElement.localStiffness();
  }

  localDisplacements(globalDisplacements, dofRegistry) {
    return this.elasticElement.localDisplacements(globalDisplacements, dofRegistry);
  }

  globalElasticStiffness() {
    return this.elasticElement.globalStiffness();
  }

  releasedRotationPositions(hingeState) {
    const positions = [];

    if (hingeState?.isActiveAt("start")) {
      positions.push("start");
    }

    if (hingeState?.isActiveAt("end")) {
      positions.push("end");
    }

    return positions;
  }

  condensationOperators(hingeState) {
    const positions = this.releasedRotationPositions(hingeState);
    const h = createZeroMatrix(6, positions.length);

    positions.forEach((position, column) => {
      h[ROTATION_INDEX_BY_POSITION[position]][column] = -1;
    });

    return {
      positions,
      h,
    };
  }

  responseForState(localDisplacements, hingeState) {
    const k = this.localElasticStiffness();
    const {
      positions,
      h,
    } = this.condensationOperators(hingeState);

    if (positions.length === 0) {
      const localEndForces = multiplyMatrixVector(k, localDisplacements);

      return {
        hingeState,
        plasticRotations: [],
        localEndForces,
        localEquivalentForce: createZeroVector(6),
        tangentLocalStiffness: k,
      };
    }

    const ht = transpose(h);
    const kaa = multiplyMatrices(ht, multiplyMatrices(k, h));
    const htkd = multiplyMatrixVector(ht, multiplyMatrixVector(k, localDisplacements));
    const prescribedGeneralizedForce = positions.map((position) =>
      plasticGeneralizedForce(
        position,
        hingeState.signAt(position),
        this.plasticMomentCapacity(position),
      ),
    );
    const invKaa = invertSmallDenseMatrix(kaa);
    const plasticRotations = multiplyMatrixVector(
      invKaa,
      prescribedGeneralizedForce.map(
        (value, index) => value - htkd[index],
      ),
    );
    const localElasticDisplacements = addVectors(
      localDisplacements,
      multiplyMatrixVector(h, plasticRotations),
    );
    const localEndForces = multiplyMatrixVector(k, localElasticDisplacements);
    const tangentLocalStiffness = subtractMatrices(
      k,
      multiplyMatrices(
        multiplyMatrices(k, h),
        multiplyMatrices(invKaa, multiplyMatrices(ht, k)),
      ),
    );
    const localEquivalentForce = multiplyMatrixVector(
      multiplyMatrices(multiplyMatrices(k, h), invKaa),
      prescribedGeneralizedForce,
    );

    return {
      hingeState,
      plasticRotations,
      localEndForces,
      localEquivalentForce,
      tangentLocalStiffness,
    };
  }

  activateMissingHinges(localEndForces, hingeState, yieldTolerance) {
    let updatedState = hingeState;

    for (const position of ["start", "end"]) {
      if (updatedState.isActiveAt(position)) {
        continue;
      }

      const localMoment = localEndForces[ROTATION_INDEX_BY_POSITION[position]];
      const plasticMoment = this.plasticMomentCapacity(position);
      const activationThreshold =
        plasticMoment * (1 - Math.max(0, yieldTolerance ?? 0));

      if (Math.abs(localMoment) >= activationThreshold) {
        updatedState = updatedState.withActivation(position, signLabel(localMoment), {
          elementId: this.id,
          plasticMoment,
          trialMoment: localMoment,
        });
      }
    }

    return updatedState;
  }

  evaluate({
    globalDisplacements,
    dofRegistry,
    hingeState = new SteelPlasticHingeState(),
    yieldTolerance = 1e-9,
  } = {}) {
    const localDisplacements = this.localDisplacements(globalDisplacements, dofRegistry);
    let trialState =
      hingeState instanceof SteelPlasticHingeState
        ? hingeState.clone()
        : new SteelPlasticHingeState(hingeState);
    let response = null;

    for (let iteration = 0; iteration < 3; iteration += 1) {
      response = this.responseForState(localDisplacements, trialState);
      const updatedState = this.activateMissingHinges(
        response.localEndForces,
        trialState,
        yieldTolerance,
      );

      if (
        updatedState.start === trialState.start &&
        updatedState.end === trialState.end
      ) {
        break;
      }

      trialState = updatedState;
    }

    const transformation = this.transformationMatrix();
    const tangentGlobalStiffness = multiplyMatrices(
      transpose(transformation),
      multiplyMatrices(response.tangentLocalStiffness, transformation),
    );
    const globalEndForces = multiplyMatrixVector(
      transpose(transformation),
      response.localEndForces,
    );

    return {
      ...response,
      hingeState: trialState,
      newActivations:
        hingeState instanceof SteelPlasticHingeState
          ? hingeState.activationDelta(trialState)
          : new SteelPlasticHingeState(hingeState).activationDelta(trialState),
      localDisplacements,
      globalEndForces,
      tangentGlobalStiffness,
    };
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      startNodeId: this.startNode.id,
      endNodeId: this.endNode.id,
      length: this.elasticElement.length(),
      profileName: this.section?.profileName ?? null,
      axialRigidity: this.axialRigidity,
      flexuralRigidity: this.flexuralRigidity,
      plasticMomentStart: this.plasticMomentStart,
      plasticMomentEnd: this.plasticMomentEnd,
      sectionOrientation: { ...this.sectionOrientation },
      bendingInertiaAxis: this.sectionOrientation.inertiaProperty,
      plasticSectionModulusAxis:
        this.sectionOrientation.plasticSectionModulusProperty,
      material: this.material?.toJSON?.() ?? this.material,
      section: this.section?.toJSON?.() ?? this.section,
      metadata: { ...this.metadata },
    };
  }
}
