const average = (values) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const createRangeValue = (values, level) => {
  if (!Array.isArray(values) || values.length === 0) {
    return undefined;
  }

  return level === 1 ? Math.min(...values) : average(values);
};

const createTypology = ({
  id,
  name,
  notes = null,
  ranges,
  multipliers,
}) => ({
  id,
  name,
  notes,
  ranges,
  multipliers,
});

export const NTC2018_EXISTING_MASONRY_TYPOLOGIES = [
  createTypology({
    id: 1,
    name: "Muratura in pietrame disordinata (ciottoli, pietre erratiche e irregolari)",
    ranges: {
      fm: [1.0, 2.0],
      tau0: [0.018, 0.032],
      E: [690.0, 1050.0],
      G: [230.0, 350.0],
      w: [0.000019],
    },
    multipliers: {
      maltaBuona: 1.5,
      ricorsiOListature: 1.3,
      connessioneTrasversale: 1.5,
      iniezioniMisceleLeganti: 2.0,
      intonacoArmato: 2.5,
      ristilaturaArmata: 1.6,
      coefficienteMassimoComplessivo: 3.5,
    },
  }),
  createTypology({
    id: 2,
    name: "Muratura a conci sbozzati, con paramenti di spessore disomogeneo",
    notes:
      "In presenza sistematica di zeppe profonde in pietra si puo assumere un coefficiente integrativo pari a 1.2 su base valutativa dedicata.",
    ranges: {
      fm: [2.0],
      tau0: [0.035, 0.051],
      E: [1020.0, 1440.0],
      G: [340.0, 480.0],
      w: [0.00002],
    },
    multipliers: {
      maltaBuona: 1.4,
      ricorsiOListature: 1.2,
      connessioneTrasversale: 1.5,
      iniezioniMisceleLeganti: 1.7,
      intonacoArmato: 2.0,
      ristilaturaArmata: 1.5,
      coefficienteMassimoComplessivo: 3.0,
    },
  }),
  createTypology({
    id: 3,
    name: "Muratura in pietre a spacco con buona tessitura",
    ranges: {
      fm: [2.6, 3.8],
      tau0: [0.056, 0.074],
      E: [1500.0, 1980.0],
      G: [500.0, 660.0],
      w: [0.000021],
    },
    multipliers: {
      maltaBuona: 1.3,
      ricorsiOListature: 1.1,
      connessioneTrasversale: 1.3,
      iniezioniMisceleLeganti: 1.5,
      intonacoArmato: 1.5,
      ristilaturaArmata: 1.4,
      coefficienteMassimoComplessivo: 2.4,
    },
  }),
  createTypology({
    id: 4,
    name: "Muratura irregolare di pietra tenera (tufo, calcarenite, ecc.)",
    ranges: {
      fm: [1.4, 2.2],
      tau0: [0.028, 0.042],
      E: [900.0, 1260.0],
      G: [300.0, 420.0],
      w: [0.000013, 0.000016],
    },
    multipliers: {
      maltaBuona: 1.5,
      ricorsiOListature: 1.2,
      connessioneTrasversale: 1.3,
      iniezioniMisceleLeganti: 1.4,
      intonacoArmato: 1.7,
      ristilaturaArmata: 1.1,
      coefficienteMassimoComplessivo: 2.0,
    },
  }),
  createTypology({
    id: 5,
    name: "Muratura a conci regolari di pietra tenera (tufo, calcarenite, ecc.)",
    notes:
      "Con caratterizzazione diretta degli elementi si possono adottare valutazioni dedicate ai sensi del paragrafo 11.10 NTC 2018.",
    ranges: {
      fm: [2.0, 3.2],
      tau0: [0.04, 0.08],
      fv0: [0.10, 0.19],
      E: [1200.0, 1620.0],
      G: [400.0, 500.0],
      w: [0.000013, 0.000016],
    },
    multipliers: {
      maltaBuona: 1.6,
      connessioneTrasversale: 1.2,
      iniezioniMisceleLeganti: 1.2,
      intonacoArmato: 1.5,
      ristilaturaArmata: 1.2,
      coefficienteMassimoComplessivo: 1.8,
    },
  }),
  createTypology({
    id: 6,
    name: "Muratura a blocchi lapidei squadrati",
    ranges: {
      fm: [5.8, 8.2],
      tau0: [0.09, 0.12],
      fv0: [0.18, 0.28],
      E: [2400.0, 3300.0],
      G: [800.0, 1100.0],
      w: [0.000022],
    },
    multipliers: {
      maltaBuona: 1.2,
      connessioneTrasversale: 1.2,
      iniezioniMisceleLeganti: 1.2,
      intonacoArmato: 1.2,
      coefficienteMassimoComplessivo: 1.4,
    },
  }),
  createTypology({
    id: 7,
    name: "Muratura in mattoni pieni e malta di calce",
    notes:
      "Con giunti di spessore superiore a 13 mm e in assenza di valutazioni piu precise si puo assumere un coefficiente riduttivo pari a 0.7 sulle resistenze e 0.8 sui moduli elastici.",
    ranges: {
      fm: [2.6, 4.3],
      tau0: [0.05, 0.13],
      fv0: [0.13, 0.27],
      E: [1200.0, 1800.0],
      G: [400.0, 600.0],
      w: [0.000018],
    },
    multipliers: {
      maltaBuona: 1.0,
      connessioneTrasversale: 1.3,
      iniezioniMisceleLeganti: 1.2,
      intonacoArmato: 1.5,
      ristilaturaArmata: 1.2,
      coefficienteMassimoComplessivo: 1.8,
    },
  }),
  createTypology({
    id: 8,
    name: "Muratura in mattoni semipieni con malta cementizia (es. doppio UNI foratura <40%)",
    ranges: {
      fm: [5.0, 8.0],
      tau0: [0.08, 0.17],
      fv0: [0.20, 0.36],
      E: [3500.0, 5600.0],
      G: [875.0, 1400.0],
      w: [0.000015],
    },
    multipliers: {
      maltaBuona: 1.2,
      intonacoArmato: 1.3,
      coefficienteMassimoComplessivo: 1.3,
    },
  }),
];

export const NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS = [
  {
    id: 1,
    key: "maltaBuona",
    label: "Malta buona",
    phase: "survey",
  },
  {
    id: 2,
    key: "ricorsiOListature",
    label: "Ricorsi o listature",
    phase: "survey",
  },
  {
    id: 3,
    key: "connessioneTrasversale",
    label: "Connessione trasversale",
    phase: "survey",
  },
  {
    id: 4,
    key: "iniezioniMisceleLeganti",
    label: "Iniezioni di miscele leganti",
    phase: "improvement",
  },
  {
    id: 5,
    key: "intonacoArmato",
    label: "Intonaco armato",
    phase: "improvement",
    incompatibleWith: [6, 7, 8],
  },
  {
    id: 6,
    key: "ristilaturaArmata",
    label: "Ristilatura armata",
    phase: "improvement",
    incompatibleWith: [5, 7, 8],
  },
  {
    id: 7,
    key: "diatoniArtificiali",
    label: "Diatoni artificiali",
    phase: "improvement",
    incompatibleWith: [5, 6, 8],
    usesTypologyValueKey: "connessioneTrasversale",
  },
  {
    id: 8,
    key: "tirantiniAntiespulsivi",
    label: "Tirantini antiespulsivi",
    phase: "improvement",
    incompatibleWith: [5, 6, 7],
    usesTypologyValueKey: "connessioneTrasversale",
  },
];

export const NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS = {
  1: {
    id: 1,
    label: "livello 1",
    description: "valori cautelativi pari al minimo dell intervallo tabellato",
  },
  2: {
    id: 2,
    label: "livello 2",
    description: "valori medi dell intervallo tabellato",
  },
};

export function resolveMasonryTypology(input) {
  if (typeof input === "number") {
    return NTC2018_EXISTING_MASONRY_TYPOLOGIES.find((item) => item.id === input);
  }

  if (typeof input !== "string") {
    return null;
  }

  const normalized = input.trim().toLowerCase();

  return NTC2018_EXISTING_MASONRY_TYPOLOGIES.find(
    (item) => item.name.toLowerCase() === normalized,
  );
}

export function getTabulatedMechanicalProperties(typology, parameterLevel) {
  return Object.entries(typology.ranges).reduce((acc, [key, values]) => {
    acc[key] = key === "w" ? average(values) : createRangeValue(values, parameterLevel);
    return acc;
  }, {});
}
