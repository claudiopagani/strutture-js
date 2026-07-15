import { slendernessCheck } from "../../rc-cracked-deflection/analysis/DeflectionChecks.js";
import { enrichPlateCheck } from "./plateCheckUtils.js";

const METHOD = "circolare-ntc2018-c4.1.i-flat-slab-face-rho-l-interpolation";

function reinforcementRatio(model, direction, face) {
  const layer = model.reinforcement[face][direction];
  const effectiveDepth = face === "bottom"
    ? model.geometry.thickness - layer.axis
    : layer.axis;

  return {
    area: layer.area,
    effectiveDepth,
    value: layer.area / (model.geometry.unitWidth * effectiveDepth),
  };
}

function faceSlendernessCheck({ model, transformedState, direction, face }) {
  const span = model.analysis.deflection[`span${direction.toUpperCase()}`];
  const ratio = reinforcementRatio(model, direction, face);
  const woodArmerMoment = transformedState.woodArmer.moments.find((moment) =>
    moment.direction === direction && moment.face === face);
  const base = slendernessCheck({
    span,
    section: { height: model.geometry.thickness },
    serviceability: {
      deflection: {
        slendernessSystem: "flat_slab",
        reinforcementRatio: ratio.value,
      },
    },
  });
  const check = enrichPlateCheck({
    ...base,
    description: "Controllo semplificato di deformabilità mediante snellezza",
  }, {
    id: `rc-plate-sle-slenderness-${transformedState.id}-${face}-${direction}`,
    direction,
    face,
    analysisType: model.analysis.type,
    combinationType: transformedState.combinationType,
    stateId: transformedState.id,
    method: METHOD,
  });

  return {
    direction,
    face,
    stateId: transformedState.id,
    combinationType: transformedState.combinationType,
    woodArmerMoment: woodArmerMoment?.value ?? 0,
    stripMoment: (woodArmerMoment?.value ?? 0) * model.geometry.unitWidth,
    reinforcementArea: ratio.area,
    effectiveDepth: ratio.effectiveDepth,
    reinforcementRatio: ratio.value,
    reinforcementRatioPercent: 100 * ratio.value,
    stressLevel: check.metadata.stressLevel,
    demand: check.demand,
    capacity: check.capacity,
    utilizationRatio: check.utilizationRatio,
    status: check.ok ? "ok" : "not-verified",
    check,
  };
}

function selectGoverningFace(faceChecks) {
  return faceChecks.reduce((selected, candidate) => {
    if (candidate.capacity < selected.capacity) {
      return candidate;
    }

    if (
      candidate.capacity === selected.capacity &&
      Math.abs(candidate.woodArmerMoment) > Math.abs(selected.woodArmerMoment)
    ) {
      return candidate;
    }

    return selected;
  });
}

export function verifyPlateSlenderness({ model, transformedState } = {}) {
  return ["x", "y"].map((direction) => {
    const faceChecks = ["bottom", "top"].map((face) =>
      faceSlendernessCheck({ model, transformedState, direction, face }));
    const governing = selectGoverningFace(faceChecks);

    return {
      direction,
      face: governing.face,
      governingFace: governing.face,
      stateId: transformedState.id,
      analysisType: model.analysis.type,
      combinationType: transformedState.combinationType,
      method: METHOD,
      name: "Controllo semplificato di deformabilità mediante snellezza",
      span: model.analysis.deflection[`span${direction.toUpperCase()}`],
      referenceHeight: model.geometry.thickness,
      structuralSystem: "flat_slab",
      stressLevel: governing.stressLevel,
      reinforcementRatio: governing.reinforcementRatio,
      reinforcementRatioPercent: governing.reinforcementRatioPercent,
      demand: governing.demand,
      capacity: governing.capacity,
      utilizationRatio: governing.utilizationRatio,
      status: governing.status,
      faceChecks,
    };
  });
}
