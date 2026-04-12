import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { BeamSectionActionVerifier } from "../../../domain/beams/BeamSectionActionVerifier.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { ReinforcedConcreteSectionModel } from "../models/ReinforcedConcreteSectionModel.js";
import { ReinforcedConcreteSectionVerification } from "./ReinforcedConcreteSectionVerification.js";

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
}) {
  const sectionVerification = new ReinforcedConcreteSectionVerification({ code });

  return {
    verifySectionActions({ nEd, mEd, context }) {
      const convertedNEd = resultToSectionUnits.force(nEd ?? 0);
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

      return {
        status: result.status,
        utilizationRatio: result.utilizationRatio,
        demand: result.demand,
        capacity: result.capacity,
        checks: result.checks.map((check) => ({
          ...check,
          id: `rc-${check.id}`,
          metadata: {
            compressedEdge: model.analysisSettings.compressedEdge,
            ...check.metadata,
          },
        })),
        warnings: result.warnings,
        assumptions: result.assumptions,
        metadata: {
          governingCheckId: result.metadata?.governingCheckId ?? "rc-uls-uniaxial-bending",
          compressedEdge: model.analysisSettings.compressedEdge,
          sectionResult: result.toJSON(),
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
    metadata = {},
  } = {}) {
    this.code = code;
    this.mesh = { ...mesh };
    this.solver = { ...solver };
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
    const actionVerification = new BeamSectionActionVerifier({
      applicationId: "reinforced-concrete-beams",
      sectionVerifier: createRcActionVerifier({
        section,
        concreteMaterial: resolvedConcreteMaterial,
        reinforcementMaterial: resolvedReinforcementMaterial,
        resultToSectionUnits,
        code: this.code,
        mesh,
        solver,
      }),
      limitStates: "ULS",
    }).verify({ analysisResult });
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
      summary: "RC beam ULS uniaxial section verification from FEM beam actions.",
      utilizationRatio: governing?.utilizationRatio ?? actionVerification.utilizationRatio,
      demand: governing?.demand ?? actionVerification.demand,
      capacity: governing?.capacity ?? actionVerification.capacity,
      checks: groupedChecks,
      outputs: {
        stationResultCount: actionVerification.outputs.stationResultCount,
        governing: actionVerification.outputs.governing,
      },
      warnings: [
        ...actionVerification.warnings,
        "Shear resistance, crack control, detailing and second-order effects are not included in this first RC beam verification.",
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

