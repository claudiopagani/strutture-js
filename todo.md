# TODO OTTIMIZZAZIONE SCA

Stato aggiornato dopo le prime ottimizzazioni sul calcolo momento-curvatura.

## Fatto

### 1. Bundle esbuild

Stato: fatto in precedenza.

Effetto: risoluzione moduli molto piu veloce lato consumer/bundle.

### 2. RCSectionStateIntegrator.evaluate(): percorso leggero senza diagnostica fibra/barra

Stato: fatto.

Implementazione:
- `includeResponseDetails` e stato lasciato a `true` di default per compatibilita.
- Le valutazioni interne di `RCMomentCurvatureAnalyzer.solveAtCurvature()` usano `includeResponseDetails: false`.
- Il punto convergente viene rivalutato con diagnostica completa, quindi l'output pubblico conserva `concrete.fibers`, `steel.bars`, `extremes`, `postUltimate`, ecc.

Benchmark indicativo sulla fixture locale:
- circa 126 fibre: 196 ms -> 90 ms
- circa 984 fibre: 1585 ms -> 332 ms

### 3. solveAtCurvature(): bracketing guidato da eps0Hint

Stato: fatto, con fallback conservativo.

Implementazione:
- Cache delle valutazioni leggere per `eps0`.
- Ricerca locale progressiva attorno a `eps0Hint`.
- Fallback alla scansione lineare completa se il bracket locale non trova una radice equilibrata.

Nota: non e un campionamento adattivo generale coarse-to-fine, ma elimina molte scansioni cieche quando il punto precedente fornisce un buon hint.

### 4. Benchmark ripetibile di performance

Stato: fatto.

Implementazione:
- aggiunto `scripts/benchmark-rc-moment-curvature.js`;
- aggiunto script npm `benchmark:rc-moment-curvature`;
- configurazioni coperte: fibre 120/300/1000, pointCount 15/41, `zero-stress` e `linear-softening`;
- output: tempo medio, chiamate integratore, chiamate fast/detail, punti analizzati/generati.

Uso:

```bash
npm run benchmark:rc-moment-curvature -- --runs=3
```

### 5. Estendere il percorso leggero ad altri solver RC

Stato: fatto per i solver principali.

Implementazione:
- `RCUltimateSectionSolver` usa stati leggeri durante campionamento profondita e iterazioni Illinois, poi rivaluta il risultato finale con dettagli completi.
- `RCServiceStressSolver` usa stati leggeri durante Newton e differenze finite, poi rivaluta lo stato finale con dettagli completi.

Da monitorare: eventuali builder di dominio ULS traggono beneficio indirettamente da `RCUltimateSectionSolver`.

### 6. IllinoisRootSolver: history opzionale

Stato: fatto.

Implementazione:
- aggiunto `includeHistory`, default `true` per compatibilita;
- i loop prestazionali RC passano `includeHistory: false`;
- aggiunto test dedicato.

## Resta da fare

### 1. StrainField allocato per ogni valutazione

Impatto atteso: da rivalutare con benchmark/profiling aggiornato.

Problema: molte valutazioni creano `new StrainField(...)`.

Possibili fix:
- accettare nell'integratore anche `{ eps0, kappaY, kappaZ }` plain object con `strainAt` inline interno;
- oppure riusare un oggetto mutabile solo nei loop interni.

Rischio: basso-medio, ma da fare solo dopo un profiling aggiornato.

### 2. Web Worker per la SPA

Impatto atteso: UX alto, calcolo puro invariato.

Serve se la SPA React blocca il thread UI durante analisi pesanti.

Approccio:
- spostare le analisi RC pesanti in un worker ESM;
- serializzare input/output del modello;
- progress bar opzionale;
- cancellazione calcolo se l'utente cambia input.

Rischio: basso-medio lato UI, nullo sul core se il worker chiama le API esistenti.

APPUNTI DA CHIEDERE A CODEX SU ABPINGEGNERIA
“Benchmark su casi reali della SPA” vuol dire: non solo la sezione rettangolare sintetica dello script, ma uno o due input realmente prodotti dall’interfaccia. Non devi per forza darmi file se sono già nel repo. Se invece la SPA sta altrove, sarebbe utile uno di questi:
il JSON/model che la SPA passa a strutture-js;
un esempio di trave RC con analysisResult FEM e impostazioni SLE/deflection;
oppure il file/component/worker della SPA dove viene chiamata la libreria.

### 3. Typed array / struct-of-arrays per le fibre

Impatto atteso: basso-medio, ma rischio alto.

Da fare solo se, dopo benchmark e fast path esteso, il collo di bottiglia resta la scansione delle fibre.

Possibile strategia:
- mantenere l'API pubblica `fibers` invariata;
- generare internamente una vista ottimizzata con `Float64Array` per area/y/z;
- usare la vista solo nei loop caldi dell'integratore.

## Priorita consigliata

1. Eseguire benchmark su casi reali della SPA.
2. Valutare `StrainField` solo se il profiling lo conferma.
3. Web Worker se il problema percepito e il blocco UI.
4. Typed array solo come refactor finale.

## Verifiche gia passate dopo gli interventi

- `node scripts/check-syntax.js`
- test RC mirati
- `npm test` completo: 291 test passati
- `npm run build`
- `npm run benchmark:rc-moment-curvature -- --runs=1`
