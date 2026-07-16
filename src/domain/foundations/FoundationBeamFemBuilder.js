import { SingleBeamFemBuilder } from "../beams/SingleBeamFemBuilder.js";
import { NodalLoad } from "../loads/NodalLoad.js";
import { Support } from "../supports/Support.js";
import { createUnitResolver } from "../units/UnitSystem.js";
import { FoundationBeamModel } from "./FoundationBeamModel.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });

function segmentAt(foundation, station, tolerance) {
  return foundation.segments.find(
    (segment) => station >= segment.fromFem - tolerance &&
      station <= segment.toFem + tolerance,
  );
}

function settlementAt(load, station, span, resolver, tolerance) {
  const from = resolver.length(load.from ?? 0);
  const to = resolver.length(load.to ?? span);

  if (station < from - tolerance || station > to + tolerance) {
    return null;
  }

  const startValue = resolver.length(Number(load.value ?? load.startValue));
  const endValue = resolver.length(Number(load.endValue ?? load.value ?? load.startValue));

  if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) {
    throw new Error(`Soil settlement load ${load.id} requires finite values.`);
  }

  const ratio = to - from <= tolerance ? 0 : (station - from) / (to - from);

  return (startValue + (endValue - startValue) * ratio) * (load.factor ?? 1);
}

export class FoundationBeamFemBuilder {
  constructor({ beamBuilder = new SingleBeamFemBuilder(), tolerance = 1e-9 } = {}) {
    this.beamBuilder = beamBuilder;
    this.tolerance = tolerance;
  }

  build(modelOrInput, { loads = null, context = {} } = {}) {
    const model = modelOrInput instanceof FoundationBeamModel
      ? modelOrInput
      : new FoundationBeamModel(modelOrInput);
    const selectedLoads = loads ?? model.loads;
    const structuralLoads = selectedLoads.filter(
      (load) => load.type !== "soil-settlement",
    );
    const femModel = this.beamBuilder.build(model, { loads: structuralLoads, context });
    const resolver = createUnitResolver(model.units, FEM_UNITS);
    const nodeData = new Map(
      femModel.nodes.map((node) => [node.id, {
        node,
        station: node.metadata.station,
        springStiffness: 0,
        settlementLoad: 0,
      }]),
    );
    const elementData = [];
    const settlementLoads = selectedLoads.filter(
      (load) => load.type === "soil-settlement",
    );

    for (const element of femModel.elements) {
      const from = element.metadata.startStation;
      const to = element.metadata.endStation;
      const midpoint = (from + to) / 2;
      const segment = segmentAt(model.foundation, midpoint, this.tolerance);

      if (!segment) {
        throw new Error(`No foundation segment covers FEM station ${midpoint}.`);
      }

      const length = to - from;
      const lineStiffness = segment.subgradeModulusFem * model.foundation.contactWidthFem;
      const tributaryStiffness = lineStiffness * length / 2;
      const midpointSettlement = settlementLoads.reduce((sum, load) => {
        const value = settlementAt(
          load,
          midpoint,
          femModel.outputGeometry.length,
          resolver,
          this.tolerance,
        );

        return sum + (value ?? 0);
      }, 0);

      for (const node of [element.startNode, element.endNode]) {
        const data = nodeData.get(node.id);
        data.springStiffness += tributaryStiffness;
        data.settlementLoad += tributaryStiffness * midpointSettlement;
      }

      elementData.push({
        elementId: element.id,
        startNodeId: element.startNode.id,
        endNodeId: element.endNode.id,
        from,
        to,
        length,
        segmentId: segment.id,
        subgradeModulus: segment.subgradeModulusFem,
        lineStiffness,
        imposedSettlement: midpointSettlement,
      });
    }

    const foundationSupports = [];
    const foundationLoads = [];

    for (const data of nodeData.values()) {
      const imposedSettlement = data.springStiffness > 0
        ? data.settlementLoad / data.springStiffness
        : 0;

      foundationSupports.push(new Support({
        id: `${model.id}-soil-spring-${data.node.id}`,
        node: data.node,
        springStiffness: { uy: data.springStiffness },
        metadata: {
          type: "winkler-soil-spring",
          station: data.station,
          imposedSettlement,
        },
      }));

      if (Math.abs(data.settlementLoad) > 0) {
        foundationLoads.push(new NodalLoad({
          id: `${model.id}-soil-settlement-${data.node.id}`,
          node: data.node,
          components: { fy: data.settlementLoad },
          units: FEM_UNITS,
          metadata: {
            type: "soil-settlement-equivalent-load",
            station: data.station,
            imposedSettlement,
          },
        }));
      }
    }

    const hasHorizontalDatum = femModel.supports.some(
      (support) => support.restraints?.ux,
    );
    const horizontalDatum = hasHorizontalDatum
      ? []
      : [new Support({
          id: `${model.id}-horizontal-datum`,
          node: femModel.nodes[0],
          restraints: { ux: true },
          metadata: {
            type: "horizontal-datum",
            station: 0,
          },
        })];

    return {
      ...femModel,
      supports: [...femModel.supports, ...foundationSupports, ...horizontalDatum],
      nodalLoads: [...femModel.nodalLoads, ...foundationLoads],
      allLoads: [...femModel.allLoads, ...foundationLoads],
      foundation: {
        model: model.foundation.model,
        contactWidth: model.foundation.contactWidthFem,
        nodes: [...nodeData.values()].map((data) => ({
          nodeId: data.node.id,
          station: data.station,
          springStiffness: data.springStiffness,
          imposedSettlement: data.springStiffness > 0
            ? data.settlementLoad / data.springStiffness
            : 0,
        })),
        elements: elementData,
      },
      metadata: {
        ...femModel.metadata,
        foundationModel: model.foundation.model,
        generatedBy: "FoundationBeamFemBuilder",
      },
    };
  }
}
