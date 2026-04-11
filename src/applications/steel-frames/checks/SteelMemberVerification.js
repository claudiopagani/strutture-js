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

function designStrength(material, gammaM0) {
  if (Number.isFinite(material?.fyd)) {
    return material.fyd;
  }

  if (Number.isFinite(material?.fyk) && Number.isFinite(gammaM0)) {
    return material.fyk / gammaM0;
  }

  return null;
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

function governingCheck(checks) {
  return checks.reduce((selected, check) =>
    check.utilizationRatio > selected.utilizationRatio ? check : selected,
  );
}

function createSteelActionVerifier({
  section,
  material,
  sectionToResultUnits,
  gammaM0,
}) {
  return {
    verifySectionActions({ nEd, vEd, mEd, context }) {
      const metadata = context.sectionProperties?.metadata ?? {};
      const resolvedGammaM0 = gammaM0 ?? metadata.gammaM0 ?? material.metadata?.gammaM0 ?? 1.05;
      const fyd = metadata.fyd ?? designStrength(material, resolvedGammaM0);
      const elasticMomentResistance =
        metadata.elasticMomentResistance ??
        (Number.isFinite(fyd) && Number.isFinite(section.elasticSectionModulusY)
          ? fyd * section.elasticSectionModulusY
          : null);
      const shearResistance =
        metadata.shearResistance ??
        (Number.isFinite(fyd) && Number.isFinite(section.shearAreaY ?? section.area)
          ? (fyd * (section.shearAreaY ?? section.area)) / Math.sqrt(3)
          : null);
      const axialResistance =
        Number.isFinite(fyd) && Number.isFinite(section.area)
          ? fyd * section.area
          : null;
      const bendingCapacity = sectionToResultUnits.moment(elasticMomentResistance);
      const shearCapacity = sectionToResultUnits.force(shearResistance);
      const axialCapacity = sectionToResultUnits.force(axialResistance);
      const bending = utilizationCheck({
        id: "steel-bending",
        description: "Elastic bending resistance verification",
        demand: mEd,
        capacity: bendingCapacity,
        metadata: {
          fyd: round(fyd),
          gammaM0: round(resolvedGammaM0),
        },
      });
      const shear = utilizationCheck({
        id: "steel-shear",
        description: "Shear resistance verification",
        demand: vEd,
        capacity: shearCapacity,
        metadata: {
          fyd: round(fyd),
          shearArea: round(section.shearAreaY ?? section.area),
        },
      });
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
      const checks = [bending, shear, axial, interaction];
      const governing = governingCheck(checks);

      return {
        status: checks.every((check) => check.ok) ? "ok" : "not-verified",
        utilizationRatio: governing.utilizationRatio,
        demand: governing.demand,
        capacity: governing.capacity,
        checks,
        metadata: {
          governingCheckId: governing.id,
        },
      };
    },
  };
}

export class SteelMemberVerification {
  constructor({ code = "NTC2018", gammaM0 = null, metadata = {} } = {}) {
    this.code = code;
    this.gammaM0 = gammaM0;
    this.metadata = { ...metadata };
  }

  verify({
    memberId = null,
    combinations = [],
    section = null,
    material = null,
    analysisResult = null,
  } = {}) {
    if (!section || !material || !analysisResult) {
      return new VerificationResult({
        applicationId: "steel-frames",
        status: "not-implemented",
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
    const sectionUnits = section.metadata?.unitSystem ?? DEFAULT_SECTION_UNITS;
    const sectionToResultUnits = createUnitResolver(sectionUnits, resultUnits);
    const actionVerification = new BeamSectionActionVerifier({
      applicationId: "steel-frames",
      sectionVerifier: createSteelActionVerifier({
        section,
        material,
        sectionToResultUnits,
        gammaM0: this.gammaM0,
      }),
      limitStates: "ULS",
    }).verify({ analysisResult });

    return new VerificationResult({
      applicationId: "steel-frames",
      status: actionVerification.status,
      summary: "Steel member base resistance verification from FEM beam results.",
      utilizationRatio: actionVerification.utilizationRatio,
      demand: actionVerification.demand,
      capacity: actionVerification.capacity,
      checks: Object.values(
        actionVerification.checks.reduce((acc, check) => {
          const current = acc[check.id];

          if (!current || check.utilizationRatio > current.utilizationRatio) {
            acc[check.id] = check;
          }

          return acc;
        }, {}),
      ),
      outputs: {
        stationResultCount: actionVerification.outputs.stationResultCount,
        governing: actionVerification.outputs.governing,
      },
      warnings: [
        "Section classification and local buckling are not included in this first steel verification.",
        "Lateral-torsional buckling and member stability are not included yet.",
      ],
      metadata: {
        code: this.code,
        memberId,
        governingCheckId: actionVerification.outputs.governing?.metadata?.governingCheckId ?? null,
        ...this.metadata,
      },
    });
  }
}
