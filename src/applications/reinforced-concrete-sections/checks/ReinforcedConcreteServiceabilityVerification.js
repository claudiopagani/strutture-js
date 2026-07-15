import { VerificationResult } from "../../../core/results/VerificationResult.js";
import {
  governingCheck,
  hasSignificantAction,
  isFinitePositive,
  normalizeCombinationType,
  round,
  utilizationCheck,
} from "../shared/rcCommon.js";
import { solveRcServiceSectionState } from "../shared/solveRcServiceSectionState.js";
import {
  createIndirectCrackControlChecks,
  crackWidthLimit,
  filterBarsForCrackControl,
  localSpacing,
  tensionBars,
} from "./serviceability/crackControl.js";
import {
  normalizeEnvironment,
  resolveServiceabilityOptions,
} from "./serviceability/serviceabilityOptions.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

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
  reinforcementMaterial,
  actions,
  mesh,
  solver,
  modularRatio,
}) {
  return solveRcServiceSectionState({
    section,
    reinforcementMaterial,
    actions,
    mesh,
    solver,
    modularRatio,
  });
}

function maxAbsSteelStress(state) {
  return state.steel.bars.reduce((max, bar) => Math.max(max, Math.abs(bar.stress)), 0);
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

      checks.push(
        ...createIndirectCrackControlChecks({
          barsInTension,
          widthClass,
          options,
          combinationType,
          selection: crackControlSelection,
          stressActions,
        }),
      );

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

    const governing = governingCheck(checks);

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
          spacing: round(
            crackControlSelection.spacing ??
              localSpacing(bar, barsInTension, options.rowTolerance),
          ),
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
