# Beam Report DTO

Questo documento fissa il contratto minimo del report di trave semplice usato da esempi, test, API e futuro frontend React.

## Principi

* Il report JSON e un oggetto serializzabile senza riferimenti ciclici.
* Il report Markdown e una rappresentazione leggibile dello stesso calcolo.
* Il core di calcolo non dipende da React, DOM, canvas, browser o file system.
* La scrittura su file resta in script/CLI Node, usando gli artefatti prodotti dal report.
* Diagrammi, inviluppi, reazioni e verifiche restano dati, non immagini.

## BeamReport

```js
{
  applicationId,
  id,
  title,
  description,
  units,
  model,
  analysis,
  verification,
  governing,
  warnings,
  assumptions,
  metadata
}
```

Campi principali:

* `applicationId`: identificativo dell'applicazione che ha generato il report.
* `id`: identificativo stabile del modello/report.
* `title`: titolo utente del report.
* `description`: descrizione del modello.
* `units`: unita esplicite, per esempio `{ force: "kN", length: "m" }`.
* `model`: input normalizzato e serializzabile.
* `analysis`: risultati FEM sintetici e risultato grezzo serializzato.
* `verification`: risultato del verificatore specialistico, se presente.
* `governing`: riferimenti rapidi a verifica, momento SLU e freccia SLE governanti.
* `warnings`: condizioni importanti ma non bloccanti.
* `assumptions`: assunzioni dichiarate dal calcolo.
* `metadata`: informazioni tecniche di generazione.

## Analysis

```js
{
  id,
  units,
  analysisModel,
  loadCaseIds,
  combinationIds,
  loadCases,
  combinations,
  envelopes,
  raw
}
```

Uso previsto nel frontend:

* `loadCaseIds` e `combinationIds` alimentano navigazione e select.
* `loadCases` e `combinations` contengono sintesi pronte per tabelle.
* `envelopes` contiene estremi governanti per dashboard e badge.
* `raw` contiene punti dei diagrammi, reazioni, spostamenti e metadata completi.

## Verification

Il verificatore restituisce un `VerificationResult` serializzato:

```js
{
  applicationId,
  status,
  summary,
  utilizationRatio,
  demand,
  capacity,
  checks,
  outputs,
  warnings,
  assumptions,
  metadata
}
```

Ogni check dovrebbe avere:

```js
{
  id,
  description,
  demand,
  capacity,
  utilizationRatio,
  ok,
  metadata
}
```

Regole:

* `status` usa almeno `ok`, `not-verified`, `not-implemented`.
* `metadata.governingCheckId` dovrebbe puntare alla verifica governante.
* Quando le verifiche arrivano da FEM, il check mantiene `resultId`, `resultType`, `station` e `limitState` nei metadata.
* Verifiche globali, come freccia e vibrazioni, possono convivere con verifiche puntuali `verifySectionActions`.

## BeamReportArtifact

Gli artefatti sono DTO pensati per CLI, API download e frontend:

```js
{
  kind,
  format,
  fileName,
  mediaType,
  content,
  metadata
}
```

Formati attuali:

* `json`: `application/json`, contenuto JSON indentato.
* `markdown`: `text/markdown`, contenuto Markdown.

La funzione `createBeamReportArtifacts(report)` produce questi oggetti senza scrivere su file.

## Script

* `npm run example:beam-reports`: stampa i report di esempio in console.
* `npm run example:beam-reports:write`: scrive JSON e Markdown in `results/beam-reports`.

## Stato

Prima versione stabilizzata per:

* legno C24;
* legno lamellare GL24h;
* acciaio IPE;
* mensola in acciaio;
* acciaio con verifiche ULS governate dalla classe, instabilita flesso-torsionale MVP, instabilita aste compresse, interazione `N + My` e freccia SLE;
* c.a. elastico con verifiche ULS `N-M`, taglio, tensioni SLE, fessurazione indiretta e deformazioni;
* legno-calcestruzzo;
* legno-XLAM.

Per il metodo SLE c.a. e i campi di report specifici vedere `docs/reinforced-concrete-sle-method.md`.
Per il metodo delle travi in acciaio vedere `docs/steel-beam-method.md`.
