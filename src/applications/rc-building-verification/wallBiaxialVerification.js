/**
 * Biaxial bending (pressoflessione deviata) verification for RC shear walls.
 *
 * Lives in the `applications` layer (NOT `norms`) because it composes the
 * fiber-section solver (`RCUltimateSectionSolver`, applications) with the
 * constitutive laws (domain). The `norms` layer must not depend on
 * `applications` (enforced by check-architecture).
 *
 * Method: the ultimate domain of the wall section is sampled by the fiber
 * solver at the assigned axial force N_Ed, in the direction of the demand
 * moment vector (theta = atan2(MxEd, MyEd)). The utilization is the radial
 * ratio |M_Ed| / |M_Rd(theta)| under the assumption of radial linearity of
 * the interaction domain in the demand direction (declared in assumptions).
 *
 * References:
 * - D.M. 17/01/2018 (NTC 2018): § 4.1.2.3.9, § 7.4.4.5.1 (Presso-flessione)
 */

import {
    RCUltimateSectionSolver,
} from "../reinforced-concrete-sections/analysis/RCUltimateSectionSolver.js";
import {
    SectionFiberDiscretizer,
} from "../reinforced-concrete-sections/analysis/SectionFiberDiscretizer.js";
import {
    ConcreteParabolaRectangleLaw,
} from "../../domain/constitutive-laws/ConcreteParabolaRectangleLaw.js";
import {
    SteelElasticPerfectlyPlasticLaw,
} from "../../domain/constitutive-laws/SteelElasticPerfectlyPlasticLaw.js";

/** @readonly */
export const WALL_BIAXIAL_REFERENCE =
    "NTC 2018 § 4.1.2.3.9, § 7.4.4.5.1 (Presso-flessione biassiale)";

function positive(value, label) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${label} must be positive; got ${value}.`);
    }
    return value;
}

/**
 * Verify a wall section in biaxial bending at assigned axial force.
 *
 * @param {Object} params
 * @param {Object} params.section – ReinforcedConcreteSection (domain object).
 * @param {number} params.axialForce – N_Ed [force] (solver sign convention).
 * @param {number} params.momentX – M_x,Ed [force×length].
 * @param {number} params.momentY – M_y,Ed [force×length].
 * @param {number} params.concreteDesignStrength – f_cd [force/length²].
 * @param {number} params.reinforcementDesignStrength – f_yd [force/length²].
 * @param {number} [params.concreteEc2=0.002] – Peak compression strain.
 * @param {number} [params.concreteEcu=0.0035] – Ultimate compression strain.
 * @param {number} [params.steelElasticModulus=200000] – E_s [force/length²].
 * @param {number} [params.steelUltimateStrain=0.01] – ε_su.
 * @param {number} [params.targetFiberCount=400] – Discretization density.
 * @param {string} [params.compressedSide="positive"] – Solver compressed side.
 * @returns {{
 *   ok: boolean,
 *   utilizationRatio: number,
 *   demand: number,
 *   capacity: number,
 *   theta: number,
 *   axialResidual: number,
 *   converged: boolean,
 *   check: string,
 *   reference: string,
 * }}
 */
export function verifyWallBiaxialBending({
    section,
    axialForce,
    momentX,
    momentY,
    concreteDesignStrength,
    reinforcementDesignStrength,
    concreteEc2 = 0.002,
    concreteEcu = 0.0035,
    steelElasticModulus = 200000,
    steelUltimateStrain = 0.01,
    targetFiberCount = 400,
    compressedSide = "positive",
}) {
    if (section == null) {
        throw new Error("section is required for wall biaxial verification.");
    }
    const nEd = Number.isFinite(axialForce) ? axialForce : 0;
    const mxEd = Number.isFinite(momentX) ? momentX : 0;
    const myEd = Number.isFinite(momentY) ? momentY : 0;
    const fcd = positive(concreteDesignStrength, "concreteDesignStrength");
    const fyd = positive(reinforcementDesignStrength, "reinforcementDesignStrength");

    const demand = Math.hypot(mxEd, myEd);

    // Direction of the demand moment vector (solver convention: theta
    // counter-clockwise from +z toward +y; atan2(Mx, My) matches the
    // validation usage for the radial capacity direction).
    const theta = Math.atan2(mxEd, myEd);

    const concreteFibers = new SectionFiberDiscretizer().discretize(section, {
        targetCount: targetFiberCount,
    }).fibers;

    const concreteLaw = new ConcreteParabolaRectangleLaw({
        fcd,
        ec2: concreteEc2,
        ecu: concreteEcu,
    });
    const steelLaw = new SteelElasticPerfectlyPlasticLaw({
        Es: steelElasticModulus,
        fyd,
        esu: steelUltimateStrain,
    });

    const solved = new RCUltimateSectionSolver().solveAtAxialLoad({
        section,
        concreteFibers,
        concreteLaw,
        steelLaw,
        nEd,
        theta,
        compressedSide,
    });

    const capacity = Math.hypot(solved.MxRd ?? 0, solved.MyRd ?? 0);
    const utilizationRatio = capacity > 0 ? demand / capacity : Infinity;
    const ok = solved.converged !== false && utilizationRatio <= 1;

    return {
        ok,
        utilizationRatio,
        demand,
        capacity,
        theta,
        axialResidual: solved.axialResidual ?? null,
        converged: solved.converged !== false,
        check: "wall-biaxial-bending",
        reference: WALL_BIAXIAL_REFERENCE,
    };
}
