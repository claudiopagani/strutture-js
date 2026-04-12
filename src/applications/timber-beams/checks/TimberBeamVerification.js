import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { BeamSectionActionVerifier } from "../../../domain/beams/BeamSectionActionVerifier.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";

const DEFAULT_SECTION_UNITS = Object.freeze({ force: "N", length: "mm" });

const round = (value, decimals = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function designStrength(value, { kmod, gammaM }) {
  if (!Number.isFinite(value) || !Number.isFinite(kmod) || !Number.isFinite(gammaM)) {
    return null;
  }

  return (kmod * value) / gammaM;
}

function utilizationCheck({
  id,
  description,
  demand,
  capacity,
  metadata = {},
}) {
  assertPositive(capacity, `${id} capacity`);

  const utilizationRatio = Math.abs(demand) / capacity;

  return {
    id,
    description,
    demand: round(Math.abs(demand)),
    capacity: round(capacity),
    utilizationRatio: round(utilizationRatio),
    ok: utilizationRatio <= 1,
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
  const filtered = entries.filter((entry) => entry.context?.limitState === limitState);

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

function createTimberActionVerifier({
  section,
  material,
  sectionToResultUnits,
  gammaM,
}) {
  return {
    verifySectionActions({ vEd, mEd, context }) {
      const strengths = resolveStrengths({
        material,
        sectionProperties: context.sectionProperties,
        gammaM,
        fallbackKmod: material.kmod,
      });
      const bendingCapacity = sectionToResultUnits.moment(
        strengths.fmD * section.elasticSectionModulusY,
      );
      const shearArea = section.shearAreaY ?? section.area;
      const shearCapacity = sectionToResultUnits.force(
        (strengths.fvD * shearArea) / 1.5,
      );
      const bending = utilizationCheck({
        id: "timber-bending",
        description: "Bending stress verification",
        demand: mEd,
        capacity: bendingCapacity,
        metadata: {
          fmD: round(strengths.fmD),
          kmod: round(strengths.kmod),
          gammaM: round(strengths.gammaM),
        },
      });
      const shear = utilizationCheck({
        id: "timber-shear",
        description: "Shear stress verification",
        demand: vEd,
        capacity: shearCapacity,
        metadata: {
          fvD: round(strengths.fvD),
          shearArea: round(shearArea),
        },
      });
      const governing = bending.utilizationRatio >= shear.utilizationRatio
        ? bending
        : shear;

      return {
        status: bending.ok && shear.ok ? "ok" : "not-verified",
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
    metadata = {},
  } = {}) {
    this.code = code;
    this.gammaM = gammaM;
    this.deflectionLimitDenominator = deflectionLimitDenominator;
    this.finalDeflectionLimitDenominator =
      finalDeflectionLimitDenominator ?? deflectionLimitDenominator;
    this.metadata = { ...metadata };
  }

  verify({
    beamId = null,
    section = null,
    material = null,
    analysisResult = null,
    deflectionLimitDenominator = this.deflectionLimitDenominator,
    finalDeflectionLimitDenominator = this.finalDeflectionLimitDenominator,
  } = {}) {
    if (!section || !material || !analysisResult) {
      return new VerificationResult({
        applicationId: "timber-beams",
        status: "not-implemented",
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
    }).verify({ analysisResult });
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
      deflectionCheck,
      ...(finalDeflectionCheck ? [finalDeflectionCheck] : []),
    ];
    const governingCheck = checks.reduce((selected, check) =>
      check.utilizationRatio > selected.utilizationRatio ? check : selected,
    );

    return new VerificationResult({
      applicationId: "timber-beams",
      status: checks.every((check) => check.ok) ? "ok" : "not-verified",
      summary: "Timber beam bending, shear and deflection verification from FEM beam results.",
      utilizationRatio: governingCheck.utilizationRatio,
      demand: governingCheck.demand,
      capacity: governingCheck.capacity,
      checks,
      warnings: [
        "Lateral torsional stability is not included in this first timber beam verification.",
      ],
      metadata: {
        code: this.code,
        beamId,
        governingCheckId: governingCheck.id,
        ...this.metadata,
      },
    });
  }
}
