import { VerificationResult } from "../../core/results/VerificationResult.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import {
  calculateEn1992Punching2004WithoutShearReinforcement,
  calculateEn1992Punching2023WithoutShearReinforcement,
} from "../../norms/en1992/punching/index.js";
import { PunchingVerificationRequest } from "./PunchingVerificationRequest.js";
import { RC_PUNCHING_DESIGN_CODE_IDS } from "./punchingDesignCodes.js";

export const RC_PUNCHING_PARAMETER_PROFILES = Object.freeze({
  EN_RECOMMENDED: "EN_RECOMMENDED",
});

const APPLICATION_ID = "reinforced-concrete-punching";
const REFERENCE_URLS = Object.freeze({
  firstGenerationWorkedExample:
    "https://www.concretecentre.com/TCC/media/TCCMediaLibrary/Events/Online%20course/CCIP_Worked_Examples_EC2.pdf",
  secondGenerationBackground:
    "https://doi.org/10.33586/hya.2022.3091",
});

function unique(values) {
  return [...new Set(values)];
}

function supportPerimeter(footprint) {
  if (footprint.shape === "rectangle") {
    return 2 * (footprint.sizeX + footprint.sizeY);
  }

  if (footprint.shape === "circle") {
    return Math.PI * footprint.diameter;
  }

  return null;
}

function supportBoundingRadius(footprint) {
  if (footprint.shape === "rectangle") {
    return Math.hypot(footprint.sizeX / 2, footprint.sizeY / 2);
  }

  if (footprint.shape === "circle") {
    return footprint.diameter / 2;
  }

  return Infinity;
}

function pointInRing(point, ring) {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const first = ring[index];
    const second = ring[previous];
    const crosses = (first.y > point.y) !== (second.y > point.y)
      && point.x < (second.x - first.x) * (point.y - first.y)
        / (second.y - first.y) + first.x;

    if (crosses) {
      inside = !inside;
    }
  }

  return inside;
}

function pointSegmentDistance(point, first, second) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const denominator = dx ** 2 + dy ** 2;
  const parameter = denominator === 0
    ? 0
    : Math.min(1, Math.max(0,
      ((point.x - first.x) * dx + (point.y - first.y) * dy) / denominator));

  return Math.hypot(
    point.x - (first.x + parameter * dx),
    point.y - (first.y + parameter * dy),
  );
}

function conservativeBoundaryClearance(connection) {
  const center = connection.support.footprint.center;
  const boundary = connection.slab.boundary;

  if (!pointInRing(center, boundary)) {
    return -Infinity;
  }

  const centerDistance = boundary.reduce((minimum, point, index) => {
    const next = boundary[(index + 1) % boundary.length];
    return Math.min(minimum, pointSegmentDistance(center, point, next));
  }, Infinity);

  return centerDistance - supportBoundingRadius(connection.support.footprint);
}

function resolveConcreteStrength(connection) {
  return connection.materials.concrete?.fck;
}

function resolveStateParameter(parameters, singularKey, mapKey, stateId) {
  return parameters[mapKey]?.[stateId] ?? parameters[singularKey];
}

function recommendedParameters(codeId) {
  if (codeId === RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004) {
    return {
      gammaC: 1.5,
      alphaCc: 1,
      k1: 0.1,
      sigmaCp: 0,
      beta: 1.15,
    };
  }

  return {
    gammaV: 1.4,
    betaE: 1.15,
  };
}

function resolveParameters(request) {
  const profile = request.code.parameterProfile;

  if (profile != null && profile !== RC_PUNCHING_PARAMETER_PROFILES.EN_RECOMMENDED) {
    return {
      error: `Unsupported punching parameter profile: ${profile}.`,
      values: {},
    };
  }

  const values = {
    ...(profile === RC_PUNCHING_PARAMETER_PROFILES.EN_RECOMMENDED
      ? recommendedParameters(request.code.id)
      : {}),
    ...request.code.parameters,
  };

  if (
    profile === RC_PUNCHING_PARAMETER_PROFILES.EN_RECOMMENDED
    && request.code.id === RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004
    && request.code.parameters.cRdc == null
  ) {
    values.cRdc = 0.18 / values.gammaC;
  }

  return {
    error: null,
    values,
  };
}

function notSupported(request, warnings, assumptions = [], outputs = {}) {
  return new VerificationResult({
    applicationId: APPLICATION_ID,
    status: RESULT_STATUS.NOT_SUPPORTED,
    summary: "Punching verification is outside the implemented kernel scope.",
    checks: [],
    outputs,
    warnings: unique(warnings),
    assumptions: unique(assumptions),
    metadata: resultMetadata(request),
  });
}

function resultMetadata(request) {
  return {
    applicationId: APPLICATION_ID,
    requestId: request.id,
    connectionId: request.connection.id,
    code: structuredClone(request.code),
    method: "closed-form-interior-support-without-punching-reinforcement",
    unitSystem: { force: "N", length: "mm", stress: "N/mm2" },
    scope: {
      implemented: [
        "interior column",
        "constant-thickness flat slab",
        "rectangular or circular support",
        "no openings, beams, capitals or punching reinforcement",
        "ULS action states with externally supplied concentration factor",
      ],
      excluded: [
        "edge and corner supports",
        "walls and wall ends",
        "openings affecting a control perimeter",
        "beams, capitals, drops and varying slab thickness",
        "punching reinforcement",
        "automatic beta or beta_e derivation from moments",
        "prestress and membrane compression",
      ],
    },
    references: { ...REFERENCE_URLS },
  };
}

function validateScope(request, parameters) {
  const { connection } = request;
  const warnings = [];

  if (connection.support.position !== "interior") {
    warnings.push("support.position must be explicitly set to interior.");
  }

  if (connection.support.kind !== "column") {
    warnings.push("Only support.kind = column is implemented.");
  }

  if (!["rectangle", "circle"].includes(connection.support.footprint.shape)) {
    warnings.push("Only rectangular and circular support footprints are implemented.");
  }

  if (connection.slab.openings.length > 0) {
    warnings.push("Openings are not implemented in the normative control perimeter.");
  }

  if (!Array.isArray(connection.slab.beams) || connection.slab.beams.length > 0) {
    warnings.push("Beams connected to the slab-support node are not implemented.");
  }

  if (connection.support.capital != null) {
    warnings.push("Column capitals or slab drops are not implemented.");
  }

  if (connection.reinforcement.punching?.present === true) {
    warnings.push("Punching shear reinforcement is not implemented.");
  }

  const flexural = connection.reinforcement.flexuralTension;

  if (flexural == null) {
    warnings.push("reinforcement.flexuralTension with x and y effective data is required.");
  }

  if (!Number.isFinite(resolveConcreteStrength(connection))) {
    warnings.push("materials.concrete.fck is required in the connection unit system.");
  }

  const invalidState = request.actionStates.find((state) =>
    !state.combinationType?.startsWith("ULS"));

  if (invalidState) {
    warnings.push(`Action state ${invalidState.id} is not an ULS combination.`);
  }

  const coefficientNames = request.code.id
    === RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004
    ? ["gammaC", "alphaCc", "cRdc", "k1"]
    : ["gammaV"];

  for (const name of coefficientNames) {
    if (!Number.isFinite(parameters[name]) || parameters[name] <= 0) {
      warnings.push(`A finite positive code parameter ${name} is required.`);
    }
  }

  if (
    request.code.id === RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004
    && parameters.sigmaCp !== 0
  ) {
    warnings.push("The implemented 2004 kernel requires sigmaCp = 0; prestress and membrane compression are excluded.");
  }

  for (const state of request.actionStates) {
    const beta = request.code.id === RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004
      ? resolveStateParameter(parameters, "beta", "betaByState", state.id)
      : resolveStateParameter(parameters, "betaE", "betaEByState", state.id);

    if (!Number.isFinite(beta) || beta <= 0) {
      warnings.push(`A finite positive concentration factor is required for state ${state.id}.`);
    }

    if (state.components.fz === 0) {
      warnings.push(`Action state ${state.id} has zero vertical punching force.`);
    }
  }

  if (
    request.code.id === RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023
    && !Number.isFinite(connection.materials.concreteAggregate?.lowerSize)
  ) {
    warnings.push("materials.concreteAggregate.lowerSize is required by the 2023 method.");
  }

  return warnings;
}

function createCheck({ id, stateId, location, demand, capacity, reference }) {
  const utilizationRatio = demand / capacity;

  return {
    id,
    stateId,
    type: "punching-shear-stress",
    location,
    demand,
    capacity,
    utilizationRatio,
    ok: utilizationRatio <= 1,
    units: "N/mm2",
    reference,
  };
}

function verify2004(request, parameters, geometry) {
  const { connection } = request;
  const flexural = connection.reinforcement.flexuralTension;
  const effectiveDepth = (flexural.x.effectiveDepth + flexural.y.effectiveDepth) / 2;
  const u0 = geometry.supportPerimeter;
  const u1 = u0 + 4 * Math.PI * effectiveDepth;
  const resistance = calculateEn1992Punching2004WithoutShearReinforcement({
    fck: resolveConcreteStrength(connection),
    effectiveDepth,
    reinforcementRatioX: flexural.x.ratio,
    reinforcementRatioY: flexural.y.ratio,
    gammaC: parameters.gammaC,
    alphaCc: parameters.alphaCc,
    cRdc: parameters.cRdc,
    k1: parameters.k1,
    sigmaCp: parameters.sigmaCp,
  });
  const stateResults = request.actionStates.map((state) => {
    const beta = resolveStateParameter(parameters, "beta", "betaByState", state.id);
    const designForce = Math.abs(state.components.fz);
    const faceDemand = beta * designForce / (u0 * effectiveDepth);
    const basicDemand = beta * designForce / (u1 * effectiveDepth);
    const checks = [
      createCheck({
        id: `${state.id}:support-face`,
        stateId: state.id,
        location: "support-face-u0",
        demand: faceDemand,
        capacity: resistance.vRdMax,
        reference: "EN 1992-1-1:2004+A1:2014 6.4.5(3)",
      }),
      createCheck({
        id: `${state.id}:basic-control-perimeter`,
        stateId: state.id,
        location: "u1-at-2d",
        demand: basicDemand,
        capacity: resistance.vRdc,
        reference: "EN 1992-1-1:2004+A1:2014 6.4.4(1), Eq. (6.47)",
      }),
    ];

    return {
      stateId: state.id,
      sourceActions: { ...state.components },
      designForce,
      beta,
      effectiveDepth,
      perimeters: { u0, u1 },
      demands: { supportFace: faceDemand, basicControlPerimeter: basicDemand },
      checks,
    };
  });

  return { resistance, stateResults, requiredOffset: 2 * effectiveDepth };
}

function verify2023(request, parameters, geometry) {
  const { connection } = request;
  const flexural = connection.reinforcement.flexuralTension;
  const shearEffectiveDepth =
    (flexural.x.effectiveDepth + flexural.y.effectiveDepth) / 2;
  const b0 = geometry.supportPerimeter;
  const b05 = b0 + Math.PI * shearEffectiveDepth;
  const resistance = calculateEn1992Punching2023WithoutShearReinforcement({
    fck: resolveConcreteStrength(connection),
    shearEffectiveDepth,
    reinforcementRatioX: flexural.x.ratio,
    reinforcementRatioY: flexural.y.ratio,
    lowerAggregateSize: connection.materials.concreteAggregate.lowerSize,
    supportPerimeter: b0,
    controlPerimeter: b05,
    gammaV: parameters.gammaV,
  });
  const stateResults = request.actionStates.map((state) => {
    const betaE = resolveStateParameter(parameters, "betaE", "betaEByState", state.id);
    const designForce = Math.abs(state.components.fz);
    const demand = betaE * designForce / (b05 * shearEffectiveDepth);
    const checks = [createCheck({
      id: `${state.id}:control-perimeter-b0.5`,
      stateId: state.id,
      location: "b0.5-at-dv-over-2",
      demand,
      capacity: resistance.tauRdc,
      reference: "EN 1992-1-1:2023 8.4.3",
    })];

    return {
      stateId: state.id,
      sourceActions: { ...state.components },
      designForce,
      betaE,
      shearEffectiveDepth,
      perimeters: { b0, b05 },
      demands: { controlPerimeter: demand },
      checks,
    };
  });

  return { resistance, stateResults, requiredOffset: shearEffectiveDepth / 2 };
}

function governingCheck(checks) {
  return checks.reduce((governing, check) =>
    governing == null || check.utilizationRatio > governing.utilizationRatio
      ? check
      : governing, null);
}

export class PunchingVerification {
  verify(input) {
    const request = input instanceof PunchingVerificationRequest
      ? input
      : new PunchingVerificationRequest(input);
    const resolved = resolveParameters(request);

    if (resolved.error) {
      return notSupported(request, [resolved.error]);
    }

    const scopeWarnings = validateScope(request, resolved.values);

    if (scopeWarnings.length > 0) {
      return notSupported(request, scopeWarnings);
    }

    const geometry = {
      supportPerimeter: supportPerimeter(request.connection.support.footprint),
      conservativeBoundaryClearance: conservativeBoundaryClearance(request.connection),
    };
    const calculated = request.code.id
      === RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004
      ? verify2004(request, resolved.values, geometry)
      : verify2023(request, resolved.values, geometry);

    if (geometry.conservativeBoundaryClearance < calculated.requiredOffset) {
      return notSupported(
        request,
        [
          "The declared interior support does not have sufficient conservatively evaluated boundary clearance for the normative control perimeter.",
        ],
        [],
        { geometry, requiredOffset: calculated.requiredOffset },
      );
    }

    const checks = calculated.stateResults.flatMap((state) => state.checks);
    const governing = governingCheck(checks);
    const status = checks.every((check) => check.ok)
      ? RESULT_STATUS.OK
      : RESULT_STATUS.NOT_VERIFIED;
    const momentWarning = request.actionStates.some((state) =>
      state.components.mx !== 0 || state.components.my !== 0)
      ? [
          "Mx and My are retained in sourceActions but are not converted internally into beta or beta_e; the supplied concentration factor must account for eccentricity.",
        ]
      : [];

    return new VerificationResult({
      applicationId: APPLICATION_ID,
      status,
      summary: status === RESULT_STATUS.OK
        ? "Punching resistance is verified within the implemented scope."
        : "Punching resistance is not verified without punching reinforcement.",
      utilizationRatio: governing.utilizationRatio,
      demand: governing.demand,
      capacity: governing.capacity,
      checks,
      outputs: {
        geometry,
        requiredOffset: calculated.requiredOffset,
        resistance: calculated.resistance,
        stateResults: calculated.stateResults,
        governingCheck: governing,
      },
      warnings: momentWarning,
      assumptions: [
        "The mean of the two supplied effective depths is used as d (2004) or dv (2023).",
        "The flexural reinforcement field is uniform over the normative support band represented by the supplied ratios.",
        "The punching force magnitude is the absolute value of signed local Fz; its original sign is preserved in sourceActions.",
        "No prestress or membrane compression contribution is considered.",
      ],
      metadata: resultMetadata(request),
    });
  }
}

export function verifyPunching(input) {
  return new PunchingVerification().verify(input);
}
