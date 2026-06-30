import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import { verifyCosenzaCircularShear } from "./shear/cosenzaCircularShear.js";
import {
  verifyWithTransverseReinforcement,
  verifyWithoutTransverseReinforcement,
} from "./shear/ntc2018ShearResistance.js";
import {
  COSENZA_METHOD,
  DEFAULT_RC_SHEAR_UNITS,
} from "./shear/shearUtils.js";
import {
  resolveCosenzaParameters,
  resolveMethod,
  resolveMode,
  resolveShearParameters,
  resolveUnits,
} from "./shear/shearParameterResolvers.js";

export class ReinforcedConcreteShearVerification {
  constructor({
    code = "NTC2018",
    mode = null,
    method = null,
    shear = {},
    section = null,
    concreteMaterial = null,
    reinforcementMaterial = null,
    metadata = {},
  } = {}) {
    this.code = code;
    this.mode = mode;
    this.method = method;
    this.shear = { ...shear };
    this.section = section;
    this.concreteMaterial = concreteMaterial;
    this.reinforcementMaterial = reinforcementMaterial;
    this.metadata = { ...metadata };
  }

  verifySectionActions({
    nEd = 0,
    vEd = 0,
    mEd = 0,
    context = {},
    section = context.section ?? this.section,
    concreteMaterial = context.concreteMaterial ?? this.concreteMaterial,
    reinforcementMaterial =
      context.reinforcementMaterial ?? this.reinforcementMaterial,
    shear = context.shear ?? this.shear,
    units = context.units ?? resolveUnits(section, { shear }),
  } = {}) {
    const resolvedShear = {
      ...this.shear,
      ...shear,
      mode: shear?.mode ?? this.mode ?? this.shear.mode,
      method:
        shear?.method ??
        shear?.formulation ??
        this.method ??
        this.shear.method ??
        this.shear.formulation,
    };
    const resolver = createUnitResolver(units, DEFAULT_RC_SHEAR_UNITS);
    const convertedNEd = resolver.force(nEd ?? 0);
    const convertedVEd = resolver.force(vEd ?? 0);
    const convertedMEd = resolver.moment(mEd ?? 0);
    const baseWarnings = [];

    if (!section) {
      baseWarnings.push("RC shear verification requires a reinforced concrete section.");
    }

    if (!concreteMaterial) {
      baseWarnings.push("RC shear verification requires a concrete material.");
    }

    const mode = resolveMode(resolvedShear, this.mode);
    const method = resolveMethod(resolvedShear, this.method);

    if (!mode) {
      baseWarnings.push(
        "RC shear verification requires shear.mode: without-transverse-reinforcement or with-transverse-reinforcement.",
      );
    }

    if (!method) {
      baseWarnings.push(
        "Unsupported RC shear method; use ntc2018 or cosenza-et-al-2016.",
      );
    }

    if (baseWarnings.length > 0) {
      return {
        status: RESULT_STATUS.NOT_VERIFIED,
        utilizationRatio: null,
        demand: Math.abs(convertedVEd),
        capacity: null,
        checks: [],
        warnings: baseWarnings,
        assumptions: [],
        outputs: {},
        metadata: {
          code: this.code,
          method: method ?? resolvedShear.method ?? resolvedShear.formulation,
        },
      };
    }

    let result;

    if (method === COSENZA_METHOD) {
      const params = resolveCosenzaParameters({
        section,
        concreteMaterial,
        reinforcementMaterial,
        shear: {
          ...resolvedShear,
          mode,
          method,
        },
        nEd: convertedNEd,
        units,
        mode,
      });
      result = verifyCosenzaCircularShear({
        vEd: convertedVEd,
        params,
      });
    } else {
      const params = resolveShearParameters({
        section,
        concreteMaterial,
        reinforcementMaterial,
        shear: {
          ...resolvedShear,
          mode,
        },
        nEd: convertedNEd,
        mEd: convertedMEd,
        units,
      });
      result =
        mode === "without-transverse-reinforcement"
          ? verifyWithoutTransverseReinforcement({
              vEd: convertedVEd,
              params,
            })
          : verifyWithTransverseReinforcement({
              vEd: convertedVEd,
              params,
              shear: resolvedShear,
              units,
            });
    }

    return {
      ...result,
      metadata: {
        code: this.code,
        ...result.metadata,
        ...this.metadata,
      },
    };
  }

  verify({
    section = this.section,
    concreteMaterial = this.concreteMaterial ?? section?.concreteMaterial,
    reinforcementMaterial =
      this.reinforcementMaterial ?? section?.reinforcementMaterial,
    shear = this.shear,
    actions = {},
    units = resolveUnits(section, { shear }),
  } = {}) {
    const result = this.verifySectionActions({
      nEd: actions.nEd ?? 0,
      vEd: actions.vEd ?? actions.v ?? 0,
      mEd: actions.mEd ?? actions.m ?? 0,
      section,
      concreteMaterial,
      reinforcementMaterial,
      shear,
      units,
      context: {
        section,
        concreteMaterial,
        reinforcementMaterial,
        shear,
        units,
      },
    });

    return new VerificationResult({
      applicationId: "reinforced-concrete-shear",
      status: result.status,
      summary: "RC shear verification according to the selected shear formulation.",
      utilizationRatio: result.utilizationRatio,
      demand: result.demand,
      capacity: result.capacity,
      checks: result.checks,
      outputs: result.outputs,
      warnings: result.warnings,
      assumptions: result.assumptions,
      metadata: result.metadata,
    });
  }
}
