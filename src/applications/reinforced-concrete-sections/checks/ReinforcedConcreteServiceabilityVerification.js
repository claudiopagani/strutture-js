import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { ConcreteNoTensionLaw } from "../../../domain/constitutive-laws/ConcreteNoTensionLaw.js";
import { SteelElasticLaw } from "../../../domain/constitutive-laws/SteelElasticLaw.js";
import { RCServiceStressSolver } from "../analysis/RCServiceStressSolver.js";
import { SectionFiberDiscretizer } from "../analysis/SectionFiberDiscretizer.js";
import { solveServiceStressWithFallbacks } from "../analysis/solveServiceStressWithFallbacks.js";
import {
  DEFAULT_RC_SLE_MODULAR_RATIO,
  resolveRcSleModularRatio,
} from "../serviceabilityDefaults.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

const DEFAULT_SERVICEABILITY_OPTIONS = Object.freeze({
  environment: "ordinary",
  reinforcementSensitivity: "low",
  modularRatio: DEFAULT_RC_SLE_MODULAR_RATIO,
  rowTolerance: 50,
  creepCoefficient: 2,
  includeShrinkage: false,
});

const CRACK_WIDTH_BY_COMBINATION = Object.freeze({
  ordinary: {
    SLE_FREQUENT: "w3",
    SLE_QUASI_PERMANENT: "w2",
  },
  aggressive: {
    SLE_FREQUENT: "w2",
    SLE_QUASI_PERMANENT: "w1",
  },
  very_aggressive: {
    SLE_FREQUENT: "w1",
    SLE_QUASI_PERMANENT: "w1",
  },
});

const MAX_BAR_DIAMETER_TABLE = Object.freeze([
  { sigma: 160, w3: 40, w2: 32, w1: 25 },
  { sigma: 200, w3: 32, w2: 25, w1: 16 },
  { sigma: 240, w3: 20, w2: 16, w1: 12 },
  { sigma: 280, w3: 16, w2: 12, w1: 8 },
  { sigma: 320, w3: 12, w2: 10, w1: 6 },
  { sigma: 360, w3: 10, w2: 8, w1: 5 },
]);

const MAX_BAR_SPACING_TABLE = Object.freeze([
  { sigma: 160, w3: 300, w2: 300, w1: 200 },
  { sigma: 200, w3: 300, w2: 250, w1: 150 },
  { sigma: 240, w3: 250, w2: 200, w1: 100 },
  { sigma: 280, w3: 200, w2: 150, w1: 50 },
  { sigma: 320, w3: 150, w2: 100, w1: null },
  { sigma: 360, w3: 100, w2: 50, w1: null },
]);

const round = (value, decimals = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function hasSignificantAction(value, reference = 0, tolerance = 1e-9) {
  return (
    Number.isFinite(value) &&
    Math.abs(value) > Math.max(tolerance, Math.abs(reference) * tolerance)
  );
}

function utilizationCheck({
  id,
  description,
  demand,
  capacity,
  metadata = {},
}) {
  const utilizationRatio =
    isFinitePositive(capacity) ? Math.abs(demand) / capacity : null;

  return {
    id,
    description,
    demand: round(Math.abs(demand)),
    capacity: round(capacity),
    utilizationRatio: round(utilizationRatio),
    ok: Number.isFinite(utilizationRatio) && utilizationRatio <= 1,
    metadata,
  };
}

function normalizeEnvironment(environment) {
  return String(environment ?? "ordinary")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
}

function normalizeCombinationType(combinationType) {
  return String(combinationType ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "_");
}

function crackWidthLimit({ environment, combinationType }) {
  const normalizedEnvironment = normalizeEnvironment(environment);
  const normalizedCombination = normalizeCombinationType(combinationType);

  return CRACK_WIDTH_BY_COMBINATION[normalizedEnvironment]?.[
    normalizedCombination
  ] ?? null;
}

function interpolateTable(table, sigma, widthClass) {
  if (!Number.isFinite(sigma) || sigma < 0) {
    return null;
  }

  const first = table[0];
  const last = table[table.length - 1];

  if (sigma <= first.sigma) {
    return first[widthClass];
  }

  if (sigma >= last.sigma) {
    return last[widthClass];
  }

  for (let index = 0; index < table.length - 1; index += 1) {
    const lower = table[index];
    const upper = table[index + 1];

    if (sigma >= lower.sigma && sigma <= upper.sigma) {
      const lowerValue = lower[widthClass];
      const upperValue = upper[widthClass];

      if (lowerValue == null || upperValue == null) {
        return null;
      }

      const t = (sigma - lower.sigma) / (upper.sigma - lower.sigma);
      return lowerValue + t * (upperValue - lowerValue);
    }
  }

  return null;
}

function concreteStressLimit({ combinationType, concreteMaterial }) {
  const normalizedCombination = normalizeCombinationType(combinationType);
  const fck = concreteMaterial?.fck;

  if (!isFinitePositive(fck)) {
    return null;
  }

  if (
    normalizedCombination === "SLE_RARE" ||
    normalizedCombination === "SLE_CHARACTERISTIC" ||
    normalizedCombination === "SLE_CHAR"
  ) {
    return {
      id: "rare",
      factor: 0.6,
      value: 0.6 * fck,
      method: "ntc2018-4.1.2.2.5.1-characteristic",
    };
  }

  if (normalizedCombination === "SLE_QUASI_PERMANENT") {
    return {
      id: "quasi-permanent",
      factor: 0.45,
      value: 0.45 * fck,
      method: "ntc2018-4.1.2.2.5.1-quasi-permanent",
    };
  }

  return null;
}

function steelStressLimit({ combinationType, reinforcementMaterial }) {
  const normalizedCombination = normalizeCombinationType(combinationType);
  const fyk = reinforcementMaterial?.fyk;

  if (!isFinitePositive(fyk)) {
    return null;
  }

  if (
    normalizedCombination === "SLE_RARE" ||
    normalizedCombination === "SLE_CHARACTERISTIC" ||
    normalizedCombination === "SLE_CHAR"
  ) {
    return {
      id: "rare",
      factor: 0.8,
      value: 0.8 * fyk,
      method: "ntc2018-4.1.2.2.5.2-characteristic",
    };
  }

  return null;
}

function resolveServiceabilityOptions(options = {}) {
  const serviceability = {
    ...DEFAULT_SERVICEABILITY_OPTIONS,
    ...options,
    cracking: {
      ...(options.cracking ?? {}),
    },
    deflection: {
      creepCoefficient:
        options.deflection?.creepCoefficient ??
        options.creepCoefficient ??
        DEFAULT_SERVICEABILITY_OPTIONS.creepCoefficient,
      includeShrinkage:
        options.deflection?.includeShrinkage ??
        options.includeShrinkage ??
        DEFAULT_SERVICEABILITY_OPTIONS.includeShrinkage,
    },
  };

  serviceability.environment =
    options.cracking?.environment ??
    options.environment ??
    DEFAULT_SERVICEABILITY_OPTIONS.environment;
  serviceability.reinforcementSensitivity =
    options.cracking?.reinforcementSensitivity ??
    options.reinforcementSensitivity ??
    DEFAULT_SERVICEABILITY_OPTIONS.reinforcementSensitivity;
  serviceability.modularRatio = resolveRcSleModularRatio(
    options.cracking?.modularRatio,
    options.deflection?.modularRatio,
    options.modularRatio,
  );

  return serviceability;
}

function resolveStressActions({ nEd, mEd, mxEd, myEd }) {
  const userMxEd = Number.isFinite(mxEd) ? mxEd : Number.isFinite(mEd) ? mEd : 0;
  const userMyEd = Number.isFinite(myEd) ? myEd : 0;
  const primaryMoment = Number.isFinite(mEd) ? mEd : userMxEd;

  return {
    nEd,
    primaryMoment,
    userMxEd,
    userMyEd,
    stressMxEd: userMxEd,
    stressMyEd: userMyEd,
    biaxialStress: hasSignificantAction(userMyEd, userMxEd),
  };
}

function solveServiceState({
  section,
  concreteMaterial,
  reinforcementMaterial,
  actions,
  mesh,
  solver,
  modularRatio,
}) {
  const es = reinforcementMaterial?.elasticModulus;

  if (!section?.concreteSection) {
    throw new Error("RC SLE verification requires a reinforced concrete section.");
  }

  if (!isFinitePositive(es)) {
    throw new Error("RC SLE verification requires reinforcement elastic modulus.");
  }

  if (!isFinitePositive(modularRatio)) {
    throw new Error("RC SLE verification requires a positive modular ratio n.");
  }

  const concreteLaw = new ConcreteNoTensionLaw({
    ecm: es / modularRatio,
  });
  const steelLaw = new SteelElasticLaw({
    Es: es,
  });
  const discretizer = new SectionFiberDiscretizer();
  const concreteMesh = discretizer.discretize(section, {
    targetCount: mesh?.targetFiberCount ?? 100,
  });
  const serviceSolver = new RCServiceStressSolver({
    tolerance: solver?.tolerance ?? 1e-2,
    maxIterations: solver?.maxIterations ?? 50,
    finiteDifferenceStep: solver?.finiteDifferenceStep ?? 1e-8,
  });

  return {
    mesh: concreteMesh,
    solved: solveServiceStressWithFallbacks({
      serviceSolver,
      section,
      concreteFibers: concreteMesh.fibers,
      concreteLaw,
      steelLaw,
      actions,
      initialGuess: solver?.initialGuess ?? {},
    }),
  };
}

function maxAbsSteelStress(state) {
  return state.steel.bars.reduce((max, bar) => Math.max(max, Math.abs(bar.stress)), 0);
}

function tensionBars(state, section) {
  const barsById = new Map(
    section.getReinforcementBars().map((bar, index) => [
      String(bar.id ?? `bar-${index + 1}`),
      {
        id: bar.id ?? `bar-${index + 1}`,
        name: bar.name,
        diameter: bar.diameter,
        area: bar.area,
        y: bar.y,
        z: bar.z,
      },
    ]),
  );

  return state.steel.bars
    .filter((bar) => bar.stress > 0)
    .map((bar, index) => ({
      ...bar,
      ...(barsById.get(String(bar.id ?? `bar-${index + 1}`)) ?? {}),
      id: bar.id ?? `bar-${index + 1}`,
    }));
}

function reinforcementGroups(section, serviceability = {}) {
  return [
    ...(serviceability.longitudinalReinforcementGroups ?? []),
    ...(section?.metadata?.longitudinalReinforcementGroups ?? []),
  ];
}

function tensionFaceFromMoment(mEd) {
  return (mEd ?? 0) >= 0 ? "bottom" : "top";
}

function filterBarsForCrackControl({
  bars,
  section,
  serviceability,
  mEd,
  warnings,
}) {
  const requestedGroupId =
    serviceability.cracking?.tensionReinforcementGroupId ??
    serviceability.tensionReinforcementGroupId ??
    null;
  const groups = reinforcementGroups(section, serviceability);
  const tensionFace = tensionFaceFromMoment(mEd);
  const group =
    requestedGroupId == null
      ? groups.find((item) => item.face === tensionFace)
      : groups.find((item) => item.id === requestedGroupId);

  if (!group) {
    const shape = section.concreteSection?.metadata?.shape;

    if (shape !== "rectangular" && shape !== "t-section") {
      warnings.push(
        "Crack control for generic RC sections requires explicit top/bottom reinforcement groups.",
      );

      return {
        bars: [],
        groupId: requestedGroupId,
        face: tensionFace,
        missingRequiredGroup: true,
      };
    }

    return {
      bars,
      groupId: null,
      face: tensionFace,
      missingRequiredGroup: false,
    };
  }

  const allowedIds = new Set((group.barIds ?? []).map(String));
  const filtered = bars.filter((bar) => allowedIds.has(String(bar.id)));

  if (filtered.length === 0) {
    warnings.push(
      `No tensile bars from reinforcement group ${group.id} were active for crack control at this station.`,
    );
  }

  return {
    bars: filtered,
    groupId: group.id,
    face: group.face ?? tensionFace,
    missingRequiredGroup: false,
  };
}

function localSpacing(bar, bars, rowTolerance) {
  const rowBars = bars
    .filter((candidate) => Math.abs(candidate.y - bar.y) <= rowTolerance)
    .sort((a, b) => a.z - b.z);
  const index = rowBars.findIndex((candidate) => candidate.id === bar.id);

  if (index === -1 || rowBars.length < 2) {
    return null;
  }

  const previous =
    index > 0 ? Math.abs(rowBars[index].z - rowBars[index - 1].z) : null;
  const next =
    index < rowBars.length - 1
      ? Math.abs(rowBars[index + 1].z - rowBars[index].z)
      : null;

  return Math.min(
    ...(previous == null ? [] : [previous]),
    ...(next == null ? [] : [next]),
  );
}

export class ReinforcedConcreteServiceabilityVerification {
  constructor({
    code = "NTC2018",
    mesh = { targetFiberCount: 100 },
    solver = { tolerance: 1e-2, maxIterations: 50 },
    serviceability = {},
    metadata = {},
  } = {}) {
    this.code = code;
    this.mesh = { ...mesh };
    this.solver = { ...solver };
    this.serviceability = resolveServiceabilityOptions(serviceability);
    this.metadata = { ...metadata };
  }

  verifySectionActions({
    nEd = 0,
    mEd = 0,
    mxEd = null,
    myEd = null,
    context = {},
    section = context.section,
    concreteMaterial = context.concreteMaterial ?? section?.concreteMaterial,
    reinforcementMaterial =
      context.reinforcementMaterial ?? section?.reinforcementMaterial,
    serviceability = context.serviceability ?? this.serviceability,
    mesh = context.mesh ?? this.mesh,
    solver = context.solver ?? this.solver,
  } = {}) {
    const options = resolveServiceabilityOptions(serviceability);
    const warnings = [];
    const assumptions = [
      "RC SLE stresses are solved with a linear no-tension concrete section and the modular-ratio method.",
      "The first SLE cracking MVP uses ordinary reinforcing steel as low-sensitivity reinforcement.",
      `Creep coefficient for the deflection MVP is set to phi = ${options.deflection.creepCoefficient}; shrinkage curvature is not included.`,
    ];
    const checks = [];
    const stressActions = resolveStressActions({
      nEd,
      mEd,
      mxEd,
      myEd,
    });

    if (
      Math.abs(nEd) <= 1e-6 &&
      Math.abs(stressActions.stressMxEd) <= 1 &&
      Math.abs(stressActions.stressMyEd) <= 1
    ) {
      return {
        status: RESULT_STATUS.OK,
        utilizationRatio: null,
        demand: null,
        capacity: null,
        checks,
        warnings,
        assumptions,
        outputs: {
          nEd: 0,
          mEd: 0,
          mxEd: 0,
          myEd: 0,
          biaxialStress: false,
          crackControlMomentEd: 0,
          combinationType: context.combinationType ?? null,
          modularRatio: options.modularRatio,
          creepCoefficient: options.deflection.creepCoefficient,
          includeShrinkage: options.deflection.includeShrinkage,
          concreteCompression: 0,
          steelStress: 0,
          crackWidthClass: crackWidthLimit({
            environment: options.environment,
            combinationType: context.combinationType ?? null,
          }),
          crackControlGroupId: null,
          crackControlFace: null,
          crackControlComplete: true,
          tensileBars: [],
        },
        metadata: {
          code: this.code,
          method: "ntc2018-sle-serviceability",
          governingCheckId: null,
          combinationType: context.combinationType ?? null,
          mEd: 0,
          mxEd: 0,
          myEd: 0,
          biaxialStress: false,
          crackControlMomentBasis: "primary-moment-only",
          weakAxisMomentNeglectedInCrackControl: false,
          modularRatio: options.modularRatio,
          environment: normalizeEnvironment(options.environment),
          reinforcementSensitivity: options.reinforcementSensitivity,
          creepCoefficient: options.deflection.creepCoefficient,
          includeShrinkage: options.deflection.includeShrinkage,
          ...this.metadata,
        },
      };
    }

    if (normalizeEnvironment(options.environment) !== "ordinary") {
      warnings.push(
        `Crack-control environment ${options.environment} was used; default is ordinary.`,
      );
    }

    if (options.reinforcementSensitivity !== "low") {
      warnings.push(
        "Only low-sensitivity ordinary reinforcement is supported in this SLE cracking MVP.",
      );
    }

    let solvedState = null;
    let meshResult = null;

    try {
      const solved = solveServiceState({
        section,
        concreteMaterial,
        reinforcementMaterial,
        actions: {
          nEd,
          mxEd: stressActions.stressMxEd,
          myEd: stressActions.stressMyEd,
        },
        mesh,
        solver,
        modularRatio: options.modularRatio,
      });
      solvedState = solved.solved;
      meshResult = solved.mesh;
    } catch (error) {
      return {
        status: RESULT_STATUS.NOT_VERIFIED,
        utilizationRatio: null,
        demand: null,
        capacity: null,
        checks: [],
        warnings: [
          ...warnings,
          error.message,
        ],
        assumptions,
        metadata: {
          code: this.code,
          method: "ntc2018-sle-serviceability",
          ...this.metadata,
        },
      };
    }

    if (!solvedState.converged) {
      warnings.push(
        "The RC SLE stress solver did not converge within the configured limits.",
      );
    }

    const combinationType = context.combinationType ?? null;
    const concreteCompression = Math.abs(
      solvedState.state.extremes.maxConcreteCompression?.value ?? 0,
    );
    const steelStress = maxAbsSteelStress(solvedState.state);
    const concreteLimit = concreteStressLimit({
      combinationType,
      concreteMaterial,
    });
    const steelLimit = steelStressLimit({
      combinationType,
      reinforcementMaterial,
    });

    if (concreteLimit) {
      checks.push(
        utilizationCheck({
          id: "rc-sle-concrete-stress",
          description: "Concrete compression stress limit in service",
          demand: concreteCompression,
          capacity: concreteLimit.value,
          metadata: {
            method: concreteLimit.method,
            combinationType,
            limitFactor: concreteLimit.factor,
            fck: round(concreteMaterial.fck),
            sigmaCMax: round(concreteCompression),
            modularRatio: options.modularRatio,
            mxEd: round(stressActions.userMxEd),
            myEd: round(stressActions.userMyEd),
            biaxialStress: stressActions.biaxialStress,
          },
        }),
      );
    }

    if (steelLimit) {
      checks.push(
        utilizationCheck({
          id: "rc-sle-steel-stress",
          description: "Reinforcement stress limit in service",
          demand: steelStress,
          capacity: steelLimit.value,
          metadata: {
            method: steelLimit.method,
            combinationType,
            limitFactor: steelLimit.factor,
            fyk: round(reinforcementMaterial.fyk),
            sigmaSMax: round(steelStress),
            modularRatio: options.modularRatio,
            mxEd: round(stressActions.userMxEd),
            myEd: round(stressActions.userMyEd),
            biaxialStress: stressActions.biaxialStress,
          },
        }),
      );
    }

    const widthClass = crackWidthLimit({
      environment: options.environment,
      combinationType,
    });
    let crackSolvedState = solvedState;
    let crackStateUnavailable = false;

    if (widthClass && stressActions.biaxialStress) {
      warnings.push(
        "RC indirect crack control neglects the weak-axis service moment component and uses only the primary bending moment for top/bottom reinforcement groups.",
      );

      try {
        const crackSolved = solveServiceState({
          section,
          concreteMaterial,
          reinforcementMaterial,
          actions: {
            nEd,
            mxEd: stressActions.primaryMoment,
            myEd: 0,
          },
          mesh,
          solver,
          modularRatio: options.modularRatio,
        });
        crackSolvedState = crackSolved.solved;

        if (!crackSolvedState.converged) {
          warnings.push(
            "The RC SLE crack-control uniaxial stress state did not converge within the configured limits.",
          );
          crackStateUnavailable = true;
        }
      } catch (error) {
        warnings.push(error.message);
        crackStateUnavailable = true;
      }
    }

    const crackControlSelection = filterBarsForCrackControl({
      bars: tensionBars(crackSolvedState.state, section),
      section,
      serviceability: options,
      mEd: stressActions.primaryMoment,
      warnings,
    });
    const barsInTension = crackControlSelection.bars;
    let crackControlNotVerified = crackStateUnavailable;

    if (widthClass) {
      const crackCheckCountBefore = checks.length;

      if (crackControlSelection.missingRequiredGroup) {
        crackControlNotVerified = true;
      }

      for (const bar of barsInTension) {
        const sigmaS = Math.max(bar.stress, 0);
        const diameterLimit = interpolateTable(
          MAX_BAR_DIAMETER_TABLE,
          sigmaS,
          widthClass,
        );
        const spacing = localSpacing(
          bar,
          barsInTension,
          options.rowTolerance,
        );
        const spacingLimit = interpolateTable(
          MAX_BAR_SPACING_TABLE,
          sigmaS,
          widthClass,
        );

        if (isFinitePositive(diameterLimit)) {
          checks.push(
            utilizationCheck({
              id: "rc-sle-crack-bar-diameter",
              description:
                "Indirect crack control through maximum reinforcing bar diameter",
              demand: bar.diameter,
              capacity: diameterLimit,
              metadata: {
                method: "circolare-ntc2018-c4.1.ii",
                combinationType,
                environment: normalizeEnvironment(options.environment),
                crackWidthClass: widthClass,
                groupId: crackControlSelection.groupId,
                face: crackControlSelection.face,
                barId: bar.id,
                sigmaS: round(sigmaS),
                diameter: round(bar.diameter),
                diameterLimit: round(diameterLimit),
                momentBasis: "primary-moment-only",
                mEd: round(stressActions.primaryMoment),
                weakAxisMomentNeglected: stressActions.biaxialStress,
                neglectedMyEd: round(stressActions.userMyEd),
              },
            }),
          );
        }

        if (spacing != null && isFinitePositive(spacingLimit)) {
          checks.push(
            utilizationCheck({
              id: "rc-sle-crack-bar-spacing",
              description:
                "Indirect crack control through maximum reinforcing bar spacing",
              demand: spacing,
              capacity: spacingLimit,
              metadata: {
                method: "circolare-ntc2018-c4.1.iii",
                combinationType,
                environment: normalizeEnvironment(options.environment),
                crackWidthClass: widthClass,
                groupId: crackControlSelection.groupId,
                face: crackControlSelection.face,
                barId: bar.id,
                sigmaS: round(sigmaS),
                spacing: round(spacing),
                spacingLimit: round(spacingLimit),
                rowTolerance: round(options.rowTolerance),
                momentBasis: "primary-moment-only",
                mEd: round(stressActions.primaryMoment),
                weakAxisMomentNeglected: stressActions.biaxialStress,
                neglectedMyEd: round(stressActions.userMyEd),
              },
            }),
          );
        }
      }

      if (barsInTension.length === 0) {
        warnings.push(
          "No tensile reinforcement bars were found for indirect crack control at this station.",
        );
        crackControlNotVerified = true;
      }

      if (checks.length === crackCheckCountBefore) {
        warnings.push(
          "No indirect crack-control checks were generated for this station.",
        );
        crackControlNotVerified = true;
      }
    }

    const governing = checks.reduce((selected, check) => {
      if (!Number.isFinite(check.utilizationRatio)) {
        return selected;
      }

      if (!selected || check.utilizationRatio > selected.utilizationRatio) {
        return check;
      }

      return selected;
    }, null);

    return {
      status:
        solvedState.converged &&
        !crackControlNotVerified &&
        checks.every((check) => check.ok)
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks,
      warnings,
      assumptions,
      outputs: {
        nEd: round(nEd),
        mEd: round(stressActions.primaryMoment),
        mxEd: round(stressActions.userMxEd),
        myEd: round(stressActions.userMyEd),
        biaxialStress: stressActions.biaxialStress,
        crackControlMomentEd: round(stressActions.primaryMoment),
        combinationType,
        fiberCount: meshResult?.generatedCount ?? null,
        modularRatio: options.modularRatio,
        creepCoefficient: options.deflection.creepCoefficient,
        includeShrinkage: options.deflection.includeShrinkage,
        concreteCompression: round(concreteCompression),
        steelStress: round(steelStress),
        crackWidthClass: widthClass,
        crackControlGroupId: crackControlSelection.groupId,
        crackControlFace: crackControlSelection.face,
        crackControlComplete: !crackControlNotVerified,
        tensileBars: barsInTension.map((bar) => ({
          id: bar.id,
          y: round(bar.y),
          z: round(bar.z),
          diameter: round(bar.diameter),
          stress: round(bar.stress),
          spacing: round(localSpacing(bar, barsInTension, options.rowTolerance)),
        })),
        strainField: {
          eps0: round(solvedState.strainField.eps0, 12),
          kappaY: round(solvedState.strainField.kappaY, 12),
          kappaZ: round(solvedState.strainField.kappaZ, 12),
        },
      },
      metadata: {
        code: this.code,
        method: "ntc2018-sle-serviceability",
        governingCheckId: governing?.id ?? null,
        combinationType,
        mEd: round(stressActions.primaryMoment),
        mxEd: round(stressActions.userMxEd),
        myEd: round(stressActions.userMyEd),
        biaxialStress: stressActions.biaxialStress,
        crackControlMomentBasis: "primary-moment-only",
        weakAxisMomentNeglectedInCrackControl: stressActions.biaxialStress,
        modularRatio: options.modularRatio,
        environment: normalizeEnvironment(options.environment),
        reinforcementSensitivity: options.reinforcementSensitivity,
        creepCoefficient: options.deflection.creepCoefficient,
        includeShrinkage: options.deflection.includeShrinkage,
        ...this.metadata,
      },
    };
  }

  verify({
    section = null,
    concreteMaterial = section?.concreteMaterial,
    reinforcementMaterial = section?.reinforcementMaterial,
    actions = {},
    combinationType = actions.combinationType ?? "SLE_RARE",
    serviceability = this.serviceability,
    mesh = this.mesh,
    solver = this.solver,
  } = {}) {
    const primaryMoment =
      actions.mEd ??
      actions.m ??
      (Number.isFinite(actions.mxEd) ? actions.mxEd : 0);
    const result = this.verifySectionActions({
      nEd: actions.nEd ?? actions.n ?? 0,
      mEd: primaryMoment,
      mxEd: actions.mxEd,
      myEd: actions.myEd ?? actions.mzEd,
      context: {
        section,
        concreteMaterial,
        reinforcementMaterial,
        combinationType,
        serviceability,
        mesh,
        solver,
      },
    });

    return new VerificationResult({
      applicationId: "reinforced-concrete-serviceability",
      status: result.status,
      summary:
        "RC serviceability verification with modular-ratio stresses and indirect crack control.",
      utilizationRatio: result.utilizationRatio,
      demand: result.demand,
      capacity: result.capacity,
      checks: result.checks,
      outputs: result.outputs,
      warnings: result.warnings,
      assumptions: result.assumptions,
      metadata: {
        code: this.code,
        ...result.metadata,
      },
    });
  }
}
