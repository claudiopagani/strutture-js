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

    const resultUnits = analysisResult.units;
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
    }).verify({ analysisResult });
    const deflectionChecks = createDeflectionChecks({
      analysisResult,
      deflectionLimitRatio,
    });
    const lateralTorsionalBuckling = createLateralTorsionalBucklingChecks({
      analysisResult,
      section,
      material,
      resultToSectionUnits,
      sectionToResultUnits,
      stability,
      resistance,
      classification,
    });
    const compressionBuckling = createCompressionBucklingChecks({
      analysisResult,
      section,
      material,
      resultToSectionUnits,
      sectionToResultUnits,
      stability,
      classification,
    });
    const beamColumnInteraction = createBeamColumnInteractionChecks({
      analysisResult,
      section,
      material,
      resultToSectionUnits,
      sectionToResultUnits,
      stability,
      resistance,
      classification,
    });
    const allChecks = [
      ...actionVerification.checks,
      ...lateralTorsionalBuckling.checks,
      ...compressionBuckling.checks,
      ...beamColumnInteraction.checks,
      ...deflectionChecks,
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

    return new VerificationResult({
      applicationId: "steel-frames",
      status:
        ulsOk && ltbOk && compressionBucklingOk && beamColumnInteractionOk && sleOk
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
      summary: "Steel member ULS section resistance, stability and SLE deflection verification from FEM beam results.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks: groupedChecks,
      outputs: {
        stationResultCount: actionVerification.outputs.stationResultCount,
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
        "Steel member stability excludes torsion and torsional interactions; N+My+Mz is available for supported doubly symmetric profiles.",
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
