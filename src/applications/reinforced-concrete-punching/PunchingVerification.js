import { VerificationResult } from "../../core/results/VerificationResult.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import {
  calculateEn1992Punching2004WithShearReinforcement,
  calculateEn1992Punching2004WithoutShearReinforcement,
  calculateEn1992Punching2023WithShearReinforcement,
  calculateEn1992Punching2023WithoutShearReinforcement,
  calculateEn1992PunchingBeta2004,
  calculateEn1992PunchingBetaE2023,
  generateEn1992PunchingPerimeterAtOffset,
  generateEn1992PunchingPerimeters,
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
  externalColumnBackground:
    "https://doi.org/10.1016/j.engstruct.2021.113326",
  cornerColumnBackground:
    "https://doi.org/10.1016/j.istruc.2023.03.049",
});

function unique(values) {
  return [...new Set(values)];
}

function resolveConcreteStrength(connection) {
  return connection.materials.concrete?.fck;
}

function resolveStateParameter(parameters, singularKey, mapKey, stateId) {
  return parameters[mapKey]?.[stateId] ?? parameters[singularKey];
}

function recommendedParameters(codeId, position) {
  if (codeId === RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004) {
    return {
      gammaC: 1.5,
      alphaCc: 1,
      k1: 0.1,
      sigmaCp: 0,
      beta: {
        interior: 1.15,
        edge: 1.4,
        corner: 1.5,
      }[position],
    };
  }

  return {
    gammaV: 1.4,
    betaE: position === "interior" ? 1.15 : undefined,
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
      ? recommendedParameters(request.code.id, request.connection.support.position)
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
    method: "closed-form-generated-or-explicit-perimeter-with-optional-vertical-punching-reinforcement",
    unitSystem: { force: "N", length: "mm", stress: "N/mm2" },
    scope: {
      implemented: [
        "interior, edge and corner columns",
        "constant-thickness flat slab",
        "rectangular supports; circular external supports require explicit perimeters",
        "generated normative perimeters or explicit segment-based perimeters",
        "support reaction, enclosed-load reduction or direct perimeter force",
        "no openings, beams or capitals",
        "automatic or explicit concentration factor",
        "vertical studs or links with explicit layout data",
      ],
      excluded: [
        "walls and wall ends",
        "openings affecting a control perimeter",
        "beams, capitals, drops and varying slab thickness",
        "inclined or bent-up punching reinforcement",
        "proprietary reinforcement-system enhancements beyond EN system categories",
        "prestress and membrane compression",
      ],
    },
    references: { ...REFERENCE_URLS },
  };
}

function validateScope(request, parameters) {
  const { connection } = request;
  const warnings = [];

  if (!["interior", "edge", "corner"].includes(connection.support.position)) {
    warnings.push("support.position must be explicitly set to interior, edge or corner.");
  }

  if (connection.support.kind !== "column") {
    warnings.push("Only support.kind = column is implemented.");
  }

  if (!["rectangle", "circle"].includes(connection.support.footprint.shape)) {
    warnings.push("Only rectangular and circular support footprints are implemented.");
  }

  if (
    connection.support.position !== "interior"
    && connection.support.footprint.shape === "circle"
    && request.perimeterDefinition.method === "generated"
  ) {
    warnings.push("Generated circular edge and corner support perimeters are not implemented; use an explicit perimeter or a rectangular support.");
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

    const automatic = parameters.concentrationMethod === "automatic"
      || (parameters.concentrationMethod == null && beta == null);

    if (!automatic && (!Number.isFinite(beta) || beta <= 0)) {
      warnings.push(`A finite positive concentration factor is required for state ${state.id}.`);
    }

    if (
      state.components.fz === 0
      && state.punchingDemand?.supportReaction == null
      && state.punchingDemand?.punchingForce == null
      && Object.keys(state.punchingDemand?.punchingForceByPerimeter ?? {}).length === 0
    ) {
      warnings.push(`Action state ${state.id} has zero vertical punching force.`);
    }
  }

  const punching = connection.reinforcement.punching;

  if (punching?.present === true) {
    const commonFields = [
      [punching.layout.radialSpacing, "layout.radialSpacing"],
      [punching.layout.tangentialSpacing, "layout.tangentialSpacing"],
      [punching.layout.firstPerimeterOffset, "layout.firstPerimeterOffset"],
    ];
    const editionFields = request.code.id
      === RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004
      ? [[punching.layout.areaPerPerimeter, "layout.areaPerPerimeter"]]
      : [
          [punching.layout.legArea, "layout.legArea"],
          [punching.layout.legDiameter, "layout.legDiameter"],
        ];

    for (const [value, label] of [...commonFields, ...editionFields]) {
      if (!Number.isFinite(value) || value <= 0) {
        warnings.push(`reinforcement.punching.${label} is required and must be positive.`);
      }
    }

    const fywd = punching.steel.fywd;
    const canDeriveFywd = Number.isFinite(punching.steel.fywk)
      && Number.isFinite(punching.steel.gammaS);

    if (!Number.isFinite(fywd) && !canDeriveFywd) {
      warnings.push("reinforcement.punching.steel requires fywd or both fywk and gammaS.");
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

function perimeterByRole(perimeters, role) {
  const matches = perimeters.filter((perimeter) => perimeter.role === role);

  if (matches.length !== 1) {
    throw new Error(`Exactly one ${role} punching control perimeter is required.`);
  }

  return matches[0];
}

function resolvePerimeters(request, effectiveDepth) {
  const perimeters = request.perimeterDefinition.method === "explicit"
    ? request.perimeterDefinition.perimeters
    : generateEn1992PunchingPerimeters({
        connection: request.connection,
        codeId: request.code.id,
        edition: request.code.edition,
        effectiveDepth,
      });
  const supportFace = perimeterByRole(perimeters, "support-face");
  const basicControl = perimeterByRole(perimeters, "basic-control");
  const expectedOffset = request.code.edition === "2004"
    ? 2 * effectiveDepth
    : effectiveDepth / 2;
  const tolerance = 1e-6 * Math.max(1, expectedOffset);

  if (Math.abs(supportFace.offset) > tolerance) {
    throw new Error("The support-face perimeter must have zero offset.");
  }

  if (Math.abs(basicControl.offset - expectedOffset) > tolerance) {
    throw new Error(`The basic control perimeter offset must equal ${expectedOffset} mm for the selected code.`);
  }

  return { perimeters, supportFace, basicControl, expectedOffset };
}

function resolvePunchingForce(state, role) {
  const demand = state.punchingDemand;
  const directByRole = demand?.punchingForceByPerimeter?.[role];
  const direct = directByRole ?? demand?.punchingForce;
  const supportReaction = demand?.supportReaction ?? Math.abs(state.components.fz);
  const enclosedLoad = demand?.enclosedLoadByPerimeter?.[role] ?? 0;

  if (direct != null) {
    return {
      value: direct,
      method: directByRole != null ? "direct-perimeter-force" : "direct-punching-force",
      supportReaction,
      enclosedLoad: null,
    };
  }

  if (enclosedLoad > supportReaction) {
    throw new Error(`State ${state.id} enclosed load exceeds the support reaction at ${role}.`);
  }

  return {
    value: supportReaction - enclosedLoad,
    method: enclosedLoad > 0 ? "reaction-minus-enclosed-load" : "support-reaction",
    supportReaction,
    enclosedLoad,
  };
}

function resolveLineOfAction(state) {
  if (state.punchingDemand?.lineOfAction != null) {
    return {
      ...state.punchingDemand.lineOfAction,
      method: "explicit-line-of-action",
    };
  }

  if (state.components.fz === 0) {
    throw new Error(`State ${state.id} requires punchingDemand.lineOfAction because Fz is zero.`);
  }

  return {
    x: state.referencePoint.x - state.components.my / state.components.fz,
    y: state.referencePoint.y + state.components.mx / state.components.fz,
    method: "resultant-from-fz-mx-my",
  };
}

function angleOnArc(angle, start, sweep) {
  const twoPi = 2 * Math.PI;
  const normalize = (value) => ((value % twoPi) + twoPi) % twoPi;
  const relative = normalize(angle - start);

  return sweep >= 0
    ? relative <= sweep + 1e-12
    : normalize(start - angle) <= -sweep + 1e-12;
}

function perimeterBounds(perimeter) {
  const points = [];

  for (const component of perimeter.components) {
    for (const segment of component.segments) {
      if (segment.type === "line") {
        points.push(segment.start, segment.end);
        continue;
      }

      const angles = [
        segment.startAngle,
        segment.startAngle + segment.sweepAngle,
        0,
        Math.PI / 2,
        Math.PI,
        3 * Math.PI / 2,
      ];

      for (const angle of angles) {
        if (angleOnArc(angle, segment.startAngle, segment.sweepAngle)) {
          points.push({
            x: segment.center.x + segment.radius * Math.cos(angle),
            y: segment.center.y + segment.radius * Math.sin(angle),
          });
        }
      }
    }
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
    widthX: Math.max(...xs) - Math.min(...xs),
    widthY: Math.max(...ys) - Math.min(...ys),
  };
}

function resolveConcentration({ request, parameters, state, perimeter, effectiveDepth }) {
  const key = request.code.id === RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004
    ? ["beta", "betaByState"]
    : ["betaE", "betaEByState"];
  const supplied = resolveStateParameter(parameters, key[0], key[1], state.id);
  const automatic = parameters.concentrationMethod === "automatic"
    || (parameters.concentrationMethod == null && supplied == null);

  if (!automatic) {
    return {
      value: supplied,
      details: {
        method: request.code.parameterProfile != null
          && request.code.parameters[key[0]] == null
          ? "simplified-profile"
          : "explicit",
        lineOfAction: null,
      },
    };
  }

  const lineOfAction = resolveLineOfAction(state);

  if (request.code.id === RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004) {
    const details = calculateEn1992PunchingBeta2004({
      position: request.connection.support.position,
      footprint: request.connection.support.footprint,
      effectiveDepth,
      controlPerimeter: perimeter.properties.length,
      lineOfAction,
    });

    return { value: details.beta, details: { ...details, lineOfAction } };
  }

  const bounds = perimeterBounds(perimeter);
  const details = calculateEn1992PunchingBetaE2023({
    position: request.connection.support.position,
    controlPerimeterCentroid: perimeter.properties.lineCentroid,
    controlPerimeterWidths: { x: bounds.widthX, y: bounds.widthY },
    lineOfAction,
  });

  return { value: details.betaE, details: { ...details, lineOfAction } };
}

function resolveFywd(punching) {
  return punching.steel.fywd
    ?? punching.steel.fywk / punching.steel.gammaS;
}

function resolveOuterPerimeter(request, perimeterSet, effectiveDepth, offset) {
  if (request.perimeterDefinition.method === "explicit") {
    const matches = perimeterSet.perimeters.filter((perimeter) =>
      perimeter.role === "outer-control");

    if (matches.length !== 1) {
      throw new Error("Explicit reinforced punching verification requires exactly one outer-control perimeter.");
    }

    const tolerance = 1e-6 * Math.max(1, offset);

    if (Math.abs(matches[0].offset - offset) > tolerance) {
      throw new Error(`The outer-control perimeter offset must equal ${offset} mm for the supplied reinforcement layout.`);
    }

    return matches[0];
  }

  const perimeter = generateEn1992PunchingPerimeterAtOffset({
    connection: request.connection,
    codeId: request.code.id,
    edition: request.code.edition,
    effectiveDepth,
    offset,
    role: "outer-control",
  });
  perimeterSet.perimeters.push(perimeter);

  return perimeter;
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

function createLimitCheck({ id, stateId, location, value, limit, units, reference }) {
  return {
    id,
    stateId,
    type: "punching-reinforcement-detailing",
    location,
    demand: value,
    capacity: limit,
    utilizationRatio: value / limit,
    ok: value <= limit,
    units,
    reference,
  };
}

function createMinimumCheck({ id, stateId, location, value, minimum, units, reference }) {
  return {
    id,
    stateId,
    type: "punching-reinforcement-detailing",
    location,
    demand: minimum,
    capacity: value,
    utilizationRatio: minimum / value,
    ok: value >= minimum,
    units,
    reference,
  };
}

function verify2004(request, parameters) {
  const { connection } = request;
  const flexural = connection.reinforcement.flexuralTension;
  const effectiveDepth = (flexural.x.effectiveDepth + flexural.y.effectiveDepth) / 2;
  const perimeterSet = resolvePerimeters(request, effectiveDepth);
  const u0 = perimeterSet.supportFace.properties.length;
  const u1 = perimeterSet.basicControl.properties.length;
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
  const punching = connection.reinforcement.punching;
  const reinforced = punching.present === true;
  let reinforcementResistance = null;
  let outerControl = null;

  if (reinforced) {
    reinforcementResistance = calculateEn1992Punching2004WithShearReinforcement({
      concreteResistance: resistance.vRdc,
      effectiveDepth,
      controlPerimeter: u1,
      radialSpacing: punching.layout.radialSpacing,
      areaPerPerimeter: punching.layout.areaPerPerimeter,
      fywd: resolveFywd(punching),
    });
    const outermostOffset = punching.layout.firstPerimeterOffset
      + (punching.layout.perimeterCount - 1) * punching.layout.radialSpacing;
    outerControl = resolveOuterPerimeter(
      request,
      perimeterSet,
      effectiveDepth,
      outermostOffset + 1.5 * effectiveDepth,
    );
  }

  const stateResults = request.actionStates.map((state) => {
    const concentration = resolveConcentration({
      request,
      parameters,
      state,
      perimeter: perimeterSet.basicControl,
      effectiveDepth,
    });
    const beta = concentration.value;
    const faceForce = resolvePunchingForce(state, "support-face");
    const basicForce = resolvePunchingForce(state, "basic-control");
    const faceDemand = beta * faceForce.value / (u0 * effectiveDepth);
    const basicDemand = beta * basicForce.value / (u1 * effectiveDepth);
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
        capacity: reinforced ? reinforcementResistance.vRdCs : resistance.vRdc,
        reference: reinforced
          ? "EN 1992-1-1:2004+A1:2014 6.4.5(1), Eq. (6.52)"
          : "EN 1992-1-1:2004+A1:2014 6.4.4(1), Eq. (6.47)",
      }),
    ];

    let outer = null;

    if (reinforced) {
      const outerForce = resolvePunchingForce(state, "outer-control");
      const outerDemand = beta * outerForce.value
        / (outerControl.properties.length * effectiveDepth);
      outer = {
        perimeter: outerControl.properties.length,
        offset: outerControl.offset,
        demand: outerDemand,
        force: outerForce,
      };
      checks.push(
        createCheck({
          id: `${state.id}:outer-control-perimeter`,
          stateId: state.id,
          location: "uout-at-1.5d-from-outermost-reinforcement",
          demand: outerDemand,
          capacity: resistance.vRdc,
          reference: "EN 1992-1-1:2004+A1:2014 6.4.5(4), Eq. (6.54)",
        }),
        createMinimumCheck({
          id: `${state.id}:minimum-reinforcement-perimeters`,
          stateId: state.id,
          location: "punching-reinforcement-layout",
          value: punching.layout.perimeterCount,
          minimum: 2,
          units: "count",
          reference: "EN 1992-1-1:2004+A1:2014 9.4.3",
        }),
        createMinimumCheck({
          id: `${state.id}:first-perimeter-minimum-offset`,
          stateId: state.id,
          location: "first-punching-reinforcement-perimeter",
          value: punching.layout.firstPerimeterOffset,
          minimum: 0.3 * effectiveDepth,
          units: "mm",
          reference: "EN 1992-1-1:2004+A1:2014 9.4.3, Figure 9.10",
        }),
        createLimitCheck({
          id: `${state.id}:first-perimeter-maximum-offset`,
          stateId: state.id,
          location: "first-punching-reinforcement-perimeter",
          value: punching.layout.firstPerimeterOffset,
          limit: 0.5 * effectiveDepth,
          units: "mm",
          reference: "EN 1992-1-1:2004+A1:2014 9.4.3, Figure 9.10",
        }),
        createLimitCheck({
          id: `${state.id}:radial-spacing`,
          stateId: state.id,
          location: "punching-reinforcement-layout",
          value: punching.layout.radialSpacing,
          limit: 0.75 * effectiveDepth,
          units: "mm",
          reference: "EN 1992-1-1:2004+A1:2014 9.4.3, Figure 9.10",
        }),
        createLimitCheck({
          id: `${state.id}:tangential-spacing`,
          stateId: state.id,
          location: "punching-reinforcement-layout-within-2d",
          value: punching.layout.tangentialSpacing,
          limit: 1.5 * effectiveDepth,
          units: "mm",
          reference: "EN 1992-1-1:2004+A1:2014 9.4.3, Figure 9.10",
        }),
      );
    }

    return {
      stateId: state.id,
      sourceActions: { ...state.components },
      punchingDemand: structuredClone(state.punchingDemand),
      designForce: basicForce.value,
      designForces: {
        supportFace: faceForce,
        basicControl: basicForce,
      },
      beta,
      concentration: concentration.details,
      effectiveDepth,
      perimeters: { u0, u1 },
      demands: {
        supportFace: faceDemand,
        basicControlPerimeter: basicDemand,
        ...(outer == null ? {} : { outerControlPerimeter: outer.demand }),
      },
      punchingReinforcement: reinforced
        ? {
            layout: structuredClone(punching.layout),
            system: punching.system,
            fywd: resolveFywd(punching),
            resistance: reinforcementResistance,
            outerControl: outer,
          }
        : null,
      checks,
    };
  });

  return {
    resistance,
    stateResults,
    requiredOffset: 2 * effectiveDepth,
    perimeterSet,
    reinforcementResistance,
  };
}

function verify2023(request, parameters) {
  const { connection } = request;
  const flexural = connection.reinforcement.flexuralTension;
  const shearEffectiveDepth =
    (flexural.x.effectiveDepth + flexural.y.effectiveDepth) / 2;
  const perimeterSet = resolvePerimeters(request, shearEffectiveDepth);
  const b0 = perimeterSet.supportFace.properties.length;
  const b05 = perimeterSet.basicControl.properties.length;
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
  const punching = connection.reinforcement.punching;
  const reinforced = punching.present === true;
  let outerControl = null;
  let outerResistance = null;

  if (reinforced) {
    const outermostOffset = punching.layout.firstPerimeterOffset
      + (punching.layout.perimeterCount - 1) * punching.layout.radialSpacing;
    outerControl = resolveOuterPerimeter(
      request,
      perimeterSet,
      shearEffectiveDepth,
      outermostOffset + 0.5 * shearEffectiveDepth,
    );
    outerResistance = calculateEn1992Punching2023WithoutShearReinforcement({
      fck: resolveConcreteStrength(connection),
      shearEffectiveDepth,
      reinforcementRatioX: flexural.x.ratio,
      reinforcementRatioY: flexural.y.ratio,
      lowerAggregateSize: connection.materials.concreteAggregate.lowerSize,
      supportPerimeter: b0,
      controlPerimeter: outerControl.properties.length,
      gammaV: parameters.gammaV,
    });
  }

  const stateResults = request.actionStates.map((state) => {
    const concentration = resolveConcentration({
      request,
      parameters,
      state,
      perimeter: perimeterSet.basicControl,
      effectiveDepth: shearEffectiveDepth,
    });
    const betaE = concentration.value;
    const basicForce = resolvePunchingForce(state, "basic-control");
    const demand = betaE * basicForce.value / (b05 * shearEffectiveDepth);
    const reinforcementResistance = reinforced
      ? calculateEn1992Punching2023WithShearReinforcement({
          concreteResistance: resistance.tauRdc,
          actingStress: demand,
          shearEffectiveDepth,
          dDg: resistance.dDg,
          kpb: resistance.kpb,
          legArea: punching.layout.legArea,
          radialSpacing: punching.layout.radialSpacing,
          tangentialSpacing: punching.layout.tangentialSpacing,
          legDiameter: punching.layout.legDiameter,
          fywd: resolveFywd(punching),
          system: punching.system,
          supportPerimeter: b0,
        })
      : null;
    const checks = [createCheck({
      id: `${state.id}:control-perimeter-b0.5`,
      stateId: state.id,
      location: "b0.5-at-dv-over-2",
      demand,
      capacity: reinforced ? reinforcementResistance.tauRdCs : resistance.tauRdc,
      reference: reinforced
        ? "EN 1992-1-1:2023 8.4.4, Eq. (8.104)"
        : "EN 1992-1-1:2023 8.4.3",
    })];

    let outer = null;

    if (reinforced) {
      const outerConcentration = resolveConcentration({
        request,
        parameters,
        state,
        perimeter: outerControl,
        effectiveDepth: shearEffectiveDepth,
      });
      const outerForce = resolvePunchingForce(state, "outer-control");
      const outerDemand = outerConcentration.value * outerForce.value
        / (outerControl.properties.length * shearEffectiveDepth);
      outer = {
        perimeter: outerControl.properties.length,
        offset: outerControl.offset,
        demand: outerDemand,
        force: outerForce,
        betaE: outerConcentration.value,
        concentration: outerConcentration.details,
        resistance: outerResistance,
      };
      checks.push(
        createCheck({
          id: `${state.id}:maximum-punching-resistance`,
          stateId: state.id,
          location: "b0.5-maximum-resistance",
          demand,
          capacity: reinforcementResistance.tauRdMax,
          reference: "EN 1992-1-1:2023 8.4.4, Eqs. (8.109)-(8.111)",
        }),
        createCheck({
          id: `${state.id}:outer-control-perimeter`,
          stateId: state.id,
          location: "b0.5-out-at-dv-over-2-from-outermost-reinforcement",
          demand: outerDemand,
          capacity: outerResistance.tauRdc,
          reference: "EN 1992-1-1:2023 8.4.4",
        }),
        createMinimumCheck({
          id: `${state.id}:minimum-slab-thickness`,
          stateId: state.id,
          location: "vertical-punching-reinforcement",
          value: connection.slab.thickness,
          minimum: 200,
          units: "mm",
          reference: "EN 1992-1-1:2023 12.5.1(2)",
        }),
        createMinimumCheck({
          id: `${state.id}:minimum-reinforcement-perimeters`,
          stateId: state.id,
          location: "punching-reinforcement-layout",
          value: punching.layout.perimeterCount,
          minimum: 2,
          units: "count",
          reference: "EN 1992-1-1:2023 12.5.1",
        }),
        createLimitCheck({
          id: `${state.id}:first-perimeter-offset`,
          stateId: state.id,
          location: "first-punching-reinforcement-perimeter",
          value: punching.layout.firstPerimeterOffset,
          limit: 0.5 * shearEffectiveDepth,
          units: "mm",
          reference: "EN 1992-1-1:2023 12.5.1",
        }),
        createLimitCheck({
          id: `${state.id}:radial-spacing`,
          stateId: state.id,
          location: "punching-reinforcement-layout",
          value: punching.layout.radialSpacing,
          limit: 0.75 * shearEffectiveDepth,
          units: "mm",
          reference: "EN 1992-1-1:2023 12.5.1",
        }),
        createLimitCheck({
          id: `${state.id}:tangential-spacing`,
          stateId: state.id,
          location: "punching-reinforcement-layout-within-2dv",
          value: punching.layout.tangentialSpacing,
          limit: 1.5 * shearEffectiveDepth,
          units: "mm",
          reference: "EN 1992-1-1:2023 12.5.1",
        }),
      );
    }

    return {
      stateId: state.id,
      sourceActions: { ...state.components },
      punchingDemand: structuredClone(state.punchingDemand),
      designForce: basicForce.value,
      designForces: { basicControl: basicForce },
      betaE,
      concentration: concentration.details,
      shearEffectiveDepth,
      perimeters: { b0, b05 },
      demands: {
        controlPerimeter: demand,
        ...(outer == null ? {} : { outerControlPerimeter: outer.demand }),
      },
      punchingReinforcement: reinforced
        ? {
            layout: structuredClone(punching.layout),
            system: punching.system,
            fywd: resolveFywd(punching),
            resistance: reinforcementResistance,
            outerControl: outer,
          }
        : null,
      checks,
    };
  });

  return {
    resistance,
    stateResults,
    requiredOffset: shearEffectiveDepth / 2,
    perimeterSet,
    outerResistance,
  };
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

    let calculated;

    try {
      calculated = request.code.id
        === RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004
        ? verify2004(request, resolved.values)
        : verify2023(request, resolved.values);
    } catch (error) {
      return notSupported(request, [
        error instanceof Error ? error.message : String(error),
      ]);
    }

    const checks = calculated.stateResults.flatMap((state) => state.checks);
    const governing = governingCheck(checks);
    const status = checks.every((check) => check.ok)
      ? RESULT_STATUS.OK
      : RESULT_STATUS.NOT_VERIFIED;
    return new VerificationResult({
      applicationId: APPLICATION_ID,
      status,
      summary: status === RESULT_STATUS.OK
        ? "Punching resistance is verified within the implemented scope."
        : "Punching resistance or reinforcement detailing is not verified.",
      utilizationRatio: governing.utilizationRatio,
      demand: governing.demand,
      capacity: governing.capacity,
      checks,
      outputs: {
        geometry: {
          perimeterMethod: request.perimeterDefinition.method,
          perimeters: calculated.perimeterSet.perimeters.map((perimeter) =>
            perimeter.toJSON()),
        },
        requiredOffset: calculated.requiredOffset,
        resistance: calculated.resistance,
        stateResults: calculated.stateResults,
        governingCheck: governing,
      },
      warnings: [],
      assumptions: [
        "The mean of the two supplied effective depths is used as d (2004) or dv (2023).",
        "The flexural reinforcement field is uniform over the normative support band represented by the supplied ratios.",
        "When no explicit punchingDemand is supplied, the punching force magnitude is the absolute value of signed local Fz; its original sign is preserved in sourceActions.",
        "No prestress or membrane compression contribution is considered.",
        ...(request.code.parameterProfile === RC_PUNCHING_PARAMETER_PROFILES.EN_RECOMMENDED
          ? ["The caller has confirmed that the structural and eccentricity conditions for any concentration factor supplied by the EN_RECOMMENDED profile are applicable."]
          : []),
        ...(request.perimeterDefinition.method === "explicit"
          ? ["Explicit perimeter topology and its relationship with slab boundaries are supplied by the caller; segment lengths and continuity are recalculated by the engine."]
          : []),
      ],
      metadata: resultMetadata(request),
    });
  }
}

export function verifyPunching(input) {
  return new PunchingVerification().verify(input);
}
