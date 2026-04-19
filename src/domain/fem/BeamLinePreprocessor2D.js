import { Node } from "../geometry/Node.js";
import { DistributedLoad } from "../loads/DistributedLoad.js";
import { NodalLoad } from "../loads/NodalLoad.js";
import { Support } from "../supports/Support.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";
import { FrameElement2DEulerBernoulli } from "./elements/FrameElement2DEulerBernoulli.js";

const FEM_INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" });
const DISTRIBUTED_LOAD_TYPES = ["distributed", "uniform", "line"];
const POINT_LOAD_TYPES = ["point", "nodal", "force", "moment"];

function assertFinite(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`BeamLinePreprocessor2D requires a finite ${label}.`);
  }
}

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`BeamLinePreprocessor2D requires a positive ${label}.`);
  }
}

function normalizePosition(value, unitResolver, label) {
  assertFinite(value, label);
  return unitResolver.length(value);
}

function addPoint(points, x, tolerance) {
  if (!points.some((point) => Math.abs(point - x) <= tolerance)) {
    points.push(x);
  }
}

function sortPoints(points) {
  return [...points].sort((a, b) => a - b);
}

function resolvePointComponents(load, unitResolver) {
  if (load.components) {
    return {
      fx: unitResolver.force(load.components.fx ?? 0),
      fy: unitResolver.force(load.components.fy ?? 0),
      fz: unitResolver.force(load.components.fz ?? 0),
      mx: unitResolver.moment(load.components.mx ?? 0),
      my: unitResolver.moment(load.components.my ?? 0),
      mz: unitResolver.moment(load.components.mz ?? 0),
    };
  }

  const value = load.value ?? load.magnitude;

  assertFinite(value, "point load value");

  const direction = load.direction ?? (load.type === "moment" ? "mz" : "fy");

  if (["x", "fx", "global-x"].includes(direction)) {
    return { fx: unitResolver.force(value) };
  }

  if (["y", "fy", "global-y", "vertical"].includes(direction)) {
    return { fy: unitResolver.force(value) };
  }

  if (["mz", "rz", "moment", "moment-z"].includes(direction)) {
    return { mz: unitResolver.moment(value) };
  }

  throw new Error(`Unsupported point load direction: ${direction}.`);
}

function resolveSpringStiffness(springStiffness = {}, unitResolver) {
  return {
    ux: unitResolver.translationalStiffness(springStiffness.ux ?? 0),
    uy: unitResolver.translationalStiffness(springStiffness.uy ?? 0),
    uz: unitResolver.translationalStiffness(springStiffness.uz ?? 0),
    rx: unitResolver.rotationalStiffness(springStiffness.rx ?? 0),
    ry: unitResolver.rotationalStiffness(springStiffness.ry ?? 0),
    rz: unitResolver.rotationalStiffness(springStiffness.rz ?? 0),
  };
}

function validateDistributedLoad(load, unitResolver, span) {
  if (load.type === "trapezoidal" || load.distribution === "trapezoidal") {
    throw new Error(
      "BeamLinePreprocessor2D does not support trapezoidal loads; discretize them into uniform subloads.",
    );
  }

  const from =
    load.from == null && load.start == null
      ? 0
      : normalizePosition(load.from ?? load.start, unitResolver, "distributed load start");
  const to =
    load.to == null && load.end == null
      ? span
      : normalizePosition(load.to ?? load.end, unitResolver, "distributed load end");

  if (from < -1e-12 || to > span + 1e-12 || from >= to) {
    throw new Error("BeamLinePreprocessor2D distributed load range must lie within the beam span.");
  }

  const startValue = load.value ?? load.startValue;
  const endValue = load.endValue ?? startValue;

  assertFinite(startValue, "distributed load value");
  assertFinite(endValue, "distributed load end value");

  if (Math.abs(startValue - endValue) > 1e-12) {
    throw new Error(
      "BeamLinePreprocessor2D does not support tapered loads; discretize them into uniform subloads.",
    );
  }

  return {
    ...load,
    from,
    to,
    value: unitResolver.lineLoad(startValue),
  };
}

function convertElementOptions(elementOptions, unitResolver) {
  const resolved = { ...elementOptions };

  if (Number.isFinite(resolved.axialRigidity)) {
    resolved.axialRigidity = unitResolver.force(resolved.axialRigidity);
  }

  if (Number.isFinite(resolved.flexuralRigidity)) {
    resolved.flexuralRigidity = unitResolver.convert(resolved.flexuralRigidity, {
      forceExponent: 1,
      lengthExponent: 2,
    });
  }

  if (Number.isFinite(resolved.shearRigidity)) {
    resolved.shearRigidity = unitResolver.force(resolved.shearRigidity);
  }

  return resolved;
}

export class BeamLinePreprocessor2D {
  constructor({
    nodeIdPrefix = "beam-node",
    elementIdPrefix = "beam-element",
    tolerance = 1e-9,
    elementClass = FrameElement2DEulerBernoulli,
  } = {}) {
    assertPositive(tolerance, "tolerance");

    this.nodeIdPrefix = nodeIdPrefix;
    this.elementIdPrefix = elementIdPrefix;
    this.tolerance = tolerance;
    this.elementClass = elementClass;
  }

  build({
    id = "beam",
    span,
    units,
    element = {},
    supports = [],
    loads = [],
    discretization = {},
    metadata = {},
  } = {}) {
    assertExplicitUnitSystem(units, "BeamLinePreprocessor2D");

    const unitResolver = createUnitResolver(units, FEM_INTERNAL_UNITS);
    const resolvedSpan = unitResolver.length(span);

    assertPositive(resolvedSpan, "span");

    for (const load of loads) {
      const type = load.type ?? "point";

      if (type === "trapezoidal" || load.distribution === "trapezoidal") {
        throw new Error(
          "BeamLinePreprocessor2D does not support trapezoidal loads; discretize them into uniform subloads.",
        );
      }

      if (!DISTRIBUTED_LOAD_TYPES.includes(type) && !POINT_LOAD_TYPES.includes(type)) {
        throw new Error(`BeamLinePreprocessor2D does not support load type: ${type}.`);
      }
    }

    const distributedLoadInputs = loads.filter((load) =>
      DISTRIBUTED_LOAD_TYPES.includes(load.type ?? "point"),
    );
    const pointLoadInputs = loads.filter((load) =>
      POINT_LOAD_TYPES.includes(load.type ?? "point"),
    );
    const distributedLoadDefinitions = distributedLoadInputs.map((load) =>
      validateDistributedLoad(load, unitResolver, resolvedSpan),
    );
    const points = [0, resolvedSpan];

    this.addDiscretizationPoints(points, resolvedSpan, unitResolver, discretization);

    for (const support of supports) {
      addPoint(
        points,
        normalizePosition(support.x, unitResolver, `support ${support.id ?? ""} position`),
        this.tolerance,
      );
    }

    for (const load of pointLoadInputs) {
      addPoint(
        points,
        normalizePosition(load.x ?? load.position, unitResolver, `load ${load.id ?? ""} position`),
        this.tolerance,
      );
    }

    for (const load of distributedLoadDefinitions) {
      addPoint(points, load.from, this.tolerance);
      addPoint(points, load.to, this.tolerance);
    }

    const sortedPoints = sortPoints(points);
    const nodes = sortedPoints.map((x, index) =>
      new Node({
        id: `${id}-${this.nodeIdPrefix}-${index + 1}`,
        x,
        units: FEM_INTERNAL_UNITS,
      }),
    );
    const nodeAt = (x) => {
      const index = sortedPoints.findIndex(
        (point) => Math.abs(point - x) <= this.tolerance,
      );

      if (index < 0) {
        throw new Error(`BeamLinePreprocessor2D cannot find a node at x=${x}.`);
      }

      return nodes[index];
    };
    const resolvedElementOptions = convertElementOptions(element, unitResolver);
    const elements = [];

    for (let index = 0; index < nodes.length - 1; index += 1) {
      elements.push(
        new this.elementClass({
          id: `${id}-${this.elementIdPrefix}-${index + 1}`,
          startNode: nodes[index],
          endNode: nodes[index + 1],
          ...resolvedElementOptions,
        }),
      );
    }

    const supportObjects = supports.map((support, index) => {
      const x = normalizePosition(
        support.x,
        unitResolver,
        `support ${support.id ?? index + 1} position`,
      );

      return new Support({
        id: support.id ?? `${id}-support-${index + 1}`,
        node: nodeAt(x),
        restraints: { ...support.restraints },
        springStiffness: resolveSpringStiffness(
          support.springStiffness,
          unitResolver,
        ),
        metadata: { ...support.metadata, x },
      });
    });
    const nodalLoads = pointLoadInputs.map((load, index) => {
      const x = normalizePosition(
        load.x ?? load.position,
        unitResolver,
        `load ${load.id ?? index + 1} position`,
      );

      return new NodalLoad({
        id: load.id ?? `${id}-nodal-load-${index + 1}`,
        node: nodeAt(x),
        components: resolvePointComponents(load, unitResolver),
        units: FEM_INTERNAL_UNITS,
        metadata: { ...load.metadata, x, sourceType: load.type ?? "point" },
      });
    });
    const distributedLoads = [];

    for (const load of distributedLoadDefinitions) {
      for (const currentElement of elements) {
        const startX = currentElement.startNode.x;
        const endX = currentElement.endNode.x;
        const isCovered =
          startX >= load.from - this.tolerance &&
          endX <= load.to + this.tolerance;

        if (!isCovered) {
          continue;
        }

        distributedLoads.push(
          new DistributedLoad({
            id: `${load.id ?? `${id}-distributed-load`}-${currentElement.id}`,
            element: currentElement,
            startValue: load.value,
            direction: load.direction ?? "y",
            referenceSystem: load.referenceSystem ?? "local",
            distribution: "uniform",
            length: currentElement.length(),
            units: FEM_INTERNAL_UNITS,
            metadata: {
              ...load.metadata,
              sourceId: load.id ?? null,
              from: startX,
              to: endX,
            },
          }),
        );
      }
    }

    return {
      id,
      units: FEM_INTERNAL_UNITS,
      span: resolvedSpan,
      nodes,
      elements,
      supports: supportObjects,
      nodalLoads,
      loads: distributedLoads,
      distributedLoads,
      pointLoads: nodalLoads,
      allLoads: [...distributedLoads, ...nodalLoads],
      stations: sortedPoints,
      metadata: {
        ...metadata,
        sourceUnits: unitResolver.sourceUnitSystem,
        unitSystem: unitResolver.targetUnitSystem,
        generatedBy: "BeamLinePreprocessor2D",
      },
    };
  }

  addDiscretizationPoints(points, span, unitResolver, discretization = {}) {
    const elementCount = discretization.elementCount ?? null;
    const maxElementLength =
      discretization.maxElementLength == null
        ? null
        : unitResolver.length(discretization.maxElementLength);

    if (elementCount !== null) {
      if (!Number.isInteger(elementCount) || elementCount <= 0) {
        throw new Error("BeamLinePreprocessor2D discretization.elementCount must be a positive integer.");
      }

      for (let index = 1; index < elementCount; index += 1) {
        addPoint(points, (span * index) / elementCount, this.tolerance);
      }
    }

    if (maxElementLength !== null) {
      assertPositive(maxElementLength, "discretization.maxElementLength");

      const count = Math.ceil(span / maxElementLength);

      for (let index = 1; index < count; index += 1) {
        addPoint(points, (span * index) / count, this.tolerance);
      }
    }
  }
}
