import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { round, uniqueStrings } from "../../../core/results/checkUtils.js";
import {
  createElasticBeamSectionProvider,
  createSteelBeamSectionProvider,
  SingleBeamAnalysis,
} from "../../../domain/beams/index.js";
import { createSteelProfileSection } from "../../../domain/geometry/createSteelProfileSection.js";
import { RectangularSection } from "../../../domain/geometry/RectangularSection.js";
import { SteelMaterial } from "../../../domain/materials/SteelMaterial.js";
import {
  createNTC2018PermanentAction,
  createNTC2018StructuralSteelMaterial,
  createNTC2018VariableAction,
} from "../../../norms/ntc2018/index.js";
import { MasonryPierVerticalVerification } from "../../masonry-piers/checks/MasonryPierVerticalVerification.js";
import { MasonryPierModel } from "../../masonry-piers/models/MasonryPierModel.js";
import { SteelMemberVerification } from "../../steel-frames/checks/SteelMemberVerification.js";
import { extractEquivalentFrameMembers } from "../geometry/extractEquivalentFrameMembers.js";
import { resolveMasonryUnitWeight } from "../materials/resolveMasonryMaterialProperty.js";
import { resolveAlignmentMechanicalState } from "../materials/resolveAlignmentMechanicalState.js";
import { sanitizeAlignmentOpenings } from "../geometry/sanitizeAlignmentOpenings.js";

const DEFAULT_PIER_DESIGN = Object.freeze({
  gammaM: 2,
  confidenceFactor: 1,
});
const DEFAULT_COMBINATION_TYPE = "ULS_FUNDAMENTAL";
const DEFAULT_LINTEL_BEARING = 0.3;
const DEFAULT_EQUILIBRIUM_TOLERANCE = 1e-6;
const EPS = 1e-9;

function resultToJson(value) {
  return typeof value?.toJSON === "function" ? value.toJSON() : value;
}

function normalizeCombinationType(value = DEFAULT_COMBINATION_TYPE) {
  return String(value)
    .trim()
    .toUpperCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

function findAdjacentOpening(openings, coordinate, side) {
  return (
    openings.find((opening) =>
      side === "left"
        ? Math.abs(opening.x + opening.width - coordinate) <= EPS
        : Math.abs(opening.x - coordinate) <= EPS,
    ) ?? null
  );
}

function overlaps1D(startA, endA, startB, endB) {
  return Math.min(endA, endB) - Math.max(startA, startB) > EPS;
}

function normalizeLineLoadEntryKey(rawKey) {
  return String(rawKey).trim();
}

function resolveVariableCategory(entry, key) {
  if (entry?.category) {
    return entry.category;
  }

  if (key.toUpperCase() === "QK") {
    return "A";
  }

  if (key.toUpperCase().startsWith("Q")) {
    return "A";
  }

  return null;
}

function resolveLineLoadEntries(payload, wallId, warnings) {
  if (Number.isFinite(payload)) {
    return [
      {
        id: `${wallId}-direct`,
        key: "DIRECT",
        value: payload,
        kind: "direct",
      },
    ];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const entries = [];

  for (const [rawKey, rawValue] of Object.entries(payload)) {
    const key = normalizeLineLoadEntryKey(rawKey);
    const value =
      Number.isFinite(rawValue) ? rawValue : rawValue?.value;

    if (!Number.isFinite(value)) {
      continue;
    }

    const normalizedKey = key.toUpperCase();
    const permanentClass =
      rawValue?.permanentClass ??
      (normalizedKey === "G1" || normalizedKey === "G2" ? normalizedKey : null);
    const category = resolveVariableCategory(rawValue, normalizedKey);
    const isVariable =
      rawValue?.nature === "variable" ||
      category != null ||
      normalizedKey === "QK";

    if (permanentClass) {
      entries.push({
        id: `${wallId}-${key}`,
        key,
        value,
        kind: "permanent",
        action: createNTC2018PermanentAction({
          id: `${wallId}-${key}-action`,
          permanentClass,
        }),
      });
      continue;
    }

    if (isVariable) {
      entries.push({
        id: `${wallId}-${key}`,
        key,
        value,
        kind: "variable",
        leading: Boolean(rawValue?.leading),
        action: createNTC2018VariableAction({
          id: `${wallId}-${key}-action`,
          category,
          family: rawValue?.family ?? "imposed",
        }),
      });
      continue;
    }

    warnings.push(
      `Wall ${wallId} line load entry ${key} was treated as a direct characteristic contribution because it does not map to the supported G1/G2/Qk action families.`,
    );
    entries.push({
      id: `${wallId}-${key}`,
      key,
      value,
      kind: "direct",
    });
  }

  return entries;
}

function selectLeadingVariable(entries = []) {
  return (
    entries.find((entry) => entry.leading) ??
    entries.reduce((selected, candidate) =>
      !selected || Math.abs(candidate.value) > Math.abs(selected.value)
        ? candidate
        : selected,
    null)
  );
}

function resolveCombinedLineLoad({
  payload,
  wallId,
  combinationType,
  warnings,
}) {
  const entries = resolveLineLoadEntries(payload, wallId, warnings);
  const normalizedCombination = normalizeCombinationType(combinationType);

  if (entries.length === 0) {
    return {
      value: 0,
      entries,
      factors: [],
      combinationType: normalizedCombination,
    };
  }

  const permanents = entries.filter((entry) => entry.kind === "permanent");
  const variables = entries.filter((entry) => entry.kind === "variable");
  const directs = entries.filter((entry) => entry.kind === "direct");
  const factors = [];
  let value = directs.reduce((sum, entry) => sum + entry.value, 0);

  const pushFactor = (entry, factor) => {
    factors.push({
      entryId: entry.id,
      key: entry.key,
      factor,
      contribution: entry.value * factor,
    });
    value += entry.value * factor;
  };

  if (normalizedCombination === "CHARACTERISTIC" || normalizedCombination === "DIRECT") {
    for (const entry of [...permanents, ...variables]) {
      pushFactor(entry, 1);
    }

    return {
      value,
      entries,
      factors,
      combinationType: normalizedCombination,
    };
  }

  if (normalizedCombination === "ULS_FUNDAMENTAL") {
    for (const entry of permanents) {
      pushFactor(entry, entry.action.getPartialFactor({ effect: "unfavourable" }));
    }

    const leading = selectLeadingVariable(variables);

    for (const entry of variables) {
      const factor =
        entry.id === leading?.id
          ? entry.action.getPartialFactor({ effect: "unfavourable" })
          : entry.action.getPartialFactor({ effect: "unfavourable" }) *
            entry.action.getCombinationFactor("psi0");

      pushFactor(entry, factor);
    }

    return {
      value,
      entries,
      factors,
      combinationType: normalizedCombination,
      leadingVariableId: leading?.id ?? null,
    };
  }

  if (normalizedCombination === "SLE_RARE" || normalizedCombination === "SLE_FREQUENT") {
    for (const entry of permanents) {
      pushFactor(entry, 1);
    }

    const leading = selectLeadingVariable(variables);

    for (const entry of variables) {
      const factor =
        entry.id === leading?.id
          ? normalizedCombination === "SLE_RARE"
            ? 1
            : entry.action.getCombinationFactor("psi1")
          : normalizedCombination === "SLE_RARE"
            ? entry.action.getCombinationFactor("psi0")
            : entry.action.getCombinationFactor("psi2");

      pushFactor(entry, factor);
    }

    return {
      value,
      entries,
      factors,
      combinationType: normalizedCombination,
      leadingVariableId: leading?.id ?? null,
    };
  }

  if (
    normalizedCombination === "SLE_QUASI_PERMANENT" ||
    normalizedCombination === "SEISMIC"
  ) {
    for (const entry of permanents) {
      pushFactor(entry, 1);
    }

    for (const entry of variables) {
      pushFactor(entry, entry.action.getCombinationFactor("psi2"));
    }

    return {
      value,
      entries,
      factors,
      combinationType: normalizedCombination,
    };
  }

  throw new Error(`Unsupported wall line-load combination type: ${combinationType}.`);
}

function openingWallOverlaps(alignment, opening) {
  return alignment.walls
    .map((wall) => ({
      wall,
      xStart: Math.max(wall.xStart, opening.x),
      xEnd: Math.min(wall.xEnd, opening.x + opening.width),
    }))
    .filter((item) => item.xEnd - item.xStart > EPS)
    .map((item) => ({
      ...item,
      width: item.xEnd - item.xStart,
      openingTop: opening.y + opening.height,
    }));
}

function computeOpeningTransferredLoads({
  opening,
  alignment,
  wallLineLoads,
  warnings,
}) {
  const overlaps = openingWallOverlaps(alignment, opening).map((item) => {
    const combinedLineLoad = wallLineLoads[item.wall.id]?.value ?? 0;
    const topLoad = combinedLineLoad * item.width;
    const unitWeight = resolveMasonryUnitWeight({
      material: item.wall.material,
      targetUnits: alignment.units,
    });
    const tributaryHeight = Math.max(0, item.wall.height - item.openingTop);
    const masonryBandIntensity =
      Number.isFinite(unitWeight) && unitWeight > 0
        ? unitWeight * item.wall.thickness * tributaryHeight
        : 0;

    if (!Number.isFinite(unitWeight) || unitWeight <= 0) {
      warnings.push(
        `Opening ${opening.id} could not resolve a finite masonry unit weight for wall ${item.wall.id}; the masonry band above the opening was set to zero in the static transfer model.`,
      );
    }

    return {
      wallId: item.wall.id,
      xStart: item.xStart,
      xEnd: item.xEnd,
      width: item.width,
      lineLoadIntensity: combinedLineLoad,
      topLoad,
      tributaryHeight,
      masonryBandIntensity,
      masonryBandLoad: masonryBandIntensity * item.width,
    };
  });

  return {
    overlaps,
    topLoad: overlaps.reduce((sum, item) => sum + item.topLoad, 0),
    openingBandLoad: overlaps.reduce((sum, item) => sum + item.masonryBandLoad, 0),
  };
}

function resolveTributaryInterval(pier, sanitizedOpenings) {
  const xStart = pier.x;
  const xEnd = pier.x + pier.length;
  const leftOpening = findAdjacentOpening(sanitizedOpenings, xStart, "left");
  const rightOpening = findAdjacentOpening(sanitizedOpenings, xEnd, "right");
  const tributaryStart =
    xStart -
    (leftOpening && !leftOpening.ringFrame ? leftOpening.width / 2 : 0);
  const tributaryEnd =
    xEnd +
    (rightOpening && !rightOpening.ringFrame ? rightOpening.width / 2 : 0);

  return {
    xStart: tributaryStart,
    xEnd: tributaryEnd,
    leftOpening,
    rightOpening,
  };
}

function resolveLintelBearing(lintel) {
  return Number.isFinite(lintel?.bearingLength)
    ? lintel.bearingLength
    : DEFAULT_LINTEL_BEARING;
}

function createRectangularSectionFromLintel(lintel) {
  const width = lintel.sectionWidth ?? lintel.width ?? null;
  const height = lintel.sectionHeight ?? lintel.depth ?? lintel.height ?? null;

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return new RectangularSection({
    width,
    height,
    units: lintel.units ?? { force: "N", length: "m" },
  });
}

function createSteelMaterialFromLintel(lintel) {
  if (lintel.material instanceof SteelMaterial || lintel.material?.category === "steel") {
    return lintel.material;
  }

  const grade = lintel.materialGrade ?? lintel.grade ?? null;

  if (!grade) {
    return null;
  }

  return createNTC2018StructuralSteelMaterial({
    grade,
    units: lintel.units ?? { force: "N", length: "m" },
  });
}

function resolveLintelProvider(lintel) {
  if (!lintel) {
    return {
      sectionProvider: null,
      section: null,
      material: null,
      providerKind: null,
    };
  }

  if (typeof lintel.sectionProvider?.getElasticBeamProperties === "function") {
    return {
      sectionProvider: lintel.sectionProvider,
      section: lintel.section ?? null,
      material: lintel.material ?? null,
      providerKind:
        lintel.material?.category === "steel" ? "steel" : "generic",
    };
  }

  const section =
    lintel.section ??
    (lintel.sectionProfileName || lintel.profileName
      ? createSteelProfileSection({
          profileName: lintel.sectionProfileName ?? lintel.profileName,
          units: lintel.units ?? { force: "N", length: "m" },
        })
      : createRectangularSectionFromLintel(lintel));
  const material = lintel.material ?? createSteelMaterialFromLintel(lintel);

  if (!section || !material) {
    return {
      sectionProvider: null,
      section: section ?? null,
      material: material ?? null,
      providerKind: null,
    };
  }

  if (material.category === "steel" || material.grade || material.fyk || material.fyd) {
    return {
      sectionProvider: createSteelBeamSectionProvider({ section, material }),
      section,
      material,
      providerKind: "steel",
    };
  }

  return {
    sectionProvider: createElasticBeamSectionProvider({ section, material }),
    section,
    material,
    providerKind: "generic",
  };
}

function summarizeLintelAnalysis(analysisResult) {
  const combination =
    analysisResult?.combinations?.uls ??
    Object.values(analysisResult?.combinations ?? {})[0] ??
    Object.values(analysisResult?.loadCases ?? {})[0] ??
    null;

  if (!combination) {
    return null;
  }

  return {
    resultId: combination.id,
    maxAbsBendingMoment: combination.internalForces?.maxAbsBendingMoment?.m ?? null,
    maxAbsShearForce: combination.internalForces?.maxAbsShearForceY?.vY ?? null,
    maxAbsVerticalDisplacement:
      combination.displacements?.maxAbsVerticalDisplacement?.uy ?? null,
  };
}

function analyzeLintels({
  alignment,
  sanitizedOpenings,
  openingTransferredLoads,
  combinationType,
  warnings,
}) {
  const lintels = [];

  for (const opening of sanitizedOpenings) {
    if (!opening.lintel) {
      continue;
    }

    const lintel = opening.lintel;
    const bearingLength = resolveLintelBearing(lintel);
    const span = opening.width + 2 * bearingLength;
    const loadTransfer = openingTransferredLoads[opening.id];
    const provider = resolveLintelProvider(lintel);
    const openingLoadSegments = loadTransfer.overlaps
      .filter((item) => Math.abs(item.topLoad) > EPS || Math.abs(item.masonryBandLoad) > EPS)
      .map((item, index) => ({
        id: `${alignment.id}-${opening.id}-lintel-segment-${index + 1}`,
        loadCaseId: "combined",
        actionType: "COMBINED",
        type: "uniform",
        from: bearingLength + (item.xStart - opening.x),
        to: bearingLength + (item.xEnd - opening.x),
        value: -(item.lineLoadIntensity + item.masonryBandIntensity),
      }));
    const output = {
      id: `${alignment.id}-lintel-${opening.id}`,
      openingId: opening.id,
      span,
      bearingLength,
      topLoad: loadTransfer.topLoad,
      openingBandLoad: loadTransfer.openingBandLoad,
      totalAppliedLoad: loadTransfer.topLoad + loadTransfer.openingBandLoad,
      status: "not-analyzed",
      providerKind: provider.providerKind,
      analysis: null,
      verification: null,
    };

    if (!provider.sectionProvider) {
      warnings.push(
        `Lintel on opening ${opening.id} was not analyzed because no section/material or sectionProvider was provided.`,
      );
      lintels.push(output);
      continue;
    }

    try {
      const analysisResult = new SingleBeamAnalysis().analyze({
        id: output.id,
        units: alignment.units,
        geometry: {
          start: { x: 0, y: 0 },
          end: { x: span, y: 0 },
        },
        sectionProvider: provider.sectionProvider,
        supports: {
          start: "hinge",
          end: "roller",
        },
        loads: openingLoadSegments,
        combinations: [
          {
            id: "uls",
            limitState: "ULS",
            combinationType: normalizeCombinationType(combinationType),
            factors: {
              combined: 1,
            },
          },
        ],
        discretization: {
          elementCount: 8,
        },
      });

      output.status = "ok";
      output.analysis = summarizeLintelAnalysis(analysisResult);

      if (provider.providerKind === "steel" && provider.section && provider.material) {
        const verification = new SteelMemberVerification({
          stability: {
            lateralTorsionalBuckling: { enabled: false },
            compressionBuckling: { enabled: false },
            beamColumnInteraction: { enabled: false },
          },
        }).verify({
          memberId: output.id,
          section: provider.section,
          material: provider.material,
          analysisResult,
        });

        output.verification = resultToJson(verification);

        if (verification.status !== "ok") {
          output.status = verification.status;
        }
      }
    } catch (error) {
      output.status = "not-analyzed";
      warnings.push(
        `Lintel on opening ${opening.id} could not be analyzed: ${error.message}`,
      );
    }

    lintels.push(output);
  }

  return lintels;
}

function equilibriumCheck({
  appliedTopLineLoad,
  openingBandLoad,
  pierSelfWeight,
  baseReaction,
  tolerance = DEFAULT_EQUILIBRIUM_TOLERANCE,
}) {
  const demand = appliedTopLineLoad + openingBandLoad + pierSelfWeight;
  const difference = baseReaction - demand;
  const reference = Math.max(Math.abs(demand), 1);
  const ratio = Math.abs(difference) / reference;

  return {
    demand,
    baseReaction,
    difference,
    ratio,
    ok: ratio <= tolerance,
    tolerance,
  };
}

export class AlignmentStaticAnalysis {
  analyze({
    alignment,
    stage = "design",
    options = {},
    sanitizedOpenings = null,
    extractedMembers = null,
    resolvedAlignmentState = null,
  } = {}) {
    if (!alignment) {
      throw new Error("AlignmentStaticAnalysis requires an alignment model.");
    }

    const warnings = [];
    const assumptions = [
      "Pier tributary top loads follow the requested width rule: gross pier width plus half of each adjacent opening only when that opening is not intercepted by a ring frame.",
      "The masonry band above each opening is transferred to adjacent masonry piers when no ring frame is present, and to ring-frame jambs when the opening is framed in steel.",
      "Lintel beam analysis is optional and does not alter the global equilibrium roll-up; only the transferred masonry-band load is added to pier axial forces in the current release.",
    ];
    const mechanicalState =
      resolvedAlignmentState ??
      resolveAlignmentMechanicalState({
        alignment,
        stage,
        options: options.materialResolution ?? options,
      });
    const resolvedAlignment = mechanicalState.alignment;
    const resolvedSanitizedOpenings =
      sanitizedOpenings ?? sanitizeAlignmentOpenings({ alignment: resolvedAlignment }).openings;
    const extracted = extractEquivalentFrameMembers({
      alignment: resolvedAlignment,
      sanitizedOpenings: resolvedSanitizedOpenings,
    });
    const combinationType =
      options.combinationType ?? DEFAULT_COMBINATION_TYPE;
    const wallLineLoads = Object.fromEntries(
      resolvedAlignment.walls.map((wall) => [
        wall.id,
        resolveCombinedLineLoad({
          payload: wall.verticalLineLoad,
          wallId: wall.id,
          combinationType,
          warnings,
        }),
      ]),
    );
    const openingTransferredLoads = {};
    const additionalPierLoads = Object.fromEntries(
      extracted.piers.map((pier) => [pier.id, 0]),
    );
    const ringFrames = [];

    for (const opening of resolvedSanitizedOpenings) {
      const loadTransfer = computeOpeningTransferredLoads({
        opening,
        alignment: resolvedAlignment,
        wallLineLoads,
        warnings,
      });
      const leftPier = extracted.piers.find(
        (pier) => Math.abs(pier.x + pier.length - opening.x) <= EPS,
      );
      const rightPier = extracted.piers.find(
        (pier) => Math.abs(pier.x - (opening.x + opening.width)) <= EPS,
      );

      openingTransferredLoads[opening.id] = {
        ...loadTransfer,
        leftPierId: leftPier?.id ?? null,
        rightPierId: rightPier?.id ?? null,
      };

      if (opening.ringFrame) {
        ringFrames.push({
          id: `${alignment.id}-ring-frame-${opening.id}`,
          openingId: opening.id,
          topLoad: loadTransfer.topLoad,
          openingBandLoad: loadTransfer.openingBandLoad,
          totalInterceptedLoad: loadTransfer.topLoad + loadTransfer.openingBandLoad,
          leftReaction:
            (loadTransfer.topLoad + loadTransfer.openingBandLoad) / 2,
          rightReaction:
            (loadTransfer.topLoad + loadTransfer.openingBandLoad) / 2,
          leftPierId: leftPier?.id ?? null,
          rightPierId: rightPier?.id ?? null,
        });
        continue;
      }

      const transferredLoad = loadTransfer.openingBandLoad;

      if (transferredLoad <= EPS) {
        continue;
      }

      if (leftPier && rightPier) {
        additionalPierLoads[leftPier.id] += transferredLoad / 2;
        additionalPierLoads[rightPier.id] += transferredLoad / 2;
        continue;
      }

      if (leftPier) {
        additionalPierLoads[leftPier.id] += transferredLoad;
        warnings.push(
          `Opening ${opening.id} transfers its opening-band load to the left pier only because no right adjacent pier was found.`,
        );
        continue;
      }

      if (rightPier) {
        additionalPierLoads[rightPier.id] += transferredLoad;
        warnings.push(
          `Opening ${opening.id} transfers its opening-band load to the right pier only because no left adjacent pier was found.`,
        );
        continue;
      }

      warnings.push(
        `Opening ${opening.id} could not transfer its opening-band load to adjacent piers because no lateral pier was found.`,
      );
    }

    const pierResults = extracted.piers.map((pier) => {
      const tributary = resolveTributaryInterval(pier, resolvedSanitizedOpenings);
      const tributaryLoadByWall = Object.fromEntries(
        resolvedAlignment.walls
          .map((wall) => {
            const width = Math.max(
              0,
              Math.min(wall.xEnd, tributary.xEnd) - Math.max(wall.xStart, tributary.xStart),
            );

            return [
              wall.id,
              width > EPS ? width * (wallLineLoads[wall.id]?.value ?? 0) : 0,
            ];
          })
          .filter(([, value]) => Math.abs(value) > EPS),
      );
      const topDistributedLoad = Object.values(tributaryLoadByWall).reduce(
        (sum, value) => sum + value,
        0,
      );
      const transferredOpeningLoad = additionalPierLoads[pier.id] ?? 0;
      const axialForce = topDistributedLoad + transferredOpeningLoad;
      let verification = null;
      let verificationError = null;
      let baseReaction = axialForce;
      let selfWeight = 0;

      try {
        verification = new MasonryPierVerticalVerification().verify({
          model: new MasonryPierModel({
            id: pier.id,
            units: resolvedAlignment.units,
            geometry: {
              height: pier.height,
              length: pier.effectiveLength > EPS ? pier.effectiveLength : pier.length,
              thickness: pier.thickness,
              baseX: pier.x,
              baseY: 0,
            },
            material: pier.material,
            actions: {
              axialForce,
            },
            design: {
              ...DEFAULT_PIER_DESIGN,
              ...(options.pierDesign ?? {}),
            },
          }),
        });

        selfWeight = verification.outputs?.actions?.selfWeight ?? 0;
        baseReaction += selfWeight;
      } catch (error) {
        verificationError = error.message;
        warnings.push(
          `Pier ${pier.id} could not be verified with the masonry-pier module: ${error.message}`,
        );
      }

      return {
        id: pier.id,
        wallId: pier.wallId,
        sourceWallIds: [...pier.sourceWallIds],
        x: pier.x,
        length: pier.length,
        effectiveLength: pier.effectiveLength,
        tributaryInterval: {
          xStart: tributary.xStart,
          xEnd: tributary.xEnd,
        },
        tributaryLoadByWall,
        topDistributedLoad,
        transferredOpeningLoad,
        axialForce,
        selfWeight,
        baseReaction,
        verification: resultToJson(verification),
        verificationError,
      };
    });

    const lintels = analyzeLintels({
      alignment: resolvedAlignment,
      sanitizedOpenings: resolvedSanitizedOpenings,
      openingTransferredLoads,
      combinationType,
      warnings,
    });
    const appliedTopLineLoad = resolvedAlignment.walls.reduce(
      (sum, wall) => sum + (wallLineLoads[wall.id]?.value ?? 0) * wall.length,
      0,
    );
    const openingBandLoad = Object.values(openingTransferredLoads).reduce(
      (sum, loadTransfer) => sum + loadTransfer.openingBandLoad,
      0,
    );
    const pierSelfWeight = pierResults.reduce(
      (sum, pier) => sum + pier.selfWeight,
      0,
    );
    const baseReaction =
      pierResults.reduce((sum, pier) => sum + pier.baseReaction, 0) +
      ringFrames.reduce(
        (sum, ringFrame) => sum + ringFrame.leftReaction + ringFrame.rightReaction,
        0,
      );
    const equilibrium = equilibriumCheck({
      appliedTopLineLoad,
      openingBandLoad,
      pierSelfWeight,
      baseReaction,
      tolerance:
        options.equilibriumToleranceRelative ?? DEFAULT_EQUILIBRIUM_TOLERANCE,
    });
    const pierStatuses = pierResults
      .map((pier) => pier.verification?.status ?? null)
      .filter(Boolean);
    const lintelStatuses = lintels
      .map((lintel) => lintel.verification?.status ?? lintel.status)
      .filter(Boolean);
    const status =
      equilibrium.ok &&
      pierResults.every((pier) => pier.verification && pier.verification.status === "ok") &&
      lintelStatuses.every((lintelStatus) =>
        ["ok", "not-analyzed"].includes(lintelStatus),
      )
        ? "ok"
        : "not-verified";

    return new CalculationResult({
      applicationId: "masonry-wall-openings",
      status,
      summary:
        "Static vertical analysis of the masonry wall alignment completed with pier tributary loads, optional ring-frame transfers and optional lintel beam checks.",
      outputs: {
        stage,
        combinationType: normalizeCombinationType(combinationType),
        wallLineLoads: Object.fromEntries(
          Object.entries(wallLineLoads).map(([wallId, resolution]) => [
            wallId,
            {
              value: round(resolution.value),
              combinationType: resolution.combinationType,
              leadingVariableId: resolution.leadingVariableId ?? null,
              factors: resolution.factors.map((factor) => ({
                ...factor,
                factor: round(factor.factor),
                contribution: round(factor.contribution),
              })),
            },
          ]),
        ),
        piers: pierResults.map((pier) => ({
          ...pier,
          x: round(pier.x),
          length: round(pier.length),
          effectiveLength: round(pier.effectiveLength),
          tributaryInterval: {
            xStart: round(pier.tributaryInterval.xStart),
            xEnd: round(pier.tributaryInterval.xEnd),
          },
          tributaryLoadByWall: Object.fromEntries(
            Object.entries(pier.tributaryLoadByWall).map(([wallId, value]) => [
              wallId,
              round(value),
            ]),
          ),
          topDistributedLoad: round(pier.topDistributedLoad),
          transferredOpeningLoad: round(pier.transferredOpeningLoad),
          axialForce: round(pier.axialForce),
          selfWeight: round(pier.selfWeight),
          baseReaction: round(pier.baseReaction),
        })),
        ringFrames: ringFrames.map((ringFrame) => ({
          ...ringFrame,
          topLoad: round(ringFrame.topLoad),
          openingBandLoad: round(ringFrame.openingBandLoad),
          totalInterceptedLoad: round(ringFrame.totalInterceptedLoad),
          leftReaction: round(ringFrame.leftReaction),
          rightReaction: round(ringFrame.rightReaction),
        })),
        lintels: lintels.map((lintel) => ({
          ...lintel,
          span: round(lintel.span),
          bearingLength: round(lintel.bearingLength),
          topLoad: round(lintel.topLoad),
          openingBandLoad: round(lintel.openingBandLoad),
          totalAppliedLoad: round(lintel.totalAppliedLoad),
          analysis: lintel.analysis
            ? {
                resultId: lintel.analysis.resultId,
                maxAbsBendingMoment: round(lintel.analysis.maxAbsBendingMoment),
                maxAbsShearForce: round(lintel.analysis.maxAbsShearForce),
                maxAbsVerticalDisplacement: round(
                  lintel.analysis.maxAbsVerticalDisplacement,
                ),
              }
            : null,
        })),
        equilibrium: {
          appliedTopLineLoad: round(appliedTopLineLoad),
          openingBandLoad: round(openingBandLoad),
          pierSelfWeight: round(pierSelfWeight),
          baseReaction: round(baseReaction),
          difference: round(equilibrium.difference),
          ratio: round(equilibrium.ratio),
          tolerance: equilibrium.tolerance,
          ok: equilibrium.ok,
        },
      },
      warnings: uniqueStrings([
        ...warnings,
        ...mechanicalState.warnings,
      ]),
      assumptions: uniqueStrings([
        ...assumptions,
        ...mechanicalState.assumptions,
        ...extracted.assumptions,
      ]),
      metadata: {
        stage,
        combinationType: normalizeCombinationType(combinationType),
        mechanicalState: mechanicalState.metadata,
        pierCount: pierResults.length,
        ringFrameCount: ringFrames.length,
        lintelCount: lintels.length,
      },
    });
  }
}
