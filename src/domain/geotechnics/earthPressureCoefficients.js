function assertFrictionAngle(frictionAngle) {
  if (
    !Number.isFinite(frictionAngle) ||
    frictionAngle < 0 ||
    frictionAngle >= Math.PI / 2
  ) {
    throw new Error("frictionAngle must satisfy 0 <= phi < pi/2 radians.");
  }
  return frictionAngle;
}

function assertInterfaceAngle(interfaceFrictionAngle, frictionAngle) {
  if (!Number.isFinite(interfaceFrictionAngle)) {
    throw new Error("interfaceFrictionAngle must be finite.");
  }
  if (interfaceFrictionAngle < 0 || interfaceFrictionAngle > frictionAngle) {
    throw new Error(
      "interfaceFrictionAngle must satisfy 0 <= delta <= frictionAngle.",
    );
  }
  return interfaceFrictionAngle;
}

function assertWallAngle(wallInclinationFromVertical) {
  const inclination = Number(wallInclinationFromVertical ?? 0);
  if (!Number.isFinite(inclination) || Math.abs(inclination) >= Math.PI / 2) {
    throw new Error(
      "wallInclinationFromVertical must satisfy -pi/2 < inclination < pi/2.",
    );
  }

  return inclination;
}

function assertBackfillAngle(backfillInclination) {
  const inclination = Number(backfillInclination ?? 0);
  if (!Number.isFinite(inclination) || Math.abs(inclination) >= Math.PI / 2) {
    throw new Error(
      "backfillInclination must satisfy -pi/2 < inclination < pi/2.",
    );
  }

  return inclination;
}

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive for the selected geometry.`);
  }

  return value;
}

export function rankineEarthPressureCoefficients({ frictionAngle } = {}) {
  const phi = assertFrictionAngle(frictionAngle);
  const sine = Math.sin(phi);
  const active = (1 - sine) / (1 + sine);

  return {
    active,
    passive: 1 / active,
    basis: "horizontal-effective-stress",
    method: "rankine-smooth-vertical-wall-horizontal-ground",
    reference:
      "USACE EM 1110-2-2502 (1989), chapter 3, Rankine limiting earth pressure",
  };
}

export function jakyAtRestCoefficient({ frictionAngle } = {}) {
  const phi = assertFrictionAngle(frictionAngle);
  return {
    coefficient: 1 - Math.sin(phi),
    basis: "horizontal-effective-stress",
    method: "jaky-normally-consolidated",
    reference:
      "Jaky (1944), at-rest correlation for normally consolidated soil",
  };
}

export function coulombActiveEarthPressureCoefficient({
  frictionAngle,
  interfaceFrictionAngle = 0,
  wallInclinationFromVertical = 0,
  backfillInclination = 0,
} = {}) {
  const phi = assertFrictionAngle(frictionAngle);
  const delta = assertInterfaceAngle(interfaceFrictionAngle, phi);
  const wallInclination = assertWallAngle(wallInclinationFromVertical);
  const beta = assertBackfillAngle(backfillInclination);
  // The closed-form Coulomb angle is measured on the retained-soil side.
  // With this API's convention, positive inclination moves the wall top
  // toward the retained ground and therefore theta = pi/2 + inclination.
  const theta = Math.PI / 2 + wallInclination;
  const wallTerm = positive(Math.sin(theta - delta), "sin(theta - delta)");
  const surfaceTerm = positive(Math.sin(theta + beta), "sin(theta + beta)");
  const slopeStrength = Math.sin(phi - beta);

  if (slopeStrength < -1e-14) {
    throw new Error(
      "Coulomb active pressure requires backfillInclination <= frictionAngle.",
    );
  }

  const radical = Math.sin(phi + delta) * Math.max(0, slopeStrength) /
    (wallTerm * surfaceTerm);

  if (radical < -1e-14) {
    throw new Error("Coulomb active coefficient has a negative radical.");
  }

  const coefficient = Math.sin(theta + phi) ** 2 /
    (
      Math.sin(theta) ** 2 * wallTerm *
      (1 + Math.sqrt(Math.max(0, radical))) ** 2
    );

  return {
    coefficient,
    normalCoefficient: coefficient * Math.cos(delta),
    tangentCoefficient: coefficient * Math.sin(delta),
    directionAngle: delta,
    basis: "resultant-traction-on-wall",
    wallInclinationFromVertical: wallInclination,
    wallInclinationPositiveDirection: "wall-top-toward-retained-ground",
    backfillInclination: beta,
    backfillInclinationPositiveDirection: "rises-away-from-wall",
    method: "coulomb-active-planar-wall-planar-ground",
    reference:
      "USACE EM 1110-2-2502 (1989), chapter 3, Coulomb planar-wedge theory",
  };
}

export function coulombPassiveEarthPressureCoefficient({
  frictionAngle,
  interfaceFrictionAngle = 0,
  wallInclinationFromVertical = 0,
  backfillInclination = 0,
} = {}) {
  const phi = assertFrictionAngle(frictionAngle);
  const delta = assertInterfaceAngle(interfaceFrictionAngle, phi);
  if (delta > phi / 3 + 1e-14) {
    throw new Error(
      "Coulomb passive wall friction is restricted to delta <= phi/3 because larger values are unconservative against curved failure surfaces.",
    );
  }

  const wallInclination = assertWallAngle(wallInclinationFromVertical);
  const beta = assertBackfillAngle(backfillInclination);
  const theta = Math.PI / 2 + wallInclination;
  const wallTerm = positive(Math.sin(theta + delta), "sin(theta + delta)");
  const surfaceTerm = positive(Math.sin(theta + beta), "sin(theta + beta)");
  const numerator = Math.sin(phi + delta) * Math.sin(phi + beta);
  const radical = numerator / (wallTerm * surfaceTerm);

  if (radical < -1e-14 || radical >= 1 - 1e-14) {
    throw new Error(
      "Coulomb passive coefficient has no finite real solution for the selected geometry.",
    );
  }

  const coefficient = Math.sin(theta - phi) ** 2 /
    (
      Math.sin(theta) ** 2 * wallTerm *
      (1 - Math.sqrt(Math.max(0, radical))) ** 2
    );

  return {
    coefficient,
    normalCoefficient: coefficient * Math.cos(delta),
    tangentCoefficient: -coefficient * Math.sin(delta),
    directionAngle: -delta,
    basis: "resultant-traction-on-wall",
    wallInclinationFromVertical: wallInclination,
    wallInclinationPositiveDirection: "wall-top-toward-retained-ground",
    backfillInclination: beta,
    backfillInclinationPositiveDirection: "rises-away-from-wall",
    method: "coulomb-passive-planar-wall-planar-ground",
    reference:
      "USACE EM 1110-2-2502 (1989), sections 3-12c and 3-13d",
    warnings: delta > 1e-14
      ? [
          "Plane-wedge Coulomb passive pressure can be unconservative when wall friction is present; delta is limited to phi/3.",
        ]
      : [],
  };
}

export function mononobeOkabeActiveEarthPressureCoefficient({
  frictionAngle,
  interfaceFrictionAngle = 0,
  horizontalSeismicCoefficient,
  verticalSeismicCoefficient = 0,
} = {}) {
  const phi = assertFrictionAngle(frictionAngle);
  const delta = assertInterfaceAngle(interfaceFrictionAngle, phi);
  const kh = Number(horizontalSeismicCoefficient);
  const kv = Number(verticalSeismicCoefficient);

  if (!Number.isFinite(kh) || kh < 0) {
    throw new Error("horizontalSeismicCoefficient must be non-negative.");
  }
  if (!Number.isFinite(kv) || kv <= -1 || kv >= 1) {
    throw new Error("verticalSeismicCoefficient must satisfy -1 < kv < 1.");
  }

  const theta = Math.atan(kh / (1 - kv));
  if (phi <= theta) {
    throw new Error(
      "Mononobe-Okabe active solution requires frictionAngle > seismic inertia angle.",
    );
  }

  const cosDeltaTheta = Math.cos(delta + theta);
  const radicalDenominator = cosDeltaTheta;
  const radicalNumerator = Math.sin(phi + delta) * Math.sin(phi - theta);
  if (radicalDenominator <= 0 || radicalNumerator < -1e-14) {
    throw new Error("Mononobe-Okabe active coefficient has no real solution.");
  }

  const radical = Math.max(0, radicalNumerator / radicalDenominator);
  const denominator = Math.cos(theta) * cosDeltaTheta *
    (1 + Math.sqrt(radical)) ** 2;
  if (denominator <= 0) {
    throw new Error("Mononobe-Okabe active coefficient has an invalid denominator.");
  }

  const coefficient = Math.cos(phi - theta) ** 2 / denominator;

  return {
    coefficient,
    gravityMultiplier: 1 - kv,
    equivalentCoefficient: coefficient * (1 - kv),
    normalCoefficient: coefficient * Math.cos(delta),
    tangentCoefficient: coefficient * Math.sin(delta),
    equivalentNormalCoefficient: coefficient * (1 - kv) * Math.cos(delta),
    equivalentTangentCoefficient: coefficient * (1 - kv) * Math.sin(delta),
    directionAngle: delta,
    inertiaAngle: theta,
    basis: "resultant-traction-on-wall",
    verticalSeismicConvention:
      "positive-kv-reduces-effective-gravity-through-factor-1-minus-kv",
    method: "mononobe-okabe-active-vertical-wall-horizontal-ground",
    reference:
      "USACE EM 1110-2-2100 (2005), appendix G, equations G-1 and G-2",
  };
}
