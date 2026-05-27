export const ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_STANDARDS = Object.freeze({
  RDL_2229_1939: Object.freeze({
    id: "RDL_2229_1939",
    reference: "R.D.L. n.2229/1939",
    title: "Norme per l'esecuzione delle opere in conglomerato cementizio semplice od armato",
  }),
  LLPP_1472_1957: Object.freeze({
    id: "LLPP_1472_1957",
    reference: "LL.PP. n.1472/1957",
    title: "Norme tecniche per l'esecuzione delle opere in cemento armato normale e precompresso",
  }),
  DM_1972_05_30: Object.freeze({
    id: "DM_1972_05_30",
    reference: "D.M. 30/05/1972",
    title: "Norme tecniche per l'esecuzione delle opere in cemento armato normale e precompresso",
  }),
});

const steelGrade = ({ standardId, fyk, ftk }) =>
  Object.freeze({
    standardId,
    standardReference:
      ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_STANDARDS[standardId].reference,
    fyk,
    ftk,
  });

export const ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES = Object.freeze({
  Dolce: steelGrade({ standardId: "RDL_2229_1939", fyk: 225, ftk: 450 }),
  "Semi duro": steelGrade({ standardId: "RDL_2229_1939", fyk: 265, ftk: 540 }),
  Duro: steelGrade({ standardId: "RDL_2229_1939", fyk: 305, ftk: 640 }),
  Aq42: steelGrade({ standardId: "LLPP_1472_1957", fyk: 225, ftk: 450 }),
  Aq50: steelGrade({ standardId: "LLPP_1472_1957", fyk: 265, ftk: 540 }),
  Aq60: steelGrade({ standardId: "LLPP_1472_1957", fyk: 305, ftk: 640 }),
  FeB22k: steelGrade({ standardId: "DM_1972_05_30", fyk: 215, ftk: 335 }),
  FeB32k: steelGrade({ standardId: "DM_1972_05_30", fyk: 315, ftk: 490 }),
  A38: steelGrade({ standardId: "DM_1972_05_30", fyk: 375, ftk: 450 }),
  A41: steelGrade({ standardId: "DM_1972_05_30", fyk: 400, ftk: 490 }),
  FeB38k: steelGrade({ standardId: "DM_1972_05_30", fyk: 375, ftk: 450 }),
  FeB44k: steelGrade({ standardId: "DM_1972_05_30", fyk: 430, ftk: 540 }),
});

export const ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADE_NAMES =
  Object.freeze(Object.keys(ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES));

export function getItalianHistoricalReinforcementSteelGrade(grade) {
  return ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES[grade] ?? null;
}

export function listItalianHistoricalReinforcementSteelGrades() {
  return ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADE_NAMES.map((grade) => ({
    grade,
    ...ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES[grade],
  }));
}
