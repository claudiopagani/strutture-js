import {
    ConcreteParabolaRectangleLaw,
    RCUltimateSectionSolver,
    RectangularSection,
    ReinforcedConcreteSection,
    ReinforcementBar,
    SectionFiberDiscretizer,
    SteelElasticPerfectlyPlasticLaw,
    computeBeamCapacityShear,
    computeColumnCapacityShear,
    computeMixedSystemWallShearEnvelope,
    computePDeltaCoefficient,
    computeWallCapacityShear,
    computeWallCriticalZoneHeight,
    computeWallMomentShift,
    createCouplingBeamAssessment,
    createNTC2018ConcreteMaterial,
    createNTC2018ReinforcementSteelMaterial,
    evaluateNTC2018PlanRegularity,
    verifyBeamColumnHierarchy,
    verifyNTC2018ModalMassParticipation,
    verifyWallBiaxialBending,
} from "../src/index.js";

/**
 * Independent (hand-calculation) validation cases for the NTC 2018 global
 * reinforced-concrete verification kernels added in the building-level
 * module: capacity design, shear-wall capacity/design, storey drift and
 * P-Delta, and structural regularity.
 *
 * Every reference value is derived here from first principles and compared
 * against the kernel output. No value is copied from the implementation.
 */

function approxPath(actual, expected, tolerance) {
    return Math.abs(actual - expected) <= tolerance;
}

function pointInsideClosedPolygon(points, x, y) {
    let inside = false;

    for (
        let current = 0, previous = points.length - 1;
        current < points.length;
        previous = current, current += 1
    ) {
        const a = points[current];
        const b = points[previous];
        const crossesHorizontalRay =
            (a.y > y) !== (b.y > y) &&
            x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;

        if (crossesHorizontalRay) {
            inside = !inside;
        }
    }

    return inside;
}

/**
 * Independent radial-boundary estimate. This deliberately uses point-in-polygon
 * bisection rather than the analytical ray/segment intersection used by the
 * production kernel.
 */
function estimateRayCapacityByBisection(points, demandX, demandY) {
    const demandNorm = Math.hypot(demandX, demandY);
    const directionX = demandX / demandNorm;
    const directionY = demandY / demandNorm;
    let lower = 0;
    let upper = Math.max(...points.map((point) => Math.hypot(point.x, point.y))) * 2;

    for (let iteration = 0; iteration < 80; iteration += 1) {
        const middle = (lower + upper) / 2;
        if (
            pointInsideClosedPolygon(
                points,
                directionX * middle,
                directionY * middle,
            )
        ) {
            lower = middle;
        } else {
            upper = middle;
        }
    }

    return (lower + upper) / 2;
}

// ---------------------------------------------------------------------------
// Capacity design
// ---------------------------------------------------------------------------

function beamColumnHierarchyCase() {
    return {
        id: "rc-cd-beam-column-hierarchy",
        title: "Capacity design beam-column hierarchy (Eq. 7.4.4)",
        category: "reinforced-concrete-capacity-design",
        source: "D.M. 17/01/2018, NTC 2018 § 7.4.4 Eq. [7.4.4]; Tab. 7.2.I",
        sourceKind: "independent-calculation",
        notes:
            "Column pressoflexure uses gamma_Rd=1.30. Signed column capacities are concordant in this case.",
        evaluate() {
            const result = verifyBeamColumnHierarchy({
                beamMomentResistances: [100, -80],
                columnMomentResistances: [250, 50],
                behavior: "cd-a",
            });
            // Independent: sumMRb = 180; demand = 1.30*180 = 234; capacity=300.
            const expectedDemand = 1.3 * (100 + 80);
            return {
                gammaRd: result.gammaRd,
                demand: result.demand,
                capacity: result.capacity,
                utilizationRatio: result.utilizationRatio,
                ok: result.ok,
                independentMatches:
                    result.gammaRd === 1.3 &&
                    approxPath(result.demand, expectedDemand, 1e-9) &&
                    result.ok === (expectedDemand <= 300),
            };
        },
        expectations: [
            { id: "gamma-rd", path: "gammaRd", expected: 1.3, type: "equal" },
            { id: "demand", path: "demand", expected: 234, tolerance: 1e-9 },
            { id: "ok", path: "ok", expected: true, type: "equal" },
            { id: "independent", path: "independentMatches", expected: true, type: "equal" },
        ],
    };
}

function beamCapacityShearCase() {
    return {
        id: "rc-cd-beam-capacity-shear",
        title: "Beam capacity design shear (§ 7.4.4.1.1)",
        category: "reinforced-concrete-capacity-design",
        source: "D.M. 17/01/2018, NTC 2018 § 7.4.4.1.1; Tab. 7.2.I",
        sourceKind: "independent-calculation",
        notes:
            "CD'B' beam gamma_Rd=1.10. Signed end moments and signed gravity shears are combined by beam equilibrium.",
        evaluate() {
            const result = computeBeamCapacityShear({
                momentResistanceLeft: -90,
                momentResistanceRight: 120,
                clearLength: 4.5,
                gravityShearLeft: 30,
                gravityShearRight: -30,
                behavior: "cd-b",
            });
            // Independent: ΔV = 1.10*(120-(-90))/4.5 = 51.333;
            // end demands are |30+ΔV| and |-30+ΔV|.
            const deltaV = 1.1 * (120 - (-90)) / 4.5;
            const expected = Math.max(Math.abs(30 + deltaV), Math.abs(-30 + deltaV));
            return {
                gammaRd: result.gammaRd,
                shearDemand: result.shearDemand,
                independentMatches:
                    result.gammaRd === 1.1 && approxPath(result.shearDemand, expected, 1e-9),
            };
        },
        expectations: [
            { id: "gamma-rd", path: "gammaRd", expected: 1.1, type: "equal" },
            { id: "shear", path: "shearDemand", expected: 81.333333, tolerance: 1e-6 },
            { id: "independent", path: "independentMatches", expected: true, type: "equal" },
        ],
    };
}

function columnCapacityShearCase() {
    return {
        id: "rc-cd-column-capacity-shear",
        title: "Column capacity design shear (Eq. 7.4.5)",
        category: "reinforced-concrete-capacity-design",
        source: "D.M. 17/01/2018, NTC 2018 § 7.4.4.2.1 Eq. [7.4.5]; Tab. 7.2.I",
        sourceKind: "independent-calculation",
        notes:
            "CD'A' column gamma_Rd=1.30. Each end capacity is first limited by the beam/column hierarchy ratio.",
        evaluate() {
            const result = computeColumnCapacityShear({
                top: {
                    columnMomentResistance: 200,
                    beamMomentResistanceSum: 300,
                    columnMomentResistanceSum: 400,
                },
                bottom: {
                    columnMomentResistance: 180,
                    beamMomentResistanceSum: 400,
                    columnMomentResistanceSum: 400,
                },
                clearLength: 2.8,
                behavior: "cd-a",
            });
            // Independent: top design moment=200*(300/400)=150;
            // bottom=180*min(1,400/400)=180.
            const expected = 1.3 * (150 + 180) / 2.8;
            return {
                gammaRd: result.gammaRd,
                shearDemand: result.shearDemand,
                independentMatches:
                    result.gammaRd === 1.3 && approxPath(result.shearDemand, expected, 1e-9),
            };
        },
        expectations: [
            { id: "gamma-rd", path: "gammaRd", expected: 1.3, type: "equal" },
            { id: "shear", path: "shearDemand", expected: 153.214286, tolerance: 1e-6 },
            { id: "independent", path: "independentMatches", expected: true, type: "equal" },
        ],
    };
}

// ---------------------------------------------------------------------------
// Shear wall
// ---------------------------------------------------------------------------

function wallCriticalZoneCase() {
    return {
        id: "rc-wall-critical-zone",
        title: "Shear wall critical zone height (Eq. 7.4.13)",
        category: "reinforced-concrete-shear-wall",
        source: "D.M. 17/01/2018, NTC 2018 § 7.4.4.5.1 Eq. [7.4.13]",
        sourceKind: "independent-calculation",
        notes:
            "h_cr = max(l_w, h_w/6), capped by 2*l_w and by h_s through six storeys or 2*h_s from seven storeys.",
        evaluate() {
            const tall = computeWallCriticalZoneHeight({
                wallLength: 3,
                wallHeight: 18,
                storeyHeight: 3,
                storeyCount: 6,
            });
            const squat = computeWallCriticalZoneHeight({
                wallLength: 5,
                wallHeight: 9,
                storeyHeight: 6,
                storeyCount: 3,
            });
            const capped = computeWallCriticalZoneHeight({
                wallLength: 4,
                wallHeight: 24,
                storeyHeight: 3,
                storeyCount: 6,
            });
            return {
                tall: tall.hCr,
                squat: squat.hCr,
                capped: capped.hCr,
                independentMatches:
                    approxPath(tall.hCr, Math.max(3, 18 / 6), 1e-9) &&
                    approxPath(squat.hCr, Math.max(5, 9 / 6), 1e-9) &&
                    approxPath(capped.hCr, Math.min(Math.max(4, 24 / 6), 2 * 4, 3), 1e-9),
            };
        },
        expectations: [
            { id: "tall", path: "tall", expected: 3, tolerance: 1e-9 },
            { id: "squat", path: "squat", expected: 5, tolerance: 1e-9 },
            { id: "capped", path: "capped", expected: 3, tolerance: 1e-9 },
            { id: "independent", path: "independentMatches", expected: true, type: "equal" },
        ],
    };
}

function wallMomentShiftCase() {
    return {
        id: "rc-wall-moment-shift",
        title: "Shear wall moment shift = h_cr (§ 7.4.4.5.1)",
        category: "reinforced-concrete-shear-wall",
        source: "D.M. 17/01/2018, NTC 2018 § 7.4.4.5.1 (Presso-flessione)",
        sourceKind: "independent-calculation",
        notes:
            "For slender walls in both CD'A' and CD'B' the moment envelope is shifted up by a_l = h_cr; non-dissipative has no shift.",
        evaluate() {
            const cda = computeWallMomentShift({
                wallLength: 3,
                wallHeight: 18,
                storeyHeight: 3,
                storeyCount: 6,
                behavior: "cd-a",
            });
            const cdb = computeWallMomentShift({
                wallLength: 4,
                wallHeight: 24,
                storeyHeight: 3,
                storeyCount: 7,
                behavior: "cd-b",
            });
            const nd = computeWallMomentShift({
                wallLength: 3,
                wallHeight: 18,
                storeyHeight: 3,
                storeyCount: 6,
                behavior: "non-dissipative",
            });
            return {
                cda: cda.shift,
                cdb: cdb.shift,
                nd: nd.shift,
                independentMatches:
                    approxPath(cda.shift, 3, 1e-9) &&
                    approxPath(cdb.shift, 4, 1e-9) &&
                    nd.shift === 0,
            };
        },
        expectations: [
            { id: "cda", path: "cda", expected: 3, tolerance: 1e-9 },
            { id: "cdb", path: "cdb", expected: 4, tolerance: 1e-9 },
            { id: "nd", path: "nd", expected: 0, tolerance: 0 },
            { id: "independent", path: "independentMatches", expected: true, type: "equal" },
        ],
    };
}

function wallCapacityShearCase() {
    return {
        id: "rc-wall-capacity-shear",
        title: "Slender wall capacity shear amplification (§ 7.4.4.5.1)",
        category: "reinforced-concrete-shear-wall",
        source:
            "D.M. 17/01/2018, NTC 2018 § 7.4.4.5.1 (Taglio), slender walls; Tab. 7.2.I",
        sourceKind: "independent-calculation",
        notes:
            "epsilon = q*sqrt(((gamma_Rd/q)*(M_Rd/M_Ed))^2 + 0.1*(Se(T_C)/Se(T_1))^2), bounded to [1.5,q].",
        evaluate() {
            const result = computeWallCapacityShear({
                momentResistance: 5000,
                momentDemand: 4000,
                analysisShear: 100,
                q: 4.0,
                wallLength: 4,
                wallHeight: 20,
                elasticSpectrumTc: 0.25,
                elasticSpectrumT1: 0.10,
                behavior: "cd-a",
            });
            // Independent: q*sqrt(((1.2/q)*(5000/4000))^2 + 0.1*(0.25/0.10)^2)
            // = 4*sqrt(0.140625+0.625)=3.5.
            const expectedEps = 4 * Math.sqrt(
                Math.pow((1.2 / 4) * (5000 / 4000), 2) +
                0.1 * Math.pow(0.25 / 0.10, 2),
            );
            return {
                gammaRd: result.gammaRd,
                amplificationFactor: result.amplificationFactor,
                shearDemand: result.shearDemand,
                independentMatches:
                    result.gammaRd === 1.2 &&
                    approxPath(result.amplificationFactor, expectedEps, 1e-6) &&
                    approxPath(result.shearDemand, expectedEps * 100, 1e-6),
            };
        },
        expectations: [
            { id: "gamma-rd", path: "gammaRd", expected: 1.2, type: "equal" },
            { id: "eps", path: "amplificationFactor", expected: 3.5, tolerance: 1e-6 },
            { id: "shear", path: "shearDemand", expected: 350, tolerance: 1e-6 },
            { id: "independent", path: "independentMatches", expected: true, type: "equal" },
        ],
    };
}

// ---------------------------------------------------------------------------
// Displacement / P-Delta
// ---------------------------------------------------------------------------

function pDeltaCase() {
    return {
        id: "rc-disp-pdelta",
        title: "P-Delta stability coefficient (Eq. 7.3.3)",
        category: "reinforced-concrete-displacement",
        source: "D.M. 17/01/2018, NTC 2018 § 7.3.1 Eq. [7.3.3]",
        sourceKind: "independent-calculation",
        notes:
            "theta = P*dr/(V*h). theta<0.1 negligible; 0.1<=theta<=0.2 amplify 1/(1-theta); 0.2<theta<=0.3 nonlinear analysis; theta>0.3 forbidden.",
        evaluate() {
            const negligible = computePDeltaCoefficient({
                storeyWeight: 5000,
                drift: 0.001,
                storeyShear: 800,
                storeyHeight: 3,
            });
            const moderate = computePDeltaCoefficient({
                storeyWeight: 8000,
                drift: 0.03,
                storeyShear: 1500,
                storeyHeight: 3,
            });
            // negligible: theta = 5000*0.001/(800*3)=5/2400=0.00208 → negligible.
            // moderate: theta = 8000*0.03/(1500*3)=240/4500=0.0533 → negligible too.
            // Build an amplification case: theta=0.15.
            const mod = computePDeltaCoefficient({
                storeyWeight: 9000,
                drift: 0.05,
                storeyShear: 10000,
                storeyHeight: 0.3,
            });
            // theta = 9000*0.05/(10000*0.3) = 450/3000 = 0.15, amp=1/0.85.
            return {
                negligibleStatus: negligible.status,
                modTheta: mod.theta,
                modStatus: mod.status,
                modAmp: mod.amplificationFactor,
                independentMatches:
                    negligible.status === "negligible" &&
                    approxPath(mod.theta, 0.15, 1e-9) &&
                    mod.status === "amplification-required" &&
                    approxPath(mod.amplificationFactor, 1 / (1 - 0.15), 1e-9),
            };
        },
        expectations: [
            { id: "neg-status", path: "negligibleStatus", expected: "negligible", type: "equal" },
            { id: "mod-theta", path: "modTheta", expected: 0.15, tolerance: 1e-9 },
            { id: "mod-status", path: "modStatus", expected: "amplification-required", type: "equal" },
            { id: "independent", path: "independentMatches", expected: true, type: "equal" },
        ],
    };
}

// ---------------------------------------------------------------------------
// Regularity
// ---------------------------------------------------------------------------

function planRegularityCase() {
    return {
        id: "rc-reg-plan",
        title: "Plan regularity bounding rectangle and re-entrant areas (§ 7.2.1)",
        category: "reinforced-concrete-regularity",
        source: "D.M. 17/01/2018, NTC 2018 § 7.2.1",
        sourceKind: "independent-calculation",
        notes:
            "The bounding-rectangle ratio must be <4; every re-entrant area must not exceed 5% and must have negligible diaphragm influence.",
        evaluate() {
            const regular = evaluateNTC2018PlanRegularity({
                massAndStiffnessApproximatelySymmetric: true,
                planLengthX: 20,
                planLengthY: 15,
                contourConvex: true,
                diaphragmInPlaneRigidityAdequate: true,
                diaphragmInPlaneStrengthAdequate: true,
            });
            const nonRegular = evaluateNTC2018PlanRegularity({
                massAndStiffnessApproximatelySymmetric: true,
                planLengthX: 20,
                planLengthY: 15,
                contourConvex: false,
                reentrantAreaRatios: [0.06],
                reentrantInfluenceNegligible: true,
                diaphragmInPlaneRigidityAdequate: true,
                diaphragmInPlaneStrengthAdequate: true,
            });
            // Independent: slenderness = 20/15 < 4; 6% > 5%, hence non-regular.
            return {
                regularClass: regular.regularity,
                nonRegularClass: nonRegular.regularity,
                slenderness: regular.slenderness,
                reentrantRatio: nonRegular.maximumReentrantAreaRatio,
                independentMatches:
                    regular.regularity === "regular" &&
                    nonRegular.regularity === "non-regular" &&
                    approxPath(regular.slenderness, 20 / 15, 1e-9) &&
                    approxPath(nonRegular.maximumReentrantAreaRatio, 0.06, 1e-9),
            };
        },
        expectations: [
            { id: "regular", path: "regularClass", expected: "regular", type: "equal" },
            { id: "non-regular", path: "nonRegularClass", expected: "non-regular", type: "equal" },
            { id: "independent", path: "independentMatches", expected: true, type: "equal" },
        ],
    };
}

// ---------------------------------------------------------------------------
// Linear dynamic analysis and complete wall systems
// ---------------------------------------------------------------------------

function modalMassParticipationCase() {
    return {
        id: "rc-seismic-modal-mass-participation",
        title: "Modal participating mass (§ 7.3.3.1)",
        category: "reinforced-concrete-seismic-analysis",
        source: "D.M. 17/01/2018, NTC 2018 § 7.3.3.1",
        sourceKind: "independent-calculation",
        notes:
            "The retained modes exceed 85% in both horizontal directions. A mode exactly at 5% is not classified as individually significant.",
        evaluate() {
            const modes = [
                {
                    modeNumber: 1,
                    participatingMassRatios: { X: 0.50, Y: 0.31 },
                },
                {
                    modeNumber: 2,
                    participatingMassRatios: { X: 0.31, Y: 0.50 },
                },
                {
                    modeNumber: 3,
                    participatingMassRatios: { X: 0.05, Y: 0.05 },
                },
            ];
            const result = verifyNTC2018ModalMassParticipation({ modes });
            const x = result.directions.find((item) => item.direction === "X");
            const y = result.directions.find((item) => item.direction === "Y");
            // Independent sums: 0.50+0.31+0.05 = 0.86 in both directions.
            // Significant means strictly greater than 0.05, hence modes 1 and 2.
            return {
                xTotal: x.totalParticipatingMassRatio,
                yTotal: y.totalParticipatingMassRatio,
                exactFivePercentExcluded:
                    !x.significantModeNumbers.includes(3) &&
                    !y.significantModeNumbers.includes(3),
                independentMatches:
                    approxPath(x.totalParticipatingMassRatio, 0.86, 1e-12) &&
                    approxPath(y.totalParticipatingMassRatio, 0.86, 1e-12) &&
                    result.ok === true,
            };
        },
        expectations: [
            { id: "x-total", path: "xTotal", expected: 0.86, tolerance: 1e-12 },
            { id: "y-total", path: "yTotal", expected: 0.86, tolerance: 1e-12 },
            {
                id: "five-percent-excluded",
                path: "exactFivePercentExcluded",
                expected: true,
                type: "equal",
            },
            {
                id: "independent",
                path: "independentMatches",
                expected: true,
                type: "equal",
            },
        ],
    };
}

function mixedWallShearEnvelopeCase() {
    return {
        id: "rc-wall-mixed-system-shear-envelope",
        title: "Mixed-system wall shear envelope (Fig. 7.4.5)",
        category: "reinforced-concrete-shear-wall",
        source: "D.M. 17/01/2018, NTC 2018 § 7.4.4.5.1, Fig. 7.4.5",
        sourceKind: "independent-calculation",
        notes:
            "VB is not allowed below VA/2. The envelope is linear from the base to h_w/3 and constant above.",
        evaluate() {
            const result = computeMixedSystemWallShearEnvelope({
                wallHeight: 18,
                baseAmplifiedShear: 360,
                analysisShearAtOneThird: 120,
                elevations: [0, 3, 6, 12, 18],
            });
            // Independent: h_w/3=6; VB=max(120,360/2)=180.
            // Linear ordinate at z=3 is 360+(180-360)*3/6=270.
            const expected = [360, 270, 180, 180, 180];
            return {
                transitionElevation: result.transitionElevation,
                shearAtOneThird: result.shearAtOneThird,
                midLowerThirdShear: result.points[1].shearDemand,
                independentMatches: result.points.every((point, index) =>
                    approxPath(point.shearDemand, expected[index], 1e-12)),
            };
        },
        expectations: [
            {
                id: "transition",
                path: "transitionElevation",
                expected: 6,
                tolerance: 1e-12,
            },
            {
                id: "vb",
                path: "shearAtOneThird",
                expected: 180,
                tolerance: 1e-12,
            },
            {
                id: "mid",
                path: "midLowerThirdShear",
                expected: 270,
                tolerance: 1e-12,
            },
            {
                id: "independent",
                path: "independentMatches",
                expected: true,
                type: "equal",
            },
        ],
    };
}

function diagonalCouplingBeamCase() {
    return {
        id: "rc-wall-diagonal-coupling-beam",
        title: "Diagonal coupling-beam shear resistance (Eq. 7.4.24)",
        category: "reinforced-concrete-shear-wall",
        source:
            "D.M. 17/01/2018, NTC 2018 §§ 7.4.4.6 e 7.4.6.2.5, Eq. [7.4.24]",
        sourceKind: "independent-calculation",
        notes:
            "A short, highly stressed coupling beam requires two diagonal reinforcement bundles. Units are kN and m.",
        evaluate() {
            const areaPerDiagonal = 0.001;
            const fyd = 450000;
            const angle = Math.PI / 4;
            const result = createCouplingBeamAssessment({
                beamId: "CB-1",
                clearSpan: 1.20,
                sectionHeight: 0.60,
                slabThickness: 0.20,
                width: 0.30,
                effectiveDepth: 0.50,
                shearDemand: 500,
                concreteTensileDesignStrength: 1500,
                chapter4FlexuralVerification: {
                    id: "independent-flexure",
                    ok: true,
                },
                diagonalReinforcement: {
                    areaPerDiagonal,
                    designYieldStrength: fyd,
                    minimumAngle: angle,
                    confinementSpacing: 0.10,
                    distributedBarDiameter: 0.010,
                    distributedBarSpacing: 0.10,
                    edgeBarCountPerEdge: 2,
                    edgeBarDiameter: 0.016,
                    providedAnchorageLength: 1.50,
                    nonSeismicAnchorageLength: 1.00,
                },
            });
            const shearCheck = result.checks.find((item) =>
                item.id === "coupling-beam-diagonal-shear");
            // Independent Eq. [7.4.24]: VRd=2*As*fyd*sin(alpha).
            const independentCapacity =
                2 * areaPerDiagonal * fyd * Math.sin(angle);
            return {
                procedure: result.procedure,
                diagonalCapacity: shearCheck.capacity,
                ok: result.ok,
                independentMatches:
                    result.procedure === "diagonal-X" &&
                    approxPath(
                        shearCheck.capacity,
                        independentCapacity,
                        1e-9,
                    ) &&
                    result.ok === (500 <= independentCapacity),
            };
        },
        expectations: [
            {
                id: "procedure",
                path: "procedure",
                expected: "diagonal-X",
                type: "equal",
            },
            {
                id: "capacity",
                path: "diagonalCapacity",
                expected: 636.3961030678927,
                tolerance: 1e-9,
            },
            { id: "ok", path: "ok", expected: true, type: "equal" },
            {
                id: "independent",
                path: "independentMatches",
                expected: true,
                type: "equal",
            },
        ],
    };
}

// ---------------------------------------------------------------------------
// Shear wall biaxial bending (pressoflessione deviata)
// ---------------------------------------------------------------------------

function wallBiaxialBendingCase() {
    const units = Object.freeze({ force: "N", length: "mm" });
    return {
        id: "rc-wall-biaxial-bending",
        title: "Shear wall biaxial bending via fiber solver (§ 4.1.2.3.9, § 7.4.4.5.1)",
        category: "reinforced-concrete-shear-wall",
        source:
            "D.M. 17/01/2018, NTC 2018 § 4.1.2.3.9, § 7.4.4.5.1; independent dense-domain sampling and point-in-polygon bisection",
        sourceKind: "independent-calculation",
        notes:
            "An asymmetric 500x300 mm section (C25/30, B450C, 8 phi 16) is verified under N, Mx, My. A denser domain is sampled independently and its radial boundary is found by point-in-polygon bisection; the obsolete neutral-axis-direction shortcut must give a measurably different result.",
        evaluate() {
            const concreteMaterial = createNTC2018ConcreteMaterial({
                strengthClass: "C25/30",
                units,
            });
            const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
                grade: "B450C",
                units,
            });
            // Deliberately asymmetric reinforcement: the neutral-axis
            // orientation cannot be identified with the moment-ray direction.
            const barDiameter = 16;
            const barPositions = [
                [40, 40], [40, 105], [40, 260],
                [460, 40], [460, 260],
                [315, 45], [245, 260], [175, 260],
            ];
            const section = new ReinforcedConcreteSection({
                id: "validation-wall",
                concreteSection: new RectangularSection({
                    width: 300,
                    height: 500,
                    units,
                }),
                concreteMaterial,
                reinforcementMaterial,
                reinforcementBars: barPositions.map(([y, z], i) =>
                    new ReinforcementBar({
                        id: `wall-bar-${i + 1}`,
                        diameter: barDiameter,
                        material: reinforcementMaterial,
                        y,
                        z,
                        units,
                    })),
                units,
            });

            const fcd = concreteMaterial.fcd;
            const fyd = reinforcementMaterial.fyd;
            const nEd = -500_000; // compression (solver convention)
            const mxEd = 20_000_000;
            const myEd = 5_000_000;

            const result = verifyWallBiaxialBending({
                section,
                axialForce: nEd,
                momentX: mxEd,
                momentY: myEd,
                concreteDesignStrength: fcd,
                reinforcementDesignStrength: fyd,
                targetFiberCount: 240,
                angleCount: 48,
            });

            // Independent reference: sample a three-times denser domain without
            // using RCBiaxialDomainBuilder, then locate the radial boundary via
            // point-in-polygon bisection rather than segment intersection.
            const concreteFibers = new SectionFiberDiscretizer().discretize(section, {
                targetCount: 240,
            }).fibers;
            const concreteLaw = new ConcreteParabolaRectangleLaw({
                fcd, ec2: 0.002, ecu: 0.0035,
            });
            const steelLaw = new SteelElasticPerfectlyPlasticLaw({
                Es: 200000, fyd, esu: 0.01,
            });
            const solver = new RCUltimateSectionSolver();
            const densePointCount = 144;
            const densePoints = Array.from(
                { length: densePointCount },
                (_, index) => {
                    const solved = solver.solveAtAxialLoad({
                        section,
                        concreteFibers,
                        concreteLaw,
                        steelLaw,
                        nEd,
                        theta: (2 * Math.PI * index) / densePointCount,
                        compressedSide: "positive",
                    });
                    return { x: solved.MxRd, y: solved.MyRd };
                },
            );
            const independentCapacity = estimateRayCapacityByBisection(
                densePoints,
                mxEd,
                myEd,
            );
            const independentDemand = Math.hypot(mxEd, myEd);
            const independentRatio = independentDemand / independentCapacity;

            const obsoleteTheta = Math.atan2(mxEd, myEd);
            const obsoleteSolved = solver.solveAtAxialLoad({
                section,
                concreteFibers,
                concreteLaw,
                steelLaw,
                nEd,
                theta: obsoleteTheta,
                compressedSide: "positive",
            });
            const obsoleteCapacity = Math.hypot(
                obsoleteSolved.MxRd,
                obsoleteSolved.MyRd,
            );

            // Zero bending still solves the assigned axial-force domain.
            const zero = verifyWallBiaxialBending({
                section,
                axialForce: nEd,
                momentX: 0,
                momentY: 0,
                concreteDesignStrength: fcd,
                reinforcementDesignStrength: fyd,
                targetFiberCount: 120,
                angleCount: 8,
            });

            return {
                capacity: result.capacity,
                demand: result.demand,
                utilizationRatio: result.utilizationRatio,
                axialResidual: result.axialResidual,
                zeroDemandOk: zero.ok,
                obsoleteShortcutDiffers:
                    Math.abs(obsoleteCapacity - independentCapacity) /
                    independentCapacity >
                    0.005,
                independentMatches:
                    approxPath(result.capacity, independentCapacity, independentCapacity * 0.01) &&
                    approxPath(result.demand, independentDemand, 1e-6) &&
                    approxPath(result.utilizationRatio, independentRatio, 0.01),
            };
        },
        expectations: [
            { id: "demand", path: "demand", expected: Math.hypot(20e6, 5e6), tolerance: 1e-6 },
            {
                id: "capacity-positive",
                path: "capacity",
                expected: 0,
                type: "greater-than",
            },
            { id: "zero-demand-ok", path: "zeroDemandOk", expected: true, type: "equal" },
            { id: "obsolete-shortcut-differs", path: "obsoleteShortcutDiffers", expected: true, type: "equal" },
            { id: "independent", path: "independentMatches", expected: true, type: "equal" },
        ],
    };
}

// ---------------------------------------------------------------------------

export function createReinforcedConcreteGlobalValidationCases() {
    return [
        beamColumnHierarchyCase(),
        beamCapacityShearCase(),
        columnCapacityShearCase(),
        wallCriticalZoneCase(),
        wallMomentShiftCase(),
        wallCapacityShearCase(),
        wallBiaxialBendingCase(),
        pDeltaCase(),
        planRegularityCase(),
        modalMassParticipationCase(),
        mixedWallShearEnvelopeCase(),
        diagonalCouplingBeamCase(),
    ];
}
