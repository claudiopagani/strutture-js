# Classificazione topografica NTC 2018

Il modulo `strutture-js/norms/ntc2018` calcola localmente la categoria
topografica `T1`-`T4` a partire da una griglia di quote del terreno. La
libreria non contiene il modello digitale nazionale, non cerca coordinate e
non effettua chiamate di rete.

Il codice numerico e il port, senza modifiche alle formule e alle soglie, della
procedura raster gia validata nel progetto di origine.

## Fonti e campo di validita

La classificazione fa riferimento a:

- D.M. 17 gennaio 2018, NTC 2018, paragrafo 3.2.2 e Tabelle 3.2.III e 3.2.V;
- Claudia Mascandola, Lucia Luzi, Chiara Felicetta, Francesca Pacor (2021),
  *A GIS procedure for the topographic classification of Italy, according to
  the seismic code provisions*, Soil Dynamics and Earthquake Engineering 148,
  106848, DOI `10.1016/j.soildyn.2021.106848`;
- TINITALY v1.1, DOI `10.13127/tinitaly/1.1`, quale DEM usato dalla procedura
  di riferimento.

Fonti consultabili:

- [D.M. 17 gennaio 2018](https://www.gazzettaufficiale.it/eli/gu/2018/02/20/42/so/8/sg/pdf);
- [articolo di Mascandola et al.](https://doi.org/10.1016/j.soildyn.2021.106848);
- [TINITALY v1.1](https://doi.org/10.13127/tinitaly/1.1).

## Confine con il servizio esterno

Il servizio esterno ha il solo compito di estrarre le quote dal DEM e
restituire una griglia finita. Autenticazione, autorizzazione, tariffazione,
job, tentativi, cache, trasporto HTTP e accesso al dataset appartengono al
consumer o al servizio.

`strutture-js` riceve esclusivamente il payload tecnico serializzabile:

```js
const terrainGrid = {
  center: { lat: 43.07433478, lon: 12.6063019 },
  radiusM: 500,
  gridSize: 101,
  spacingM: 10,
  extentM: 1000,
  points: [
    {
      row: 0,
      col: 0,
      northOffsetM: 500,
      eastOffsetM: -500,
      lat: 43.07883155,
      lon: 12.60014657,
      elevation_m: 245.0526,
      source: "terrain-dataset",
      resolution_m: 10,
      method: "bilinear",
      nodata: false,
    },
  ],
  provenance: {
    kind: "external-service",
    reference: "terrain extraction result terrain-42",
    datasetVersion: "1.1",
    resultId: "terrain-42",
  },
};
```

Il payload completo deve contenere `gridSize * gridSize` punti. Le quote sono
espresse in metri e le distanze planimetriche in metri. `lat` e `lon` sono
facoltative per ciascuna cella: il calcolo usa `row`, `col`, gli offset locali
Est/Nord e la quota.

Sono accettati gli alias gia prodotti dal servizio esistente:

- `col` oppure `column`;
- `elevationM`, `elevation_m` oppure `elevation`;
- `resolution_m`, `resolutionM` oppure `sourceResolutionM`;
- `method` oppure `samplingMethod`.

`normalizeTerrainElevationGrid` ordina la matrice con righe da nord a sud e
colonne da ovest a est e restituisce il contratto
`terrain-elevation-grid/v1`. La provenienza descrive soltanto l'origine
tecnica del dato e non abilita funzionalita commerciali.

## Procedura numerica trasferita

La modalita completa usa:

- DEM di ingresso con passo `10 m` e griglia `101 x 101`, corrispondente a un
  intorno di raggio `500 m`;
- ricampionamento su griglia di lavoro a `40 m`;
- smoothing mobile `3 x 3`;
- pendenza massima nell'intorno `3 x 3`;
- TPI con raggio `500 m` e soglia di cresta `5 m`;
- escursione altimetrica locale su finestra `5 x 5`, con soglie `H30 = 30 m`
  e `H60 = 60 m`;
- assottigliamento delle creste, filtro delle componenti connesse e
  dilatazione della zona di cresta secondo i parametri validati.

La modalita `51 x 51`, raggio `250 m`, viene conservata come stima diagnostica
e produce un warning perche usa una scala inferiore a quella dell'articolo.

Una griglia con passo diverso da `10 m` o dimensione diversa da `51` e `101`
restituisce `not-supported`. Se piu del 5% delle quote manca, la categoria non
viene assegnata e il risultato e `not-verified`.

## Utilizzo

```js
import {
  classifyNTC2018Topography,
} from "strutture-js/norms/ntc2018";

const result = classifyNTC2018Topography({ terrainGrid });

if (result.status === "ok") {
  console.log(result.outputs.classification.class);
}
```

Il risultato `ntc2018-topographic-classification/v1` contiene:

- categoria, valore `ST` associato dalla procedura e indicatori di
  affidabilita;
- pendenza, direzione, TPI, `H30`, `H60` e diagnostiche di cresta;
- modalita e parametri di preprocessing;
- sommario della griglia, qualita e provenienza;
- warning, assunzioni, metodo e riferimenti.

Il campo `amplificationFactorST` conserva il significato del classificatore
validato. L'applicazione delle condizioni di posizione della Tabella 3.2.V e
l'eventuale coefficiente intermedio lungo il rilievo restano esplicite nel
successivo calcolo sismico con `resolveNTC2018TopographicAmplification`.

## Validazione e regressioni

I test riproducono le regressioni originali per piano orizzontale `T1`, pendio
analitico a 20 gradi `T2`, cresta elevata `T4`, modalita diagnostica a 250 m e
copertura incompleta.

La campagna
`validation/ntc2018TopographicClassificationValidationCampaign.js` aggiunge
superfici analitiche indipendenti per verificare categoria, pendenza e soglie
di rilievo. Tutti i risultati sono serializzabili e non contengono oggetti di
rete o riferimenti a prodotti commerciali.
