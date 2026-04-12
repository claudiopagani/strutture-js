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
  const uls = ulsEntries.length > 0 ? ulsEntries : entries;
  const sle = sleEntries.length > 0 ? sleEntries : entries;
  const moment = maxAbsSample(uls, (entry) => entry.internalForces?.samples, "m");
  const shear = maxAbsSample(uls, (entry) => entry.internalForces?.samples, "v");
  const deflection = maxAbsSample(sle, (entry) => entry.displacements?.samples, "uy");

  return {
    bendingEd: moment ? Math.abs(resolver.moment(moment.value)) : null,
    shearEd: shear ? Math.abs(resolver.force(shear.value)) : null,
    deflectionSle: deflection ? Math.abs(resolver.length(deflection.value)) : null,
    source: "fem-diagrams",
  };
}

export class TimberConcreteCompositeBeamVerification {
  constructor({ model = null } = {}) {
    this.model = model;
  }

  verifySectionActions({ nEd = 0, vEd, mEd, context = {} } = {}) {
    const model = context.model ?? this.model;

    if (!model) {
      throw new Error(
        "TimberConcreteCompositeBeamVerification.verifySectionActions requires a model in the verifier or context.",
      );
    }

    const resolver = demandResolver(context);
    const bendingEd = Math.abs(resolver.moment(mEd ?? 0));
    const shearEd = Math.abs(resolver.force(vEd ?? 0));
    const axialEd = Math.abs(resolver.force(nEd ?? 0));
    const {
      span,
      slabSection,
      timberSection,
      timberConcreteGap,
      reinforcement,
      reinforcementSpacing,
      timberMaterial,
      concreteMaterial,
      reinforcementMaterial,
      connector,
      connectorSpacing,
      kmod,
      confidenceFactor,
      gammaConcrete,
      gammaSteel,
      gammaTimber,
      gammaConnector,
      alphaCc,
    } = model;

    assertPositive(span, "Beam span");
    assertPositive(reinforcementSpacing, "Reinforcement spacing");
    assertPositive(connectorSpacing, "Connector spacing");

    const idealComposite = model.createIdealCompositeSection();
    const slabWidth = slabSection.width;
    const slabHeight = slabSection.height;
    const timberArea = timberSection.area;
    const reinforcementArea = reinforcement.distributedArea(
      slabWidth,
      reinforcementSpacing,
    );
    const ew = timberMaterial.elasticModulus;
    const ec = concreteMaterial.elasticModulus;
    const fmK = timberMaterial.fmK;
    const fck = concreteMaterial.fck;
    const fyk = reinforcementMaterial?.fyk ?? reinforcement?.material?.fyk;
    const connectorKu = connector.ku;
    const connectorFvrk = connector.fvrk;

    assertPositive(slabWidth, "Slab width");
    assertPositive(slabHeight, "Slab height");
    assertPositive(timberSection.width, "Timber width");
    assertPositive(timberSection.height, "Timber height");
    assertPositive(ew, "Timber elastic modulus");
    assertPositive(ec, "Concrete elastic modulus");
    assertPositive(fmK, "Timber bending strength");
    assertPositive(fck, "Concrete compressive strength");
    assertPositive(fyk, "Reinforcement yield strength");
    assertPositive(connectorKu, "Connector ULS stiffness");
    assertPositive(connectorFvrk, "Connector resistance");

    const fcd = (alphaCc * fck) / gammaConcrete;
    const fyd = fyk / gammaSteel;
    const fmD = (kmod * fmK) / gammaTimber / confidenceFactor;
    const n = ec / ew;
    const timberCentroid = model.timberCentroidY();
    const slabCentroid = model.slabCentroidY();
    const centroidDistance = slabCentroid - timberCentroid;
    const slabInertia = slabSection.inertiaY;
    const timberInertia = timberSection.inertiaY;
    const disconnectedInertia = timberInertia + n * slabInertia;
    const idealInertia = idealComposite.inertiaY;
    const slabStaticMoment = (idealInertia - disconnectedInertia) / centroidDistance;
    const timberSectionModulus = timberSection.elasticSectionModulusY;
    const gammaUls =
      1 /
      (1 +
        (Math.PI ** 2 *
          ew *
          (idealInertia - disconnectedInertia) *
          connectorSpacing) /
          (connectorKu * span ** 2 * centroidDistance ** 2));
    const inertiaEffUls =
      disconnectedInertia + gammaUls * (idealInertia - disconnectedInertia);
    const slabMoment = (n * slabInertia * bendingEd) / inertiaEffUls;
    const timberMoment = (timberInertia * bendingEd) / inertiaEffUls;
    const slipForce =
      (bendingEd / centroidDistance) *
      gammaUls *
      ((idealInertia - disconnectedInertia) / inertiaEffUls);
    const timberStressBottom =
      slipForce / timberArea - timberMoment / timberSectionModulus;
    const timberStressTop =
      slipForce / timberArea + timberMoment / timberSectionModulus;
    const neutralAxisDepth =
      (slipForce + reinforcementArea * fyd) / (0.8 * slabWidth * fcd);
    const slabEffectiveDepth = slabHeight / 2;
    const slabMomentResistance =
      reinforcementArea * fyd * (slabEffectiveDepth - 0.4 * neutralAxisDepth) +
      slipForce * slabHeight / 2;
    const connectorForce =
      gammaUls * (slabStaticMoment / inertiaEffUls) * connectorSpacing * shearEd;

    const checks = [
      {
        id: "timber-bottom-stress",
        description: "Timber stress at intrados",
        ...evaluateCheck(Math.abs(timberStressBottom), fmD),
      },
      {
        id: "timber-top-stress",
        description: "Timber stress at extrados",
        ...evaluateCheck(Math.abs(timberStressTop), fmD),
      },
      {
        id: "slab-bending",
        description: "RC slab bending verification",
        ...evaluateCheck(Math.abs(slabMoment), slabMomentResistance),
      },
      {
        id: "connector",
        description: "Connector shear-flow verification",
        ...evaluateCheck(
          Math.abs(connectorForce),
          (kmod * connectorFvrk) / gammaConnector,
        ),
      },
    ].map((check) => ({
      ...check,
      demand: round(check.demand),
      capacity: round(check.capacity),
      utilizationRatio: round(check.utilizationRatio),
      metadata: {
        method: "gelfi-gamma-method-section-actions",
        gammaUls: round(gammaUls),
        inertiaEffUls: round(inertiaEffUls),
      },
    }));
    const governingCheck = checks.reduce((max, current) =>
      current.utilizationRatio > max.utilizationRatio ? current : max,
    );
    const warnings = [];

    if (axialEd > 1e-9) {
      warnings.push(
        "Axial force is not included in the current timber-concrete composite section adapter.",
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
        method: "gelfi-gamma-method-section-actions",
        bendingEd: round(bendingEd),
        shearEd: round(shearEd),
      },
    };
  }

  verify(input) {
    const { model, analysisResult } = resolveInputModel(input, this.model);

    if (!model) {
      throw new Error("TimberConcreteCompositeBeamVerification requires a model.");
    }

    const {
      span,
      slabSection,
      timberSection,
      timberConcreteGap,
      reinforcement,
      reinforcementSpacing,
      timberMaterial,
      concreteMaterial,
      reinforcementMaterial,
      connector,
      connectorSpacing,
      kdef,
      kmod,
      confidenceFactor,
      gammaConcrete,
      gammaSteel,
      gammaTimber,
      gammaConnector,
      alphaCc,
      loads,
      deflectionLimitDenominator,
    } = model;

    assertPositive(span, "Beam span");
    assertPositive(reinforcementSpacing, "Reinforcement spacing");
    assertPositive(connectorSpacing, "Connector spacing");

    const idealComposite = model.createIdealCompositeSection();
    const slabWidth = slabSection.width;
    const slabHeight = slabSection.height;
    const timberWidth = timberSection.width;
    const timberHeight = timberSection.height;
    const qUls = loads.ulsLineLoad;
    const qSleRare = loads.sleRareLineLoad;
    const ew = timberMaterial.elasticModulus;
    const ec = concreteMaterial.elasticModulus;
    const fmK = timberMaterial.fmK;
    const fck = concreteMaterial.fck;
    const fyk = reinforcementMaterial?.fyk ?? reinforcement?.material?.fyk;
    const connectorKser = connector.kser;
    const connectorKu = connector.ku;
    const connectorFvrk = connector.fvrk;

    assertPositive(slabWidth, "Slab width");
    assertPositive(slabHeight, "Slab height");
    assertPositive(timberWidth, "Timber width");
    assertPositive(timberHeight, "Timber height");
    assertPositive(qUls, "ULS line load");
    assertPositive(qSleRare, "SLE line load");
    assertPositive(ew, "Timber elastic modulus");
    assertPositive(ec, "Concrete elastic modulus");
    assertPositive(fmK, "Timber bending strength");
    assertPositive(fck, "Concrete compressive strength");
    assertPositive(fyk, "Reinforcement yield strength");

    const fcd = (alphaCc * fck) / gammaConcrete;
    const fyd = fyk / gammaSteel;
    const fmD = (kmod * fmK) / gammaTimber / confidenceFactor;
    const ewInf = ew / (1 + kdef);
    const n = ec / ew;

    const slabArea = slabSection.area;
    const timberArea = timberSection.area;
    const reinforcementArea = reinforcement.distributedArea(
      slabWidth,
      reinforcementSpacing,
    );
    const timberCentroid = model.timberCentroidY();
    const slabCentroid = model.slabCentroidY();
    const idealArea = idealComposite.area;
    const idealCentroid = idealComposite.centroidY;
    const centroidDistance = slabCentroid - timberCentroid;
    const slabInertia = slabSection.inertiaY;
    const timberInertia = timberSection.inertiaY;
    const disconnectedInertia = timberInertia + n * slabInertia;
    const idealInertia = idealComposite.inertiaY;
    const slabStaticMoment = (idealInertia - disconnectedInertia) / centroidDistance;
    const dStar = idealInertia / slabStaticMoment;
    const timberSectionModulus = timberSection.elasticSectionModulusY;

    const demands = femDemands(analysisResult);
    const shearEd = demands?.shearEd ?? (qUls * span) / 2;
    const bendingEd = demands?.bendingEd ?? (qUls * span ** 2) / 8;

    // Gelfi gamma-method implementation aligned to the workbook formulas.
    const gammaUls =
      1 /
      (1 +
        (Math.PI ** 2 *
          ew *
          (idealInertia - disconnectedInertia) *
          connectorSpacing) /
          (connectorKu * span ** 2 * centroidDistance ** 2));

    const inertiaEffUls =
      disconnectedInertia + gammaUls * (idealInertia - disconnectedInertia);

    const gammaSle =
      1 /
      (1 +
        (Math.PI ** 2 *
          ew *
          (idealInertia - disconnectedInertia) *
          connectorSpacing) /
          (connectorKser * span ** 2 * centroidDistance ** 2));

    const inertiaEffSle =
      disconnectedInertia + gammaSle * (idealInertia - disconnectedInertia);

    const slabMoment = (n * slabInertia * bendingEd) / inertiaEffUls;
    const timberMoment = (timberInertia * bendingEd) / inertiaEffUls;
    const slipForce =
      (bendingEd / centroidDistance) *
      gammaUls *
      ((idealInertia - disconnectedInertia) / inertiaEffUls);
    const timberStressBottom =
      slipForce / timberArea - (timberMoment / timberSectionModulus);
    const timberStressTop =
      slipForce / timberArea + (timberMoment / timberSectionModulus);

    const neutralAxisDepth =
      (slipForce + reinforcementArea * fyd) / (0.8 * slabWidth * fcd);
    const slabEffectiveDepth = slabHeight / 2;
    const slabMomentResistance =
      reinforcementArea * fyd * (slabEffectiveDepth - 0.4 * neutralAxisDepth) +
      slipForce * slabHeight / 2;

    const connectorForceConservative =
      gammaUls * (slabStaticMoment / inertiaEffUls) * connectorSpacing * shearEd;

    const deflectionEffUls =
      (5 * qUls * span ** 4) / (384 * ew * inertiaEffUls);
    const deflectionIdealUls =
      (5 * qUls * span ** 4) / (384 * ew * idealInertia);
    const deflectionIncrease = deflectionEffUls - deflectionIdealUls;
    const alpha = 3.2;
    const lateralSlip = (alpha * deflectionIncrease * dStar) / span;
    const connectorForceGelfi = connectorKu * lateralSlip;

    const deflectionSle =
      demands?.deflectionSle ??
      (5 * qSleRare * span ** 4) / (384 * ewInf * inertiaEffSle);

    const timberBottomCheck = evaluateCheck(
      Math.abs(timberStressBottom),
      fmD,
    );
    const timberTopCheck = evaluateCheck(Math.abs(timberStressTop), fmD);
    const slabCheck = evaluateCheck(Math.abs(slabMoment), slabMomentResistance);
    const connectorCheck = evaluateCheck(
      Math.min(connectorForceConservative, connectorForceGelfi),
      (kmod * connectorFvrk) / gammaConnector,
    );
    const deflectionCheck = evaluateCheck(
      Math.abs(deflectionSle),
      (span / deflectionLimitDenominator) * 10,
    );

    const checks = [
      {
        id: "timber-bottom-stress",
        description: "Timber stress at intrados",
        ...timberBottomCheck,
      },
      {
        id: "timber-top-stress",
        description: "Timber stress at extrados",
        ...timberTopCheck,
      },
      {
        id: "slab-bending",
        description: "RC slab bending verification",
        ...slabCheck,
      },
      {
        id: "connector",
        description: "Connector verification",
        ...connectorCheck,
      },
      {
        id: "deflection",
        description: "Serviceability deflection verification",
        ...deflectionCheck,
      },
    ];
    const sectionActionVerification = analysisResult
      ? new BeamSectionActionVerifier({
          applicationId: "timber-concrete-composite-beams",
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
          metadata: {
            method: "gelfi-gamma-method-section-actions",
          },
        }).verify({ analysisResult })
      : null;
    const actionChecks = sectionActionVerification
      ? governingChecksById(sectionActionVerification.checks)
      : checks.slice(0, 4);
    const combinedChecks = [
      ...actionChecks,
      checks.find((check) => check.id === "deflection"),
    ];

    const governingCheck = combinedChecks.reduce((max, current) =>
      current.utilizationRatio > max.utilizationRatio ? current : max,
    );

    return new VerificationResult({
      applicationId: "timber-concrete-composite-beams",
      status: combinedChecks.every((check) => check.ok) ? "ok" : "not-verified",
      summary:
        "Verification of timber beam with collaborating concrete slab according to the Gelfi-style gamma method implemented from the workbook.",
      utilizationRatio: round(governingCheck.utilizationRatio, 6),
      demand: round(governingCheck.demand, 6),
      capacity: round(governingCheck.capacity, 6),
      checks: combinedChecks.map((check) => ({
        ...check,
        demand: round(check.demand, 6),
        capacity: round(check.capacity, 6),
        utilizationRatio: round(check.utilizationRatio, 6),
      })),
      outputs: {
        fcd: round(fcd, 6),
        fyd: round(fyd, 6),
        fmD: round(fmD, 6),
        ewInf: round(ewInf, 6),
        n: round(n, 6),
        slabArea: round(slabArea, 6),
        timberArea: round(timberArea, 6),
        idealArea: round(idealArea, 6),
        reinforcementArea: round(reinforcementArea, 6),
        timberCentroid: round(timberCentroid, 6),
        slabCentroid: round(slabCentroid, 6),
        idealCentroid: round(idealCentroid, 6),
        centroidDistance: round(centroidDistance, 6),
        slabInertia: round(slabInertia, 6),
        timberInertia: round(timberInertia, 6),
        disconnectedInertia: round(disconnectedInertia, 6),
        idealInertia: round(idealInertia, 6),
        slabStaticMoment: round(slabStaticMoment, 6),
        dStar: round(dStar, 6),
        timberSectionModulus: round(timberSectionModulus, 6),
        shearEd: round(shearEd, 6),
        bendingEd: round(bendingEd, 6),
        gammaUls: round(gammaUls, 6),
        inertiaEffUls: round(inertiaEffUls, 6),
        gammaSle: round(gammaSle, 6),
        inertiaEffSle: round(inertiaEffSle, 6),
        slabMoment: round(slabMoment, 6),
        timberMoment: round(timberMoment, 6),
        slipForce: round(slipForce, 6),
        timberStressBottom: round(timberStressBottom, 6),
        timberStressTop: round(timberStressTop, 6),
        neutralAxisDepth: round(neutralAxisDepth, 6),
        slabMomentResistance: round(slabMomentResistance, 6),
        connectorForceConservative: round(connectorForceConservative, 6),
        deflectionEffUls: round(deflectionEffUls, 6),
        deflectionIdealUls: round(deflectionIdealUls, 6),
        deflectionIncrease: round(deflectionIncrease, 6),
        lateralSlip: round(lateralSlip, 6),
        connectorForceGelfi: round(connectorForceGelfi, 6),
        connectorKser: round(connectorKser, 6),
        connectorKu: round(connectorKu, 6),
        connectorFvrk: round(connectorFvrk, 6),
        deflectionSle: round(deflectionSle, 6),
        governing: {
          checkId: governingCheck.id,
          utilizationRatio: round(governingCheck.utilizationRatio, 6),
          demand: round(governingCheck.demand, 6),
          capacity: round(governingCheck.capacity, 6),
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
      warnings: sectionActionVerification?.warnings ?? [],
      assumptions: [
        "Dimensional inputs are normalized through the unit layer when units are declared on the model and related domain objects.",
        "The implementation follows the spreadsheet procedure supplied by the user.",
      ],
      metadata: {
        method: "gelfi-gamma-method",
        actionSource: sectionActionVerification
          ? "fem-section-actions"
          : demands?.source ?? "workbook-closed-form",
        governingCheckId: governingCheck.id,
      },
    });
  }
}
