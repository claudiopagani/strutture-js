import { NTC2018_VARIABLE_ACTION_CATEGORIES } from "./ntc2018LoadParameters.js";
import { VariableLoad } from "../../../domain/slabs/VariableLoad.js";

export const NTC2018_SLAB_MATERIAL_WEIGHT_DATABASE = {
  volumeWeights: [
    {
      category: "Concrete and mortars",
      entries: [
        { description: "Calcestruzzo non armato, gettato in opera", value: 24.0 },
        { description: "Calcestruzzo armato con densita media (ca. 1-2% di armatura)", value: 25.0 },
        { description: "Calcestruzzo leggero con argilla espansa (es. Leca)", value: 18.0 },
        { description: "Calcestruzzo cellulare o gasbeton", value: 6.0 },
        { description: "Massetto a base di cemento per sottofondi", value: 21.0 },
        { description: "Massetto alleggerito con polistirolo o perlite", value: 16.0 },
        { description: "Malta di cemento per allettamento o intonaco", value: 20.0 },
        { description: "Malta di calce aerea o idraulica", value: 18.0 },
      ],
    },
    {
      category: "Masonry",
      entries: [
        { description: "Muratura in mattoni pieni e malta cementizia", value: 18.0 },
        { description: "Muratura in blocchi di laterizio semipieno", value: 14.0 },
        { description: "Muratura in blocchi di laterizio forato (es. forati da 800 kg/m3)", value: 8.0 },
        { description: "Muratura in pietra calcarea o tufacea compatta", value: 24.0 },
        { description: "Muratura in pietra tufacea tenera", value: 16.0 },
        { description: "Muratura in blocchi di calcestruzzo pieni", value: 20.0 },
      ],
    },
    {
      category: "Metals",
      entries: [
        { description: "Acciaio da carpenteria (S235, S275, S355)", value: 78.5 },
        { description: "Leghe di alluminio per costruzioni", value: 27.0 },
        { description: "Ghisa per elementi strutturali o idraulici", value: 72.5 },
      ],
    },
    {
      category: "Timber",
      entries: [
        { description: "Legno di conifera (Abete, Larice, Pino)", value: 5.5 },
        { description: "Legno di latifoglia dura (Castagno, Rovere, Faggio)", value: 7.5 },
        { description: "Legno lamellare di abete", value: 4.8 },
        { description: "Pannelli di legno a strati incrociati (X-Lam o CLT)", value: 5.0 },
      ],
    },
    {
      category: "Insulation",
      entries: [
        { description: "Pannelli in lana di roccia ad alta densita", value: 1.5 },
        { description: "Pannelli in lana di vetro", value: 0.8 },
        { description: "Pannelli in polistirene espanso sinterizzato (EPS)", value: 0.4 },
        { description: "Pannelli in sughero tostato", value: 1.2 },
      ],
    },
    {
      category: "Soils and rocks",
      entries: [
        { description: "Roccia calcarea o granitica in banco", value: 26.0 },
        { description: "Sabbia sciolta e asciutta", value: 16.0 },
        { description: "Sabbia umida o satura d'acqua", value: 20.0 },
        { description: "Ghiaia sciolta e asciutta", value: 17.0 },
        { description: "Terreno argilloso umido e compatto", value: 20.0 },
      ],
    },
    {
      category: "Other materials",
      entries: [
        { description: "Acqua dolce", value: 9.81 },
        { description: "Conglomerato bituminoso per pavimentazioni stradali", value: 23.0 },
        { description: "Vetro in lastre per serramenti o facciate", value: 25.0 },
      ],
    },
  ],
  surfaceWeights: [
    {
      category: "Flooring and finishes",
      entries: [
        { description: "Pavimento in gres porcellanato (sp. 1 cm) con colla/malta", value: 0.25 },
        { description: "Pavimento in lastre di marmo (sp. 2 cm) con malta", value: 0.6 },
        { description: "Pavimento in parquet flottante o incollato", value: 0.15 },
        { description: "Pavimentazione in resina epossidica (sp. 3-4 mm)", value: 0.08 },
      ],
    },
    {
      category: "Ceilings",
      entries: [
        { description: "Controsoffitto in lastre di cartongesso con orditura metallica", value: 0.15 },
        { description: "Controsoffitto a quadretti in fibra minerale", value: 0.05 },
      ],
    },
    {
      category: "Roofing",
      entries: [
        { description: "Manto di copertura in tegole di laterizio (coppi/embrici)", value: 0.65 },
        { description: "Manto di copertura in tegole di cemento", value: 0.5 },
        { description: "Manto di copertura in lamiera grecata di acciaio", value: 0.1 },
        { description: "Doppio strato di guaina bituminosa (ardesiata)", value: 0.1 },
      ],
    },
    {
      category: "Plants and misc",
      entries: [
        { description: "Incidenza impianti elettrici e idraulici a pavimento (uso residenziale/uffici)", value: 0.3 },
        { description: "Incidenza impianti complessi (commerciale/industriale)", value: 0.5 },
        { description: "Incidenza peso pannelli fotovoltaici con struttura di supporto", value: 0.2 },
      ],
    },
  ],
  lineWeights: [
    {
      category: "IPE",
      entries: [
        { description: "IPE 80", value: 0.059 },
        { description: "IPE 100", value: 0.081 },
        { description: "IPE 120", value: 0.102 },
        { description: "IPE 140", value: 0.127 },
        { description: "IPE 160", value: 0.155 },
        { description: "IPE 180", value: 0.184 },
        { description: "IPE 200", value: 0.22 },
        { description: "IPE 220", value: 0.258 },
        { description: "IPE 240", value: 0.298 },
        { description: "IPE 270", value: 0.354 },
        { description: "IPE 300", value: 0.415 },
        { description: "IPE 330", value: 0.481 },
        { description: "IPE 360", value: 0.559 },
        { description: "IPE 400", value: 0.65 },
      ],
    },
    {
      category: "HEB",
      entries: [
        { description: "HEB 100", value: 0.2 },
        { description: "HEB 120", value: 0.262 },
        { description: "HEB 140", value: 0.331 },
        { description: "HEB 160", value: 0.419 },
        { description: "HEB 180", value: 0.502 },
        { description: "HEB 200", value: 0.601 },
        { description: "HEB 220", value: 0.701 },
        { description: "HEB 240", value: 0.816 },
        { description: "HEB 260", value: 0.912 },
        { description: "HEB 280", value: 1.01 },
        { description: "HEB 300", value: 1.15 },
      ],
    },
    {
      category: "HEA",
      entries: [
        { description: "HEA 100", value: 0.164 },
        { description: "HEA 120", value: 0.195 },
        { description: "HEA 140", value: 0.242 },
        { description: "HEA 160", value: 0.297 },
        { description: "HEA 180", value: 0.348 },
        { description: "HEA 200", value: 0.415 },
        { description: "HEA 220", value: 0.498 },
        { description: "HEA 240", value: 0.594 },
        { description: "HEA 260", value: 0.67 },
        { description: "HEA 280", value: 0.75 },
        { description: "HEA 300", value: 0.866 },
      ],
    },
  ],
};

export const NTC2018_SLAB_VARIABLE_ACTIONS_DATABASE = [
  {
    id: 1,
    category: "A",
    subcategory: "A",
    description: "Ambienti per attivita domestiche e residenziali.",
    shortDescription: "Ambienti residenziali",
    qk: 2.0,
  },
  {
    id: 2,
    category: "A",
    subcategory: "A",
    description: "Scale comuni, balconi, ballatoi.",
    shortDescription: "Scale e balconi residenziali",
    qk: 4.0,
  },
  {
    id: 3,
    category: "B",
    subcategory: "B1",
    description: "Uffici non aperti al pubblico.",
    shortDescription: "Uffici non aperti al pubblico",
    qk: 2.0,
  },
  {
    id: 4,
    category: "B",
    subcategory: "B2",
    description: "Uffici aperti al pubblico.",
    shortDescription: "Uffici aperti al pubblico",
    qk: 3.0,
  },
  {
    id: 5,
    category: "B",
    subcategory: "B",
    description: "Scale comuni, balconi, ballatoi.",
    shortDescription: "Scale e balconi per uffici",
    qk: 4.0,
  },
  {
    id: 6,
    category: "C",
    subcategory: "C1",
    description: "Aree con tavoli, quali scuole, caffe, ristoranti.",
    shortDescription: "Aree con tavoli",
    qk: 3.0,
  },
  {
    id: 7,
    category: "C",
    subcategory: "C2",
    description: "Aree con posti a sedere fissi, quali chiese, teatri, cinema.",
    shortDescription: "Aree con posti a sedere fissi",
    qk: 4.0,
  },
  {
    id: 8,
    category: "C",
    subcategory: "C3",
    description: "Ambienti privi di ostacoli al movimento delle persone.",
    shortDescription: "Ambienti senza ostacoli",
    qk: 5.0,
  },
  {
    id: 9,
    category: "C",
    subcategory: "C4",
    description: "Aree con possibile svolgimento di attivita fisiche.",
    shortDescription: "Aree con attivita fisiche",
    qk: 5.0,
  },
  {
    id: 10,
    category: "C",
    subcategory: "C5",
    description: "Aree suscettibili di grandi affollamenti.",
    shortDescription: "Aree ad alto affollamento",
    qk: 5.0,
  },
  {
    id: 11,
    category: "C",
    subcategory: "C",
    description: "Scale comuni, balconi, ballatoi.",
    shortDescription: "Scale e balconi aree affollate",
    qk: 5.0,
  },
  {
    id: 12,
    category: "D",
    subcategory: "D1",
    description: "Negozi.",
    shortDescription: "Negozi",
    qk: 4.0,
  },
  {
    id: 13,
    category: "D",
    subcategory: "D2",
    description: "Centri commerciali, mercati, grandi magazzini.",
    shortDescription: "Centri commerciali",
    qk: 5.0,
  },
  {
    id: 14,
    category: "E",
    subcategory: "E1",
    description: "Aree per accumulo di merci e relative aree d'accesso.",
    shortDescription: "Magazzini e archivi",
    qk: 6.0,
  },
  {
    id: 15,
    category: "E",
    subcategory: "E2",
    description: "Ambienti ad uso industriale.",
    shortDescription: "Ambienti industriali",
    qk: 6.0,
  },
  {
    id: 16,
    category: "F",
    subcategory: "F",
    description: "Rimesse, aree per traffico, parcheggio e sosta di veicoli leggeri.",
    shortDescription: "Rimesse veicoli leggeri",
    qk: 2.5,
  },
  {
    id: 17,
    category: "G",
    subcategory: "G",
    description: "Aree per traffico e parcheggio di veicoli medi.",
    shortDescription: "Traffico e parcheggio veicoli medi",
    qk: 5.0,
  },
  {
    id: 18,
    category: "H",
    subcategory: "H",
    description: "Coperture accessibili per sola manutenzione.",
    shortDescription: "Coperture per manutenzione",
    qk: 0.5,
  },
];

export function listNTC2018SlabWeightCategories(weightType) {
  const collection = NTC2018_SLAB_MATERIAL_WEIGHT_DATABASE[weightType];

  if (!collection) {
    throw new Error(`Unsupported slab weight type: ${weightType}.`);
  }

  return collection.map((group) => group.category);
}

export function listNTC2018SlabWeightEntries(weightType, category) {
  const collection = NTC2018_SLAB_MATERIAL_WEIGHT_DATABASE[weightType];

  if (!collection) {
    throw new Error(`Unsupported slab weight type: ${weightType}.`);
  }

  const group = collection.find((item) => item.category === category);

  if (!group) {
    throw new Error(`Unsupported slab weight category '${category}' for ${weightType}.`);
  }

  return group.entries.map((entry) => ({ ...entry }));
}

export function getNTC2018SlabWeightValue({
  weightType,
  category,
  description,
}) {
  const entry = listNTC2018SlabWeightEntries(weightType, category)
    .find((item) => item.description === description);

  if (!entry) {
    throw new Error(`Unsupported slab weight entry '${description}' for category '${category}'.`);
  }

  return entry.value;
}

export function getNTC2018SlabVariableAction(actionId) {
  const action = NTC2018_SLAB_VARIABLE_ACTIONS_DATABASE.find((entry) => entry.id === actionId);

  if (!action) {
    throw new Error(`Unsupported NTC 2018 slab variable action id: ${actionId}.`);
  }

  return { ...action };
}

export function createNTC2018SlabVariableLoad({
  actionId,
  description,
  qk,
  units = null,
}) {
  if (units == null) {
    throw new Error("createNTC2018SlabVariableLoad requires explicit units: { force, length }.");
  }

  const action = getNTC2018SlabVariableAction(actionId);
  const factors = NTC2018_VARIABLE_ACTION_CATEGORIES[action.category];

  return new VariableLoad({
    description: description ?? action.shortDescription,
    value: qk ?? action.qk,
    psi0: factors.psi0,
    psi1: factors.psi1,
    psi2: factors.psi2,
    category: action.category,
    units,
  });
}
