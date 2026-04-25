# Classi strutturali

Base OOP in JavaScript per costruire una codebase condivisa dedicata al calcolo strutturale.

Il progetto oggi non e piu solo una raccolta di classi: contiene un dominio riusabile, un layer unita esplicito, primitive FEM 2D, verifiche di sezione/trave e un registro di applicazioni verticali. Alcuni moduli sono gia implementati, altri sono parziali, altri sono scaffold intenzionali da completare.

## Stato attuale

La suite automatica copre il comportamento numerico principale e i contratti applicativi:

```bash
npm test
```

Stato corrente dei moduli applicativi:

| Modulo | Stato | Cosa fa oggi |
| --- | --- | --- |
| `single-beam-design` | MVP | Analisi FEM 2D di trave semplice, verifica opzionale e report JSON/Markdown. |
| `steel-frames` | Parziale | Verifiche di aste in acciaio da risultati FEM e pushover standalone di cerchiature metalliche rettangolari a 4 aste con cerniere plastiche concentrate. |
| `masonry-piers` | Parziale | Verifica verticale NTC 2018 di maschi murari e idealizzazione 2D a telaio equivalente con tratti rigidi incorporati tramite trasformazione matriciale. |
| `masonry-wall-openings` | Implementato | Verifiche di cerchiature su allineamenti murari con carichi verticali, confronto laterale pre/post a maschi aggregati e contributo della cerchiatura all'intero sistema. Mancano le fasce murarie non lineari. |
| `masonry-ring-beams` | Scaffold | Modello e placeholder per cerchiature in muratura. |
| `reinforced-concrete-sections` | Implementato | Analisi SLU/SLE di sezioni in c.a. a fibre. |
| `timber-beams` | Parziale | Verifiche di travi in legno da risultati FEM gia disponibili. |
| `timber-concrete-composite-beams` | Implementato | Verifica gamma-method di travi legno-calcestruzzo con connettori. |
| `timber-xlam-composite-beams` | Implementato | Verifica gamma-method di travi lignee collaboranti con pannelli XLAM. |
| `xlam-panels-out-of-plane` | Implementato | Verifica fuori piano di pannelli XLAM/CLT come strip 1D. |
| `rc-cracked-deflection` | Parziale | Integrazione delle curvature fessurate su risultati FEM SLE. |
| `masonry-out-of-plane` | Scaffold | Modello e placeholder per cinematismi fuori piano. |
| `micropiles-broms` | Scaffold | Modello e placeholder per analisi Broms dei micropali. |

## Struttura

- `src/core`: contratti comuni per applicazioni, codici normativi e risultati di calcolo/verifica.
- `src/applications`: moduli verticali con entrypoint, modelli, analisi/verifiche e manifest.
- `src/config`: cataloghi e manifesti ad alto livello del package.
- `src/domain/materials`: materiali generici, nuovi ed esistenti.
- `src/domain/geometry`: nodi, sezioni parametriche, sezioni poligonali, profili acciaio e pannelli XLAM.
- `src/domain/composite`: componenti e sezioni composte omogeneizzate.
- `src/domain/reinforcement`: armature discrete riusabili nelle sezioni.
- `src/domain/connectors`: connettori meccanici e cataloghi produttore.
- `src/domain/beams`: provider di rigidezza, analisi trave singola, inviluppi e adattatori di verifica.
- `src/domain/fem`: solutore FEM lineare 2D per telai/travi.
- `src/domain/actions`, `src/domain/analysis`, `src/domain/loads`: azioni, casi, combinazioni e carichi.
- `src/domain/slabs`: carichi di solaio e analisi SLU/SLE.
- `src/norms/ntc2018`: preset, cataloghi e factory normative NTC 2018.

## Contratti Comuni

Le applicazioni restituiscono uno tra:

- `CalculationResult`: risultato di analisi o workflow, con `status`, `outputs`, `warnings`, `assumptions`, `metadata`.
- `VerificationResult`: risultato di verifica, con `checks`, `utilizationRatio`, `capacity`, `demand` e metodo `isVerified()`.

Gli stati piu usati sono:

- `ok`: calcolo/verifica concluso e verificato.
- `not-verified`: calcolo concluso ma almeno una verifica non passa.
- `not-implemented`: modulo o ramo ancora placeholder.

## Layer Unita

I principali costruttori richiedono un oggetto esplicito:

```js
const units = { force: "N", length: "mm" };
```

Da `force` e `length` il package ricava automaticamente grandezze derivate: momento, carico lineare, tensione, modulo elastico, area, volume, inerzia e moduli resistenti.

Regola pratica:

- dominio sezioni/materiali/connettori: usare spesso `{ force: "N", length: "mm" }`;
- modelli di trave e input utente: sono accettati anche `{ force: "kN", length: "m" }`;
- i valori vengono convertiti nelle unita interne storiche del modulo;
- `toJSON().units` espone le unita interne;
- `metadata.sourceUnitSystem` conserva le unita dichiarate dall'utente.

I profili in acciaio hanno unita catalogo proprie (`N`, `m`) e vengono convertiti indipendentemente dalle unita usate dall'utente.

## Moduli Applicativi

### `single-beam-design`

Stato: MVP.

Input minimo:

- `SingleBeamDesignModel` con `id`, `units`, `beamInput`.
- `beamInput` deve contenere geometria, vincoli, carichi, combinazioni e una sorgente di rigidezza: `sectionProvider` oppure coppia `section` + `material`.
- `verification` e opzionale; se presente puo essere una funzione o un verifier con `verify()` / `run()`.

Output atteso:

- `CalculationResult`.
- `outputs.analysis`: risultato FEM della trave singola.
- `outputs.verification`: risultato della verifica, se richiesta.
- `outputs.report.json`: DTO validabile con `validateBeamReportDto`.
- `outputs.report.markdown`: report testuale.

Unita richieste:

- obbligatorie in `beamInput.units`;
- le forze, lunghezze, carichi e combinazioni seguono quelle unita;
- sezioni/materiali possono avere unita diverse, purche dichiarate.

Limiti del metodo:

- modello FEM 2D lineare;
- rotazioni di sezione gestite come proiezione delle azioni principali, non come torsione vera;
- carichi distribuiti solo uniformi;
- la verifica dipende dal verifier collegato.

Esempio completo:

```js
import {
  RectangularSection,
  SingleBeamDesignApplication,
  SingleBeamDesignModel,
  TimberBeamVerification,
  createNTC2018TimberMaterial,
} from "./src/index.js";

const units = { force: "N", length: "mm" };
const section = new RectangularSection({
  width: 120,
  height: 240,
  units,
});
const material = createNTC2018TimberMaterial({
  strengthClass: "C24",
  serviceClass: 1,
  units,
});

const model = new SingleBeamDesignModel({
  id: "beam-report-01",
  title: "Trave semplice in legno",
  units,
  section,
  material,
  beamInput: {
    units,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
    },
    section,
    material,
    supports: {
      start: "hinge",
      end: "roller",
    },
    loads: [
      {
        id: "g1",
        loadCaseId: "G1",
        actionType: "G1",
        type: "uniform",
        value: -3,
      },
      {
        id: "qk",
        loadCaseId: "Qk",
        actionType: "Qk",
        type: "uniform",
        value: -2,
      },
    ],
    combinations: [
      {
        id: "uls",
        limitState: "ULS",
        factors: { G1: 1.3, Qk: 1.5 },
      },
      {
        id: "sle",
        limitState: "SLE",
        factors: { G1: 1, Qk: 1 },
      },
    ],
    discretization: { elementCount: 8 },
  },
  verification: {
    verifier: new TimberBeamVerification({
      deflectionLimitDenominator: 300,
    }),
    input: { section, material },
  },
});

const result = new SingleBeamDesignApplication().run({ model });

console.log(result.status);
console.log(result.outputs.report.json.governing);
console.log(result.outputs.report.markdown);
```

### `steel-frames`

Stato: parziale.

Input minimo:

- workflow 1, verifica membro:
  - `section`, `material` e `analysisResult` per verificare una o piu aste;
  - `analysisResult` puo arrivare da `SingleBeamAnalysis` o da un futuro solver globale, purche rispetti lo stesso contratto di risultati.
- workflow 2, pushover standalone di cerchiatura:
  - `SteelRingFramePushoverModel` con `id`, `units`, `geometry`, `memberSections`, `material`, `baseCondition`, `loading` e `solver`;
  - `geometry` richiede almeno `b` e `h` del varco;
  - `baseCondition` supporta:
    - `fixed-base`;
    - `pinned-base-with-bottom-beam`;
    - `pinned-base-without-bottom-beam`;
  - le sezioni dei membri possono essere dichiarate tramite profili commerciali del database integrato, ad esempio `IPE200`, `HEA120`.

Output atteso:

- per la verifica membro: `VerificationResult` se gli input sono completi.
- Checks tipici: classificazione sezione, flessione, taglio, sforzo normale, tensione elastica, LTB, instabilita a compressione, interazione `N + My`, freccia SLE.
- per il pushover standalone: `CalculationResult` con:
  - `outputs.frameIdealization`;
  - `outputs.control`;
  - `outputs.capacityCurve`;
  - `outputs.hingeEvents`;
  - `outputs.finalState`.
- `CalculationResult` placeholder se mancano gli input necessari per il ramo richiesto.

Unita richieste:

- nella verifica membro:
  - profili/materiali con unita dichiarate;
  - il risultato FEM espone `analysisResult.units`;
  - le proprieta catalogo dei profili sono convertite automaticamente.
- nel pushover standalone:
  - il modello puo essere dichiarato anche in `kN` e `m`;
  - sezioni e materiali possono restare nelle unita storiche `N` e `mm`;
  - il builder del telaio lavora nello snapshot FEM in `kN` e `m`, convertendo automaticamente rigidezze e momenti plastici;
  - il controllo indiretto di spostamento usa il solver generico `DisplacementControlNonlinearStaticSolver2D` del layer FEM non lineare.

Limiti del metodo:

- non esegue ancora una analisi globale generica di telai in acciaio; oggi copre verifiche di asta e un pushover standalone molto mirato di cerchiatura rettangolare a 4 aste;
- il pushover usa un modello piano 2D Euler-Bernoulli con 3 DOF nodali per nodo, plasticita concentrata alle estremita ed assenza di non linearita geometrica;
- il pattern di carico laterale del pushover e fissato, con ripartizione `50/50` sui due nodi superiori e controllo di un solo DOF orizzontale al livello dell'architrave;
- il solver pushover usa il sistema aumentato `[Kt -Fext; c^T 0]`, quindi puo proseguire naturalmente oltre il primo meccanismo finche il target di spostamento e maggiore e la risposta resta numericamente determinabile;
- nel caso della cerchiatura rettangolare oggi la curva di capacita restituisce sia il ramo ascendente sia il plateau post-meccanismo a forza orizzontale costante quando il modello elastico-perfettamente-plastico ha esaurito la capacita;
- non sono ancora incluse non linearita geometriche, incrudimento, degrado ciclico o criteri avanzati di prosecuzione per meccanismi multipli;
- dominio principale di verifica membro `N + My`, con supporto parziale per componenti ruotate;
- torsione e interazioni torsionali escluse;
- sezioni di classe 4 bloccate finche non saranno disponibili proprieta efficaci.

Esempio completo:

```js
import {
  SingleBeamAnalysis,
  SteelFrameApplication,
  createNTC2018StructuralSteelMaterial,
  createSteelBeamSectionProvider,
  createSteelProfileSection,
} from "./src/index.js";

const units = { force: "kN", length: "m" };
const section = createSteelProfileSection({
  profileName: "IPE200",
  units,
});
const material = createNTC2018StructuralSteelMaterial({
  grade: "S275",
  units,
});
const sectionProvider = createSteelBeamSectionProvider({
  section,
  material,
});

const analysisResult = new SingleBeamAnalysis().analyze({
  id: "steel-member-01",
  units,
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 5, y: 0 },
  },
  sectionProvider,
  analysisModel: "timoshenko",
  supports: {
    start: "hinge",
    end: "roller",
  },
  loads: [
    {
      id: "g1",
      loadCaseId: "G1",
      actionType: "G1",
      type: "uniform",
      value: -4,
    },
  ],
  combinations: [
    {
      id: "uls",
      limitState: "ULS",
      factors: { G1: 1.3 },
    },
    {
      id: "sle",
      limitState: "SLE",
      factors: { G1: 1 },
    },
  ],
  discretization: { elementCount: 8 },
});

const result = new SteelFrameApplication().run({
  memberId: "steel-member-01",
  section,
  material,
  analysisResult,
  deflectionLimitRatio: 250,
});

console.log(result.status);
console.log(result.utilizationRatio);
console.log(result.checks.map((check) => check.id));
```

Esempio pushover standalone della cerchiatura:

```js
import {
  SteelFrameApplication,
  SteelRingFramePushoverModel,
} from "./src/index.js";

const model = new SteelRingFramePushoverModel({
  id: "ring-frame-01",
  units: { force: "kN", length: "m" },
  geometry: {
    b: 0.9,
    h: 2.1,
  },
  memberSections: {
    columns: "IPE200",
    topBeam: "IPE200",
    bottomBeam: "IPE200",
  },
  material: "S275",
  baseCondition: "pinned-base-with-bottom-beam",
  solver: {
    controlIncrement: 0.002,
    maxDisplacement: 0.08,
    tolerance: 1e-2,
    maxIterations: 60,
    maxSteps: 60,
  },
});

const result = new SteelFrameApplication().run({ model });

console.log(result.status);
console.log(result.outputs.capacityCurve.points.at(-1));
console.log(result.outputs.hingeEvents);
console.log(result.outputs.finalState.termination);
```

### `masonry-piers`

Stato: parziale.

Input minimo:

- `MasonryPierModel` con `id`, `units`, `geometry`, `material`, `actions`, `design`.
- `geometry` richiede almeno `height`, `length`, `thickness`.
- `material` puo essere un materiale murario custom oppure una istanza `NTC2018ExistingMasonryMaterial`.
- `actions` accetta `axialForce` e, opzionalmente, `outOfPlaneVerticalLoadEccentricity`, `inPlaneVerticalLoadEccentricity`, `outOfPlaneMoment`, `inPlaneMoment`.
- `design.gammaM` e richiesto esplicitamente per la verifica verticale; `confidenceFactor` puo arrivare dal materiale o essere forzato nel modello.
- `idealization.rigidEndZoneBottom` e `idealization.rigidEndZoneTop` sono opzionali e servono per la schematizzazione 2D futura nel telaio equivalente.

Output atteso:

- `VerificationResult`.
- `outputs.geometry`, `outputs.material`, `outputs.eccentricities`, `outputs.stability` e `outputs.actions` riportano tutte le grandezze derivate usate nella verifica.
- `outputs.equivalentFrameIdealization` contiene uno snapshot serializzabile del modello 2D equivalente con i due nodi fisici del maschio, un elemento Timoshenko con rigid offsets incorporati e il vincolo di base.

Unita richieste:

- obbligatorie nel modello;
- la verifica verticale lavora internamente in `N`, `mm`, `Nmm`, `N/mm2`;
- lo snapshot del modello equivalente 2D usa unita FEM `kN`, `m`.

Limiti del metodo:

- la verifica verticale usa il metodo semplificato con coefficienti `Phi` tabellati per l'ipotesi di articolazione, interpolati linearmente senza estrapolazione di default;
- non e ancora un solver globale di pareti a telaio equivalente;
- non comprende ancora verifiche a taglio, flessione nel piano del maschio come elemento dissipativo o interazione a livello parete;
- la verifica verticale del modulo resta analitica e usa azioni note; l'idealizzazione FEM e pensata come base riusabile per il futuro assemblaggio del telaio equivalente di parete.

Esempio completo:

```js
import {
  MasonryPierApplication,
  MasonryPierModel,
  createNTC2018ExistingMasonryMaterial,
} from "./src/index.js";

const units = { force: "N", length: "mm" };
const material = createNTC2018ExistingMasonryMaterial({
  masonryTypologyId: 1,
  knowledgeLevel: "LC2",
  units,
  modifierSelections: {
    maltaBuona: { selected: true, value: 1.5 },
    iniezioniMisceleLeganti: { selected: true },
  },
});

const model = new MasonryPierModel({
  id: "pier-01",
  units,
  geometry: {
    height: 3000,
    length: 1000,
    thickness: 300,
  },
  material,
  actions: {
    axialForce: 200000,
    outOfPlaneVerticalLoadEccentricity: 10,
    outOfPlaneMoment: 2500000,
    inPlaneMoment: 16666666.67,
  },
  design: {
    gammaM: 2,
  },
  idealization: {
    rigidEndZoneBottom: 200,
    rigidEndZoneTop: 300,
  },
});

const result = new MasonryPierApplication().run({ model });

console.log(result.status);
console.log(result.outputs.stability.phi1);
console.log(result.outputs.equivalentFrameIdealization.elements[0].deformableLength);
```

### `masonry-wall-openings`

Stato: implementato per il modulo cerchiature, con esclusione del modello non lineare delle fasce murarie.

Input minimo:

- `MasonryWallOpeningsModel` con `id`, `units`, `walls`, `openings` e, opzionalmente, `settings`.
- Ogni allineamento murario richiede geometria, spessore, materiale e carichi verticali; le aperture dichiarano posizione, dimensioni, architrave e, nello stato di progetto, l'eventuale `ringFrame`.
- Per i confronti pre/post si usano coppie di modelli stato di fatto/progetto; gli esempi JSON in `examples/masonry-wall-openings` seguono questa struttura.
- I materiali possono usare proprieta di stato di fatto e proprieta migliorate di progetto, incluse le factory NTC 2018 con coefficienti migliorativi come intonaco armato, iniezioni o ristilatura.

Output atteso:

- verifica a carichi verticali dell'allineamento;
- analisi laterale a maschi aggregati per stato di fatto e progetto;
- confronto pre/post di rigidezza, resistenza e variazione percentuale;
- report JSON/Markdown generabili con `npm run example:masonry-wall-openings:cerchiature`.

Regole principali:

- nello stato di progetto il risolutore usa le proprieta meccaniche migliorate quando presenti, cosi rigidezza e resistenza della muratura recepiscono gli interventi dichiarati;
- la cerchiatura dichiarata sull'apertura appartiene all'allineamento murario e contribuisce alla rigidezza e alla resistenza laterale globali del sistema;
- il numero di telai paralleli della cerchiatura scala il contributo resistente e deformativo;
- gli esempi `viabolognese`, `faentina` e `nasini` sono stati costruiti dai file di input storici e confrontati con i relativi report disponibili.

Limiti del metodo:

- le fasce murarie non lineari non sono ancora implementate;
- l'eventuale telaio equivalente/FEM resta un supporto di controllo e validazione, non il riferimento operativo del modulo cerchiature;
- non sono ancora modellati degrado ciclico, rotture locali fuori piano o dettagli costruttivi dei collegamenti acciaio-muratura.

Esempio completo:

```bash
npm run example:masonry-wall-openings:cerchiature
```

### `masonry-ring-beams`

Stato: scaffold.

Input minimo:

- `MasonryRingBeamModel` con `id`.
- Sono gia previsti campi `opening`, `wall`, `reinforcementScheme`, `loadPath`.

Output atteso:

- `CalculationResult` placeholder con `status: "not-implemented"`.
- `outputs.verification` contiene un `VerificationResult` placeholder.

Unita richieste:

- non c'e ancora un contratto numerico vincolante;
- per i futuri input usare SI esplicito e salvare le unita nei metadata o nei sotto-oggetti.

Limiti del metodo:

- nessun dimensionamento reale della cerchiatura;
- nessuna redistribuzione dei carichi intorno all'apertura;
- nessuna verifica acciaio-muratura implementata in questo modulo.

Esempio completo:

```js
import {
  MasonryRingBeamApplication,
  MasonryRingBeamModel,
} from "./src/index.js";

const model = new MasonryRingBeamModel({
  id: "ring-beam-01",
  opening: {
    id: "opening-01",
    width: 1.2,
    height: 2.1,
    units: { force: "kN", length: "m" },
  },
  wall: {
    thickness: 0.3,
    masonryTypology: "existing-stone",
  },
  reinforcementScheme: {
    steelProfiles: ["HEA120"],
  },
  loadPath: {
    verticalLoad: 80,
  },
});

const result = new MasonryRingBeamApplication().run({ model });

console.log(result.status); // "not-implemented"
console.log(result.outputs.verification.status);
```

### `reinforced-concrete-sections`

Stato: implementato.

Input minimo:

- `ReinforcedConcreteSectionModel` con `id`, `units`, `section`, `materials`, `actions`.
- `section` e normalmente una `ReinforcedConcreteSection`.
- `analysisType` seleziona il workflow.

Output atteso:

- `VerificationResult`.
- Workflow oggi disponibili:
  - `uls-uniaxial-resistance`;
  - `uls-biaxial-domain`;
  - `uls-uniaxial-domain`;
  - `service-stress`.
- `outputs` contiene resistenze, punti del dominio o tensioni SLE in base al workflow.

Unita richieste:

- obbligatorie nel modello;
- unita interne del modulo: `N`, `mm`, `Nmm`, `MPa`;
- le azioni `nEd`, `mEd`, `mxEd`, `myEd`, `nValues` vengono convertite.

Limiti del metodo:

- modello a fibre con griglia nel bounding box, non mesh adattiva;
- crisi e duttilita non ancora classificate in modo completo;
- dominio biaxiale campionato per angoli, senza raffinamento adattivo;
- niente momento-curvatura o colonna modello.

Esempio completo:

```js
import {
  RectangularSection,
  ReinforcedConcreteSection,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcementBar,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "./src/index.js";

const units = { force: "N", length: "mm" };
const concreteMaterial = createNTC2018ConcreteMaterial({
  strengthClass: "C25/30",
  units,
});
const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
  grade: "B450C",
  units,
});
const section = new ReinforcedConcreteSection({
  name: "RC 300x500",
  concreteSection: new RectangularSection({
    width: 300,
    height: 500,
    units,
  }),
  reinforcementBars: [
    new ReinforcementBar({
      id: "bottom-left",
      diameter: 20,
      grade: "B450C",
      material: reinforcementMaterial,
      y: 40,
      z: 60,
      units,
    }),
    new ReinforcementBar({
      id: "bottom-right",
      diameter: 20,
      grade: "B450C",
      material: reinforcementMaterial,
      y: 40,
      z: 240,
      units,
    }),
    new ReinforcementBar({
      id: "top-left",
      diameter: 20,
      grade: "B450C",
      material: reinforcementMaterial,
      y: 460,
      z: 60,
      units,
    }),
    new ReinforcementBar({
      id: "top-right",
      diameter: 20,
      grade: "B450C",
      material: reinforcementMaterial,
      y: 460,
      z: 240,
      units,
    }),
  ],
  concreteMaterial,
  reinforcementMaterial,
  referenceModularRatio: 15,
  units,
});

const model = new ReinforcedConcreteSectionModel({
  id: "rc-section-01",
  section,
  materials: {
    concreteMaterial,
    reinforcementMaterial,
  },
  analysisType: "uls-uniaxial-resistance",
  mesh: { targetFiberCount: 120 },
  solver: {
    tolerance: 1e-6,
    maxIterations: 100,
  },
  actions: {
    nEd: -800000,
    mEd: 1.5e8,
  },
  analysisSettings: {
    compressedEdge: "top",
  },
  units,
});

const result = new ReinforcedConcreteSectionApplication().run({ model });

console.log(result.status);
console.log(result.outputs.analysisType);
console.log(result.outputs.MxRd);
```

### `timber-beams`

Stato: parziale.

Input minimo:

- `section`, `material`, `analysisResult`.
- `analysisResult` deve contenere combinazioni o casi di carico con campioni di sollecitazione e freccia.

Output atteso:

- `VerificationResult` se gli input sono completi.
- Checks tipici: flessione, taglio, stabilita flesso-torsionale, freccia istantanea/finale.
- `CalculationResult` placeholder se mancano gli input.

Unita richieste:

- sezioni/materiali con unita esplicite;
- `analysisResult.units` usate per convertire azioni e frecce;
- il provider legno lavora internamente in `N` e `mm`.

Limiti del metodo:

- non genera da solo combinazioni o FEM globale;
- verifica LTB semplificata per travi rettangolari;
- richiede assunzioni esplicite se la trave e controventata lateralmente.

Esempio completo:

```js
import {
  RectangularSection,
  SingleBeamAnalysis,
  TimberBeamApplication,
  createNTC2018BeamCombinations,
  createNTC2018PermanentAction,
  createNTC2018TimberMaterial,
  createNTC2018VariableAction,
  createTimberBeamSectionProvider,
  getNTC2018TimberKmod,
} from "./src/index.js";

const sectionUnits = { force: "N", length: "mm" };
const beamUnits = { force: "kN", length: "m" };
const section = new RectangularSection({
  width: 120,
  height: 240,
  units: sectionUnits,
});
const material = createNTC2018TimberMaterial({
  strengthClass: "C24",
  serviceClass: 1,
  units: sectionUnits,
});
const loads = [
  {
    id: "g1",
    loadCaseId: "G1",
    value: -0.5,
    action: createNTC2018PermanentAction({
      id: "ACT-G1",
      permanentClass: "G1",
    }),
  },
  {
    id: "qk",
    loadCaseId: "Qk",
    value: -1,
    action: createNTC2018VariableAction({
      id: "ACT-Q",
      category: "B",
    }),
  },
];
const combinations = createNTC2018BeamCombinations({
  loads,
  types: ["ULS", "SLE_RARE"],
  idPrefix: "timber-01",
});
const sectionProvider = createTimberBeamSectionProvider({
  section,
  material,
  gammaM: 1.5,
  kdef: 0.6,
  kmodResolver: ({ loadDurationClass, serviceClass, materialType }) =>
    getNTC2018TimberKmod({
      materialType,
      serviceClass,
      loadDurationClass,
    }),
});

const analysisResult = new SingleBeamAnalysis().analyze({
  id: "timber-01",
  units: beamUnits,
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 4, y: 0 },
  },
  sectionProvider,
  supports: {
    start: "hinge",
    end: "roller",
  },
  loads,
  combinations,
  discretization: { elementCount: 8 },
});

const result = new TimberBeamApplication().run({
  model: { id: "timber-01", section, material, analysisResult },
  section,
  material,
  analysisResult,
  deflectionLimitRatio: 300,
});

console.log(result.status);
console.log(result.utilizationRatio);
```

### `timber-concrete-composite-beams`

Stato: implementato.

Input minimo:

- `TimberConcreteCompositeBeamModel` con `span`, `slabSection`, `timberSection`, materiali, connettore, interassi e carichi.
- La verifica puo usare formule chiuse o, se presente `model.analysisResult`, domande da FEM.

Output atteso:

- `VerificationResult`.
- `outputs` include coefficienti gamma, rigidezze efficaci, tensioni in legno/soletta, forza connettore, freccia e domanda governante.

Unita richieste:

- obbligatorie nel modello;
- interne `N`, `mm`;
- carichi lineari convertiti da `loads.ulsLineLoad`, `loads.sleRareLineLoad`, `loads.sleFrequentLineLoad`, `loads.sleQuasiPermanentLineLoad`.

Limiti del metodo:

- metodo gamma 1D;
- connessione discretizzata tramite interasse equivalente;
- componenti deboli da rotazione sezione sono riportate ma trascurate per la verifica 1D;
- non considera fuoco, vibrazioni o comportamento non lineare della connessione.

Esempio completo:

```js
import {
  RectangularSection,
  ReinforcementBar,
  TimberConcreteCompositeBeamApplication,
  TimberConcreteCompositeBeamModel,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  createNTC2018TimberMaterial,
  createTecnariaConnector,
} from "./src/index.js";

const units = { force: "N", length: "mm" };
const timberMaterial = createNTC2018TimberMaterial({
  strengthClass: "C24",
  kmod: 0.8,
  units,
});
const concreteMaterial = createNTC2018ConcreteMaterial({
  strengthClass: "LC25/28",
  units,
});
const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
  grade: "B450C",
  units,
});

const model = new TimberConcreteCompositeBeamModel({
  id: "timber-concrete-01",
  span: 4250,
  slabSection: new RectangularSection({
    width: 1800,
    height: 60,
    units,
  }),
  timberSection: new RectangularSection({
    width: 220,
    height: 250,
    units,
  }),
  timberConcreteGap: 100,
  reinforcement: new ReinforcementBar({
    diameter: 6,
    grade: "B450C",
    material: reinforcementMaterial,
    units,
  }),
  reinforcementSpacing: 100,
  timberMaterial,
  concreteMaterial,
  reinforcementMaterial,
  connector: createTecnariaConnector({
    type: "MAXI",
    boardThickness: 0,
    units,
  }),
  connectorSpacing: 150,
  kdef: 0.6,
  kmod: 0.8,
  confidenceFactor: 1.35,
  loads: {
    ulsLineLoad: 15.966,
    sleRareLineLoad: 10.998,
  },
  units,
});

const result = new TimberConcreteCompositeBeamApplication().run({ model });

console.log(result.status);
console.log(result.outputs.gammaUls);
console.log(result.utilizationRatio);
```

### `timber-xlam-composite-beams`

Stato: implementato.

Input minimo:

- `TimberXlamCompositeBeamModel` con `span`, `xlamSection`, `timberSection`, materiali, connettore e carichi.
- La verifica puo usare formule chiuse o domande FEM in `model.analysisResult`.

Output atteso:

- `VerificationResult`.
- `outputs` include `gamma1/gamma2`, `EJ` efficace, tensioni, rolling/shear, forza connettore, frecce breve/lungo termine.

Unita richieste:

- obbligatorie nel modello;
- interne `N`, `mm`;
- carichi lineari convertiti da `loads.ulsLineLoad`, `loads.slePermanentLineLoad`, `loads.sleVariableLineLoad`.

Limiti del metodo:

- gamma-method 1D;
- pannello XLAM trattato come componente collaborante equivalente;
- componenti deboli da rotazione sono riportate ma trascurate nella verifica 1D;
- fuoco, vibrazioni e connessioni alternative sono ancora estensioni future.

Esempio completo:

```js
import {
  RectangularSection,
  TimberDowelConnector,
  TimberMaterial,
  TimberXlamCompositeBeamApplication,
  TimberXlamCompositeBeamModel,
  XlamPanelSection,
} from "./src/index.js";

const units = { force: "N", length: "mm" };
const xlamMaterial = new TimberMaterial({
  name: "XLAM top panel",
  strengthClass: "custom-xlam",
  elasticModulus: 11600,
  fmK: 24,
  fvK: 2.7,
  units,
});
const timberMaterial = new TimberMaterial({
  name: "Glulam beam",
  strengthClass: "custom-glulam",
  elasticModulus: 12600,
  fmK: 28,
  fvK: 3.2,
  units,
});

const model = new TimberXlamCompositeBeamModel({
  id: "timber-xlam-01",
  span: 9200,
  xlamSection: new XlamPanelSection({
    effectiveWidth: 600,
    layerThicknesses: [0, 0, 30, 30, 30],
    activeLayerIndexes: [1, 3],
    units,
  }),
  timberSection: new RectangularSection({
    width: 240,
    height: 440,
    units,
  }),
  xlamMaterial,
  timberMaterial,
  connector: new TimberDowelConnector({
    diameter: 16,
    timberDensityMean: 410,
    timberDensityCharacteristicSection1: 380,
    timberDensityCharacteristicSection2: 410,
    ultimateTensileStrength: 360,
    penetrationLength: 90,
    spacing: 50,
    gammaConnection: 1.5,
    kmod: 0.9,
    units,
  }),
  kmod: 0.9,
  serviceClass: 2,
  psi2: 0,
  loads: {
    ulsLineLoad: 17.134,
    slePermanentLineLoad: 5.044,
    sleVariableLineLoad: 6.24,
  },
  units,
});

const result = new TimberXlamCompositeBeamApplication().run({ model });

console.log(result.status);
console.log(result.outputs.ejEffUls);
console.log(result.utilizationRatio);
```

### `xlam-panels-out-of-plane`

Stato: implementato.

Input minimo:

- `XlamOutOfPlanePanelModel` con `span`, `section`, `material`, `loads`, `units`.
- `section` puo arrivare da `createXlamPanelSection` o da `XlamPanelSection`.

Output atteso:

- `VerificationResult`.
- `outputs` include rigidezza flessionale, rigidezza tagliante, verifiche a flessione, rolling shear e deformabilita.

Unita richieste:

- obbligatorie nel modello;
- interne `N`, `mm`;
- carichi lineari convertiti da `loads.ulsLineLoad`, `loads.sleLineLoad`, `loads.slePermanentLineLoad`, `loads.sleVariableLineLoad`.

Limiti del metodo:

- strip 1D fuori piano, non piastra 2D completa;
- appoggio semplice e schemi base;
- vibrazioni, fuoco, forature e appoggi continui sono estensioni future.

Esempio completo:

```js
import {
  XlamMaterial,
  XlamOutOfPlanePanelApplication,
  XlamOutOfPlanePanelModel,
  createXlamPanelSection,
} from "./src/index.js";

const units = { force: "N", length: "mm" };
const section = createXlamPanelSection({
  layerThicknesses: [40, 30, 40, 30, 40],
  activeLayerIndexes: [0, 2, 4],
  effectiveWidth: 1000,
  units,
});
const material = new XlamMaterial({
  name: "Generic CLT C24",
  strengthClass: "custom-clt",
  elasticModulus: 11000,
  fmK: 24,
  fvK: 4,
  e0Mean: 11000,
  e90Mean: 11000 / 30,
  g0Mean: 690,
  g90Mean: 69,
  rollingShearStrength: 1.2,
  units,
});

const model = new XlamOutOfPlanePanelModel({
  id: "xlam-panel-01",
  span: 4500,
  section,
  material,
  serviceClass: 1,
  kmod: 0.8,
  gammaM: 1.45,
  systemBoardCount: 4,
  loads: {
    ulsLineLoad: 8,
    sleLineLoad: 5,
    slePermanentLineLoad: 2.5,
    sleVariableLineLoad: 2.5,
  },
  units,
});

const result = new XlamOutOfPlanePanelApplication().run({ model });

console.log(result.status);
console.log(result.outputs.bendingStiffness);
console.log(result.checks.map((check) => check.id));
```

### `rc-cracked-deflection`

Stato: parziale.

Input minimo:

- `analysisResult` FEM con combinazioni SLE;
- `section`, `concreteMaterial`, `reinforcementMaterial`;
- opzionale `serviceability.deflection` per creep e limiti.

Output atteso:

- `VerificationResult`.
- `outputs.combinations` con frecce da integrazione delle curvature;
- checks di deformazione e snellezza.

Unita richieste:

- coerenti tra `analysisResult.units` e sezione/materiali;
- il calcolo converte verso `N`, `mm`.

Limiti del metodo:

- analisi di deformazione fessurata a partire da risultati FEM gia calcolati;
- ritiro escluso intenzionalmente anche se richiesto, con warning;
- non sostituisce ancora un workflow completo di lungo termine con storia di carico.

Esempio completo:

```js
import {
  CrackedSectionDeflectionAnalysis,
  RectangularSection,
  ReinforcedConcreteSection,
  ReinforcementBar,
  SingleBeamAnalysis,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "./src/index.js";

const units = { force: "N", length: "mm" };
const concreteMaterial = createNTC2018ConcreteMaterial({
  strengthClass: "C25/30",
  units,
});
const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
  grade: "B450C",
  units,
});
const section = new ReinforcedConcreteSection({
  name: "RC beam section",
  concreteSection: new RectangularSection({
    width: 300,
    height: 500,
    units,
  }),
  reinforcementBars: [
    new ReinforcementBar({
      id: "bottom-1",
      diameter: 20,
      material: reinforcementMaterial,
      y: 45,
      z: 75,
      units,
    }),
    new ReinforcementBar({
      id: "bottom-2",
      diameter: 20,
      material: reinforcementMaterial,
      y: 45,
      z: 225,
      units,
    }),
  ],
  concreteMaterial,
  reinforcementMaterial,
  units,
});

const analysisResult = new SingleBeamAnalysis().analyze({
  id: "rc-deflection-01",
  units,
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 5000, y: 0 },
  },
  section,
  material: concreteMaterial,
  supports: {
    start: "hinge",
    end: "roller",
  },
  loads: [
    {
      id: "g1",
      loadCaseId: "G1",
      actionType: "G1",
      type: "uniform",
      value: -8,
    },
  ],
  combinations: [
    {
      id: "sle-quasi-permanent",
      limitState: "SLE",
      combinationType: "SLE_QUASI_PERMANENT",
      factors: { G1: 1 },
    },
  ],
  discretization: { elementCount: 10 },
});

const result = new CrackedSectionDeflectionAnalysis().analyze({
  beamId: "rc-deflection-01",
  analysisResult,
  section,
  concreteMaterial,
  reinforcementMaterial,
  serviceability: {
    deflection: {
      creepCoefficient: 2,
    },
  },
});

console.log(result.status);
console.log(result.outputs.combinations);
```

### `masonry-out-of-plane`

Stato: scaffold.

Input minimo:

- `MasonryOutOfPlaneModel` con `id`.
- Campi gia predisposti: `wall`, `restraints`, `macroBlocks`, `actions`.

Output atteso:

- `CalculationResult` placeholder con `status: "not-implemented"`.
- `outputs.analysis` contiene una analisi placeholder.

Unita richieste:

- non c'e ancora un contratto numerico vincolante;
- usare SI esplicito nei sotto-oggetti per preparare la futura implementazione.

Limiti del metodo:

- nessun moltiplicatore di attivazione calcolato;
- nessun template cinematico implementato;
- nessun effetto catene/solai ancora modellato.

Esempio completo:

```js
import {
  MasonryOutOfPlaneApplication,
  MasonryOutOfPlaneModel,
} from "./src/index.js";

const model = new MasonryOutOfPlaneModel({
  id: "wall-oop-01",
  wall: {
    height: 3.2,
    thickness: 0.32,
    units: { force: "kN", length: "m" },
  },
  restraints: {
    base: "hinged",
    top: "free",
  },
  macroBlocks: [
    {
      id: "block-1",
      mechanism: "vertical-bending",
    },
  ],
  actions: {
    seismicAcceleration: 0.18,
  },
});

const result = new MasonryOutOfPlaneApplication().run({ model });

console.log(result.status); // "not-implemented"
console.log(result.outputs.analysis.status);
```

### `micropiles-broms`

Stato: scaffold.

Input minimo:

- `MicropileBromsModel` con `id`.
- Campi gia predisposti: `pile`, `soil`, `boundaryConditions`, `actions`.

Output atteso:

- `CalculationResult` placeholder con `status: "not-implemented"`.
- `outputs.analysis` contiene una analisi placeholder.

Unita richieste:

- non c'e ancora un contratto numerico vincolante;
- usare SI esplicito nei sotto-oggetti.

Limiti del metodo:

- nessun ramo Broms realmente implementato;
- nessuna distinzione corta/lunga, testa libera/incastrata, terreno coesivo/incoerente;
- nessuna verifica strutturale della sezione del micropalo.

Esempio completo:

```js
import {
  MicropileBromsApplication,
  MicropileBromsModel,
} from "./src/index.js";

const model = new MicropileBromsModel({
  id: "micropile-01",
  pile: {
    diameter: 0.18,
    length: 8,
    units: { force: "kN", length: "m" },
  },
  soil: {
    type: "cohesive",
    undrainedShearStrength: 60,
  },
  boundaryConditions: {
    head: "free",
  },
  actions: {
    horizontalLoad: 35,
  },
});

const result = new MicropileBromsApplication().run({ model });

console.log(result.status); // "not-implemented"
console.log(result.outputs.analysis.status);
```

## Preset NTC 2018 disponibili

Il layer `src/norms/ntc2018` contiene:

- calcestruzzo: classi da `C12/15` a `C50/60`, con `fcd`, `fctm`, `Ecm`;
- acciaio per c.a.: preset `B450A`, `B450C`;
- acciaio da carpenteria: preset `S235`, `S275`, `S355`;
- legno: classi massicce `Cxx` e lamellari `GLxxh/GLxxc`;
- muratura esistente: tipologie tabellate, livelli di conoscenza, fattori di confidenza e coefficienti migliorativi;
- azioni NTC 2018: permanenti, variabili, traffico, neve, vento, termiche, accidentali, sismiche;
- combinazioni di carico SLU/SLE;
- cataloghi per carichi di solaio.

## Limiti Generali

- La libreria non e ancora un software normativo completo.
- I moduli `masonry-ring-beams`, `masonry-out-of-plane` e `micropiles-broms` restano placeholder dichiarati; `masonry-piers` e invece operativo per la verifica verticale e per la costruzione dello schema 2D equivalente del singolo maschio.
- Il modulo `masonry-wall-openings` e operativo per le cerchiature con verifica verticale e comportamento laterale pre/post a maschi aggregati; restano escluse le fasce murarie non lineari.
- Il workflow `single-beam-design` resta oggi un solver 2D lineare; il layer FEM contiene anche un primo solver statico non lineare a controllo indiretto di spostamento, usato dal pushover delle cerchiature metalliche.
- Le verifiche acciaio non includono ancora torsione e proprieta efficaci per classe 4.
- I workflow RC non includono ancora momento-curvatura, duttilita e colonna modello.
- Le verifiche legno/XLAM sono solide per i casi coperti dai test, ma richiedono ancora campagne di validazione piu ampie.

## Esempi e Validazione

```bash
npm run example
npm run example:ntc2018
npm run example:applications
npm run example:rc-sections
npm run example:beam-reports
npm run example:masonry-wall-openings:cerchiature
npm run validation
```

Riferimenti metodologici gia presenti:

- `docs/steel-beam-method.md`;
- `docs/reinforced-concrete-sle-method.md`.

## Strategia di crescita

Per mantenere la codebase ordinata:

- mettere in `src/domain` solo entita davvero riusabili tra piu applicazioni;
- mettere in `src/applications/<modulo>` workflow, modelli e verifiche specifiche;
- tenere in `src/norms/ntc2018` preset, coefficienti, cataloghi e factory normative;
- far restituire a ogni applicazione un `CalculationResult` o `VerificationResult`;
- usare `createDefaultApplicationRegistry()` come punto di accesso per CLI, UI, plugin o API.
