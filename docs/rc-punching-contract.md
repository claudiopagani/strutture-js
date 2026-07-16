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

- pilastri interni, di bordo e d'angolo;
- pilastri rettangolari; i pilastri circolari esterni richiedono perimetri
  espliciti;
- soletta piana a spessore costante;
- assenza di aperture, travi e capitelli;
- perimetri normativi generati dal motore oppure perimetri espliciti a segmenti;
- domanda ottenuta dalla reazione, dalla reazione meno il carico racchiuso o
  da una forza di punzonamento gia determinata;
- stati ULS con fattore di concentrazione `beta` o `betaE` assegnato,
  semplificato da profilo o calcolato dalla risultante `Fz`, `Mx`, `My`;
- EN 1992-1-1:2004+A1:2014, inclusi il controllo al supporto e a `u1`;
- EN 1992-1-1:2023, controllo a `b0.5`;
- armatura verticale a punzonamento costituita da pioli o staffe, inclusi
  resistenza nella zona armata, resistenza massima, dettagli geometrici e
  perimetro esterno.

Non implementa ancora:

- classificazione automatica della posizione del supporto;
- pareti e teste di parete;
- aperture, travi, capitelli, drop panel e spessore variabile;
- distribuzioni tangenziali ricavate da tensioni FEM nodali;
- armatura inclinata, barre piegate e coefficienti proprietari di sistema;
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
`interior`, `edge` o `corner`. La classificazione e deliberatamente assegnata,
non dedotta dalla mesh.

Per i perimetri generati di bordo e d'angolo vale una convenzione geometrica
canonica. Il bordo libero coincide con la faccia `xMin` del supporto e della
soletta; nel nodo d'angolo anche le facce `yMin` coincidono. Gli assi `+X` e
`+Y` puntano quindi verso l'interno della soletta. Il boundary deve essere un
rettangolo allineato alla terna locale e l'impronta un rettangolo senza
rotazione. Un consumer che parte da coordinate globali puo scegliere la terna
locale e trasformare geometria e azioni prima di costruire la connessione.

Il generatore controlla inoltre lo spazio disponibile fino al bordo. Nei nodi
esterni, i casi allungati oltre i limiti geometrici gestiti dal kernel, le
rotazioni e i contorni generali restituiscono `not-supported`: possono essere
rappresentati con un perimetro esplicito, ma non vengono approssimati dal
generatore.

`reinforcement.flexuralTension` contiene i rapporti geometrici efficaci e le
profondita efficaci nelle due direzioni locali. I rapporti devono descrivere
l'armatura tesa aderente nella fascia richiesta dalla norma. In questa prima
versione il campo e assunto uniforme; un futuro preprocessore potra ricavare
gli stessi valori da barre e fasce esplicite.

L'armatura a punzonamento opzionale usa un layout esplicito e indipendente da
cataloghi di prodotto:

```js
punching: {
  present: true,
  system: "studs", // oppure "links"
  orientation: "vertical",
  steel: { fywk: 500e3, gammaS: 1.15 },
  layout: {
    legDiameter: 0.012,
    legArea: 0.000113,
    areaPerPerimeter: 0.0015,
    radialSpacing: 0.15,
    tangentialSpacing: 0.20,
    firstPerimeterOffset: 0.10,
    perimeterCount: 6,
  },
}
```

`areaPerPerimeter` e l'area totale `Asw` di una corona richiesta dalla
formula 2004. `legArea` e `tangentialSpacing` definiscono invece `rhoW` nel
metodo 2023. Il motore non converte implicitamente un modello nell'altro.
`fywd` puo essere assegnato direttamente oppure ricavato da `fywk/gammaS`.

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
  punchingDemand: {
    supportReaction: 850,
    lineOfAction: { x: 0.047, y: 0.141 },
    enclosedLoadByPerimeter: {
      "basic-control": 35,
    },
    source: { method: "tributary-load-balance" },
  },
  source: { method: "manual" },
});
```

`fz`, `mx` e `my` sono firmati secondo la terna destrorsa. Il futuro modulo
normativo stabilira come trasformare questi componenti nella domanda di
progetto e non deve perdere i segni originali.

`punchingDemand` e facoltativo e distingue esplicitamente grandezze che non
sono intercambiabili:

- `supportReaction`: modulo della reazione del supporto;
- `enclosedLoadByPerimeter`: carico verticale racchiuso, indicizzato con
  `support-face` o `basic-control`, che viene sottratto alla reazione;
- `punchingForce`: forza di punzonamento gia risolta e comune ai perimetri;
- `punchingForceByPerimeter`: forza gia risolta per ciascun ruolo;
- `lineOfAction`: punto nel piano locale attraversato dalla risultante
  verticale; se omesso e `Fz` e diverso da zero, il motore usa
  `x = xRef - My/Fz` e `y = yRef + Mx/Fz`.

La precedenza e: forza assegnata al ruolo, forza assegnata globale, reazione
meno carico racchiuso. In assenza di `punchingDemand`, il kernel usa
`abs(components.fz)` e conserva comunque il segno originario in
`sourceActions`. Tutte le forze sono normalizzate nelle unita dello stato.

## Perimetri di controllo

La richiesta accetta due modalita:

```js
perimeterDefinition: { method: "generated" }
```

oppure:

```js
perimeterDefinition: {
  method: "explicit",
  perimeters: [supportFacePerimeter, basicControlPerimeter],
}
```

Ogni `PunchingControlPerimeter` dichiara `codeId`, `position`, `role`,
`offset`, unita e uno o piu componenti. Un componente e una curva aperta o
chiusa composta da segmenti consecutivi `line` e `arc`. Il motore ricalcola
continuita, lunghezza totale e baricentro lineare; non accetta una lunghezza
scalare non accompagnata dalla geometria. I due ruoli base richiesti dal
kernel sono `support-face` e `basic-control`, con offset rispettivamente nullo e pari
a `2d` per il 2004 oppure `dv/2` per il 2023.
Con armatura il generatore aggiunge `outer-control`: a `1.5d` dall'ultima
corona nel metodo 2004 e a `dv/2` dall'ultima corona nel metodo 2023. In
modalita esplicita il consumer deve fornire anche questo perimetro con l'offset
coerente col layout.
Gli angoli `startAngle` e `sweepAngle` degli archi sono espressi in radianti.

Il perimetro esplicito e il punto di estensione per un futuro motore geometrico
capace di trattare aperture, contorni non rettangolari e intersezioni. Non
rende tuttavia disponibili tali verifiche nel kernel attuale: aperture,
travi e capitelli restano esclusi.

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

In pratica il futuro workflow potra fornire nello stesso DTO una
`punchingForceByPerimeter` ottenuta dall'integrazione FEM e una
`perimeterDefinition` esplicita ottenuta dal motore geometrico. L'app singola
puo invece usare la geometria generata e una reazione assegnata: il kernel di
verifica rimane lo stesso e non dipende dalla mesh.

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

Nel metodo 2004 il profilo usa i fattori semplificati `beta` associati alla
posizione `interior`, `edge` e `corner`. Nel metodo 2023 il profilo assegna il
valore interno, mentre per bordo e angolo `betaE` deve essere fornito
esplicitamente oppure calcolato automaticamente.

Senza profilo, per la prima generazione si assegnano `gammaC`, `alphaCc`,
`cRdc`, `k1` e `sigmaCp: 0`; per la seconda si assegna `gammaV`. Se `beta` o
`betaE` non sono presenti, il motore usa automaticamente la linea d'azione.
`concentrationMethod: "automatic"` forza tale scelta anche in presenza di un
profilo; `betaByState` e `betaEByState` restano disponibili per risultati FEM
o valutazioni esterne gia consolidate.

Il calcolo automatico 2004 copre pilastri interni rettangolari e circolari e,
nella geometria canonica, eccentricita dirette verso l'interno per bordo e
angolo. Per eccentricita dirette verso un bordo libero il metodo 2004 richiede
un `beta` esplicito. Il metodo 2023 applica la definizione di `betaE` della
Tabella 8.3 a pilastri interni, di bordo e d'angolo, usando baricentro e
ingombri del perimetro attivo.

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
Le regressioni aggiuntive coprono le equazioni di `beta`, `betaE`, la
resistenza dell'armatura verticale, il limite massimo e il perimetro esterno.

I benchmark automatici e le verifiche geometriche per bordo e angolo sono
descritti in `validation/reinforced-concrete-punching-sources.md`. La
validazione copre solo il campo dichiarato e non si estende alle configurazioni
escluse.

Per confrontare le due generazioni si costruiscono due richieste con la stessa
connessione e gli stessi stati di azione, cambiando soltanto `code`. I
risultati rimarranno separati e tracciabili; non verra creato un metodo ibrido
che mescoli formule o perimetri delle due edizioni.

## Versionamento

Gli identificativi iniziali sono:

```text
rc-punching-connection/v0
rc-punching-action-state/v0
rc-punching-control-perimeter/v0
rc-punching-verification-request/v0
```

Il suffisso `v0` segnala che il contratto precede la prima implementazione
normativa e puo evolvere durante la serie `0.x` secondo la policy delle API
pubbliche.
