/**
 * NTC 2018 checks that apply to complete RC wall systems rather than to one
 * isolated section. Local chapter-4 capacities remain explicit inputs.
 */

export const NTC2018_WALL_SYSTEM_REFERENCES = Object.freeze([
  Object.freeze({
    source: "NTC 2018",
    citation:
      "§§ 7.4.4.5, 7.4.4.6, 7.4.6.1.4, 7.4.6.2.4 e 7.4.6.2.5",
  }),
]);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be finite; got ${value}.`);
  }
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) {
    throw new Error(`${label} must be positive; got ${value}.`);
  }
  return number;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) {
    throw new Error(`${label} must be non-negative; got ${value}.`);
  }
  return number;
}

function requiredBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be boolean.`);
  }
  return value;
}

function check(id, demand, capacity, ok, extra = {}) {
  return {
    id,
    demand,
    capacity,
    utilizationRatio:
      Number.isFinite(demand) && Number.isFinite(capacity) && capacity > 0
        ? demand / capacity
        : null,
    ok,
    ...extra,
  };
}

export function computeWallEffectiveFlangeWidth({
  actualFlangeWidth,
  wallHeightAbove,
  adjacentWebSpacing,
}) {
  const actual = nonNegative(actualFlangeWidth, "actualFlangeWidth");
  const height = nonNegative(wallHeightAbove, "wallHeightAbove");
  const spacing = nonNegative(adjacentWebSpacing, "adjacentWebSpacing");
  const limits = {
    actualFlangeWidth: actual,
    quarterWallHeightAbove: 0.25 * height,
    halfAdjacentWebSpacing: 0.5 * spacing,
  };
  return {
    effectiveFlangeWidth: Math.min(...Object.values(limits)),
    limits,
    reference: "NTC 2018 § 7.4.4.5.1",
  };
}

/**
 * Figure 7.4.5: in mixed systems the design envelope connects VA at the
 * base to VB at h_w/3 and remains equal to VB above that elevation.
 */
export function computeMixedSystemWallShearEnvelope({
  wallHeight,
  baseAmplifiedShear,
  analysisShearAtOneThird,
  elevations,
}) {
  const height = positive(wallHeight, "wallHeight");
  const va = Math.abs(finite(baseAmplifiedShear, "baseAmplifiedShear"));
  const analysisVb = Math.abs(finite(
    analysisShearAtOneThird,
    "analysisShearAtOneThird",
  ));
  if (!Array.isArray(elevations) || elevations.length === 0) {
    throw new Error("elevations must be a non-empty array.");
  }
  const transitionElevation = height / 3;
  const vb = Math.max(analysisVb, va / 2);
  const points = elevations.map((value, index) => {
    const elevation = nonNegative(value, `elevations[${index}]`);
    if (elevation > height) {
      throw new Error(`elevations[${index}] must not exceed wallHeight.`);
    }
    const shearDemand = elevation <= transitionElevation
      ? va + (vb - va) * elevation / transitionElevation
      : vb;
    return { elevation, shearDemand };
  });
  return {
    baseShear: va,
    shearAtOneThird: vb,
    analysisShearAtOneThird: analysisVb,
    minimumShearAtOneThird: va / 2,
    transitionElevation,
    points,
    reference: "NTC 2018 § 7.4.4.5.1, Fig. 7.4.5",
  };
}

export function computeWeaklyReinforcedWallShearDemand({
  analysisShear,
  q,
}) {
  const shear = Math.abs(finite(analysisShear, "analysisShear"));
  const behaviorFactor = positive(q, "q");
  const amplificationFactor = (behaviorFactor + 1) / 2;
  return {
    shearDemand: shear * amplificationFactor,
    amplificationFactor,
    reference: "NTC 2018 § 7.4.4.5.1",
  };
}

export function computeWeaklyReinforcedWallAxialDemandRange({
  gravityAxialDemand,
  q,
}) {
  const gravity = finite(gravityAxialDemand, "gravityAxialDemand");
  const behaviorFactor = positive(q, "q");
  const additionalDynamicDemand = behaviorFactor > 2
    ? 0.5 * Math.abs(gravity)
    : 0;
  return {
    minimumAxialDemand: gravity - additionalDynamicDemand,
    maximumAxialDemand: gravity + additionalDynamicDemand,
    additionalDynamicDemand,
    applicable: behaviorFactor > 2,
    reference: "NTC 2018 § 7.4.4.5.1",
  };
}

export function verifyWallCurvatureDuctility({
  curvatureDuctilityDemand,
  curvatureDuctilityCapacity,
}) {
  const demand = positive(
    curvatureDuctilityDemand,
    "curvatureDuctilityDemand",
  );
  const capacity = positive(
    curvatureDuctilityCapacity,
    "curvatureDuctilityCapacity",
  );
  return {
    ...check(
      "wall-curvature-ductility",
      demand,
      capacity,
      demand <= capacity,
    ),
    reference: "NTC 2018 § 7.4.4.5.2",
  };
}

export function verifyWallGeneralDetailing({
  wallThickness,
  clearStoreyHeight,
  diagonalCouplingReinforcementRequired = false,
  supportedFromFoundationOrRigidBox,
  irregularOpeningsIncludedInAnalysis,
  verticalReinforcementRatio,
  horizontalReinforcementRatio,
  maximumConcreteCompressiveStrain = 0,
  maximumBarDiameter,
  barsOnBothFaces,
  maximumBarSpacing,
  tiesPerSquareMetre,
}) {
  const thickness = positive(wallThickness, "wallThickness");
  const storeyHeight = positive(
    clearStoreyHeight,
    "clearStoreyHeight",
  );
  const diagonalRequired = requiredBoolean(
    diagonalCouplingReinforcementRequired,
    "diagonalCouplingReinforcementRequired",
  );
  const minimumThickness = Math.max(
    diagonalRequired ? 0.20 : 0.15,
    storeyHeight / 20,
  );
  const verticalRatio = nonNegative(
    verticalReinforcementRatio,
    "verticalReinforcementRatio",
  );
  const horizontalRatio = nonNegative(
    horizontalReinforcementRatio,
    "horizontalReinforcementRatio",
  );
  const strain = nonNegative(
    maximumConcreteCompressiveStrain,
    "maximumConcreteCompressiveStrain",
  );
  const barDiameter = positive(maximumBarDiameter, "maximumBarDiameter");
  const barSpacing = positive(maximumBarSpacing, "maximumBarSpacing");
  const ties = nonNegative(tiesPerSquareMetre, "tiesPerSquareMetre");
  const supported = requiredBoolean(
    supportedFromFoundationOrRigidBox,
    "supportedFromFoundationOrRigidBox",
  );
  const openingsModelled = requiredBoolean(
    irregularOpeningsIncludedInAnalysis,
    "irregularOpeningsIncludedInAnalysis",
  );
  const bothFaces = requiredBoolean(barsOnBothFaces, "barsOnBothFaces");
  const checks = [
    check(
      "wall-supported-without-transfer-beam-or-slab",
      supported ? 0 : 1,
      0,
      supported,
      { reference: "NTC 2018 § 7.4.6.1.4" },
    ),
    check(
      "wall-irregular-openings-modelled",
      openingsModelled ? 0 : 1,
      0,
      openingsModelled,
      { reference: "NTC 2018 § 7.4.6.1.4" },
    ),
    check(
      "wall-minimum-thickness",
      minimumThickness,
      thickness,
      thickness >= minimumThickness,
      { reference: "NTC 2018 § 7.4.6.1.4" },
    ),
    check(
      "wall-minimum-vertical-reinforcement",
      0.002,
      verticalRatio,
      verticalRatio >= 0.002,
      { reference: "NTC 2018 § 7.4.6.2.4" },
    ),
    check(
      "wall-minimum-horizontal-reinforcement",
      0.002,
      horizontalRatio,
      horizontalRatio >= 0.002,
      { reference: "NTC 2018 § 7.4.6.2.4" },
    ),
    check(
      "wall-maximum-bar-diameter",
      barDiameter,
      thickness / 10,
      barDiameter <= thickness / 10,
      { reference: "NTC 2018 § 7.4.6.2.4" },
    ),
    check(
      "wall-reinforcement-on-both-faces",
      bothFaces ? 0 : 1,
      0,
      bothFaces,
      { reference: "NTC 2018 § 7.4.6.2.4" },
    ),
    check(
      "wall-maximum-bar-spacing",
      barSpacing,
      0.30,
      barSpacing <= 0.30,
      { reference: "NTC 2018 § 7.4.6.2.4" },
    ),
    check(
      "wall-minimum-tie-density",
      9,
      ties,
      ties >= 9,
      { reference: "NTC 2018 § 7.4.6.2.4" },
    ),
  ];
  const recommendation = {
    id: "wall-compressed-zone-recommended-vertical-reinforcement",
    applicable: strain > 0.002,
    demand: strain,
    recommendedMinimum: 0.005,
    satisfied: strain <= 0.002 || verticalRatio >= 0.005,
    mandatory: false,
    reference: "NTC 2018 § 7.4.6.2.4",
  };
  return {
    status: checks.every((item) => item.ok) ? "ok" : "not-verified",
    ok: checks.every((item) => item.ok),
    minimumThickness,
    checks,
    recommendations: [recommendation],
    references: NTC2018_WALL_SYSTEM_REFERENCES,
  };
}

export function createCouplingBeamAssessment({
  beamId,
  clearSpan,
  sectionHeight,
  slabThickness,
  width,
  effectiveDepth,
  shearDemand,
  concreteTensileDesignStrength,
  chapter4FlexuralVerification,
  ordinaryBeamVerification,
  diagonalReinforcement,
}) {
  const span = positive(clearSpan, "clearSpan");
  const height = positive(sectionHeight, "sectionHeight");
  const slab = positive(slabThickness, "slabThickness");
  const beamWidth = positive(width, "width");
  const depth = positive(effectiveDepth, "effectiveDepth");
  const shear = Math.abs(finite(shearDemand, "shearDemand"));
  const fctd = positive(
    concreteTensileDesignStrength,
    "concreteTensileDesignStrength",
  );
  if (chapter4FlexuralVerification != null &&
      typeof chapter4FlexuralVerification.ok !== "boolean") {
    throw new Error("chapter4FlexuralVerification.ok must be boolean.");
  }
  if (ordinaryBeamVerification != null &&
      typeof ordinaryBeamVerification.ok !== "boolean") {
    throw new Error("ordinaryBeamVerification.ok must be boolean.");
  }
  const spanToHeightRatio = span / height;
  const ordinaryShearLimit = fctd * beamWidth * depth;
  const ordinaryProcedureAllowed =
    spanToHeightRatio >= 3 || shear <= ordinaryShearLimit;
  const effectiveForCoupling =
    Math.abs(height - slab) > 1e-9 * Math.max(1, height, slab);
  const checks = [
    check(
      "coupling-beam-effective-depth-beyond-slab",
      height,
      slab,
      effectiveForCoupling,
      {
        comparison: "!=",
        reference: "NTC 2018 § 7.4.4.6",
      },
    ),
  ];
  const missing = [];

  if (chapter4FlexuralVerification == null) {
    missing.push("chapter4FlexuralVerification");
  } else {
    checks.push({
      ...chapter4FlexuralVerification,
      id: chapter4FlexuralVerification.id ??
        "coupling-beam-chapter4-flexure",
    });
  }

  if (ordinaryProcedureAllowed) {
    if (ordinaryBeamVerification == null) {
      missing.push("ordinaryBeamVerification");
    } else {
      checks.push({
        ...ordinaryBeamVerification,
        id: ordinaryBeamVerification.id ??
          "coupling-beam-ordinary-procedure",
      });
    }
  } else if (diagonalReinforcement == null) {
    missing.push("diagonalReinforcement");
  } else {
    const area = positive(
      diagonalReinforcement.areaPerDiagonal,
      "diagonalReinforcement.areaPerDiagonal",
    );
    const fyd = positive(
      diagonalReinforcement.designYieldStrength,
      "diagonalReinforcement.designYieldStrength",
    );
    const angle = positive(
      diagonalReinforcement.minimumAngle,
      "diagonalReinforcement.minimumAngle",
    );
    if (angle >= Math.PI / 2) {
      throw new Error(
        "diagonalReinforcement.minimumAngle must be below pi/2 radians.",
      );
    }
    const diagonalCapacity = 2 * area * fyd * Math.sin(angle);
    const confinementSpacing = positive(
      diagonalReinforcement.confinementSpacing,
      "diagonalReinforcement.confinementSpacing",
    );
    const distributedBarDiameter = positive(
      diagonalReinforcement.distributedBarDiameter,
      "diagonalReinforcement.distributedBarDiameter",
    );
    const distributedBarSpacing = positive(
      diagonalReinforcement.distributedBarSpacing,
      "diagonalReinforcement.distributedBarSpacing",
    );
    const edgeBarCount = nonNegative(
      diagonalReinforcement.edgeBarCountPerEdge,
      "diagonalReinforcement.edgeBarCountPerEdge",
    );
    const edgeBarDiameter = positive(
      diagonalReinforcement.edgeBarDiameter,
      "diagonalReinforcement.edgeBarDiameter",
    );
    const providedAnchorage = positive(
      diagonalReinforcement.providedAnchorageLength,
      "diagonalReinforcement.providedAnchorageLength",
    );
    const ordinaryAnchorage = positive(
      diagonalReinforcement.nonSeismicAnchorageLength,
      "diagonalReinforcement.nonSeismicAnchorageLength",
    );
    checks.push(
      check(
        "coupling-beam-diagonal-shear",
        shear,
        diagonalCapacity,
        shear <= diagonalCapacity,
        { reference: "NTC 2018 § 7.4.4.6, Eq. [7.4.24]" },
      ),
      check(
        "coupling-beam-diagonal-confinement-spacing",
        confinementSpacing,
        0.10,
        confinementSpacing <= 0.10,
        { reference: "NTC 2018 § 7.4.6.2.5" },
      ),
      check(
        "coupling-beam-distributed-bar-diameter",
        0.010,
        distributedBarDiameter,
        distributedBarDiameter >= 0.010,
        { reference: "NTC 2018 § 7.4.6.2.5" },
      ),
      check(
        "coupling-beam-distributed-bar-spacing",
        distributedBarSpacing,
        0.10,
        distributedBarSpacing <= 0.10,
        { reference: "NTC 2018 § 7.4.6.2.5" },
      ),
      check(
        "coupling-beam-edge-bars",
        edgeBarCount,
        2,
        edgeBarCount >= 2 && edgeBarDiameter >= 0.016,
        {
          edgeBarDiameter,
          reference: "NTC 2018 § 7.4.6.2.5",
        },
      ),
      check(
        "coupling-beam-seismic-anchorage",
        providedAnchorage,
        1.5 * ordinaryAnchorage,
        providedAnchorage >= 1.5 * ordinaryAnchorage,
        { reference: "NTC 2018 § 7.4.6.2.5" },
      ),
    );
  }

  const complete = missing.length === 0;
  const ok = complete && checks.every((item) => item.ok === true);
  return {
    beamId,
    status: complete ? (ok ? "ok" : "not-verified") : "not-implemented",
    complete,
    ok,
    procedure: ordinaryProcedureAllowed ? "ordinary-beam" : "diagonal-X",
    effectiveForCoupling,
    spanToHeightRatio,
    ordinaryShearLimit,
    missing,
    checks,
    references: NTC2018_WALL_SYSTEM_REFERENCES,
  };
}

export function createWallHeightSystemAssessment({
  wallId,
  expectedSectionCutIds,
  sectionStateAssessments,
  detailingAssessment,
  couplingBeamAssessments = [],
  additionalChecks = [],
}) {
  if (!Array.isArray(expectedSectionCutIds) ||
      expectedSectionCutIds.length === 0) {
    throw new Error("expectedSectionCutIds must be a non-empty array.");
  }
  const assessments = Array.isArray(sectionStateAssessments)
    ? sectionStateAssessments
    : [];
  const assessedCutIds = new Set(assessments.map((item) =>
    item.sectionCutId));
  const missing = [
    ...expectedSectionCutIds
      .filter((id) => !assessedCutIds.has(id))
      .map((id) => `sectionCut:${id}`),
    ...(detailingAssessment == null ? ["detailingAssessment"] : []),
    ...couplingBeamAssessments
      .filter((item) => item?.complete !== true)
      .map((item) => `couplingBeam:${item?.beamId ?? "unknown"}`),
  ];
  const complete = missing.length === 0 &&
    assessments.length > 0 &&
    assessments.every((item) => item?.complete === true);
  const checks = [
    ...assessments.flatMap((item) => item.checks ?? []),
    ...(detailingAssessment?.checks ?? []),
    ...couplingBeamAssessments.flatMap((item) => item.checks ?? []),
    ...additionalChecks,
  ];
  const ok = complete && checks.every((item) => item.ok === true);
  return {
    wallId,
    status: complete ? (ok ? "ok" : "not-verified") : "not-implemented",
    complete,
    ok,
    missing,
    sectionStateAssessments: assessments,
    detailingAssessment,
    couplingBeamAssessments,
    checks,
    references: NTC2018_WALL_SYSTEM_REFERENCES,
  };
}
