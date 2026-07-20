import { DenseLinearSolver } from "../../math/DenseLinearSolver.js";

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`CyclicMasonryPierAnalysis2D requires a positive ${label}.`);
  }
}

function normalizedResidual(residual, axialCompression, momentScale) {
  const forceScale = Math.max(Math.abs(axialCompression), 1);
  return Math.sqrt(
    (residual[0] / forceScale) ** 2 +
    (residual[1] / Math.max(momentScale, 1)) ** 2,
  );
}

function benchmarkPoint(step, targetDisplacement, response, iterationCount) {
  const compressedLength = Math.min(...response.compressedLengths);

  return {
    step,
    iterationCount,
    lateralDisplacement: targetDisplacement,
    axialDisplacement: response.localDisplacements[3],
    topRotation: response.localDisplacements[5],
    lateralForce: response.localForces[4],
    drift: targetDisplacement / response.analysisHeight,
    baseMoment: response.localForces[2],
    topMoment: response.localForces[5],
    shear: response.shearForce,
    axialForce: -response.axialForce,
    compressedLength,
    compressedLengthBottom: response.compressedLengths[0],
    compressedLengthTop: response.compressedLengths[1],
    compressionDamage: response.compressionDamage,
    compressionDamageBottom: response.bottomInterface.maxCompressionDamage,
    compressionDamageTop: response.topInterface.maxCompressionDamage,
    shearDamage: response.shearDamage,
    shearPlasticDeformation: response.shear.plasticDeformation,
    pinchingFactor: response.shear.pinchingFactor,
    diagonalTensionCapacity: response.shear.capacities.diagonalTension,
    slidingCapacity: response.shear.capacities.sliding,
    energyDissipated: response.energyDissipated,
    predominantMechanism: response.predominantMechanism,
    mechanismsActivated: [...response.mechanismsActivated],
    rockingIndex: response.mechanismIndices.rocking,
    crushingIndex: response.mechanismIndices.crushing,
    diagonalCrackingIndex: response.mechanismIndices.diagonalTension,
    slidingIndex: response.mechanismIndices.sliding,
    shearDeformation: response.shearDeformation,
    interfaceRotations: [...response.interfaceRotations],
    localIterations: response.localIterations,
    localResidualNorm: response.localResidualNorm,
  };
}

export function cyclicMasonryPierHistoryToCsv(points) {
  if (!Array.isArray(points)) {
    throw new Error(
      "cyclicMasonryPierHistoryToCsv requires an array of analysis points.",
    );
  }

  const columns = [
    "step",
    "lateralDisplacement",
    "lateralForce",
    "drift",
    "baseMoment",
    "shear",
    "axialForce",
    "compressedLength",
    "compressionDamage",
    "shearDamage",
    "energyDissipated",
    "predominantMechanism",
  ];
  const rows = points.map((point) =>
    columns.map((column) => point[column]).join(","),
  );

  return [columns.join(","), ...rows].join("\n");
}

/**
 * Standalone cyclic displacement protocol for one cantilever or fixed-fixed
 * masonry pier. Lateral displacement is prescribed while a two-variable
 * Newton solve enforces current axial compression and, for a cantilever, zero
 * top moment. State is committed only after convergence of each target.
 */
export class CyclicMasonryPierAnalysis2D {
  constructor({ linearSolver = new DenseLinearSolver() } = {}) {
    this.linearSolver = linearSolver;
  }

  solve({
    element,
    axialCompression,
    lateralDisplacements,
    boundaryCondition = "cantilever",
    tolerance = 1e-6,
    maxIterations = 30,
    throwOnFailure = false,
  } = {}) {
    if (!element || typeof element.setTrialLocalDisplacements !== "function") {
      throw new Error(
        "CyclicMasonryPierAnalysis2D requires a cyclic masonry pier element.",
      );
    }

    if (!Number.isFinite(axialCompression) || axialCompression < 0) {
      throw new Error(
        "CyclicMasonryPierAnalysis2D requires a non-negative axialCompression.",
      );
    }

    if (
      !Array.isArray(lateralDisplacements) ||
      lateralDisplacements.length === 0 ||
      lateralDisplacements.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        "CyclicMasonryPierAnalysis2D requires a non-empty finite lateralDisplacements array.",
      );
    }

    const normalizedBoundary = String(boundaryCondition).trim().toLowerCase();

    if (!new Set(["cantilever", "fixed-fixed"]).has(normalizedBoundary)) {
      throw new Error(
        'CyclicMasonryPierAnalysis2D boundaryCondition must be "cantilever" or "fixed-fixed".',
      );
    }

    assertPositive(tolerance, "tolerance");
    assertPositive(maxIterations, "maxIterations");

    const committedAtStart = element.exportState({ committed: true });
    const warnings = [];
    const points = [];
    let axialDisplacement =
      element.getCommittedResponse().localDisplacements?.[3] ?? 0;
    let topRotation =
      element.getCommittedResponse().localDisplacements?.[5] ?? 0;
    let termination = {
      reason: "protocol-completed",
      step: lateralDisplacements.length,
      iteration: 0,
    };

    if (
      axialCompression > 0 &&
      Math.abs(element.getCommittedResponse().axialForce ?? 0) < 1e-12 &&
      Math.abs(axialDisplacement) < 1e-12
    ) {
      const area = element.width * element.thickness;
      axialDisplacement =
        (-axialCompression *
          (element.elasticCoreHeight + 2 * element.hingeLength)) /
        (element.elasticModulus * area);
    }

    const targets = lateralDisplacements[0] === 0
      ? [...lateralDisplacements]
      : [0, ...lateralDisplacements];

    for (let step = 0; step < targets.length; step += 1) {
      const targetDisplacement = targets[step];
      let converged = false;
      let response = null;
      let residualNorm = Infinity;
      let iteration = 0;

      for (iteration = 1; iteration <= maxIterations; iteration += 1) {
        const localDisplacements = [
          0,
          0,
          0,
          axialDisplacement,
          targetDisplacement,
          normalizedBoundary === "fixed-fixed" ? 0 : topRotation,
        ];

        try {
          response = element.setTrialLocalDisplacements(localDisplacements);
        } catch (error) {
          warnings.push(
            `Cyclic masonry protocol stopped at step ${step}, iteration ${iteration}: ${error.message}`,
          );
          termination = {
            reason: "local-element-nonconvergence",
            step,
            iteration,
          };
          break;
        }

        response.analysisHeight = element.height;
        const axialResidual = response.localForces[3] + axialCompression;
        const momentResidual =
          normalizedBoundary === "cantilever"
            ? response.localForces[5]
            : 0;
        const residual = [axialResidual, momentResidual];
        residualNorm = normalizedResidual(
          residual,
          axialCompression,
          Math.max(axialCompression * element.width, 1),
        );

        if (residualNorm <= tolerance) {
          converged = true;
          break;
        }

        try {
          if (normalizedBoundary === "fixed-fixed") {
            const stiffness = response.localTangent[3][3];

            if (!Number.isFinite(stiffness) || Math.abs(stiffness) < 1e-14) {
              throw new Error("zero axial tangent");
            }

            axialDisplacement -= axialResidual / stiffness;
          } else {
            const tangent = [
              [response.localTangent[3][3], response.localTangent[3][5]],
              [response.localTangent[5][3], response.localTangent[5][5]],
            ];
            const correction = this.linearSolver.solve(tangent, [
              -axialResidual,
              -momentResidual,
            ]);
            axialDisplacement += correction[0];
            topRotation += correction[1];
          }
        } catch (error) {
          warnings.push(
            `Cyclic masonry protocol stopped at step ${step}, iteration ${iteration} because the external equilibrium tangent is singular: ${error.message}`,
          );
          termination = {
            reason: "singular-external-tangent",
            step,
            iteration,
          };
          break;
        }
      }

      if (!converged) {
        element.revertToLastCommit();

        if (termination.reason === "protocol-completed") {
          warnings.push(
            `Cyclic masonry protocol did not converge at step ${step} within ${maxIterations} iterations (normalized residual ${residualNorm}).`,
          );
          termination = {
            reason: "max-iterations",
            step,
            iteration: maxIterations,
          };
        }

        if (throwOnFailure) {
          element.importState(committedAtStart, { committed: true });
          throw new Error(warnings.at(-1));
        }

        break;
      }

      element.commitState();
      points.push(
        benchmarkPoint(step, targetDisplacement, response, iteration),
      );
      termination.iteration = iteration;
    }

    return {
      status:
        termination.reason === "protocol-completed" ? "ok" : "failed",
      points,
      warnings,
      assumptions: [
        "The protocol prescribes local transverse displacement and maintains the assigned current compressive axial force by Newton iteration.",
        normalizedBoundary === "cantilever"
          ? "The top rotation is solved so that the top end moment is zero."
          : "Both end rotations are fixed to zero.",
        "No adaptive subdivision is applied; a failed target is rolled back to the last converged committed state.",
      ],
      termination,
      finalState: element.exportState({ committed: true }),
      units: {
        force: element.units.force,
        length: element.units.length,
        moment: `${element.units.force}*${element.units.length}`,
      },
    };
  }
}
