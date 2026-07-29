/**
 * Biaxial bending (pressoflessione deviata) verification for RC shear walls.
 *
 * Lives in the `applications` layer (NOT `norms`) because it composes the
 * fiber-section solver (`RCUltimateSectionSolver`, applications) with the
 * constitutive laws (domain). The `norms` layer must not depend on
 * `applications` (enforced by check-architecture).
 *
 * Method: the ultimate domain of the wall section is sampled by neutral-axis
 * orientation at the assigned axial force N_Ed. The resistance in the demand
 * direction is the first intersection between the Mx-My demand ray and the
 * sampled closed polygon. Neutral-axis orientation and resistant-moment
 * direction are deliberately kept distinct.
 *
 * References:
 * - D.M. 17/01/2018 (NTC 2018): § 4.1.2.3.9, § 7.4.4.5.1 (Presso-flessione)
 */

import {
    RCBiaxialDomainBuilder,
} from "../reinforced-concrete-sections/analysis/RCBiaxialDomainBuilder.js";
import {
    SectionFiberDiscretizer,
} from "../reinforced-concrete-sections/analysis/SectionFiberDiscretizer.js";
import {
    ConcreteParabolaRectangleLaw,
} from "../../domain/constitutive-laws/ConcreteParabolaRectangleLaw.js";
import {
    SteelElasticPerfectlyPlasticLaw,
} from "../../domain/constitutive-laws/SteelElasticPerfectlyPlasticLaw.js";
import { rayPolygonCapacity } from "../../domain/math/rayPolygonCapacity.js";
import { withNormativeReferences } from "../../norms/normativeReference.js";
import {
    NTC2018_RC_CHAPTER_4_REFERENCES,
    NTC2018_RC_CHAPTER_7_4_REFERENCES,
} from "../../norms/ntc2018/normativeReferences.js";

/** @readonly */
export const WALL_BIAXIAL_REFERENCE =
    "NTC 2018 § 4.1.2.3.9, § 7.4.4.5.1 (Presso-flessione biassiale)";

function positive(value, label) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${label} must be positive; got ${value}.`);
    }
    return value;
}

function finite(value, label) {
    if (!Number.isFinite(value)) {
        throw new Error(`${label} must be finite; got ${value}.`);
    }
    return value;
}

function integerAtLeast(value, minimum, label) {
    if (!Number.isInteger(value) || value < minimum) {
        throw new Error(`${label} must be an integer >= ${minimum}; got ${value}.`);
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
 * @param {number} [params.angleCount=64] – Sample count for the closed Mx-My domain.
 * @param {string} [params.compressedSide="positive"] – Solver compressed side.
 * @returns {{
 *   ok: boolean,
 *   utilizationRatio: number|null,
 *   demand: number,
 *   capacity: number|null,
 *   theta: number|null,
 *   axialResidual: number,
 *   converged: boolean,
 *   angleCount: number,
 *   intersection: Object|null,
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
    angleCount = 64,
    compressedSide = "positive",
}) {
    if (section == null) {
        throw new Error("section is required for wall biaxial verification.");
    }
    const nEd = finite(axialForce, "axialForce");
    const mxEd = finite(momentX, "momentX");
    const myEd = finite(momentY, "momentY");
    const fcd = positive(concreteDesignStrength, "concreteDesignStrength");
    const fyd = positive(reinforcementDesignStrength, "reinforcementDesignStrength");
    const resolvedFiberCount = integerAtLeast(
        targetFiberCount,
        1,
        "targetFiberCount",
    );
    const resolvedAngleCount = integerAtLeast(angleCount, 4, "angleCount");

    const demand = Math.hypot(mxEd, myEd);
    const theta = demand > 0 ? Math.atan2(myEd, mxEd) : null;

    const concreteFibers = new SectionFiberDiscretizer().discretize(section, {
        targetCount: resolvedFiberCount,
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

    const domain = new RCBiaxialDomainBuilder().buildAtAxialLoad({
        section,
        concreteFibers,
        concreteLaw,
        steelLaw,
        nEd,
        angleCount: resolvedAngleCount,
        compressedSide,
    });

    const converged = domain.points.every((point) =>
        point.converged === true &&
        Number.isFinite(point.MxRd) &&
        Number.isFinite(point.MyRd) &&
        Number.isFinite(point.axialResidual),
    );
    const maximumAbsoluteAxialResidual = Math.max(
        ...domain.points
            .map((point) => Math.abs(point.axialResidual))
            .filter(Number.isFinite),
        0,
    );
    // @see https://strutture-normative-viewer.claudiopagani19.chatgpt.site/?unit=urn%3Astructural-codes%3Ait%3Aunit%3Antc2018%3A4.1.2.3.4.2
    // @see https://strutture-normative-viewer.claudiopagani19.chatgpt.site/?unit=urn%3Astructural-codes%3Ait%3Aunit%3Antc2018%3A7.4.4.5.1
    const rayCapacity = rayPolygonCapacity(
        domain.points.map((point) => ({
            x: point.MxRd,
            y: point.MyRd,
        })),
        mxEd,
        myEd,
    );
    const capacity = Number.isFinite(rayCapacity.capacityNorm)
        ? rayCapacity.capacityNorm
        : null;
    const utilizationRatio = Number.isFinite(rayCapacity.utilizationRatio)
        ? rayCapacity.utilizationRatio
        : null;
    const ok =
        converged &&
        utilizationRatio != null &&
        utilizationRatio <= 1;

    return {
        ok,
        utilizationRatio,
        demand,
        capacity,
        theta,
        axialResidual: maximumAbsoluteAxialResidual,
        converged,
        angleCount: resolvedAngleCount,
        intersection: rayCapacity.intersection
            ? {
                momentX: rayCapacity.intersection.x,
                momentY: rayCapacity.intersection.y,
                segmentIndex: rayCapacity.intersection.segmentIndex,
                segmentParameter: rayCapacity.intersection.segmentParameter,
            }
            : null,
        check: "wall-biaxial-bending",
        reference: WALL_BIAXIAL_REFERENCE,
        metadata: withNormativeReferences({}, [
            NTC2018_RC_CHAPTER_4_REFERENCES.flexureAndAxialForce,
            NTC2018_RC_CHAPTER_7_4_REFERENCES.wall,
        ]),
    };
}
