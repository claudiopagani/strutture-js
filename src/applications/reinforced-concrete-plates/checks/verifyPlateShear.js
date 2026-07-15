import { ReinforcedConcreteShearVerification } from "../../reinforced-concrete-sections/checks/ReinforcedConcreteShearVerification.js";
import { createPlateStripSection } from "../sections/createPlateStripSection.js";
import { enrichPlateCheck } from "./plateCheckUtils.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });
const METHOD_WITHOUT = "ntc2018-4.1.2.3.5.1-wood-armer-strip";
const METHOD_WITH = "ntc2018-4.1.2.3.5.2-wood-armer-strip-s-links";
const MOMENT_TOLERANCE = 1e-9;

function candidateFaces(woodArmer, direction) {
  const bottom = woodArmer[`bottom-${direction}`];
  const top = woodArmer[`top-${direction}`];
  const bottomActive = Math.abs(bottom) > MOMENT_TOLERANCE;
  const topActive = Math.abs(top) > MOMENT_TOLERANCE;

  if (bottomActive && !topActive) {
    return { faces: ["bottom"], ambiguous: false };
  }

  if (topActive && !bottomActive) {
    return { faces: ["top"], ambiguous: false };
  }

  return { faces: ["bottom", "top"], ambiguous: true };
}

function transverseReinforcementForDirection(model, direction) {
  const reinforcement = model.reinforcement.shear;

  if (!reinforcement) {
    return null;
  }

  const longitudinalSpacing = direction === "x"
    ? reinforcement.spacingX
    : reinforcement.spacingY;
  const transverseSpacing = direction === "x"
    ? reinforcement.spacingY
    : reinforcement.spacingX;

  return {
    type: reinforcement.type,
    diameter: reinforcement.diameter,
    angle: reinforcement.angle,
    legs: model.geometry.unitWidth / transverseSpacing,
    spacing: longitudinalSpacing,
  };
}

function verifyFace({ model, transformedState, direction, face, section }) {
  const layer = model.reinforcement[face][direction];
  const effectiveDepth = face === "bottom"
    ? model.geometry.thickness - layer.axis
    : layer.axis;
  const mEd = transformedState.woodArmer[`${face}-${direction}`] * model.geometry.unitWidth;
  const vEd = Math.abs(transformedState.shear[`q${direction}`]) * model.geometry.unitWidth;
  const transverseReinforcement = transverseReinforcementForDirection(
    model,
    direction,
  );

  return new ReinforcedConcreteShearVerification().verifySectionActions({
    nEd: 0,
    vEd,
    mEd,
    section,
    concreteMaterial: model.materials.concreteMaterial,
    reinforcementMaterial: model.materials.reinforcementMaterial,
    shear: {
      mode: transverseReinforcement
        ? "with-transverse-reinforcement"
        : "without-transverse-reinforcement",
      bw: model.geometry.unitWidth,
      effectiveDepth,
      longitudinalReinforcementArea: layer.area,
      tensionFace: face,
      transverseReinforcement,
    },
    units: INTERNAL_UNITS,
  });
}

export function verifyPlateShear({ model, transformedState } = {}) {
  return ["x", "y"].map((direction) => {
    const strip = createPlateStripSection({ model, direction });
    const selection = candidateFaces(transformedState.woodArmer, direction);
    const candidates = selection.faces.map((face) => ({
      face,
      result: verifyFace({
        model,
        transformedState,
        direction,
        face,
        section: strip.section,
      }),
    }));
    const available = candidates.filter(({ result }) => Number.isFinite(result.capacity));
    const governing = available.reduce((selected, candidate) =>
      selected == null || candidate.result.capacity < selected.result.capacity
        ? candidate
        : selected, null);
    const vEd = Math.abs(transformedState.shear[`q${direction}`]) * model.geometry.unitWidth;
    const capacity = governing?.result.capacity ?? null;
    const utilizationRatio = Number.isFinite(capacity) && capacity > 0
      ? vEd / capacity
      : null;
    const sourceCheck = governing?.result.checks?.[0] ?? {};
    const reinforced = model.reinforcement.shear != null;
    const method = reinforced ? METHOD_WITH : METHOD_WITHOUT;
    const check = enrichPlateCheck({
      ...sourceCheck,
      id: reinforced
        ? "rc-shear-resistance"
        : "rc-shear-without-transverse-reinforcement",
      description: `Shear resistance of the ${direction.toUpperCase()} Wood-Armer equivalent strip`,
      demand: vEd,
      capacity,
      utilizationRatio,
      ok: Number.isFinite(utilizationRatio) && utilizationRatio <= 1,
      metadata: {
        evaluatedFaces: selection.faces,
        ambiguousTensionFace: selection.ambiguous,
      },
    }, {
      id: `rc-plate-uls-shear-${transformedState.id}-${direction}`,
      direction,
      face: governing?.face ?? selection.faces.join("/"),
      analysisType: model.analysis.type,
      combinationType: transformedState.combinationType,
      stateId: transformedState.id,
      method,
    });
    const ambiguityWarning = selection.ambiguous
      ? `Plate shear direction ${direction.toUpperCase()}: the tensile face is null or ambiguous; both reinforcement faces were evaluated and the lower resistance governs.`
      : null;

    return {
      stateId: transformedState.id,
      direction,
      face: check.face,
      analysisType: model.analysis.type,
      combinationType: transformedState.combinationType,
      method,
      vEd,
      capacity,
      utilizationRatio,
      status: check.ok ? "ok" : "not-verified",
      evaluatedFaces: selection.faces,
      governingFace: governing?.face ?? null,
      shearReinforcement: reinforced
        ? {
            ...model.reinforcement.shear,
            longitudinalSpacing: direction === "x"
              ? model.reinforcement.shear.spacingX
              : model.reinforcement.shear.spacingY,
            transverseSpacing: direction === "x"
              ? model.reinforcement.shear.spacingY
              : model.reinforcement.shear.spacingX,
            effectiveLinksAcrossUnitWidth:
              model.geometry.unitWidth /
              (direction === "x"
                ? model.reinforcement.shear.spacingY
                : model.reinforcement.shear.spacingX),
          }
        : null,
      vRdWithTransverseReinforcement:
        governing?.result.outputs?.vRdWithTransverseReinforcement ?? null,
      vRdWithoutTransverseReinforcement:
        governing?.result.outputs?.vRdWithoutTransverseReinforcement ?? capacity,
      vRsd: governing?.result.outputs?.vRsd ?? null,
      vRcd: governing?.result.outputs?.vRcd ?? null,
      selectedMechanism:
        governing?.result.outputs?.selectedMechanism ??
        "without-transverse-reinforcement",
      candidates: candidates.map(({ face, result }) => ({
        face,
        capacity: result.capacity,
        utilizationRatio: result.utilizationRatio,
        status: result.status,
        outputs: result.outputs,
      })),
      check,
      warnings: [
        ambiguityWarning,
        ...candidates.flatMap(({ result }) => result.warnings ?? []),
      ].filter(Boolean),
      assumptions: [
        ...candidates.flatMap(({ result }) => result.assumptions ?? []),
        ...(reinforced
          ? [
              "Each vertical S-link is modeled as one effective shear leg, properly anchored around the top and bottom longitudinal reinforcement.",
              "The regular S-link grid is converted to Asw/s on the 1000 mm strip and is checked independently in X and Y without a vector interaction law.",
            ]
          : []),
      ],
    };
  });
}
