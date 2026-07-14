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
  validateSteelMemberFem3DResult,
  steelMemberFem3DToLegacyAnalysisResult,
} from "../fem/SteelMemberFem3DContract.js";
import {
  steelUnsupportedFeatureCatalog,
  verifySteelFem3DAdvanced,
} from "./SteelFem3DVerification.js";

import {
  DEFAULT_SECTION_UNITS,
  hasSignificantAction,
  designStrength,
  classificationPartById,
  classificationPartMetadata,
  classificationPartSeverity,
  classificationSeverity,
  classificationActionMagnitude,
  isMoreSevereGroupedCheck,
  resultEntries,
  normalizeLimitState,
  normalizeCombinationType,
  steelSectionModulus,
  selectBendingResistanceBasis,
  steelShearArea,
  createDeflectionChecks,
  lateralTorsionalBucklingOptions,
  isLtbEnabled,
  ltbOptionValue,
  createLtbSegments,
  sampleInSegment,
  sampleStrongAxisMoment,
  maxAbsMomentSample,
  ltbOptionMomentToSectionUnits,
  optionValue,
  compressionBucklingOptions,
  beamColumnInteractionOptions,
  isCompressionBucklingEnabled,
  isBeamColumnInteractionEnabled,
  compressionAxialForce,
  supportAtStation,
  inferCompressionBucklingLengthFactor,
  resolveCompressionBucklingLengths,
  maxCompressionSample,
  createLateralTorsionalBucklingChecks,
  createCompressionBucklingChecks,
  ltbReductionForInteraction,
  createBeamColumnInteractionChecks,
  createSteelActionVerifier,
} from "./SteelMemberVerificationPolicies.js";

export class SteelMemberVerification {
  constructor({
    code = "NTC2018",
    gammaM0 = null,
    serviceability = {},
    classification = {},
    resistance = {},
    stability = {},
    deflectionLimitRatio = null,
    verificationStations = null,
    metadata = {},
  } = {}) {
    this.code = code;
    this.gammaM0 = gammaM0;
    this.serviceability = { ...serviceability };
    this.classification = { ...classification };
    this.resistance = { ...resistance };
    this.stability = { ...stability };
    this.verificationStations = verificationStations;
    this.deflectionLimitRatio =
      deflectionLimitRatio ??
      serviceability.deflectionLimitRatio ??
      serviceability.deflection?.limitRatio ??
      250;
    this.metadata = { ...metadata };
  }

  verify({
    memberId = null,
    combinations = [],
    section = null,
    material = null,
    analysisResult = null,
    serviceability = this.serviceability,
    classification = this.classification,
    resistance = this.resistance,
    stability = this.stability,
    verificationStations = this.verificationStations,
    deflectionLimitRatio =
      serviceability.deflectionLimitRatio ??
      serviceability.deflection?.limitRatio ??
      this.deflectionLimitRatio,
  } = {}) {
    if (!section || !material || !analysisResult) {
      return new VerificationResult({
        applicationId: "steel-frames",
        status: RESULT_STATUS.NOT_IMPLEMENTED,
        summary: "Steel member verification workflow scaffolded.",
        checks: [],
        warnings: [
          "Resistance, stability, class and connection checks are not implemented yet.",
        ],
        metadata: {
          code: this.code,
          memberId,
          combinations: combinations.length,
          ...this.metadata,
        },
      });
    }

    const explicitFem3D = Boolean(
      analysisResult.fem3d ||
      Array.isArray(analysisResult.combinations) ||
      Object.values(analysisResult.combinations ?? {}).some(
        (combination) => Array.isArray(combination?.stations),
      )
    );
    const fem3DValidation = validateSteelMemberFem3DResult(analysisResult, {
      strict: explicitFem3D,
    });
    if (!fem3DValidation.ok) {
      const contractCheck = {
        id: "steel-fem-3d-contract",
        description: "Steel member FEM 3D input contract",
        demand: null,
        capacity: null,
        utilizationRatio: null,
        ok: null,
        status: RESULT_STATUS.NOT_SUPPORTED,
        metadata: {
          norm: "NTC 2018 / Circolare 2019",
          method: "steel-member-fem-3d-contract-v1",
          missingInputs: [...fem3DValidation.errors],
          reference: "NTC 2018 §4.2.4 and Circolare 2019 C4.2.4",
          combinationId: null,
          station: null,
          restraintAssumptions: null,
        },
        warnings: ["The FEM 3D result is incomplete; no member capacity has been calculated."],
        assumptions: [],
      };
      return new VerificationResult({
        applicationId: "steel-frames",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary: "Steel member verification not supported because the FEM 3D contract is incomplete.",
        checks: [contractCheck],
        warnings: contractCheck.warnings,
        outputs: {
          fem3d: fem3DValidation.value,
          contractValidation: {
            ok: false,
            errors: fem3DValidation.errors,
            warnings: fem3DValidation.warnings,
          },
          unsupportedFeatures: steelUnsupportedFeatureCatalog(),
        },
        metadata: {
          code: this.code,
          memberId,
          method: "steel-member-fem-3d-contract-v1",
          ...this.metadata,
        },
      });
    }

    const workingAnalysisResult = explicitFem3D
      ? steelMemberFem3DToLegacyAnalysisResult(fem3DValidation.value)
      : analysisResult;
    const contractMember = fem3DValidation.value.member;
    const contractCompression = {
      effectiveLengthY: contractMember.effectiveLengths.y,
      effectiveLengthZ: contractMember.effectiveLengths.z,
      effectiveLengthFactorY: contractMember.effectiveLengthFactors.y,
      effectiveLengthFactorZ: contractMember.effectiveLengthFactors.z,
    };
    const contractLtbSegments = contractMember.restraintSegments.length > 0
      ? contractMember.restraintSegments.map((segment) => ({
          ...segment,
          length: Number.isFinite(segment.to) && Number.isFinite(segment.from)
            ? segment.to - segment.from
            : null,
        }))
      : undefined;
    const resolvedStability = {
      ...stability,
      compressionBuckling: {
        ...contractCompression,
        ...(stability.compressionBuckling ?? stability.buckling ?? {}),
      },
      lateralTorsionalBuckling: {
        ...(contractLtbSegments ? { segments: contractLtbSegments } : {}),
        ...(stability.lateralTorsionalBuckling ?? stability.ltb ?? {}),
      },
      beamColumnInteraction: {
        compressionBuckling: contractCompression,
        ...(stability.beamColumnInteraction ?? stability.interaction ?? {}),
      },
    };

    const resultUnits = workingAnalysisResult.units;
    const sectionUnits = DEFAULT_SECTION_UNITS;
    const sectionToResultUnits = createUnitResolver(sectionUnits, resultUnits);
    const resultToSectionUnits = createUnitResolver(resultUnits, sectionUnits);
    const actionVerification = new BeamSectionActionVerifier({
      applicationId: "steel-frames",
      sectionVerifier: createSteelActionVerifier({
        section,
        material,
        sectionToResultUnits,
        resultToSectionUnits,
        gammaM0: this.gammaM0,
        classification,
        resistance,
      }),
      limitStates: "ULS",
      verificationStations,
    }).verify({ analysisResult: workingAnalysisResult });
    const deflectionChecks = createDeflectionChecks({
      analysisResult: workingAnalysisResult,
      deflectionLimitRatio,
    });
    const lateralTorsionalBuckling = createLateralTorsionalBucklingChecks({
      analysisResult: workingAnalysisResult,
      section,
      material,
      resultToSectionUnits,
      sectionToResultUnits,
      stability: resolvedStability,
      resistance,
      classification,
    });
    const compressionBuckling = createCompressionBucklingChecks({
      analysisResult: workingAnalysisResult,
      section,
      material,
      resultToSectionUnits,
      sectionToResultUnits,
      stability: resolvedStability,
      classification,
    });
    const beamColumnInteraction = createBeamColumnInteractionChecks({
      analysisResult: workingAnalysisResult,
      section,
      material,
      resultToSectionUnits,
      sectionToResultUnits,
      stability: resolvedStability,
      resistance,
      classification,
    });
    const class4Detected = actionVerification.checks.some(
      (check) => check.id === "steel-section-classification" && check.metadata?.sectionClass > 3,
    );
    const advanced = verifySteelFem3DAdvanced({
      contract: fem3DValidation.value,
      section,
      material,
      resultToSectionUnits,
      sectionToResultUnits,
      serviceability,
      resistance: { ...resistance, class4Detected },
      stability: resolvedStability,
    });
    const allChecks = [
      ...actionVerification.checks,
      ...lateralTorsionalBuckling.checks,
      ...compressionBuckling.checks,
      ...beamColumnInteraction.checks,
      ...deflectionChecks,
      ...advanced.checks,
      ...(class4Detected
        ? advanced.unsupportedFeatures.filter(
            (check) => check.id === "steel-class-4-effective-properties",
          )
        : []),
    ];
    const groupedChecks = Object.values(
      allChecks.reduce((acc, check) => {
        const current = acc[check.id];

        if (isMoreSevereGroupedCheck(check, current)) {
          acc[check.id] = check;
        }

        return acc;
      }, {}),
    );
    const governing = governingCheck(groupedChecks);
    const ulsOk = actionVerification.status === RESULT_STATUS.OK;
    const ltbOk = lateralTorsionalBuckling.status === RESULT_STATUS.OK;
    const compressionBucklingOk = compressionBuckling.status === RESULT_STATUS.OK;
    const beamColumnInteractionOk = beamColumnInteraction.status === RESULT_STATUS.OK;
    const sleOk =
      deflectionChecks.length === 0 ||
      deflectionChecks.every((check) => check.ok);
    const hasNotSupported =
      class4Detected ||
      advanced.status === RESULT_STATUS.NOT_SUPPORTED ||
      groupedChecks.some((check) => check.status === RESULT_STATUS.NOT_SUPPORTED);
    const uniformChecks = groupedChecks.map((check) => ({
      ...check,
      metadata: {
        norm: "NTC 2018 / Circolare 2019",
        combinationId:
          check.metadata?.combinationId ?? check.metadata?.resultId ?? null,
        station: check.metadata?.station ?? null,
        governingSegment:
          check.metadata?.governingSegment ?? check.metadata?.segmentId ?? null,
        restraintAssumptions:
          check.metadata?.restraintAssumptions ?? {
            sway: contractMember.frameClassification.sway,
            nonSway: contractMember.frameClassification.nonSway,
            effectiveLengths: { ...contractMember.effectiveLengths },
            effectiveLengthFactors: { ...contractMember.effectiveLengthFactors },
          },
        ...(check.metadata ?? {}),
      },
      warnings: [...(check.warnings ?? [])],
      assumptions: [...(check.assumptions ?? [])],
    }));

    return new VerificationResult({
      applicationId: "steel-frames",
      status: hasNotSupported
        ? RESULT_STATUS.NOT_SUPPORTED
        : ulsOk && ltbOk && compressionBucklingOk && beamColumnInteractionOk && sleOk && advanced.status === RESULT_STATUS.OK
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
      summary: "Steel member ULS section resistance, stability and SLE deflection verification from FEM beam results.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks: uniformChecks,
      outputs: {
        stationResultCount: actionVerification.outputs.stationResultCount,
        fem3d: fem3DValidation.value,
        contractValidation: {
          ok: fem3DValidation.ok,
          errors: [...fem3DValidation.errors],
          warnings: [...fem3DValidation.warnings],
        },
        uls: actionVerification.outputs,
        serviceability: {
          deflectionLimitRatio,
          checkCount: deflectionChecks.length,
          checks: deflectionChecks.map((check) => ({
            ...check,
            metadata: { ...check.metadata },
          })),
        },
        stability: {
          lateralTorsionalBuckling: {
            status: lateralTorsionalBuckling.status,
            checkCount: lateralTorsionalBuckling.checks.length,
            checks: lateralTorsionalBuckling.checks.map((check) => ({
              ...check,
              metadata: { ...check.metadata },
            })),
          },
          compressionBuckling: {
            status: compressionBuckling.status,
            checkCount: compressionBuckling.checks.length,
            checks: compressionBuckling.checks.map((check) => ({
              ...check,
              metadata: { ...check.metadata },
            })),
          },
          beamColumnInteraction: {
            status: beamColumnInteraction.status,
            checkCount: beamColumnInteraction.checks.length,
            checks: beamColumnInteraction.checks.map((check) => ({
              ...check,
              metadata: { ...check.metadata },
            })),
          },
        },
        advanced: {
          status: advanced.status,
          checks: advanced.checks.map((check) => ({
            ...check,
            metadata: { ...check.metadata },
          })),
        },
        vibration: advanced.vibration,
        unsupportedFeatures: advanced.unsupportedFeatures,
        governing: governing
          ? {
              utilizationRatio: governing.utilizationRatio,
              demand: governing.demand,
              capacity: governing.capacity,
              metadata: { ...governing.metadata },
            }
          : null,
      },
      warnings: uniqueStrings([
        ...(deflectionChecks.length === 0
          ? ["No SLE steel deflection check was generated because no SLE combination was found."]
          : []),
        "Section classification is included for supported catalog steel profiles, but effective class-4 section properties are not implemented yet.",
        ...(groupedChecks.some(
          (check) =>
            check.id === "steel-section-classification" &&
            check.metadata?.sectionClass === 4,
        )
          ? [
              "Steel section class 4 detected: effective section properties are required and are not implemented yet.",
            ]
          : []),
        ...lateralTorsionalBuckling.warnings,
        ...compressionBuckling.warnings,
        ...beamColumnInteraction.warnings,
        ...advanced.warnings,
        ...fem3DValidation.warnings,
        "Steel member stability excludes torsion and torsional interactions from Method B; N+My+Mz is available for supported doubly symmetric profiles.",
        "Warping torsion and bimoment are never approximated; uniform Saint-Venant torsion is checked only when the required section data are available.",
      ]),
      assumptions: [
        ...actionVerification.assumptions,
        ...lateralTorsionalBuckling.assumptions,
        ...compressionBuckling.assumptions,
        ...beamColumnInteraction.assumptions,
        `SLE vertical deflection limit defaults to L/${deflectionLimitRatio} unless overridden.`,
      ],
      metadata: {
        code: this.code,
        memberId,
        method: "steel-elastic-member-mvp",
        governingCheckId: governing?.id ?? null,
        deflectionLimitRatio,
        verificationStations,
        ...this.metadata,
      },
    });
  }
}
