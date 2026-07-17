import { VerificationResult } from "../../core/results/VerificationResult.js";
import {
  governingCheck,
  round,
  utilizationCheck,
} from "../../core/results/checkUtils.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import {
  calculateNTC2018EffectiveJointWidth,
  calculateNTC2018JointCompressionCapacity,
  calculateNTC2018JointShearDemand,
  calculateNTC2018JointTensionReinforcement,
  classifyNTC2018JointConfinement,
  ntc2018JointOverstrengthFactor,
} from "../../norms/ntc2018/reinforced-concrete/ntc2018BeamColumnJoint.js";
import {
  calculateEn1992AnchorageLength,
  calculateEn1992DesignBondStrength,
} from "../../norms/en1992/reinforced-concrete/index.js";

function positiveStrength(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function resolveFctd(model) {
  if (positiveStrength(model.materials.fctd)) {
    return {
      value: model.materials.fctd,
      source: "explicit-input",
      gammaC: null,
    };
  }

  const concrete = model.materials.concreteMaterial;
  const fctm = positiveStrength(concrete?.fctm);
  const gammaC = positiveStrength(concrete?.metadata?.gammaC);

  if (!fctm || !gammaC) {
    return null;
  }

  return {
    value: 0.7 * fctm / gammaC,
    source: "0.7-fctm/gammaC",
    gammaC,
  };
}

function safeUtilizationCheck(options) {
  if (!Number.isFinite(options.capacity) || options.capacity <= 0) {
    return {
      id: options.id,
      description: options.description,
      demand: round(Math.abs(options.demand)),
      capacity: round(options.capacity),
      utilizationRatio: null,
      ok: false,
      metadata: { ...options.metadata },
    };
  }

  return utilizationCheck(options);
}

export class ReinforcedConcreteBeamColumnJointVerification {
  constructor({ code = "NTC2018", metadata = {} } = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  verify(model) {
    if (this.code !== "NTC2018") {
      return new VerificationResult({
        applicationId: "reinforced-concrete-beam-column-joints",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary: `Unsupported beam-column joint code: ${this.code}.`,
        warnings: ["The first beam-column joint implementation supports NTC 2018 only."],
        metadata: { code: this.code, ...this.metadata },
      });
    }

    const concrete = model.materials.concreteMaterial;
    const reinforcement = model.materials.reinforcementMaterial;
    const transverse = model.materials.transverseReinforcementMaterial;
    const fck = positiveStrength(concrete?.fck);
    const fcd = positiveStrength(concrete?.fcd);
    const fyd = positiveStrength(reinforcement?.fyd);
    const fywd = positiveStrength(transverse?.fyd);
    const fctd = resolveFctd(model);

    if (!fck || !fcd || !fyd || !fywd || !fctd) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-beam-column-joints",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary: "Beam-column joint verification requires NTC design strengths.",
        warnings: [
          "Required strengths are fck, fcd, longitudinal fyd, transverse fywd and either explicit fctd or fctm with gammaC metadata.",
        ],
        metadata: { code: this.code, jointId: model.id, ...this.metadata },
      });
    }

    const gammaRd = ntc2018JointOverstrengthFactor(model.ductilityClass);
    const normativeJointType = model.jointType === "corner"
      ? "external"
      : model.jointType;
    const effectiveJointWidth = calculateNTC2018EffectiveJointWidth({
      columnWidth: model.geometry.columnWidth,
      beamWidth: model.geometry.beamWidth,
      columnDepth: model.geometry.columnDepth,
    });
    const grossColumnArea = model.geometry.columnWidth * model.geometry.columnDepth;
    const normalizedAxialForce = model.actions.columnAxialForce /
      (grossColumnArea * fcd);
    const confinement = classifyNTC2018JointConfinement(model.confinement);
    const demand = calculateNTC2018JointShearDemand({
      jointType: normativeJointType,
      gammaRd,
      topReinforcementArea: model.beamReinforcement.topArea,
      bottomReinforcementArea: model.beamReinforcement.bottomArea,
      reinforcementDesignStrength: fyd,
      columnShearAbove: model.actions.columnShearAbove,
    });
    const compression = calculateNTC2018JointCompressionCapacity({
      jointType: normativeJointType,
      fck,
      fcd,
      normalizedAxialForce,
      effectiveJointWidth,
      columnLongitudinalLayerDistance:
        model.geometry.columnLongitudinalLayerDistance,
    });
    const tensionByMethod = Object.fromEntries(
      ["diagonal-tension", "post-cracking-truss"].map((method) => [
        method,
        calculateNTC2018JointTensionReinforcement({
          method,
          jointType: normativeJointType,
          jointShearDemand: demand.demand,
          effectiveJointWidth,
          columnLongitudinalLayerDistance:
            model.geometry.columnLongitudinalLayerDistance,
          beamLongitudinalLayerDistance:
            model.geometry.beamLongitudinalLayerDistance,
          normalizedAxialForce,
          fcd,
          fctd: fctd.value,
          gammaRd,
          topReinforcementArea: model.beamReinforcement.topArea,
          bottomReinforcementArea: model.beamReinforcement.bottomArea,
          reinforcementDesignStrength: fyd,
        }),
      ]),
    );
    const selectedTension = tensionByMethod[model.tensionMethod];
    const availableHorizontalTieForce = model.jointHoops.totalArea * fywd;
    const adjacent = model.confinement.adjacentColumnHoops;
    const allowedJointHoopSpacing = confinement.fullyConfined
      ? Math.min(2 * adjacent.controllingSpacing, 150)
      : adjacent.controllingSpacing;
    const checks = [
      safeUtilizationCheck({
        id: "rc-joint-diagonal-compression",
        description: "Joint diagonal compression resistance",
        demand: demand.demand,
        capacity: compression.capacity,
        metadata: {
          equation: compression.equation,
          eta: round(compression.eta),
          normalizedAxialForce: round(normalizedAxialForce),
        },
      }),
      safeUtilizationCheck({
        id: `rc-joint-horizontal-reinforcement-${model.tensionMethod}`,
        description: "Joint horizontal reinforcement for diagonal tension",
        demand: selectedTension.requiredHorizontalTieForce,
        capacity: availableHorizontalTieForce,
        metadata: {
          equation: selectedTension.equation,
          method: model.tensionMethod,
          shearStress: round(selectedTension.shearStress),
        },
      }),
      utilizationCheck({
        id: "rc-joint-minimum-hoop-diameter",
        description: "Minimum joint hoop diameter",
        demand: 6,
        capacity: model.jointHoops.diameter,
        metadata: { reference: "NTC2018-7.4.4.3.1" },
      }),
      utilizationCheck({
        id: "rc-joint-adjacent-hoop-area",
        description: "Joint hoop set area compared with adjacent column requirement",
        demand: adjacent.controllingAreaPerSet,
        capacity: model.jointHoops.areaPerSet,
        metadata: {
          fullyConfined: confinement.fullyConfined,
          reference: "NTC2018-7.4.6.2.3",
        },
      }),
      utilizationCheck({
        id: "rc-joint-hoop-spacing",
        description: "Joint hoop spacing",
        demand: model.jointHoops.spacing,
        capacity: allowedJointHoopSpacing,
        metadata: {
          fullyConfined: confinement.fullyConfined,
          adjacentControllingSpacing: adjacent.controllingSpacing,
          reference: "NTC2018-7.4.6.2.3",
        },
      }),
    ];

    if (!model.capacityHierarchy.exempt) {
      checks.push(utilizationCheck({
        id: "rc-joint-strong-column-weak-beam",
        description: "Strong-column weak-beam capacity hierarchy",
        demand: gammaRd * model.capacityHierarchy.beamMomentResistanceSum,
        capacity: model.capacityHierarchy.effectiveColumnMomentResistance,
        metadata: {
          gammaRd,
          preReducedForMomentSigns: true,
          reference: "NTC2018-7.4.4",
        },
      }));
    }

    let eccentricitySupported = true;
    const eccentricityLimit = model.geometry.columnWidth / 4;
    const eccentricity = Math.abs(model.eccentricity.beamAxisOffset);
    if (eccentricity <= eccentricityLimit + 1e-9) {
      checks.push(utilizationCheck({
        id: "rc-joint-beam-axis-eccentricity",
        description: "Beam-to-column joint axis eccentricity",
        demand: eccentricity,
        capacity: eccentricityLimit,
        metadata: { reference: "NTC2018-7.4.6.1.3" },
      }));
    } else if (
      Number.isFinite(model.eccentricity.transferLeverArm) &&
      model.eccentricity.transferLeverArm > 0 &&
      model.eccentricity.reinforcementArea > 0
    ) {
      const transferForce =
        demand.demand * eccentricity / model.eccentricity.transferLeverArm;
      checks.push(safeUtilizationCheck({
        id: "rc-joint-eccentric-transfer-reinforcement",
        description: "Reinforcement for eccentric joint shear transfer",
        demand: transferForce,
        capacity: model.eccentricity.reinforcementArea * fyd,
        metadata: {
          eccentricity,
          eccentricityLimit,
          transferLeverArm: model.eccentricity.transferLeverArm,
          equilibriumModel: "torsional-couple-Vj-e/z",
          reference: "NTC2018-7.4.6.1.3",
        },
      }));
    } else {
      eccentricitySupported = false;
      checks.push({
        id: "rc-joint-eccentric-transfer-reinforcement",
        description: "Reinforcement for eccentric joint shear transfer",
        demand: round(eccentricity),
        capacity: round(eccentricityLimit),
        utilizationRatio: null,
        ok: false,
        metadata: {
          missing: ["eccentricity.transferLeverArm", "eccentricity.reinforcementArea"],
          reference: "NTC2018-7.4.6.1.3",
        },
      });
    }

    const anchorageChecks = Object.entries(model.anchorage)
      .filter(([, anchor]) => anchor)
      .map(([face, anchor]) => {
        const bond = calculateEn1992DesignBondStrength({
          fctd: anchor.fctd ?? fctd.value,
          barDiameter: anchor.diameter,
          bondConditionFactor: anchor.bondConditionFactor ?? 1,
        });
        const required = calculateEn1992AnchorageLength({
          barDiameter: anchor.diameter,
          designSteelStress: anchor.designSteelStress ?? 1.25 * reinforcement.fyk,
          fbd: bond.fbd,
          tension: anchor.tension !== false,
          alpha1: anchor.alpha1 ?? 1,
          alpha2: anchor.alpha2 ?? 1,
          alpha3: anchor.alpha3 ?? 1,
          alpha4: anchor.alpha4 ?? 1,
          alpha5: anchor.alpha5 ?? 1,
          nationalMinimumDiameterMultiple: 20,
          nationalMinimumLength: 150,
        });

        return utilizationCheck({
          id: `rc-joint-beam-bar-anchorage-${face}`,
          description: `Beam ${face} anchorage through or beyond the joint`,
          demand: required.designLength,
          capacity: anchor.availableLength,
          metadata: {
            ...required,
            fbd: round(bond.fbd),
            reference: "NTC2018-7.4.6.2.1",
          },
        });
      });
    checks.push(...anchorageChecks);

    const governing = governingCheck(checks);
    const ok = checks.every((check) => check.ok === true);

    return new VerificationResult({
      applicationId: "reinforced-concrete-beam-column-joints",
      status: !eccentricitySupported
        ? RESULT_STATUS.NOT_SUPPORTED
        : ok
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "NTC 2018 local beam-column joint shear, confinement and capacity-hierarchy verification.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks,
      outputs: {
        directionId: model.directionId,
        jointType: model.jointType,
        normativeJointType,
        ductilityClass: model.ductilityClass,
        gammaRd,
        geometry: {
          ...model.geometry,
          effectiveJointWidth: round(effectiveJointWidth),
          grossColumnArea: round(grossColumnArea),
        },
        materials: {
          fck: round(fck),
          fcd: round(fcd),
          fctd: round(fctd.value),
          fctdSource: fctd.source,
          fyd: round(fyd),
          fywd: round(fywd),
        },
        normalizedAxialForce: round(normalizedAxialForce),
        jointShear: {
          ...demand,
          demand: round(demand.demand),
          beamForce: round(demand.beamForce),
        },
        compression: {
          ...compression,
          capacity: round(compression.capacity),
          eta: round(compression.eta),
          radicand: round(compression.radicand),
        },
        tension: {
          selectedMethod: model.tensionMethod,
          availableHorizontalTieForce: round(availableHorizontalTieForce),
          methods: Object.fromEntries(
            Object.entries(tensionByMethod).map(([method, value]) => [
              method,
              {
                ...value,
                requiredHorizontalTieForce: round(
                  value.requiredHorizontalTieForce,
                ),
                shearStress: round(value.shearStress),
              },
            ]),
          ),
        },
        confinement: {
          ...confinement,
          allowedJointHoopSpacing: round(allowedJointHoopSpacing),
        },
        capacityHierarchy: { ...model.capacityHierarchy },
        anchorage: {
          checkedFaces: anchorageChecks.map((check) => check.id),
        },
        eccentricity: {
          ...model.eccentricity,
          limit: round(eccentricityLimit),
          supported: eccentricitySupported,
        },
      },
      warnings: [
        "The verification represents one explicitly assigned seismic direction; the adverse opposite direction requires a separate input state.",
        ...(anchorageChecks.length === 0
          ? ["Beam-bar anchorage was not checked because no anchorage contract was supplied."]
          : []),
        "Lap splices inside the joint are outside the supported detailing contract and remain prohibited for dissipative beam bars.",
        ...(model.capacityHierarchy.exempt
          ? [`Capacity hierarchy was not checked: ${model.capacityHierarchy.exemptReason ?? "explicit exemption"}.`]
          : []),
      ],
      assumptions: [
        "Column axial force is compression-positive.",
        "The signed column shear is expressed in the beam reinforcement-resultant direction and is subtracted according to NTC 2018 equations 7.4.6-7.4.7.",
        "Top and bottom beam reinforcement areas are already selected for the adverse seismic direction being checked.",
        ...(!model.capacityHierarchy.exempt
          ? ["The effective column moment resistance supplied for hierarchy is already reduced according to the member moment signs and node equilibrium rule of NTC 2018 equation 7.4.4."]
          : []),
      ],
      metadata: {
        code: this.code,
        method: "NTC2018-7.4.4-and-7.4.4.3.1",
        jointId: model.id,
        governingCheckId: governing?.id ?? null,
        ...this.metadata,
      },
    });
  }
}
