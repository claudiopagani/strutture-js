import { LinearStaticSolver2D } from "../../../domain/fem/LinearStaticSolver2D.js";
import { createElementLoadIndex } from "../../../domain/fem/ElementLoadIndex.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import {
  SingleBeamModel,
  loadsForCombination,
} from "../../../domain/beams/SingleBeamInput.js";
import { SingleBeamFemBuilder } from "../../../domain/beams/SingleBeamFemBuilder.js";
import { sampleBeamResult } from "../../../domain/beams/SingleBeamResults.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });

function nowMilliseconds() {
  return globalThis.performance?.now?.() ?? Date.now();
}

/**
 * Iterative secant-stiffness solver for hyperstatic RC beams.
 *
 * The linear FEM analysis with gross (uncracked) EI overestimates
 * stiffness in cracked regions, producing an incorrect moment
 * distribution for statically indeterminate beams.  This class
 * iteratively corrects the element flexural rigidities using a
 * precomputed M-κ curve until the moment distribution converges.
 */
export class HyperstaticDeflectionIteration {
  /**
   * @param {Object} options
   * @param {SingleBeamFemBuilder} [options.femBuilder]
   * @param {number} [options.relaxationFactor=0.5]  α for EI damping
   * @param {number} [options.tolerance=1e-4]         Relative moment convergence
   * @param {number} [options.maxIterations=50]
   */
  constructor({
    femBuilder = new SingleBeamFemBuilder(),
    relaxationFactor = 0.5,
    tolerance = 1e-4,
    maxIterations = 50,
  } = {}) {
    if (
      !Number.isFinite(relaxationFactor) ||
      relaxationFactor <= 0 ||
      relaxationFactor > 1
    ) {
      throw new Error(
        "HyperstaticDeflectionIteration relaxationFactor must be in (0, 1].",
      );
    }

    if (!Number.isFinite(tolerance) || tolerance <= 0) {
      throw new Error(
        "HyperstaticDeflectionIteration tolerance must be positive.",
      );
    }

    if (!Number.isInteger(maxIterations) || maxIterations <= 0) {
      throw new Error(
        "HyperstaticDeflectionIteration maxIterations must be a positive integer.",
      );
    }

    this.femBuilder = femBuilder;
    this.relaxationFactor = relaxationFactor;
    this.tolerance = tolerance;
    this.maxIterations = maxIterations;
  }

  /**
   * Run the secant iteration for a single combination.
   *
   * @param {Object} params
   * @param {SingleBeamModel} params.model       Beam model (geometry, supports, loads, discretization, sectionProvider)
   * @param {Object}         params.combination  Combination definition with `factors` and `metadata`
   * @param {SectionMomentCurvatureCurve} params.curve  Precomputed M-κ curve
   * @returns {Object}  { converged, iterations, momentSamples, displacementSamples, femModel, solution }
   */
  iterate({ model, combination, curve, curveResolver = null } = {}) {
    const startedAt = nowMilliseconds();
    const curveLookupCountAtStart = curve?.lookupCount ?? 0;
    const performance = {
      elapsedMs: 0,
      femSolveCount: 0,
      femSolveElapsedMs: 0,
      curveLookupCount: 0,
    };
    const finalizePerformance = () => {
      performance.elapsedMs = nowMilliseconds() - startedAt;
      performance.curveLookupCount =
        (curve?.lookupCount ?? curveLookupCountAtStart) -
        curveLookupCountAtStart;

      return { ...performance };
    };
    const beamModel =
      model instanceof SingleBeamModel ? model : new SingleBeamModel(model);

    if (!curve) {
      throw new Error(
        "HyperstaticDeflectionIteration requires a SectionMomentCurvatureCurve.",
      );
    }

    const femToCurveUnits = createUnitResolver(FEM_UNITS, curve.units);
    const curveToFemUnits = createUnitResolver(curve.units, FEM_UNITS);
    const comboLacks = combination?.factors ?? {};
    const comboMeta = combination?.metadata ?? {};
    const comboContext = {
      combinationId: combination?.id ?? "hyperstatic",
      resultType: "combination",
      factors: { ...comboLacks },
      ...comboMeta,
    };

    // Resolve factored loads for this combination.
    const factoredLoads = loadsForCombination(beamModel.loads, comboLacks);

    if (factoredLoads.length === 0) {
      return {
        converged: true,
        iterations: 0,
        momentSamples: [],
        displacementSamples: [],
        femModel: null,
        solution: null,
        performance: finalizePerformance(),
      };
    }

    // 1. Build the FEM model once.
    const femModel = this.femBuilder.build(beamModel, {
      loads: factoredLoads,
      context: comboContext,
    });

    // 2. Initial EI values from the model's elements (gross).
    const elements = femModel.elements ?? [];
    const elementLoadIndex = createElementLoadIndex(femModel.loads ?? []);
    const initialEI = elements.map((el) => el.flexuralRigidity);
    let currentEI = [...initialEI];

    // 3. First linear solve.
    const solver = new LinearStaticSolver2D();
    const solveFem = () => {
      const solveStartedAt = nowMilliseconds();
      const solved = solver.solve(femModel, { includeDiagnostics: false });

      performance.femSolveCount += 1;
      performance.femSolveElapsedMs += nowMilliseconds() - solveStartedAt;

      return solved;
    };
    let solution = solveFem();
    let previousActions = this._extractMidActions(
      femModel,
      solution,
      elementLoadIndex,
    );

    // 4. No iteration needed for isostatic beams (single element edge case already handled).
    if (elements.length === 0) {
      return {
        converged: true,
        iterations: 0,
        momentSamples: [],
        displacementSamples: [],
        femModel,
        solution,
        performance: finalizePerformance(),
      };
    }

    // 5. Iterate.
    let converged = false;
    let iterations = 0;

    for (let iter = 0; iter < this.maxIterations; iter += 1) {
      iterations = iter + 1;
      // Look up secant EI for each element.
      const targetEI = previousActions.map((action, index) => {
        const moment = femToCurveUnits.moment(action.m);
        const axialForce = femToCurveUnits.force(action.n);
        const resolvedCurve =
          curveResolver?.({
            element: elements[index],
            index,
            axialForce,
            moment,
          }) ?? curve;

        return curveToFemUnits.convert(resolvedCurve.lookupEI(moment), {
          forceExponent: 1,
          lengthExponent: 2,
        });
      });

      // Apply relaxation and update elements.
      let maxRelChange = 0;
      for (let i = 0; i < elements.length; i += 1) {
        const newEI =
          this.relaxationFactor * targetEI[i] +
          (1 - this.relaxationFactor) * currentEI[i];
        const relChange =
          currentEI[i] !== 0
            ? Math.abs(newEI - currentEI[i]) / Math.abs(currentEI[i])
            : 0;
        maxRelChange = Math.max(maxRelChange, relChange);
        currentEI[i] = newEI;
        elements[i].flexuralRigidity = newEI;
      }

      // Re-solve with updated rigidities.
      solution = solveFem();
      const newActions = this._extractMidActions(
        femModel,
        solution,
        elementLoadIndex,
      );

      // Check convergence on moments.
      const momentChange = this._relativeChange(
        previousActions.map((action) => action.m),
        newActions.map((action) => action.m),
      );

      previousActions = newActions;

      if (momentChange < this.tolerance && maxRelChange < this.tolerance * 10) {
        converged = true;
        break;
      }
    }

    // 6. Extract final samples (for curvature integration).
    const result = sampleBeamResult({
      model: beamModel,
      femModel,
      solution,
      sectionProperties: femModel.sectionProperties,
      femUnits: FEM_UNITS,
      elementLoadIndex,
    });

    return {
      converged,
      iterations,
      momentSamples: result.internalForces?.samples ?? [],
      displacementSamples: result.displacements?.samples ?? [],
      compatibleDisplacementSamples: this._sampleCompatibleDisplacements({
        model: beamModel,
        femModel,
        solution,
      }),
      supports: result.supports ?? [],
      geometry: result.geometry ?? null,
      femModel,
      solution,
      performance: finalizePerformance(),
      relaxationFactor: this.relaxationFactor,
    };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /**
   * Extract the bending moment at the midpoint of each element.
   */
  _extractMidMoments(
    femModel,
    solution,
    elementLoadIndex = createElementLoadIndex(femModel.loads ?? []),
  ) {
    return this._extractMidActions(
      femModel,
      solution,
      elementLoadIndex,
    ).map((action) => action.m);
  }

  _extractMidActions(
    femModel,
    solution,
    elementLoadIndex = createElementLoadIndex(femModel.loads ?? []),
  ) {
    return (femModel.elements ?? []).map((element) => {
      const elementLoads = elementLoadIndex.get(element);
      const midStation = element.length() / 2;
      const samples = element.sampleInternalForces({
        displacements: solution.displacements,
        dofRegistry: solution.dofRegistry,
        loads: elementLoads,
        stations: [midStation],
      });
      return {
        m: samples[0]?.m ?? 0,
        n: samples[0]?.n ?? 0,
      };
    });
  }

  _relativeChange(oldValues, newValues) {
    if (oldValues.length === 0 || newValues.length === 0) {
      return 0;
    }

    let maxAbsNew = 0;
    let maxDiff = 0;

    for (let i = 0; i < Math.min(oldValues.length, newValues.length); i += 1) {
      maxAbsNew = Math.max(maxAbsNew, Math.abs(newValues[i]));
      maxDiff = Math.max(maxDiff, Math.abs(newValues[i] - oldValues[i]));
    }

    return maxAbsNew > 0 ? maxDiff / maxAbsNew : 0;
  }

  _sampleCompatibleDisplacements({ model, femModel, solution }) {
    const resolver = createUnitResolver(FEM_UNITS, model.units);
    const samples = [];

    for (const element of femModel.elements ?? []) {
      if (typeof element.localDisplacements !== "function") {
        continue;
      }

      const localDisplacements = element.localDisplacements(
        solution.displacements,
        solution.dofRegistry,
      );
      const { length, c, s } = element.directionCosines();
      const localStations = [0, length / 2, length];
      const [u1, v1, theta1, u2, v2, theta2] = localDisplacements;

      for (const x of localStations) {
        const xi = length > 0 ? x / length : 0;
        const axial = u1 * (1 - xi) + u2 * xi;
        const n1 = 1 - 3 * xi ** 2 + 2 * xi ** 3;
        const n2 = length * (xi - 2 * xi ** 2 + xi ** 3);
        const n3 = 3 * xi ** 2 - 2 * xi ** 3;
        const n4 = length * (-(xi ** 2) + xi ** 3);
        const transverse = n1 * v1 + n2 * theta1 + n3 * v2 + n4 * theta2;
        const rotation =
          ((-6 * xi + 6 * xi ** 2) / length) * v1 +
          (1 - 4 * xi + 3 * xi ** 2) * theta1 +
          ((6 * xi - 6 * xi ** 2) / length) * v2 +
          (-2 * xi + 3 * xi ** 2) * theta2;
        const globalUy = s * axial + c * transverse;
        const station = (element.metadata.startStation ?? 0) + x;

        samples.push({
          elementId: element.id,
          station: resolver.length(station),
          x: resolver.length(station),
          deflection: resolver.length(globalUy),
          rotation,
        });
      }
    }

    return samples;
  }
}
