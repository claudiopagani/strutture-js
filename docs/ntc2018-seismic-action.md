# Azione sismica NTC 2018

Il modulo `strutture-js/norms/ntc2018` definisce il confine locale tra i dati
di pericolosita sismica del sito e i calcoli strutturali riusabili. La libreria
non cerca il sito, non interroga database, non interpola la griglia nazionale
e non effettua chiamate di rete.

I parametri `ag`, `F0` e `TC*` possono essere inseriti manualmente oppure
provenire da un calcolo esterno. In entrambi i casi devono essere trasformati
dallo specifico consumer nello stesso contratto tecnico serializzabile.

## Fonti e campo di validita

Il primo incremento segue il D.M. 17 gennaio 2018, NTC 2018:

- paragrafo 3.2 per i parametri `ag`, `F0` e `TC*`;
- paragrafo 3.2.1 e Tabella 3.2.I per gli stati limite;
- paragrafi 3.2.2 e 3.2.3.2.1, Tabella 3.2.IV, per `SS` e `CC`;
- paragrafo 3.2.3.2.1 e Tabella 3.2.V per `ST`;
- equazioni [3.2.2]-[3.2.7] per lo spettro elastico orizzontale.

Le NTC 2018 rinviano agli Allegati A e B del D.M. 14 gennaio 2008 per i valori
di pericolosita. Tali allegati e la loro interpolazione geografica non sono
incorporati nel kernel.

Fonti ufficiali:

- [D.M. 17 gennaio 2018, Supplemento ordinario n. 8](https://www.gazzettaufficiale.it/eli/gu/2018/02/20/42/so/8/sg/pdf);
- [D.M. 14 gennaio 2008, Supplemento ordinario n. 30](https://www.gazzettaufficiale.it/atto/serie_generale/caricaDettaglioAtto/originario?atto.codiceRedazionale=08A00368&atto.dataPubblicazioneGazzetta=2008-02-04&elenco30giorni=false).

`ag` deve essere espresso esplicitamente in `g`, `TC*` e i periodi in secondi.
Il risultato riporta anche le accelerazioni in `m/s2`, usando `g = 9.81
m/s2` come indicato dalle NTC.

## Contratto della pericolosita di sito

`normalizeNTC2018SiteHazardParameters` riceve un payload come il seguente:

```js
const hazardParameters = {
  siteReference: "project-site-A",
  limitState: "SLV",
  returnPeriodYears: 475,
  ag: 0.25,
  agUnit: "g",
  f0: 2.5,
  tcStar: 0.35,
  tcStarUnit: "s",
  source: {
    kind: "manual-entry",
    reference: "Site hazard worksheet H-01",
  },
};
```

Gli stati limite ammessi sono `SLO`, `SLD`, `SLV` e `SLC`. Il risultato
conserva la probabilita nominale di superamento della Tabella 3.2.I e il
periodo di ritorno dichiarato. Non ricalcola `TR`, perche questo deve
corrispondere esattamente ai parametri di pericolosita forniti.

`F0` deve essere almeno `2.2`, limite indicato al paragrafo 3.2.3.2.1. Tutti i
campi numerici devono essere finiti e positivi.

La provenienza e obbligatoria e usa uno dei valori generici:

- `manual-entry`;
- `external-service`;
- `documented-study`.

Per un risultato esterno il payload rimane identico; cambiano soltanto i dati
di tracciabilita:

```js
const hazardParameters = {
  siteReference: "project-site-A",
  limitState: "SLV",
  returnPeriodYears: 475,
  ag: 0.25,
  agUnit: "g",
  f0: 2.5,
  tcStar: 0.35,
  tcStarUnit: "s",
  source: {
    kind: "external-service",
    reference: "Normalized seismic hazard response",
    datasetVersion: "hazard-grid-2025-01",
    resultId: "result-123",
  },
};
```

`source.kind` descrive esclusivamente la provenienza tecnica. Non abilita
funzionalita, non decide chi possa eseguire il calcolo e non contiene
informazioni di trasporto o credenziali.

## Amplificazione stratigrafica

`calculateNTC2018StratigraphicSpectrumCoefficients` implementa la Tabella
3.2.IV per le categorie di sottosuolo `A`-`E`:

| Categoria | `SS` | `CC` |
| --- | --- | --- |
| `A` | `1.00` | `1.00` |
| `B` | `1.00 <= 1.40 - 0.40 F0 ag/g <= 1.20` | `1.10 TC*^-0.20` |
| `C` | `1.00 <= 1.70 - 0.60 F0 ag/g <= 1.50` | `1.05 TC*^-0.33` |
| `D` | `0.90 <= 2.40 - 1.50 F0 ag/g <= 1.80` | `1.25 TC*^-0.50` |
| `E` | `1.00 <= 2.00 - 1.10 F0 ag/g <= 1.60` | `1.15 TC*^-0.40` |

Il risultato conserva sia il valore non limitato di `SS` sia l'eventuale
limite applicato. Condizioni non riconducibili alle categorie `A`-`E`
richiedono una specifica analisi di risposta sismica locale e non vengono
forzate nel metodo semplificato.

## Amplificazione topografica

`resolveNTC2018TopographicAmplification` distingue due casi:

- valore massimo tabellato, quando il consumer dichiara che l'opera si trova
  alla sommita o alla cresta prevista dalla Tabella 3.2.V;
- valore intermedio documentato, compreso fra `1` e il massimo della categoria.

| Categoria | Posizione del massimo | `ST,max` |
| --- | --- | ---: |
| `T1` | non applicabile | 1.0 |
| `T2` | sommita del pendio | 1.2 |
| `T3` | cresta del rilievo | 1.2 |
| `T4` | cresta del rilievo | 1.4 |

`resolveNTC2018TopographicAmplification` non ricava autonomamente la categoria
dalla geometria e non calcola la posizione relativa lungo il pendio. La
categoria puo essere determinata localmente da una griglia DEM con
`classifyNTC2018Topography`, documentato in
[Classificazione topografica NTC 2018](ntc2018-topographic-classification.md).
Un valore intermedio deve comunque avere `topographicCoefficientSource`.

## Spettro elastico orizzontale

`calculateNTC2018HorizontalSpectrumParameters` calcola:

```text
S   = SS * ST
eta = max(sqrt(10 / (5 + xi)), 0.55)
TC  = CC * TC*
TB  = TC / 3
TD  = 4 * ag/g + 1.6
```

`xi` e lo smorzamento viscoso equivalente espresso in percentuale e vale `5`
se non specificato.

Il workflow completo produce le ordinate `Se(T)` nei quattro intervalli
normativi:

```text
0 <= T < TB:  Se = ag S eta F0 [T/TB + 1/(eta F0) (1 - T/TB)]
TB <= T < TC: Se = ag S eta F0
TC <= T < TD: Se = ag S eta F0 TC/T
TD <= T:      Se = ag S eta F0 TC TD/T^2
```

Esempio:

```js
import {
  calculateNTC2018HorizontalElasticSpectrum,
} from "strutture-js/norms/ntc2018";

const result = calculateNTC2018HorizontalElasticSpectrum({
  actionId: "seismic-x",
  hazardParameters,
  subsoilCategory: "B",
  topographicCategory: "T1",
  periods: [0, 0.1, 0.2, 0.5, 1, 2, 4],
});
```

Il risultato `ntc2018-horizontal-elastic-spectrum/v1` contiene:

- input di pericolosita normalizzato e relativa provenienza;
- `SS`, `ST`, `S`, `CC`, `eta`, `TB`, `TC` e `TD`;
- ordinate in `g` e `m/s2`, con il ramo della formula applicato;
- una `SeismicAction` serializzabile;
- warning, assunzioni, unita e riferimenti normativi.

Per periodi superiori a `4.0 s` il workflow restituisce `not-supported`, come
richiesto dal limite di applicabilita indicato dalle NTC.

## Separazione dal servizio esterno

L'attesa di un job, gli errori HTTP, i tentativi, la cache, le credenziali e le
regole di accesso appartengono al consumer o al servizio. Al termine di quel
processo, il consumer passa a `strutture-js` soltanto il payload tecnico
normalizzato.

Questo permette anche il percorso manuale senza duplicare il calcolo dello
spettro e senza introdurre nella libreria dipendenze dall'infrastruttura che ha
prodotto `ag`, `F0` e `TC*`.

## Limiti del primo incremento

Non sono implementati:

- lookup da coordinate e interpolazione della griglia di pericolosita;
- calcolo del periodo di ritorno dalla vita nominale e dalla classe d'uso;
- analisi di risposta sismica locale;
- spettro verticale, spettro in spostamento e spettri di progetto;
- fattore di comportamento e riduzioni anelastiche;
- generazione, selezione o compatibilita di accelerogrammi;
- combinazione delle componenti X, Y e Z;
- forze equivalenti, masse sismiche o analisi FEM.

Queste esclusioni impediscono che uno spettro elastico venga presentato come
analisi sismica completa.
