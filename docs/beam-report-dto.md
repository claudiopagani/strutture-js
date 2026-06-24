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
  schemaVersion,
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

* `schemaVersion`: versione del contratto, attualmente `beam-report/v1`.
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
  sectionRotation,
  principalAxes,
  sectionRigidity,
  principalActionEnvelopes,
  raw
}
```

Uso previsto nel frontend:

* `loadCaseIds` e `combinationIds` alimentano navigazione e select.
* `loadCases` e `combinations` contengono sintesi pronte per tabelle.
* `envelopes` contiene estremi governanti per dashboard e badge.
* `sectionRotation`, `principalAxes` e `sectionRigidity` descrivono assi principali, angolo `alpha`, rigidezze principali e rigidezza verticale equivalente usata dal FEM 2D.
* `principalActionEnvelopes` espone gli inviluppi gia separati in `mY`, `mZ`, `vY`, `vZ`, senza costringere il frontend a scavare nel risultato grezzo.
* `raw` contiene punti dei diagrammi, reazioni, spostamenti e metadata completi.

## Assi Ruotati E Azioni Principali

Per travi inclinate o sezioni con assi principali ruotati, il report mantiene separati tre livelli:

* `model.beamInput.sectionRotation`: input utente, per esempio `{ alpha: 15, units: "deg" }`.
* `analysis.sectionRotation`: rotazione normalizzata in radianti, con `inputAlpha`, `inputUnits`, `convention` e `primaryAxis`.
* `analysis.principalActionEnvelopes`: estremi principali per `mY`, `mZ`, `vY`, `vZ`.

Esempio minimo:

```js
{
  sectionRotation: {
    alpha: 0.261799,
    inputAlpha: 15,
    inputUnits: "deg",
    convention: "vertical-load-projected-on-principal-section-axes",
    primaryAxis: "principalY"
  },
  sectionRigidity: {
    flexuralRigidity: 12345,
    flexuralRigidityY: 15000,
    flexuralRigidityZ: 5000,
    verticalFlexuralRigiditySource: "flexuralRigidity-harmonic-projection-yz"
  },
  principalActionEnvelopes: {
    uls: {
      maxAbsBendingMomentY: { value, station, resultId },
      maxAbsBendingMomentZ: { value, station, resultId },
      maxAbsShearForceY: { value, station, resultId },
      maxAbsShearForceZ: { value, station, resultId }
    }
  }
}
```

Il Markdown contiene le sezioni `Assi principali` e `Azioni principali`. Quando `alpha` e diverso da zero, i warning ricordano che il solver resta un FEM 2D: usa rigidezza verticale equivalente e non modella torsione o spostamento trasversale debole indipendente.

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
* I check puntuali possono esporre anche `stationSource`, `stationRole`, `isUserStation`, `isGridStation`, `isCriticalStation` e `stationSelectionMode`.
* Verifiche globali, come freccia e vibrazioni, possono convivere con verifiche puntuali `verifySectionActions`.

## Verification Stations

La trave semplice puo ricevere una configurazione `verificationStations` nel `beamInput`:

```js
{
  mode: "all" | "auto" | "user" | "combined" | "critical",
  count,
  userStations,
  tolerance
}
```

Uso previsto:

* `all`: verifica tutti i campioni FEM disponibili.
* `auto`: usa una griglia regolare se `count` e definito.
* `user`: verifica solo le stazioni dichiarate in `userStations`.
* `combined`: usa griglia regolare e stazioni utente.
* `critical`: verifica le stazioni FEM governanti per momento o taglio.

Quando la configurazione e presente nel `beamInput`, `SingleBeamAnalysis` inserisce nella mesh FEM le stazioni di griglia e utente richieste da `auto`, `user` e `combined`; `SingleBeamDesignApplication` propaga poi la stessa configurazione al verificatore materiale. I moduli materiali restano comunque usabili standalone: `BeamSectionActionVerifier` accetta la stessa configurazione anche senza passare dall'applicazione trave.

I metadata dei check permettono al frontend di distinguere:

* campioni FEM generici;
* punti definiti dall'utente;
* griglia automatica di verifica;
* appoggi;
* carichi puntuali;
* stazioni critiche di momento o taglio.

## BeamReportArtifact

Gli artefatti sono DTO pensati per CLI, API download e frontend:

```js
{
  kind,
  format,
  fileName,
  mediaType,
  content,
  metadata: {
    schemaVersion,
    reportId,
    title
  }
}
```

Formati attuali:

* `json`: `application/json`, contenuto JSON indentato.
* `markdown`: `text/markdown`, contenuto Markdown.

La funzione `createBeamReportArtifacts(report)` produce questi oggetti senza scrivere su file.

## Validazione DTO

`validateBeamReportDto(report)` esegue una validazione runtime leggera del contratto `beam-report/v1`.

Controlla:

* campi top-level richiesti;
* presenza di `analysis.loadCaseIds`, `analysis.combinationIds`, sintesi e risultato grezzo;
* presenza dei campi espliciti per assi ruotati e azioni principali;
* forma minima di `verification`, se presente;
* warning, assunzioni e metadata come array/oggetti serializzabili.

Non sostituisce un JSON Schema completo: e un guardiano leggero per test, API e frontend React.

## Script

* `npm run example:beam-reports`: stampa i report di esempio in console.
* `npm run example:beam-reports:write`: scrive JSON e Markdown in `results/beam-reports`.

## Stato

Prima versione stabilizzata per:

* legno C24;
* legno lamellare GL24h;
* acciaio IPE;
* mensola in acciaio;
* acciaio con verifiche ULS governate dalla classe, instabilita flesso-torsionale MVP, instabilita aste compresse, interazione `N + Mzz` e freccia SLE;
* c.a. elastico con verifiche ULS `N-M`, taglio, tensioni SLE, fessurazione indiretta e deformazioni;
* legno-calcestruzzo;
* legno-XLAM;
* report con assi principali ruotati `sectionRotation`, rigidezze principali e inviluppi `mY/mZ/vY/vZ`.

Per il metodo SLE c.a. e i campi di report specifici vedere `docs/reinforced-concrete-sle-method.md`.
Per il metodo delle travi in acciaio vedere `docs/steel-beam-method.md`.
