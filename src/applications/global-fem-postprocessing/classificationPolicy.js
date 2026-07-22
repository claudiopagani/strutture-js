export const GLOBAL_FEM_CLASSIFICATION_PROPOSAL_VERSION = 0;

export const GLOBAL_FEM_POSTPROCESSING_PROFILES = Object.freeze({
  DEMAND_ONLY: "demand-only",
  ASSISTED: "assisted",
  CONFIRMED: "confirmed",
});

export const GLOBAL_FEM_POSTPROCESSING_PROFILE_VALUES = Object.freeze(
  Object.values(GLOBAL_FEM_POSTPROCESSING_PROFILES),
);

export const DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY = Object.freeze({
  line: Object.freeze({
    verticalToleranceDegrees: 10,
    horizontalToleranceDegrees: 10,
    maximumBeamInclinationDegrees: null,
    groupingAngleToleranceDegrees: 1,
  }),
  shell: Object.freeze({
    horizontalPlaneToleranceDegrees: 10,
    verticalPlaneToleranceDegrees: 10,
    groupingNormalToleranceDegrees: 1,
    coplanarityTolerance: null,
  }),
  storeys: Object.freeze({
    elevationTolerance: null,
    relativeElevationTolerance: 1e-8,
  }),
  joints: Object.freeze({
    minimumIncidentLineElements: 2,
  }),
});

function finiteInRange(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be finite and between ${minimum} and ${maximum}.`);
  }
  return number;
}

function optionalPositive(value, label) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be null or a positive finite value.`);
  }
  return number;
}

export function normalizeGlobalFemClassificationPolicy(input = {}) {
  const line = {
    ...DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY.line,
    ...(input.line ?? {}),
  };
  const shell = {
    ...DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY.shell,
    ...(input.shell ?? {}),
  };
  const storeys = {
    ...DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY.storeys,
    ...(input.storeys ?? {}),
  };
  const joints = {
    ...DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY.joints,
    ...(input.joints ?? {}),
  };

  line.verticalToleranceDegrees = finiteInRange(
    line.verticalToleranceDegrees,
    "classificationPolicy.line.verticalToleranceDegrees",
    0,
    45,
  );
  line.horizontalToleranceDegrees = finiteInRange(
    line.horizontalToleranceDegrees,
    "classificationPolicy.line.horizontalToleranceDegrees",
    0,
    45,
  );
  line.groupingAngleToleranceDegrees = finiteInRange(
    line.groupingAngleToleranceDegrees,
    "classificationPolicy.line.groupingAngleToleranceDegrees",
    0,
    45,
  );
  if (line.maximumBeamInclinationDegrees != null) {
    line.maximumBeamInclinationDegrees = finiteInRange(
      line.maximumBeamInclinationDegrees,
      "classificationPolicy.line.maximumBeamInclinationDegrees",
      line.horizontalToleranceDegrees,
      90 - line.verticalToleranceDegrees,
    );
  }

  shell.horizontalPlaneToleranceDegrees = finiteInRange(
    shell.horizontalPlaneToleranceDegrees,
    "classificationPolicy.shell.horizontalPlaneToleranceDegrees",
    0,
    45,
  );
  shell.verticalPlaneToleranceDegrees = finiteInRange(
    shell.verticalPlaneToleranceDegrees,
    "classificationPolicy.shell.verticalPlaneToleranceDegrees",
    0,
    45,
  );
  shell.groupingNormalToleranceDegrees = finiteInRange(
    shell.groupingNormalToleranceDegrees,
    "classificationPolicy.shell.groupingNormalToleranceDegrees",
    0,
    45,
  );
  shell.coplanarityTolerance = optionalPositive(
    shell.coplanarityTolerance,
    "classificationPolicy.shell.coplanarityTolerance",
  );

  storeys.elevationTolerance = optionalPositive(
    storeys.elevationTolerance,
    "classificationPolicy.storeys.elevationTolerance",
  );
  storeys.relativeElevationTolerance = finiteInRange(
    storeys.relativeElevationTolerance,
    "classificationPolicy.storeys.relativeElevationTolerance",
    Number.EPSILON,
    0.01,
  );

  const incidentCount = Number(joints.minimumIncidentLineElements);
  if (!Number.isInteger(incidentCount) || incidentCount < 2) {
    throw new Error(
      "classificationPolicy.joints.minimumIncidentLineElements must be an integer of at least 2.",
    );
  }
  joints.minimumIncidentLineElements = incidentCount;

  return { line, shell, storeys, joints };
}

