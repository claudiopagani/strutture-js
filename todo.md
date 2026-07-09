# TODO OTTIMIZZAZIONE SCA

Ottimizzazioni possibili, in ordine di impatto
🔴 ALTO impatto — RCSectionStateIntegrator.evaluate() (allocazioni ridondanti)
Problema: Il .map() sulle fibre crea un oggetto diagnosti co con 20+ proprietà per ogni fibra, a ogni chiamata. Di queste, solo force, mx, my servono all'integratore.

Fix: Separare il percorso "calcolo tensioni" dal percorso "report diagnostico". In produzione, saltare la costruzione dell'oggetto diagnostico.

Guadagno stimato: 2-4x sul tempo di integrazione (è il collo di bottiglia più interno).

🔴 ALTO impatto — Campionamento cieco in solveAtCurvature()
Problema: 161–401 campioni ε₀ lineari vengono tutti valutati con integrazione completa prima di cercare bracket. La maggior parte sono lontani dalla radice.

Fix: Campionamento adattivo coarse-to-fine o early termination dopo aver trovato un numero sufficiente di bracket.

Guadagno stimato: 1.5-2x su solveAtCurvature().

🟡 MEDIO impatto — StrainField allocato per ogni valutazione
Problema: new StrainField(eps0, kx, ky) è un'istanza di classe con soli 3 numeri, creata ~14.000 volte per analisi.

Fix: Inlineare il calcolo dello strain o usare un oggetto mutabile riutilizzato.

🟡 MEDIO impatto — IllinoisRootSolver accumula history
Problema: Ogni iterazione pusha in un array diagnostico. In produzione non serve.

Fix: Rendere l'history opzionale (già fatto in parte, verificare).

🟢 BASSO impatto — SectionFiberDiscretizer usa oggetti plain
Problema: Le fibre sono oggetti JS con chiavi stringa. Per l'integratore, sarebbe più efficiente uno struct-of-arrays con Float64Array.

Fix: Convertire le fibre in typed array dopo la discretizzazione. Migliora la cache locality.

Nota: È un refactor significativo, da fare solo se le ottimizzazioni sopra non bastano.

🟢 BASSO impatto (ma UX importante) — Web Worker per la SPA
Nella SPA React, l'analisi momento-curvatura (690ms in test, potenzialmente di più con sezioni complesse) blocca il thread UI. Spostare i calcoli pesanti in un Web Worker:

L'UI rimane reattiva durante il calcolo
Si può mostrare una progress bar
Il bundle ESM funziona anche in worker: new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
Priorità consigliata
Step	Cosa	Impatto	Rischio
1	Bundle esbuild (✅ fatto)	Module resolution: -10x	Basso
2	Separare integrazione da diagnostica in evaluate()	Calcolo: -2/4x	Medio (tocca il core)
3	Campionamento adattivo in solveAtCurvature()	Calcolo: -1.5/2x	Medio
4	Web Worker (solo SPA)	UX: UI non bloccante	Basso
5	Typed arrays nelle fibre	Calcolo: -1.2/1.5x	Alto (refactor grosso)