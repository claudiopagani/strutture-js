import { VerificationResult } from "../../core/results/VerificationResult.js";
import {
  governingCheck,
  round,
  utilizationCheck,
} from "../../core/results/checkUtils.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import { StrutAndTieAnalysis2D } from "../../domain/strut-and-tie/StrutAndTieAnalysis2D.js";
import {
  calculateEn1992NodalDesignStrength,
  calculateEn1992StrutDesignStrength,
  calculateEn1992TieResistance,
} from "../../norms/en1992/strut-and-tie/en1992StrutAndTie2004.js";

const SUPPORTED_CODE = "EN1992_1_1_2004_A1_2014";

function incompatibleMechanismCheck(member) {
  return {
    id: `stm-member-sign-${member.id}`,
    description: `${member.type} ${member.id} force-sign compatibility`,
    demand: round(Math.abs(member.force)),
    capacity: 0,
    utilizationRatio: null,
    ok: false,
    metadata: {
      expectedState: member.type === "strut" ? "compression" : "tension",
      actualState: member.state,
    },
  };
}

function project(vector, normal) {
  return Math.abs(vector.fx * normal.x + vector.fy * normal.y);
}

function resolveZoneForce(zone, analysis) {
  const reference = zone.forceReference;

  if (reference.kind === "explicit") {
    return reference.designForce;
  }

  if (reference.kind === "member") {
    const member = analysis.members.find((value) => value.id === reference.id);
    return Math.abs(member.force);
  }

  if (reference.kind === "load") {
    const load = analysis.loads.find((value) => value.id === reference.id);
    return project(load, reference.normal);
  }

  return project(
    analysis.reactions[reference.nodeId] ?? { fx: 0, fy: 0 },
    reference.normal,
  );
}

export class ReinforcedConcreteStrutAndTieVerification {
  constructor({ code = SUPPORTED_CODE, metadata = {} } = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  verify(model) {
    if (this.code !== SUPPORTED_CODE) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-strut-and-tie",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary: `Unsupported strut-and-tie design code: ${this.code}.`,
        warnings: ["The first implementation supports EN 1992-1-1:2004+A1:2014 only."],
        metadata: { code: this.code, modelId: model.id, ...this.metadata },
      });
    }

    const concrete = model.materials.concreteMaterial;
    const reinforcement = model.materials.reinforcementMaterial;
    const fck = concrete?.fck;
    const fcd = concrete?.fcd;
    const fyd = reinforcement?.fyd;

    if (![fck, fcd, fyd].every((value) => Number.isFinite(value) && value > 0)) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-strut-and-tie",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary: "Strut-and-tie verification requires fck, fcd and fyd.",
        warnings: ["Provide concrete and reinforcement design strengths."],
        metadata: { code: this.code, modelId: model.id, ...this.metadata },
      });
    }

    let analysis;

    try {
      analysis = new StrutAndTieAnalysis2D().analyze(model.domainModel);
    } catch (error) {
      if (!/singular|ill-conditioned|positive-definite/i.test(error.message)) {
        throw error;
      }

      return new VerificationResult({
        applicationId: "reinforced-concrete-strut-and-tie",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary: "The assigned strut-and-tie topology is unstable or singular.",
        warnings: [error.message],
        metadata: { code: this.code, modelId: model.id, ...this.metadata },
      });
    }

    const sourceMemberById = new Map(
      model.members.map((member) => [member.id, member]),
    );
    const memberChecks = [];
    const memberCapacities = {};
    const incompatibleMembers = [];

    for (const member of analysis.members) {
      const source = sourceMemberById.get(member.id);
      const compatible = member.state === "zero" ||
        (member.type === "strut" && member.state === "compression") ||
        (member.type === "tie" && member.state === "tension");

      if (!compatible) {
        incompatibleMembers.push(member.id);
        memberChecks.push(incompatibleMechanismCheck(member));
      }

      if (member.type === "strut") {
        const strength = calculateEn1992StrutDesignStrength({
          fck,
          fcd,
          strengthModel: source.strengthModel,
        });
        const capacity = member.area * strength.designStrength;
        memberCapacities[member.id] = { ...strength, capacity: round(capacity) };
        memberChecks.push(utilizationCheck({
          id: `stm-strut-strength-${member.id}`,
          description: `Concrete strut ${member.id} compression resistance`,
          demand: Math.abs(member.force),
          capacity,
          metadata: {
            strengthModel: source.strengthModel,
            designStrength: round(strength.designStrength),
            equation: strength.equation,
          },
        }));
      } else {
        const resistance = calculateEn1992TieResistance({
          reinforcementArea: member.area,
          fyd,
        });
        memberCapacities[member.id] = {
          ...resistance,
          capacity: round(resistance.capacity),
        };
        memberChecks.push(utilizationCheck({
          id: `stm-tie-strength-${member.id}`,
          description: `Steel tie ${member.id} tension resistance`,
          demand: Math.abs(member.force),
          capacity: resistance.capacity,
          metadata: { equation: resistance.equation },
        }));
      }
    }

    const nodalZoneResults = model.nodalZones.map((zone) => {
      const demand = resolveZoneForce(zone, analysis);
      const strength = calculateEn1992NodalDesignStrength({
        fck,
        fcd,
        nodeType: zone.type,
        factors: zone.factors,
      });
      const capacity = zone.area * strength.designStrength;

      return {
        ...zone,
        demand: round(demand),
        capacity: round(capacity),
        stress: round(demand / zone.area),
        strength: {
          ...strength,
          designStrength: round(strength.designStrength),
        },
        check: utilizationCheck({
          id: `stm-nodal-zone-${zone.id}`,
          description: `Nodal zone ${zone.id} compression resistance`,
          demand,
          capacity,
          metadata: {
            nodeId: zone.nodeId,
            nodeType: zone.type,
            equation: strength.equation,
            factor: strength.factor,
            factorSource: strength.factorSource,
          },
        }),
      };
    });
    const checks = [
      ...memberChecks,
      ...nodalZoneResults.map((zone) => zone.check),
    ];
    const governing = governingCheck(checks);
    const ok = checks.every((check) => check.ok === true);
    const equilibriumResidual = Math.hypot(
      analysis.equilibrium.residual.fx,
      analysis.equilibrium.residual.fy,
    );

    return new VerificationResult({
      applicationId: "reinforced-concrete-strut-and-tie",
      status: ok ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "Assigned 2D strut-and-tie topology solved and verified according to EN 1992-1-1:2004.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks,
      outputs: {
        analysis,
        materials: { fck: round(fck), fcd: round(fcd), fyd: round(fyd) },
        memberCapacities,
        nodalZones: nodalZoneResults.map(({ check, ...zone }) => zone),
        equilibriumResidual: round(equilibriumResidual),
        incompatibleMembers,
      },
      warnings: [
        "The topology and all nodal-zone faces are assigned by the user; the library does not generate or optimize load paths.",
        "Tie anchorage, reinforcement distribution, bottle-shaped strut splitting forces and minimum crack-control reinforcement are not verified.",
        "Compression-only and tension-only behaviour is checked after the linear solution; incompatible members are not iteratively removed.",
        ...(analysis.topology.forceDistributionDependsOnAxialRigidity
          ? ["The model is statically indeterminate: member forces depend on the assigned analysis axial rigidities."]
          : []),
        ...(incompatibleMembers.length > 0
          ? [`The assigned mechanism has force-sign incompatibilities in: ${incompatibleMembers.join(", ")}.`]
          : []),
        ...analysis.diagnostics.warnings,
      ],
      assumptions: [
        "The model is a small-displacement, pin-jointed, linear-elastic 2D truss.",
        "Member axial force is tension-positive; concrete struts must remain in compression and steel ties in tension.",
        "Member areas represent the effective strut width times thickness or the effective anchored reinforcement area.",
        "Nodal-zone force references and bearing normals represent the compressive face being checked.",
      ],
      metadata: {
        code: this.code,
        method: "EN1992-1-1-2004-section-6.5",
        modelId: model.id,
        governingCheckId: governing?.id ?? null,
        ...this.metadata,
      },
    });
  }
}

export const RC_STRUT_AND_TIE_SUPPORTED_CODE = SUPPORTED_CODE;
