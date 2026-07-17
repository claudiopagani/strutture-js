import {
  RectangularSection,
  ReinforcedConcreteBeamColumnJoint3DModel,
  ReinforcedConcreteBeamColumnJointApplication,
  ReinforcedConcreteBeamColumnJointModel,
  ReinforcedConcreteBeamDetailingVerification,
  ReinforcedConcreteColumnApplication,
  ReinforcedConcreteColumnModel,
  ReinforcedConcreteFoundationBeamApplication,
  ReinforcedConcreteFoundationBeamModel,
  ReinforcedConcreteIsolatedFootingApplication,
  ReinforcedConcreteIsolatedFootingModel,
  ReinforcedConcreteSection,
  ReinforcementBar,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = Object.freeze({ force: "N", length: "mm" });

function materials() {
  return {
    concreteMaterial: createNTC2018ConcreteMaterial({
      strengthClass: "C25/30",
      units,
    }),
    reinforcementMaterial: createNTC2018ReinforcementSteelMaterial({
      grade: "B450C",
      units,
    }),
  };
}

function rectangularRcSection({ id, width, height, barDiameter, coordinates }) {
  const { concreteMaterial, reinforcementMaterial } = materials();
  const section = new ReinforcedConcreteSection({
    id,
    concreteSection: new RectangularSection({ width, height, units }),
    concreteMaterial,
    reinforcementMaterial,
    reinforcementBars: coordinates.map(
      ([y, z], index) => new ReinforcementBar({
        id: `${id}-bar-${index + 1}`,
        diameter: barDiameter,
        y,
        z,
        material: reinforcementMaterial,
        units,
      }),
    ),
    units,
  });

  return { section, concreteMaterial, reinforcementMaterial };
}

function checkById(result, id) {
  const check = result.checks.find((item) => item.id === id);
  if (!check) {
    throw new Error(`Expected verification check ${id}.`);
  }
  return check;
}

function beamLocalCompletionCase() {
  return {
    id: "rc-beam-local-detailing-ductility-anchorage",
    title: "RC beam local detailing, ductility and anchorage",
    category: "reinforced-concrete-beams",
    source:
      "NTC 2018 §§4.1.6.1.1, 7.4.6.1.1 and 7.4.6.2.1; EN 1992-1-1:2004 §8.4",
    sourceKind: "independent-calculation",
    notes:
      "Independent arithmetic checks the critical-zone length, longitudinal steel area, hoop spacing and design anchorage length for one complete local detailing contract.",
    evaluate() {
      const { concreteMaterial, reinforcementMaterial } = materials();
      const result = new ReinforcedConcreteBeamDetailingVerification().verify({
        section: new RectangularSection({ width: 300, height: 500, units }),
        concreteMaterial,
        reinforcementMaterial,
        detailing: {
          geometry: { effectiveDepth: 450 },
          longitudinal: {
            top: { diameter: 16, barCount: 4 },
            bottom: { diameter: 16, barCount: 4 },
          },
          transverse: {
            diameter: 8,
            spacing: 90,
            areaPerSet: 100.53,
            hookAngle: 135,
            hookExtension: 80,
          },
          seismic: {
            enabled: true,
            ductilityClass: "CDA",
            firstHoopDistance: 50,
          },
          anchors: [{ id: "support-top", diameter: 16, availableLength: 1000 }],
        },
      });
      const anchorage = checkById(result, "rc-beam-anchorage-support-top");
      const expectedLayerArea = 4 * Math.PI * 16 ** 2 / 4;
      const fctd = 0.7 * concreteMaterial.fctm /
        concreteMaterial.metadata.gammaC;
      const fbd = 2.25 * fctd;
      const expectedAnchorage = 16 / 4 * (1.25 * 450) / fbd;
      const expectedSeismicSpacing = Math.min(450 / 4, 175, 6 * 16, 24 * 8);

      return {
        status: result.status,
        criticalZoneLength: result.outputs.seismic.criticalZoneLength,
        seismicMaximumSpacing: result.outputs.seismic.seismicMaximumSpacing,
        topArea: result.outputs.longitudinal.top.area,
        anchorageDemand: anchorage.demand,
        independentArithmeticMatches:
          Math.abs(result.outputs.seismic.criticalZoneLength - 1.5 * 500) < 1e-12 &&
          Math.abs(result.outputs.seismic.seismicMaximumSpacing - expectedSeismicSpacing) < 1e-12 &&
          Math.abs(result.outputs.longitudinal.top.area - expectedLayerArea) < 1e-9 &&
          Math.abs(anchorage.demand - expectedAnchorage) < 1e-6,
      };
    },
    expectations: [
      { id: "status", path: "status", expected: "ok", type: "equal" },
      { id: "critical-zone", path: "criticalZoneLength", expected: 750, tolerance: 1e-12 },
      { id: "hoop-spacing", path: "seismicMaximumSpacing", expected: 96, tolerance: 1e-12 },
      { id: "longitudinal-area", path: "topArea", expected: 804.247719319, tolerance: 1e-9 },
      { id: "independent-arithmetic", path: "independentArithmeticMatches", expected: true, type: "equal" },
    ],
  };
}

function columnLocalCompletionCase() {
  return {
    id: "rc-column-local-second-order-shear-confinement",
    title: "RC column second order, shear, confinement and ductility",
    category: "reinforced-concrete-columns",
    source:
      "NTC 2018 §§4.1.2.3.5.2, 4.1.2.3.9.2, 4.1.6.1.2 and 7.4.6.2.2, equations 7.4.29-7.4.31",
    sourceKind: "independent-calculation",
    notes:
      "The application is exercised with generated nominal-stiffness moments and explicit two-axis shear. Independent arithmetic checks Euler loads, magnification, critical-zone geometry and mechanical confinement ratio.",
    evaluate() {
      const fixture = rectangularRcSection({
        id: "validation-column-section",
        width: 300,
        height: 500,
        barDiameter: 20,
        coordinates: [[50, 50], [50, 250], [450, 50], [450, 250]],
      });
      const result = new ReinforcedConcreteColumnApplication().run({
        model: new ReinforcedConcreteColumnModel({
          id: "validation-column",
          ...fixture,
          length: 3000,
          stability: {
            effectiveLengthMx: 6000,
            effectiveLengthMy: 6000,
            biaxialAngleCount: 32,
            creepCoefficient: 2,
          },
          actions: {
            nEd: -800e3,
            mxEd: 40e6,
            myEd: 15e6,
            vxEd: 80e3,
            vyEd: 60e3,
          },
          shear: {
            x: {
              mode: "with-transverse-reinforcement",
              method: "ntc2018",
              bw: 300,
              effectiveDepth: 450,
              longitudinalReinforcementArea: 1256,
              transverseReinforcement: { diameter: 8, legs: 2, spacing: 100 },
            },
            y: {
              mode: "with-transverse-reinforcement",
              method: "ntc2018",
              bw: 500,
              effectiveDepth: 250,
              longitudinalReinforcementArea: 1256,
              transverseReinforcement: { diameter: 8, legs: 2, spacing: 100 },
            },
          },
          detailing: {
            longitudinal: {
              area: 2400,
              minimumBarDiameter: 20,
              maximumBarDiameter: 20,
              maximumBarSpacing: 180,
            },
            transverse: { diameter: 8, spacing: 90 },
            seismic: {
              enabled: true,
              ductilityClass: "CDB",
              clearHeight: 3000,
              sectionDepthInBending: 500,
              curvatureDuctilityDemand: 2,
            },
            confinement: {
              coreWidth: 260,
              coreDepth: 460,
              volumePerSet: 150000,
              restrainedBarSpacings: [100, 100, 100, 100],
            },
          },
          mesh: { targetFiberCount: 120 },
          units,
        }),
      });
      const xShear = result.checks.find(
        (check) => check.metadata?.axis === "x" && check.metadata?.analysisShear != null,
      );
      const yShear = result.checks.find(
        (check) => check.metadata?.axis === "y" && check.metadata?.analysisShear != null,
      );
      const ecm = fixture.concreteMaterial.elasticModulus;
      const gammaCE = 1.2;
      const rigidityFactor = 0.3 / (1 + 0.5 * 2);
      const expectedMxRigidity = rigidityFactor * ecm / gammaCE * (300 * 500 ** 3 / 12);
      const expectedMyRigidity = rigidityFactor * ecm / gammaCE * (500 * 300 ** 3 / 12);
      const expectedMxCriticalLoad = Math.PI ** 2 * expectedMxRigidity / 6000 ** 2;
      const expectedMyCriticalLoad = Math.PI ** 2 * expectedMyRigidity / 6000 ** 2;
      const magnification = (criticalLoad) => 1 + 1 / (criticalLoad / 800e3 - 1);
      const expectedOmegaWd =
        150000 / (260 * 460 * 90) *
        fixture.reinforcementMaterial.fyd / fixture.concreteMaterial.fcd;
      const detailing = result.outputs.detailing.outputs.seismic;

      return {
        supported: result.status !== "not-supported",
        mxGenerated: result.outputs.axes.mx.generatedTotalMoment,
        myGenerated: result.outputs.axes.my.generatedTotalMoment,
        criticalZoneLength: detailing.criticalZoneLength,
        seismicHoopSpacing: detailing.seismicHoopSpacing,
        omegaWd: detailing.omegaWd,
        shearX: xShear?.metadata.analysisShear,
        shearY: yShear?.metadata.analysisShear,
        independentArithmeticMatches:
          Math.abs(result.outputs.axes.mx.criticalLoad - expectedMxCriticalLoad) < 1 &&
          Math.abs(result.outputs.axes.my.criticalLoad - expectedMyCriticalLoad) < 1 &&
          Math.abs(result.outputs.axes.mx.generatedTotalMoment - 40e6 * magnification(expectedMxCriticalLoad)) < 10 &&
          Math.abs(result.outputs.axes.my.generatedTotalMoment - 15e6 * magnification(expectedMyCriticalLoad)) < 10 &&
          Math.abs(detailing.omegaWd - expectedOmegaWd) < 1e-9,
      };
    },
    expectations: [
      { id: "supported", path: "supported", expected: true, type: "equal" },
      { id: "critical-zone", path: "criticalZoneLength", expected: 500, tolerance: 1e-12 },
      { id: "hoop-spacing", path: "seismicHoopSpacing", expected: 150, tolerance: 1e-12 },
      { id: "analysis-shear-x", path: "shearX", expected: 80000, tolerance: 1e-12 },
      { id: "analysis-shear-y", path: "shearY", expected: 60000, tolerance: 1e-12 },
      { id: "second-order-generated", path: "mxGenerated", expected: 40000000, type: "greater-than" },
      { id: "second-order-generated-y", path: "myGenerated", expected: 15000000, type: "greater-than" },
      { id: "independent-arithmetic", path: "independentArithmeticMatches", expected: true, type: "equal" },
    ],
  };
}

function footingLocalCompletionCase() {
  return {
    id: "rc-footing-local-biaxial-contact-bearing-anchorage",
    title: "RC isolated footing biaxial contact, bearing and anchorage",
    category: "reinforced-concrete-foundations",
    source:
      "EN 1992-1-1:2004 §§6.7 and 8.4; JRC EUR 26566 EN, Eurocode 2 worked examples, 2013, §5.4",
    sourceKind: "independent-equilibrium",
    notes:
      "The complete local application is checked against vertical-force and biaxial-moment equilibrium of the compression-only contact solution, plus explicit local-bearing and anchorage contracts.",
    evaluate() {
      const { concreteMaterial, reinforcementMaterial } = materials();
      const verticalForce = 2_000_000;
      const result = new ReinforcedConcreteIsolatedFootingApplication().run({
        model: new ReinforcedConcreteIsolatedFootingModel({
          id: "validation-footing",
          geometry: { widthX: 2000, widthY: 2000, thickness: 800 },
          column: { widthX: 500, widthY: 500 },
          actions: {
            columnVerticalForce: verticalForce,
            uniformDownwardPressure: 0,
            horizontalX: 0,
            horizontalY: 0,
            momentX: 650e6,
            momentY: 650e6,
          },
          soil: {
            designBearingResistance: 10,
            bearingResistanceSource: "assigned-validation-value",
          },
          materials: { concreteMaterial, reinforcementMaterial },
          reinforcement: {
            bottom: {
              x: { diameter: 16, spacing: 100, clearCover: 40 },
              y: { diameter: 16, spacing: 100, clearCover: 40, layerOffset: 16 },
            },
          },
          localBearing: { distributionArea: 1_000_000 },
          anchorage: {
            columnBars: { diameter: 20, availableLength: 1200 },
            footingBars: {
              x: { diameter: 16, availableLength: 1000 },
              y: { diameter: 16, availableLength: 1000 },
            },
          },
          units,
        }),
      });
      const contact = result.outputs.contact;
      const residual = contact.partialContact.equilibriumResidual;
      const residualNorm = contact.partialContact.equilibriumResidualNorm;
      const bearing = checkById(result, "rc-footing-column-interface-crushing");

      return {
        supported: result.status !== "not-supported",
        contactType: contact.contactType,
        equilibriumConverged: residualNorm < 1e-6,
        normalizedVerticalEquilibriumError:
          Math.abs(residual.n) / verticalForce,
        normalizedMomentXEquilibriumError:
          Math.abs(residual.mx) / 650e6,
        normalizedMomentYEquilibriumError:
          Math.abs(residual.my) / 650e6,
        anchorageCount: result.outputs.anchorage.checkedCount,
        bearingChecked: Number.isFinite(bearing.demand) && Number.isFinite(bearing.capacity),
      };
    },
    expectations: [
      { id: "supported", path: "supported", expected: true, type: "equal" },
      { id: "contact-type", path: "contactType", expected: "partial-biaxial", type: "equal" },
      { id: "contact-convergence", path: "equilibriumConverged", expected: true, type: "equal" },
      { id: "vertical-equilibrium", path: "normalizedVerticalEquilibriumError", expected: 0, tolerance: 1e-6 },
      { id: "moment-x-equilibrium", path: "normalizedMomentXEquilibriumError", expected: 0, tolerance: 1e-6 },
      { id: "moment-y-equilibrium", path: "normalizedMomentYEquilibriumError", expected: 0, tolerance: 1e-6 },
      { id: "anchorage-count", path: "anchorageCount", expected: 3, tolerance: 0 },
      { id: "bearing-check", path: "bearingChecked", expected: true, type: "equal" },
    ],
  };
}

function foundationBeamLocalCompletionCase() {
  return {
    id: "rc-foundation-beam-local-unilateral-cracked-iteration",
    title: "RC foundation beam unilateral contact and cracked-stiffness iteration",
    category: "reinforced-concrete-foundations",
    source:
      "Hetényi, Beams on Elastic Foundation, 1946, uniform Winkler solution; EN 1992-1-1:2004 §§5.4 and 7.4",
    sourceKind: "independent-equilibrium",
    notes:
      "For a uniform downward load on a uniform free Winkler beam, the exact total reaction equals the applied load. The case also requires convergence of compression-only contact and iterative cracked stiffness.",
    evaluate() {
      const fixture = rectangularRcSection({
        id: "validation-foundation-beam-section",
        width: 400,
        height: 600,
        barDiameter: 20,
        coordinates: [[50, 50], [50, 350], [550, 50], [550, 350]],
      });
      const result = new ReinforcedConcreteFoundationBeamApplication().run({
        model: new ReinforcedConcreteFoundationBeamModel({
          id: "validation-foundation-beam",
          ...fixture,
          geometry: { start: { x: 0, y: 0 }, end: { x: 6000, y: 0 } },
          foundation: { contactWidth: 400, subgradeModulus: 0.02 },
          loads: [{ id: "g1", actionType: "G1", type: "uniform", value: -10 }],
          combinations: [{ id: "uls", limitState: "ULS", factors: { G1: 1.3 } }],
          discretization: { elementCount: 20 },
          verification: {
            serviceability: false,
            verificationStations: { mode: "all" },
          },
          units,
        }),
      });
      const combination = result.outputs.analysis.combinations.uls;
      const iteration = combination.foundationIteration;
      const expectedReaction = 10 * 1.3 * 6000;

      return {
        status: result.status,
        contactModel: iteration.contactModel,
        stiffnessIteration: iteration.stiffnessIteration,
        converged: iteration.converged,
        reactionError: Math.abs(combination.foundation.totalReaction - expectedReaction),
        verificationProducedChecks: result.checks.length > 0,
        resultAggregationConsistent:
          Object.is(result.utilizationRatio, result.outputs.verification.utilizationRatio) &&
          Object.is(result.demand, result.outputs.verification.demand) &&
          Object.is(result.capacity, result.outputs.verification.capacity),
      };
    },
    expectations: [
      { id: "status", path: "status", expected: "ok", type: "equal" },
      { id: "contact-model", path: "contactModel", expected: "compression-only", type: "equal" },
      { id: "cracked-iteration", path: "stiffnessIteration", expected: true, type: "equal" },
      { id: "convergence", path: "converged", expected: true, type: "equal" },
      { id: "global-equilibrium", path: "reactionError", expected: 0, tolerance: 1e-4 },
      { id: "local-checks", path: "verificationProducedChecks", expected: true, type: "equal" },
      { id: "aggregation", path: "resultAggregationConsistent", expected: true, type: "equal" },
    ],
  };
}

function jointFixture(overrides = {}) {
  const { concreteMaterial, reinforcementMaterial } = materials();
  const source = {
    id: "validation-joint",
    directionId: "x",
    jointType: "internal",
    ductilityClass: "CDB",
    tensionMethod: "diagonal-tension",
    geometry: {
      columnWidth: 400,
      columnDepth: 400,
      beamWidth: 300,
      beamHeight: 500,
      columnLongitudinalLayerDistance: 320,
      beamLongitudinalLayerDistance: 420,
    },
    materials: { concreteMaterial, reinforcementMaterial },
    actions: { columnAxialForce: 200000, columnShearAbove: 50000 },
    beamReinforcement: { topArea: 500, bottomArea: 500 },
    jointHoops: { diameter: 8, totalArea: 1000, areaPerSet: 220, spacing: 100 },
    confinement: {
      faceCoverageRatios: { positiveX: 1, negativeX: 1, positiveZ: 0, negativeZ: 0 },
      oppositeBeamOverlapRatios: { x: 1, z: 0 },
      adjacentColumnHoops: { controllingAreaPerSet: 200, controllingSpacing: 100 },
    },
    capacityHierarchy: {
      beamMomentResistanceSum: 200e6,
      effectiveColumnMomentResistance: 250e6,
      preReducedForMomentSigns: true,
    },
    units,
  };

  return new ReinforcedConcreteBeamColumnJointModel({
    ...source,
    ...overrides,
    geometry: { ...source.geometry, ...(overrides.geometry ?? {}) },
    materials: { ...source.materials, ...(overrides.materials ?? {}) },
    actions: { ...source.actions, ...(overrides.actions ?? {}) },
    beamReinforcement: { ...source.beamReinforcement, ...(overrides.beamReinforcement ?? {}) },
    jointHoops: { ...source.jointHoops, ...(overrides.jointHoops ?? {}) },
    confinement: { ...source.confinement, ...(overrides.confinement ?? {}) },
    capacityHierarchy: { ...source.capacityHierarchy, ...(overrides.capacityHierarchy ?? {}) },
  });
}

function jointDirection(model, directionId) {
  return {
    directionId,
    jointType: model.jointType,
    ductilityClass: model.ductilityClass,
    tensionMethod: model.tensionMethod,
    geometry: { ...model.geometry },
    materials: { ...model.materials },
    actions: { ...model.actions },
    beamReinforcement: { ...model.beamReinforcement },
    jointHoops: { ...model.jointHoops },
    confinement: structuredClone(model.confinement),
    capacityHierarchy: { ...model.capacityHierarchy },
    anchorage: structuredClone(model.anchorage),
    eccentricity: { ...model.eccentricity },
    units,
  };
}

function jointLocalCompletionCase() {
  return {
    id: "rc-joint-local-corner-eccentric-3d-anchorage",
    title: "RC joint corner, eccentric transfer, 3D aggregation and anchorage",
    category: "reinforced-concrete-joints",
    source:
      "NTC 2018 §§7.4.6.1.3 and 7.4.6.2.1-7.4.6.2.3; EN 1992-1-1:2004 §8.4",
    sourceKind: "independent-calculation",
    notes:
      "Two concurrent orthogonal directions exercise an internal and a corner joint. Independent equilibrium checks the eccentric-transfer tie force and verifies scalar aggregation of the directional results.",
    evaluate() {
      const x = jointFixture({
        anchorage: {
          topBars: { diameter: 16, availableLength: 1000 },
          bottomBars: { diameter: 16, availableLength: 1000 },
        },
      });
      const z = jointFixture({
        jointType: "corner",
        eccentricity: {
          beamAxisOffset: 120,
          transferLeverArm: 300,
          reinforcementArea: 1000,
        },
      });
      const result = new ReinforcedConcreteBeamColumnJointApplication().run({
        model: new ReinforcedConcreteBeamColumnJoint3DModel({
          id: "validation-joint-3d",
          concurrentActionState: true,
          directions: [jointDirection(x, "x"), jointDirection(z, "z")],
        }),
      });
      const zResult = result.outputs.directions.z;
      const eccentricCheck = checkById(result, "rc-joint-eccentric-transfer-reinforcement-z");
      const expectedTransfer = zResult.outputs.jointShear.demand * 120 / 300;
      const directionalMaximum = Math.max(
        ...Object.values(result.outputs.directions)
          .map((direction) => direction.utilizationRatio)
          .filter(Number.isFinite),
      );

      return {
        supported: result.status !== "not-supported",
        directionCount: result.outputs.directionCount,
        cornerNormativeType: zResult.outputs.normativeJointType,
        anchorageChecks: result.checks.filter((check) =>
          check.id.startsWith("rc-joint-beam-bar-anchorage-"),
        ).length,
        eccentricTransferMatchesEquilibrium:
          Math.abs(eccentricCheck.demand - expectedTransfer) < 1e-6,
        aggregationMatchesDirectionalMaximum:
          Math.abs(result.utilizationRatio - directionalMaximum) < 1e-12,
      };
    },
    expectations: [
      { id: "supported", path: "supported", expected: true, type: "equal" },
      { id: "direction-count", path: "directionCount", expected: 2, tolerance: 0 },
      { id: "corner-mapping", path: "cornerNormativeType", expected: "external", type: "equal" },
      { id: "anchorage-checks", path: "anchorageChecks", expected: 2, tolerance: 0 },
      { id: "eccentric-equilibrium", path: "eccentricTransferMatchesEquilibrium", expected: true, type: "equal" },
      { id: "3d-aggregation", path: "aggregationMatchesDirectionalMaximum", expected: true, type: "equal" },
    ],
  };
}

export function createReinforcedConcreteLocalValidationCases() {
  return [
    beamLocalCompletionCase(),
    columnLocalCompletionCase(),
    footingLocalCompletionCase(),
    foundationBeamLocalCompletionCase(),
    jointLocalCompletionCase(),
  ];
}
