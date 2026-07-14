# Frecce iperstatiche in c.a. - stato MVP

## Obiettivo

Estendere il calcolo delle inflessioni delle sezioni in c.a. da travi isostatiche
a travi iperstatiche, per esempio incastro-incastro e travi continue a piu
campate, con carichi uniformemente distribuiti e sezione/armatura costanti.

## Ipotesi MVP

- Solo carichi uniformemente distribuiti nel flusso `SingleBeamAnalysis`.
- Sezione e armatura costanti lungo la trave.
- Calcestruzzo non reagente a trazione e acciaio lineare elastico in SLE.
- Non linearita geometrica esclusa.
- Tension stiffening con modello zeta esistente.
- Sforzo normale letto elemento per elemento nel workflow automatico di trave,
  con famiglie di curve M-kappa quantizzate per evitare ricostruzioni ridondanti.

## Stato implementazione

### Fase 1 - Curva M-kappa / EI secante

- [x] Creata `SectionMomentCurvatureCurve`.
- [x] Campionamento della curva fino al massimo momento SLE elastico iniziale,
      con fattore di sicurezza interno.
- [x] Riutilizzo del solver sezionale SLE esistente.
- [x] Calcolo di `EI_sec = |M| / |kappa|` con guardia vicino a `M = 0`.
- [x] Applicazione del tension stiffening.
- [x] Lookup `lookupEI(M)`, `lookupKappa(M)` e `lookupState(M)`.
- [x] Rami positivo e negativo separati, con opzione `symmetric` esplicita.
- [x] Unita esplicite della curva e conversioni verso/dalla FEM.

### Fase 2 - Ciclo iterativo secante

- [x] Creata `HyperstaticDeflectionIteration`.
- [x] Accetta sia `SingleBeamModel` sia input normale da `SingleBeamAnalysis`.
- [x] Inizializzazione da EI elastico trasformato.
- [x] Aggiornamento iterativo degli EI elemento per elemento.
- [x] Rilassamento configurabile.
- [x] Criterio di convergenza sui momenti e sulla variazione di EI.
- [x] Campionamento compatibile della deformata FEM finale.

### Fase 3 - Deformata iperstatica

- [x] Caso a due appoggi mantenuto con correzione lineare globale.
- [x] Caso multi-appoggio corretto con correzione globale liscia, non campata
      per campata.
- [x] Nel caso iperstatico iterato, la freccia finale usa la deformata FEM
      compatibile della trave unica.
- [x] Curvature finali lette dalla curva precalcolata.

### Fase 4 - Integrazione nel flusso principale

- [x] Riconoscimento automatico dell'iperstaticita flessionale tramite vincoli
      `uy/rz`.
- [x] Flusso isostatico storico invariato.
- [x] Flusso iperstatico: curva M-kappa, iterazione secante, momenti finali,
      curvature e frecce.
- [x] Warning in caso di mancata convergenza.
- [x] Output serializzabile per combinazione: `hyperstatic`, `crackedPointCount`,
      `maxZeta`.

### Fase 5 - Integrazione API e consumer

- [x] `RCrackedDeflectionApplication` passa `beamModel`/`beamInput`.
- [x] `ReinforcedConcreteBeamVerification` accetta `beamModel`.
- [x] `SingleBeamDesignApplication` inoltra il modello di trave al verifier.
- [x] Esempi report RC passano `beamModel`.
- [x] Export pubblici di `SectionMomentCurvatureCurve` e
      `HyperstaticDeflectionIteration`.
- [x] Adapter di servizio espone i campi `hyperstatic`, `crackedPointCount`, `maxZeta`.

### Fase 6 - Test

- [x] Regressioni isostatiche esistenti confermate.
- [x] Test fixed-fixed con carichi fessuranti e ridistribuzione iperstatica.
- [x] Test trave continua a due campate con appoggio intermedio compatibile.
- [x] Test export package root e applications subpath.
- [x] `npm run check` verde: test, validation e worker bundle.

## Aperto

- [x] Validazione indipendente equivalente con formule chiuse e teorema di
      Clapeyron:
  - trave incastro-incastro con UDL;
  - trave continua a due campate uguali con UDL;
  - trave continua a campate diseguali 1:1.5 con UDL.
- [x] Test numerico interno su due campate diseguali 1:1.5.
- [x] Test mirato su oscillazione vicino a Mcr e taratura del rilassamento.
- [x] Supporto a sforzo normale variabile lungo la trave tramite famiglie di
      curve M-kappa quantizzate.
- [x] Solver lineare banded Cholesky iniettabile per mesh con banda ridotta.

## Audit tecnico prestazioni e manutenibilita

Audit aggiornato sul commit `dae789b` dopo l'introduzione della freccia
iperstatica iterativa.

### Baseline verificata

- 268 file JavaScript in `src`, circa 50.500 righe.
- Grafo degli import privo di cicli.
- `npm run check` verde: 297 test, 22 casi di validazione e bundle Web Worker.
- Bundle root: circa 2,02 MB, 345 KB gzip.
- Benchmark momento-curvatura: circa 10.000 integrazioni di sezione per curva;
  oltre il 99% sono valutazioni senza dettagli.
- Profilo dei test di freccia iperstatica: circa il 61% del tempo nella
  riduzione cinematica densa `T^T K T`, seguito dal kernel RC e dalla
  diagnostica del solutore lineare.
- Tempi indicativi dei test iperstatici correnti: circa 250 ms per
  incastro-incastro e 600 ms per la trave continua a due campate.

### Finding confermati

- [x] Correggere il ciclo di vita di `DofRegistry`: una stessa istanza di
      `LinearStaticSolver2D` riutilizzata su modelli con nodi differenti
      conserva i vecchi DOF e puo rendere singolare il secondo sistema.
- [x] Sostituire la riduzione cinematica densa generica con un mapping
      `fullIndex -> reducedIndex/scale`; la trasformazione ha al massimo un
      coefficiente non nullo per riga e non richiede moltiplicazioni cubiche.
- [x] Aggiungere fast path per trasformazione identita e offset nulli.
- [x] Separare la soluzione lineare essenziale dalla diagnostica: `solve()`
      oggi duplica le matrici e calcola sempre residuo, pivot e determinante.
- [x] Introdurre fattorizzazione riutilizzabile e backend
      banded/sparse dietro la stessa interfaccia del solutore.
- [x] Ottimizzare `RCSectionStateIntegrator` con un kernel assiale dedicato:
      la ricerca delle radici usa solo `N`, ma il fast path calcola ancora
      momenti, estremi e numerosi oggetti temporanei.
- [x] Propagare e interpolare `eps0Hint` nelle ricerche di primo snervamento e
      rottura, riutilizzando anche i punti estremi gia calcolati.
- [x] Precalcolare il contesto RC immutabile: coordinate delle fibre, barre,
      riferimento, limiti di deformazione, outline e direzione dell'asse
      neutro.
- [x] Evitare normalizzazione angolare, seno/coseno e copie dell'outline a
      ogni valutazione della sezione.
- [x] Misurare separatamente costruzione e lookup di
      `SectionMomentCurvatureCurve`: il default campiona 100 punti su entrambi
      i rami e curve quasi equivalenti possono essere ricostruite per
      combinazioni diverse.
- [x] Estendere le metriche del workflow iperstatico con
      `curveSectionSolveCount`, `femSolveCount`, tempo di costruzione curva e
      tempo iterativo; `serviceSolveCount = 0` non rappresenta il lavoro
      svolto dalla curva precalcolata.
- [x] Condividere una curva per inviluppo di combinazioni con uguali
      rapporto modulare, beta e sforzo normale, oppure un'estensione lazy del
      campo dei momenti.
- [x] Indicizzare i carichi FEM per elemento, evitando il `filter` completo
      per ogni elemento durante assemblaggio e campionamento iterativo.
- [x] Spostare `NTC2018ExistingMasonryMaterial` sotto `norms/ntc2018`, oppure
      iniettare catalogo e policy, per ripristinare la dipendenza
      `norms -> domain`.
- [x] Centralizzare le primitive di algebra lineare e i normalizzatori
      duplicati in FEM, acciaio e muratura.
- [x] Spezzare i moduli maggiori in pipeline e policy nominate. Priorita:
      `RCMomentCurvatureAnalyzer`, `SteelMemberVerification` e
      `CrackedSectionDeflectionAnalysis`, ora oltre 1.200 righe.
- [x] Estrarre da `CrackedSectionDeflectionAnalysis` campionamento,
      integrazione della curvatura, correzioni ai vincoli, orchestrazione
      iperstatica e costruzione degli output.
- [x] Pubblicare ESM non pre-bundled e subpath per singola applicazione;
      separare il catalogo dei profili dal root package per migliorare il
      tree-shaking.
- [x] Aggiungere CI, lint, type-check, coverage report e soglie automatiche
      sui benchmark.
- [x] Allineare la documentazione dei benchmark ai casi effettivamente eseguiti.

### Piano di lavoro ordinato

#### Lotto A - Hardening e FEM

- [x] Test di regressione sul riuso del solutore fra modelli differenti.
- [x] Registro DOF nuovo e stabile per ogni nuova assemblata.
- [x] Riduzione cinematica O(n^2) tramite mapping sparso.
- [x] Benchmark dedicato a 60, 120, 240 e 480 DOF.
- [x] Confronto numerico prima/dopo su analisi lineari, equal-DOF, pushover e
      frecce iperstatiche.

Risultati del lotto A, 10 luglio 2026:

- benchmark con base fissa: 60 DOF `0,144 ms`, 120 DOF `0,209 ms`, 240 DOF
  `0,425 ms`, 480 DOF `0,907 ms`;
- la riduzione cinematica e passata da circa il 61% del profilo iperstatico a
  meno dell'1%; il nuovo hot spot e il kernel sezionale RC;
- i casi iperstatici della suite sono passati indicativamente da circa
  `247/609 ms` a circa `98/82 ms`;
- il percorso lineare ripetuto puo disabilitare la diagnostica completa senza
  cambiare spostamenti, reazioni o forze interne;
- suite completa: 300 test superati in circa 1,85 s;
- validazione: 22 casi superati, nessun fallimento;
- controllo sintattico: 357 file validi.

#### Lotto B - Workflow iperstatico RC

- [x] Benchmark separato per costruzione curva M-kappa e iterazione FEM.
- [x] Contatori prestazionali completi negli output.
- [x] Cache/inviluppo delle curve fra combinazioni compatibili.
- [x] Validazione analitica indipendente incastro-incastro, due campate uguali
      e campate diseguali 1:1.5.

Risultati del lotto B, 10 luglio 2026:

- benchmark `fixed-fixed`: mediana `68,18 ms`, 2 curve costruite, 1 cache hit,
  388 risoluzioni sezionali e 42 risoluzioni FEM;
- benchmark `continuous-1-to-1.5`: mediana `55,84 ms`, 1 curva, 198
  risoluzioni sezionali e 14 risoluzioni FEM;
- gli output distinguono ora tempo e conteggi di costruzione curva, lookup,
  cache, risoluzioni sezionali, risoluzioni FEM e iterazione complessiva;
- combinazioni rara e frequente con uguali `n`, `beta` e sforzo normale
  condividono una curva dimensionata sull'inviluppo dei momenti;
- aggiunto test interno con campate `5,0 + 7,5 m` e compatibilita degli
  spostamenti su tutti gli appoggi;
- la validazione indipendente e stata poi completata nel Lotto D con tre casi
  analitici chiusi basati sulla teoria di Eulero-Bernoulli e su Clapeyron.

#### Lotto C - Kernel sezionale RC

- [x] Kernel `evaluateAxialForce` senza dettagli.
- [x] Contesto di sezione preparato e riutilizzabile.
- [x] Continuazione `eps0` nelle ricerche degli eventi.
- [x] Benchmark e verifica di equivalenza con tolleranze ingegneristiche
      dichiarate.

Risultati del lotto C, 10 luglio 2026:

- aggiunti evaluator preparati per la sola forza assiale e per i tre
  risultanti `N/Mx/My`; limiti di deformazione, barre e riferimento vengono
  risolti una volta e le valutazioni iterative non costruiscono estremi o
  risposte fibra-per-fibra;
- equivalenza verificata per risposta `retain`, `zero-stress` e
  `linear-softening`, con tolleranze `1e-8 N` su `N` e `1e-6 Nmm` sui
  momenti nel test dedicato;
- le ricerche di primo snervamento e rottura riutilizzano gli estremi gia
  risolti e interpolano `eps0Hint`: le valutazioni per curva sono scese da
  circa `9.800-10.100` a `659-789`;
- nel benchmark con circa 1.000 fibre il momento-curvatura e passato da
  circa `47-57 ms` a `10,5-13,5 ms`; con 120-300 fibre i casi misurati sono
  scesi a circa `2,2-5,5 ms`;
- il benchmark iperstatico `fixed-fixed` e passato da `70,97 ms` a
  `37,59 ms`, con costruzione curve da `48,50 ms` a `15,34 ms`; il caso
  `continuous-1-to-1.5` da `57,71 ms` a `43,16 ms`, con costruzione curva da
  `22,75 ms` a `7,71 ms`;
- aggiunto un indice condiviso dei carichi per elemento, riutilizzato da
  assemblaggio, campionamento dei risultati e iterazione iperstatica; la
  complessita della selezione passa da `O(elementi * carichi)` a
  `O(elementi + carichi)`;
- il benchmark dedicato su 60/120/240/480 elementi misura speedup
  rispettivamente di `5,7x`, `10,2x`, `18,3x` e `36,3x`, includendo anche il
  costo di costruzione dell'indice;
- suite completa: 303 test superati in circa `1,23 s`; validazione: 22 casi
  superati; controllo sintattico: 360 file; bundle worker verificato a
  `704 KiB`.

#### Lotto D - Architettura e distribuzione

- [x] Separazione `domain`, `applications` e `norms` verificata da regola
      automatica.
- [x] Decomposizione dei moduli maggiori e primitive condivise.
- [x] Export granulari, ESM tree-shakable, CI e performance budget.

Risultati del lotto D, 10 luglio 2026:

- `NTC2018ExistingMasonryMaterial` risiede ora in `norms/ntc2018/materials`;
  `domain` non dipende piu da cataloghi o policy NTC e gli export pubblici
  root/NTC restano invariati;
- aggiunto `npm run check:architecture`, integrato in `npm run check`, che
  vieta `domain -> norms/applications` e `norms -> applications`;
- il controllo passa su 278 file sorgente e 244 dipendenze relative
  sorvegliate; la direzione ammessa e documentata nel README;
- centralizzate matrice/vettore nulli, clamp, arrotondamento e soluzione 3x3;
  aggiunte fattorizzazione LU riutilizzabile e soluzione Cholesky banded con
  fattorizzazione riutilizzabile e rilevamento automatico della banda;
- estratti campionamento, integrazione/correzione e check delle frecce;
  `CrackedSectionDeflectionAnalysis` e sceso da circa 1.380 a 869 righe;
  `SteelMemberVerification` da circa 1.900 a 296 righe e
  `RCMomentCurvatureAnalyzer` a 1.197 righe tramite policy, event locator e
  serializer dedicati;
- aggiunto il test di oscillazione presso `Mcr`: con fattore 1,0 non converge
  in 50 iterazioni, mentre il default 0,5 converge in meno di 20; il valore e
  ora esposto negli output;
- lo sforzo normale variabile usa famiglie di curve M-kappa quantizzate
  (default `1 kN`); una regressione con carico assiale concentrato verifica due
  curve distinte e convergenza della redistribuzione;
- aggiunte tre validazioni analitiche indipendenti: incastro-incastro, due
  campate uguali e campate `4 + 6 m`, con formule chiuse e teorema dei tre
  momenti; campagna completa `25/25`;
- il package usa `src/index.js` per la condizione ESM `import`, mantiene il
  bundle come fallback e pubblica subpath per applicazioni, FEM, matematica e
  catalogo profili; il worker tree-shaken e sceso da `704 KiB` a `235 KiB`;
- aggiunta CI GitHub con Node 24, ESLint, type-check `checkJs` graduale,
  coverage minima `85%/60%/88%` (linee/branch/funzioni) e performance budget;
  copertura misurata `87,52%/64,76%/90,55%`;
- performance budget finale: momento-curvatura `659/694` integrazioni sui casi
  126/984 fibre, fixed-fixed `430` operazioni sezionali+FEM, continuo 1:1.5
  `212`, indice carichi 480 elementi `0,24 ms`, banded 300x300 `3,45 ms`;
- gate finale verde: 309 test in circa `1,33 s`, 25 validazioni, 371 file con
  sintassi valida, bundle root `1.949,5 KiB` (`341,7 KiB` gzip) e worker
  `235 KiB`.

## Note per i consumer

Il consumer puo leggere direttamente:

- `outputs.combinations[].hyperstatic.active`
- `outputs.combinations[].hyperstatic.converged`
- `outputs.combinations[].hyperstatic.iterations`
- `outputs.combinations[].hyperstatic.relaxationFactor`
- `outputs.combinations[].hyperstatic.axialForceCurveCount`
- `outputs.combinations[].hyperstatic.axialForceCurveTolerance`
- `outputs.combinations[].crackedPointCount`
- `outputs.combinations[].maxZeta`
- `outputs.combinations[].points[]` per diagrammi di momento, curvatura,
  rotazione e freccia.

Nel DTO sintetico gli stessi campi principali sono copiati anche in
`outputs.hyperstatic`, `outputs.crackedPointCount` e `outputs.maxZeta`.
