import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { BeamSectionActionVerifier } from "../../../domain/beams/BeamSectionActionVerifier.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";

const round = (value, decimals = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function evaluateCheck(demand, capacity) {
  const utilizationRatio = demand / capacity;

  return {
    demand,
    capacity,
    utilizationRatio,
    ok: utilizationRatio <= 1,
  };
}

function governingChecksById(checks) {
  return Object.values(
    checks.reduce((acc, check) => {
      const current = acc[check.id];

      if (!current || check.utilizationRatio > current.utilizationRatio) {
        acc[check.id] = check;
      }

      return acc;
    }, {}),
  );
}

function resolveInputModel(input, fallbackModel = null) {
  if (input?.model) {
    return {
      model: input.model,
      analysisResult: input.analysisResult ?? input.model.analysisResult ?? null,
    };
  }

  const isOptionsOnly =
    input &&
    typeof input === "object" &&
    !input.id &&
    ("analysisResult" in input || "sectionVerifier" in input);

  return {
    model: isOptionsOnly ? fallbackModel : input ?? fallbackModel,
    analysisResult:
      input?.analysisResult ??
      (isOptionsOnly ? fallbackModel?.analysisResult : input?.analysisResult) ??
      fallbackModel?.analysisResult ??
      null,
  };
}

function demandResolver(context = {}) {
  return createUnitResolver(
    context.units ?? { force: "N", length: "mm" },
    { force: "N", length: "mm" },
  );
}

function timberShearStrength(material) {
  return material.fvK ?? material.metadata?.fvK ?? material.metadata?.fvk ?? null;
}

function maxAbsSample(entries, samplesGetter, valueKey) {
  let selected = null;

  for (const entry of entries) {
    for (const sample of samplesGetter(entry) ?? []) {
      const value = sample?.[valueKey];

      if (!Number.isFinite(value)) {
        continue;
      }

      if (!selected || Math.abs(value) > Math.abs(selected.value)) {
        selected = { value, sample, resultId: entry.id };
      }
    }
  }

  return selected;
}

function femDemands(analysisResult) {
  if (!analysisResult?.units) {
    return null;
  }

  const resolver = createUnitResolver(analysisResult.units, { force: "N", length: "mm" });
  const combinations = Object.values(analysisResult.combinations ?? {});
  const loadCases = Object.values(analysisResult.loadCases ?? {});
  const entries = combinations.length > 0 ? combinations : loadCases;
  const ulsEntries = entries.filter((entry) => entry.context?.limitState === "ULS");
  const sleEntries = entries.filter((entry) => entry.context?.limitState === "SLE");
  const finalEntries = sleEntries.filter(
    (entry) =>
      entry.context?.serviceCombination === "final" ||
      entry.context?.deformationState === "final",
  );
  const uls = ulsEntries.length > 0 ? ulsEntries : entries;
  const sle = sleEntries.length > 0 ? sleEntries : entries;
  const moment = maxAbsSample(uls, (entry) => entry.internalForces?.samples, "m");
  const shear = maxAbsSample(uls, (entry) => entry.internalForces?.samples, "v");
  const shortDeflection = maxAbsSample(sle, (entry) => entry.displacements?.samples, "uy");
  const longDeflection = maxAbsSample(
    finalEntries.length > 0 ? finalEntries : sle,
    (entry) => entry.displacements?.samples,
    "uy",
  );

  return {
    bendingEd: moment ? Math.abs(resolver.moment(moment.value)) : null,
    shearEd: shear ? Math.abs(resolver.force(shear.value)) : null,
    deflectionShort: shortDeflection
      ? Math.abs(resolver.length(shortDeflection.value))
      : null,
    deflectionLong: longDeflection
      ? Math.abs(resolver.length(longDeflection.value))
      : null,
    source: "fem-diagrams",
  };
}

export class TimberXlamCompositeBeamVerification {
  constructor({ model = null, verificationStations = null } = {}) {
    this.model = model;
    this.verificationStations = verificationStations;
  }

  verifySectionActions({ nEd = 0, vEd, mEd, context = {} } = {}) {
    const model = context.model ?? this.model;

    if (!model) {
      throw new Error(
        "TimberXlamCompositeBeamVerification.verifySectionActions requires a model in the verifier or context.",
      );
    }

    const resolver = demandResolver(context);
    const bendingEd = Math.abs(resolver.moment(mEd ?? 0));
    const shearEd = Math.abs(resolver.force(vEd ?? 0));
    const axialEd = Math.abs(resolver.force(nEd ?? 0));
    const {
      span,
      xlamSection,
      timberSection,
      xlamMaterial,
      timberMaterial,
      connector,
      kmod,
      gammaXlam,
      gammaTimber,
    } = model;

    assertPositive(span, "Beam span");

    const l = span;
    const e1 = xlamMaterial.elasticModulus;
    const e2 = timberMaterial.elasticModulus;
    const a1 = xlamSection.area;
    const a2 = timberSection.area;
    const j1 = model.workbookEquivalentXlamInertia();
    const j2 = timberSection.inertiaY;
    const e1j1 = e1 * j1;
    const e2j2 = e2 * j2;
    const a = model.relativeCentroidDistance();
    const kslu = connector.ku;
    const seq = connector.spacing;

    assertPositive(e1, "XLAM elastic modulus");
    assertPositive(e2, "Timber elastic modulus");
    assertPositive(a1, "XLAM effective area");
    assertPositive(a2, "Timber area");
    assertPositive(j1, "XLAM inertia");
    assertPositive(j2, "Timber inertia");
    assertPositive(a, "Relative centroid distance");
    assertPositive(kslu, "Connector ULS stiffness");
    assertPositive(seq, "Connector spacing");

    const gamma1Uls = 1 / (1 + (Math.PI ** 2 * e1 * a1 * seq) / (kslu * l ** 2));
    const gamma2Uls = 1 / (1 + (Math.PI ** 2 * e2 * a2 * seq) / (kslu * l ** 2));
    const a2Uls = (gamma1Uls * e1 * a1 * a) / (gamma1Uls * e1 * a1 + e2 * a2);
    const a1Uls = a - a2Uls;
    const ejEffUls =
      e1j1 + e2j2 + gamma1Uls * e1 * a1 * a1Uls ** 2 + gamma2Uls * e2 * a2 * a2Uls ** 2;
    const sigmaN1 = -(gamma1Uls * e1 * a1Uls / ejEffUls) * bendingEd;
    const sigmaM1 = (e1 / ejEffUls) * model.xlamBendingLeverArm() * bendingEd;
    const sigmaN2 = (gamma2Uls * e2 * a2Uls / ejEffUls) * bendingEd;
    const sigmaM2 = (e2 / ejEffUls) * (timberSection.height / 2) * bendingEd;
    const xlamThicknessActive = xlamSection.activeThickness();
    const tau1 = (e1 / ejEffUls) * ((xlamThicknessActive ** 2) / 2) * shearEd;
    const tau2 = (e2 / ejEffUls) * (((timberSection.height / 2) + a2Uls) ** 2 / 2) * shearEd;
    const timberTimberResistance = connector.timberTimberCharacteristicResistance(
      xlamThicknessActive,
    );
    const connectorForce =
      (gamma1Uls * e1 * a1 * a1Uls * seq / ejEffUls) * shearEd;
    const xlamFlexuralResistance = (kmod / gammaXlam) * xlamMaterial.fmK;
    const timberFlexuralResistance = (kmod / gammaTimber) * timberMaterial.fmK;
    const xlamShearResistance = (kmod / gammaXlam) * timberShearStrength(xlamMaterial);
    const timberShearResistance =
      (kmod / gammaTimber) * timberShearStrength(timberMaterial);

    assertPositive(xlamFlexuralResistance, "XLAM flexural resistance");
    assertPositive(timberFlexuralResistance, "Timber flexural resistance");
    assertPositive(xlamShearResistance, "XLAM shear resistance");
    assertPositive(timberShearResistance, "Timber shear resistance");

    const checks = [
      {
        id: "xlam-min-stress",
        description: "Minimum XLAM stress at ULS",
        ...evaluateCheck(Math.abs(sigmaN1 - sigmaM1), xlamFlexuralResistance),
      },
      {
        id: "xlam-max-stress",
        description: "Maximum XLAM stress at ULS",
        ...evaluateCheck(Math.abs(sigmaN1 + sigmaM1), xlamFlexuralResistance),
      },
      {
        id: "timber-min-stress",
        description: "Minimum timber beam stress at ULS",
        ...evaluateCheck(Math.abs(sigmaN2 - sigmaM2), timberFlexuralResistance),
      },
      {
        id: "timber-max-stress",
        description: "Maximum timber beam stress at ULS",
        ...evaluateCheck(Math.abs(sigmaN2 + sigmaM2), timberFlexuralResistance),
      },
      {
        id: "xlam-shear",
        description: "XLAM shear verification",
        ...evaluateCheck(Math.abs(tau1), xlamShearResistance),
      },
      {
        id: "timber-shear",
        description: "Timber beam shear verification",
        ...evaluateCheck(Math.abs(tau2), timberShearResistance),
      },
      {
        id: "connector",
        description: "Timber-timber connector verification",
        ...evaluateCheck(
          Math.abs(connectorForce) / 1000,
          timberTimberResistance.designResistance,
        ),
      },
    ].map((check) => ({
      ...check,
      demand: round(check.demand),
      capacity: round(check.capacity),
      utilizationRatio: round(check.utilizationRatio),
      metadata: {
        method: "timber-xlam-gamma-method-section-actions",
        gamma1Uls: round(gamma1Uls),
        gamma2Uls: round(gamma2Uls),
        ejEffUls: round(ejEffUls),
      },
    }));
    const governingCheck = checks.reduce((max, current) =>
      current.utilizationRatio > max.utilizationRatio ? current : max,
    );
    const warnings = [];

    if (axialEd > 1e-9) {
      warnings.push(
        "Axial force is not included in the current timber-XLAM composite section adapter.",
      );
    }

    return {
      status: checks.every((check) => check.ok) ? "ok" : "not-verified",
      utilizationRatio: governingCheck.utilizationRatio,
      demand: governingCheck.demand,
      capacity: governingCheck.capacity,
      checks,
      warnings,
      metadata: {
        governingCheckId: governingCheck.id,
        method: "timber-xlam-gamma-method-section-actions",
        bendingEd: round(bendingEd),
        shearEd: round(shearEd),
      },
    };
  }

  verify(input) {
    const { model, analysisResult } = resolveInputModel(input, this.model);
    const verificationStations =
      input?.verificationStations ??
      model?.verificationStations ??
      this.verificationStations;

    if (!model) {
      throw new Error("TimberXlamCompositeBeamVerification requires a model.");
    }

    const {
      span,
      xlamSection,
      timberSection,
      xlamMaterial,
      timberMaterial,
      connector,
      kmod,
      gammaXlam,
      gammaTimber,
      serviceClass,
      psi2,
      loads,
      deflectionLimitShortDenominator,
      deflectionLimitLongDenominator,
    } = model;

    assertPositive(span, "Beam span");

    const l = span;
    const qUls = loads.ulsLineLoad;
    const qPermanent = loads.slePermanentLineLoad;
    const qVariable = loads.sleVariableLineLoad;
    const e1 = xlamMaterial.elasticModulus;
    const e2 = timberMaterial.elasticModulus;
    const a1 = xlamSection.area;
    const a2 = timberSection.area;
    const j1 = model.workbookEquivalentXlamInertia();
    const j2 = timberSection.inertiaY;
    const e1j1 = e1 * j1;
    const e2j2 = e2 * j2;
    const a = model.relativeCentroidDistance();
    const kslu = connector.ku;
    const ksle = connector.kser;
    const seq = connector.spacing;

    assertPositive(qUls, "ULS line load");
    assertPositive(qPermanent, "SLE permanent line load");
    assertPositive(qVariable, "SLE variable line load");
    assertPositive(e1, "XLAM elastic modulus");
    assertPositive(e2, "Timber elastic modulus");
    assertPositive(a1, "XLAM effective area");
    assertPositive(a2, "Timber area");
    assertPositive(j1, "XLAM inertia");
    assertPositive(j2, "Timber inertia");
    assertPositive(a, "Relative centroid distance");
    assertPositive(kslu, "Connector ULS stiffness");
    assertPositive(ksle, "Connector SLE stiffness");
    assertPositive(seq, "Connector spacing");

    const gamma1Uls = 1 / (1 + (Math.PI ** 2 * e1 * a1 * seq) / (kslu * l ** 2));
    const gamma2Uls = 1 / (1 + (Math.PI ** 2 * e2 * a2 * seq) / (kslu * l ** 2));
    const a2Uls = (gamma1Uls * e1 * a1 * a) / (gamma1Uls * e1 * a1 + e2 * a2);
    const a1Uls = a - a2Uls;
    const ejEffUls =
      e1j1 + e2j2 + gamma1Uls * e1 * a1 * a1Uls ** 2 + gamma2Uls * e2 * a2 * a2Uls ** 2;

    const demands = femDemands(analysisResult);
    const bendingEd = demands?.bendingEd ?? (qUls * l ** 2) / 8;
    const shearEd = demands?.shearEd ?? (qUls * l) / 2;
    const m1 = (e1j1 / ejEffUls) * bendingEd;
    const m2 = (e2j2 / ejEffUls) * bendingEd;
    const n1 = -(gamma1Uls * e1 * a1 * a1Uls / ejEffUls) * bendingEd;
    const n2 = (gamma2Uls * e2 * a2 * a2Uls / ejEffUls) * bendingEd;
    const sigmaN1 = -(gamma1Uls * e1 * a1Uls / ejEffUls) * bendingEd;
    const sigmaM1 = (e1 / ejEffUls) * model.xlamBendingLeverArm() * bendingEd;
    const sigmaN2 = (gamma2Uls * e2 * a2Uls / ejEffUls) * bendingEd;
    const sigmaM2 = (e2 / ejEffUls) * (timberSection.height / 2) * bendingEd;

    const gamma1Sle = 1 / (1 + (Math.PI ** 2 * e1 * a1 * seq) / (ksle * l ** 2));
    const gamma2Sle = 1 / (1 + (Math.PI ** 2 * e2 * a2 * seq) / (ksle * l ** 2));
    const a2Sle = (gamma1Sle * e1 * a1 * a) / (gamma1Sle * e1 * a1 + e2 * a2);
    const a1Sle = a - a2Sle;
    const ejEffSle =
      e1j1 + e2j2 + gamma1Sle * e1 * a1 * a1Sle ** 2 + gamma2Sle * e2 * a2 * a2Sle ** 2;

    const deflectionPermanent = (5 / 384) * qPermanent * l ** 4 / ejEffSle;
    const deflectionVariable = (5 / 384) * qVariable * l ** 4 / ejEffSle;
    const kdef = model.kdef();
    const deflectionShort =
      demands?.deflectionShort ?? deflectionPermanent + deflectionVariable;
    const deflectionLong =
      demands?.deflectionLong ??
      deflectionPermanent * (1 + kdef) + deflectionVariable + (1 + psi2 * kdef);

    const xlamThicknessActive = xlamSection.activeThickness();
    const tau1 = (e1 / ejEffUls) * ((xlamThicknessActive ** 2) / 2) * shearEd;
    const tau2 = (e2 / ejEffUls) * (((timberSection.height / 2) + a2Uls) ** 2 / 2) * shearEd;

    const timberTimberResistance = connector.timberTimberCharacteristicResistance(
      xlamThicknessActive,
    );
    const connectorForce =
      (gamma1Uls * e1 * a1 * a1Uls * seq / ejEffUls) * shearEd;

    const xlamFlexuralResistance = (kmod / gammaXlam) * xlamMaterial.fmK;
    const timberFlexuralResistance = (kmod / gammaTimber) * timberMaterial.fmK;
    const xlamShearResistance = (kmod / gammaXlam) * timberShearStrength(xlamMaterial);
    const timberShearResistance =
      (kmod / gammaTimber) * timberShearStrength(timberMaterial);

    assertPositive(xlamFlexuralResistance, "XLAM flexural resistance");
    assertPositive(timberFlexuralResistance, "Timber flexural resistance");
    assertPositive(xlamShearResistance, "XLAM shear resistance");
    assertPositive(timberShearResistance, "Timber shear resistance");

    const checks = [
      {
        id: "xlam-min-stress",
        description: "Minimum XLAM stress at ULS",
        ...evaluateCheck(Math.abs(sigmaN1 - sigmaM1), xlamFlexuralResistance),
      },
      {
        id: "xlam-max-stress",
        description: "Maximum XLAM stress at ULS",
        ...evaluateCheck(Math.abs(sigmaN1 + sigmaM1), xlamFlexuralResistance),
      },
      {
        id: "timber-min-stress",
        description: "Minimum timber beam stress at ULS",
        ...evaluateCheck(Math.abs(sigmaN2 - sigmaM2), timberFlexuralResistance),
      },
      {
        id: "timber-max-stress",
        description: "Maximum timber beam stress at ULS",
        ...evaluateCheck(Math.abs(sigmaN2 + sigmaM2), timberFlexuralResistance),
      },
      {
        id: "xlam-shear",
        description: "XLAM shear verification",
        ...evaluateCheck(Math.abs(tau1), xlamShearResistance),
      },
      {
        id: "timber-shear",
        description: "Timber beam shear verification",
        ...evaluateCheck(Math.abs(tau2), timberShearResistance),
      },
      {
        id: "connector",
        description: "Timber-timber connector verification",
        ...evaluateCheck(Math.abs(connectorForce) / 1000, timberTimberResistance.designResistance),
      },
      {
        id: "deflection-short",
        description: "Short-term deflection verification",
        ...evaluateCheck(Math.abs(deflectionShort), l / deflectionLimitShortDenominator),
      },
      {
        id: "deflection-long",
        description: "Long-term deflection verification",
        ...evaluateCheck(Math.abs(deflectionLong), l / deflectionLimitLongDenominator),
      },
    ];
    const sectionActionVerification = analysisResult
      ? new BeamSectionActionVerifier({
          applicationId: "timber-xlam-composite-beams",
          sectionVerifier: (args) =>
            this.verifySectionActions({
              ...args,
              context: {
                ...args.context,
                model,
              },
            }),
          limitStates: "ULS",
          includeLoadCases: false,
          verificationStations,
          metadata: {
            method: "timber-xlam-gamma-method-section-actions",
          },
        }).verify({ analysisResult })
      : null;
    const actionChecks = sectionActionVerification
      ? governingChecksById(sectionActionVerification.checks)
      : checks.slice(0, 7);
    const combinedChecks = [
      ...actionChecks,
      checks.find((check) => check.id === "deflection-short"),
      checks.find((check) => check.id === "deflection-long"),
    ];

    const governingCheck = combinedChecks.reduce((max, current) =>
      current.utilizationRatio > max.utilizationRatio ? current : max,
    );

    return new VerificationResult({
      applicationId: "timber-xlam-composite-beams",
      status: combinedChecks.every((check) => check.ok) ? "ok" : "not-verified",
      summary:
        "Verification of timber beams collaborating with an XLAM panel based on the workbook gamma-method and timber-timber connector checks.",
      utilizationRatio: round(governingCheck.utilizationRatio),
      demand: round(governingCheck.demand),
      capacity: round(governingCheck.capacity),
      checks: combinedChecks.map((check) => ({
        ...check,
        demand: round(check.demand),
        capacity: round(check.capacity),
        utilizationRatio: round(check.utilizationRatio),
      })),
      outputs: {
        kdef: round(kdef),
        kser: round(connector.kser),
        kslu: round(connector.ku),
        ksle: round(connector.kser),
        a1: round(a1),
        e1: round(e1),
        j1: round(j1),
        e1j1: round(e1j1),
        a2: round(a2),
        e2: round(e2),
        j2: round(j2),
        e2j2: round(e2j2),
        a: round(a),
        gamma1Uls: round(gamma1Uls),
        gamma2Uls: round(gamma2Uls),
        a1Uls: round(a1Uls),
        a2Uls: round(a2Uls),
        ejEffUls: round(ejEffUls),
        bendingEd: round(bendingEd / 1e6),
        shearEd: round(shearEd / 1e3),
        m1: round(m1 / 1e6),
        m2: round(m2 / 1e6),
        n1: round(n1 / 1e3),
        n2: round(n2 / 1e3),
        sigmaN1: round(sigmaN1),
        sigmaM1: round(sigmaM1),
        sigmaN2: round(sigmaN2),
        sigmaM2: round(sigmaM2),
        gamma1Sle: round(gamma1Sle),
        gamma2Sle: round(gamma2Sle),
        a1Sle: round(a1Sle),
        a2Sle: round(a2Sle),
        ejEffSle: round(ejEffSle),
        deflectionPermanent: round(deflectionPermanent),
        deflectionVariable: round(deflectionVariable),
        deflectionShort: round(deflectionShort),
        deflectionLong: round(deflectionLong),
        tau1: round(tau1),
        tau2: round(tau2),
        connectorForce: round(connectorForce / 1e3),
        connectorResistanceModes: {
          rk1a: round(timberTimberResistance.rk1a),
          rk1b: round(timberTimberResistance.rk1b),
          rk1c: round(timberTimberResistance.rk1c),
          rk2a: round(timberTimberResistance.rk2a),
          rk2b: round(timberTimberResistance.rk2b),
          rk3: round(timberTimberResistance.rk3),
          governing: round(timberTimberResistance.governing),
          designResistance: round(timberTimberResistance.designResistance),
        },
        governing: {
          checkId: governingCheck.id,
          utilizationRatio: round(governingCheck.utilizationRatio),
          demand: round(governingCheck.demand),
          capacity: round(governingCheck.capacity),
          metadata: governingCheck.metadata ?? null,
        },
        sectionActionVerification: sectionActionVerification
          ? {
              stationResultCount: sectionActionVerification.outputs.stationResultCount,
              checkCount: sectionActionVerification.outputs.checkCount,
              governing: sectionActionVerification.outputs.governing,
            }
          : null,
      },
      warnings: [
        "The fire verification worksheet is not implemented yet.",
        "The long-term deflection follows the workbook formula as written.",
        ...(sectionActionVerification?.warnings ?? []),
      ],
      assumptions: [
        "Dimensional inputs are normalized through the unit layer when units are declared on the model and related domain objects.",
        "The XLAM section follows the 5-layer workbook convention with active parallel layers passed in the section definition.",
      ],
      metadata: {
        method: "timber-xlam-gamma-method",
        serviceClass,
        verificationStations,
        actionSource: sectionActionVerification
          ? "fem-section-actions"
          : demands?.source ?? "workbook-closed-form",
        governingCheckId: governingCheck.id,
      },
    });
  }
}
