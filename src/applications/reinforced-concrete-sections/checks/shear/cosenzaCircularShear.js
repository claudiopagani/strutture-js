import { RESULT_STATUS } from "../../../../core/results/resultStatus.js";
import {
  COSENZA_METHOD,
  isFinitePositive,
  requiredParametersMissing,
  round,
  utilizationCheck,
} from "./shearUtils.js";

export function verifyCosenzaCircularShear({ vEd, params }) {
  const warnings = [...params.warnings];
  const missing = requiredParametersMissing(
    {
      diameter: params.diameter,
      concreteArea: params.concreteArea,
      longitudinalArea: params.longitudinalArea,
      fcPrime: params.fcPrime,
    },
    ["diameter", "concreteArea", "longitudinalArea", "fcPrime"],
    warnings,
  );

  if (params.shape !== "circular") {
    missing.push("circularSection");
  }

  if (
    params.mode === "with-transverse-reinforcement" &&
    !params.transverseReinforcement
  ) {
    missing.push("transverseReinforcement");
  }

  if (missing.length > 0) {
    return {
      status: RESULT_STATUS.NOT_VERIFIED,
      utilizationRatio: null,
      demand: Math.abs(vEd),
      capacity: null,
      checks: [],
      warnings,
      assumptions: [
        "Cosenza et al. (2016) circular-section shear verification was not run because required parameters are incomplete.",
      ],
      outputs: {
        parameters: params,
      },
      metadata: {
        method: COSENZA_METHOD,
        missingParameters: [...new Set(missing)],
      },
    };
  }

  const baseCoefficient = 0.232;
  const transverseCoefficient = 245;
  const vRdWithoutTransverseReinforcement =
    baseCoefficient *
    params.diameter ** 2 *
    Math.cbrt(100 * params.rhoL * params.fcPrime);
  const amplificationFactor =
    params.mode === "with-transverse-reinforcement"
      ? 1 + transverseCoefficient * params.rhoW
      : 1;
  const capacity = vRdWithoutTransverseReinforcement * amplificationFactor;
  const equation = params.mode === "with-transverse-reinforcement" ? 5 : 3;
  const check = utilizationCheck({
    id:
      params.mode === "with-transverse-reinforcement"
        ? "rc-shear-resistance"
        : "rc-shear-without-transverse-reinforcement",
    description:
      params.mode === "with-transverse-reinforcement"
        ? "Circular-section shear resistance with transverse reinforcement according to Cosenza et al. (2016)"
        : "Circular-section shear resistance without transverse reinforcement according to Cosenza et al. (2016)",
    demand: vEd,
    capacity,
    metadata: {
      method: `${COSENZA_METHOD}-eq-${equation}`,
      equation,
      baseCoefficient,
      transverseCoefficient,
      diameter: round(params.diameter),
      Ac: round(params.concreteArea),
      Asl: round(params.longitudinalArea),
      rhoL: round(params.rhoL, 9),
      fcPrime: round(params.fcPrime),
      Asw: round(params.transverseReinforcement?.area),
      spacing: round(params.transverseReinforcement?.spacing),
      rhoW: round(params.rhoW, 9),
      amplificationFactor: round(amplificationFactor, 9),
      sources: params.sources,
    },
  });

  warnings.push(
    "Cosenza et al. (2016) is an empirical research formulation and does not introduce a partial safety factor in Equations (3) and (5).",
  );

  return {
    status: check.ok ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    utilizationRatio: check.utilizationRatio,
    demand: check.demand,
    capacity: check.capacity,
    checks: [check],
    warnings,
    assumptions: [
      "Equation (3) is evaluated as VR = 0.232 D^2 (100 rhoL f'c)^(1/3), with rhoL = Asl / Ac.",
      ...(params.mode === "with-transverse-reinforcement"
        ? [
            "Equation (5) is evaluated by multiplying the unreinforced resistance by (1 + 245 rhoW), with rhoW = Asw / (s D).",
          ]
        : []),
      "The formulation is applied in N, mm and MPa and ignores axial-force effects.",
    ],
    outputs: {
      parameters: params,
      baseCoefficient,
      transverseCoefficient:
        params.mode === "with-transverse-reinforcement"
          ? transverseCoefficient
          : null,
      rhoL: round(params.rhoL, 9),
      rhoW: round(params.rhoW, 9),
      amplificationFactor: round(amplificationFactor, 9),
      vRdWithoutTransverseReinforcement: round(
        vRdWithoutTransverseReinforcement,
      ),
      vRdWithTransverseReinforcement:
        params.mode === "with-transverse-reinforcement"
          ? round(capacity)
          : null,
      vRd: round(capacity),
    },
    metadata: {
      method: `${COSENZA_METHOD}-eq-${equation}`,
      governingCheckId: check.id,
    },
  };
}
