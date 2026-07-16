import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { BeamSectionActionVerifier } from "../../../domain/beams/BeamSectionActionVerifier.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { CrackedSectionDeflectionAnalysis } from "../../rc-cracked-deflection/analysis/CrackedSectionDeflectionAnalysis.js";
import { ReinforcedConcreteSectionModel } from "../models/ReinforcedConcreteSectionModel.js";
import { ReinforcedConcreteServiceabilityVerification } from "./ReinforcedConcreteServiceabilityVerification.js";
import { ReinforcedConcreteSectionVerification } from "./ReinforcedConcreteSectionVerification.js";
import { ReinforcedConcreteShearVerification } from "./ReinforcedConcreteShearVerification.js";
import { ReinforcedConcreteTorsionVerification } from "./ReinforcedConcreteTorsionVerification.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

const DEFAULT_SECTION_UNITS = Object.freeze({ force: "N", length: "mm" });

function governingCheck(checks) {
  return checks.reduce((selected, check) => {
    if (!Number.isFinite(check.utilizationRatio)) {
      return selected;
    }

    if (!selected || check.utilizationRatio > selected.utilizationRatio) {
      return check;
    }

    return selected;
  }, null);
}

function hasSignificantAction(value, reference = 0, tolerance = 1e-9) {
  return Number.isFinite(value) &&
    Math.abs(value) > Math.max(tolerance, Math.abs(reference) * tolerance);
}

function compressedEdgeForMoment(mEd) {
  return mEd >= 0 ? "top" : "bottom";
}

function momentVectorCapacityFromDomain(points, mxEd, myEd) {
  const demandNorm = Math.sqrt(mxEd ** 2 + myEd ** 2);

  if (demandNorm <= 1e-9) {
    return {
      demandNorm: 0,
      capacityNorm: Infinity,
      utilizationRatio: 0,
      governingPoint: null,
    };
  }

  const ux = mxEd / demandNorm;
  const uy = myEd / demandNorm;
  const candidates = points
    .map((point) => ({
      point,
      projection: point.MxRd * ux + point.MyRd * uy,
    }))
    .filter((candidate) => Number.isFinite(candidate.projection) && candidate.projection > 0);
  const selected = candidates.reduce(
    (best, candidate) =>
      !best || candidate.projection > best.projection ? candidate : best,
    null,
  );

  return {
    demandNorm,
    capacityNorm: selected?.projection ?? null,
    utilizationRatio:
      selected?.projection && selected.projection > 0
        ? demandNorm / selected.projection
        : Infinity,
    governingPoint: selected?.point ?? null,
  };
}

function createRcActionVerifier({
  section,
  concreteMaterial,
  reinforcementMaterial,
  resultToSectionUnits,
  code,
  mesh,
  solver,
  shear = null,
  torsion = null,
}) {
  const sectionVerification = new ReinforcedConcreteSectionVerification({ code });
  const shearVerification = shear
    ? new ReinforcedConcreteShearVerification({ code })
    : null;
  const torsionVerification = torsion
    ? new ReinforcedConcreteTorsionVerification({ code, torsion, shear })
    : null;

  return {
    verifySectionActions({ nEd, vEd, mEd, tEd, principalActions, context }) {
      const convertedNEd = resultToSectionUnits.force(nEd ?? 0);
      const convertedVEd = resultToSectionUnits.force(
        principalActions?.vY ?? vEd ?? 0,
      );
      const convertedVZEd = resultToSectionUnits.force(
        principalActions?.vZ ?? 0,
      );
      const convertedMEd = resultToSectionUnits.moment(
        principalActions?.mY ?? mEd ?? 0,
      );
      const convertedMZEd = resultToSectionUnits.moment(
        principalActions?.mZ ?? 0,
      );
      const convertedTEd = resultToSectionUnits.moment(tEd ?? 0);
      const isBiaxial = Math.abs(convertedMZEd) > Math.max(1e-9, Math.abs(convertedMEd) * 1e-9);
      const hasWeakAxisShear = hasSignificantAction(convertedVZEd, convertedVEd);
      const model = new ReinforcedConcreteSectionModel({
        id: `${context.resultId ?? "beam"}-${Math.round((context.station ?? 0) * 1000)}`,
        section,
        materials: {
          concreteMaterial,
          reinforcementMaterial,
        },
        analysisType: isBiaxial ? "uls-biaxial-domain" : "uls-uniaxial-resistance",
        analysisSettings: {
          compressedEdge: compressedEdgeForMoment(convertedMEd),
          angleCount: context.biaxialAngleCount ?? 48,
        },
        mesh,
        solver,
        actions: {
          nEd: convertedNEd,
          mEd: convertedMEd,
          mxEd: convertedMEd,
          myEd: convertedMZEd,
        },
        units: DEFAULT_SECTION_UNITS,
        metadata: {
          sourceResultId: context.resultId ?? null,
          sourceStation: context.station ?? null,
        },
      });
      const result = sectionVerification.verify(model);
      const bendingChecks = isBiaxial
        ? (() => {
            const capacity = momentVectorCapacityFromDomain(
              result.outputs?.points ?? [],
              convertedMEd,
              convertedMZEd,
            );

            return [
              {
                id: "rc-uls-biaxial-bending",
                description: "Biaxial bending resistance at assigned axial force",
                demand: capacity.demandNorm,
                capacity: capacity.capacityNorm,
                utilizationRatio: capacity.utilizationRatio,
                ok: capacity.utilizationRatio <= 1,
                metadata: {
                  method: "sampled-biaxial-domain-projection",
                  mxEd: convertedMEd,
                  myEd: convertedMZEd,
                  angleCount: model.analysisSettings.angleCount,
                  governingPoint: capacity.governingPoint,
                },
              },
            ];
          })()
        : result.checks.map((check) => ({
            ...check,
            id: `rc-${check.id}`,
            metadata: {
              compressedEdge: model.analysisSettings.compressedEdge,
              ...check.metadata,
            },
          }));
      const torsionResult = torsionVerification?.verifySectionActions({
        tEd: convertedTEd,
        vEd: convertedVEd,
        nEd: convertedNEd,
        mEd: convertedMEd,
        context: {
          ...context,
          section,
          concreteMaterial,
          reinforcementMaterial,
          torsion,
          shear,
          units: DEFAULT_SECTION_UNITS,
        },
      });
      const shearForStation =
        shear && torsionResult?.outputs?.cotTheta != null
          ? {
              ...shear,
              thetaSelection: "fixed",
              cotTheta: torsionResult.outputs.cotTheta,
              torsionHandled: true,
            }
          : shear;
      const shearResult = shearVerification?.verifySectionActions({
        nEd: convertedNEd,
        vEd: convertedVEd,
        mEd: convertedMEd,
        context: {
          ...context,
          section,
          concreteMaterial,
          reinforcementMaterial,
          shear: shearForStation,
          units: DEFAULT_SECTION_UNITS,
        },
      });
      const checks = [
        ...bendingChecks,
        ...(shearResult?.checks ?? []),
        ...(torsionResult?.checks ?? []),
      ];
      const governing = governingCheck(checks);
      const statuses = [
        result.status,
        ...(shearResult ? [shearResult.status] : []),
        ...(torsionResult ? [torsionResult.status] : []),
      ];

      return {
        status:
          statuses.every((status) => status === RESULT_STATUS.OK)
            ? RESULT_STATUS.OK
            : RESULT_STATUS.NOT_VERIFIED,
        utilizationRatio: governing?.utilizationRatio ?? result.utilizationRatio,
        demand: governing?.demand ?? result.demand,
        capacity: governing?.capacity ?? result.capacity,
        checks,
        warnings: [
          ...result.warnings,
          ...(shearResult?.warnings ?? []),
          ...(torsionResult?.warnings ?? []),
          ...(hasWeakAxisShear
            ? [
                "RC shear verification uses the principal vY component; vZ from section rotation is reported and its effects are neglected in this MVP.",
              ]
            : []),
        ],
        assumptions: [
          ...result.assumptions,
          ...(shearResult?.assumptions ?? []),
          ...(torsionResult?.assumptions ?? []),
        ],
        metadata: {
          governingCheckId:
            governing?.id ??
            result.metadata?.governingCheckId ??
            "rc-uls-uniaxial-bending",
          compressedEdge: model.analysisSettings.compressedEdge,
          sectionResult: result.toJSON(),
          biaxial: isBiaxial,
          vYEd: convertedVEd,
          vZEd: convertedVZEd,
          tEd: convertedTEd,
          weakAxisShearVerified: !hasWeakAxisShear,
          weakAxisShearNeglected: hasWeakAxisShear,
          shearResult: shearResult
            ? {
                status: shearResult.status,
                utilizationRatio: shearResult.utilizationRatio,
                demand: shearResult.demand,
                capacity: shearResult.capacity,
                outputs: shearResult.outputs,
                metadata: shearResult.metadata,
              }
            : null,
          torsionResult: torsionResult
            ? {
                status: torsionResult.status,
                utilizationRatio: torsionResult.utilizationRatio,
                demand: torsionResult.demand,
                capacity: torsionResult.capacity,
                outputs: torsionResult.outputs,
                metadata: torsionResult.metadata,
              }
            : null,
        },
      };
    },
  };
}

function createRcServiceabilityActionVerifier({
  section,
  concreteMaterial,
  reinforcementMaterial,
  resultToSectionUnits,
  code,
  mesh,
  solver,
  serviceability = {},
}) {
  const serviceabilityVerification = new ReinforcedConcreteServiceabilityVerification({
    code,
    mesh,
    solver,
    serviceability,
  });

  return {
    verifySectionActions({ nEd, mEd, principalActions, context }) {
      const convertedNEd = resultToSectionUnits.force(nEd ?? 0);
      const convertedMEd = resultToSectionUnits.moment(
        principalActions?.mY ?? mEd ?? 0,
      );
      const convertedMZEd = resultToSectionUnits.moment(
        principalActions?.mZ ?? 0,
      );
      const hasWeakAxisMoment = hasSignificantAction(convertedMZEd, convertedMEd);
      const result = serviceabilityVerification.verifySectionActions({
        nEd: convertedNEd,
        mEd: convertedMEd,
        mxEd: convertedMEd,
        myEd: convertedMZEd,
        context: {
          ...context,
          section,
          concreteMaterial,
          reinforcementMaterial,
          serviceability,
          mesh,
          solver,
        },
      });

      return {
        ...result,
        warnings: [
          ...(result.warnings ?? []),
          ...(hasWeakAxisMoment
            ? [
                "RC SLE stress verification includes mZ from section rotation; indirect crack control uses only the primary mY component and neglects mZ effects.",
              ]
            : []),
        ],
        metadata: {
          ...(result.metadata ?? {}),
          mYEd: convertedMEd,
          mZEd: convertedMZEd,
          weakAxisServiceStressVerified: hasWeakAxisMoment,
          weakAxisMomentNeglectedInCrackControl: hasWeakAxisMoment,
        },
      };
    },
  };
}

export class ReinforcedConcreteBeamVerification {
  constructor({
    code = "NTC2018",
    mesh = { targetFiberCount: 80 },
    solver = { tolerance: 1e-6, maxIterations: 100 },
    shear = null,
    torsion = null,
    serviceability = {},
    verificationStations = null,
    metadata = {},
  } = {}) {
    this.code = code;
    this.mesh = { ...mesh };
    this.solver = { ...solver };
    this.shear = shear;
    this.torsion = torsion;
    this.serviceability = serviceability;
    this.verificationStations = verificationStations;
    this.metadata = { ...metadata };
  }

  verify({
    beamId = null,
    section = null,
    concreteMaterial = null,
    reinforcementMaterial = null,
    analysisResult = null,
    beamModel = null,
    mesh = this.mesh,
    solver = this.solver,
    shear = this.shear,
    torsion = this.torsion,
    serviceability = this.serviceability,
    verificationStations = this.verificationStations,
  } = {}) {
    if (!section || !analysisResult) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-beams",
        status: RESULT_STATUS.NOT_IMPLEMENTED,
        summary: "RC beam verification requires a section and a FEM beam analysis result.",
        warnings: [
          "RC beam verification from FEM actions was not run because required inputs are missing.",
        ],
        metadata: {
          code: this.code,
          beamId,
          ...this.metadata,
        },
      });
    }

    const resolvedConcreteMaterial = concreteMaterial ?? section.concreteMaterial;
    const resolvedReinforcementMaterial =
      reinforcementMaterial ?? section.reinforcementMaterial;
    const sectionUnits = section.metadata?.unitSystem ?? DEFAULT_SECTION_UNITS;
    const resultToSectionUnits = createUnitResolver(analysisResult.units, sectionUnits);
    const ulsVerification = new BeamSectionActionVerifier({
      applicationId: "reinforced-concrete-beams",
      sectionVerifier: createRcActionVerifier({
        section,
        concreteMaterial: resolvedConcreteMaterial,
        reinforcementMaterial: resolvedReinforcementMaterial,
        resultToSectionUnits,
        code: this.code,
        mesh,
        solver,
        shear,
        torsion,
      }),
      limitStates: "ULS",
      verificationStations,
    }).verify({ analysisResult });
    const serviceabilityVerification =
      serviceability === false
        ? null
        : new BeamSectionActionVerifier({
            applicationId: "reinforced-concrete-beams",
            sectionVerifier: createRcServiceabilityActionVerifier({
              section,
              concreteMaterial: resolvedConcreteMaterial,
              reinforcementMaterial: resolvedReinforcementMaterial,
              resultToSectionUnits,
              code: this.code,
              mesh,
              solver: {
                tolerance: solver?.serviceTolerance ?? 1e-2,
                maxIterations: solver?.serviceMaxIterations ?? 50,
                finiteDifferenceStep: solver?.finiteDifferenceStep ?? 1e-8,
              },
              serviceability,
            }),
            limitStates: "SLE",
            verificationStations,
          }).verify({ analysisResult });
    const deflectionVerification =
      serviceability === false || serviceability?.deflection === false
        ? null
        : new CrackedSectionDeflectionAnalysis({
            code: this.code,
          }).analyze({
            beamId,
            analysisResult,
            section,
            concreteMaterial: resolvedConcreteMaterial,
            reinforcementMaterial: resolvedReinforcementMaterial,
            serviceability,
            mesh,
            solver: {
              tolerance: solver?.serviceTolerance ?? 1e-2,
              maxIterations: solver?.serviceMaxIterations ?? 50,
              finiteDifferenceStep: solver?.finiteDifferenceStep ?? 1e-8,
            },
            beamModel,
          });
    const includeDeflection =
      deflectionVerification &&
      deflectionVerification.outputs?.combinationCount > 0;
    const actionVerification =
      serviceabilityVerification &&
      serviceabilityVerification.outputs.stationResultCount > 0
        ? {
            status:
              ulsVerification.status === RESULT_STATUS.OK &&
              serviceabilityVerification.status === RESULT_STATUS.OK &&
              (!includeDeflection || deflectionVerification.status === RESULT_STATUS.OK)
                ? RESULT_STATUS.OK
                : RESULT_STATUS.NOT_VERIFIED,
            utilizationRatio: Math.max(
              ulsVerification.utilizationRatio ?? 0,
              serviceabilityVerification.utilizationRatio ?? 0,
              includeDeflection ? deflectionVerification.utilizationRatio ?? 0 : 0,
            ),
            demand: null,
            capacity: null,
            checks: [
              ...ulsVerification.checks,
              ...serviceabilityVerification.checks,
              ...(includeDeflection ? deflectionVerification.checks : []),
            ],
            outputs: {
              stationResultCount:
                ulsVerification.outputs.stationResultCount +
                serviceabilityVerification.outputs.stationResultCount,
              uls: ulsVerification.outputs,
              serviceability: serviceabilityVerification.outputs,
              deflection: includeDeflection
                ? {
                    status: deflectionVerification.status,
                    utilizationRatio: deflectionVerification.utilizationRatio,
                    outputs: deflectionVerification.outputs,
                    metadata: deflectionVerification.metadata,
                  }
                : null,
              governing:
                [
                  ulsVerification,
                  serviceabilityVerification,
                  ...(includeDeflection ? [deflectionVerification] : []),
                ].reduce((selected, candidate) => {
                  if (!Number.isFinite(candidate.utilizationRatio)) {
                    return selected;
                  }

                  if (!selected || candidate.utilizationRatio > selected.utilizationRatio) {
                    return {
                      utilizationRatio: candidate.utilizationRatio,
                      demand: candidate.demand,
                      capacity: candidate.capacity,
                      metadata:
                        candidate.outputs?.governing?.metadata ??
                        candidate.metadata ??
                        {},
                    };
                  }

                  return selected;
                }, null),
            },
            warnings: [
              ...ulsVerification.warnings,
              ...serviceabilityVerification.warnings,
              ...(includeDeflection ? deflectionVerification.warnings : []),
            ],
            assumptions: [
              ...ulsVerification.assumptions,
              ...serviceabilityVerification.assumptions,
              ...(includeDeflection ? deflectionVerification.assumptions : []),
            ],
          }
        : {
            ...ulsVerification,
            outputs: {
              ...ulsVerification.outputs,
              uls: ulsVerification.outputs,
              serviceability: null,
              deflection: includeDeflection
                ? {
                    status: deflectionVerification.status,
                    utilizationRatio: deflectionVerification.utilizationRatio,
                    outputs: deflectionVerification.outputs,
                    metadata: deflectionVerification.metadata,
                  }
                : null,
            },
          };
    const groupedChecks = Object.values(
      actionVerification.checks.reduce((acc, check) => {
        const current = acc[check.id];

        if (!current || check.utilizationRatio > current.utilizationRatio) {
          acc[check.id] = check;
        }

        return acc;
      }, {}),
    );
    const governing = governingCheck(groupedChecks);

    return new VerificationResult({
      applicationId: "reinforced-concrete-beams",
      status: actionVerification.status,
      summary:
        "RC beam ULS and SLE section verification from FEM beam actions.",
      utilizationRatio: governing?.utilizationRatio ?? actionVerification.utilizationRatio,
      demand: governing?.demand ?? actionVerification.demand,
      capacity: governing?.capacity ?? actionVerification.capacity,
      checks: groupedChecks,
      outputs: {
        stationResultCount: actionVerification.outputs.stationResultCount,
        uls: actionVerification.outputs.uls,
        serviceability: actionVerification.outputs.serviceability,
        deflection: actionVerification.outputs.deflection,
        governing: actionVerification.outputs.governing,
      },
      warnings: [
        ...actionVerification.warnings,
        ...(shear
          ? [
              torsion
                ? "Full member detailing and second-order effects are not included in this RC beam verification step."
                : "Torsion, full member detailing and second-order effects are not included in this RC beam verification step.",
            ]
          : [
              torsion
                ? "Shear resistance, full member detailing and second-order effects are not included in this RC beam verification step."
                : "Shear resistance, torsion, full member detailing and second-order effects are not included in this RC beam verification step.",
            ]),
      ],
      assumptions: [
        ...actionVerification.assumptions,
        "Each FEM station is checked as an independent RC section; ULS bending and SLE stress checks use biaxial actions when present, while crack control remains based on the primary bending plane.",
      ],
      metadata: {
        code: this.code,
        beamId,
        governingCheckId: governing?.id ?? null,
        verificationStations,
        ...this.metadata,
      },
    });
  }
}
