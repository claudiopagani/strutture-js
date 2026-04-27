import { Node } from "../geometry/Node.js";
import { DistributedLoad } from "../loads/DistributedLoad.js";
import { NodalLoad } from "../loads/NodalLoad.js";
import { Support } from "../supports/Support.js";
import { createUnitResolver } from "../units/UnitSystem.js";
import {
  FrameElement2DEulerBernoulli,
  FrameElement2DTimoshenko,
} from "../fem/elements/index.js";
import {
  DISTRIBUTED_LOAD_TYPES,
  POINT_LOAD_TYPES,
  SingleBeamModel,
  normalizeLoadDirection,
  normalizeProjection,
  projectedLineLoadValue,
  resolveBeamSupportPreset,
} from "./SingleBeamInput.js";
import {
  collectBeamStations,
  coordinateAtStation,
  resolveGeometry,
  resolveStation,
} from "./SingleBeamStations.js";
import { convertBeamProperties } from "./SingleBeamResults.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });

function assertFinite(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`SingleBeamAnalysis requires a finite ${label}.`);
  }
}

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`SingleBeamAnalysis requires a positive ${label}.`);
  }
}

function resolveElementClass(analysisModel, overrideClass = null) {
  if (overrideClass) {
    return overrideClass;
  }

  const normalized = String(analysisModel ?? "euler-bernoulli")
    .trim()
    .toLowerCase();

  if (["euler-bernoulli", "euler", "eb"].includes(normalized)) {
    return FrameElement2DEulerBernoulli;
  }

  if (["timoshenko", "timo"].includes(normalized)) {
    return FrameElement2DTimoshenko;
  }

  throw new Error(`Unsupported beam analysis model: ${analysisModel}.`);
}

export class SingleBeamFemBuilder {
  constructor({
    nodeIdPrefix = "beam-node",
    elementIdPrefix = "beam-element",
    tolerance = 1e-9,
  } = {}) {
    assertPositive(tolerance, "tolerance");

    this.nodeIdPrefix = nodeIdPrefix;
    this.elementIdPrefix = elementIdPrefix;
    this.tolerance = tolerance;
  }

  build(modelOrInput, { loads = null, context = {} } = {}) {
    const model =
      modelOrInput instanceof SingleBeamModel
        ? modelOrInput
        : new SingleBeamModel(modelOrInput);
    const unitResolver = createUnitResolver(model.units, FEM_UNITS);
    const outputResolver = createUnitResolver(FEM_UNITS, model.units);
    const geometry = resolveGeometry(model.geometry, model.units, FEM_UNITS);
    const outputGeometry = {
      start: {
        x: outputResolver.length(geometry.start.x),
        y: outputResolver.length(geometry.start.y),
      },
      end: {
        x: outputResolver.length(geometry.end.x),
        y: outputResolver.length(geometry.end.y),
      },
      length: outputResolver.length(geometry.length),
      horizontalSpan: outputResolver.length(geometry.horizontalSpan),
    };
    const providerContext = {
      ...context,
      analysisModel: model.analysisModel,
      geometry: outputGeometry,
      span: outputGeometry.length,
      units: model.units,
      sectionRotation: model.sectionRotation,
    };
    const sectionProperties =
      model.sectionProvider.getElasticBeamProperties(providerContext);
    const femProperties = convertBeamProperties(sectionProperties, FEM_UNITS);
    const ElementClass = resolveElementClass(model.analysisModel, model.elementClass);
    const elementOptions = {
      axialRigidity: femProperties.axialRigidity,
      flexuralRigidity: femProperties.flexuralRigidity,
      metadata: {
        sectionProperties: femProperties.metadata,
      },
    };

    if (ElementClass === FrameElement2DTimoshenko) {
      if (!Number.isFinite(femProperties.shearRigidity)) {
        throw new Error("Timoshenko beam analysis requires shearRigidity from the section provider.");
      }

      elementOptions.shearRigidity = femProperties.shearRigidity;
      elementOptions.shearCorrectionFactor =
        femProperties.shearCorrectionFactor ?? 1;
    }

    const selectedLoads = loads ?? model.loads;
    const sortedStations = collectBeamStations({
      geometry,
      unitResolver,
      discretization: model.discretization,
      verificationStations: model.verificationStations,
      supports: model.supports,
      loads: selectedLoads,
      tolerance: this.tolerance,
    });
    const nodes = sortedStations.map((station, index) => {
      const coordinates = coordinateAtStation(geometry, station);

      return new Node({
        id: `${model.id}-${this.nodeIdPrefix}-${index + 1}`,
        x: coordinates.x,
        y: coordinates.y,
        units: FEM_UNITS,
        metadata: {
          station,
        },
      });
    });
    const nodeAt = (station) => {
      const index = sortedStations.findIndex(
        (candidate) => Math.abs(candidate - station) <= this.tolerance,
      );

      if (index < 0) {
        throw new Error(`Cannot find a beam node at station ${station}.`);
      }

      return nodes[index];
    };
    const elements = [];

    for (let index = 0; index < nodes.length - 1; index += 1) {
      elements.push(
        new ElementClass({
          id: `${model.id}-${this.elementIdPrefix}-${index + 1}`,
          startNode: nodes[index],
          endNode: nodes[index + 1],
          ...elementOptions,
          metadata: {
            ...elementOptions.metadata,
            startStation: sortedStations[index],
            endStation: sortedStations[index + 1],
          },
        }),
      );
    }

    const supportObjects = model.supports
      .map((support) => {
        const station = resolveStation(
          support.position ?? support.x ?? support.station,
          geometry,
          unitResolver,
          `support ${support.id} position`,
          support.position === "end" ? geometry.length : 0,
        );
        const type = support.type ?? support.preset ?? "free";
        const restraints = support.restraints ?? resolveBeamSupportPreset(type);

        if (!Object.values(restraints).some(Boolean)) {
          return null;
        }

        return new Support({
          id: support.id,
          node: nodeAt(station),
          restraints,
          metadata: {
            ...support.metadata,
            station,
            type,
            referenceSystem: "global",
          },
        });
      })
      .filter(Boolean);
    const distributedLoads = [];
    const nodalLoads = [];

    for (const load of selectedLoads) {
      const type = load.type ?? "uniform";
      const factor = load.factor ?? 1;

      if (DISTRIBUTED_LOAD_TYPES.has(type)) {
        const from = resolveStation(
          load.from ?? load.start,
          geometry,
          unitResolver,
          `load ${load.id} start`,
          0,
        );
        const to = resolveStation(
          load.to ?? load.end,
          geometry,
          unitResolver,
          `load ${load.id} end`,
          geometry.length,
        );

        if (from >= to) {
          throw new Error(`Distributed load ${load.id} requires from < to.`);
        }

        const startValue = load.value ?? load.startValue;
        const endValue = load.endValue ?? startValue;

        assertFinite(startValue, `load ${load.id} value`);
        assertFinite(endValue, `load ${load.id} endValue`);

        if (Math.abs(startValue - endValue) > 1e-12) {
          throw new Error("SingleBeamAnalysis supports only uniform distributed loads.");
        }

        const lineLoad = unitResolver.lineLoad(startValue * factor);
        const axisLineLoad = projectedLineLoadValue(lineLoad, load, geometry);
        const { referenceSystem, direction } = normalizeLoadDirection(load);

        if (direction === "mz") {
          throw new Error("Distributed moment loads are not supported in SingleBeamAnalysis.");
        }

        for (const element of elements) {
          const startStation = element.metadata.startStation;
          const endStation = element.metadata.endStation;
          const covered =
            startStation >= from - this.tolerance &&
            endStation <= to + this.tolerance;

          if (!covered) {
            continue;
          }

          distributedLoads.push(
            new DistributedLoad({
              id: `${load.id}-${element.id}`,
              element,
              startValue: axisLineLoad,
              direction,
              referenceSystem,
              distribution: "uniform",
              length: element.length(),
              units: FEM_UNITS,
              metadata: {
                sourceId: load.id,
                actionType: load.actionType,
                loadCaseId: load.loadCaseId,
                from: startStation,
                to: endStation,
                loadProjection: normalizeProjection(load.loadProjection),
                sourceValue: startValue,
                appliedFactor: factor,
              },
            }),
          );
        }

        continue;
      }

      if (POINT_LOAD_TYPES.has(type)) {
        const station = resolveStation(
          load.x ?? load.position ?? load.station,
          geometry,
          unitResolver,
          `load ${load.id} position`,
          geometry.length / 2,
        );
        const { direction } = normalizeLoadDirection(load);
        let components = {};

        if (load.components) {
          components = {
            fx: unitResolver.force((load.components.fx ?? 0) * factor),
            fy: unitResolver.force((load.components.fy ?? 0) * factor),
            mz: unitResolver.moment((load.components.mz ?? 0) * factor),
          };
        } else {
          const value = load.value ?? load.magnitude;

          assertFinite(value, `load ${load.id} value`);

          if (direction === "x") {
            components.fx = unitResolver.force(value * factor);
          } else if (direction === "y") {
            components.fy = unitResolver.force(value * factor);
          } else {
            components.mz = unitResolver.moment(value * factor);
          }
        }

        nodalLoads.push(
          new NodalLoad({
            id: load.id,
            node: nodeAt(station),
            components,
            units: FEM_UNITS,
            metadata: {
              sourceId: load.id,
              actionType: load.actionType,
              loadCaseId: load.loadCaseId,
              station,
              appliedFactor: factor,
            },
          }),
        );
      }
    }

    return {
      id: model.id,
      units: FEM_UNITS,
      geometry,
      outputGeometry,
      nodes,
      elements,
      supports: supportObjects,
      loads: distributedLoads,
      nodalLoads,
      allLoads: [...distributedLoads, ...nodalLoads],
      stations: sortedStations,
      sectionProperties,
      metadata: {
        sourceUnits: model.units,
        analysisModel: model.analysisModel,
        sectionRotation: { ...model.sectionRotation },
        generatedBy: "SingleBeamFemBuilder",
      },
    };
  }
}
