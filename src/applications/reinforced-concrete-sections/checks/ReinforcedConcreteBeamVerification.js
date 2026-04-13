import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { BeamSectionActionVerifier } from "../../../domain/beams/BeamSectionActionVerifier.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { CrackedSectionDeflectionAnalysis } from "../../rc-cracked-deflection/analysis/CrackedSectionDeflectionAnalysis.js";
import { ReinforcedConcreteSectionModel } from "../models/ReinforcedConcreteSectionModel.js";
import { ReinforcedConcreteServiceabilityVerification } from "./ReinforcedConcreteServiceabilityVerification.js";
import { ReinforcedConcreteSectionVerification } from "./ReinforcedConcreteSectionVerification.js";
import { ReinforcedConcreteShearVerification } from "./ReinforcedConcreteShearVerification.js";

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

function compressedEdgeForMoment(mEd) {
  return mEd >= 0 ? "top" : "bottom";
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
}) {
  const sectionVerification = new ReinforcedConcreteSectionVerification({ code });
  const shearVerification = shear
    ? new ReinforcedConcreteShearVerification({ code })
    : null;

  return {
    verifySectionActions({ nEd, vEd, mEd, context }) {
      const convertedNEd = resultToSectionUnits.force(nEd ?? 0);
      const convertedVEd = resultToSectionUnits.force(vEd ?? 0);
      const convertedMEd = resultToSectionUnits.moment(mEd ?? 0);
      const model = new ReinforcedConcreteSectionModel({
        id: `${context.resultId ?? "beam"}-${Math.round((context.station ?? 0) * 1000)}`,
        section,
        materials: {
          concreteMaterial,
          reinforcementMaterial,
        },
        analysisType: "uls-uniaxial-resistance",
        analysisSettings: {
          compressedEdge: compressedEdgeForMoment(convertedMEd),
        },
        mesh,
        solver,
        actions: {
          nEd: convertedNEd,
          mEd: convertedMEd,
        },
        units: DEFAULT_SECTION_UNITS,
        metadata: {
          sourceResultId: context.resultId ?? null,
          sourceStation: context.station ?? null,
        },
      });
      const result = sectionVerification.verify(model);
      const bendingChecks = result.checks.map((check) => ({
        ...check,
        id: `rc-${check.id}`,
        metadata: {
          compressedEdge: model.analysisSettings.compressedEdge,
          ...check.metadata,
        },
      }));
      const shearResult = shearVerification?.verifySectionActions({
        nEd: convertedNEd,
        vEd: convertedVEd,
        mEd: convertedMEd,
        context: {
          ...context,
          section,
          concreteMaterial,
          reinforcementMaterial,
          shear,
          units: DEFAULT_SECTION_UNITS,
        },
      });
      const checks = [
        ...bendingChecks,
        ...(shearResult?.checks ?? []),
      ];
      const governing = governingCheck(checks);
      const statuses = [
        result.status,
        ...(shearResult ? [shearResult.status] : []),
      ];

      return {
        status: statuses.every((status) => status === "ok") ? "ok" : "not-verified",
        utilizationRatio: governing?.utilizationRatio ?? result.utilizationRatio,
        demand: governing?.demand ?? result.demand,
        capacity: governing?.capacity ?? result.capacity,
        checks,
        warnings: [
          ...result.warnings,
          ...(shearResult?.warnings ?? []),
        ],
        assumptions: [
          ...result.assumptions,
          ...(shearResult?.assumptions ?? []),
        ],
        metadata: {
          governingCheckId:
            governing?.id ??
            result.metadata?.governingCheckId ??
            "rc-uls-uniaxial-bending",
          compressedEdge: model.analysisSettings.compressedEdge,
          sectionResult: result.toJSON(),
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
    verifySectionActions({ nEd, mEd, context }) {
      const convertedNEd = resultToSectionUnits.force(nEd ?? 0);
      const convertedMEd = resultToSectionUnits.moment(mEd ?? 0);

      return serviceabilityVerification.verifySectionActions({
        nEd: convertedNEd,
        mEd: convertedMEd,
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
    },
  };
}

export class ReinforcedConcreteBeamVerification {
  constructor({
    code = "NTC2018",
    mesh = { targetFiberCount: 80 },
    solver = { tolerance: 1e-6, maxIterations: 100 },
    shear = null,
    serviceability = {},
    metadata = {},
  } = {}) {
    this.code = code;
    this.mesh = { ...mesh };
    this.solver = { ...solver };
    this.shear = shear;
    this.serviceability = serviceability;
    this.metadata = { ...metadata };
  }

  verify({
    beamId = null,
    section = null,
    concreteMaterial = null,
    reinforcementMaterial = null,
    analysisResult = null,
    mesh = this.mesh,
    solver = this.solver,
    shear = this.shear,
    serviceability = this.serviceability,
  } = {}) {
    if (!section || !analysisResult) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-beams",
        status: "not-implemented",
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
      }),
      limitStates: "ULS",
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
          }).verify({ analysisResult });
    const deflectionVerification =
      serviceability === false
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
          });
    const includeDeflection =
      deflectionVerification &&
      deflectionVerification.outputs?.combinationCount > 0;
    const actionVerification =
      serviceabilityVerification &&
      serviceabilityVerification.outputs.stationResultCount > 0
        ? {
            status:
              ulsVerification.status === "ok" &&
              serviceabilityVerification.status === "ok" &&
              (!includeDeflection || deflectionVerification.status === "ok")
                ? "ok"
                : "not-verified",
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
              "Full member detailing and second-order effects are not included in this RC beam verification step.",
            ]
          : [
              "Shear resistance, full member detailing and second-order effects are not included in this RC beam verification step.",
            ]),
      ],
      assumptions: [
        ...actionVerification.assumptions,
        "Each FEM station is checked as an independent uniaxial RC section at the corresponding N-M pair.",
      ],
      metadata: {
        code: this.code,
        beamId,
        governingCheckId: governing?.id ?? null,
        ...this.metadata,
      },
    });
  }
}
