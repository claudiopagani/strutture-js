import {
  projectedMoment,
  round,
  summarizeStateCheck,
} from "./RCMomentCurvaturePolicies.js";

export function summarizeMomentCurvaturePoint(point) {
  return {
    converged: point.converged,
    theta: round(point.theta, 12),
    compressedSide: point.compressedSide ?? null,
    curvature: round(point.curvature),
    absoluteCurvature: round(point.absoluteCurvature),
    eps0: round(point.eps0),
    kappaY: round(point.kappaY),
    kappaZ: round(point.kappaZ),
    neutralAxisY: round(point.neutralAxisY, 6),
    neutralAxisProjection: round(point.neutralAxisProjection, 6),
    N: round(point.N, 6),
    Mx: round(point.Mx, 6),
    My: round(point.My, 6),
    projectedMoment: round(
      point.projectedMoment ?? projectedMoment(point),
      6,
    ),
    axialResidual: round(point.axialResidual, 6),
    failureMode: point.failureMode ?? point.limitState?.eventType ?? null,
    postUltimate:
      point.postUltimate == null
        ? null
        : {
            response: point.postUltimate.response,
            fractureEnergyDensity:
              point.postUltimate.fractureEnergyDensity,
            fractureEnergyDensityUnits:
              point.postUltimate.fractureEnergyDensityUnits,
            fractureEnergyInterpretation:
              point.postUltimate.fractureEnergyInterpretation,
            concreteFiberCount:
              point.postUltimate.concreteFiberCount,
            steelBarCount: point.postUltimate.steelBarCount,
            active: point.postUltimate.active,
          },
    postUltimateState:
      point.postUltimateState == null
        ? null
        : {
            referenceMoment: round(
              point.postUltimateState.referenceMoment,
              6,
            ),
            reference: point.postUltimateState.reference,
            targetMoment: round(
              point.postUltimateState.targetMoment,
              6,
            ),
            moment: round(point.postUltimateState.moment, 6),
            targetDropRatio: round(
              point.postUltimateState.targetDropRatio,
              6,
            ),
            actualDropRatio: round(
              point.postUltimateState.actualDropRatio,
              6,
            ),
            reached: point.postUltimateState.reached,
          },
    postPeakState:
      point.postPeakState == null
        ? null
        : {
            maximumMoment: round(
              point.postPeakState.maximumMoment,
              6,
            ),
            targetMoment: round(point.postPeakState.targetMoment, 6),
            moment: round(point.postPeakState.moment, 6),
            targetDropRatio: round(
              point.postPeakState.targetDropRatio,
              6,
            ),
            actualDropRatio: round(
              point.postPeakState.actualDropRatio,
              6,
            ),
            reached: point.postPeakState.reached,
          },
    firstYieldState: {
      reached: point.firstYieldState.reached,
      eventType: point.firstYieldState.eventType ?? null,
      eventMaterial: point.firstYieldState.eventMaterial ?? null,
      eventMode: point.firstYieldState.eventMode ?? null,
      event: summarizeStateCheck(point.firstYieldState.event),
      governing: summarizeStateCheck(point.firstYieldState.governing),
    },
    limitState: {
      reached: point.limitState.reached,
      eventType: point.limitState.eventType ?? null,
      eventMaterial: point.limitState.eventMaterial ?? null,
      eventMode: point.limitState.eventMode ?? null,
      event: summarizeStateCheck(point.limitState.event),
      governing: summarizeStateCheck(point.limitState.governing),
    },
    extremes: {
      minStrain: round(point.state.extremes.minStrain),
      maxStrain: round(point.state.extremes.maxStrain),
      concreteCompressionEdge:
        point.concreteCompressionEdge == null
          ? null
          : {
              edge: point.concreteCompressionEdge.edge,
              side: point.concreteCompressionEdge.side ?? null,
              strain: round(point.concreteCompressionEdge.strain),
              demand: round(point.concreteCompressionEdge.demand),
              y: round(point.concreteCompressionEdge.y, 6),
              z: round(point.concreteCompressionEdge.z, 6),
            },
      maxConcreteCompression:
        point.state.extremes.maxConcreteCompression == null
          ? null
          : {
              value: round(point.state.extremes.maxConcreteCompression.value, 6),
              strain: round(point.state.extremes.maxConcreteCompression.strain),
              y: round(point.state.extremes.maxConcreteCompression.y, 6),
              z: round(point.state.extremes.maxConcreteCompression.z, 6),
            },
      maxSteelTension:
        point.state.extremes.maxSteelTension == null
          ? null
          : {
              value: round(point.state.extremes.maxSteelTension.value, 6),
              strain: round(point.state.extremes.maxSteelTension.strain),
              y: round(point.state.extremes.maxSteelTension.y, 6),
              z: round(point.state.extremes.maxSteelTension.z, 6),
            },
      maxSteelTensionStrain:
        point.state.extremes.maxSteelTensionStrain == null
          ? null
          : {
              value: round(
                point.state.extremes.maxSteelTensionStrain.stress,
                6,
              ),
              strain: round(
                point.state.extremes.maxSteelTensionStrain.strain,
              ),
              id: point.state.extremes.maxSteelTensionStrain.id,
              y: round(point.state.extremes.maxSteelTensionStrain.y, 6),
              z: round(point.state.extremes.maxSteelTensionStrain.z, 6),
            },
      maxSteelCompressionStrain:
        point.state.extremes.maxSteelCompressionStrain == null
          ? null
          : {
              value: round(
                point.state.extremes.maxSteelCompressionStrain.stress,
                6,
              ),
              strain: round(
                point.state.extremes.maxSteelCompressionStrain.strain,
              ),
              id: point.state.extremes.maxSteelCompressionStrain.id,
              y: round(point.state.extremes.maxSteelCompressionStrain.y, 6),
              z: round(point.state.extremes.maxSteelCompressionStrain.z, 6),
            },
    },
    balancedFailureState:
      point.balancedFailureState == null
        ? null
        : {
            reached: point.balancedFailureState.reached,
            concrete: summarizeStateCheck(
              point.balancedFailureState.concrete,
            ),
            steel: summarizeStateCheck(point.balancedFailureState.steel),
            effectiveDepth: round(
              point.balancedFailureState.effectiveDepth,
              6,
            ),
            neutralAxisDepth: round(
              point.balancedFailureState.neutralAxisDepth,
              6,
            ),
            compressedEdgeProjection: round(
              point.balancedFailureState.compressedEdgeProjection,
              6,
            ),
            tensionReinforcementProjection: round(
              point.balancedFailureState.tensionReinforcementProjection,
              6,
            ),
            compressedEdgeY: round(
              point.balancedFailureState.compressedEdgeY,
              6,
            ),
            tensionReinforcementY: round(
              point.balancedFailureState.tensionReinforcementY,
              6,
            ),
            assignedAxialForce: round(
              point.balancedFailureState.assignedAxialForce,
              6,
            ),
            balancedAxialForce: round(
              point.balancedFailureState.balancedAxialForce,
              6,
            ),
            axialResidual: round(
              point.balancedFailureState.axialResidual,
              6,
            ),
            compatibleWithAssignedAxialForce:
              point.balancedFailureState.compatibleWithAssignedAxialForce,
          },
  };
}

export function summarizeMomentCurvatureDuctility(ductility) {
  if (ductility == null) {
    return null;
  }

  return {
    reference: ductility.reference,
    phiPrimeYd: round(ductility.phiPrimeYd),
    mPrimeYd: round(ductility.mPrimeYd, 6),
    mRd: round(ductility.mRd, 6),
    phiYd: round(ductility.phiYd),
    phiU: round(ductility.phiU),
    curvatureDuctilityRatio: round(ductility.curvatureDuctilityRatio, 6),
    ultimateMomentDropRatio: round(
      ductility.ultimateMomentDropRatio,
      6,
    ),
    firstYieldGoverning: ductility.firstYieldGoverning,
    ultimateCurvatureSource: ductility.ultimateCurvatureSource,
    firstYieldPoint:
      ductility.firstYieldPoint == null
        ? null
        : summarizeMomentCurvaturePoint(ductility.firstYieldPoint),
    maximumMomentPoint:
      ductility.maximumMomentPoint == null
        ? null
        : summarizeMomentCurvaturePoint(ductility.maximumMomentPoint),
    momentDropPoint:
      ductility.momentDropPoint == null
        ? null
        : {
            absoluteCurvature: round(
              ductility.momentDropPoint.absoluteCurvature,
            ),
            curvature: round(ductility.momentDropPoint.curvature),
            Mx: round(ductility.momentDropPoint.Mx, 6),
            My: round(ductility.momentDropPoint.My, 6),
            source: ductility.momentDropPoint.source,
            interpolation: ductility.momentDropPoint.interpolation,
          },
    materialUltimatePoint:
      ductility.materialUltimatePoint == null
        ? null
        : {
            absoluteCurvature: round(
              ductility.materialUltimatePoint.absoluteCurvature,
            ),
            curvature: round(
              ductility.materialUltimatePoint.curvature,
            ),
            Mx: round(ductility.materialUltimatePoint.Mx, 6),
            My: round(ductility.materialUltimatePoint.My, 6),
            source: ductility.materialUltimatePoint.source,
            interpolation:
              ductility.materialUltimatePoint.interpolation,
          },
    ultimatePoint:
      ductility.ultimatePoint == null
        ? null
        : {
            absoluteCurvature: round(ductility.ultimatePoint.absoluteCurvature),
            curvature: round(ductility.ultimatePoint.curvature),
            Mx: round(ductility.ultimatePoint.Mx, 6),
            My: round(ductility.ultimatePoint.My, 6),
            source: ductility.ultimatePoint.source,
            interpolation: ductility.ultimatePoint.interpolation,
          },
  };
}
