import { VerificationResult } from "../../../core/results/VerificationResult.js";
import {
  governingCheck,
  isFinitePositive,
  round,
  utilizationCheck,
} from "../../../core/results/checkUtils.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import {
  computeWithTransverseResistanceAtCotTheta,
} from "./shear/ntc2018ShearResistance.js";
import { resolveShearParameters } from "./shear/shearParameterResolvers.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });
const COT_THETA_MIN = 1;
const COT_THETA_MAX = 2.5;

function concreteSectionFrom(section) {
  return section?.concreteSection ?? section;
}

function polygonPerimeter(points = []) {
  if (!Array.isArray(points) || points.length < 3) {
    return null;
  }

  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + Math.hypot(next.y - point.y, next.z - point.z);
  }, 0);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resolveGeometry({ section, torsion, resolver, warnings, sources }) {
  const concreteSection = concreteSectionFrom(section);
  const concreteArea = Number.isFinite(torsion.concreteArea ?? torsion.ac)
    ? resolver.area(torsion.concreteArea ?? torsion.ac)
    : concreteSection?.area ?? null;
  const sectionPerimeter = Number.isFinite(
    torsion.sectionPerimeter ?? torsion.perimeter,
  )
    ? resolver.length(torsion.sectionPerimeter ?? torsion.perimeter)
    : Number.isFinite(concreteSection?.width) && Number.isFinite(concreteSection?.height)
      ? 2 * (concreteSection.width + concreteSection.height)
      : polygonPerimeter(concreteSection?.outlinePoints);

  sources.concreteArea = Number.isFinite(torsion.concreteArea ?? torsion.ac)
    ? "explicit"
    : "section";
  sources.sectionPerimeter = Number.isFinite(
    torsion.sectionPerimeter ?? torsion.perimeter,
  )
    ? "explicit"
    : "section";

  const edgeDistance = Number.isFinite(
    torsion.edgeToLongitudinalBarCenter ?? torsion.edgeDistance,
  )
    ? resolver.length(
        torsion.edgeToLongitudinalBarCenter ?? torsion.edgeDistance,
      )
    : null;
  const baseThickness =
    isFinitePositive(concreteArea) && isFinitePositive(sectionPerimeter)
      ? concreteArea / sectionPerimeter
      : null;
  const explicitThickness = Number.isFinite(
    torsion.effectiveWallThickness ?? torsion.t,
  )
    ? resolver.length(torsion.effectiveWallThickness ?? torsion.t)
    : null;
  const effectiveWallThickness = explicitThickness ??
    (isFinitePositive(baseThickness)
      ? Math.max(baseThickness, isFinitePositive(edgeDistance) ? 2 * edgeDistance : 0)
      : null);

  sources.effectiveWallThickness = explicitThickness != null
    ? "explicit"
    : "derived-Ac-over-u";

  if (explicitThickness == null && edgeDistance == null) {
    warnings.push(
      "The NTC lower bound t >= 2 times the edge-to-longitudinal-bar-center distance was not checked; pass torsion.edgeToLongitudinalBarCenter or torsion.effectiveWallThickness.",
    );
  }

  let medianArea = Number.isFinite(torsion.medianArea ?? torsion.ak)
    ? resolver.area(torsion.medianArea ?? torsion.ak)
    : null;
  let medianPerimeter = Number.isFinite(
    torsion.medianPerimeter ?? torsion.um,
  )
    ? resolver.length(torsion.medianPerimeter ?? torsion.um)
    : null;

  if (
    (medianArea == null || medianPerimeter == null) &&
    isFinitePositive(concreteSection?.width) &&
    isFinitePositive(concreteSection?.height) &&
    isFinitePositive(effectiveWallThickness)
  ) {
    const medianWidth = concreteSection.width - effectiveWallThickness;
    const medianHeight = concreteSection.height - effectiveWallThickness;

    if (medianWidth > 0 && medianHeight > 0) {
      medianArea ??= medianWidth * medianHeight;
      medianPerimeter ??= 2 * (medianWidth + medianHeight);
      sources.medianGeometry = "derived-rectangular-section";
    }
  }

  if (medianArea == null || medianPerimeter == null) {
    sources.medianGeometry = "missing";
    warnings.push(
      "Torsion medianArea and medianPerimeter are required when they cannot be derived from a rectangular section.",
    );
  }

  return {
    concreteArea,
    sectionPerimeter,
    edgeDistance,
    baseThickness,
    effectiveWallThickness,
    medianArea,
    medianPerimeter,
  };
}

function resolveTransverseReinforcement({
  torsion,
  reinforcementMaterial,
  resolver,
  warnings,
}) {
  const transverse = torsion.transverseReinforcement ?? {};
  const diameter = Number.isFinite(transverse.diameter)
    ? resolver.length(transverse.diameter)
    : null;
  const area = Number.isFinite(transverse.areaPerLeg ?? transverse.area)
    ? resolver.area(transverse.areaPerLeg ?? transverse.area)
    : isFinitePositive(diameter)
      ? (Math.PI * diameter ** 2) / 4
      : null;
  const spacing = Number.isFinite(transverse.spacing)
    ? resolver.length(transverse.spacing)
    : null;
  const fyd = Number.isFinite(transverse.fyd)
    ? resolver.stress(transverse.fyd)
    : transverse.material?.fyd ?? reinforcementMaterial?.fyd ?? null;

  if (transverse.closed === false) {
    warnings.push("Torsion reinforcement requires closed transverse stirrups.");
    return null;
  }

  if (!isFinitePositive(area) || !isFinitePositive(spacing) || !isFinitePositive(fyd)) {
    warnings.push(
      "Torsion transverse reinforcement requires areaPerLeg or diameter, spacing and fyd.",
    );
    return null;
  }

  return {
    area,
    spacing,
    areaPerSpacing: area / spacing,
    diameter,
    fyd,
    closed: true,
  };
}

function resolveLongitudinalReinforcement({
  torsion,
  reinforcementMaterial,
  resolver,
  warnings,
}) {
  const longitudinal = torsion.longitudinalReinforcement ?? {};
  const areaInput =
    longitudinal.area ??
    torsion.torsionalLongitudinalReinforcementArea ??
    torsion.longitudinalReinforcementArea;
  const area = Number.isFinite(areaInput) ? resolver.area(areaInput) : null;
  const fydInput = longitudinal.fyd ?? torsion.longitudinalFyd;
  const fyd = Number.isFinite(fydInput)
    ? resolver.stress(fydInput)
    : longitudinal.material?.fyd ?? reinforcementMaterial?.fyd ?? null;

  if (!isFinitePositive(area) || !isFinitePositive(fyd)) {
    warnings.push(
      "Torsion longitudinal reinforcement requires an explicit area assigned to torsion and fyd.",
    );
    return null;
  }

  return { area, fyd };
}

function resolveCotTheta({ torsion, transverse, longitudinal, geometry, warnings }) {
  const requested = torsion.cotTheta;

  if (Number.isFinite(requested)) {
    if (requested < COT_THETA_MIN || requested > COT_THETA_MAX) {
      warnings.push(
        `torsion.cotTheta must lie in [${COT_THETA_MIN}, ${COT_THETA_MAX}].`,
      );
      return null;
    }

    return {
      value: requested,
      source: "explicit",
      unclamped: requested,
    };
  }

  if (transverse && longitudinal && isFinitePositive(geometry.medianPerimeter)) {
    const aL = longitudinal.area / geometry.medianPerimeter;
    const aS = transverse.area / transverse.spacing;
    const compatible = Math.sqrt(aL / aS);

    return {
      value: clamp(compatible, COT_THETA_MIN, COT_THETA_MAX),
      source: "pure-torsion-compatible-reinforcement",
      unclamped: compatible,
    };
  }

  warnings.push(
    "torsion.cotTheta could not be derived from complete reinforcement data.",
  );
  return null;
}

function missingParameters({ geometry, transverse, longitudinal, cotTheta, fcdPrime }) {
  const missing = [];

  if (!isFinitePositive(geometry.effectiveWallThickness)) missing.push("effectiveWallThickness");
  if (!isFinitePositive(geometry.medianArea)) missing.push("medianArea");
  if (!isFinitePositive(geometry.medianPerimeter)) missing.push("medianPerimeter");
  if (!transverse) missing.push("transverseReinforcement");
  if (!longitudinal) missing.push("longitudinalReinforcement");
  if (!cotTheta) missing.push("cotTheta");
  if (!isFinitePositive(fcdPrime)) missing.push("fcdPrime");

  return missing;
}

function verifyTorsionActions({
  code,
  section,
  concreteMaterial,
  reinforcementMaterial,
  tEd,
  vEd,
  nEd,
  mEd,
  torsion,
  shear,
  units,
}) {
  const resolver = createUnitResolver(units, INTERNAL_UNITS);
  const convertedTEd = Math.abs(resolver.moment(tEd ?? 0));
  const convertedVEd = Math.abs(resolver.force(vEd ?? 0));
  const convertedNEd = resolver.force(nEd ?? 0);
  const convertedMEd = resolver.moment(mEd ?? 0);
  const warnings = [];
  const sources = {};

  if (torsion.equilibriumRequired === false) {
    return {
      status: RESULT_STATUS.NOT_ANALYZED,
      utilizationRatio: null,
      demand: convertedTEd,
      capacity: null,
      checks: [],
      outputs: { tEd: convertedTEd, vEd: convertedVEd },
      warnings: [
        "Torsion was classified as compatibility torsion; no ULS torsion resistance check was performed.",
      ],
      assumptions: [],
      metadata: {
        code,
        method: "ntc2018-4.1.2.3.6",
        equilibriumRequired: false,
      },
    };
  }

  const geometry = resolveGeometry({ section, torsion, resolver, warnings, sources });
  const transverse = resolveTransverseReinforcement({
    torsion,
    reinforcementMaterial,
    resolver,
    warnings,
  });
  const longitudinal = resolveLongitudinalReinforcement({
    torsion,
    reinforcementMaterial,
    resolver,
    warnings,
  });
  const cotTheta = resolveCotTheta({
    torsion,
    transverse,
    longitudinal,
    geometry,
    warnings,
  });
  const explicitFcdPrime = torsion.fcdPrime;
  const fcdPrime = Number.isFinite(explicitFcdPrime)
    ? resolver.stress(explicitFcdPrime)
    : (torsion.fcdPrimeFactor ?? 0.5) * (concreteMaterial?.fcd ?? 0);
  const missing = missingParameters({
    geometry,
    transverse,
    longitudinal,
    cotTheta,
    fcdPrime,
  });

  if (missing.length > 0) {
    return {
      status: RESULT_STATUS.NOT_VERIFIED,
      utilizationRatio: null,
      demand: convertedTEd,
      capacity: null,
      checks: [],
      outputs: {
        tEd: convertedTEd,
        vEd: convertedVEd,
        geometry,
        sources,
      },
      warnings,
      assumptions: [
        "NTC 2018 4.1.2.3.6 torsion resistance was not evaluated because required parameters are incomplete.",
      ],
      metadata: {
        code,
        method: "ntc2018-4.1.2.3.6",
        missingParameters: missing,
      },
    };
  }

  const cot = cotTheta.value;
  const trcd =
    (2 * geometry.medianArea * geometry.effectiveWallThickness * fcdPrime * cot) /
    (1 + cot ** 2);
  const trsd =
    2 * geometry.medianArea * transverse.areaPerSpacing * transverse.fyd * cot;
  const trld =
    (2 * geometry.medianArea * longitudinal.area * longitudinal.fyd) /
    (geometry.medianPerimeter * cot);
  const torsionChecks = [
    utilizationCheck({
      id: "rc-torsion-concrete-strut",
      description: "Torsion resistance of concrete compression struts",
      demand: convertedTEd,
      capacity: trcd,
      metadata: { reference: "NTC2018-4.1.35" },
    }),
    utilizationCheck({
      id: "rc-torsion-transverse-reinforcement",
      description: "Torsion resistance of closed transverse reinforcement",
      demand: convertedTEd,
      capacity: trsd,
      metadata: { reference: "NTC2018-4.1.36" },
    }),
    utilizationCheck({
      id: "rc-torsion-longitudinal-reinforcement",
      description: "Torsion resistance of longitudinal reinforcement assigned to torsion",
      demand: convertedTEd,
      capacity: trld,
      metadata: { reference: "NTC2018-4.1.37" },
    }),
  ];
  let shearAtCotTheta = null;

  if (convertedVEd > 1e-9) {
    if (!shear) {
      warnings.push(
        "Combined shear-torsion resistance requires the shear parameters used for the member verification.",
      );
    } else {
      const shearInput = {
        ...shear,
        mode: "with-transverse-reinforcement",
        torsionHandled: true,
      };
      const shearParams = resolveShearParameters({
        section,
        concreteMaterial,
        reinforcementMaterial,
        shear: shearInput,
        nEd: convertedNEd,
        mEd: convertedMEd,
        units: INTERNAL_UNITS,
      });
      shearAtCotTheta = computeWithTransverseResistanceAtCotTheta({
        params: shearParams,
        shear: shearInput,
        units: INTERNAL_UNITS,
        cotTheta: cot,
      });
      warnings.push(...(shearAtCotTheta.warnings ?? []));

      if (shearAtCotTheta.available) {
        const interaction = convertedTEd / trcd + convertedVEd / shearAtCotTheta.vRcd;

        torsionChecks.push({
          id: "rc-shear-torsion-concrete-interaction",
          description: "Combined shear and torsion resistance of concrete struts",
          demand: round(interaction),
          capacity: 1,
          utilizationRatio: round(interaction),
          ok: interaction <= 1,
          metadata: {
            reference: "NTC2018-4.1.40",
            tEd: round(convertedTEd),
            trcd: round(trcd),
            vEd: round(convertedVEd),
            vRcd: round(shearAtCotTheta.vRcd),
            cotTheta: round(cot),
          },
        });
      }
    }
  }

  const combinedMissing = convertedVEd > 1e-9 && !shearAtCotTheta?.available;
  const governing = governingCheck(torsionChecks);
  const allChecksPass = torsionChecks.every((check) => check.ok === true);
  const torsionCapacity = Math.min(trcd, trsd, trld);

  warnings.push(
    "Longitudinal torsion reinforcement is checked as an explicitly assigned area; its additive placement with flexural reinforcement is not detailed by this MVP.",
  );

  return {
    status:
      !combinedMissing && allChecksPass
        ? RESULT_STATUS.OK
        : RESULT_STATUS.NOT_VERIFIED,
    utilizationRatio: governing?.utilizationRatio ?? null,
    demand: governing?.demand ?? convertedTEd,
    capacity: governing?.capacity ?? torsionCapacity,
    checks: torsionChecks,
    outputs: {
      tEd: round(convertedTEd),
      vEd: round(convertedVEd),
      cotTheta: round(cot),
      cotThetaSource: cotTheta.source,
      cotThetaUnclamped: round(cotTheta.unclamped),
      geometry: {
        concreteArea: round(geometry.concreteArea),
        sectionPerimeter: round(geometry.sectionPerimeter),
        edgeDistance: round(geometry.edgeDistance),
        baseThickness: round(geometry.baseThickness),
        effectiveWallThickness: round(geometry.effectiveWallThickness),
        medianArea: round(geometry.medianArea),
        medianPerimeter: round(geometry.medianPerimeter),
      },
      reinforcement: {
        transverse: {
          area: round(transverse.area),
          spacing: round(transverse.spacing),
          areaPerSpacing: round(transverse.areaPerSpacing, 9),
          fyd: round(transverse.fyd),
        },
        longitudinal: {
          area: round(longitudinal.area),
          fyd: round(longitudinal.fyd),
        },
      },
      fcdPrime: round(fcdPrime),
      trcd: round(trcd),
      trsd: round(trsd),
      trld: round(trld),
      trd: round(torsionCapacity),
      shearAtCotTheta: shearAtCotTheta?.available
        ? {
            vRsd: round(shearAtCotTheta.vRsd),
            vRcd: round(shearAtCotTheta.vRcd),
            z: round(shearAtCotTheta.z),
            fcdPrime: round(shearAtCotTheta.fcdPrime),
            alphaC: round(shearAtCotTheta.alphaC),
          }
        : null,
      sources,
    },
    warnings,
    assumptions: [
      "NTC 2018 4.1.2.3.6 peripheral space-truss resistance is used for solid or hollow prismatic sections within its stated scope.",
      "The same cotTheta is used for torsion and the concrete shear-torsion interaction check.",
      "The default reduced concrete strength is f'cd = 0.5 fcd unless torsion.fcdPrime or torsion.fcdPrimeFactor is supplied.",
    ],
    metadata: {
      code,
      method: "ntc2018-4.1.2.3.6",
      governingCheckId: governing?.id ?? null,
      missingParameters: combinedMissing ? ["combinedShearTorsionParameters"] : [],
    },
  };
}

export class ReinforcedConcreteTorsionVerification {
  constructor({ code = "NTC2018", torsion = {}, shear = null, metadata = {} } = {}) {
    this.code = code;
    this.torsion = { ...torsion };
    this.shear = shear;
    this.metadata = { ...metadata };
  }

  verifySectionActions({
    tEd = 0,
    vEd = 0,
    nEd = 0,
    mEd = 0,
    context = {},
    section = context.section,
    concreteMaterial = context.concreteMaterial ?? section?.concreteMaterial,
    reinforcementMaterial =
      context.reinforcementMaterial ?? section?.reinforcementMaterial,
    torsion = context.torsion ?? this.torsion,
    shear = context.shear ?? this.shear,
    units =
      context.units ??
      torsion?.units ??
      section?.metadata?.unitSystem ??
      INTERNAL_UNITS,
  } = {}) {
    if (!section || !concreteMaterial) {
      return {
        status: RESULT_STATUS.NOT_VERIFIED,
        utilizationRatio: null,
        demand: Math.abs(tEd ?? 0),
        capacity: null,
        checks: [],
        outputs: {},
        warnings: [
          "RC torsion verification requires a section and a concrete material.",
        ],
        assumptions: [],
        metadata: {
          code: this.code,
          method: "ntc2018-4.1.2.3.6",
        },
      };
    }

    return verifyTorsionActions({
      code: this.code,
      section,
      concreteMaterial,
      reinforcementMaterial,
      tEd,
      vEd,
      nEd,
      mEd,
      torsion: { ...this.torsion, ...torsion },
      shear,
      units,
    });
  }

  verify(options = {}) {
    const result = this.verifySectionActions({
      ...options,
      tEd: options.actions?.tEd ?? options.actions?.t ?? 0,
      vEd: options.actions?.vEd ?? options.actions?.v ?? 0,
      nEd: options.actions?.nEd ?? options.actions?.n ?? 0,
      mEd: options.actions?.mEd ?? options.actions?.m ?? 0,
      context: {
        section: options.section,
        concreteMaterial: options.concreteMaterial,
        reinforcementMaterial: options.reinforcementMaterial,
        torsion: options.torsion,
        shear: options.shear,
        units: options.units,
      },
    });

    return new VerificationResult({
      applicationId: "reinforced-concrete-torsion",
      ...result,
      metadata: {
        ...result.metadata,
        ...this.metadata,
      },
    });
  }
}
