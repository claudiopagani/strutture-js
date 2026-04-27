import { round, uniqueStrings } from "../../../core/results/checkUtils.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { SteelRingFramePushoverModel } from "../models/SteelRingFramePushoverModel.js";
import { SteelDisplacementControlPushoverSolver2D } from "./SteelDisplacementControlPushoverSolver2D.js";
import { SteelRingFrame2DBuilder } from "./SteelRingFrame2DBuilder.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });

function resolveModel(input) {
  return input instanceof SteelRingFramePushoverModel
    ? input
    : new SteelRingFramePushoverModel(input);
}

function pointToUserUnits(point, resolver) {
  return {
    step: point.step,
    iterationCount: point.iterationCount,
    controlDisplacement: round(resolver.length(point.controlDisplacement)),
    baseShear: round(resolver.force(point.baseShear)),
    loadFactor: round(point.loadFactor),
    hingeCount: point.hingeCount,
  };
}

function hingeEventToUserUnits(event, resolver) {
  return {
    ...event,
    plasticMoment: round(resolver.moment(event.plasticMoment)),
  };
}

export class SteelRingFramePushoverAnalysis {
  constructor({
    builder = new SteelRingFrame2DBuilder(),
    solver = new SteelDisplacementControlPushoverSolver2D(),
  } = {}) {
    this.builder = builder;
    this.solver = solver;
  }

  analyze({ model } = {}) {
    const resolvedModel = resolveModel(model ?? {});
    const frame = this.builder.build({ model: resolvedModel });
    const toFem = createUnitResolver(resolvedModel.units, FEM_UNITS);
    const solverResult = this.solver.solve({
      frame,
      controlDisplacementIncrement:
        toFem.length(resolvedModel.solver.controlDisplacementIncrement),
      maxControlDisplacement:
        toFem.length(resolvedModel.solver.maxControlDisplacement),
      tolerance: resolvedModel.solver.tolerance,
      maxIterations: resolvedModel.solver.maxIterations,
      maxSteps: resolvedModel.solver.maxSteps,
      yieldTolerance: resolvedModel.solver.yieldTolerance,
    });
    const userUnits = resolvedModel.sourceUnits() ?? FEM_UNITS;
    const resolverToUser = createUnitResolver(FEM_UNITS, userUnits);
    const points = solverResult.points.map((point) =>
      pointToUserUnits(point, resolverToUser),
    );

    return {
      status: points.length > 1 ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "Non-linear static displacement-controlled pushover analysis of a standalone steel ring frame completed.",
      warnings: uniqueStrings([...frame.warnings, ...solverResult.warnings]),
      assumptions: uniqueStrings([...frame.assumptions, ...solverResult.assumptions]),
      outputs: {
        modelId: resolvedModel.id,
        frameIdealization: frame.snapshot,
        control: {
          nodeId: frame.controlNode.id,
          dof: resolvedModel.loading.controlDof,
          units: userUnits.length,
          increment: round(
            resolverToUser.length(
              toFem.length(resolvedModel.solver.controlDisplacementIncrement),
            ),
          ),
          maxDisplacement: round(
            resolverToUser.length(
              toFem.length(resolvedModel.solver.maxControlDisplacement),
            ),
          ),
        },
        capacityCurve: {
          units: {
            displacement: userUnits.length,
            baseShear: userUnits.force,
          },
          points,
          maxBaseShear:
            points.reduce(
              (maxValue, point) => Math.max(maxValue, point.baseShear),
              0,
            ) ?? 0,
          ultimateControlDisplacement: points.at(-1)?.controlDisplacement ?? 0,
        },
        hingeEvents: solverResult.hingeEvents.map((event) =>
          hingeEventToUserUnits(event, resolverToUser),
        ),
        finalState: {
          loadFactor: round(solverResult.finalLoadFactor),
          termination: solverResult.termination,
          hingeStatesByElementId: Object.fromEntries(
            Object.entries(solverResult.hingeStatesByElementId).map(([elementId, state]) => [
              elementId,
              state?.toJSON?.() ?? state,
            ]),
          ),
        },
      },
      metadata: {
        analysisType: "steel-ring-frame-pushover",
        modelId: resolvedModel.id,
        baseCondition: resolvedModel.baseCondition,
        includeBottomBeam: resolvedModel.includeBottomBeam,
        memberOrientations: Object.fromEntries(
          Object.entries(resolvedModel.memberOrientations).map(([key, value]) => [
            key,
            { ...value },
          ]),
        ),
      },
    };
  }
}
