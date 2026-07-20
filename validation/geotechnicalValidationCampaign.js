import {
  GeotechnicalDesignSituation,
  GroundModel,
  GroundProfile,
  GroundSection2D,
  LateralEarthPressureAnalysis,
  PorePressureField2D,
  SoilMaterial,
} from "../src/index.js";
import { calculateNTC2018RetainingWallSeismicCoefficients } from
  "../src/norms/ntc2018/index.js";

const units = Object.freeze({ force: "kN", length: "m" });

function soil({ id, frictionAngle, bulk, saturated = null }) {
  return new SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk, saturated },
    parameterSets: [{
      id: "characteristic-drained",
      basis: "characteristic",
      drainage: "drained",
      strength: {
        model: "mohr-coulomb-effective",
        frictionAngle,
        cohesion: 0,
      },
      provenance: { source: "validation-case-input" },
    }],
    angleUnits: "deg",
    units,
  });
}

function undrainedSoil({ id, undrainedShearStrength, bulk }) {
  return new SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk },
    parameterSets: [{
      id: "characteristic-undrained",
      basis: "characteristic",
      drainage: "undrained",
      strength: {
        model: "total-stress-undrained",
        undrainedShearStrength,
      },
      provenance: { source: "validation-case-input" },
    }],
    units,
  });
}

function profile({
  id,
  materials,
  layers,
  groundwater = null,
  groundSurfaceElevation = 10,
}) {
  return new GroundProfile({
    id,
    groundSurfaceElevation,
    materials,
    layers,
    groundwater,
    units,
  });
}

function analyze(input) {
  return new LateralEarthPressureAnalysis().analyze({
    units,
    ...input,
  });
}

function readPath(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function evaluateCase(definition) {
  const output = definition.evaluate();
  const checks = definition.expectations.map((expectation) => {
    const actual = readPath(output, expectation.path);
    const passed = Number.isFinite(actual) &&
      Math.abs(actual - expectation.expected) <= expectation.tolerance;

    return {
      id: expectation.id,
      actual,
      expected: expectation.expected,
      tolerance: expectation.tolerance,
      units: expectation.units ?? null,
      status: passed ? "ok" : "failed",
    };
  });

  return {
    id: definition.id,
    title: definition.title,
    source: definition.source,
    sourceKind: definition.sourceKind,
    assumptions: [...definition.assumptions],
    status: checks.every((check) => check.status === "ok") ? "ok" : "failed",
    checks,
  };
}

function validationCases() {
  return [
    {
      id: "rankine-homogeneous-dry-sand",
      title: "Homogeneous Rankine active pressure and resultant",
      source:
        "USACE EM 1110-2-2502 (1989), chapter 3, limiting earth-pressure equations and triangular pressure diagrams",
      sourceKind: "primary-method-reference-and-independent-arithmetic",
      assumptions: [
        "Vertical smooth yielding wall, horizontal surface, dry cohesionless soil.",
        "Independent constants: Ka=1/3; Pa=Ka*gamma*H^2/2=300 kN/m.",
      ],
      evaluate() {
        const sand = soil({ id: "sand-30", frictionAngle: 30, bulk: 18 });
        const ground = profile({
          id: "rankine-homogeneous",
          materials: [sand],
          layers: [{
            id: "sand",
            topElevation: 10,
            bottomElevation: 0,
            materialId: sand.id,
          }],
        });
        const result = analyze({
          profile: ground,
          state: "active",
          method: "rankine",
        });

        return {
          coefficient: result.outputs.diagram.segments[0].coefficient,
          force: result.outputs.diagram.resultants.totalNormal.forcePerUnitWidth,
          applicationElevation:
            result.outputs.diagram.resultants.totalNormal.applicationElevation,
        };
      },
      expectations: [
        { id: "ka", path: "coefficient", expected: 1 / 3, tolerance: 1e-12 },
        { id: "pa", path: "force", expected: 300, tolerance: 1e-9, units: "kN/m" },
        {
          id: "application-elevation",
          path: "applicationElevation",
          expected: 10 / 3,
          tolerance: 1e-12,
          units: "m",
        },
      ],
    },
    {
      id: "rankine-layered-effective-stress",
      title: "Layered Rankine diagram with a coefficient jump",
      source:
        "USACE EM 1110-2-2502 (1989), chapter 3, layered-soil pressure diagrams",
      sourceKind: "primary-method-reference-and-independent-arithmetic",
      assumptions: [
        "Two dry cohesionless layers; accumulated vertical stress is continuous.",
        "The independent resultant is the sum of one triangle and one trapezoid.",
      ],
      evaluate() {
        const upper = soil({ id: "upper-30", frictionAngle: 30, bulk: 18 });
        const lower = soil({ id: "lower-36", frictionAngle: 36, bulk: 20 });
        const ground = profile({
          id: "rankine-layered",
          materials: [upper, lower],
          layers: [
            {
              id: "upper",
              topElevation: 10,
              bottomElevation: 5,
              materialId: upper.id,
            },
            {
              id: "lower",
              topElevation: 5,
              bottomElevation: 0,
              materialId: lower.id,
            },
          ],
        });
        const result = analyze({
          profile: ground,
          state: "active",
          method: "rankine",
        });

        return {
          lowerCoefficient: result.outputs.diagram.segments[1].coefficient,
          force: result.outputs.diagram.resultants.totalNormal.forcePerUnitWidth,
        };
      },
      expectations: [
        {
          id: "lower-ka",
          path: "lowerCoefficient",
          expected: 0.2596161836824997,
          tolerance: 1e-12,
        },
        {
          id: "layered-resultant",
          path: "force",
          expected: 256.7313285777498,
          tolerance: 1e-9,
          units: "kN/m",
        },
      ],
    },
    {
      id: "rankine-hydrostatic-separation",
      title: "Effective soil pressure plus hydrostatic water pressure",
      source:
        "USACE EM 1110-2-2502 (1989), chapter 3, effective earth pressure and water-pressure separation",
      sourceKind: "primary-method-reference-and-independent-arithmetic",
      assumptions: [
        "Water table at mid-height; hydrostatic pore pressure with gamma_w=9.81 kN/m3.",
        "Saturated soil unit weight is 20 kN/m3 below the water table.",
      ],
      evaluate() {
        const sand = soil({
          id: "saturated-sand-30",
          frictionAngle: 30,
          bulk: 18,
          saturated: 20,
        });
        const ground = profile({
          id: "rankine-water",
          materials: [sand],
          layers: [{
            id: "sand",
            topElevation: 10,
            bottomElevation: 0,
            materialId: sand.id,
          }],
          groundwater: {
            model: "hydrostatic",
            waterTableElevation: 5,
            waterUnitWeight: 9.81,
          },
        });
        const result = analyze({
          profile: ground,
          state: "active",
          method: "rankine",
        });
        const resultants = result.outputs.diagram.resultants;

        return {
          soilForce: resultants.effectiveSoilNormal.forcePerUnitWidth,
          waterForce: resultants.waterNormal.forcePerUnitWidth,
          totalForce: resultants.totalNormal.forcePerUnitWidth,
        };
      },
      expectations: [
        {
          id: "effective-soil-force",
          path: "soilForce",
          expected: 267.4583333333333,
          tolerance: 1e-9,
          units: "kN/m",
        },
        {
          id: "water-force",
          path: "waterForce",
          expected: 122.625,
          tolerance: 1e-9,
          units: "kN/m",
        },
        {
          id: "total-force",
          path: "totalForce",
          expected: 390.0833333333333,
          tolerance: 1e-9,
          units: "kN/m",
        },
      ],
    },
    {
      id: "mononobe-okabe-dry-active",
      title: "Mononobe-Okabe active coefficient and total thrust",
      source:
        "USACE EM 1110-2-2100 (2005), appendix G, equations G-1 and G-2",
      sourceKind: "primary-method-reference-and-independent-equation-evaluation",
      assumptions: [
        "Vertical smooth wall, horizontal surface, dry cohesionless soil, phi=35 deg.",
        "kh=0.20, kv=0; independently evaluated KAE=0.3955858126218416.",
      ],
      evaluate() {
        const sand = soil({ id: "sand-35", frictionAngle: 35, bulk: 18 });
        const ground = profile({
          id: "mononobe-okabe",
          materials: [sand],
          layers: [{
            id: "sand",
            topElevation: 10,
            bottomElevation: 0,
            materialId: sand.id,
          }],
        });
        const result = analyze({
          profile: ground,
          state: "seismic-active",
          method: "mononobe-okabe-active",
          seismic: { kh: 0.2, kv: 0, distributionModel: "resultant-only" },
        });

        return {
          coefficient: result.outputs.coefficients.seismic.coefficient,
          force: result.outputs.resultants.seismicTotal.magnitude,
        };
      },
      expectations: [
        {
          id: "kae",
          path: "coefficient",
          expected: 0.3955858126218416,
          tolerance: 1e-12,
        },
        {
          id: "pae",
          path: "force",
          expected: 356.02723135965743,
          tolerance: 1e-9,
          units: "kN/m",
        },
      ],
    },
    {
      id: "coulomb-sloping-active-passive",
      title: "Coulomb active and passive coefficients for sloping ground",
      source:
        "USACE EM 1110-2-2502 (1989), sections 3-12b and 3-12c",
      sourceKind: "primary-method-reference-and-independent-equation-evaluation",
      assumptions: [
        "Vertical smooth wall, homogeneous dry cohesionless soil, phi=30 deg and beta=10 deg.",
        "Independent equation values: Ka=0.3736789578194454 and Kp=4.080353483615686.",
      ],
      evaluate() {
        const sand = soil({ id: "sloping-sand-30", frictionAngle: 30, bulk: 18 });
        const ground = profile({
          id: "coulomb-sloping",
          materials: [sand],
          layers: [{
            id: "sand",
            topElevation: 10,
            bottomElevation: 0,
            materialId: sand.id,
          }],
        });
        const geometry = { backfillInclination: 10, angleUnits: "deg" };
        const active = analyze({
          profile: ground,
          state: "active",
          method: "coulomb-active",
          geometry,
        });
        const passive = analyze({
          profile: ground,
          state: "passive",
          method: "coulomb-passive",
          geometry,
        });

        return {
          activeCoefficient: active.outputs.diagram.segments[0].coefficient,
          activeForce:
            active.outputs.diagram.resultants.totalNormal.forcePerUnitWidth,
          passiveCoefficient: passive.outputs.diagram.segments[0].coefficient,
          passiveForce:
            passive.outputs.diagram.resultants.totalNormal.forcePerUnitWidth,
        };
      },
      expectations: [
        {
          id: "sloping-ka",
          path: "activeCoefficient",
          expected: 0.3736789578194454,
          tolerance: 1e-12,
        },
        {
          id: "sloping-active-force",
          path: "activeForce",
          expected: 336.31106203750085,
          tolerance: 1e-9,
          units: "kN/m",
        },
        {
          id: "sloping-kp",
          path: "passiveCoefficient",
          expected: 4.080353483615686,
          tolerance: 1e-12,
        },
        {
          id: "sloping-passive-force",
          path: "passiveForce",
          expected: 3672.3181352541174,
          tolerance: 1e-9,
          units: "kN/m",
        },
      ],
    },
    {
      id: "rankine-undrained-total-stress",
      title: "Rankine undrained active and passive total-stress pressure",
      source:
        "USACE EM 1110-2-2502 (1989), sections 3-12b(7) and 3-12c(2)",
      sourceKind: "primary-method-reference-and-independent-integration",
      assumptions: [
        "Vertical smooth wall, phi_u=0, su=20 kN/m2, gamma=18 kN/m3 and H=10 m.",
        "The active tension cutoff depth is 2su/gamma=2.2222222222 m.",
      ],
      evaluate() {
        const clay = undrainedSoil({
          id: "undrained-clay",
          undrainedShearStrength: 20,
          bulk: 18,
        });
        const ground = profile({
          id: "rankine-undrained",
          materials: [clay],
          layers: [{
            id: "clay",
            topElevation: 10,
            bottomElevation: 0,
            materialId: clay.id,
          }],
        });
        const active = analyze({
          profile: ground,
          state: "active",
          method: "rankine",
        });
        const passive = analyze({
          profile: ground,
          state: "passive",
          method: "rankine",
        });

        return {
          activeForce:
            active.outputs.diagram.resultants.totalNormal.forcePerUnitWidth,
          passiveForce:
            passive.outputs.diagram.resultants.totalNormal.forcePerUnitWidth,
        };
      },
      expectations: [
        {
          id: "undrained-active-force",
          path: "activeForce",
          expected: 544.4444444444445,
          tolerance: 1e-9,
          units: "kN/m",
        },
        {
          id: "undrained-passive-force",
          path: "passiveForce",
          expected: 1300,
          tolerance: 1e-9,
          units: "kN/m",
        },
      ],
    },
    {
      id: "trial-wedge-homogeneous-mononobe-okabe",
      title: "Homogeneous pseudostatic trial wedge against Mononobe-Okabe",
      source:
        "USACE EM 1110-2-2502 (1989), section 3-13; FHWA-HRT-05-067 (2006), section 6.4.2.1; USACE EM 1110-2-2100 (2005), appendix G",
      sourceKind: "primary-method-references-and-independent-closed-form-benchmark",
      assumptions: [
        "Vertical smooth wall, horizontal surface, dry cohesionless soil, phi=35 deg, kh=0.20 and kv=0.",
        "Independent Mononobe-Okabe coefficient is 0.3955858126218416.",
      ],
      evaluate() {
        const sand = soil({ id: "wedge-sand-35", frictionAngle: 35, bulk: 18 });
        const ground = profile({
          id: "trial-wedge-homogeneous",
          materials: [sand],
          layers: [{
            id: "sand",
            topElevation: 10,
            bottomElevation: 0,
            materialId: sand.id,
          }],
        });
        const result = analyze({
          profile: ground,
          state: "seismic-active",
          method: "trial-wedge-pseudostatic",
          seismic: { kh: 0.2, kv: 0 },
        });

        return {
          coefficient: result.outputs.homogeneousEquivalentCoefficient,
          force: result.outputs.resultants.seismicTotal.magnitude,
          slipPlaneAngle:
            result.outputs.criticalWedges.seismic.slipPlaneAngle,
        };
      },
      expectations: [
        {
          id: "homogeneous-wedge-kae",
          path: "coefficient",
          expected: 0.3955858126218416,
          tolerance: 1e-10,
        },
        {
          id: "homogeneous-wedge-force",
          path: "force",
          expected: 356.02723135965743,
          tolerance: 1e-8,
          units: "kN/m",
        },
        {
          id: "homogeneous-wedge-angle",
          path: "slipPlaneAngle",
          expected: 0.9310517969107852,
          tolerance: 2e-8,
          units: "rad",
        },
      ],
    },
    {
      id: "trial-wedge-two-horizontal-layers",
      title: "Two-layer constant-inclination pseudostatic trial wedge",
      source:
        "USACE EM 1110-2-2502 (1989), section 3-13c(4)(b); independent two-segment force expression",
      sourceKind: "primary-method-reference-and-independent-segment-arithmetic",
      assumptions: [
        "Upper layer: H=5 m, gamma=18 kN/m3, phi=30 deg; lower layer: H=5 m, gamma=20 kN/m3, phi=34 deg.",
        "For kh=0.1 and kv=0, independent segment weights are Wlower=700/tan(alpha) and Wupper=225/tan(alpha).",
        "Independent maximization gives alpha=0.9971161178900505 rad and P=327.4845012731173 kN/m.",
      ],
      evaluate() {
        const upper = soil({ id: "wedge-upper", frictionAngle: 30, bulk: 18 });
        const lower = soil({ id: "wedge-lower", frictionAngle: 34, bulk: 20 });
        const ground = profile({
          id: "trial-wedge-layered",
          materials: [upper, lower],
          layers: [
            {
              id: "upper",
              topElevation: 10,
              bottomElevation: 5,
              materialId: upper.id,
            },
            {
              id: "lower",
              topElevation: 5,
              bottomElevation: 0,
              materialId: lower.id,
            },
          ],
        });
        const result = analyze({
          profile: ground,
          state: "seismic-active",
          method: "trial-wedge-pseudostatic",
          seismic: { kh: 0.1, kv: 0 },
        });

        return {
          force: result.outputs.resultants.seismicTotal.magnitude,
          slipPlaneAngle:
            result.outputs.criticalWedges.seismic.slipPlaneAngle,
          segmentCount: result.outputs.criticalWedges.seismic.segments.length,
        };
      },
      expectations: [
        {
          id: "layered-wedge-force",
          path: "force",
          expected: 327.4845012731173,
          tolerance: 1e-8,
          units: "kN/m",
        },
        {
          id: "layered-wedge-angle",
          path: "slipPlaneAngle",
          expected: 0.9971161178900505,
          tolerance: 2e-8,
          units: "rad",
        },
        {
          id: "layered-wedge-segments",
          path: "segmentCount",
          expected: 2,
          tolerance: 0,
        },
      ],
    },
    {
      id: "trial-wedge-inclined-frictional-static-recovery",
      title: "Inclined frictional trial wedge against static Coulomb",
      source:
        "Caltrans Trenching and Shoring Manual (2025), chapter 4, section 4-5.01; USACE EM 1110-2-2502 (1989), Coulomb planar-wedge equation",
      sourceKind: "primary-method-references-and-independent-closed-form-benchmark",
      assumptions: [
        "Homogeneous dry cohesionless soil with phi=35 deg; wall top is inclined 8 deg toward retained ground, beta=5 deg and delta=12 deg.",
        "At kh=kv=0, independent Coulomb evaluation gives Ka=0.2100609450346865 and Pa=189.05485053121785 kN/m.",
      ],
      evaluate() {
        const sand = soil({
          id: "inclined-wedge-sand-35",
          frictionAngle: 35,
          bulk: 18,
        });
        const ground = profile({
          id: "trial-wedge-inclined",
          materials: [sand],
          layers: [{
            id: "sand",
            topElevation: 10,
            bottomElevation: 0,
            materialId: sand.id,
          }],
        });
        const result = analyze({
          profile: ground,
          state: "seismic-active",
          method: "trial-wedge-pseudostatic",
          geometry: {
            wallInclinationFromVertical: 8,
            backfillInclination: 5,
            angleUnits: "deg",
          },
          interface: { frictionAngle: 12, angleUnits: "deg" },
          seismic: { kh: 0, kv: 0 },
        });

        return {
          coefficient: result.outputs.homogeneousEquivalentCoefficient,
          force: result.outputs.resultants.seismicTotal.magnitude,
          normalForce: result.outputs.resultants.seismicTotal.normal,
          tangentForce: result.outputs.resultants.seismicTotal.tangent,
        };
      },
      expectations: [
        {
          id: "inclined-frictional-ka",
          path: "coefficient",
          expected: 0.2100609450346865,
          tolerance: 1e-10,
        },
        {
          id: "inclined-frictional-force",
          path: "force",
          expected: 189.05485053121785,
          tolerance: 1e-8,
          units: "kN/m",
        },
        {
          id: "inclined-frictional-normal",
          path: "normalForce",
          expected: 184.923548454199,
          tolerance: 1e-8,
          units: "kN/m",
        },
        {
          id: "inclined-frictional-tangent",
          path: "tangentForce",
          expected: 39.306713631244264,
          tolerance: 1e-8,
          units: "kN/m",
        },
      ],
    },
    {
      id: "ground-section-2d-spatial-query",
      title: "GroundSection2D linear surface and material-zone query",
      source:
        "JRC, Assembling the Ground Model and the Derived Values (2024), ground model represented through maps, sections and derived values",
      sourceKind: "primary-concept-reference-and-independent-geometry-arithmetic",
      assumptions: [
        "The ground surface is linear between (0,10) m and (10,8) m.",
        "The query point (5,7) m is strictly inside the upper material zone.",
      ],
      evaluate() {
        const section = new GroundSection2D({
          id: "validation-section",
          surface: {
            points: [{ x: 0, z: 10 }, { x: 10, z: 8 }],
          },
          zones: [
            {
              id: "upper",
              materialId: "sand",
              polygon: [
                { x: 0, z: 5 }, { x: 10, z: 5 },
                { x: 10, z: 8 }, { x: 0, z: 10 },
              ],
            },
            {
              id: "lower",
              materialId: "clay",
              polygon: [
                { x: 0, z: 0 }, { x: 10, z: 0 },
                { x: 10, z: 5 }, { x: 0, z: 5 },
              ],
            },
          ],
          units,
        });
        return {
          surfaceElevation: section.surfaceElevationAt(5),
          upperZoneSelected:
            section.getMaterialIdAtPoint({ x: 5, z: 7 }) === "sand" ? 1 : 0,
        };
      },
      expectations: [
        {
          id: "linear-surface-elevation",
          path: "surfaceElevation",
          expected: 9,
          tolerance: 1e-12,
          units: "m",
        },
        {
          id: "upper-zone-selection",
          path: "upperZoneSelected",
          expected: 1,
          tolerance: 0,
        },
      ],
    },
    {
      id: "pore-pressure-field-2d-interpolation",
      title: "PorePressureField2D phreatic and bilinear interpolation",
      source:
        "USACE EM 1110-2-1902 (2003), pore-water pressures in slope-stability analysis; independent linear and bilinear interpolation arithmetic",
      sourceKind: "primary-method-reference-and-independent-interpolation-arithmetic",
      assumptions: [
        "The phreatic elevation at x=5 m is 5 m and gamma_w=10 kN/m3.",
        "The assigned 2x2 grid is interpolated at its geometric center.",
      ],
      evaluate() {
        const phreatic = new PorePressureField2D({
          id: "validation-phreatic",
          model: "phreatic-line",
          phreaticLine: {
            points: [{ x: 0, z: 6 }, { x: 10, z: 4 }],
          },
          waterUnitWeight: 10,
          units,
        });
        const grid = new PorePressureField2D({
          id: "validation-grid",
          model: "assigned-grid",
          assignedGrid: {
            xCoordinates: [0, 10],
            zCoordinates: [0, 10],
            values: [[0, 10], [20, 30]],
          },
          units,
        });
        return {
          phreaticPressure: phreatic.porePressureAt({ x: 5, z: 2 }),
          gridPressure: grid.porePressureAt({ x: 5, z: 5 }),
        };
      },
      expectations: [
        {
          id: "phreatic-pressure",
          path: "phreaticPressure",
          expected: 30,
          tolerance: 1e-12,
          units: "kN/m2",
        },
        {
          id: "bilinear-grid-pressure",
          path: "gridPressure",
          expected: 15,
          tolerance: 1e-12,
          units: "kN/m2",
        },
      ],
    },
    {
      id: "ground-model-design-situation-resolution",
      title: "GroundModel upgrade and design-situation parameter resolution",
      source:
        "JRC, Assembling the Ground Model and the Derived Values (2024); second-generation Eurocode 7 separation of ground model and design values",
      sourceKind: "primary-concept-reference-and-independent-contract-arithmetic",
      assumptions: [
        "A horizontal GroundProfile is extruded over 10 m without changing elevations.",
        "The characteristic drained parameter set is explicitly selected for the material zone.",
      ],
      evaluate() {
        const sand = soil({ id: "model-sand", frictionAngle: 30, bulk: 18 });
        const groundProfile = profile({
          id: "model-profile",
          materials: [sand],
          layers: [{
            id: "model-layer",
            topElevation: 10,
            bottomElevation: 0,
            materialId: sand.id,
          }],
        });
        const groundModel = GroundModel.fromGroundProfile({
          profile: groundProfile,
          maximumX: 10,
        });
        const situation = new GeotechnicalDesignSituation({
          id: "model-situation",
          groundModel,
          drainageCondition: "drained",
          requiredParameterBasis: "characteristic",
          sectionId: groundModel.defaultSectionId,
          parameterSelection: {
            byZone: { "model-layer": "characteristic-drained" },
          },
          units,
        });
        const resolved = situation.resolveParameterSet({
          groundModel,
          zoneId: "model-layer",
        });
        return {
          surfaceElevation: groundModel.getSection().surfaceElevationAt(5),
          frictionAngle: resolved.parameterSet.strength.frictionAngle,
          zoneSelectionUsed: resolved.selectionSource === "zone" ? 1 : 0,
        };
      },
      expectations: [
        {
          id: "extruded-surface-elevation",
          path: "surfaceElevation",
          expected: 10,
          tolerance: 1e-12,
          units: "m",
        },
        {
          id: "resolved-friction-angle",
          path: "frictionAngle",
          expected: Math.PI / 6,
          tolerance: 1e-12,
          units: "rad",
        },
        {
          id: "zone-selection-precedence",
          path: "zoneSelectionUsed",
          expected: 1,
          tolerance: 0,
        },
      ],
    },
    {
      id: "ntc2018-retaining-wall-seismic-coefficients",
      title: "NTC 2018 retaining-wall seismic coefficients",
      source: "D.M. 17/01/2018, NTC 2018, section 7.11.6.2.1",
      sourceKind: "primary-code-reference-and-independent-arithmetic",
      assumptions: [
        "amax/g=0.25 and betaM=0.38 are explicit input data.",
        "The vertical coefficient magnitude is 0.5*kh.",
      ],
      evaluate() {
        const result = calculateNTC2018RetainingWallSeismicCoefficients({
          maximumSiteAccelerationRatio: 0.25,
          betaM: 0.38,
        });

        return {
          kh: result.kh,
          verticalMagnitude: result.verticalMagnitude,
          reducedGravityKv: result.verticalCases[0].kv,
          increasedGravityKv: result.verticalCases[1].kv,
        };
      },
      expectations: [
        { id: "kh", path: "kh", expected: 0.095, tolerance: 1e-15 },
        {
          id: "kv-magnitude",
          path: "verticalMagnitude",
          expected: 0.0475,
          tolerance: 1e-15,
        },
        {
          id: "kv-reduced-gravity",
          path: "reducedGravityKv",
          expected: 0.0475,
          tolerance: 1e-15,
        },
        {
          id: "kv-increased-gravity",
          path: "increasedGravityKv",
          expected: -0.0475,
          tolerance: 1e-15,
        },
      ],
    },
  ];
}

export function runGeotechnicalValidationCampaign() {
  const results = validationCases().map(evaluateCase);
  const passed = results.filter((result) => result.status === "ok").length;

  return {
    id: "geotechnical-earth-pressure-validation-campaign",
    status: passed === results.length ? "ok" : "failed",
    caseCount: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export function formatGeotechnicalValidationReport(campaign) {
  const lines = [
    "# Geotechnical earth-pressure validation campaign",
    "",
    `Status: ${campaign.status}`,
    `Cases: ${campaign.caseCount}; passed: ${campaign.passed}; failed: ${campaign.failed}`,
    "",
  ];

  for (const result of campaign.results) {
    lines.push(`- ${result.id}: ${result.status} (${result.source})`);
  }

  return lines.join("\n");
}
