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

## Resta da fare

### 1. Estendere il percorso leggero ad altri solver RC

Impatto atteso: medio-alto.

Oggi il fast path e usato nel momento-curvatura. Restano candidati:
- `RCUltimateSectionSolver`, durante campionamento profondita e iterazioni Illinois.
- `RCServiceStressSolver`, durante Newton e differenze finite.
- eventuali builder di domini ULS che chiamano ripetutamente l'integratore.

Approccio consigliato: usare `includeResponseDetails: false` nelle iterazioni interne e rivalutare con dettagli completi solo il risultato finale.

### 2. IllinoisRootSolver: history opzionale

Impatto atteso: basso-medio.

Problema: `IllinoisRootSolver.solve()` costruisce sempre `history`.

Fix: aggiungere un'opzione tipo `includeHistory = true` o `collectHistory = true`, mantenendo il default compatibile. Nei loop prestazionali usare `false`.

Rischio: basso.

### 3. StrainField allocato per ogni valutazione

Impatto atteso: medio-basso dopo il fast path.

Problema: molte valutazioni creano `new StrainField(...)`.

Possibili fix:
- accettare nell'integratore anche `{ eps0, kappaY, kappaZ }` plain object con `strainAt` inline interno;
- oppure riusare un oggetto mutabile solo nei loop interni.

Rischio: basso-medio, ma da fare solo dopo un profiling aggiornato.

### 4. Benchmark ripetibile di performance

Impatto atteso: alto per evitare regressioni.

Creare uno script dedicato, ad esempio `scripts/benchmark-rc-moment-curvature.js`, che misuri:
- fibre 120, 300, 1000;
- pointCount 15, 41;
- postUltimateResponse `zero-stress` e `linear-softening`;
- tempo medio su piu run;
- numero chiamate integratore, fast/detail.

Questo dovrebbe diventare il riferimento prima di interventi piu invasivi.

### 5. Web Worker per la SPA

Impatto atteso: UX alto, calcolo puro invariato.

Serve se la SPA React blocca il thread UI durante analisi pesanti.

Approccio:
- spostare le analisi RC pesanti in un worker ESM;
- serializzare input/output del modello;
- progress bar opzionale;
- cancellazione calcolo se l'utente cambia input.

Rischio: basso-medio lato UI, nullo sul core se il worker chiama le API esistenti.

### 6. Typed array / struct-of-arrays per le fibre

Impatto atteso: basso-medio, ma rischio alto.

Da fare solo se, dopo benchmark e fast path esteso, il collo di bottiglia resta la scansione delle fibre.

Possibile strategia:
- mantenere l'API pubblica `fibers` invariata;
- generare internamente una vista ottimizzata con `Float64Array` per area/y/z;
- usare la vista solo nei loop caldi dell'integratore.

## Priorita consigliata

1. Benchmark ripetibile.
2. Estendere `includeResponseDetails: false` agli altri solver RC.
3. Rendere opzionale `IllinoisRootSolver.history`.
4. Valutare `StrainField` solo se il profiling lo conferma.
5. Web Worker se il problema percepito e il blocco UI.
6. Typed array solo come refactor finale.

## Verifiche gia passate dopo gli interventi

- `node scripts/check-syntax.js`
- test RC mirati
- `npm test` completo: 291 test passati
- `npm run build`
