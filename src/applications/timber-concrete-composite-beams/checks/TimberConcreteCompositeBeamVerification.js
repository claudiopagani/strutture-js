import { VerificationResult } from "../../../core/results/VerificationResult.js";

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

export class TimberConcreteCompositeBeamVerification {
  verify(model) {
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
    const connectorKser = connector.kser * 1000;
    const connectorKu = connector.ku * 1000;
    const connectorFvrk = connector.fvrk * 1000;

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

    const shearEd = (qUls * span) / 2;
    const bendingEd = (qUls * span ** 2) / 8;

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

    const governingCheck = checks.reduce((max, current) =>
      current.utilizationRatio > max.utilizationRatio ? current : max,
    );

    return new VerificationResult({
      applicationId: "timber-concrete-composite-beams",
      status: checks.every((check) => check.ok) ? "ok" : "not-verified",
      summary:
        "Verification of timber beam with collaborating concrete slab according to the Gelfi-style gamma method implemented from the workbook.",
      utilizationRatio: round(governingCheck.utilizationRatio, 6),
      demand: round(governingCheck.demand, 6),
      capacity: round(governingCheck.capacity, 6),
      checks: checks.map((check) => ({
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
      },
      warnings: [],
      assumptions: [
        "Units are expected in mm, N and MPa-consistent form within the model.",
        "The implementation follows the spreadsheet procedure supplied by the user.",
      ],
      metadata: {
        method: "gelfi-gamma-method",
      },
    });
  }
}
