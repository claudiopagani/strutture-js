import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

const round = (value, decimals = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function evaluateCheck(demand, capacity) {
  const utilizationRatio = demand / capacity;

  return {
    demand,
    capacity,
    utilizationRatio,
    ok: utilizationRatio <= 1,
  };
}

export class XlamOutOfPlanePanelVerification {
  verify(model) {
    const {
      span,
      section,
      material,
      kmod,
      gammaM,
      systemBoardCount,
      loads,
      deflectionLimitDenominator,
      longTermDeflectionLimitDenominator,
    } = model;

    assertPositive(span, "Panel span");

    const qUls = loads.ulsLineLoad;
    const qSle = loads.sleLineLoad ?? 0;
    const qPermanent = loads.slePermanentLineLoad ?? 0;
    const qVariable = loads.sleVariableLineLoad ?? 0;
    const e0 = material.e0Mean ?? material.elasticModulus;
    const rollingShearStrength =
      material.rollingShearStrength ?? material.fvK ?? material.metadata?.fvK;

    assertPositive(qUls, "ULS line load");
    assertPositive(e0, "XLAM longitudinal modulus");
    assertPositive(rollingShearStrength, "XLAM rolling shear strength");

    const stiffness = section.calculateShearStiffness(material);
    const bendingStiffness = section.calculateBendingStiffness(material);
    const slenderness = span / stiffness.totalHeight;
    const mEd = (qUls * span ** 2) / 8;
    const vEd = (qUls * span) / 2;
    const sigmaEdge = (mEd * e0 * (section.height / 2)) / bendingStiffness;
    const kSystem = section.calculateSystemStrengthFactor(systemBoardCount);
    const fmCltD = (kSystem * kmod * material.fmK) / gammaM;

    let tau0Max = 0;
    let tau90Max = 0;

    for (const layer of section.layers) {
      if (layer.thickness <= 0) {
        continue;
      }

      const modulus = layer.active ? material.e0Mean : material.e90Mean;
      const shearModulus = layer.active ? material.g0Mean : material.g90Mean;
      const yMid = layer.centroidY;

      let staticMoment = 0;
      for (const upperLayer of section.layers) {
        if (upperLayer.thickness <= 0) {
          continue;
        }

        if (upperLayer.centroidY < yMid) {
          continue;
        }

        const localModulus = upperLayer.active ? material.e0Mean : material.e90Mean;
        const area = section.effectiveWidth * upperLayer.thickness;
        staticMoment += localModulus * area * (upperLayer.centroidY - section.centroidY);
      }

      const tau =
        (vEd * staticMoment) / (bendingStiffness * section.effectiveWidth);
      const adjustedTau = Math.abs(tau);
      void shearModulus;

      if (layer.active) {
        tau0Max = Math.max(tau0Max, adjustedTau);
      } else {
        tau90Max = Math.max(tau90Max, adjustedTau);
      }
    }

    const deflectionShort =
      (5 * (qSle || qPermanent + qVariable) * span ** 4) /
        (384 * stiffness.bendingStiffness) +
      (qSle || qPermanent + qVariable) * span ** 2 / (8 * stiffness.shearStiffness);

    const kdef = model.kdef();
    const deflectionLong =
      (5 * qPermanent * span ** 4) / (384 * stiffness.bendingStiffness) * (1 + kdef) +
      (5 * qVariable * span ** 4) / (384 * stiffness.bendingStiffness) +
      qPermanent * span ** 2 / (8 * stiffness.shearStiffness) * (1 + kdef) +
      qVariable * span ** 2 / (8 * stiffness.shearStiffness);

    const checks = [
      {
        id: "bending",
        description: "ULS bending verification",
        ...evaluateCheck(Math.abs(sigmaEdge), fmCltD),
      },
      {
        id: "rolling-shear",
        description: "ULS rolling shear verification in cross layers",
        ...evaluateCheck(Math.abs(tau90Max), (kmod * rollingShearStrength) / gammaM),
      },
      {
        id: "short-deflection",
        description: "SLS short-term deflection verification",
        ...evaluateCheck(Math.abs(deflectionShort), span / deflectionLimitDenominator),
      },
      {
        id: "long-deflection",
        description: "SLS long-term deflection verification",
        ...evaluateCheck(
          Math.abs(deflectionLong),
          span / longTermDeflectionLimitDenominator,
        ),
      },
    ];

    const governingCheck = checks.reduce((max, current) =>
      current.utilizationRatio > max.utilizationRatio ? current : max,
    );

    return new VerificationResult({
      applicationId: "xlam-panels-out-of-plane",
      status: checks.every((check) => check.ok) ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "Out-of-plane verification of a standalone XLAM panel following the CLTdesigner/WCTE2010 1D-plate approach based on Timoshenko beam theory.",
      utilizationRatio: round(governingCheck.utilizationRatio),
      demand: round(governingCheck.demand),
      capacity: round(governingCheck.capacity),
      checks: checks.map((check) => ({
        ...check,
        demand: round(check.demand),
        capacity: round(check.capacity),
        utilizationRatio: round(check.utilizationRatio),
      })),
      outputs: {
        bendingStiffness: round(bendingStiffness),
        shearStiffness: round(stiffness.shearStiffness),
        shearCorrectionCoefficient: round(stiffness.shearCorrectionCoefficient),
        slenderness: round(slenderness),
        exactMethodRecommended: slenderness < 15,
        mEd: round(mEd),
        vEd: round(vEd),
        sigmaEdge: round(sigmaEdge),
        tau0Max: round(tau0Max),
        tau90Max: round(tau90Max),
        kSystem: round(kSystem),
        fmCltD: round(fmCltD),
        kdef: round(kdef),
        deflectionShort: round(deflectionShort),
        deflectionLong: round(deflectionLong),
      },
      warnings: slenderness < 15
        ? [
            "The WCTE2010 article recommends an exact analytical solution for L/H < 15.",
          ]
        : [],
      assumptions: [
        "The panel is evaluated as a 1D strip in its main spanning direction.",
        "Cross-layer bending stiffness is neglected by default, in line with the article simplification.",
      ],
      metadata: {
        method: "wcte2010-cltdesigner-1d-plate",
      },
    });
  }
}
