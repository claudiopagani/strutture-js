import { VerificationResult } from "../../../core/results/VerificationResult.js";
import {
  assertPositive,
  governingCheck,
  isFinitePositive,
  round,
  uniqueStrings,
  utilizationCheck,
} from "../../../core/results/checkUtils.js";
import { BeamSectionActionVerifier } from "../../../domain/beams/BeamSectionActionVerifier.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import {
  verifySteelBeamColumnInteractionMy,
  verifySteelBeamColumnInteractionMyMz,
} from "./SteelBeamColumnInteraction.js";
import { verifySteelCompressionBuckling } from "./SteelCompressionBuckling.js";
import { verifySteelLateralTorsionalBuckling } from "./SteelLateralTorsionalBuckling.js";
import { classifySteelSection } from "./SteelSectionClassification.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import {
  calculateSteelMomentDiagramFactor,
  steelNotSupportedCheck,
} from "./SteelAdvancedMemberChecks.js";

export const DEFAULT_SECTION_UNITS = Object.freeze({ force: "N", length: "mm" });

export function hasSignificantAction(value, tolerance = 1e-9) {
  return Number.isFinite(value) && Math.abs(value) > tolerance;
}

export function designStrength(material, gammaM0) {
  if (Number.isFinite(material?.fyd)) {
    return material.fyd;
  }

  if (Number.isFinite(material?.fyk) && Number.isFinite(gammaM0)) {
    return material.fyk / gammaM0;
  }

  return null;
}

export function classificationPartById(classificationResult, id) {
  return classificationResult.parts.find((part) => part.id === id) ?? null;
}

export function classificationPartMetadata(classificationResult, key) {
  return Object.fromEntries(
    classificationResult.parts.map((part) => [part.id, part[key] ?? null]),
  );
}

export function classificationPartSeverity(part) {
  if (!Number.isFinite(part?.ratio) || !isFinitePositive(part?.limits?.class3)) {
    return 0;
  }

  return part.ratio / part.limits.class3;
}

export function classificationSeverity(classificationResult) {
  return Math.max(
    ...classificationResult.parts.map((part) => classificationPartSeverity(part)),
    0,
  );
}

export function classificationActionMagnitude(check) {
  return (
    Math.abs(check.metadata?.nEdSectionUnits ?? check.metadata?.nEd ?? 0) +
    Math.abs(check.metadata?.mEdSectionUnits ?? check.metadata?.mEd ?? 0)
  );
}

export function isMoreSevereGroupedCheck(candidate, current) {
  if (!current) {
    return true;
  }

  if (candidate.id === "steel-section-classification") {
    const candidateClass = candidate.metadata?.sectionClass ?? 0;
    const currentClass = current.metadata?.sectionClass ?? 0;

    if (candidateClass !== currentClass) {
      return candidateClass > currentClass;
    }

    const candidateSeverity = candidate.metadata?.classificationSeverity ?? 0;
    const currentSeverity = current.metadata?.classificationSeverity ?? 0;

    if (candidateSeverity !== currentSeverity) {
      return candidateSeverity > currentSeverity;
    }

    return classificationActionMagnitude(candidate) > classificationActionMagnitude(current);
  }

  return candidate.utilizationRatio > current.utilizationRatio;
}

export function resultEntries(resultMap = {}) {
  return Object.values(resultMap ?? {});
}

export function normalizeLimitState(limitState) {
  return String(limitState ?? "").trim().toUpperCase();
}

export function normalizeCombinationType(combinationType) {
  return String(combinationType ?? "").trim().toUpperCase().replaceAll("-", "_");
}

export function steelSectionModulus(section, type = "elastic", axis = "Y") {
  const normalizedAxis = String(axis).toUpperCase();
  const keys =
    type === "plastic"
      ? normalizedAxis === "Z"
        ? ["Wpl_z", "Wpl_weak"]
        : ["Wpl_y", "Wpl_strong"]
      : normalizedAxis === "Z"
        ? ["Wel_z", "Wel_weak"]
        : ["Wel_y", "Wel_strong"];

  for (const key of keys) {
    const value = section.convertedCatalogProperties?.[key];

    if (Number.isFinite(value)) {
      return value;
    }

    const rawValue = section.catalogProperties?.[key];

    if (Number.isFinite(rawValue) && section.metadata?.catalogUnitSystem) {
      return createUnitResolver(
        section.metadata.catalogUnitSystem,
        DEFAULT_SECTION_UNITS,
      ).sectionModulus(rawValue);
    }
  }

  if (type === "plastic") {
    return normalizedAxis === "Z"
      ? section.plasticSectionModulusZ
      : section.plasticSectionModulusY;
  }

  return normalizedAxis === "Z"
    ? section.elasticSectionModulusZ
    : section.elasticSectionModulusY;
}

export function selectBendingResistanceBasis({
  classificationResult,
  elasticSectionModulus,
  plasticSectionModulus,
  allowPlasticResistance = true,
}) {
  const sectionClass = classificationResult.class ?? 4;

  if (
    allowPlasticResistance &&
    sectionClass <= 2 &&
    isFinitePositive(plasticSectionModulus)
  ) {
    return {
      basis: "plastic",
      sectionModulus: plasticSectionModulus,
      warning: null,
    };
  }

  if (
    allowPlasticResistance &&
    sectionClass <= 2 &&
    !isFinitePositive(plasticSectionModulus)
  ) {
    return {
      basis: "elastic",
      sectionModulus: elasticSectionModulus,
      warning:
        "Plastic bending resistance was requested for class 1/2 steel section, but Wpl is not available; elastic modulus is used.",
    };
  }

  return {
    basis: sectionClass === 3 ? "elastic-class-3" : "elastic",
    sectionModulus: elasticSectionModulus,
    warning: null,
  };
}

export function steelShearArea(section) {
  return section.shearAreaY ?? section.area;
}

export function createDeflectionChecks({
  analysisResult,
  deflectionLimitRatio,
}) {
  const checks = [];

  for (const result of resultEntries(analysisResult.combinations)) {
    if (normalizeLimitState(result.context?.limitState) !== "SLE") {
      continue;
    }

    const span = result.geometry?.length ?? result.geometry?.horizontalSpan;
    const maxDeflection = result.displacements?.maxAbsVerticalDisplacement;
    const demand = Math.abs(maxDeflection?.uy ?? 0);
    const capacity =
      isFinitePositive(span) && isFinitePositive(deflectionLimitRatio)
        ? span / deflectionLimitRatio
        : null;

    if (!isFinitePositive(capacity)) {
      continue;
    }

    checks.push(
      utilizationCheck({
        id: "steel-sle-deflection",
        description: "Steel beam vertical deflection in service",
        demand,
        capacity,
        metadata: {
          method: "ntc2018-4.2.4.2.1-screening",
          resultId: result.id,
          resultType: result.resultType,
          limitState: result.context?.limitState ?? null,
          combinationType: normalizeCombinationType(result.context?.combinationType),
          station: round(maxDeflection?.station),
          span: round(span),
          deflectionLimitRatio,
          maxAbsDeflection: round(demand),
        },
      }),
    );
  }

  return checks;
}

export function lateralTorsionalBucklingOptions(stability = {}) {
  return stability.lateralTorsionalBuckling ?? stability.ltb ?? {};
}

export function isLtbEnabled(options = {}) {
  return options.enabled !== false && options.restrained !== true;
}

export function ltbOptionValue(segment, options, keys, fallback = null) {
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

export function createLtbSegments({ result, options }) {
  const span = result.geometry?.length ?? result.geometry?.horizontalSpan;
  const rawSegments = options.segments ?? options.unbracedSegments;

  if (Array.isArray(rawSegments) && rawSegments.length > 0) {
    return rawSegments.map((segment, index) => {
      const from = segment.from ?? segment.start ?? 0;
      const to = segment.to ?? segment.end ?? span;
      const length = segment.length ?? (Number.isFinite(to) && Number.isFinite(from) ? to - from : null);

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
      length: options.unbracedLength ?? span,
    },
  ];
}

export function sampleInSegment(sample, segment) {
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

export function sampleStrongAxisMoment(sample) {
  return sample?.principalActions?.mY ?? sample?.mY ?? sample?.m ?? 0;
}

export function maxAbsMomentSample(samples, segment) {
  return samples
    .filter((sample) => sampleInSegment(sample, segment))
    .reduce((selected, sample) => {
      if (!selected || Math.abs(sampleStrongAxisMoment(sample)) > Math.abs(sampleStrongAxisMoment(selected))) {
        return sample;
      }

      return selected;
    }, null);
}

export function ltbOptionMomentToSectionUnits(value, resultToSectionUnits) {
  return Number.isFinite(value) ? resultToSectionUnits.moment(value) : null;
}

export function optionValue(options, keys, fallback = null) {
  for (const key of keys) {
    if (options?.[key] != null) {
      return options[key];
    }
  }

  return fallback;
}

export function compressionBucklingOptions(stability = {}) {
  return stability.compressionBuckling ?? stability.buckling ?? {};
}

export function beamColumnInteractionOptions(stability = {}) {
  return stability.beamColumnInteraction ?? stability.interaction ?? {};
}

export function isCompressionBucklingEnabled(options = {}) {
  return options.enabled !== false;
}

export function isBeamColumnInteractionEnabled(options = {}) {
  return options.enabled !== false;
}

export function compressionAxialForce(nEd, convention = "absolute") {
  if (!Number.isFinite(nEd)) {
    return 0;
  }

  if (convention === "compression-positive") {
    return Math.max(nEd, 0);
  }

  if (convention === "compression-negative") {
    return Math.max(-nEd, 0);
  }

  return Math.abs(nEd);
}

export function supportAtStation(supports, station, tolerance) {
  return supports.find((support) =>
    Number.isFinite(support.station) &&
    Math.abs(support.station - station) <= tolerance,
  );
}

export function inferCompressionBucklingLengthFactor(result) {
  const span = result.geometry?.length ?? result.geometry?.horizontalSpan;

  if (!isFinitePositive(span)) {
    return {
      factor: 1,
      source: "default-factor-no-span",
    };
  }

  const supports = result.supports ?? [];
  const tolerance = Math.max(Math.abs(span) * 1e-6, 1e-9);
  const start = supportAtStation(supports, 0, tolerance);
  const end = supportAtStation(supports, span, tolerance);
  const startFixed = start?.restraints?.rz === true;
  const endFixed = end?.restraints?.rz === true;

  if ((startFixed && !end) || (endFixed && !start)) {
    return {
      factor: 2,
      source: "inferred-cantilever-fixed-free",
    };
  }

  if (start && end) {
    if (startFixed && endFixed) {
      return {
        factor: 0.5,
        source: "inferred-fixed-fixed",
      };
    }

    if (startFixed || endFixed) {
      return {
        factor: 0.7,
        source: "inferred-fixed-pinned",
      };
    }

    return {
      factor: 1,
      source: "inferred-pinned-pinned",
    };
  }

  return {
    factor: 1,
    source: "default-member-length",
  };
}

export function resolveCompressionBucklingLengths({
  result,
  options,
  resultToSectionUnits,
}) {
  const span = result.geometry?.length ?? result.geometry?.horizontalSpan;
  const inference = inferCompressionBucklingLengthFactor(result);
  const lengthYRaw = optionValue(
    options,
    ["lengthY", "memberLengthY", "freeLengthY", "length", "memberLength", "freeLength"],
    span,
  );
  const lengthZRaw = optionValue(
    options,
    ["lengthZ", "memberLengthZ", "freeLengthZ", "length", "memberLength", "freeLength"],
    span,
  );
  const effectiveLengthYRaw = optionValue(
    options,
    ["effectiveLengthY", "bucklingLengthY", "l0Y", "LcrY"],
    null,
  );
  const effectiveLengthZRaw = optionValue(
    options,
    ["effectiveLengthZ", "bucklingLengthZ", "l0Z", "LcrZ"],
    null,
  );
  const factorY = optionValue(
    options,
    ["effectiveLengthFactorY", "kY", "factorY", "k"],
    inference.factor,
  );
  const factorZ = optionValue(
    options,
    ["effectiveLengthFactorZ", "kZ", "factorZ", "k"],
    inference.factor,
  );
  const lengthY =
    Number.isFinite(lengthYRaw) ? resultToSectionUnits.length(lengthYRaw) : null;
  const lengthZ =
    Number.isFinite(lengthZRaw) ? resultToSectionUnits.length(lengthZRaw) : null;
  const effectiveLengthY =
    Number.isFinite(effectiveLengthYRaw)
      ? resultToSectionUnits.length(effectiveLengthYRaw)
      : null;
  const effectiveLengthZ =
    Number.isFinite(effectiveLengthZRaw)
      ? resultToSectionUnits.length(effectiveLengthZRaw)
      : null;

  return {
    lengthY,
    lengthZ,
    effectiveLengthY,
    effectiveLengthZ,
    effectiveLengthFactorY: factorY,
    effectiveLengthFactorZ: factorZ,
    lengthYModelUnits: Number.isFinite(lengthYRaw) ? lengthYRaw : null,
    lengthZModelUnits: Number.isFinite(lengthZRaw) ? lengthZRaw : null,
    effectiveLengthYModelUnits: Number.isFinite(effectiveLengthYRaw)
      ? effectiveLengthYRaw
      : Number.isFinite(lengthYRaw) && Number.isFinite(factorY)
        ? lengthYRaw * factorY
        : null,
    effectiveLengthZModelUnits: Number.isFinite(effectiveLengthZRaw)
      ? effectiveLengthZRaw
      : Number.isFinite(lengthZRaw) && Number.isFinite(factorZ)
        ? lengthZRaw * factorZ
        : null,
    inferenceSource: inference.source,
  };
}

export function maxCompressionSample(samples, axialForceConvention) {
  return samples.reduce((selected, sample) => {
    const demand = compressionAxialForce(sample.n ?? 0, axialForceConvention);
    const selectedDemand = selected
      ? compressionAxialForce(selected.n ?? 0, axialForceConvention)
      : -1;

    if (demand > selectedDemand) {
      return sample;
    }

    return selected;
  }, null);
}

export function createLateralTorsionalBucklingChecks({
  analysisResult,
  section,
  material,
  resultToSectionUnits,
  sectionToResultUnits,
  stability = {},
  resistance = {},
  classification = {},
}) {
  const options = lateralTorsionalBucklingOptions(stability);
  const checks = [];
  const warnings = [];
  const assumptions = [];

  if (!isLtbEnabled(options)) {
    assumptions.push("Lateral-torsional buckling check is disabled because the beam is declared restrained or ltb.enabled is false.");
    return {
      checks,
      warnings,
      assumptions,
      status: RESULT_STATUS.OK,
    };
  }

  assumptions.push(
    "Lateral-torsional buckling is checked on ULS FEM bending maxima for declared unbraced segments; automatic Mcr is available for I/H and RHS profiles, while CHS/SHS/ROUND are treated as not susceptible to the classic LTB check.",
  );

  for (const result of resultEntries(analysisResult.combinations)) {
    if (normalizeLimitState(result.context?.limitState) !== "ULS") {
      continue;
    }

    for (const segment of createLtbSegments({ result, options })) {
      const sample = maxAbsMomentSample(result.internalForces?.samples ?? [], segment);
      const unbracedLength = resultToSectionUnits.length(segment.length);

      if (!sample) {
        warnings.push(
          `No FEM internal-force sample was found for LTB segment ${segment.id}.`,
        );
        continue;
      }

      if (!isFinitePositive(unbracedLength)) {
        warnings.push(
          `LTB segment ${segment.id} requires a positive unbraced length.`,
        );
        continue;
      }

      const strongAxisMoment = sampleStrongAxisMoment(sample);
      const weakAxisMoment = sample.principalActions?.mZ ?? sample.mZ ?? 0;
      const mEdSectionUnits = resultToSectionUnits.moment(strongAxisMoment);
      const mzEdSectionUnits = resultToSectionUnits.moment(weakAxisMoment);
      const nEdSectionUnits = resultToSectionUnits.force(sample.n ?? 0);
      const classificationResult = classifySteelSection({
        section,
        material,
        nEd: nEdSectionUnits,
        mEd: mEdSectionUnits,
        mzEd: mzEdSectionUnits,
        axialForceConvention:
          classification.axialForceConvention ?? "absolute",
      });
      const elasticSectionModulus = steelSectionModulus(section, "elastic");
      const plasticSectionModulus = steelSectionModulus(section, "plastic");
      const bendingResistanceBasis = selectBendingResistanceBasis({
        classificationResult,
        elasticSectionModulus,
        plasticSectionModulus,
        allowPlasticResistance: resistance.allowPlastic !== false,
      });
      const criticalMoment = ltbOptionMomentToSectionUnits(
        ltbOptionValue(segment, options, ["criticalMoment", "mCr"]),
        resultToSectionUnits,
      );
      const ltbResult = verifySteelLateralTorsionalBuckling({
        section,
        material,
        mEd: mEdSectionUnits,
        sectionClass: classificationResult.class,
        bendingSectionModulus: bendingResistanceBasis.sectionModulus,
        unbracedLength,
        criticalMoment,
        criticalMomentSource:
          criticalMoment
            ? ltbOptionValue(segment, options, ["criticalMomentSource", "mCrSource"], "user-provided")
            : null,
        gammaM1: ltbOptionValue(segment, options, ["gammaM1"]),
        curve: ltbOptionValue(segment, options, ["curve"]),
        imperfectionFactor: ltbOptionValue(segment, options, ["imperfectionFactor", "alphaLT"]),
        beta: ltbOptionValue(segment, options, ["beta"], 1),
        lambda0: ltbOptionValue(segment, options, ["lambda0", "lambdaLT0"], 0.2),
        fFactor: ltbOptionValue(segment, options, ["fFactor", "momentDistributionReduction"], 1),
        kChi: ltbOptionValue(segment, options, ["kChi"], 1),
        effectiveLengthFactor: ltbOptionValue(segment, options, ["effectiveLengthFactor", "k"], 1),
        warpingLengthFactor: ltbOptionValue(segment, options, ["warpingLengthFactor", "kw"], 1),
        momentGradientFactor: ltbOptionValue(segment, options, ["momentGradientFactor", "C1"], 1),
      });

      warnings.push(...ltbResult.warnings);

      if (!ltbResult.check) {
        warnings.push(
          `LTB verification was not generated for segment ${segment.id}.`,
        );
        continue;
      }

      checks.push({
        ...ltbResult.check,
        demand: round(Math.abs(strongAxisMoment)),
        capacity: round(sectionToResultUnits.moment(ltbResult.check.capacity)),
        metadata: {
          ...ltbResult.check.metadata,
          resultId: result.id,
          resultType: result.resultType,
          station: sample.station,
          limitState: result.context?.limitState ?? null,
          combinationType: normalizeCombinationType(result.context?.combinationType),
          segmentId: segment.id,
          segmentFrom: round(segment.from),
          segmentTo: round(segment.to),
          unbracedLength: round(segment.length),
          unbracedLengthSectionUnits: round(unbracedLength),
          mEd: round(strongAxisMoment),
          mzEd: round(weakAxisMoment),
          mEdSectionUnits: round(mEdSectionUnits),
          mzEdSectionUnits: round(mzEdSectionUnits),
          nEdSectionUnits: round(nEdSectionUnits),
          resistanceBasis: bendingResistanceBasis.basis,
          criticalMoment: round(sectionToResultUnits.moment(ltbResult.check.metadata.criticalMoment)),
          criticalMomentSectionUnits: ltbResult.check.metadata.criticalMoment,
        },
      });
    }
  }

  if (checks.length === 0) {
    warnings.push(
      "No lateral-torsional buckling check was generated; provide Mcr or valid I/H automatic-Mcr inputs, or disable LTB only for restrained beams.",
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

export function createCompressionBucklingChecks({
  analysisResult,
  section,
  material,
  resultToSectionUnits,
  sectionToResultUnits,
  stability = {},
  classification = {},
}) {
  const options = compressionBucklingOptions(stability);
  const checks = [];
  const warnings = [];
  const assumptions = [];

  if (!isCompressionBucklingEnabled(options)) {
    assumptions.push("Compression buckling check is disabled because compressionBuckling.enabled is false.");
    return {
      checks,
      warnings,
      assumptions,
      status: RESULT_STATUS.OK,
    };
  }

  assumptions.push(
    "Compression buckling uses NTC 2018 flexural buckling reductions about y and z; effective lengths default from the simple-beam supports and can be overridden.",
  );

  for (const result of resultEntries(analysisResult.combinations)) {
    if (normalizeLimitState(result.context?.limitState) !== "ULS") {
      continue;
    }

    const axialForceConvention =
      optionValue(options, ["axialForceConvention"], null) ??
      classification.axialForceConvention ??
      "absolute";
    const sample = maxCompressionSample(
      result.internalForces?.samples ?? [],
      axialForceConvention,
    );

    if (!sample) {
      warnings.push(
        `No FEM internal-force sample was found for compression buckling in result ${result.id}.`,
      );
      continue;
    }

    const lengths = resolveCompressionBucklingLengths({
      result,
      options,
      resultToSectionUnits,
    });
    const nEdSectionUnits = resultToSectionUnits.force(sample.n ?? 0);
    const strongAxisMoment = sampleStrongAxisMoment(sample);
    const weakAxisMoment = sample.principalActions?.mZ ?? sample.mZ ?? 0;
    const mEdSectionUnits = resultToSectionUnits.moment(strongAxisMoment);
    const mzEdSectionUnits = resultToSectionUnits.moment(weakAxisMoment);
    const classificationResult = classifySteelSection({
      section,
      material,
      nEd: nEdSectionUnits,
      mEd: mEdSectionUnits,
      mzEd: mzEdSectionUnits,
      axialForceConvention:
        classification.axialForceConvention ?? "absolute",
    });
    const bucklingResult = verifySteelCompressionBuckling({
      section,
      material,
      nEd: nEdSectionUnits,
      sectionClass: classificationResult.class,
      lengthY: lengths.lengthY,
      lengthZ: lengths.lengthZ,
      effectiveLengthY: lengths.effectiveLengthY,
      effectiveLengthZ: lengths.effectiveLengthZ,
      effectiveLengthFactorY: lengths.effectiveLengthFactorY,
      effectiveLengthFactorZ: lengths.effectiveLengthFactorZ,
      curveY: optionValue(options, ["curveY"]),
      curveZ: optionValue(options, ["curveZ"]),
      imperfectionFactorY: optionValue(options, ["imperfectionFactorY", "alphaY"]),
      imperfectionFactorZ: optionValue(options, ["imperfectionFactorZ", "alphaZ"]),
      gammaM1: optionValue(options, ["gammaM1"]),
      allowOpenSectionFlexuralBuckling: optionValue(
        options,
        ["allowOpenSectionFlexuralBuckling", "allowFlexuralOnlyOpenSections"],
        false,
      ),
      axialForceConvention,
    });

    warnings.push(...bucklingResult.warnings);

    if (!bucklingResult.check) {
      warnings.push(
        `Compression buckling verification was not generated for result ${result.id}.`,
      );
      continue;
    }

    checks.push({
      ...bucklingResult.check,
      demand: round(sectionToResultUnits.force(bucklingResult.check.demand)),
      capacity: round(sectionToResultUnits.force(bucklingResult.check.capacity)),
      metadata: {
        ...bucklingResult.check.metadata,
        resultId: result.id,
        resultType: result.resultType,
        station: sample.station,
        limitState: result.context?.limitState ?? null,
        combinationType: normalizeCombinationType(result.context?.combinationType),
        nEd: round(sample.n ?? 0),
        nEdSectionUnits: round(nEdSectionUnits),
        mEd: round(strongAxisMoment),
        mzEd: round(weakAxisMoment),
        mEdSectionUnits: round(mEdSectionUnits),
        lengthY: round(lengths.lengthYModelUnits),
        lengthZ: round(lengths.lengthZModelUnits),
        effectiveLengthY: round(lengths.effectiveLengthYModelUnits),
        effectiveLengthZ: round(lengths.effectiveLengthZModelUnits),
        lengthInferenceSource: lengths.inferenceSource,
        axisYResistance: round(sectionToResultUnits.force(bucklingResult.check.metadata.axisYResistance)),
        axisZResistance: round(sectionToResultUnits.force(bucklingResult.check.metadata.axisZResistance)),
        axisYResistanceSectionUnits: bucklingResult.check.metadata.axisYResistance,
        axisZResistanceSectionUnits: bucklingResult.check.metadata.axisZResistance,
      },
    });
  }

  if (checks.length === 0) {
    warnings.push(
      "No compression buckling check was generated; provide ULS FEM results and valid effective lengths or disable the check when not relevant.",
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

export function ltbReductionForInteraction({
  result,
  sample,
  section,
  material,
  resultToSectionUnits,
  sectionToResultUnits,
  stability,
  resistance,
  classification,
  classificationResult,
  bendingResistanceBasis,
}) {
  const options = lateralTorsionalBucklingOptions(stability);

  if (!isLtbEnabled(options)) {
    return {
      chiLT: 1,
      warnings: [],
      metadata: {
        chiLTSource: "ltb-disabled-or-restrained",
      },
    };
  }

  const segment =
    createLtbSegments({ result, options }).find((candidate) =>
      sampleInSegment(sample, candidate),
    ) ??
    createLtbSegments({ result, options })[0];
  const unbracedLength = resultToSectionUnits.length(segment?.length);

  if (!isFinitePositive(unbracedLength)) {
    return {
      chiLT: null,
      warnings: [`N+My interaction requires a positive LTB segment length for station ${sample.station}.`],
      metadata: {
        chiLTSource: "not-available",
      },
    };
  }

  const criticalMoment = ltbOptionMomentToSectionUnits(
    ltbOptionValue(segment, options, ["criticalMoment", "mCr"]),
    resultToSectionUnits,
  );
  const ltbResult = verifySteelLateralTorsionalBuckling({
    section,
    material,
    mEd: resultToSectionUnits.moment(sampleStrongAxisMoment(sample)),
    sectionClass: classificationResult.class,
    bendingSectionModulus: bendingResistanceBasis.sectionModulus,
    unbracedLength,
    criticalMoment,
    criticalMomentSource:
      criticalMoment
        ? ltbOptionValue(segment, options, ["criticalMomentSource", "mCrSource"], "user-provided")
        : null,
    gammaM1: ltbOptionValue(segment, options, ["gammaM1"]),
    curve: ltbOptionValue(segment, options, ["curve"]),
    imperfectionFactor: ltbOptionValue(segment, options, ["imperfectionFactor", "alphaLT"]),
    beta: ltbOptionValue(segment, options, ["beta"], 1),
    lambda0: ltbOptionValue(segment, options, ["lambda0", "lambdaLT0"], 0.2),
    fFactor: ltbOptionValue(segment, options, ["fFactor", "momentDistributionReduction"], 1),
    kChi: ltbOptionValue(segment, options, ["kChi"], 1),
    effectiveLengthFactor: ltbOptionValue(segment, options, ["effectiveLengthFactor", "k"], 1),
    warpingLengthFactor: ltbOptionValue(segment, options, ["warpingLengthFactor", "kw"], 1),
    momentGradientFactor: ltbOptionValue(segment, options, ["momentGradientFactor", "C1"], 1),
  });

  return {
    chiLT: ltbResult.check?.metadata?.chiLT ?? null,
    warnings: ltbResult.warnings,
    metadata: {
      chiLTSource: ltbResult.check ? "ltb-verification" : "not-available",
      segmentId: segment?.id ?? null,
      unbracedLength: round(segment?.length),
      unbracedLengthSectionUnits: round(unbracedLength),
      resistanceBasis: bendingResistanceBasis.basis,
      criticalMoment: ltbResult.check
        ? round(sectionToResultUnits.moment(ltbResult.check.metadata.criticalMoment))
        : null,
      criticalMomentSectionUnits: ltbResult.check?.metadata?.criticalMoment ?? null,
      criticalMomentSource: ltbResult.check?.metadata?.criticalMomentSource ?? null,
    },
  };
}

export function createBeamColumnInteractionChecks({
  analysisResult,
  section,
  material,
  resultToSectionUnits,
  sectionToResultUnits,
  stability = {},
  resistance = {},
  classification = {},
}) {
  const interactionOptions = beamColumnInteractionOptions(stability);
  const bucklingOptions = compressionBucklingOptions(stability);
  const checks = [];
  const warnings = [];
  const assumptions = [];

  if (!isBeamColumnInteractionEnabled(interactionOptions)) {
    assumptions.push("Steel beam-column interaction check is disabled because beamColumnInteraction.enabled is false.");
    return {
      checks,
      warnings,
      assumptions,
      status: RESULT_STATUS.OK,
    };
  }

  assumptions.push(
    "Steel beam-column stability interaction uses Circolare NTC 2018 Method B; Mz is included for supported doubly symmetric profiles, while torsion and torsional interactions are excluded.",
  );

  for (const result of resultEntries(analysisResult.combinations)) {
    if (normalizeLimitState(result.context?.limitState) !== "ULS") {
      continue;
    }

    const lengths = resolveCompressionBucklingLengths({
      result,
      options: { ...bucklingOptions, ...interactionOptions.compressionBuckling },
      resultToSectionUnits,
    });

    const samples = result.internalForces?.samples ?? [];
    const momentFactorY = calculateSteelMomentDiagramFactor(samples, "My");
    const momentFactorZ = calculateSteelMomentDiagramFactor(samples, "Mz");
    const useBiaxialInteraction = samples.some((sample) =>
      hasSignificantAction(
        resultToSectionUnits.moment(sample.principalActions?.mZ ?? sample.mZ ?? 0),
      ));

    for (const sample of samples) {
      const axialForceConvention =
        optionValue(interactionOptions, ["axialForceConvention"], null) ??
        optionValue(bucklingOptions, ["axialForceConvention"], null) ??
        classification.axialForceConvention ??
        "absolute";
      const nEdSectionUnits = resultToSectionUnits.force(sample.n ?? 0);
      const strongAxisMoment = sampleStrongAxisMoment(sample);
      const weakAxisMoment = sample.principalActions?.mZ ?? sample.mZ ?? 0;
      const mEdSectionUnits = resultToSectionUnits.moment(strongAxisMoment);
      const mzEdSectionUnits = resultToSectionUnits.moment(weakAxisMoment);
      const hasWeakAxisMomentDemand =
        useBiaxialInteraction || hasSignificantAction(mzEdSectionUnits);
      const classificationResult = classifySteelSection({
        section,
        material,
        nEd: nEdSectionUnits,
        mEd: mEdSectionUnits,
        mzEd: mzEdSectionUnits,
        axialForceConvention:
          classification.axialForceConvention ?? "absolute",
      });
      const elasticSectionModulus = steelSectionModulus(section, "elastic");
      const plasticSectionModulus = steelSectionModulus(section, "plastic");
      const elasticSectionModulusZ = steelSectionModulus(section, "elastic", "Z");
      const plasticSectionModulusZ = steelSectionModulus(section, "plastic", "Z");
      const bendingResistanceBasis = selectBendingResistanceBasis({
        classificationResult,
        elasticSectionModulus,
        plasticSectionModulus,
        allowPlasticResistance: resistance.allowPlastic !== false,
      });
      const bendingResistanceBasisZ = selectBendingResistanceBasis({
        classificationResult,
        elasticSectionModulus: elasticSectionModulusZ,
        plasticSectionModulus: plasticSectionModulusZ,
        allowPlasticResistance: resistance.allowPlastic !== false,
      });
      const compressionBucklingResult = verifySteelCompressionBuckling({
        section,
        material,
        nEd: nEdSectionUnits,
        sectionClass: classificationResult.class,
        lengthY: lengths.lengthY,
        lengthZ: lengths.lengthZ,
        effectiveLengthY: lengths.effectiveLengthY,
        effectiveLengthZ: lengths.effectiveLengthZ,
        effectiveLengthFactorY: lengths.effectiveLengthFactorY,
        effectiveLengthFactorZ: lengths.effectiveLengthFactorZ,
        curveY: optionValue(interactionOptions, ["curveY"], null) ?? optionValue(bucklingOptions, ["curveY"]),
        curveZ: optionValue(interactionOptions, ["curveZ"], null) ?? optionValue(bucklingOptions, ["curveZ"]),
        imperfectionFactorY:
          optionValue(interactionOptions, ["imperfectionFactorY", "alphaY"], null) ??
          optionValue(bucklingOptions, ["imperfectionFactorY", "alphaY"]),
        imperfectionFactorZ:
          optionValue(interactionOptions, ["imperfectionFactorZ", "alphaZ"], null) ??
          optionValue(bucklingOptions, ["imperfectionFactorZ", "alphaZ"]),
        gammaM1:
          optionValue(interactionOptions, ["gammaM1"], null) ??
          optionValue(bucklingOptions, ["gammaM1"]),
        allowOpenSectionFlexuralBuckling:
          optionValue(
            interactionOptions,
            ["allowOpenSectionFlexuralBuckling", "allowFlexuralOnlyOpenSections"],
            null,
          ) ??
          optionValue(
            bucklingOptions,
            ["allowOpenSectionFlexuralBuckling", "allowFlexuralOnlyOpenSections"],
            false,
          ),
        axialForceConvention,
      });
      const ltbReduction = ltbReductionForInteraction({
        result,
        sample,
        section,
        material,
        resultToSectionUnits,
        sectionToResultUnits,
        stability,
        resistance,
        classification,
        classificationResult,
        bendingResistanceBasis,
      });
      const commonInteractionOptions = {
        section,
        material,
        nEd: nEdSectionUnits,
        myEd: mEdSectionUnits,
        sectionClass: classificationResult.class,
        compressionBucklingResult,
        chiLT: ltbReduction.chiLT,
        alphaMy: optionValue(interactionOptions, ["alphaMy", "momentFactorY", "cmy"], momentFactorY?.factor ?? 1),
        alphaMLT: optionValue(interactionOptions, ["alphaMLT", "momentFactorLT", "cmLT"], momentFactorY?.factor ?? 1),
        gammaM1:
          optionValue(interactionOptions, ["gammaM1"], null) ??
          optionValue(bucklingOptions, ["gammaM1"]),
        axialForceConvention,
        allowSinglySymmetric: optionValue(
          interactionOptions,
          ["allowSinglySymmetric", "allowUnsymmetric"],
          false,
        ),
      };
      const interactionResult = hasWeakAxisMomentDemand
        ? verifySteelBeamColumnInteractionMyMz({
            ...commonInteractionOptions,
            mzEd: mzEdSectionUnits,
            bendingSectionModulusY: bendingResistanceBasis.sectionModulus,
            bendingSectionModulusZ: bendingResistanceBasisZ.sectionModulus,
            alphaMz: optionValue(interactionOptions, ["alphaMz", "momentFactorZ", "cmz"], momentFactorZ?.factor ?? 1),
          })
        : verifySteelBeamColumnInteractionMy({
            ...commonInteractionOptions,
            bendingSectionModulus: bendingResistanceBasis.sectionModulus,
          });

      warnings.push(
        ...compressionBucklingResult.warnings,
        ...ltbReduction.warnings,
        ...interactionResult.warnings,
      );

      if (!interactionResult.check) {
        continue;
      }

      checks.push({
        ...interactionResult.check,
        metadata: {
          ...interactionResult.check.metadata,
          resultId: result.id,
          resultType: result.resultType,
          station: sample.station,
          limitState: result.context?.limitState ?? null,
          combinationType: normalizeCombinationType(result.context?.combinationType),
          nEd: round(sample.n ?? 0),
          nEdSectionUnits: round(nEdSectionUnits),
          myEd: round(strongAxisMoment),
          mzEd: round(weakAxisMoment),
          myEdSectionUnits: round(mEdSectionUnits),
          mzEdSectionUnits: round(mzEdSectionUnits),
          lengthY: round(lengths.lengthYModelUnits),
          lengthZ: round(lengths.lengthZModelUnits),
          effectiveLengthY: round(lengths.effectiveLengthYModelUnits),
          effectiveLengthZ: round(lengths.effectiveLengthZModelUnits),
          lengthInferenceSource: lengths.inferenceSource,
          resistanceBasis: bendingResistanceBasis.basis,
          resistanceBasisZ: bendingResistanceBasisZ.basis,
          momentDiagramFactorY: momentFactorY?.factor ?? 1,
          momentDiagramPsiY: momentFactorY?.psi ?? null,
          momentDiagramFactorYSource: momentFactorY?.source ?? "default-uniform-moment",
          momentDiagramFactorZ: momentFactorZ?.factor ?? 1,
          momentDiagramPsiZ: momentFactorZ?.psi ?? null,
          momentDiagramFactorZSource: momentFactorZ?.source ?? "default-uniform-moment",
          ...ltbReduction.metadata,
        },
      });
    }
  }

  if (checks.length === 0) {
    warnings.push(
      "No steel beam-column interaction check was generated; Method B needs ULS FEM samples, class 1-3 section, compression buckling data, chiLT and section moduli.",
    );
  }

  return {
    checks,
    warnings: uniqueStrings(warnings),
    assumptions,
    status:
      checks.length > 0 &&
      checks.every((check) => check.ok)
        ? RESULT_STATUS.OK
        : RESULT_STATUS.NOT_VERIFIED,
  };
}

export function createSteelActionVerifier({
  section,
  material,
  sectionToResultUnits,
  resultToSectionUnits,
  gammaM0,
  classification = {},
  resistance = {},
}) {
  return {
    verifySectionActions({ nEd, vEd, mEd, principalActions, context }) {
      const metadata = context.sectionProperties?.metadata ?? {};
      const resolvedGammaM0 = gammaM0 ?? metadata.gammaM0 ?? material.metadata?.gammaM0 ?? 1.05;
      const fyd = metadata.fyd ?? designStrength(material, resolvedGammaM0);
      const elasticSectionModulus = steelSectionModulus(section, "elastic", "Y");
      const plasticSectionModulus = steelSectionModulus(section, "plastic", "Y");
      const elasticSectionModulusZ = steelSectionModulus(section, "elastic", "Z");
      const plasticSectionModulusZ = steelSectionModulus(section, "plastic", "Z");
      const shearArea = steelShearArea(section);
      const shearAreaZ = section.shearAreaZ ?? section.area;
      const elasticMomentResistance =
        metadata.elasticMomentResistance ??
        (Number.isFinite(fyd) && Number.isFinite(elasticSectionModulus)
          ? fyd * elasticSectionModulus
          : null);
      const plasticMomentResistance =
        metadata.plasticMomentResistance ??
        (Number.isFinite(fyd) && Number.isFinite(plasticSectionModulus)
          ? fyd * plasticSectionModulus
          : null);
      const shearResistance =
        metadata.shearResistance ??
        (Number.isFinite(fyd) && Number.isFinite(shearArea)
          ? (fyd * shearArea) / Math.sqrt(3)
          : null);
      const axialResistance =
        Number.isFinite(fyd) && Number.isFinite(section.area)
          ? fyd * section.area
          : null;
      const shearResistanceZ =
        Number.isFinite(fyd) && Number.isFinite(shearAreaZ)
          ? (fyd * shearAreaZ) / Math.sqrt(3)
          : null;
      const shearCapacity = sectionToResultUnits.force(shearResistance);
      const shearCapacityZ = sectionToResultUnits.force(shearResistanceZ);
      const axialCapacity = sectionToResultUnits.force(axialResistance);
      const convertedNEd = resultToSectionUnits.force(nEd ?? 0);
      const mYEd = principalActions?.mY ?? mEd ?? 0;
      const mZEd = principalActions?.mZ ?? 0;
      const vYEd = principalActions?.vY ?? vEd ?? 0;
      const vZEd = principalActions?.vZ ?? 0;
      const convertedVEd = resultToSectionUnits.force(vYEd);
      const convertedVZEd = resultToSectionUnits.force(vZEd);
      const convertedMEd = resultToSectionUnits.moment(mYEd);
      const convertedMZEd = resultToSectionUnits.moment(mZEd);
      const classificationResult = classifySteelSection({
        section,
        material,
        nEd: convertedNEd,
        mEd: convertedMEd,
        mzEd: convertedMZEd,
        axialForceConvention:
          classification.axialForceConvention ?? "absolute",
      });
      const bendingResistanceBasis = selectBendingResistanceBasis({
        classificationResult,
        elasticSectionModulus,
        plasticSectionModulus,
        allowPlasticResistance: resistance.allowPlastic !== false,
      });
      const bendingResistance =
        bendingResistanceBasis.basis === "plastic"
          ? plasticMomentResistance
          : elasticMomentResistance;
      const flangePart = classificationPartById(classificationResult, "flange");
      const webPart = classificationPartById(classificationResult, "web");
      const classificationCheck = {
        id: "steel-section-classification",
        description: "Local steel section classification for the current N-M state",
        demand: classificationResult.class,
        capacity: 3,
        utilizationRatio:
          classificationResult.class > 3
            ? round(classificationResult.class / 3)
            : 0,
        ok:
          classificationResult.status === RESULT_STATUS.OK &&
          classificationResult.class <= 3,
        metadata: {
          method: classificationResult.metadata?.method,
          sectionClass: classificationResult.class,
          profileName: classificationResult.profileName,
          family: classificationResult.family,
          epsilon: classificationResult.epsilon,
          axialForceConvention:
            classificationResult.metadata?.axialForceConvention,
          axialCompressionForce:
            classificationResult.metadata?.axialCompressionForce,
          nEd: round(nEd ?? 0),
          mEd: round(mYEd ?? 0),
          mzEd: round(mZEd ?? 0),
          nEdSectionUnits: classificationResult.metadata?.nEd,
          mEdSectionUnits: classificationResult.metadata?.mEd,
          mzEdSectionUnits: round(convertedMZEd),
          classificationSeverity: round(classificationSeverity(classificationResult)),
          flangeClass: flangePart?.class ?? null,
          webClass: webPart?.class ?? null,
          flangeRatio: flangePart?.ratio ?? null,
          webRatio: webPart?.ratio ?? null,
          webAlpha: webPart?.metadata?.alpha ?? null,
          webPsi: webPart?.metadata?.psi ?? null,
          partClasses: classificationPartMetadata(classificationResult, "class"),
          partRatios: classificationPartMetadata(classificationResult, "ratio"),
        },
      };
      if (classificationResult.class > 3) {
        const unsupported = steelNotSupportedCheck({
          id: "steel-class-4-effective-properties",
          description: "Class 4 effective properties and stability",
          missingInputs: [
            "effective area Aeff",
            "effective section moduli Weff,y/Weff,z",
            "neutral-axis shift",
            "plate buckling reduction factors",
          ],
          reference: "NTC 2018 §4.2.4.1.2.2; UNI EN 1993-1-5 §4",
        });
        return {
          status: RESULT_STATUS.NOT_SUPPORTED,
          utilizationRatio: null,
          demand: null,
          capacity: null,
          checks: [classificationCheck, unsupported],
          warnings: [
            ...classificationResult.warnings,
            ...unsupported.warnings,
          ],
          assumptions: [],
          metadata: {
            governingCheckId: unsupported.id,
            classification: classificationResult,
          },
        };
      }
      const axialStress = isFinitePositive(section.area)
        ? Math.abs(convertedNEd) / section.area
        : null;
      const bendingStress = isFinitePositive(bendingResistanceBasis.sectionModulus)
        ? Math.abs(convertedMEd) / bendingResistanceBasis.sectionModulus
        : null;
      const bendingResistanceBasisZ = selectBendingResistanceBasis({
        classificationResult,
        elasticSectionModulus: elasticSectionModulusZ,
        plasticSectionModulus: plasticSectionModulusZ,
        allowPlasticResistance: resistance.allowPlastic !== false,
      });
      const bendingResistanceZ =
        bendingResistanceBasisZ.basis === "plastic"
          ? Number.isFinite(fyd) && Number.isFinite(plasticSectionModulusZ)
            ? fyd * plasticSectionModulusZ
            : null
          : Number.isFinite(fyd) && Number.isFinite(elasticSectionModulusZ)
            ? fyd * elasticSectionModulusZ
            : null;
      const bendingStressZ = isFinitePositive(bendingResistanceBasisZ.sectionModulus)
        ? Math.abs(convertedMZEd) / bendingResistanceBasisZ.sectionModulus
        : null;
      const maxNormalStress =
        (axialStress ?? 0) + (bendingStress ?? 0) + (bendingStressZ ?? 0);
      const shearStress = isFinitePositive(shearArea)
        ? Math.abs(convertedVEd) / shearArea
        : null;
      const shearStressZ = isFinitePositive(shearAreaZ)
        ? Math.abs(convertedVZEd) / shearAreaZ
        : null;
      const equivalentStress =
        Number.isFinite(maxNormalStress) &&
        Number.isFinite(shearStress) &&
        Number.isFinite(shearStressZ)
          ? Math.sqrt(maxNormalStress ** 2 + 3 * (shearStress ** 2 + shearStressZ ** 2))
          : null;
      const bendingCapacity = sectionToResultUnits.moment(bendingResistance);
      const bendingCapacityZ = sectionToResultUnits.moment(bendingResistanceZ);
      const bendingRatioY =
        Number.isFinite(bendingCapacity) && bendingCapacity > 0
          ? Math.abs(mYEd) / bendingCapacity
          : Infinity;
      const bendingRatioZ =
        Number.isFinite(bendingCapacityZ) && bendingCapacityZ > 0
          ? Math.abs(mZEd) / bendingCapacityZ
          : Math.abs(mZEd) > 1e-12
            ? Infinity
            : 0;
      const bendingRatio = bendingRatioY + bendingRatioZ;
      const bendingCapacityForReport =
        Number.isFinite(bendingCapacity) && bendingCapacity > 0
          ? bendingCapacity
          : 1;
      const bendingDemandForReport =
        Number.isFinite(bendingCapacity) && bendingCapacity > 0
          ? bendingRatio * bendingCapacity
          : bendingRatio;
      const bending = {
        id: "steel-bending",
        description:
          "Biaxial bending resistance verification governed by section class",
        demand: round(bendingDemandForReport),
        capacity: round(bendingCapacityForReport),
        utilizationRatio: round(bendingRatio),
        ok: bendingRatio <= 1,
        metadata: {
          fyd: round(fyd),
          gammaM0: round(resolvedGammaM0),
          sectionClass: classificationResult.class,
          resistanceBasis: bendingResistanceBasis.basis,
          resistanceBasisZ: bendingResistanceBasisZ.basis,
          actionBasis: principalActions ? "principal-actions" : "global-actions",
          mYEd: round(mYEd),
          mZEd: round(mZEd),
          selectedSectionModulus: round(bendingResistanceBasis.sectionModulus),
          selectedSectionModulusZ: round(bendingResistanceBasisZ.sectionModulus),
          elasticSectionModulus: round(elasticSectionModulus),
          elasticSectionModulusZ: round(elasticSectionModulusZ),
          plasticSectionModulus: round(plasticSectionModulus),
          plasticSectionModulusZ: round(plasticSectionModulusZ),
          elasticMomentResistance: round(elasticMomentResistance),
          plasticMomentResistance: round(plasticMomentResistance),
          bendingCapacityY: round(bendingCapacity),
          bendingCapacityZ: round(bendingCapacityZ),
          utilizationRatioY: round(bendingRatioY),
          utilizationRatioZ: round(bendingRatioZ),
        },
      };
      const shearRatioY =
        Number.isFinite(shearCapacity) && shearCapacity > 0
          ? Math.abs(vYEd) / shearCapacity
          : Infinity;
      const shearRatioZ =
        Number.isFinite(shearCapacityZ) && shearCapacityZ > 0
          ? Math.abs(vZEd) / shearCapacityZ
          : Math.abs(vZEd) > 1e-12
            ? Infinity
            : 0;
      const shearRatio = shearRatioY + shearRatioZ;
      const shearCapacityForReport =
        Number.isFinite(shearCapacity) && shearCapacity > 0
          ? shearCapacity
          : 1;
      const shearDemandForReport =
        Number.isFinite(shearCapacity) && shearCapacity > 0
          ? shearRatio * shearCapacity
          : shearRatio;
      const shear = {
        id: "steel-shear",
        description: "Biaxial shear resistance verification",
        demand: round(shearDemandForReport),
        capacity: round(shearCapacityForReport),
        utilizationRatio: round(shearRatio),
        ok: shearRatio <= 1,
        metadata: {
          fyd: round(fyd),
          shearArea: round(shearArea),
          shearAreaY: round(shearArea),
          shearAreaZ: round(shearAreaZ),
          vYEd: round(vYEd),
          vZEd: round(vZEd),
          shearCapacityY: round(shearCapacity),
          shearCapacityZ: round(shearCapacityZ),
          utilizationRatioY: round(shearRatioY),
          utilizationRatioZ: round(shearRatioZ),
        },
      };
      const axial = utilizationCheck({
        id: "steel-axial",
        description: "Axial resistance verification",
          demand: nEd,
        capacity: axialCapacity,
        metadata: {
          fyd: round(fyd),
          area: round(section.area),
        },
      });
      const elasticStress = utilizationCheck({
        id: "steel-elastic-stress",
        description: "Normal-plus-shear stress screening with selected section modulus",
        demand: equivalentStress,
        capacity: fyd,
        metadata: {
          method: "selected-modulus-von-mises-section-stress-screening",
          fyd: round(fyd),
          axialStress: round(axialStress),
          bendingStress: round(bendingStress),
          bendingStressZ: round(bendingStressZ),
          maxNormalStress: round(maxNormalStress),
          shearStress: round(shearStress),
          shearStressZ: round(shearStressZ),
          equivalentStress: round(equivalentStress),
          area: round(section.area),
          resistanceBasis: bendingResistanceBasis.basis,
          selectedSectionModulus: round(bendingResistanceBasis.sectionModulus),
          elasticSectionModulus: round(elasticSectionModulus),
          shearArea: round(shearArea),
        },
      });
      const interactionRatio = axial.utilizationRatio + bending.utilizationRatio;
      const interaction = {
        id: "steel-axial-bending-interaction",
        description: "Linear axial-bending interaction",
        demand: round(interactionRatio),
        capacity: 1,
        utilizationRatio: round(interactionRatio),
        ok: interactionRatio <= 1,
        metadata: {
          axialUtilizationRatio: axial.utilizationRatio,
          bendingUtilizationRatio: bending.utilizationRatio,
        },
      };
      const checks = [
        classificationCheck,
        bending,
        shear,
        axial,
        elasticStress,
        interaction,
      ];
      const governing = governingCheck(checks);

      return {
        status: checks.every((check) => check.ok) ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
        utilizationRatio: governing?.utilizationRatio ?? null,
        demand: governing?.demand ?? null,
        capacity: governing?.capacity ?? null,
        checks,
        assumptions: [
          "Steel section bending resistance is governed by local section class: class 1/2 can use Wpl, class 3 uses Wel, class 4 is blocked until effective properties exist.",
          "Steel section classification is evaluated locally for each ULS FEM station.",
          "Axial force is treated as compression by absolute value for section classification unless a different convention is configured.",
        ],
        warnings: uniqueStrings([
          ...classificationResult.warnings,
          bendingResistanceBasis.warning,
        ]),
        metadata: {
          governingCheckId: governing?.id ?? null,
          classification: classificationResult,
        },
      };
    },
  };
}

