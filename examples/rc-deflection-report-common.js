import fs from "node:fs";
import path from "node:path";

import {
  ConcreteNoTensionLaw,
  RCServiceStressSolver,
  RectangularSection,
  ReinforcedConcreteSection,
  ReinforcementBar,
  SectionFiberDiscretizer,
  SingleBeamAnalysis,
  SteelElasticLaw,
  createLongitudinalReinforcementLayout,
  createNTC2018BeamCombinations,
  createNTC2018ConcreteMaterial,
  createNTC2018PermanentAction,
  createNTC2018ReinforcementSteelMaterial,
  createNTC2018VariableAction,
  createReinforcedConcreteBeamSectionProvider,
  createUnitResolver,
  CrackedSectionDeflectionAnalysis,
} from "../src/index.js";
import { solveServiceStressWithFallbacks } from "../src/applications/reinforced-concrete-sections/analysis/solveServiceStressWithFallbacks.js";

const BEAM_UNITS = Object.freeze({ force: "kN", length: "m" });
const SECTION_UNITS = Object.freeze({ force: "N", length: "mm" });
const DEFAULT_MODULAR_RATIO = 15;

const round = (value, decimals = 3) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

function permanentAction(id, permanentClass = "G1") {
  return createNTC2018PermanentAction({
    id,
    permanentClass,
  });
}

function liveAction(id, category = "B") {
  return createNTC2018VariableAction({
    id,
    category,
  });
}

function buildRcBeamExample({
  id,
  title,
  description,
  span = 5,
  supports,
  g1 = 8,
  live = 5,
  concreteStrengthClass = "C25/30",
  reinforcementGrade = "B450C",
  width = 300,
  height = 500,
  bottomDiameter = 20,
  topDiameter = 20,
  bottomCount = 2,
  topCount = 2,
  cover = 40,
  elementCount = 20,
  serviceability = {},
}) {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: concreteStrengthClass,
    units: SECTION_UNITS,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: reinforcementGrade,
    units: SECTION_UNITS,
  });
  const concreteSection = new RectangularSection({
    width,
    height,
    units: SECTION_UNITS,
  });
  const reinforcementLayout = createLongitudinalReinforcementLayout({
    section: concreteSection,
    material: reinforcementMaterial,
    units: SECTION_UNITS,
    bottom: {
      id: "bottom-main",
      diameter: bottomDiameter,
      count: bottomCount,
      cover,
    },
    top: {
      id: "top-main",
      diameter: topDiameter,
      count: topCount,
      cover,
    },
  });
  const section = new ReinforcedConcreteSection({
    name: title,
    concreteSection,
    reinforcementBars: reinforcementLayout.reinforcementBars,
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: DEFAULT_MODULAR_RATIO,
    metadata: {
      longitudinalReinforcementGroups:
        reinforcementLayout.longitudinalReinforcementGroups,
    },
    units: SECTION_UNITS,
  });
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -g1,
      action: permanentAction("ACT-G1", "G1"),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -live,
      action: liveAction("ACT-LIVE"),
    },
  ];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_RARE", "SLE_QUASI_PERMANENT"],
    idPrefix: id,
  });

  return {
    id,
    title,
    description,
    span,
    section,
    concreteMaterial,
    reinforcementMaterial,
    loads,
    combinations,
    serviceability,
    beamInput: {
      units: BEAM_UNITS,
      geometry: {
        start: { x: 0, y: 0 },
        end: { x: span, y: 0 },
      },
      sectionProvider: createReinforcedConcreteBeamSectionProvider({
        section,
        stiffnessState: "transformed",
      }),
      supports,
      loads,
      combinations,
      discretization: {
        elementCount,
        stations: [span / 4, span / 2, (3 * span) / 4],
      },
    },
  };
}

function getCombinationByType(analysisResult, combinationType = "SLE_QUASI_PERMANENT") {
  return Object.values(analysisResult.combinations ?? {}).find(
    (result) => result.context?.combinationType === combinationType,
  );
}

function maxAbsVerticalDeflectionMm(combinationResult) {
  const resolver = createUnitResolver(
    combinationResult.units,
    SECTION_UNITS,
  );

  return Math.abs(
    resolver.length(
      combinationResult.displacements?.maxAbsVerticalDisplacement?.uy ?? 0,
    ),
  );
}

function deduplicateSamples(samples, resolver) {
  const byStation = new Map();

  for (const sample of samples ?? []) {
    const x = resolver.length(sample.station ?? 0);
    const current = byStation.get(round(x, 6));

    if (!current || Math.abs(sample.m ?? 0) > Math.abs(current.sample.m ?? 0)) {
      byStation.set(round(x, 6), {
        x,
        sample,
      });
    }
  }

  return [...byStation.values()].sort((a, b) => a.x - b.x);
}

function integrateCurvature(points, supports = []) {
  if (points.length < 2) {
    return points.map((point) => ({
      ...point,
      rotation: 0,
      deflection: 0,
    }));
  }

  const rotations = [0];
  const rawDeflections = [0];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dx = current.x - previous.x;
    const rotation =
      rotations[index - 1] + 0.5 * (previous.curvature + current.curvature) * dx;
    const deflection =
      rawDeflections[index - 1] + 0.5 * (rotations[index - 1] + rotation) * dx;

    rotations.push(rotation);
    rawDeflections.push(deflection);
  }

  const span = points[points.length - 1].x - points[0].x;
  const verticalSupports = supports.filter((support) => support.restraints?.uy);
  const hasTwoVerticalSupports = verticalSupports.length >= 2;
  const correction =
    hasTwoVerticalSupports && span > 0
      ? -rawDeflections[rawDeflections.length - 1] / span
      : 0;

  return points.map((point, index) => ({
    ...point,
    rotation: rotations[index] + correction,
    deflection: rawDeflections[index] + correction * (point.x - points[0].x),
  }));
}

function transformedGrossInertiaY({ section, modularRatio }) {
  const concrete = section.concreteSection;
  const concreteArea = concrete.area;
  const concreteCentroid = concrete.centroidY;
  const transformedBars = section.getReinforcementBars().map((bar) => ({
    area: modularRatio * bar.area,
    y: bar.y,
  }));
  const totalArea =
    concreteArea +
    transformedBars.reduce((sum, bar) => sum + bar.area, 0);
  const centroid =
    (concreteArea * concreteCentroid +
      transformedBars.reduce((sum, bar) => sum + bar.area * bar.y, 0)) /
    totalArea;
  const inertia =
    concrete.inertiaY +
    concreteArea * (concreteCentroid - centroid) ** 2 +
    transformedBars.reduce(
      (sum, bar) => sum + bar.area * (bar.y - centroid) ** 2,
      0,
    );

  return {
    centroid,
    inertia,
  };
}

function crackingMoment({ section, concreteMaterial }) {
  const concrete = section.concreteSection;
  const fctm = concreteMaterial?.fctm;

  if (!Number.isFinite(fctm) || fctm <= 0) {
    return null;
  }

  const sectionModulus =
    concrete.elasticSectionModulusY ??
    (Number.isFinite(concrete.inertiaY) && Number.isFinite(concrete.height)
      ? concrete.inertiaY / (concrete.height / 2)
      : null);

  return Number.isFinite(sectionModulus) && sectionModulus > 0
    ? fctm * sectionModulus
    : null;
}

function computeFullyCrackedDeflection({
  combinationResult,
  section,
  concreteMaterial,
  reinforcementMaterial,
  targetFiberCount = 300,
  modularRatio = DEFAULT_MODULAR_RATIO,
}) {
  const resultResolver = createUnitResolver(
    combinationResult.units,
    SECTION_UNITS,
  );
  const discretizer = new SectionFiberDiscretizer();
  const concreteMesh = discretizer.discretize(section, {
    targetCount: targetFiberCount,
  });
  const concreteLaw = new ConcreteNoTensionLaw({
    ecm: reinforcementMaterial.elasticModulus / modularRatio,
  });
  const steelLaw = new SteelElasticLaw({
    Es: reinforcementMaterial.elasticModulus,
  });
  const serviceSolver = new RCServiceStressSolver({
    tolerance: 1e-2,
    maxIterations: 80,
    finiteDifferenceStep: 1e-8,
  });
  const rawPoints = deduplicateSamples(
    combinationResult.internalForces?.samples ?? [],
    resultResolver,
  );
  const points = rawPoints.map(({ x, sample }) => {
    const mEd = resultResolver.moment(sample.m ?? 0);
    const nEd = resultResolver.force(sample.n ?? 0);

    if (Math.abs(mEd) <= 1e-9 && Math.abs(nEd) <= 1e-9) {
      return {
        x,
        station: x,
        mEd,
        nEd,
        curvature: 0,
      };
    }

    const solved = solveServiceStressWithFallbacks({
      serviceSolver,
      section,
      concreteFibers: concreteMesh.fibers,
      concreteLaw,
      steelLaw,
      actions: {
        nEd,
        mxEd: -mEd,
        myEd: 0,
      },
    });
    const curvature = solved.converged
      ? Math.sign(mEd || 1) * Math.abs(solved.strainField.kappaZ)
      : 0;

    return {
      x,
      station: x,
      mEd,
      nEd,
      curvature,
      converged: solved.converged,
    };
  });
  const integrated = integrateCurvature(points, combinationResult.supports ?? []);
  const governing = integrated.reduce((selected, point) => {
    if (!selected || Math.abs(point.deflection) > Math.abs(selected.deflection)) {
      return point;
    }

    return selected;
  }, null);

  return {
    mcr: crackingMoment({ section, concreteMaterial }),
    fiberCount: concreteMesh.generatedCount,
    maxAbsDeflection: Math.abs(governing?.deflection ?? 0),
    governingStation: governing?.station ?? null,
    points: integrated,
  };
}

function formatLoadSummary(loads) {
  return loads
    .map((load) => `- ${load.loadCaseId}: ${round(Math.abs(load.value), 3)} kN/m`)
    .join("\n");
}

function formatSupportSummary(supports) {
  return Object.entries(supports)
    .map(([end, type]) => `- ${end}: ${type}`)
    .join("\n");
}

function formatComparisonTable(rows) {
  const header = [
    "| Metodo | Freccia max [mm] | Stazione [m] | Note |",
    "| --- | ---: | ---: | --- |",
  ];
  const body = rows.map((row) =>
    `| ${row.method} | ${round(row.maxAbsDeflection, 3)} | ${row.station == null ? "-" : round(row.station, 3)} | ${row.notes} |`,
  );

  return [...header, ...body].join("\n");
}

function formatSlendernessTable(slenderness) {
  if (!slenderness) {
    return "_Verifica di snellezza non disponibile._";
  }

  return [
    "| Controllo | Domanda | Capacita | Utilizzazione | Esito |",
    "| --- | ---: | ---: | ---: | --- |",
    `| L/h | ${round(slenderness.demand, 3)} | ${round(slenderness.capacity, 3)} | ${round(slenderness.utilizationRatio, 3)} | ${slenderness.ok ? "OK" : "NON OK"} |`,
  ].join("\n");
}

function buildMarkdownReport({
  title,
  description,
  span,
  supports,
  loads,
  section,
  combinationResult,
  uncrackedDeflectionMm,
  fullyCracked,
  appCombination,
  appResult,
}) {
  const appGoverning = appCombination?.points?.reduce((selected, point) => {
    if (!selected || Math.abs(point.deflection) > Math.abs(selected.deflection)) {
      return point;
    }

    return selected;
  }, null);
  const rows = [
    {
      method: "1. Interamente reagente (FEM, sezione omogeneizzata n=15)",
      maxAbsDeflection: uncrackedDeflectionMm,
      station:
        combinationResult?.displacements?.maxAbsVerticalDisplacement?.station ?? null,
      notes: "Cls interamente reagente, armatura trasformata con n = 15.",
    },
    {
      method: "2. Totalmente fessurata (curvatura fessurata pura)",
      maxAbsDeflection: fullyCracked.maxAbsDeflection,
      station:
        fullyCracked.governingStation == null
          ? null
          : fullyCracked.governingStation / 1000,
      notes: "Cls teso escluso in tutta la trave, senza tension stiffening.",
    },
    {
      method: "3. Metodo app (Mcr + tension stiffening)",
      maxAbsDeflection: appCombination?.maxAbsDeflection ?? 0,
      station: appGoverning?.station ?? null,
      notes: "Curvatura media con zeta = 1 - beta (Mcr/M)^2 sopra Mcr.",
    },
  ];

  return `# ${title}

${description}

## Geometria

- Luce: ${round(span, 3)} m
- Sezione: ${round(section.concreteSection.width, 1)} x ${round(section.concreteSection.height, 1)} mm
- Combinazione usata per la deformata: ${combinationResult?.context?.combinationType ?? "n/d"}
- Rapporto modulare SLE: n = ${DEFAULT_MODULAR_RATIO}

## Vincoli

${formatSupportSummary(supports)}

## Carichi lineari

${formatLoadSummary(loads)}

## Confronto deformate

${formatComparisonTable(rows)}

## Dati sezione e fessurazione

- Momento di prima fessurazione Mcr: ${round((fullyCracked.mcr ?? 0) / 1e6, 3)} kNm
- Fibre cls usate nel solve fessurato: ${fullyCracked.fiberCount}
- Freccia governante metodo app: ${round(appCombination?.maxAbsDeflection ?? 0, 3)} mm
- Freccia governante totalmente fessurata: ${round(fullyCracked.maxAbsDeflection, 3)} mm

## Verifica semplificata di snellezza

${formatSlendernessTable(appResult.outputs?.simplifiedSlenderness)}

## Lettura dei risultati

- Il metodo 1 fornisce il limite inferiore delle frecce: sezione tutta reagente e non fessurata.
- Il metodo 2 fornisce il limite superiore: la trave e trattata come completamente fessurata lungo tutta la luce.
- Il metodo 3 e il workflow dell'app: sotto Mcr resta non fessurato, sopra Mcr usa la curvatura fessurata mediata con tension stiffening.
- Il controllo di snellezza e uno screening separato e non sostituisce il calcolo della freccia.
`;
}

export function writeRcDeflectionReport({
  model,
  outputDirectory,
}) {
  const analysisResult = new SingleBeamAnalysis().analyze(model.beamInput);
  const combinationResult = getCombinationByType(
    analysisResult,
    "SLE_QUASI_PERMANENT",
  );
  const appResult = new CrackedSectionDeflectionAnalysis().analyze({
    beamId: model.id,
    analysisResult,
    section: model.section,
    concreteMaterial: model.concreteMaterial,
    reinforcementMaterial: model.reinforcementMaterial,
    serviceability: model.serviceability,
    mesh: { targetFiberCount: 300 },
  });
  const appCombination = appResult.outputs.combinations.find(
    (combination) => combination.combinationType === "SLE_QUASI_PERMANENT",
  );
  const fullyCracked = computeFullyCrackedDeflection({
    combinationResult,
    section: model.section,
    concreteMaterial: model.concreteMaterial,
    reinforcementMaterial: model.reinforcementMaterial,
    targetFiberCount: 300,
  });
  const markdown = buildMarkdownReport({
    title: model.title,
    description: model.description,
    span: model.span,
    supports: model.beamInput.supports,
    loads: model.loads,
    section: model.section,
    combinationResult,
    uncrackedDeflectionMm: maxAbsVerticalDeflectionMm(combinationResult),
    fullyCracked,
    appCombination,
    appResult,
  });
  const outputPath = path.join(outputDirectory, "report.md");

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(outputPath, markdown, "utf8");

  return {
    outputPath,
    analysisResult,
    appResult,
    combinationResult,
    fullyCracked,
  };
}

export function createSimpleSpanRcDeflectionExample() {
  return buildRcBeamExample({
    id: "rc-deflection-simple-span",
    title: "Validazione deformata RC appoggio-appoggio",
    description:
      "Confronto tra sezione interamente reagente, sezione totalmente fessurata, workflow dell'app con Mcr + tension stiffening e screening di snellezza.",
    supports: {
      start: "hinge",
      end: "roller",
    },
    serviceability: {
      deflection: {
        slendernessSystem: "simple_span",
        creepCoefficient: 2,
      },
    },
  });
}

export function createFixedFixedRcDeflectionExample() {
  return buildRcBeamExample({
    id: "rc-deflection-fixed-fixed",
    title: "Validazione deformata RC doppiamente incastrata",
    description:
      "Confronto tra sezione interamente reagente, sezione totalmente fessurata, workflow dell'app con Mcr + tension stiffening e screening di snellezza per trave doppiamente incastrata.",
    supports: {
      start: "fixed",
      end: "fixed",
    },
    serviceability: {
      deflection: {
        slendernessSystem: "continuous_internal_span",
        creepCoefficient: 2,
      },
    },
  });
}
