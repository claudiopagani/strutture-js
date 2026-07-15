import { VerificationResult } from "../../core/results/VerificationResult.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import { rotatePlateMoments } from "./actions/rotatePlateMoments.js";
import { rotatePlateShear } from "./actions/rotatePlateShear.js";
import { woodArmer } from "./actions/woodArmer.js";
import { verifyPlateBending } from "./checks/verifyPlateBending.js";
import { verifyPlateShear } from "./checks/verifyPlateShear.js";
import { verifyPlateServiceability } from "./checks/verifyPlateServiceability.js";
import { verifyPlateSlenderness } from "./checks/verifyPlateSlenderness.js";
import { uniqueStrings } from "./checks/plateCheckUtils.js";
import { RC_PLATE_ANALYSIS_TYPES } from "./ReinforcedConcretePlateModel.js";

const SLE_COMBINATIONS = new Set([
  "SLE_RARE",
  "SLE_CHARACTERISTIC",
  "SLE_CHAR",
  "SLE_FREQUENT",
  "SLE_QUASI_PERMANENT",
]);

const EXCLUDED_SCOPE = Object.freeze([
  "membrane actions and general shells",
  "axial-force bending interaction",
  "punching shear",
  "prestressed plates",
  "non-orthogonal or face-dependent reinforcement directions",
  "curvature integration and direct deflection",
  "global cracked analysis and moment redistribution",
  "nonlinear layered-shell models",
]);

function transformState(model, state) {
  const moments = rotatePlateMoments({
    ...state.actions,
    angle: model.reinforcement.angle,
  });
  const shear = rotatePlateShear({
    ...state.actions,
    angle: model.reinforcement.angle,
  });
  const equivalent = woodArmer(moments);
  const directMoment = Math.max(Math.abs(moments.mxx), Math.abs(moments.myy));
  const torsionRatio = directMoment > 0
    ? Math.abs(moments.mxy) / directMoment
    : null;

  return {
    id: state.id,
    combinationType: state.combinationType,
    sourceActions: { ...state.actions },
    moments,
    shear,
    woodArmer: equivalent,
    torsionRatio,
    torsionDiagnostic: directMoment === 0 && Math.abs(moments.mxy) > 0
      ? "pure-torsion"
      : "ratio-to-maximum-direct-moment",
  };
}

function incompatibleCombination(model, transformedStates) {
  if (model.analysis.type === RC_PLATE_ANALYSIS_TYPES.SLS_STRESS_CRACKING) {
    return transformedStates.find((state) => !SLE_COMBINATIONS.has(state.combinationType)) ?? null;
  }

  if (model.analysis.type === RC_PLATE_ANALYSIS_TYPES.ULS_BENDING_SHEAR) {
    return transformedStates.find((state) => !state.combinationType?.startsWith("ULS")) ?? null;
  }

  return null;
}

function governingCheck(checks) {
  return checks.reduce((governing, check) => {
    if (!Number.isFinite(check.utilizationRatio)) {
      return governing;
    }

    return governing == null || check.utilizationRatio > governing.utilizationRatio
      ? check
      : governing;
  }, null);
}

function baseOutputs(model, transformedStates) {
  return {
    geometry: { ...model.geometry },
    reinforcement: structuredClone(model.reinforcement),
    sourceActions: transformedStates.map((state) => ({
      stateId: state.id,
      combinationType: state.combinationType,
      ...state.sourceActions,
    })),
    reinforcementAxisActions: transformedStates.map((state) => ({
      stateId: state.id,
      combinationType: state.combinationType,
      angle: model.reinforcement.angle,
      mxx: state.moments.mxx,
      myy: state.moments.myy,
      mxy: state.moments.mxy,
      qx: state.shear.qx,
      qy: state.shear.qy,
      momentInvariants: state.moments.invariants,
      shearResultant: state.shear.resultant,
      shearResultantAngle: state.shear.resultantAngle,
      sourceShearResultant: Math.hypot(
        state.sourceActions.qx,
        state.sourceActions.qy,
      ),
      sourceShearResultantAngle:
        Math.atan2(state.sourceActions.qy, state.sourceActions.qx) * 180 / Math.PI,
    })),
    woodArmerMoments: transformedStates.map((state) => ({
      stateId: state.id,
      combinationType: state.combinationType,
      method: state.woodArmer.method,
      torsionRatio: state.torsionRatio,
      torsionDiagnostic: state.torsionDiagnostic,
      moments: state.woodArmer.moments.map((moment) => ({
        ...moment,
        stripMoment: moment.value * model.geometry.unitWidth,
      })),
    })),
    bendingChecks: [],
    shearChecks: [],
    serviceStressChecks: [],
    crackingChecks: [],
    slendernessChecks: [],
    governingCheck: null,
  };
}

export class ReinforcedConcretePlateVerification {
  constructor({ code = "NTC2018", metadata = {} } = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  verify(model) {
    if (!model?.analysis?.states) {
      throw new Error("ReinforcedConcretePlateVerification requires a ReinforcedConcretePlateModel.");
    }

    const transformedStates = model.analysis.states.map((state) => transformState(model, state));
    const outputs = baseOutputs(model, transformedStates);
    const warnings = [];
    const assumptions = [
      "The verified object is a conventional 1000 mm wide local strip of a flat reinforced-concrete plate.",
      "Membrane resultants are zero; sectional checks use NEd = 0.",
      "Positive plate moment tensions the bottom face; negative plate moment tensions the top face.",
      "Wood-Armer results are equivalent strip demands, not exact physical point stresses or crack orientations.",
    ];
    const incompatible = incompatibleCombination(model, transformedStates);

    if (incompatible) {
      warnings.push(
        `Combination ${incompatible.combinationType ?? "<missing>"} is incompatible with ${model.analysis.type}; no normative limits were applied.`,
      );

      return new VerificationResult({
        applicationId: "reinforced-concrete-plates",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary: "RC plate verification was not run because the combination type is missing or incompatible.",
        checks: [],
        outputs,
        warnings,
        assumptions,
        metadata: this.resultMetadata(model),
      });
    }

    const atomicChecks = [];
    const childStatuses = [];

    if (model.analysis.type === RC_PLATE_ANALYSIS_TYPES.ULS_BENDING_SHEAR) {
      for (const transformedState of transformedStates) {
        const bending = verifyPlateBending({ model, transformedState });
        const shear = verifyPlateShear({ model, transformedState });
        outputs.bendingChecks.push(...bending);
        outputs.shearChecks.push(...shear);
        atomicChecks.push(...bending.map((item) => item.check));
        atomicChecks.push(...shear.map((item) => item.check));
        childStatuses.push(...bending.map((item) => item.status));
        childStatuses.push(...shear.map((item) => item.status));
        warnings.push(...bending.flatMap((item) => item.warnings));
        warnings.push(...shear.flatMap((item) => item.warnings));
        assumptions.push(...bending.flatMap((item) => item.assumptions));
        assumptions.push(...shear.flatMap((item) => item.assumptions));
      }
    } else if (model.analysis.type === RC_PLATE_ANALYSIS_TYPES.SLS_STRESS_CRACKING) {
      for (const transformedState of transformedStates) {
        const serviceability = verifyPlateServiceability({ model, transformedState });
        outputs.serviceStressChecks.push(
          ...serviceability.flatMap((item) => item.serviceStressChecks),
        );
        outputs.crackingChecks.push(
          ...serviceability.flatMap((item) => item.crackingChecks),
        );
        outputs.serviceabilityStripResults ??= [];
        outputs.serviceabilityStripResults.push(...serviceability);
        atomicChecks.push(...serviceability.flatMap((item) => item.checks));
        childStatuses.push(...serviceability.map((item) => item.status));
        warnings.push(...serviceability.flatMap((item) => item.warnings));
        assumptions.push(...serviceability.flatMap((item) => item.assumptions));

        const highTorsion = transformedState.torsionDiagnostic === "pure-torsion"
          || transformedState.torsionRatio >= 1;

        if (highTorsion) {
          warnings.push(
            `State ${transformedState.id} has twisting moment not lower than both direct moments; Wood-Armer SLE strips can be conservative. This is an informational diagnostic, not a normative limit.`,
          );
        }
      }
    } else {
      for (const transformedState of transformedStates) {
        const slenderness = verifyPlateSlenderness({ model, transformedState });
        outputs.slendernessChecks.push(...slenderness);
        atomicChecks.push(
          ...slenderness.flatMap((item) =>
            item.faceChecks.map((faceCheck) => faceCheck.check)),
        );
        childStatuses.push(...slenderness.map((item) => item.status));
      }
      assumptions.push(
        "The flat_slab scheme is fixed internally and is not a selectable application input.",
        "The screening uses total plate thickness h and evaluates top and bottom reinforcement ratios independently in each direction.",
        "Each face retains its correlated Wood-Armer moment; the lower face slenderness limit governs the corresponding X or Y direction.",
        "Each face limit is 24 for rho_l <= 0.5%, 17 for rho_l >= 1.5%, and is linearly interpolated between those ratios.",
        "No curvature, stiffness, deflected shape or direct deflection is calculated.",
      );
    }

    const governing = governingCheck(atomicChecks);
    outputs.governingCheck = governing;
    const status = childStatuses.every((statusValue) => statusValue === RESULT_STATUS.OK)
      && atomicChecks.every((check) => check.ok === true)
      ? RESULT_STATUS.OK
      : RESULT_STATUS.NOT_VERIFIED;

    return new VerificationResult({
      applicationId: "reinforced-concrete-plates",
      status,
      summary: model.analysis.type === RC_PLATE_ANALYSIS_TYPES.SLS_SIMPLIFIED_DEFLECTION
        ? "Controllo semplificato di deformabilità mediante snellezza."
        : "Local reinforced-concrete plate verification on Wood-Armer equivalent strips.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks: atomicChecks,
      outputs,
      warnings: uniqueStrings(warnings),
      assumptions: uniqueStrings(assumptions),
      metadata: this.resultMetadata(model),
    });
  }

  resultMetadata(model) {
    return {
      code: this.code,
      applicationId: "reinforced-concrete-plates",
      modelId: model.id,
      analysisType: model.analysis.type,
      method: "rotated-actions-wood-armer-equivalent-strips",
      unitSystem: { ...model.units },
      sourceUnitSystem: model.metadata.sourceUnitSystem,
      scope: {
        geometry: "flat reinforced-concrete plate, 1000 mm conventional strips",
        actions: ["mxx", "myy", "mxy", "qx", "qy"],
        membraneActions: { nxx: 0, nyy: 0, nxy: 0 },
        excluded: [...EXCLUDED_SCOPE],
      },
      signConvention: {
        positiveNormal: "+Z out of the plate plane",
        positiveAngle: "counterclockwise from source +X to reinforcement +X when viewed from +Z",
        positiveMoment: "sagging, bottom face in tension",
        mxy: "symmetric tensor component Mxy = Myx; positive when positive X and Y plate-edge couples follow the documented tensor convention",
      },
      ...this.metadata,
    };
  }
}
