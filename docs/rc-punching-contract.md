# Contratto del nodo soletta-supporto per il punzonamento

## Stato e campo di applicazione

Questo documento descrive il primo contratto pubblico per rappresentare un
nodo locale soletta-supporto e le azioni trasferite utilizzabili da una futura
verifica a punzonamento.

Lo schema `v0` implementa:

- geometria piana della soletta, aperture e impronta del supporto;
- terna locale tridimensionale associata al nodo;
- stati di azione assegnati `Fz`, `Mx`, `My`;
- riduzione delle azioni verticali a un punto comune;
- equilibrio fra azioni esercitate sul nodo da elementi diversi dalla soletta.

Il primo kernel normativo implementa inoltre, tramite `verifyPunching`:

- pilastro interno rettangolare o circolare;
- soletta piana a spessore costante;
- assenza di aperture, travi, capitelli e armatura a punzonamento;
- stati ULS con fattore di concentrazione `beta` o `betaE` assegnato;
- EN 1992-1-1:2004+A1:2014, inclusi il controllo al supporto e a `u1`;
- EN 1992-1-1:2023, resistenza senza armatura a punzonamento a `b0.5`.

Non implementa ancora:

- classificazione geometrica automatica centrale, di bordo o d'angolo;
- pilastri di bordo e d'angolo, pareti e teste di parete;
- aperture, travi, capitelli, drop panel e spessore variabile;
- calcolo dei coefficienti di eccentricita o distribuzioni tangenziali;
- progetto o verifica dell'armatura a punzonamento;
- estrazione automatica di azioni da un modello FEM.

Queste capacita non devono essere presentate da un consumer come disponibili.

La connessione e gli stati di azione non contengono una norma: rappresentano
lo stesso oggetto fisico e la stessa domanda indipendentemente dal metodo di
verifica. La norma e un parametro obbligatorio della richiesta di verifica.

## Unita e coordinate

Ogni costruttore richiede il sistema esplicito `{ force, length }`. Gli oggetti
normalizzano internamente in `N` e `mm` e conservano il sistema sorgente nei
metadata.

La geometria piana e espressa nella terna locale della connessione. La terna e
definita da:

```js
localFrame: {
  origin: { x, y, z },
  xAxis: { x, y, z },
  yAxis: { x, y, z },
  zAxis: { x, y, z }
}
```

Gli assi devono essere unitari, ortogonali e destrorsi. `zAxis` puo essere
omesso ed e ricavato come `xAxis x yAxis`.

I contorni della soletta, delle aperture e delle impronte poligonali sono
anelli aperti: l'ultimo punto non deve ripetere il primo. Il modello accetta
anche un anello chiuso in input e rimuove la ripetizione finale. In questa fase
controlla soltanto finitezza e area non nulla; validazione topologica,
intersezioni e operazioni sui perimetri appartengono alla futura geometria di
verifica.

## Connessione

Esempio minimo:

```js
const connection = new PunchingConnectionModel({
  id: "C1-L2",
  units: { force: "kN", length: "m" },
  slab: {
    thickness: 0.25,
    boundary: [
      { x: -3, y: -3 },
      { x: 3, y: -3 },
      { x: 3, y: 3 },
      { x: -3, y: 3 },
    ],
    openings: [],
  },
  support: {
    id: "C1",
    kind: "column",
    position: "interior",
    footprint: {
      shape: "rectangle",
      center: { x: 0, y: 0 },
      sizeX: 0.4,
      sizeY: 0.5,
      rotation: 0,
    },
    memberIdsAbove: ["C1-L2-L3"],
    memberIdsBelow: ["C1-L1-L2"],
  },
  materials: {
    concrete: { fck: 30e3 },
    concreteAggregate: { lowerSize: 0.016 },
  },
  reinforcement: {
    flexuralTension: {
      x: { effectiveDepth: 0.21, ratio: 0.008 },
      y: { effectiveDepth: 0.20, ratio: 0.007 },
    },
    punching: { present: false },
  },
});
```

Le forme iniziali dell'impronta sono `circle`, `rectangle` e `polygon`.
`memberIdsAbove` e `memberIdsBelow` sono riferimenti serializzabili: non
determinano da soli la domanda di punzonamento.

`support.position` e obbligatorio per il kernel corrente e deve valere
`interior`. La classificazione e deliberatamente assegnata, non dedotta dalla
mesh. Il verificatore esegue anche un controllo conservativo che il perimetro
normativo resti entro il bordo della soletta.

`reinforcement.flexuralTension` contiene i rapporti geometrici efficaci e le
profondita efficaci nelle due direzioni locali. I rapporti devono descrivere
l'armatura tesa aderente nella fascia richiesta dalla norma. In questa prima
versione il campo e assunto uniforme; un futuro preprocessore potra ricavare
gli stessi valori da barre e fasce esplicite.

Per il metodo 2023 `materials.concreteAggregate.lowerSize` e la dimensione
inferiore `D_lower` dell'aggregato. Le lunghezze e le tensioni sono espresse
nel sistema di unita esplicito della connessione e normalizzate in `mm` e
`N/mm2`.

## Stato di azione assegnato

`PunchingActionState` rappresenta l'azione esercitata **sulla soletta** nella
terna locale della connessione e ridotta al `referencePoint` dichiarato:

```js
const state = new PunchingActionState({
  id: "ULS-01",
  connectionId: "C1-L2",
  localFrameId: "C1-L2:local-frame",
  combinationType: "ULS",
  units: { force: "kN", length: "m" },
  referencePoint: { x: 0, y: 0, z: 0 },
  components: {
    fz: 850,
    mx: 120,
    my: -40,
  },
  source: { method: "manual" },
});
```

`fz`, `mx` e `my` sono firmati secondo la terna destrorsa. Il futuro modulo
normativo stabilira come trasformare questi componenti nella domanda di
progetto e non deve perdere i segni originali.

## Equilibrio del nodo

`resolvePunchingTransferFromJointActions` riceve contributi che rappresentano
azioni esercitate **sul nodo** da entita diverse dalla soletta, per esempio le
azioni terminali dei pilastri superiore e inferiore. Tutti i contributi devono
essere gia trasformati nella stessa terna locale e con questa convenzione.

Il risolutore:

1. normalizza le unita;
2. riduce ogni forza verticale e i relativi momenti al punto comune;
3. somma i contributi non appartenenti alla soletta;
4. restituisce l'azione uguale esercitata dal nodo sulla soletta;
5. registra il termine opposto esercitato dalla soletta sul nodo e il residuo
   di equilibrio nullo per costruzione.

Per una forza `Fz` applicata in `(x, y)` e ridotta in `(x0, y0)`:

```text
Mx,0 = Mx + (y - y0) Fz
My,0 = My - (x - x0) Fz
```

Le azioni terminali restituite da un FEM possono adottare il verso opposto,
ossia azioni del nodo sull'elemento. L'adapter del consumer deve convertirle
prima di chiamare il risolutore. Lato, quota o nome del pilastro non vengono
usati per correggere implicitamente il segno.

## Compatibilita futura con il FEM

Un futuro estrattore FEM dovra produrre lo stesso `PunchingActionState`,
indicando `source.method = "integrated-contour"` e conservando almeno:

- contorno o contorni di estrazione;
- carichi racchiusi sottratti o aggiunti;
- residuo di equilibrio;
- dimensione caratteristica della mesh;
- confronto tra contorni o raffinamenti.

Il contorno di estrazione FEM non coincide necessariamente con un perimetro di
controllo normativo. La trasformazione fra domanda globale e verifica resta
responsabilita del successivo workflow normativo.

## Selezione della norma

`PunchingVerificationRequest` associa una connessione e uno o piu stati di
azione a una singola selezione normativa. Gli identificativi iniziali sono:

```text
EN1992_1_1_2004_A1_2014
EN1992_1_1_2023
```

Esempio:

```js
const request = new PunchingVerificationRequest({
  id: "C1-L2-ULS-EC2-2023",
  connection,
  actionStates: [state],
  code: {
    id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
    nationalAnnex: null,
    parameterProfile: "EN_RECOMMENDED",
    parameters: {
      betaEByState: { "ULS-01": 1.15 },
    },
  },
});
```

`nationalAnnex`, `parameterProfile` e `parameters` restano distinti
dall'edizione della norma. Il contratto non assume silenziosamente
un'Appendice Nazionale o i valori raccomandati. Il profilo
`EN_RECOMMENDED` deve essere selezionato esplicitamente; in alternativa si
assegnano i coefficienti in `parameters`. Se mancano parametri necessari, il
verificatore restituisce `not-supported` senza eseguire controlli normativi.

Senza profilo, per la prima generazione si assegnano `gammaC`, `alphaCc`,
`cRdc`, `k1`, `sigmaCp: 0` e `beta` (oppure `betaByState`); per la seconda
si assegnano `gammaV` e `betaE` (oppure `betaEByState`). Il motore conserva
`Mx` e `My`, ma non ricava ancora il fattore di concentrazione dai momenti:
il risultato segnala esplicitamente questa responsabilita dell'input.

Uso del verificatore:

```js
const result = verifyPunching(request);
```

Il risultato e serializzabile e contiene `status`, `outputs`, `checks`,
`warnings`, `assumptions`, `metadata`, `demand`, `capacity` e
`utilizationRatio`. Un superamento della resistenza senza armatura produce
`not-verified`; una configurazione non implementata produce `not-supported`.

## Fonti e validazione

Le formule 2004 sono controllate sul caso 3.4.10 di *Worked Examples to
Eurocode 2* della European Concrete Platform. Le formule 2023 e il relativo
caso numerico sono controllati su Muttoni et al., *A Mechanical Approach for
the Punching Shear Provisions in the Second Generation of Eurocode 2*,
Hormigon y Acero 74 (2023), DOI `10.33586/hya.2022.3091`.

I benchmark automatici sono descritti in
`validation/reinforced-concrete-punching-sources.md`. La validazione copre
solo il campo dichiarato e non si estende alle configurazioni escluse.

Per confrontare le due generazioni si costruiscono due richieste con la stessa
connessione e gli stessi stati di azione, cambiando soltanto `code`. I
risultati rimarranno separati e tracciabili; non verra creato un metodo ibrido
che mescoli formule o perimetri delle due edizioni.

## Versionamento

Gli identificativi iniziali sono:

```text
rc-punching-connection/v0
rc-punching-action-state/v0
rc-punching-verification-request/v0
```

Il suffisso `v0` segnala che il contratto precede la prima implementazione
normativa e puo evolvere durante la serie `0.x` secondo la policy delle API
pubbliche.
