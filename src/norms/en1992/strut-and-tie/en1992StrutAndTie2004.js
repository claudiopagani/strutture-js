const STRUT_STRENGTH_MODELS = new Set([
  "uncracked-uniaxial",
  "transverse-tension",
]);
const NODE_TYPES = new Set(["ccc", "cct", "ctt"]);

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }

  return value;
}

export function calculateEn1992StrutAndTieNuPrime(fck) {
  positive(fck, "fck");

  return Math.max(0, 1 - fck / 250);
}

export function calculateEn1992StrutDesignStrength({
  fck,
  fcd,
  strengthModel,
}) {
  if (!STRUT_STRENGTH_MODELS.has(strengthModel)) {
    throw new Error(`Unsupported EN 1992 strut strength model: ${strengthModel}.`);
  }

  positive(fcd, "fcd");
  const nuPrime = calculateEn1992StrutAndTieNuPrime(fck);
  const coefficient = strengthModel === "uncracked-uniaxial"
    ? 1
    : 0.6 * nuPrime;

  return {
    designStrength: coefficient * fcd,
    coefficient,
    nuPrime,
    equation: strengthModel === "uncracked-uniaxial"
      ? "EN1992-1-1-2004-6.55"
      : "EN1992-1-1-2004-6.56",
  };
}

export function calculateEn1992TieResistance({ reinforcementArea, fyd }) {
  positive(reinforcementArea, "reinforcementArea");
  positive(fyd, "fyd");

  return {
    capacity: reinforcementArea * fyd,
    reinforcementArea,
    fyd,
    equation: "EN1992-1-1-2004-6.5.3",
  };
}

export function calculateEn1992NodalDesignStrength({
  fck,
  fcd,
  nodeType,
  factors = {},
}) {
  if (!NODE_TYPES.has(nodeType)) {
    throw new Error(`Unsupported EN 1992 nodal-zone type: ${nodeType}.`);
  }

  positive(fcd, "fcd");
  const recommended = { ccc: 1, cct: 0.85, ctt: 0.75 };
  const parameterName = { ccc: "k1", cct: "k2", ctt: "k3" }[nodeType];
  const factor = factors[parameterName] == null
    ? recommended[nodeType]
    : positive(factors[parameterName], parameterName);
  const nuPrime = calculateEn1992StrutAndTieNuPrime(fck);

  return {
    designStrength: factor * nuPrime * fcd,
    factor,
    factorName: parameterName,
    factorSource: factors[parameterName] == null
      ? "EN1992-recommended"
      : "explicit-national-parameter",
    nuPrime,
    equation: {
      ccc: "EN1992-1-1-2004-6.60",
      cct: "EN1992-1-1-2004-6.61",
      ctt: "EN1992-1-1-2004-6.62",
    }[nodeType],
  };
}

export const EN1992_STRUT_STRENGTH_MODELS = Object.freeze([
  ...STRUT_STRENGTH_MODELS,
]);
export const EN1992_STRUT_AND_TIE_NODE_TYPES = Object.freeze([...NODE_TYPES]);
