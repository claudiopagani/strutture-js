import { VerificationResult } from "../../../core/results/VerificationResult.js";
import {
  assertPositive,
  isFinitePositive,
  round,
  uniqueStrings,
  utilizationCheck,
} from "../../../core/results/checkUtils.js";
import { BeamSectionActionVerifier } from "../../../domain/beams/BeamSectionActionVerifier.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { verifyTimberLateralTorsionalStability } from "./TimberLateralTorsionalStability.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

const DEFAULT_SECTION_UNITS = Object.freeze({ force: "N", length: "mm" });

function normalizeLimitState(limitState) {
  return String(limitState ?? "").trim().toUpperCase();
}

function normalizeCombinationType(combinationType) {
  return String(combinationType ?? "").trim().toUpperCase().replaceAll("-", "_");
}

function designStrength(value, { kmod, gammaM }) {
  if (!Number.isFinite(value) || !Number.isFinite(kmod) || !Number.isFinite(gammaM)) {
    return null;
  }

  return (kmod * value) / gammaM;
}

function ratioCheck({
  id,
  description,
  utilizationRatio,
  metadata = {},
}) {
  const safeRatio = Number.isFinite(utilizationRatio) ? utilizationRatio : Infinity;

  return {
    id,
    description,
    demand: round(safeRatio),
    capacity: 1,
    utilizationRatio: round(safeRatio),
    ok: safeRatio <= 1,
    metadata,
  };
}

function combinationEntries(analysisResult = {}) {
  return Object.values(analysisResult.combinations ?? {});
}

function loadCaseEntries(analysisResult = {}) {
  return Object.values(analysisResult.loadCases ?? {});
}

function filterByLimitState(entries, limitState) {
  const filtered = entries.filter(
    (entry) => normalizeLimitState(entry.context?.limitState) === normalizeLimitState(limitState),
  );

  return filtered.length > 0 ? filtered : entries;
}

function isFinalServiceEntry(entry) {
  const serviceCombination = String(entry.context?.serviceCombination ?? "")
    .trim()
    .toLowerCase();
  const deformationState = String(entry.context?.deformationState ?? "")
    .trim()
    .toLowerCase();

  return (
    serviceCombination === "final" ||
    serviceCombination === "quasi-permanent" ||
    deformationState === "final" ||
    entry.sectionProperties?.metadata?.finalStiffness === true
  );
}

function maxAbsDeflection(entries) {
  return entries.reduce((selected, entry) => {
    const sample = entry.displacements?.maxAbsVerticalDisplacement;

    if (!sample || !Number.isFinite(sample.uy)) {
      return selected;
    }

    const candidate = {
      resultId: entry.id,
      resultType: entry.resultType,
      value: Math.abs(sample.uy),
      sample,
      final: isFinalServiceEntry(entry),
    };

    return !selected || candidate.value > selected.value ? candidate : selected;
  }, null);
}

function resultEntries(analysisResult = {}) {
  const combinations = combinationEntries(analysisResult);

  return combinations.length > 0 ? combinations : loadCaseEntries(analysisResult);
}

function lateralTorsionalBucklingOptions(stability = {}) {
  return stability.lateralTorsionalBuckling ?? stability.ltb ?? {};
}

function isLtbEnabled(options = {}) {
  return options.enabled !== false && options.restrained !== true;
}

function optionValue(options, keys, fallback = null) {
  for (const key of keys) {
    if (options?.[key] != null) {
      return options[key];
    }
  }

  return fallback;
}

function ltbOptionValue(segment, options, keys, fallback = null) {
  for (const key of keys) {
    if (segment?.[key] != null) {
      return segment[key];
    }

    if (options?.[key] != null) {
      return options[key];
    }
  }

  return fallback;
}

function createLtbSegments({ result, options }) {
  const span = result.geometry?.length ?? result.geometry?.horizontalSpan;
  const rawSegments = options.segments ?? options.unbracedSegments;

  if (Array.isArray(rawSegments) && rawSegments.length > 0) {
    return rawSegments.map((segment, index) => {
      const from = segment.from ?? segment.start ?? 0;
      const to = segment.to ?? segment.end ?? span;
      const length =
        segment.unbracedLength ??
        segment.length ??
        (Number.isFinite(to) && Number.isFinite(from) ? to - from : null);

      return {
        ...segment,
        id: segment.id ?? `ltb-segment-${index + 1}`,
        from,
        to,
        length,
      };
    });
  }

  return [
    {
      id: "ltb-full-span",
      from: 0,
      to: span,
      length: options.unbracedLength ?? options.length ?? span,
    },
  ];
}

function sampleInSegment(sample, segment) {
  const station = sample.station;
  const from = segment.from ?? 0;
  const to = segment.to;

  if (!Number.isFinite(station)) {
    return false;
  }

  return (
    (!Number.isFinite(from) || station >= from - 1e-9) &&
    (!Number.isFinite(to) || station <= to + 1e-9)
  );
}

function sampleStrongAxisMoment(sample) {
  return sample?.principalActions?.mY ?? sample?.mY ?? sample?.m ?? 0;
}

function sampleWeakAxisMoment(sample) {
  return sample?.principalActions?.mZ ?? sample?.mZ ?? 0;
}

function moreSevereCheck(candidate, selected) {
  if (!candidate) {
    return selected;
  }

  if (!selected || candidate.utilizationRatio > selected.utilizationRatio) {
    return candidate;
  }

  return selected;
}

function copyMetadata(metadata = {}) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (Array.isArray(value)) {
        return [key, [...value]];
      }

      if (value && typeof value === "object") {
        return [key, { ...value }];
      }

      return [key, value];
    }),
  );
}

function copyCheck(check) {
  return {
    ...check,
    metadata: copyMetadata(check.metadata),
  };
}

function mostSevereGroupedCheck(candidate, current) {
  if (!current) {
    return true;
  }

  return candidate.utilizationRatio > current.utilizationRatio;
}

function resolveStrengths({ material, sectionProperties = {}, gammaM, fallbackKmod }) {
  const metadata = sectionProperties.metadata ?? {};
  const resolvedGammaM = gammaM ?? metadata.gammaM ?? material.metadata?.gammaM ?? 1.5;
  const resolvedKmod = metadata.kmod ?? fallbackKmod ?? material.kmod;

  return {
    gammaM: resolvedGammaM,
    kmod: resolvedKmod,
    fmD:
      metadata.fmD ??
      designStrength(material.fmK, { kmod: resolvedKmod, gammaM: resolvedGammaM }),
    fvD:
      metadata.fvD ??
      designStrength(material.fvK, { kmod: resolvedKmod, gammaM: resolvedGammaM }),
    fc0D:
      metadata.fc0D ??
      designStrength(material.fc0K, { kmod: resolvedKmod, gammaM: resolvedGammaM }),
    ft0D:
      metadata.ft0D ??
      designStrength(material.ft0K, { kmod: resolvedKmod, gammaM: resolvedGammaM }),
  };
}

function createLateralTorsionalStabilityChecks({
  analysisResult,
  section,
  material,
  resultToSectionUnits,
  stability = {},
  gammaM = null,
}) {
  const options = lateralTorsionalBucklingOptions(stability);
  const checks = [];
  const warnings = [];
  const assumptions = [];

  if (!isLtbEnabled(options)) {
    assumptions.push(
      "Timber lateral-torsional stability check is disabled because the beam is declared restrained or ltb.enabled is false.",
    );
    return {
      checks,
      warnings,
      assumptions,
      status: RESULT_STATUS.OK,
    };
  }

  assumptions.push(
    "Timber lateral-torsional stability is checked on ULS FEM principal-axis bending for declared unbraced segments; automatic kcrit is limited to rectangular sections unless kcrit or sigmaMcrit is provided.",
  );
  assumptions.push(
    "The strong-axis moment My is reduced by kcrit; any weak-axis moment Mz from section rotation is included as an elastic weak-axis bending term.",
  );

  const ulsEntries = resultEntries(analysisResult).filter(
    (entry) => normalizeLimitState(entry.context?.limitState) === "ULS",
  );

  if (ulsEntries.length === 0) {
    warnings.push(
      "No ULS FEM result was found for timber lateral-torsional stability.",
    );
  }

  for (const result of ulsEntries) {
    for (const segment of createLtbSegments({ result, options })) {
      const unbracedLength = Number.isFinite(segment.length)
        ? resultToSectionUnits.length(segment.length)
        : null;
      const segmentSamples = (result.internalForces?.samples ?? []).filter((sample) =>
        sampleInSegment(sample, segment),
      );

      if (segmentSamples.length === 0) {
        warnings.push(
          `No FEM internal-force sample was found for timber LTB segment ${segment.id}.`,
        );
        continue;
      }

      if (!isFinitePositive(unbracedLength)) {
        warnings.push(
          `Timber LTB segment ${segment.id} requires a positive unbraced length.`,
        );
        continue;
      }

      const strengths = resolveStrengths({
        material,
        sectionProperties: result.sectionProperties,
        gammaM,
        fallbackKmod: material.kmod,
      });
      let selectedCheck = null;
      let selectedSample = null;

      for (const sample of segmentSamples) {
        const myEdSectionUnits = resultToSectionUnits.moment(
          sampleStrongAxisMoment(sample),
        );
        const mzEdSectionUnits = resultToSectionUnits.moment(
          sampleWeakAxisMoment(sample),
        );
        const ltbResult = verifyTimberLateralTorsionalStability({
          section,
          material,
          myEd: myEdSectionUnits,
          mzEd: mzEdSectionUnits,
          unbracedLength,
          fmD: strengths.fmD,
          fmK: optionValue(options, ["fmK"], material.fmK),
          kcrit: ltbOptionValue(segment, options, ["kcrit", "kCrit"]),
          sigmaMcrit: ltbOptionValue(
            segment,
            options,
            ["sigmaMcrit", "sigmaMcr", "criticalBendingStress"],
          ),
          e0_05: ltbOptionValue(segment, options, ["e0_05", "e005", "E0_05"]),
          metadata: {
            kmod: round(strengths.kmod),
            gammaM: round(strengths.gammaM),
          },
        });

        warnings.push(...ltbResult.warnings);

        if (!ltbResult.check) {
          continue;
        }

        if (!selectedCheck || ltbResult.check.utilizationRatio > selectedCheck.utilizationRatio) {
          selectedCheck = ltbResult.check;
          selectedSample = sample;
        }
      }

      if (!selectedCheck || !selectedSample) {
        warnings.push(
          `Timber LTB verification was not generated for segment ${segment.id}.`,
        );
        continue;
      }

      const myEd = sampleStrongAxisMoment(selectedSample);
      const mzEd = sampleWeakAxisMoment(selectedSample);

      checks.push({
        ...selectedCheck,
        metadata: {
          ...selectedCheck.metadata,
          resultId: result.id,
          resultType: result.resultType,
          station: selectedSample.station,
          limitState: result.context?.limitState ?? null,
          combinationType: normalizeCombinationType(result.context?.combinationType),
          segmentId: segment.id,
          segmentFrom: round(segment.from),
          segmentTo: round(segment.to),
          unbracedLength: round(segment.length),
          unbracedLengthSectionUnits: round(unbracedLength),
          myEd: round(myEd),
          mzEd: round(mzEd),
          myEdSectionUnits: round(resultToSectionUnits.moment(myEd)),
          mzEdSectionUnits: round(resultToSectionUnits.moment(mzEd)),
          principalAxes: selectedSample.principalActions
            ? {
                alpha: selectedSample.principalActions.alpha,
                convention: selectedSample.principalActions.convention,
              }
            : null,
        },
      });
    }
  }

  if (checks.length === 0) {
    warnings.push(
      "No timber lateral-torsional stability check was generated; provide ULS FEM results and valid unbraced length data, or declare the beam restrained when applicable.",
    );
  }

  return {
    checks,
    warnings: uniqueStrings(warnings),
    assumptions,
    status:
      checks.length > 0 && checks.every((check) => check.ok)
        ? RESULT_STATUS.OK
        : RESULT_STATUS.NOT_VERIFIED,
  };
}

function createTimberActionVerifier({
  section,
  material,
  sectionToResultUnits,
  gammaM,
}) {
  return {
    verifySectionActions({ vEd, mEd, principalActions, context }) {
      const strengths = resolveStrengths({
        material,
        sectionProperties: context.sectionProperties,
        gammaM,
        fallbackKmod: material.kmod,
      });
      const mYEd = principalActions?.mY ?? mEd ?? 0;
      const mZEd = principalActions?.mZ ?? 0;
      const vYEd = principalActions?.vY ?? vEd ?? 0;
      const vZEd = principalActions?.vZ ?? 0;
      const bendingCapacityY = sectionToResultUnits.moment(
        strengths.fmD * section.elasticSectionModulusY,
      );
      const bendingCapacityZ = Number.isFinite(section.elasticSectionModulusZ)
        ? sectionToResultUnits.moment(strengths.fmD * section.elasticSectionModulusZ)
        : null;
      const shearArea = section.shearAreaY ?? section.area;
      const shearAreaZ = section.shearAreaZ ?? section.area;
      const shearCapacityY = sectionToResultUnits.force(
        (strengths.fvD * shearArea) / 1.5,
      );
      const shearCapacityZ = sectionToResultUnits.force(
        (strengths.fvD * shearAreaZ) / 1.5,
      );
      const bendingRatioY = Math.abs(mYEd) / bendingCapacityY;
      const bendingRatioZ =
        Number.isFinite(bendingCapacityZ) && bendingCapacityZ > 0
          ? Math.abs(mZEd) / bendingCapacityZ
          : Math.abs(mZEd) > 1e-12
            ? Infinity
            : 0;
      const bending = ratioCheck({
        id: "timber-bending",
        description: "Biaxial bending stress verification on principal section axes",
        utilizationRatio: bendingRatioY + bendingRatioZ,
        metadata: {
          fmD: round(strengths.fmD),
          kmod: round(strengths.kmod),
          gammaM: round(strengths.gammaM),
          actionBasis: principalActions ? "principal-actions" : "global-actions",
          mYEd: round(mYEd),
          mZEd: round(mZEd),
          bendingCapacityY: round(bendingCapacityY),
          bendingCapacityZ: round(bendingCapacityZ),
          utilizationRatioY: round(bendingRatioY),
          utilizationRatioZ: round(bendingRatioZ),
        },
      });
      const shearRatioY = Math.abs(vYEd) / shearCapacityY;
      const shearRatioZ = Math.abs(vZEd) / shearCapacityZ;
      const shear = ratioCheck({
        id: "timber-shear",
        description: "Biaxial shear verification on principal section axes",
        utilizationRatio: shearRatioY + shearRatioZ,
        metadata: {
          fvD: round(strengths.fvD),
          shearArea: round(shearArea),
          shearAreaY: round(shearArea),
          shearAreaZ: round(shearAreaZ),
          vYEd: round(vYEd),
          vZEd: round(vZEd),
          shearCapacityY: round(shearCapacityY),
          shearCapacityZ: round(shearCapacityZ),
          utilizationRatioY: round(shearRatioY),
          utilizationRatioZ: round(shearRatioZ),
        },
      });
      const governing = bending.utilizationRatio >= shear.utilizationRatio
        ? bending
        : shear;

      return {
        status: bending.ok && shear.ok ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
        utilizationRatio: governing.utilizationRatio,
        demand: governing.demand,
        capacity: governing.capacity,
        checks: [bending, shear],
        metadata: {
          governingCheckId: governing.id,
        },
      };
    },
  };
}

export class TimberBeamVerification {
  constructor({
    code = "NTC2018",
    gammaM = null,
    deflectionLimitDenominator = 300,
    finalDeflectionLimitDenominator = null,
    stability = {},
    verificationStations = null,
    metadata = {},
  } = {}) {
    this.code = code;
    this.gammaM = gammaM;
    this.deflectionLimitDenominator = deflectionLimitDenominator;
    this.finalDeflectionLimitDenominator =
      finalDeflectionLimitDenominator ?? deflectionLimitDenominator;
    this.stability = { ...stability };
    this.verificationStations = verificationStations;
    this.metadata = { ...metadata };
  }

  verify({
    beamId = null,
    section = null,
    material = null,
    analysisResult = null,
    deflectionLimitDenominator = this.deflectionLimitDenominator,
    finalDeflectionLimitDenominator = this.finalDeflectionLimitDenominator,
    stability = this.stability,
    verificationStations = this.verificationStations,
  } = {}) {
    if (!section || !material || !analysisResult) {
      return new VerificationResult({
        applicationId: "timber-beams",
        status: RESULT_STATUS.NOT_IMPLEMENTED,
        summary: "Timber beam verification workflow scaffolded.",
        warnings: [
          "Bending, shear, deflection and lateral stability checks are placeholders.",
        ],
        metadata: {
          code: this.code,
          beamId,
          ...this.metadata,
        },
      });
    }

    const resultUnits = analysisResult.units;
    const sectionUnits = section.metadata?.unitSystem ?? DEFAULT_SECTION_UNITS;
    const sectionToResultUnits = createUnitResolver(sectionUnits, resultUnits);
    const resultToSectionUnits = createUnitResolver(resultUnits, sectionUnits);
    const allEntries = combinationEntries(analysisResult);
    const availableEntries = allEntries.length > 0 ? allEntries : loadCaseEntries(analysisResult);
    const sleEntries = filterByLimitState(availableEntries, "SLE");
    const instantSleEntries = sleEntries.filter((entry) => !isFinalServiceEntry(entry));
    const finalSleEntries = sleEntries.filter(isFinalServiceEntry);
    const actionVerification = new BeamSectionActionVerifier({
      applicationId: "timber-beams",
      sectionVerifier: createTimberActionVerifier({
        section,
        material,
        sectionToResultUnits,
        gammaM: this.gammaM,
      }),
      limitStates: "ULS",
      verificationStations,
    }).verify({ analysisResult });
    const lateralTorsionalStability = createLateralTorsionalStabilityChecks({
      analysisResult,
      section,
      material,
      resultToSectionUnits,
      stability,
      gammaM: this.gammaM,
    });
    const governingDeflection =
      maxAbsDeflection(instantSleEntries.length > 0 ? instantSleEntries : sleEntries);
    const governingFinalDeflection = maxAbsDeflection(finalSleEntries);
    const span = analysisResult.combinations?.[governingDeflection?.combinationId]?.geometry?.length ??
      analysisResult.geometry?.length ??
      availableEntries[0]?.geometry?.length;
    const deflectionLimit = span / deflectionLimitDenominator;
    const deflectionCheck = utilizationCheck({
      id: "timber-deflection",
      description: "Serviceability vertical deflection verification",
      demand:
        governingDeflection?.sample?.uy ??
        governingDeflection?.value ??
        0,
      capacity: deflectionLimit,
      metadata: {
        combinationId:
          governingDeflection?.resultId ??
          governingDeflection?.combinationId ??
          null,
        station:
          governingDeflection?.sample?.station ??
          governingDeflection?.station ??
          null,
        limitDenominator: deflectionLimitDenominator,
      },
    });
    const finalDeflectionCheck =
      governingFinalDeflection == null
        ? null
        : utilizationCheck({
            id: "timber-final-deflection",
            description: "Final serviceability vertical deflection verification",
            demand:
              governingFinalDeflection.sample?.uy ??
              governingFinalDeflection.value ??
              0,
            capacity: span / finalDeflectionLimitDenominator,
            metadata: {
              combinationId:
                governingFinalDeflection.resultId ??
                governingFinalDeflection.combinationId ??
                null,
              station:
                governingFinalDeflection.sample?.station ??
                governingFinalDeflection.station ??
                null,
              limitDenominator: finalDeflectionLimitDenominator,
            },
          });
    const governingActionChecks = Object.values(
      actionVerification.checks.reduce((acc, check) => {
        const current = acc[check.id];

        if (!current || check.utilizationRatio > current.utilizationRatio) {
          acc[check.id] = check;
        }

        return acc;
      }, {}),
    );
    const checks = [
      ...governingActionChecks,
      ...lateralTorsionalStability.checks,
      deflectionCheck,
      ...(finalDeflectionCheck ? [finalDeflectionCheck] : []),
    ];
    const groupedChecks = Object.values(
      checks.reduce((acc, check) => {
        const current = acc[check.id];

        if (mostSevereGroupedCheck(check, current)) {
          acc[check.id] = check;
        }

        return acc;
      }, {}),
    );
    const governingCheck = groupedChecks.reduce((selected, check) =>
      moreSevereCheck(check, selected),
    null);
    const ulsOk = actionVerification.status === RESULT_STATUS.OK;
    const lateralStabilityOk = lateralTorsionalStability.status === RESULT_STATUS.OK;
    const deflectionOk =
      deflectionCheck.ok && (!finalDeflectionCheck || finalDeflectionCheck.ok);

    return new VerificationResult({
      applicationId: "timber-beams",
      status:
        ulsOk && lateralStabilityOk && deflectionOk ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
      summary: "Timber beam bending, shear, lateral stability and deflection verification from FEM beam results.",
      utilizationRatio: governingCheck?.utilizationRatio ?? null,
      demand: governingCheck?.demand ?? null,
      capacity: governingCheck?.capacity ?? null,
      checks: groupedChecks,
      outputs: {
        stationResultCount: actionVerification.outputs.stationResultCount,
        uls: actionVerification.outputs,
        stability: {
          lateralTorsionalBuckling: {
            status: lateralTorsionalStability.status,
            checkCount: lateralTorsionalStability.checks.length,
            checks: lateralTorsionalStability.checks.map(copyCheck),
          },
        },
        serviceability: {
          deflectionLimitDenominator,
          finalDeflectionLimitDenominator,
          checks: [
            deflectionCheck,
            ...(finalDeflectionCheck ? [finalDeflectionCheck] : []),
          ].map(copyCheck),
        },
        governing: governingCheck
          ? {
              utilizationRatio: governingCheck.utilizationRatio,
              demand: governingCheck.demand,
              capacity: governingCheck.capacity,
              metadata: copyMetadata(governingCheck.metadata),
            }
          : null,
      },
      warnings: uniqueStrings([
        ...actionVerification.warnings,
        ...lateralTorsionalStability.warnings,
      ]),
      assumptions: [
        ...actionVerification.assumptions,
        ...lateralTorsionalStability.assumptions,
        `SLE vertical deflection limit defaults to L/${deflectionLimitDenominator} unless overridden.`,
      ],
      metadata: {
        code: this.code,
        beamId,
        governingCheckId: governingCheck?.id ?? null,
        verificationStations,
        ...this.metadata,
      },
    });
  }
}
