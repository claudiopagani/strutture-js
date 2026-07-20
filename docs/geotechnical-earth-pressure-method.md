# Geotechnical Ground Model and Earth-Pressure Method

## Scopo

Il primo nucleo geotecnico di `strutture-js` separa quattro responsabilita:

1. `SoilMaterial` conserva classificazione, pesi di volume e insiemi di
   parametri geotecnici tracciabili;
2. `GroundProfile` descrive una stratigrafia verticale e la falda;
3. i kernel di dominio calcolano tensioni verticali, coefficienti e diagrammi
   di pressione laterale;
4. `GeotechnicalEarthPressureApplication` espone il calcolo con un
   `CalculationResult` serializzabile.

Per le applicazioni 2D, `GroundModel` aggrega materiali, profili,
`GroundSection2D` e `PorePressureField2D`; `GeotechnicalDesignSituation`
seleziona stato, drenaggio e set di parametri senza incorporare regole
normative nel dominio. I contratti e i relativi limiti sono descritti in
[Geotechnical ground model](geotechnical-ground-model.md). Il calcolo delle
spinte continua a consumare `GroundProfile` finche il metodo richiede una
stratigrafia orizzontale 1D.

Il catalogo `strutture-js/catalogs/soil-types` e un catalogo di classificazione
in memoria, non un database applicativo. Non attribuisce valori numerici
predefiniti ai terreni: peso di volume e parametri di resistenza devono essere
forniti e accompagnati da provenienza. Questa scelta evita che una descrizione
litologica generica venga scambiata per una caratterizzazione geotecnica del
sito.

Il catalogo `strutture-js/catalogs/wall-interface-types` classifica invece le
superfici della parete e contiene le raccomandazioni di attrito di interfaccia
della tabella 6.2 di USACE EM 1110-2-2502 (2022). Il valore non dipende dal
solo materiale della parete: dipende dalla combinazione tra materiale,
finitura superficiale e classe di terreno a contatto.

## Contratti dati

### `SoilMaterial`

Un materiale contiene:

- identificazione e classificazione;
- `unitWeight.bulk`, con `saturated` e `dry` opzionali;
- uno o piu `parameterSets` identificati;
- base del valore: `measured`, `derived`, `representative`,
  `characteristic`, `design`, `best-estimate` o `indicative`;
- condizione `drained` oppure `undrained`;
- legge di resistenza e metadati di provenienza;
- eventuale coefficiente a riposo assegnato.

Ogni calcolo seleziona un insieme di parametri. Un insieme `indicative` viene
rifiutato, salvo autorizzazione esplicita `allowIndicativeValues: true`, e in
tal caso il risultato contiene un warning.

### `GroundProfile`

`GroundProfile` usa lo schema serializzabile `ground-profile/v1`. Gli strati
sono contigui e riferiti a quote assolute; l'asse verticale `z` e positivo
verso l'alto. Il profilo puo essere costruito anche da spessori mediante
`GroundProfile.fromThicknesses()`.

La falda supportata e idrostatica, con quota piezometrica e peso di volume
dell'acqua espliciti. Il calcolo usa tensioni efficaci e mantiene separata la
pressione dell'acqua.

### `SoilStructureInterface`

`SoilStructureInterface` usa lo schema serializzabile
`soil-structure-interface/v1` e separa la descrizione della superficie dai
parametri selezionati. Sono disponibili due modelli:

- `assigned-angle`, con `delta` assegnato;
- `soil-friction-ratio`, con `delta/phi` assegnato.

La risoluzione usa il minore angolo di attrito dei terreni interessati e
impone `delta <= phi`. Nei profili stratificati viene quindi adottato un unico
valore governante per la risultante sulla parete. Eventuali leggi variabili
lungo la parete richiederanno un modello distribuito distinto.

Le raccomandazioni del catalogo sono marcate `indicative`, conservano fonte e
classe di terreno e richiedono `allowIndicativeValues: true`. Per muratura,
legno e superfici personalizzate il catalogo non inventa coefficienti: occorre
un valore di progetto esplicito e tracciabile.

### `PressureDiagram2D`

Il diagramma usa lo schema
`geotechnical-pressure-diagram-2d/v1`. Ogni tratto lineare conserva:

- strato, materiale e insieme di parametri;
- quota superiore e inferiore;
- pressione del terreno normale e tangenziale, indipendentemente dalla base
  tensionale;
- componenti in tensioni efficaci oppure in tensioni totali, con le componenti
  non applicabili poste a `null`;
- pressione dell'acqua;
- pressione totale;
- coefficiente e metadati del metodo.

Sono integrati forza, momento e quota di applicazione per unita di lunghezza
della parete. Nel riferimento locale la normale positiva va dal terreno
ritenuto verso la struttura e la tangente positiva e diretta verso il basso
lungo la parete.

## Unita

Ogni input dichiara `{ force, length }`. Le unita interne del modulo sono:

| Grandezza | Unita interna |
| --- | --- |
| lunghezza e quota | `m` |
| forza | `kN` |
| peso di volume | `kN/m3` |
| tensione e pressione | `kN/m2` |
| risultante per unita di parete | `kN/m` |
| momento per unita di parete | `kN*m/m` |
| angolo | `rad` |

`SoilMaterial` accetta gli angoli in `deg` o `rad` e li normalizza in radianti.

## Pressioni statiche

Rankine e i metodi a riposo operano su parete verticale e superficie del
terreno orizzontale. Coulomb ammette una parete e una superficie planari
inclinate nel campo specificato sotto. La tensione verticale efficace
`sigma'_v` deriva dal sovraccarico, dal peso proprio stratificato e dalla
pressione interstiziale idrostatica.

Per Rankine:

```text
Ka = (1 - sin(phi')) / (1 + sin(phi'))
Kp = 1 / Ka

sigma'_h,a = Ka sigma'_v - 2 c' sqrt(Ka)
sigma'_h,p = Kp sigma'_v + 2 c' sqrt(Kp)
```

La pressione attiva negativa viene annullata e il punto di annullamento viene
inserito nel diagramma. Questo rappresenta un taglio della trazione, non un
modello completo di fessura riempita d'acqua; il risultato lo segnala.

Per un insieme di parametri `total-stress-undrained`, Rankine usa `phi_u=0` e
la resistenza non drenata `su`:

```text
sigma_h,a = max(0, sigma_v - 2 su)
sigma_h,p = sigma_v + 2 su
```

La tensione verticale e totale. La pressione interstiziale non viene aggiunta
una seconda volta come componente separata. Un calcolo a riposo non drenato
richiede invece un `K0` totale assegnato: Jaky resta una correlazione in
tensioni efficaci drenate.

Per la spinta a riposo si usa un `K0` assegnato oppure, solo se richiesto, la
correlazione di Jaky per terreno normalmente consolidato:

```text
K0,NC = 1 - sin(phi')
```

Nei profili stratificati la tensione verticale efficace resta cumulativa e il
coefficiente laterale cambia al passaggio di strato. Il diagramma conserva
quindi i salti della pressione orizzontale associati al cambio di parametri.

Per Coulomb il terreno deve essere omogeneo, incoerente e drenato. Posto
`theta = pi/2 + i`, dove `i` e positivo quando la sommita della parete inclina
verso il terreno ritenuto, e posto `beta` positivo per un terreno che sale
allontanandosi dalla parete:

```text
                            sin(theta + phi')^2
Ka = ----------------------------------------------------------------------
     sin(theta)^2 sin(theta - delta)
     [1 + sqrt(sin(phi'+delta) sin(phi'-beta) /
               (sin(theta-delta) sin(theta+beta)))]^2

                            sin(theta - phi')^2
Kp = ----------------------------------------------------------------------
     sin(theta)^2 sin(theta + delta)
     [1 - sqrt(sin(phi'+delta) sin(phi'+beta) /
               (sin(theta+delta) sin(theta+beta)))]^2
```

`Ka` e `Kp` sono riferiti alla trazione risultante sulla parete; le componenti
normale e tangenziale sono ottenute con l'angolo di attrito di interfaccia
`delta`. Per la passiva, il modello piano di Coulomb puo essere non
conservativo in presenza di attrito di parete: l'implementazione impone
`delta <= phi'/3` e restituisce un warning quando `delta > 0`.

I diagrammi Coulomb sono espressi per unita di proiezione verticale. Per una
parete inclinata, il carico lineare sulla lunghezza reale della faccia si
ottiene moltiplicando la pressione del diagramma per `cos(i)`. Le geometrie
inclinate sono limitate a profili senza falda; con parete e superficie
orizzontali la pressione idrostatica resta separata.

La pressione totale normale e sempre la somma della pressione efficace del
terreno e della pressione dell'acqua. Le due componenti restano disponibili
separatamente.

## Mononobe-Okabe

La prima implementazione sismica copre la spinta attiva su parete verticale,
superficie orizzontale, terreno omogeneo, asciutto, incoerente e drenato. Si
assumono uno stato attivo mobilitabile, un cuneo piano e assenza di
liquefazione.

Con la convenzione secondo cui `kv > 0` riduce la gravita efficace:

```text
theta = atan(kh / (1 - kv))

            cos(phi' - theta)^2
KAE = ----------------------------------------------------
      cos(theta) cos(delta + theta)
      [1 + sqrt(sin(phi' + delta) sin(phi' - theta) /
                cos(delta + theta))]^2

PAE = 1/2 gamma H^2 (1 - kv) KAE
```

La soluzione richiede `phi' > theta`. Il metodo determina la risultante, ma
non una distribuzione univoca lungo la parete. Per questo il default e
`distributionModel: "resultant-only"`. Il diagramma triangolare equivalente e
generato solo se richiesto esplicitamente e viene marcato come assunzione.

L'adapter NTC 2018 richiede `amax/g` e `betaM` espliciti e calcola:

```text
kh = betaM (amax/g)
kv = +/- 0.5 kh
```

Restituisce entrambi i segni di `kv`; la scelta del caso rimane esplicita.

## Cuneo pseudo-statico stratificato

Il metodo `trial-wedge-pseudostatic` implementa l'approssimazione USACE a
inclinazione costante per strati orizzontali, estesa con l'equilibrio generale
del cuneo attivo Caltrans per una parete planare inclinata e attritiva. La
superficie del terreno e planare e ogni segmento del cuneo ha la stessa
inclinazione `alpha` della base. Il segmento viene associato al materiale
intercettato dalla sua base; il peso include invece tutti i materiali
sovrastanti nella rispettiva porzione di cuneo. Le separazioni tra segmenti
sono parallele alla parete e le azioni mutue sono assunte normali a tali
separazioni.

In assenza di acqua, posto `lambda = alpha + i`, si definiscono:

```text
Gi = (1-kv) Wi + Vi
Ai = lambda - phi_i
Di = Gi cos(i) + kh Wi sin(i)
Hi = kh Wi cos(i) - Gi sin(i)

Bi = Di tan(Ai) + Hi - c_i Li cos(phi_i) / cos(Ai)

P = sum(Bi) cos(A1) / cos(A1-delta)

Vi = q Delta-x_surface,i
```

Il calcolo campiona gli angoli ammissibili e rifinisce il massimo di
`P`. Nei terreni non drenati usa `phi_u=0` e `c_i=su`; nei terreni
drenati usa `phi'` e `c'`. L'inerzia pseudo-statica e applicata al peso del
terreno, mentre il sovraccarico uniforme e trattato come forza verticale senza
una propria inerzia. Il caso `i=delta=0` ricade nell'espressione stratificata
originaria; con terreno omogeneo e `kh=kv=0` il risultato ricade nel Coulomb
statico con la stessa geometria.

Si tratta di una approssimazione di equilibrio limite, non di una soluzione
generale a superficie curva. Il risultato contiene la risultante, il cuneo
critico, i contributi dei segmenti, la trasformazione della forza di parete e
l'inviluppo numerico; `diagram` e
`applicationElevation` restano `null`, perche il metodo non determina una
distribuzione univoca. Il caso omogeneo, asciutto, incoerente, orizzontale e a
parete liscia riproduce la risultante Mononobe-Okabe entro la tolleranza della
ricerca. L'estensione stratificata inclinata e attritiva e dichiarata come
combinazione metodologica delle due fonti, non come formula chiusa normativa.

## Stabilita globale dei pendii

La verifica di stabilita del pendio e prevista nella geotecnica, ma non dentro
il kernel delle spinte laterali. Sara una famiglia di analisi separata che
riusa `SoilMaterial`, `GroundProfile`, unita e criteri di selezione dei
parametri. La separazione e necessaria perche cambiano:

- geometria, che deve descrivere un profilo 2D del pendio e non una parete;
- incognita, costituita dalla superficie di scorrimento critica;
- risultato principale, costituito dal fattore di sicurezza e dagli equilibri
  delle conciate, non da un diagramma di pressione sulla struttura;
- modelli di falda, carichi, rinforzi e ricerca numerica.

Il futuro contratto dovra quindi ricevere geometria 2D, pressione interstiziale
o superficie piezometrica, carichi e metodo di equilibrio limite esplicito, e
restituire superficie critica, fattore di sicurezza, dettagli delle conciate,
warning e metadati serializzabili. Questo kernel potra poi essere consumato da
workflow di muri, paratie o opere di stabilizzazione senza dipendere da essi.
Non e ancora implementato e non viene esposto uno scaffold operativo.

## API essenziale

```js
import {
  GroundProfile,
  LateralEarthPressureAnalysis,
  SoilMaterial,
} from "strutture-js/domain/geotechnics";
import { createSoilStructureInterfaceFromWallSurface } from
  "strutture-js/catalogs/wall-interface-types";

const units = { force: "kN", length: "m" };
const sand = new SoilMaterial({
  id: "sand",
  name: "Sand",
  unitWeight: { bulk: 18, saturated: 20 },
  parameterSets: [{
    id: "characteristic-drained",
    basis: "characteristic",
    drainage: "drained",
    strength: { frictionAngle: 32, cohesion: 0 },
    provenance: { source: "site-investigation" },
  }],
  angleUnits: "deg",
  units,
});

const profile = GroundProfile.fromThicknesses({
  id: "section-a",
  groundSurfaceElevation: 10,
  materials: [sand],
  layers: [{ id: "sand-layer", thickness: 10, materialId: sand.id }],
  groundwater: {
    model: "hydrostatic",
    waterTableElevation: 4,
    waterUnitWeight: 9.81,
  },
  units,
});

const result = new LateralEarthPressureAnalysis().analyze({
  profile,
  state: "active",
  method: "rankine",
  surcharge: 10,
  units,
});
```

Una superficie di calcestruzzo formato a contatto con sabbia media puo essere
selezionata dal catalogo come raccomandazione indicativa:

```js
const wallInterface = createSoilStructureInterfaceFromWallSurface({
  id: "wall-a-medium-sand",
  wallSurfaceTypeId: "formed-concrete",
  soilInterfaceClassId: "medium-sand",
});

const seismicResult = new LateralEarthPressureAnalysis().analyze({
  profile,
  state: "seismic-active",
  method: "trial-wedge-pseudostatic",
  geometry: {
    wallInclinationFromVertical: 8,
    backfillInclination: 5,
    angleUnits: "deg",
  },
  interface: wallInterface,
  allowIndicativeValues: true,
  seismic: { kh: 0.1, kv: 0 },
  units,
});
```

## Integrazione con elementi strutturali

Il profilo e il diagramma non conoscono muri, paratie, pali o fondazioni. I
futuri workflow strutturali possono consumare gli stessi contratti:

- muri di sostegno: diagrammi e risultanti come azioni, poi verifiche di
  scorrimento, ribaltamento, capacita portante e resistenza strutturale;
- paratie: pressione per quota come carico su un modello trave-terreno, con
  mobilitazione attiva/passiva coerente con gli spostamenti;
- pali: stratigrafia e insiemi di parametri per capacita verticale, risposta
  laterale e curve di interazione;
- fondazioni superficiali: profilo e parametri per capacita portante,
  scorrimento e cedimenti.

Questi workflow non sono implementati da questo modulo. Non devono ricavare
parametri impliciti dal nome del terreno: devono selezionare l'insieme di
parametri appropriato allo stato limite e al modello di drenaggio.

La progressione prevista e il ponte verso modelli a molle e FEM continuo sono
documentati in
[Geotechnical microapps progression](geotechnical-microapps-progression.md).

## Limiti dichiarati

Sono operativi:

- Rankine attiva e passiva stratificata, drenata in tensioni efficaci oppure
  non drenata in tensioni totali;
- spinta a riposo con `K0` assegnato, efficace o totale, oppure Jaky NC
  drenato;
- Coulomb attiva e passiva omogenea per parete e terreno planari, con la
  limitazione passiva `delta <= phi'/3`;
- Mononobe-Okabe attiva omogenea nel perimetro sopra descritto;
- cuneo pseudo-statico stratificato a inclinazione costante per parete
  planare inclinata e attritiva, superficie planare e profilo senza falda;
- interfacce serializzabili e catalogo indicativo dipendente da superficie
  della parete e classe del terreno;
- sovraccarico uniforme per i metodi statici;
- diagrammi e risultanti serializzabili.

Non sono ancora operativi:

- Rankine e pressione a riposo per pareti o superfici inclinate;
- Coulomb per terreno stratificato, coesivo o con falda nelle geometrie
  inclinate;
- Coulomb passiva oltre il limite di attrito di parete e metodi passivi a
  superficie curva o log-spirale;
- Mononobe-Okabe con stratigrafia, falda, coesione o sovraccarico;
- falda, superficie irregolare e distribuzione della pressione nel cuneo
  pseudo-statico stratificato;
- effetti di compattazione, arching, carichi concentrati o geometrie 3D;
- stabilita globale del pendio e ricerca di superfici di scorrimento;
- verifiche di muri, paratie, pali e fondazioni.

I casi fuori dal perimetro di un metodo disponibile restituiscono
`not-supported`.

## Riferimenti

Le fonti primarie e il loro impiego puntuale sono elencati in
[Geotechnical validation sources](../validation/geotechnical-sources.md).
