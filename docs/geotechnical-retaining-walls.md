# Muri di sostegno geotecnici

## Scopo e confine

`geotechnical-retaining-walls` orchestra modelli geotecnici già pubblici senza
duplicarne le formule. Il perimetro implementato è un'analisi bidimensionale,
per unità di larghezza fuori piano, di muri a mensola o di sezioni generiche.
Comprende:

- geometria parametrica di un muro a mensola in calcestruzzo e geometria
  generica a poligoni;
- peso proprio dei componenti e peso stratificato del terreno sopra il
  tallone;
- sovraccarico sul terrapieno, come azione laterale e, se richiesto, verticale
  sul tallone;
- pressione attiva, a riposo o sismica sul lato trattenuto tramite
  `LateralEarthPressureAnalysis`;
- pressione passiva frontale opzionale, con mobilitazione e motivazione
  esplicite;
- parete inclinata, superficie inclinata e attrito parete-terreno nei campi
  supportati dal kernel delle spinte;
- acqua sui paramenti e sollevamento lineare sotto la base;
- inerzia pseudostatica del muro e del terreno sul tallone;
- equilibrio globale del corpo rigido, scorrimento, ribaltamento, posizione
  della risultante e contatto monolatero sotto la base;
- composizione con la capacità portante delle fondazioni superficiali;
- collegamento di screening alla stabilità globale circolare;
- contratto serializzabile per le successive verifiche strutturali e per un
  futuro assemblaggio FEM.

Il modulo non dimensiona armature e non verifica fusto, mensola di valle,
tallone o chiavi di taglio. Tali verifiche devono consumare le azioni prodotte
dal contratto `structuralCoupling`. Non sono implementati drenaggi discreti,
reti di filtrazione, tiranti, contrafforti, fasi costruttive o contatto FEM non
lineare. Questi limiti non sono presentati come funzionalità disponibili.

## Contratti pubblici

### `RetainingWallModel`

Il modello usa coordinate locali:

- `x` positivo dalla punta verso il tallone e il terreno trattenuto;
- `z` positivo verso l'alto;
- `z = 0` sul piano di contatto della base;
- tutte le forze sono riferite a una larghezza fuori piano unitaria.

`placement.originX` e `placement.baseElevation` collocano il modello nel
sistema globale del `GroundModel`. `base.toeX` e `base.heelX` definiscono il
piano di posa. Ogni componente strutturale contiene un poligono semplice, un
peso di volume e proprietà geometriche calcolate: area, baricentro e peso per
unità di larghezza.

Il costruttore generico accetta componenti poligonali, paramento di monte,
paramento di valle opzionale e punto superiore del tallone. Il generatore
`RetainingWallModel.cantilever(...)` produce base e fusto da:

- lunghezza della punta e del tallone;
- spessore della base;
- altezza del fusto sopra la base;
- spessore inferiore e superiore del fusto;
- inclinazione del paramento di monte dalla verticale;
- peso di volume del calcestruzzo.

La geometria parametrica non rappresenta una verifica strutturale. Il metodo
`toShallowFoundationModel()` genera invece la fondazione continua equivalente
usata dal solver geotecnico.

Schema: `retaining-wall-model/v1`.

### `RetainingWallLoadScenario`

Lo scenario separa le decisioni che non appartengono alla geometria:

- profilo, stato e metodo della spinta sul lato trattenuto;
- interfaccia parete-terreno e relativo set di parametri;
- sovraccarico e pendenza del terrapieno;
- diagramma passivo frontale, fattore di mobilitazione e motivazione;
- modello e riduzione del sollevamento sotto base;
- inclusione del terreno e del sovraccarico sopra il tallone;
- azioni concentrate assegnate;
- profilo di posa, interfaccia di base e richiesta di capacità portante;
- direzione pseudostatica;
- limiti di sicurezza espliciti;
- eventuale richiesta di stabilità globale.

La passiva è disattivata in assenza di `frontSide`. Se è richiesto un fattore
di mobilitazione maggiore di zero, `justification` è obbligatorio. Il fattore
riduce soltanto le componenti di terreno; la pressione dell'acqua non viene
ridotta implicitamente.

Nessun fattore di sicurezza è predefinito. I criteri
`minimumSlidingFactorOfSafety`, `minimumOverturningFactorOfSafety` e
`requireFullBaseContact` sono decisioni esplicite del consumer o di un adapter
normativo.

Schema: `retaining-wall-load-scenario/v1`.

### `RetainingWallAnalysis`

Il risultato ha schema `retaining-wall-analysis-result/v1` e conserva:

- `status`, `summary`, `warnings`, `assumptions` e `metadata`;
- diagrammi e risultati originali dei lati monte e valle;
- elenco completo delle azioni con forza, punto di applicazione e momento;
- risultanti di equilibrio;
- scorrimento, ribaltamento e contatto;
- capacità portante composta;
- stabilità globale richiesta;
- `checks`, `demand`, `capacity` e `utilizationRatio`;
- `structuralCoupling`.

## Azioni e convenzioni di segno

Nell'output delle azioni:

- `force.x > 0` è diretto dalla punta verso il terreno trattenuto;
- `force.z > 0` è diretto verso l'alto;
- il momento positivo è antiorario;
- il momento rispetto alla punta è
  `M_toe = x * Fz - z * Fx`.

Gli `appliedLoads` usano invece un contratto comodo per il consumer:
`horizontalForce` è positivo verso il tallone e `verticalForce` è positivo
verso il basso. Il punto è locale al muro.

### Trasformazione della spinta sul paramento di monte

Sia `i` l'inclinazione del paramento dalla verticale, positiva quando la
sommità si sposta verso il terreno trattenuto. Il diagramma delle spinte usa
una normale positiva dal terreno verso la struttura e una tangente positiva
verso il basso lungo la parete. Le componenti globali sono:

```text
Fx = -N cos(i) - T sin(i)
Fz =  N sin(i) - T cos(i)
```

La trasformazione del lato frontale usa la normale opposta. Componenti
normali, tangenziali e idrauliche mantengono quote di applicazione separate:
in questo modo il momento integrato non viene alterato quando i diagrammi non
sono omotetici.

Per un risultato sismico privo di diagramma, il consumer deve assegnare
`retainedSide.resultantApplicationHeightRatio`. Il solver delle spinte
determina la risultante, ma non inventa una distribuzione o una quota di
applicazione.

## Terreno sopra il tallone

Quando `includeSoilOverHeel` è vero, il modulo costruisce il poligono delimitato
da:

- paramento di monte;
- superficie superiore del tallone;
- superficie del terreno con la pendenza assegnata.

Il poligono è tagliato alle quote degli strati e della falda. Ogni porzione usa
il peso di volume `bulk` sopra falda e `saturated` sotto falda. Se il materiale
non ha un peso saturo, il peso `bulk` è usato con un warning. L'operazione
preserva area e baricentro di ciascuna porzione.

Un sovraccarico uniforme può produrre due effetti distinti:

1. incremento della pressione laterale tramite il solver delle spinte;
2. carico verticale sulla proiezione orizzontale del terreno sopra il tallone.

Il secondo effetto è controllato da `includeSurchargeOverHeel`; non è applicata
inerzia automatica al sovraccarico nel caso pseudostatico.

## Acqua e sollevamento

`baseUplift.model = "linear-hydrostatic"` ricava una pressione alla punta dal
profilo frontale, o dal profilo di fondazione quando il lato frontale non è
presente, e una pressione al tallone dal profilo trattenuto. Con larghezza
`B`, pressioni `u_t` e `u_h` e fattore esplicito `r`:

```text
U = r B (u_t + u_h) / 2
x_U = B (u_t + 2 u_h) / [3 (u_t + u_h)]
```

`x_U` è misurata dalla punta. Il fattore modifica la forza ma non sposta il
baricentro della distribuzione lineare. `model = "none"` disattiva il
sollevamento; in presenza di falda senza motivazione il risultato emette un
warning.

La risultante e il momento di uplift sono già compresi nello stato d'azione
trasmesso alla fondazione superficiale. Per questo il relativo solver è
chiamato con
`baseUpliftTreatment = "included-in-action-resultant"`: la falda continua a
modificare tensioni efficaci e pesi di volume, ma non viene sottratta una
seconda volta alla risultante verticale.

## Equilibrio, contatto e verifiche locali

La somma delle azioni fornisce `Fx`, `Fz` e `M_toe`. Se
`V = -Fz > 0`, la distanza della risultante verticale dalla punta è:

```text
x_R = -M_toe / V
```

La distribuzione di contatto è calcolata da
`RectangularFootingContactAnalysis` su una striscia larga un metro. Il ramo
monolatero distingue contatto pieno, contatto parziale e assenza di equilibrio
compressivo; non forza tensioni di trazione terreno-fondazione.

Il ribaltamento separa, rispetto alla punta, i contributi positivi e negativi:

```text
FS_overturning = sum(M_resisting) / sum(M_overturning)
```

Lo scorrimento nella direzione dal terreno trattenuto verso la punta riporta:

- domanda orizzontale lorda;
- azioni esterne opposte, inclusa l'eventuale passiva mobilitata;
- domanda netta;
- resistenza d'interfaccia alla base;
- rapporto domanda netta/resistenza di base;
- fattore di sicurezza lordo
  `(R_base + H_opposing) / H_driving`.

La resistenza di base riusa `calculateShallowFoundationSlidingResistance` con
l'angolo o il rapporto di attrito dell'interfaccia, le adesioni esplicitamente
assegnate e la risultante verticale già depurata dall'uplift.

## Capacità portante

Se `foundation.bearing.enabled` è vero, l'analisi genera:

- una `ShallowFoundationModel` continua della stessa larghezza della base;
- una `ShallowFoundationActionState` per unità di lunghezza;
- una situazione di progetto derivata sul profilo di posa;
- la chiamata a `ShallowFoundationUltimateLimitStateAnalysis`.

Il profilo di posa è obbligatorio e distinto dal profilo trattenuto: usare la
superficie alta del terrapieno per l'incasso della fondazione produrrebbe un
significato fisico errato. La situazione derivata conserva le selezioni per
materiale e interfaccia, mentre la selezione per strato del profilo di posa è
fornita da `foundation.parameterSelection.byLayer`.

Il solver di capacità portante corrente è statico. Se la capacità portante è
richiesta in una situazione pseudostatica, il risultato accoppiato resta
`not-supported`; l'equilibrio locale del muro viene comunque restituito.

## Stabilità globale

La stabilità globale non è dedotta dai fattori locali. Quando
`globalStability.enabled` è vero, il modulo richiama
`CircularSlopeStabilityAnalysis` con l'input assegnato.

Nel collegamento corrente il peso proprio strutturale può essere trasformato
in un sovraccarico verticale uniforme sulla base. Il risultato dichiara
`fidelity = "screening-equivalent-surcharge"`: geometria del muro, forze di
contatto muro-terreno e rigidezza strutturale non diventano elementi della
sezione. Il collegamento pseudostatico è `not-supported`, perché un
sovraccarico solo verticale non rappresenterebbe l'inerzia del muro.

Una verifica completa opera-terreno richiederà il modello FEM totale; il
risultato di screening non deve essere rinominato o interpretato come tale.

## Pseudostatica

In una `GeotechnicalDesignSituation` pseudostatica:

- il lato trattenuto deve usare `state = "seismic-active"`;
- `seismicDirection` è obbligatoria;
- la spinta usa Mononobe-Okabe nel campo omogeneo supportato o il cuneo
  stratificato del modulo delle spinte;
- per ogni peso strutturale e porzione di terreno sopra il tallone sono
  applicate `kh W` orizzontale e `kv W` verticale;
- `kv > 0` produce un'inerzia verso l'alto, coerente con il fattore di gravità
  efficace `1 - kv`.

Il calcolo è statico equivalente. Non determina spostamenti permanenti,
risposta dinamica, liquefazione o incremento di pressione interstiziale.

## Collegamento strutturale e FEM

`structuralCoupling` espone:

- diagramma sul paramento di monte e, se presente, sul lato frontale;
- tutte le azioni rigide con punti e segni;
- risultante al piano di posa;
- distribuzione di contatto monolatera;
- capacità geotecnica della fondazione;
- convenzioni necessarie a trasformare il diagramma in carichi di elemento.

Questo contratto consente a una microapp strutturale di costruire azioni su
fusto, punta e tallone senza importare dettagli interni del solver geotecnico.
Per il FEM totale, lo stesso diagramma potrà diventare un carico iniziale o un
limite di interfaccia, ma l'attivazione dipendente dallo spostamento, il
contatto con apertura/scorrimento e il trasferimento continuo-struttura non
sono implementati in questo modulo.

## Esempio minimo

```js
import { GeotechnicalRetainingWallApplication } from
  "strutture-js/applications/geotechnical-retaining-walls";
import {
  RetainingWallLoadScenario,
  RetainingWallModel,
} from "strutture-js/domain/geotechnics";

const units = { force: "kN", length: "m" };
const wall = RetainingWallModel.cantilever({
  id: "wall-1",
  geometry: {
    toeLength: 1,
    heelLength: 2,
    baseThickness: 0.5,
    stemHeight: 4,
    stemBaseThickness: 0.4,
    stemTopThickness: 0.2,
  },
  concreteUnitWeight: 25,
  placement: { baseElevation: 0 },
  units,
});
const scenario = new RetainingWallLoadScenario({
  id: "persistent",
  retainedSide: {
    profileId: "retained-profile",
    state: "active",
    method: "rankine",
  },
  foundation: {
    profileId: "bearing-profile",
    baseInterface,
    bearing: { enabled: true, selection: "minimum" },
  },
  units,
});
const result = new GeotechnicalRetainingWallApplication().run({
  groundModel,
  designSituation,
  wall,
  scenario,
  units,
});
```

L'esempio eseguibile completo è in
`examples/geotechnical-retaining-wall.js`.

## Fonti e validazione

Le fonti primarie sono:

- USACE EM 1110-2-2502 (1989), capitoli 3 e 4, per pressioni limite,
  composizione delle forze, momenti rispetto alla punta, posizione della
  risultante, scorrimento, ribaltamento e portanza;
- USACE EM 1110-2-2502 (2022), performance failure modes SF-1–SF-4 e valori
  d'interfaccia della tabella 6.2;
- le fonti specifiche già dichiarate dai moduli delle spinte, fondazioni
  superficiali e stabilità dei pendii.

`validation/geotechnicalRetainingWallValidationCampaign.js` controlla con
aritmetica indipendente:

1. spinta Rankine, quota della risultante, pesi e resistenza di base di un muro
   asciutto;
2. forza e baricentro di un sollevamento lineare con carichi idraulici diversi;
3. componenti inerziali pseudostatiche assegnate al peso della base.

Le regressioni aggiuntive coprono serializzazione, unità, parete inclinata,
interfaccia per materiale, passiva mobilitata, acqua, sisma e prevenzione della
doppia sottrazione dell'uplift.
