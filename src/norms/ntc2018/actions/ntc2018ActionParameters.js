export const NTC2018_ACTION_COMBINATION_FACTORS = {
  A: { psi0: 0.7, psi1: 0.5, psi2: 0.3, description: "residenziale" },
  B: { psi0: 0.7, psi1: 0.5, psi2: 0.3, description: "uffici" },
  C: { psi0: 0.7, psi1: 0.7, psi2: 0.6, description: "affollamento" },
  D: { psi0: 0.7, psi1: 0.7, psi2: 0.6, description: "commerciale" },
  E: { psi0: 1.0, psi1: 0.9, psi2: 0.8, description: "magazzini e industriale" },
  F: { psi0: 0.7, psi1: 0.7, psi2: 0.6, description: "rimesse e traffico leggero" },
  G: { psi0: 0.7, psi1: 0.5, psi2: 0.3, description: "traffico medio" },
  H: { psi0: 0.0, psi1: 0.0, psi2: 0.0, description: "coperture per manutenzione" },
  WIND: { psi0: 0.6, psi1: 0.2, psi2: 0.0, description: "vento" },
  SNOW_LOW: { psi0: 0.5, psi1: 0.2, psi2: 0.0, description: "neve <= 1000 m s.l.m." },
  SNOW_HIGH: { psi0: 0.7, psi1: 0.5, psi2: 0.2, description: "neve > 1000 m s.l.m." },
  THERMAL: { psi0: 0.6, psi1: 0.5, psi2: 0.0, description: "variazioni termiche" },
  ACCIDENTAL: { psi0: 0.0, psi1: 0.0, psi2: 0.0, description: "azione eccezionale" },
  SEISMIC: { psi0: 0.0, psi1: 0.0, psi2: 0.0, description: "azione sismica" },
};

export const NTC2018_ACTION_PARTIAL_FACTORS = {
  permanent: {
    G1: {
      A1: { favourable: 1.0, unfavourable: 1.3 },
      A2: { favourable: 1.0, unfavourable: 1.0 },
    },
    G2: {
      A1: { favourable: 0.0, unfavourable: 1.5 },
      A2: { favourable: 0.0, unfavourable: 1.3 },
    },
  },
  variable: {
    imposed: {
      A1: { favourable: 0.0, unfavourable: 1.5 },
      A2: { favourable: 0.0, unfavourable: 1.5 },
    },
    traffic: {
      A1: { favourable: 0.0, unfavourable: 1.35 },
      A2: { favourable: 0.0, unfavourable: 1.35 },
    },
    wind: {
      A1: { favourable: 0.0, unfavourable: 1.5 },
      A2: { favourable: 0.0, unfavourable: 1.5 },
    },
    snow: {
      A1: { favourable: 0.0, unfavourable: 1.5 },
      A2: { favourable: 0.0, unfavourable: 1.5 },
    },
    thermal: {
      A1: { favourable: 0.0, unfavourable: 1.5 },
      A2: { favourable: 0.0, unfavourable: 1.5 },
    },
    climatic: {
      A1: { favourable: 0.0, unfavourable: 1.5 },
      A2: { favourable: 0.0, unfavourable: 1.5 },
    },
  },
  accidental: {
    accidental: {
      A1: { favourable: 0.0, unfavourable: 1.0 },
      A2: { favourable: 0.0, unfavourable: 1.0 },
    },
  },
  seismic: {
    seismic: {
      A1: { favourable: 0.0, unfavourable: 1.0 },
      A2: { favourable: 0.0, unfavourable: 1.0 },
    },
  },
};

export const NTC2018_LOAD_DURATION_CLASSES = {
  permanent: { order: 5, description: "permanente" },
  long: { order: 4, description: "lunga durata" },
  medium: { order: 3, description: "media durata" },
  short: { order: 2, description: "breve durata" },
  instantaneous: { order: 1, description: "istantanea" },
};

export const NTC2018_DEFAULT_DURATION_CLASS_BY_ACTION = {
  G1: "permanent",
  G2: "permanent",
  A: "medium",
  B: "medium",
  C: "medium",
  D: "medium",
  E: "long",
  F: "short",
  G: "short",
  H: "short",
  WIND: "instantaneous",
  SNOW_LOW: "short",
  SNOW_HIGH: "short",
  THERMAL: "medium",
  ACCIDENTAL: "instantaneous",
  SEISMIC: "instantaneous",
};

export const NTC2018_TIMBER_KMOD = {
  solid_timber: {
    1: { permanent: 0.6, long: 0.7, medium: 0.8, short: 0.9, instantaneous: 1.1 },
    2: { permanent: 0.6, long: 0.7, medium: 0.8, short: 0.9, instantaneous: 1.1 },
    3: { permanent: 0.5, long: 0.55, medium: 0.65, short: 0.7, instantaneous: 0.9 },
  },
  glulam: {
    1: { permanent: 0.6, long: 0.7, medium: 0.8, short: 0.9, instantaneous: 1.1 },
    2: { permanent: 0.6, long: 0.7, medium: 0.8, short: 0.9, instantaneous: 1.1 },
    3: { permanent: 0.5, long: 0.55, medium: 0.65, short: 0.7, instantaneous: 0.9 },
  },
  lvL: {
    1: { permanent: 0.6, long: 0.7, medium: 0.8, short: 0.9, instantaneous: 1.1 },
    2: { permanent: 0.6, long: 0.7, medium: 0.8, short: 0.9, instantaneous: 1.1 },
    3: { permanent: 0.5, long: 0.55, medium: 0.65, short: 0.7, instantaneous: 0.9 },
  },
  wood_based_panels: {
    1: { permanent: 0.6, long: 0.7, medium: 0.8, short: 0.9, instantaneous: 1.1 },
    2: { permanent: 0.6, long: 0.7, medium: 0.8, short: 0.9, instantaneous: 1.1 },
    3: { permanent: 0.5, long: 0.55, medium: 0.65, short: 0.7, instantaneous: 0.9 },
  },
};
