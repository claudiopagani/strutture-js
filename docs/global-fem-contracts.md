# Contratti FEM globali candidati v0

## Stato, obiettivi e confini

I contratti FEM globali sono un'API sperimentale operativa con
`version: 0`. Rappresentano modello, richiesta di analisi, risultati e
associazioni strutturali senza dipendere dal solver che li produce. La forma
v0 è candidata alla futura v1, ma non è ancora congelata: il confronto con
payload reali potrà richiedere aggiunte o migrazioni documentate.

Questo incremento definisce e valida dati. Non calcola un modello globale,
non esegue verifiche normative e non adatta il formato di alcun software.
Restano validi i confini descritti in [Project Boundaries](project-boundaries.md)
e la stabilità degli import descritta in
[Public API Policy](public-api-policy.md).

Sono inclusi:

- capability esplicite del solver;
- topologia FEM 3D con aste, shell, link, constraint e diaframmi;
- configurazione di analisi statica, modale, spettrale, non lineare e time
  history;
- risultati nodali, di elemento, di sezione, modali e per piano;
- mapping esplicito fra mesh e oggetti strutturali;
- validatori con `errors` e `warnings` strutturati e serializzabili.

Sono esclusi:

- rete, autenticazione, job, persistenza e orchestrazione;
- payload o identificativi riservati a un provider;
- deduzione automatica di setti, impalcati, piani o giunti;
- formule di verifica, gerarchia delle resistenze e coefficienti normativi;
- conversioni implicite fra sistemi di unità.

La fixture `tests/fixtures/globalFemBuildingFixture.js` verifica forma,
serializzazione, riferimenti e coerenza. I suoi numeri sono sintetici e non
costituiscono una validazione numerica di un solver.

## Diagramma dei contratti

```text
FemCapabilitiesContract
        │ abilita tipi di analisi, elementi e output
        ▼
GlobalFemAnalysisContract ──────────────┐
        │ richiede procedure e output   │
        │                               ▼
GlobalFemModelContract ─────────► GlobalFemResultContract
        │ topologia, assi, unità         │ risultati + provenienza
        ▼                                │
FemEntityMappingContract ────────────────┘
        │ semantica strutturale esplicita
        ▼
future applications / verificatori norms
```

`GlobalFemModelContract` non contiene la semantica di una trave, un pilastro o
un setto. `FemEntityMappingContract` associa invece identificativi strutturali
stabili agli elementi della mesh. In questo modo la stessa topologia può
essere usata da applicazioni diverse senza euristiche geometriche.

## Contratti pubblici

### `FemCapabilitiesContract`

Il manifest dichiara sempre un booleano per ogni capacità nota:

- analisi: `linearStatic`, `secondOrder`, `modal`, `responseSpectrum`,
  `nonlinearStatic`, `timeHistory`;
- elementi: `line`, `shell`, `solid`, `link`;
- risultati: spostamenti nodali, reazioni, azioni delle aste, risultanti
  shell, tensioni, deformazioni, modi, section cut, dati per piano e residui
  di equilibrio.

Una capacità `false` produce un warning `FEM_CAPABILITY_UNAVAILABLE`. Il dato
resta valido, ma il consumer non può inventare l'output. Un'analisi che
richiede una capacità `false` è invece errata.

### `GlobalFemModelContract`

Contiene identificativo e hash del modello, unità, riferimento cartesiano
globale destrorso, nodi, materiali e sezioni referenziati, aste, shell,
vincoli, link, constraint, diaframmi, piani, gruppi e section cut.

Ogni asta dichiara due nodi ordinati e una terna locale destrorsa: `localAxes.x`
deve puntare dal primo al secondo nodo. Ogni shell dichiara tre o quattro nodi,
la terna locale e `faceConvention: "positive-local-z"`; l'asse locale z deve
seguire la regola della mano destra applicata all'ordine dei nodi.

Offset, link e piani non ricevono orientamenti predefiniti. Se presenti,
dichiarano sistema di riferimento e assi richiesti dal relativo oggetto.

### `GlobalFemAnalysisContract`

Riferisce esattamente `modelId` e `modelHash` e contiene:

- pattern, casi di carico e combinazioni con riferimenti, stato limite e natura
  espliciti;
- sorgenti di massa, contributi e direzioni;
- eventuali spettri e serie temporali;
- procedure con tipo, output richiesti, modi o passi richiesti;
- impostazioni del secondo ordine;
- ipotesi di rigidezza e eccentricità accidentali.

Gli stati limite del dominio sono categorie generiche (`ultimate`,
`serviceability`, `accidental`, `seismic`, `fatigue`, `other`), non riferimenti
a una norma determinata. La natura della combinazione resta una stringa
esplicita definita dal producer. Coefficienti e regole normative appartengono
agli adapter in `norms` o alle `applications`.

### `GlobalFemResultContract`

Associa ogni risultato a id e hash di modello e analisi e all'id del manifest
delle capability. Registra inoltre solver, versione, stato tecnico,
convergenza, diagnostica, unità e convenzioni dei segni.

Le famiglie di risultato sono array distinti:

- traslazioni e rotazioni nodali nel sistema dichiarato;
- reazioni come azioni del supporto sulla struttura;
- azioni delle aste in assi locali, con `xi`, posizione fisica e lato della
  stazione;
- risultanti shell con posizione geometrica, faccia e componenti locali. Una
  posizione `element-average` dichiara obbligatoriamente metodo, origine e
  numero dei campioni in `location.averaging`, così una media di valori nodali
  smussati non viene presentata come valore al centroide o al punto di
  integrazione;
- tensioni e deformazioni opzionali;
- risultanti di section cut;
- modi con periodo, frequenza, autovalore, forma modale, fattori di
  partecipazione, masse e rapporti di massa partecipante;
- dati di piano/diaframma, inviluppi governanti e residui di equilibrio.

Le famiglie non disponibili sono realmente opzionali: possono essere omesse
quando la relativa capability è `false`. Se presenti devono essere array
validi; se richieste e dichiarate disponibili non possono essere omesse o
vuote.

Gli status tecnici sono `completed`, `completed-with-warnings`, `partial`,
`failed` e `not-supported`. Per gli status diversi da `failed` e
`not-supported`, ogni output richiesto da una procedura e dichiarato
disponibile deve essere presente. Un array vuoto non può fingere una capacità
completata.

### `FemEntityMappingContract`

Mantiene separata la semantica dalla mesh:

- `members`: membro e ruolo (`beam`, `column`, `brace`, `other`) verso aste;
- `walls`: setto verso shell, piani e section cut;
- `slabs`: impalcato verso shell e piano;
- `storeys`: piano verso nodi, diaframmi e mesh;
- `joints`: giunto verso nodo e estremità delle aste.

Con il modello fornito al validatore, ogni asta deve appartenere a un membro,
ogni shell a un solo setto o impalcato e ogni piano deve avere un mapping. Gli
identificativi originari di un provider possono essere conservati in
`metadata`, senza assumere significato nel dominio.

## Unità, assi, segni e identificativi

Ogni modello, analisi e risultato dichiara lo stesso dizionario di unità:

| Chiave | Grandezza |
| --- | --- |
| `length`, `force`, `mass`, `time`, `angle` | grandezze base usate dal contratto |
| `moment`, `stress`, `strain` | azioni e tensori |
| `acceleration`, `frequency` | dati dinamici |
| `lineForce`, `lineMoment` | risultanti membranali e flessionali shell per unità di lunghezza |

I simboli sono stringhe esplicite, per esempio `m`, `kN`, `t`, `s`, `rad`,
`kN*m`, `kN/m^2`, `1`, `m/s^2`, `Hz`, `kN/m` e `kN*m/m`. Token generici come
`SI`, `metric`, `default` o `unknown` sono rifiutati. La v0 conserva i valori
del producer e richiede uguaglianza esatta delle unità fra i contratti; un
adapter che converte unità deve convertire tutti i valori prima della
validazione e registrare la provenienza in `metadata`.

Il sistema globale è cartesiano, destrorso e con rotazioni positive secondo
la mano destra. Nessun asse verticale è implicito. Le terne locali devono
essere complete, unitarie, ortogonali e destrorse.

Le stringhe di `signConventions` sono parte dei dati. La fixture usa:

- `positive-along-referenced-coordinate-axes` per le traslazioni;
- `right-hand-rule-about-positive-axis` per le rotazioni;
- `support-action-on-structure` per le reazioni;
- `cut-action-on-positive-local-face` per le aste;
- `tensor-components-in-element-local-axes-on-declared-face` per le shell;
- `resultant-on-positive-section-cut-face` per i section cut.

Un adapter può usare altri identificativi non ambigui, ma i verificatori
devono riconoscerli o rifiutarli; non devono reinterpretarli silenziosamente.

Gli id sono stringhe stabili e uniche nella propria collezione. Le associazioni
fra contratti usano sia id sia hash per impedire di combinare risultati con una
revisione diversa del modello o dell'analisi.

## Responsabilità

| Componente | Responsabilità |
| --- | --- |
| Solver | Risolvere il problema, produrre dati nelle unità e convenzioni dichiarate, convergenza, residui e provenienza reali |
| Adapter esterno | Tradurre il formato del provider, convertire unità e segni, creare mapping espliciti e chiamare i validatori pubblici |
| `domain/fem` | Definire DTO, invarianti geometriche, riferimenti, serializzazione e coerenza fra contratti |
| `applications` | Estrarre domande di verifica e aggregati strutturali dal modello/mapping/risultato |
| `norms` | Applicare formule, limiti e coefficienti normativi a input già espliciti |
| Consumer | Conservare contratti completi, versione della libreria, warning ed errori; gestire rete, job e persistenza |

## Matrice dati per verifiche future

I dati FEM indicati sono necessari ma non sufficienti: resistenze, armature,
dettagli costruttivi e parametri normativi resteranno nei modelli applicativi e
nelle norme.

| Verifica futura | Dati FEM necessari |
| --- | --- |
| Setti | mapping setto → shell/section cut/piani; assi e facce shell; risultanti `Nx`, `Ny`, `Nxy`, `Mx`, `My`, `Mxy`, `Vx`, `Vy`; posizione; azioni di section cut; combinazione governante |
| Derive e spostamenti globali | nodi e quote di piano; diaframmi; spostamenti/rotazioni nodali; risultati per piano; altezza interpiano; combinazione |
| Regolarità torsionale | mapping piano/diaframma; centri di massa e rigidezza; spostamenti ai bordi; rotazione del diaframma; indicatori torsionali e combinazione |
| Masse partecipanti | sorgente di massa e direzioni; periodi/frequenze; forme modali; fattori e masse partecipanti per direzione |
| Effetti P-Delta | procedura `second-order-static`; ipotesi di rigidezza; masse/carichi gravitazionali; spostamenti; azioni; convergenza e residui |
| Gerarchia trave-pilastro | mapping ruoli dei membri e giunti; estremità delle aste; azioni locali per stazione e combinazione; sezioni/materiali referenziati; capacità da application/norm |
| Taglio nei nodi | nodo del giunto; aste incidenti e lato start/end; assi locali; azioni alle facce del nodo; combinazione; geometria e armature da application |
| Gerarchia a taglio di travi e pilastri | mapping membro; inviluppi di `Vy`/`Vz`, momenti e assiale; stazioni; combinazioni governanti; capacità flessionali/taglio da application/norm |
| Gerarchia a taglio dei setti | mapping setto; section cut; risultanti shell e tagli globali; piano e combinazione; capacità flessionali/taglio da application/norm |

## Esempio ridotto

```js
import {
  createFemCapabilitiesContract,
  createGlobalFemModelContract,
  validateGlobalFemContractSet,
} from "strutture-js/domain/fem";

const capabilities = createFemCapabilitiesContract({
  id: "solver-capabilities",
  solver: { id: "solver", name: "Generic solver", version: "1.2.3" },
  analyses: {
    linearStatic: true,
    secondOrder: false,
    modal: false,
    responseSpectrum: false,
    nonlinearStatic: false,
    timeHistory: false,
  },
  elements: { line: true, shell: false, solid: false, link: false },
  results: {
    nodalDisplacements: true,
    reactions: true,
    lineElementActions: true,
    shellResultants: false,
    stresses: false,
    strains: false,
    modes: false,
    sectionCuts: false,
    storeyResults: false,
    equilibriumResiduals: true,
  },
});

const model = createGlobalFemModelContract({
  id: "model-42",
  hash: "sha256:...",
  units: {
    length: "m", force: "kN", mass: "t", time: "s", angle: "rad",
    moment: "kN*m", stress: "kN/m^2", strain: "1",
    acceleration: "m/s^2", frequency: "Hz",
    lineForce: "kN/m", lineMoment: "kN*m/m",
  },
  globalCoordinateSystem: {
    id: "GLOBAL",
    type: "cartesian",
    handedness: "right",
    verticalAxis: "Z",
    rotationConvention: "right-hand-rule",
    origin: { x: 0, y: 0, z: 0 },
    axes: {
      x: { x: 1, y: 0, z: 0 },
      y: { x: 0, y: 1, z: 0 },
      z: { x: 0, y: 0, z: 1 },
    },
    gravityDirection: { x: 0, y: 0, z: -1 },
  },
  nodes: [], materials: [], sections: [], lineElements: [], shellElements: [],
  supports: [], links: [], constraints: [], diaphragms: [], storeys: [],
  groups: [], sectionCuts: [], metadata: {},
});

// Con i cinque contratti completi:
const validation = validateGlobalFemContractSet({
  capabilities,
  model,
  analysis,
  mapping,
  result,
});

if (!validation.ok) {
  // errors e warnings sono array di { code, path, message }.
  throw new Error(JSON.stringify(validation.errors));
}
```

I factory `create*Contract` aggiungono l'envelope v0 e sollevano un errore se
il DTO non è valido. I validator `validate*Contract` non modificano l'input e
restituiscono `{ ok, value, errors, warnings }`. `value` è una copia plain JSON
quando il payload è serializzabile.

### Livelli di validazione

Un consumer semplificato che non esegue verifiche dipendenti dalla semantica
strutturale può validare separatamente capability, modello, analisi e risultato.
In questo caso `validateGlobalFemResultContract` accetta un contesto privo di
`mapping`; i controlli fra entità FEM e membri, setti, piani o giunti non vengono
eseguiti e non devono essere simulati.

Il flusso completo usa invece `validateGlobalFemContractSet` e richiede sempre
tutti e cinque i contratti, incluso un `FemEntityMappingContract` valido e
completo. L'assenza del mapping è quindi ammessa soltanto nel flusso individuale
ridotto, non è una capability implicita e non indebolisce il validatore
aggregato destinato alle verifiche strutturali avanzate.

## Evoluzione verso v1

La v0 è completamente utilizzabile, ma resta candidata. Prima della v1 è
necessario confrontare almeno:

- nomenclatura e segni delle azioni di estremità delle aste;
- risultanti shell disponibili, punti di integrazione e smoothing;
- rappresentazione di diaphragm constraint, link e offset;
- section cut e loro faccia positiva;
- identificazione di step, modi, combinazioni e inviluppi;
- masse, fattori di partecipazione e normalizzazione delle forme modali;
- diagnostica, residui e hash realmente forniti dai solver.

Le modifiche compatibili possono aggiungere campi opzionali accompagnati da
capability. Una modifica a significato, unità, enum, identificativi o forma
serializzata richiederà un nuovo schema e note di migrazione secondo la
[Public API Policy](public-api-policy.md). `version: 1` verrà introdotto solo
dopo fixture di interoperabilità e regressioni su payload reali anonimizzati.

## Conformità di adapter e solver

Un futuro adapter esterno o solver interno deve:

1. produrre prima il manifest delle capability, usando `false` per ciò che non
   supporta;
2. assegnare id stabili e hash immutabili a modello e analisi;
3. convertire unità e convenzioni prima di creare i DTO;
4. creare associazioni strutturali esplicite, senza euristiche nel dominio;
5. includere posizione, assi, faccia e segni per ogni famiglia di risultato;
6. registrare solver/versione, convergenza, diagnostica e residui reali;
7. eseguire i validator individuali e infine `validateGlobalFemContractSet`;
8. conservare warning, errori e payload completo nel consumer.

L'adapter specifico resta fuori da `strutture-js`. Il futuro solver globale
interno dovrà produrre gli stessi cinque DTO e passare gli stessi validatori,
senza scorciatoie o contratti paralleli.
