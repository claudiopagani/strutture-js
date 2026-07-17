import {
  createRcServiceSectionSolverContext,
  solveRcServiceSectionState,
} from "../../reinforced-concrete-sections/shared/solveRcServiceSectionState.js";
import {
  DEFAULT_RC_SECTION_UNITS,
  isFinitePositive,
} from "../../reinforced-concrete-sections/shared/rcCommon.js";

function nowMilliseconds() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function calculateCrackedTransformedProperties({ section, state, modularRatio }) {
  const concreteFibers = (state?.concrete?.fibers ?? []).filter(
    (fiber) => Math.abs(fiber.stress ?? 0) > 1e-12,
  );
  const bars = section.getReinforcementBars();
  const concreteArea = concreteFibers.reduce(
    (sum, fiber) => sum + fiber.area,
    0,
  );
  const steelTransformedArea = bars.reduce(
    (sum, bar) => sum + modularRatio * bar.area,
    0,
  );
  const totalArea = concreteArea + steelTransformedArea;

  if (!isFinitePositive(totalArea)) return null;

  const centroid = (
    concreteFibers.reduce((sum, fiber) => sum + fiber.area * fiber.y, 0) +
    bars.reduce(
      (sum, bar) => sum + modularRatio * bar.area * bar.y,
      0,
    )
  ) / totalArea;
  const inertia =
    concreteFibers.reduce(
      (sum, fiber) => sum + fiber.area * (fiber.y - centroid) ** 2,
      0,
    ) +
    bars.reduce(
      (sum, bar) =>
        sum + modularRatio * bar.area * (bar.y - centroid) ** 2,
      0,
    );
  const reinforcementFirstMoment = bars.reduce(
    (sum, bar) => sum + bar.area * (bar.y - centroid),
    0,
  );

  return isFinitePositive(inertia)
    ? { centroid, inertia, reinforcementFirstMoment }
    : null;
}

/**
 * Precomputed M-κ curve for an RC section under given axial force and
 * effective modular ratio.  Provides fast lookup of secant flexural
 * rigidity EI_sec = M / κ and curvature κ for any moment value.
 *
 * The curve is sampled once at construction time; all subsequent
 * lookups use linear interpolation on the tabulated data.
 */
export class SectionMomentCurvatureCurve {
  /**
   * @param {Object} options
   * @param {Object} options.section              RC section object
   * @param {Object} options.reinforcementMaterial Reinforcement material (needs elasticModulus)
   * @param {Object} options.concreteMaterial     Concrete material (needs elasticModulus, fctm)
   * @param {number} options.effectiveModularRatio n_eff = n · (1 + φ)
   * @param {Object} [options.mesh]               Fiber mesh options { targetFiberCount }
   * @param {Object} [options.solver]             Section solver options { tolerance, maxIterations }
   * @param {number} options.mcr                  Cracking moment in section units
   * @param {number} [options.mcrPositive]        Positive-bending cracking threshold
   * @param {number} [options.mcrNegative]        Negative-bending cracking threshold
   * @param {number} options.grossInertia         Uncracked transformed inertia in section units
   * @param {number} options.concreteModulus      Effective concrete elastic modulus E_c,eff in section units
   * @param {number} [options.beta=1.0]           Tension-stiffening β coefficient
   * @param {number} [options.momentSamples=100]  Number of moment sampling points
   * @param {number} [options.maxMomentFactor=1.5] Safety factor on the initial linear moment envelope
   * @param {number} [options.initialMaxMoment]   Optional explicit max moment override
   */
  constructor({
    section,
    reinforcementMaterial,
    effectiveModularRatio,
    mesh = {},
    solver = {},
    mcr,
    mcrPositive = mcr,
    mcrNegative = mcr,
    grossInertia,
    concreteModulus,
    beta = 1.0,
    momentSamples = 100,
    maxMomentFactor = 1.5,
    initialMaxMoment = null,
    axialForce = 0,
    units = null,
    symmetric = false,
  } = {}) {
    if (!section) {
      throw new Error("SectionMomentCurvatureCurve requires a section.");
    }
    if (!isFinitePositive(effectiveModularRatio)) {
      throw new Error(
        "SectionMomentCurvatureCurve requires a positive effectiveModularRatio.",
      );
    }
    if (!isFinitePositive(grossInertia)) {
      throw new Error(
        "SectionMomentCurvatureCurve requires a positive grossInertia.",
      );
    }
    if (!isFinitePositive(concreteModulus)) {
      throw new Error(
        "SectionMomentCurvatureCurve requires a positive concreteModulus.",
      );
    }

    this._section = section;
    this._reinforcementMaterial = reinforcementMaterial;
    this._effectiveModularRatio = effectiveModularRatio;
    this._meshOptions = { targetFiberCount: mesh?.targetFiberCount ?? 100 };
    this._solverOptions = {
      tolerance: solver?.tolerance ?? 1e-2,
      maxIterations: solver?.maxIterations ?? 50,
    };
    this._mcrPositive = isFinitePositive(mcrPositive) ? mcrPositive : null;
    this._mcrNegative = isFinitePositive(mcrNegative) ? mcrNegative : null;
    this._grossInertia = grossInertia;
    this._concreteModulus = concreteModulus;
    this._beta = beta;
    this._grossEI = concreteModulus * grossInertia;
    this._axialForce = Number.isFinite(axialForce) ? axialForce : 0;
    this.units =
      units ??
      section.units ??
      section.metadata?.unitSystem ??
      DEFAULT_RC_SECTION_UNITS;
    this._symmetric = symmetric;

    this._positiveTable = []; // [{ m, kappa, eiSec }] for M >= 0
    this._negativeTable = []; // [{ m, kappa, eiSec }] for M <= 0, keyed by |M|
    this._maxAbsM = 0;
    this._buildElapsedMs = 0;
    this._sectionSolveCount = 0;
    this._sectionSolveFailureCount = 0;
    this._lookupCount = 0;

    const buildStartedAt = nowMilliseconds();
    this._build({
      momentSamples,
      maxMomentFactor,
      initialMaxMoment,
    });
    this._buildElapsedMs = nowMilliseconds() - buildStartedAt;
  }

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------

  /**
   * Secant flexural rigidity for a given signed moment.
   * Returns EI_lordo when |M| is below the cracking threshold or near zero.
   */
  lookupEI(moment) {
    return this.lookupState(moment).eiSec;
  }

  /**
   * Curvature κ for a given signed moment (sign follows M).
   */
  lookupKappa(moment) {
    return this.lookupState(moment).kappa;
  }

  /**
   * Interpolated M-kappa state for a signed moment.
   */
  lookupState(moment) {
    this._lookupCount += 1;
    return this._lookup(moment);
  }

  /**
   * Number of tabulated points (one side).
   */
  get pointCount() {
    return Math.max(this._positiveTable.length, this._negativeTable.length);
  }

  /**
   * Maximum absolute moment the curve was sampled up to.
   */
  get maxAbsMoment() {
    return this._maxAbsM;
  }

  /**
   * Gross (uncracked) flexural rigidity E_c,eff · I_gross.
   */
  get grossEI() {
    return this._grossEI;
  }

  get lookupCount() {
    return this._lookupCount;
  }

  get metrics() {
    return {
      buildElapsedMs: this._buildElapsedMs,
      sectionSolveCount: this._sectionSolveCount,
      sectionSolveFailureCount: this._sectionSolveFailureCount,
      lookupCount: this._lookupCount,
      pointCountPerBranch: this.pointCount,
      totalTablePointCount:
        this._positiveTable.length + this._negativeTable.length,
      maxAbsMoment: this._maxAbsM,
    };
  }

  // -------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------

  _build({ momentSamples, maxMomentFactor, initialMaxMoment }) {
    const effectiveSampleCount = Math.max(10, momentSamples);
    const finiteThresholds = [this._mcrPositive, this._mcrNegative].filter(
      isFinitePositive,
    );
    const firstCrackingThreshold =
      finiteThresholds.length > 0 ? Math.min(...finiteThresholds) : null;
    const maxM = isFinitePositive(initialMaxMoment)
      ? isFinitePositive(firstCrackingThreshold) &&
        initialMaxMoment <= firstCrackingThreshold
        ? initialMaxMoment
        : initialMaxMoment * maxMomentFactor
      : null;

    // Create the solver context once.
    const context = createRcServiceSectionSolverContext({
      section: this._section,
      reinforcementMaterial: this._reinforcementMaterial,
      mesh: this._meshOptions,
      solver: this._solverOptions,
      modularRatio: this._effectiveModularRatio,
    });

    // Determine sampling range.  If no explicit max is provided we
    // sample up to the moment that produces ε_s = 0.01 in the extreme
    // tensile bar, capped at a reasonable guess.
    const resolvedMaxM =
      maxM ?? this._estimateMaxMoment(context, effectiveSampleCount);

    const sampleMoments = [];
    for (let i = 0; i <= effectiveSampleCount; i += 1) {
      const t = i / effectiveSampleCount;
      // Bias sampling towards the cracking region (sqrt spacing).
      const m = resolvedMaxM * Math.sqrt(t);
      sampleMoments.push(m);
    }
    // Deduplicate.
    const roundedSampleMoments = sampleMoments.map((value) =>
      Number(value.toPrecision(10)),
    );
    const exactCrackingThresholds = [
      this._mcrPositive,
      this._mcrNegative,
    ].filter(
      (value) => Number.isFinite(value) && value <= resolvedMaxM,
    );
    const unique = [
      ...new Set([...roundedSampleMoments, ...exactCrackingThresholds]),
    ].sort((a, b) => a - b);

    this._positiveTable = unique.map((m) => this._solvePoint(context, m));
    this._negativeTable = this._symmetric
      ? this._positiveTable.map((entry) => ({
          ...entry,
          kappa: -entry.kappa,
          kappaUncracked: -entry.kappaUncracked,
          kappaCracked: -entry.kappaCracked,
        }))
      : unique.map((m) => this._solvePoint(context, -m));
    this._maxAbsM = resolvedMaxM;
  }

  /**
   * Rough estimate of the maximum moment we should sample.
   * Uses an elastic cracked-section approximation.
   */
  _estimateMaxMoment(context, sampleCount) {
    const referenceMcr = Math.max(
      this._mcrPositive ?? 0,
      this._mcrNegative ?? 0,
    );
    // Start from the uncracked curvature at a guessed high moment.
    const guessedM = referenceMcr
      ? referenceMcr * 4
      : this._grossEI * 0.01;

    // Try to solve one point at a high moment to gauge the range.
    const testM = Math.max(guessedM, referenceMcr ? referenceMcr * 3 : 1);
    const solved = this._solvePoint(context, testM);

    if (solved.converged) {
      // Extend 50% beyond the test moment for safety.
      return testM * 1.5;
    }

    // Fall back to a conservative range.
    return referenceMcr ? referenceMcr * 6 : this._grossEI * 0.005;
  }

  _solvePoint(context, signedM) {
    const absM = Math.abs(signedM);
    const selectedMcr =
      signedM >= 0 ? this._mcrPositive : this._mcrNegative;

    if (absM === 0) {
      return {
        m: 0,
        kappa: 0,
        kappaUncracked: 0,
        kappaCracked: 0,
        eiSec: this._grossEI,
        zeta: 0,
        cracked: false,
        converged: true,
      };
    }

    const uncrackedKappa = signedM / this._grossEI;
    const isCracked =
      selectedMcr != null &&
      isFinitePositive(selectedMcr) &&
      absM > selectedMcr;

    if (!isCracked) {
      return {
        m: absM,
        kappa: uncrackedKappa,
        kappaUncracked: uncrackedKappa,
        kappaCracked: uncrackedKappa,
        eiSec: this._grossEI,
        zeta: 0,
        cracked: false,
        converged: true,
      };
    }

    // Solve cracked section state.
    this._sectionSolveCount += 1;

    const result = solveRcServiceSectionState({
      section: this._section,
      reinforcementMaterial: this._reinforcementMaterial,
      concreteMesh: context.mesh,
      serviceSolver: context.serviceSolver,
      concreteLaw: context.concreteLaw,
      steelLaw: context.steelLaw,
      solver: this._solverOptions,
      modularRatio: this._effectiveModularRatio,
      actions: {
        nEd: this._axialForce,
        mxEd: signedM,
        myEd: 0,
      },
    });

    const solved = result.solved;

    if (!solved.converged) {
      this._sectionSolveFailureCount += 1;
    }
    const crackedKappa = solved.converged
      ? Math.sign(signedM || 1) * Math.abs(solved.strainField?.kappaZ ?? 0)
      : uncrackedKappa;
    const crackedProperties = solved.converged
      ? calculateCrackedTransformedProperties({
          section: this._section,
          state: solved.state,
          modularRatio: this._effectiveModularRatio,
        })
      : null;

    // Tension stiffening.
    const zeta = isFinitePositive(selectedMcr)
      ? Math.max(0, 1 - this._beta * (selectedMcr / absM) ** 2)
      : 1;

    const meanKappa = zeta * crackedKappa + (1 - zeta) * uncrackedKappa;

    // Guard: at very low moments near M=0, use gross EI.
    const rawEiSec =
      isFinitePositive(Math.abs(meanKappa)) &&
      (!isFinitePositive(selectedMcr) || absM / selectedMcr > 0.01)
        ? absM / Math.abs(meanKappa)
        : this._grossEI;
    const eiSec = Math.min(rawEiSec, this._grossEI);

    return {
      m: absM,
      kappa: meanKappa,
      kappaUncracked: uncrackedKappa,
      kappaCracked: crackedKappa,
      eiSec,
      zeta,
      cracked: true,
      converged: solved.converged,
      crackedSection: crackedProperties,
    };
  }

  _lookup(moment) {
    const absM = Math.abs(moment);
    const table = moment >= 0 ? this._positiveTable : this._negativeTable;
    const selectedMcr =
      moment >= 0 ? this._mcrPositive : this._mcrNegative;

    if (isFinitePositive(selectedMcr) && absM <= selectedMcr) {
      const kappa = moment / this._grossEI;
      return {
        m: absM,
        kappa,
        kappaUncracked: kappa,
        kappaCracked: kappa,
        eiSec: this._grossEI,
        zeta: 0,
        cracked: false,
        converged: true,
        crackedSection: null,
      };
    }

    // Below the smallest tabulated point: return gross.
    if (absM <= table[0].m) {
      return { ...table[0] };
    }

    // Above the largest tabulated point: extrapolate last secant.
    const last = table[table.length - 1];
    if (absM >= last.m) {
      const direction = last.kappa >= 0 ? 1 : -1;
      return {
        ...last,
        m: absM,
        kappa: last.kappa + direction * ((absM - last.m) / last.eiSec),
        eiSec: last.eiSec,
      };
    }

    // Binary search + linear interpolation.
    let lo = 0;
    let hi = table.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1;
      if (table[mid].m <= absM) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    const left = table[lo];
    const right = table[hi];
    const t = (absM - left.m) / (right.m - left.m);

    return {
      m: absM,
      kappa: left.kappa + t * (right.kappa - left.kappa),
      kappaUncracked:
        left.kappaUncracked +
        t * (right.kappaUncracked - left.kappaUncracked),
      kappaCracked:
        left.kappaCracked + t * (right.kappaCracked - left.kappaCracked),
      eiSec: left.eiSec + t * (right.eiSec - left.eiSec),
      zeta: left.zeta + t * (right.zeta - left.zeta),
      cracked: left.cracked || right.cracked,
      converged: left.converged && right.converged,
      crackedSection:
        left.crackedSection && right.crackedSection
          ? {
              centroid:
                left.crackedSection.centroid +
                t * (right.crackedSection.centroid - left.crackedSection.centroid),
              inertia:
                left.crackedSection.inertia +
                t * (right.crackedSection.inertia - left.crackedSection.inertia),
              reinforcementFirstMoment:
                left.crackedSection.reinforcementFirstMoment +
                t * (
                  right.crackedSection.reinforcementFirstMoment -
                  left.crackedSection.reinforcementFirstMoment
                ),
            }
          : left.crackedSection ?? right.crackedSection ?? null,
    };
  }
}
