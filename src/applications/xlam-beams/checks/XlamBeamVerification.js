import { VerificationResult } from "../../../core/results/VerificationResult.js";
import {
  assertPositive,
  governingCheck,
  round,
  utilizationCheck,
} from "../../../core/results/checkUtils.js";
import { BeamSectionActionVerifier } from "../../../domain/beams/BeamSectionActionVerifier.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";

const DEFAULT_SECTION_UNITS = Object.freeze({ force: "N", length: "mm" });

function hasSignificantAction(value, tolerance = 1e-12) {
  return Number.isFinite(value) && Math.abs(value) > tolerance;
}

function slabWeakAxisNeglectWarning({
  systemLabel,
  mZEd,
  vZEd,
  mZEdSectionUnits,
  vZEdSectionUnits,
}) {
  return `${systemLabel}: mZ/vZ from section rotation are reported and neglected in this 1D out-of-plane verification because the slab action provides high in-plane stiffness/resistance; checked governing components are mY/vY. mZ=${round(mZEd)}, vZ=${round(vZEd)}, mZSectionUnits=${round(mZEdSectionUnits)}, vZSectionUnits=${round(vZEdSectionUnits)}.`;
}

function resultEntries(resultMap = {}) {
  return Object.values(resultMap ?? {});
}

function normalizeLimitState(limitState) {
  return String(limitState ?? "").trim().toUpperCase();
}

function maxAbsDeflection(entries) {
  return entries.reduce((selected, entry) => {
    const sample = entry.displacements?.maxAbsVerticalDisplacement;

    if (!sample || !Number.isFinite(sample.uy)) {
      return selected;
    }

    const value = Math.abs(sample.uy);

    if (!selected || value > selected.value) {
      return {
        resultId: entry.id,
        value,
        sample,
      };
    }

    return selected;
  }, null);
}

function materialValue(material, keys, fallback = null) {
  for (const key of keys) {
    if (Number.isFinite(material?.[key])) {
      return material[key];
    }
  }

  return fallback;
}

function xlamRollingShearDemand({
  section,
  material,
  vEd,
  bendingStiffness,
}) {
  let tau0Max = 0;
  let tau90Max = 0;

  for (const layer of section.layers) {
    if (layer.thickness <= 0) {
      continue;
    }

    const yMid = layer.centroidY;
    let staticMoment = 0;

    for (const upperLayer of section.layers) {
      if (upperLayer.thickness <= 0 || upperLayer.centroidY < yMid) {
        continue;
      }

      const localModulus = upperLayer.active
        ? materialValue(material, ["e0Mean", "elasticModulus"])
        : materialValue(material, ["e90Mean"], materialValue(material, ["e0Mean", "elasticModulus"]) / 30);
      const area = section.effectiveWidth * upperLayer.thickness;

      staticMoment += localModulus * area * (upperLayer.centroidY - section.centroidY);
    }

    const tau = Math.abs((vEd * staticMoment) / (bendingStiffness * section.effectiveWidth));

    if (layer.active) {
      tau0Max = Math.max(tau0Max, tau);
    } else {
      tau90Max = Math.max(tau90Max, tau);
    }
  }

  return { tau0Max, tau90Max };
}

function createXlamActionVerifier({
  section,
  material,
  resultToSectionUnits,
  kmod,
  gammaM,
  systemBoardCount,
  includeCrossLayerBending,
}) {
  return {
    verifySectionActions({ nEd, vEd, mEd, principalActions, context }) {
      const convertedNEd = resultToSectionUnits.force(nEd ?? 0);
      const mYEd = principalActions?.mY ?? mEd ?? 0;
      const mZEd = principalActions?.mZ ?? 0;
      const vYEd = principalActions?.vY ?? vEd ?? 0;
      const vZEd = principalActions?.vZ ?? 0;
      const convertedVEd = resultToSectionUnits.force(vYEd);
      const convertedMEd = resultToSectionUnits.moment(mYEd);
      const convertedVZEd = resultToSectionUnits.force(vZEd);
      const convertedMZEd = resultToSectionUnits.moment(mZEd);
      const weakAxisNeglected =
        hasSignificantAction(convertedMZEd) || hasSignificantAction(convertedVZEd);
      const weakAxisMetadata = {
        mZEd: round(mZEd),
        vZEd: round(vZEd),
        mZEdSectionUnits: round(convertedMZEd),
        vZEdSectionUnits: round(convertedVZEd),
        weakAxisComponentsNeglected: weakAxisNeglected,
        weakAxisNeglectReason: weakAxisNeglected
          ? "slab-in-plane-stiffness-resistance"
          : null,
      };
      const e0 = materialValue(material, ["e0Mean", "elasticModulus"]);
      const rollingShearStrength =
        materialValue(material, ["rollingShearStrength", "fvK"]) ??
        material.metadata?.fvK;
      const bendingStiffness = section.calculateBendingStiffness(material, {
        includeCrossLayerBending,
      });
      const edgeDistance = Math.max(
        section.centroidY,
        section.height - section.centroidY,
      );
      const sigmaEdge =
        (Math.abs(convertedMEd) * e0 * edgeDistance) / bendingStiffness;
      const kSystem = section.calculateSystemStrengthFactor(systemBoardCount);
      const fmD = (kSystem * kmod * material.fmK) / gammaM;
      const rollingShear = xlamRollingShearDemand({
        section,
        material,
        vEd: convertedVEd,
        bendingStiffness,
      });
      const rollingShearCapacity = (kmod * rollingShearStrength) / gammaM;
      const checks = [
        utilizationCheck({
          id: "xlam-beam-bending",
          description: "XLAM strip bending stress verification",
          demand: sigmaEdge,
          capacity: fmD,
          metadata: {
            method: "xlam-strip-fem-section-actions",
            e0: round(e0),
            bendingStiffness: round(bendingStiffness),
            edgeDistance: round(edgeDistance),
            kmod: round(kmod),
            gammaM: round(gammaM),
            kSystem: round(kSystem),
            includeCrossLayerBending,
            ...weakAxisMetadata,
          },
        }),
        utilizationCheck({
          id: "xlam-beam-rolling-shear",
          description: "XLAM strip rolling shear verification in cross layers",
          demand: rollingShear.tau90Max,
          capacity: rollingShearCapacity,
          metadata: {
            method: "xlam-strip-layer-static-moment",
            tau0Max: round(rollingShear.tau0Max),
            tau90Max: round(rollingShear.tau90Max),
            rollingShearStrength: round(rollingShearStrength),
            kmod: round(kmod),
            gammaM: round(gammaM),
            ...weakAxisMetadata,
          },
        }),
      ];
      const warnings = [];

      if (Math.abs(convertedNEd) > 1e-9) {
        warnings.push(
          "Axial force is not included in the current XLAM strip stress checks.",
        );
      }
      if (weakAxisNeglected) {
        warnings.push(
          slabWeakAxisNeglectWarning({
            systemLabel: "XLAM strip",
            mZEd,
            vZEd,
            mZEdSectionUnits: convertedMZEd,
            vZEdSectionUnits: convertedVZEd,
          }),
        );
      }

      const governing = governingCheck(checks);

      return {
        status: checks.every((check) => check.ok) ? "ok" : "not-verified",
        utilizationRatio: governing?.utilizationRatio ?? null,
        demand: governing?.demand ?? null,
        capacity: governing?.capacity ?? null,
        checks,
        warnings,
        metadata: {
          governingCheckId: governing?.id ?? null,
          bendingStiffness: round(bendingStiffness),
          mEdSectionUnits: round(convertedMEd),
          vEdSectionUnits: round(convertedVEd),
          ...weakAxisMetadata,
        },
      };
    },
  };
}

export class XlamBeamVerification {
  constructor({
    kmod = 0.8,
    gammaM = 1.45,
    systemBoardCount = 1,
    includeCrossLayerBending = false,
    deflectionLimitDenominator = 300,
    verificationStations = null,
    metadata = {},
  } = {}) {
    this.kmod = kmod;
    this.gammaM = gammaM;
    this.systemBoardCount = systemBoardCount;
    this.includeCrossLayerBending = includeCrossLayerBending;
    this.deflectionLimitDenominator = deflectionLimitDenominator;
    this.verificationStations = verificationStations;
    this.metadata = { ...metadata };
  }

  verify({
    beamId = null,
    section = null,
    material = null,
    analysisResult = null,
    kmod = this.kmod,
    gammaM = this.gammaM,
    systemBoardCount = this.systemBoardCount,
    includeCrossLayerBending = this.includeCrossLayerBending,
    deflectionLimitDenominator = this.deflectionLimitDenominator,
    verificationStations = this.verificationStations,
  } = {}) {
    if (!section || !material || !analysisResult) {
      return new VerificationResult({
        applicationId: "xlam-beams",
        status: "not-implemented",
        summary: "XLAM beam verification requires a section, material and FEM beam analysis result.",
        warnings: [
          "XLAM strip verification was not run because required inputs are missing.",
        ],
        metadata: {
          beamId,
          ...this.metadata,
        },
      });
    }

    const resultToSectionUnits = createUnitResolver(
      analysisResult.units,
      section.metadata?.unitSystem ?? DEFAULT_SECTION_UNITS,
    );
    const actionVerification = new BeamSectionActionVerifier({
      applicationId: "xlam-beams",
      sectionVerifier: createXlamActionVerifier({
        section,
        material,
        resultToSectionUnits,
        kmod,
        gammaM,
        systemBoardCount,
        includeCrossLayerBending,
      }),
      limitStates: "ULS",
      verificationStations,
    }).verify({ analysisResult });
    const sleEntries = resultEntries(analysisResult.combinations).filter(
      (entry) => normalizeLimitState(entry.context?.limitState) === "SLE",
    );
    const governingDeflection = maxAbsDeflection(sleEntries);
    const span =
      analysisResult.geometry?.length ??
      sleEntries[0]?.geometry?.length ??
      resultEntries(analysisResult.combinations)[0]?.geometry?.length;
    const deflectionCheck =
      governingDeflection && Number.isFinite(span)
        ? utilizationCheck({
            id: "xlam-beam-deflection",
            description: "XLAM strip vertical deflection verification",
            demand: governingDeflection.value,
            capacity: span / deflectionLimitDenominator,
            metadata: {
              resultId: governingDeflection.resultId,
              station: governingDeflection.sample.station,
              deflectionLimitDenominator,
            },
          })
        : null;
    const checks = [
      ...actionVerification.checks,
      ...(deflectionCheck ? [deflectionCheck] : []),
    ];
    const groupedChecks = Object.values(
      checks.reduce((acc, check) => {
        const current = acc[check.id];

        if (!current || check.utilizationRatio > current.utilizationRatio) {
          acc[check.id] = check;
        }

        return acc;
      }, {}),
    );
    const governing = governingCheck(groupedChecks);
    const deflectionOk = !deflectionCheck || deflectionCheck.ok;

    return new VerificationResult({
      applicationId: "xlam-beams",
      status:
        actionVerification.status === "ok" && deflectionOk
          ? "ok"
          : "not-verified",
      summary: "XLAM strip beam bending, rolling shear and deflection verification from FEM results.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks: groupedChecks,
      outputs: {
        stationResultCount: actionVerification.outputs.stationResultCount,
        uls: actionVerification.outputs,
        serviceability: {
          deflectionLimitDenominator,
          check: deflectionCheck
            ? {
                ...deflectionCheck,
                metadata: { ...deflectionCheck.metadata },
              }
            : null,
        },
        governing: governing
          ? {
              utilizationRatio: governing.utilizationRatio,
              demand: governing.demand,
              capacity: governing.capacity,
              metadata: { ...governing.metadata },
            }
          : null,
      },
      warnings: [
        ...(deflectionCheck
          ? []
          : ["No SLE XLAM deflection check was generated because no SLE combination was found."]),
        ...actionVerification.warnings,
        "XLAM vibration verification is outside the current beam domain.",
        "XLAM fire verification is outside the current beam domain.",
      ],
      assumptions: [
        ...actionVerification.assumptions,
        "The XLAM panel is modeled as a one-dimensional strip in its main spanning direction.",
        "Rolling shear is checked with a simplified layer static-moment stress recovery.",
      ],
      metadata: {
        beamId,
        method: "xlam-strip-timoshenko-fem",
        governingCheckId: governing?.id ?? null,
        kmod,
        gammaM,
        systemBoardCount,
        includeCrossLayerBending,
        verificationStations,
        ...this.metadata,
      },
    });
  }
}
