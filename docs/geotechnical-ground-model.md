# Modello geotecnico condiviso

## Scopo e stato

Questo documento descrive i contratti di dominio che rappresentano il sito e
la situazione di calcolo comune alle applicazioni geotecniche. I contratti sono
implementati ed esportati da `strutture-js/domain/geotechnics`:

- `SoilMaterial`: materiale e set alternativi di parametri;
- `GroundProfile`: stratigrafia verticale 1D a strati orizzontali;
- `GroundSection2D`: superficie topografica e zone materiali in una sezione;
- `PorePressureField2D`: campo bidimensionale assegnato di pressione interstiziale;
- `GroundModel`: aggregatore coerente di materiali e rappresentazioni spaziali;
- `GeotechnicalDesignSituation`: scelta tracciabile dei parametri e delle
  condizioni da usare in uno specifico calcolo.

Questi oggetti rappresentano dati e scelte di progetto. Non eseguono da soli
verifiche di stabilità, capacità portante, cedimento o interazione
terreno-struttura. I relativi workflow applicativi sono tappe distinte.

L'impostazione segue il concetto di ground model descritto dal JRC per la
seconda generazione dell'Eurocodice 7: una rappresentazione specifica del sito
della disposizione e del carattere del terreno e delle acque sotterranee,
costruita con informazioni geologiche e geotecniche e rappresentabile tramite
mappe e sezioni. Il riferimento concettuale non trasforma questi DTO in una
implementazione normativa dell'Eurocodice 7.

Fonte principale:
[JRC, Assembling the Ground Model and the Derived Values](https://eurocodes.jrc.ec.europa.eu/publications/assembling-ground-model-and-derived-values).

## Separazione delle responsabilità

Il modello distingue quattro piani che non devono essere confusi:

| Piano | Oggetto | Responsabilità |
| --- | --- | --- |
| materiale | `SoilMaterial` | Identità, classificazione, pesi di volume e set di parametri con provenienza, base e drenaggio. |
| geometria del sito | `GroundProfile`, `GroundSection2D` | Posizione dei materiali nello spazio. |
| stato idraulico assegnato | `PorePressureField2D` | Pressione interstiziale o superficie freatica per una condizione nota. |
| scelta di calcolo | `GeotechnicalDesignSituation` | Situazione, stato limite, drenaggio, set di parametri, campo idraulico, fase e contesto normativo. |

`GroundModel` collega i primi tre piani senza incorporare combinazioni di
carico, coefficienti parziali o geometrie di opere. Una fondazione, un muro o
una paratia restano oggetti dell'applicazione che li analizza.

Questa separazione consente di usare lo stesso modello del sito in più
microapp, evitando di duplicare terreno, falda e provenienza dei parametri.

## Unità e convenzioni geometriche

Tutti i costruttori richiedono unità esplicite `{ force, length }`. I valori
sono normalizzati internamente nel sistema geotecnico `{ force: "kN",
length: "m" }`. Ne derivano:

- tensioni e pressioni in `kN/m²`;
- pesi di volume in `kN/m³`;
- coordinate ed elevazioni in `m`;
- angoli interni in radianti dove appartengono a `SoilMaterial`.

Per le sezioni 2D:

- `x` è orizzontale e positivo verso destra;
- `z` è verticale e positivo verso l'alto;
- le coordinate sono riferite a un datum opzionale dichiarato nei metadati;
- i metodi di query ricevono sempre coordinate già espresse nelle unità
  interne. La conversione automatica avviene all'ingresso dei costruttori, non
  a ogni query.

La pressione interstiziale usa segno positivo a compressione.

## `SoilMaterial`

`SoilMaterial` resta la libreria dei materiali del modello. Un materiale può
contenere più `parameterSets`, per esempio valori caratteristici drenati,
valori di progetto drenati e resistenza non drenata. Ogni set dichiara:

- `id` stabile;
- `basis`: misurato, derivato, rappresentativo, caratteristico, di progetto,
  best estimate o indicativo;
- `drainage`: drenato o non drenato;
- modello di resistenza;
- provenienza e metadati.

Il catalogo `strutture-js/catalogs/soil-types` fornisce una tassonomia di tipi
di terreno, non valori meccanici sito-specifici. I valori numerici devono
essere inseriti esplicitamente e accompagnati dalla loro provenienza. Questa
regola permette sia la scelta da catalogo sia la definizione manuale senza
far passare intervalli indicativi per dati di progetto.

Il modello contiene inoltre `deformationParameterSets` distinti dai set
resistenti. I blocchi implementati sono CPT per Schmertmann, modulo vincolato e
mezzo isotropo elastico. Ogni blocco dichiara base, drenaggio, componente del
cedimento, tipo di modulo, intervalli di tensione/deformazione quando noti e
una fonte obbligatoria. Sono consumati dalla microapp delle fondazioni
superficiali senza creare correlazioni implicite fra prove diverse.

Permeabilità, storia tensionale completa, consolidazione e leggi costitutive
cicliche restano blocchi futuri: non sono simulati mediante metadati generici.

## `GroundProfile`: compatibilità 1D

`GroundProfile` rappresenta una colonna verticale con:

- quota del piano campagna;
- strati orizzontali contigui e non sovrapposti;
- riferimenti alla libreria dei materiali;
- falda assente oppure idrostatica orizzontale.

Resta l'API stabile e più semplice per spinte contro pareti con stratigrafia
orizzontale e per qualsiasi futuro metodo 1D. Non viene sostituita da
`GroundSection2D`.

`GroundModel.fromGroundProfile()` promuove un profilo 1D a modello completo:

1. conserva il `GroundProfile` originale;
2. lo estrude orizzontalmente in un `GroundSection2D` di larghezza assegnata;
3. converte la falda nel corrispondente `PorePressureField2D`;
4. usa una sola libreria materiali canonica.

La conversione è geometrica e non aggiunge informazioni geologiche.

## `GroundSection2D`

### Dati

Una sezione contiene:

- una polilinea `surface.points`, con ascisse strettamente crescenti;
- una o più zone materiali poligonali;
- per ogni zona, `id`, `materialId`, poligono e metadati;
- limiti geometrici calcolati;
- sistema di coordinate e datum.

I poligoni vengono normalizzati in verso antiorario. L'ultimo punto può
coincidere con il primo; la chiusura duplicata viene rimossa nel modello
interno.

### Invarianti

Il costruttore rifiuta:

- superfici con meno di due punti o ascisse non crescenti;
- zone senza materiale;
- identificativi di zona duplicati;
- poligoni con meno di tre punti distinti, area nulla, lati degeneri o
  auto-intersezioni;
- vertici fuori dal dominio orizzontale della superficie;
- vertici sopra il piano campagna interpolato;
- sovrapposizioni tra gli interni di due zone.

È invece ammessa una frontiera condivisa. Sono ammessi anche vuoti nella
partizione: possono rappresentare una zona non investigata, uno scavo o una
porzione non modellata. Il chiamante deve quindi gestire una query che non
trova alcuna zona.

Non sono ancora rappresentabili fori interni a un poligono, faglie come oggetti
topologici autonomi, volumi 3D o superfici multivalore rispetto a `x`.

### Query

- `surfaceElevationAt(x)` interpola linearmente il piano campagna;
- `getZonesAtPoint({x,z})` restituisce tutte le zone compatibili;
- `getZoneAtPoint({x,z})` restituisce una zona o `null`;
- `getMaterialIdAtPoint({x,z})` restituisce il materiale della zona;
- `isBelowGroundSurface({x,z})` verifica la posizione rispetto alla superficie.

Un punto su una frontiera comune appartiene geometricamente a entrambe le
zone. `getZoneAtPoint` genera quindi un errore di ambiguità per default. Per
un'ispezione che accetti una scelta deterministica è possibile usare
`{ requireUnique: false }`, ma un algoritmo numerico dovrebbe normalmente
decidere il lato mediante la propria normale, una perturbazione controllata o
una regola topologica esplicita.

## `PorePressureField2D`

Il campo è indipendente dalla geometria dei materiali perché una stessa
sezione può essere valutata con differenti condizioni di falda, drenaggio o
fase costruttiva.

### Modelli disponibili

| Modello | Input | Valutazione |
| --- | --- | --- |
| `none` | nessuno | `u = 0` ovunque. |
| `hydrostatic-horizontal` | quota falda e peso dell'acqua | `u = gamma_w max(z_w-z,0)`. |
| `phreatic-line` | polilinea con `x` crescente e peso dell'acqua | Interpolazione lineare di `z_w(x)`, poi relazione idrostatica verticale. |
| `assigned-grid` | griglia rettangolare `x-z` di pressioni | Interpolazione bilineare dei valori assegnati. |

Per polilinea e griglia, `outsideDomain` vale:

- `error`: la query fuori dal dominio è rifiutata;
- `constant`: viene usato il valore sul bordo più vicino, costante nella
  direzione eccedente.

`breakpointsAtX(x)` espone quote utili a una futura discretizzazione: livello
freatico per i modelli idrostatici o tutte le righe `z` per una griglia.

### Limiti idraulici

`PorePressureField2D` non è un solutore di filtrazione. In particolare non
calcola:

- carico piezometrico da permeabilità e condizioni al contorno;
- regime transitorio, consolidazione o dissipazione;
- risalita capillare o suzione;
- accoppiamento spostamenti-pressioni;
- modifica automatica del campo a seguito di scavi o drenaggi.

Il modello `phreatic-line` assume una distribuzione idrostatica verticale sotto
la linea; una rete di filtrazione nota deve essere rappresentata tramite
`assigned-grid` o, in futuro, tramite il risultato di un solutore idraulico.

## `GroundModel`

`GroundModel` è il contenitore condiviso del sito. Comprende:

- libreria canonica `materials`;
- zero o più `profiles`;
- zero o più `sections`;
- zero o più `porePressureFields`;
- identificativi di default quando la scelta è univoca o esplicita;
- metadati di provenienza e dimensione spaziale.

È necessario almeno un materiale e almeno una rappresentazione geometrica 1D
o 2D. Tutti i riferimenti `materialId` di strati e zone sono verificati.

I metodi `getProfile`, `getSection` e `getPorePressureField` usano il relativo
default; se esistono più alternative e non è stato dichiarato un default,
richiedono un identificativo esplicito. Questo impedisce di usare
silenziosamente la prima condizione disponibile.

`analysisContext()` restituisce gli oggetti selezionati per un consumer di
dominio. `resolveZoneMaterial()` collega una query spaziale al materiale.
`porePressureAt()` interroga il campo idraulico scelto.

La serializzazione memorizza i materiali una volta sola. Nei profili interni
compare `materialSource: "ground-model-material-library"`; il costruttore
ricostruisce poi ogni `GroundProfile` con la libreria canonica.

`GroundModel` non è un database delle indagini. Sondaggi, prove, campioni,
intervalli di confidenza e modelli interpretativi potranno essere introdotti
come un livello distinto di ground investigation. Il modello corrente contiene
il risultato interpretato necessario al calcolo e la provenienza sintetica nei
metadati.

## `GeotechnicalDesignSituation`

Una situazione di progetto rende esplicito quale stato del modello e quali
parametri alimentano un'analisi. Contiene:

- tipo: persistente, transitorio, accidentale o sismico;
- stato limite: `ULS`, `SLS`, `ALS` o non specificato;
- condizione temporale: breve termine, lungo termine o non specificata;
- drenaggio richiesto: drenato, non drenato o misto;
- eventuale base richiesta dei parametri;
- selezione di profilo, sezione e campo di pressione interstiziale;
- identificativo della fase costruttiva;
- mappa dei set resistenti per materiale, zona e strato;
- mappa separata dei set deformativi per materiale, zona e strato;
- mappa dei set di interfaccia;
- autorizzazione esplicita all'uso di valori indicativi;
- input pseudostatici per la situazione sismica;
- contesto normativo serializzabile, senza dipendenza del dominio da una norma.

### Precedenza dei parametri

`resolveParameterSet()` applica questa precedenza:

1. selezione per zona 2D;
2. selezione per strato 1D;
3. selezione per materiale;
4. default del materiale.

Il risultato include `selectionSource` e `selectionSourceId`. La risoluzione
verifica anche coerenza del materiale, drenaggio, base richiesta e permesso per
valori indicativi.

La mappa delle interfacce restituisce solo l'identificativo scelto: l'oggetto
`SoilStructureInterface` e la sua relazione con la struttura appartengono al
consumer che possiede la geometria dell'opera.

`resolveDeformationParameterSet()` applica la stessa precedenza zona, strato,
materiale e default, ma consulta soltanto `deformationParameterSets`. Il
risultato tracciato non consente quindi a un set resistente e a uno deformativo
con identificativi simili di sostituirsi accidentalmente.

### Sisma e norme

Una situazione `seismic` richiede un modello esplicito. Il modello disponibile
è `pseudostatic`, con `kh >= 0` e `-1 < kv < 1`. La convenzione di default
interpreta `kv > 0` come riduzione della gravità efficace tramite `1-kv`.

`GeotechnicalDesignSituation` non calcola `kh`, `kv`, coefficienti parziali o
combinazioni. Un adapter in `src/norms` deve produrre questi dati da input
normativi verificabili; l'applicazione deve registrarli nel risultato.

## Esempio minimo

```js
import {
  GeotechnicalDesignSituation,
  GroundModel,
  GroundProfile,
  SoilMaterial,
} from "strutture-js/domain/geotechnics";

const units = { force: "kN", length: "m" };

const sand = new SoilMaterial({
  id: "sand",
  name: "Sand",
  unitWeight: { bulk: 18, saturated: 20 },
  parameterSets: [{
    id: "characteristic-drained",
    basis: "characteristic",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 32,
      cohesion: 0,
    },
  }],
  defaultParameterSetId: "characteristic-drained",
  angleUnits: "deg",
  units,
});

const profile = GroundProfile.fromThicknesses({
  id: "borehole-a",
  groundSurfaceElevation: 100,
  materials: [sand],
  layers: [{ id: "sand-layer", thickness: 12, materialId: sand.id }],
  groundwater: {
    model: "hydrostatic",
    waterTableElevation: 96,
  },
  units,
});

const groundModel = GroundModel.fromGroundProfile({
  profile,
  id: "site-ground-model",
  minimumX: 0,
  maximumX: 30,
});

const situation = new GeotechnicalDesignSituation({
  id: "uls-long-term",
  groundModel,
  situationType: "persistent",
  limitState: "ULS",
  timeCondition: "long-term",
  drainageCondition: "drained",
  requiredParameterBasis: "characteristic",
  profileId: groundModel.defaultProfileId,
  sectionId: groundModel.defaultSectionId,
  porePressureFieldId: groundModel.defaultPorePressureFieldId,
  units,
});

const selected = situation.resolveParameterSet({
  groundModel,
  zoneId: "sand-layer",
});
```

## Serializzazione e versioni

Gli schemi correnti sono:

- `ground-profile/v1`;
- `ground-section-2d/v1`;
- `pore-pressure-field-2d/v1`;
- `ground-model/v1`;
- `geotechnical-design-situation/v1`.

Ogni oggetto espone `toJSON()` e può essere ricostruito passando il payload al
costruttore corrispondente. I test verificano il round-trip del modello e della
situazione di calcolo.

Una modifica che altera significato, unità, convenzioni o forma obbligatoria
dei dati richiede una nuova versione di schema e una strategia di migrazione.
L'aggiunta compatibile di metadati opzionali non deve cambiare il significato
dei payload esistenti.

## Validazione attuale

I test automatici coprono:

- conversione delle unità;
- interpolazione della superficie;
- query interne, esterne e su frontiera;
- poligoni degeneri, auto-intersecanti, sopra superficie o sovrapposti;
- modelli idrostatico, freatico e griglia bilineare;
- politica fuori dominio;
- riferimenti a materiali inesistenti;
- promozione `GroundProfile -> GroundModel`;
- serializzazione e round-trip;
- precedenza dei set di parametri;
- incompatibilità di drenaggio e base;
- blocco dei valori indicativi non autorizzati;
- obbligatorietà e limiti dei coefficienti pseudostatici.

La campagna in `validation/geotechnicalValidationCampaign.js` include inoltre
casi con aritmetica indipendente per interpolazione geometrica, pressione
interstiziale e risoluzione della situazione di progetto.

## Campo non implementato

La chiusura di questi quattro contratti non implica che siano implementati
tutti i solutori. La stabilità statica e pseudostatica dei pendii e la
capacita/cedimento immediato delle fondazioni superficiali sono disponibili
nei rispettivi perimetri documentati in
[`geotechnical-slope-stability-method.md`](geotechnical-slope-stability-method.md)
e [`geotechnical-shallow-foundations.md`](geotechnical-shallow-foundations.md).
Restano non implementati:

- superfici di scorrimento non circolari, risposta dinamica e spostamenti
  permanenti per pendii;
- consolidazione e cedimenti dipendenti dal tempo delle fondazioni;
- capacità assiale o laterale dei pali;
- verifica completa di muri e paratie;
- generazione di molle o leggi `p-y`, `t-z`, `q-z`;
- fasi costruttive come motore di attivazione/disattivazione;
- generazione di mesh e FEM continuo del terreno;
- modelli costitutivi tensione-deformazione;
- filtrazione, consolidazione o accoppiamento idromeccanico;
- geometria 3D.

Queste capacità sono ordinate nel documento
[`geotechnical-microapps-progression.md`](geotechnical-microapps-progression.md).
