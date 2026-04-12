# Roadmap della suite per travi semplici

Questo documento riordina lo stato della suite e definisce i prossimi sviluppi per arrivare a un sistema completo di analisi e verifica di travi semplici per ingegneria civile.

Obiettivo generale:

* mantenere separati i motori di calcolo: algebra, FEM, analisi di sezione, combinazioni normative, verifiche di materiale;
* usare il modulo trave singola come orchestratore FEM, non come verificatore normativo;
* permettere ai moduli specialistici di fornire rigidezze, resistenze e verifiche tramite interfacce comuni;
* restituire sempre risultati leggibili: combinazioni usate, rigidezze adottate, reazioni, spostamenti, diagrammi `N`, `V`, `M`, inviluppi e verifiche governanti;
* mantenere ogni risultato serializzabile in JSON, cosi da poterlo usare senza attrito in report, CLI, API e futuro frontend React;
* produrre report tecnici in due forme: JSON completo per macchine/interfacce e Markdown leggibile per revisione e consegna.

## Principio architetturale principale

Il contratto del modulo trave singola e:

> data una geometria, vincoli, carichi classificati e un provider di rigidezza di sezione, costruisci e risolvi modelli FEM per casi e combinazioni, restituendo diagrammi e spostamenti in forma stabile.

Il modulo trave non deve conoscere le formule normative dei materiali. Deve solo:

1. normalizzare geometria, vincoli, carichi e unita;
2. costruire il modello FEM con elemento Euler-Bernoulli o Timoshenko;
3. passare al provider di sezione il contesto dell'analisi;
4. ricevere `EA`, `EI`, eventualmente `GA`, fattori e metadata;
5. risolvere casi di carico e combinazioni come analisi FEM distinte;
6. restituire risultati e metadata sufficienti per verifiche successive.

Questo e essenziale per sezioni composte e legno: se `EI` cambia tra SLU e SLE, o se `kmod` dipende dalla durata del carico governante, la combinazione non puo essere ottenuta sommando semplicemente i risultati dei casi singoli. La combinazione deve essere risolta con i carichi combinati e con la rigidezza coerente con il suo contesto.

## Contratti architetturali da rispettare

Questa fase deve consolidare una regola importante: i moduli di verifica devono funzionare sia da soli sia insieme al modulo di trave semplice.

### Verificatori standalone

Ogni verificatore specialistico deve poter essere usato anche senza `SingleBeamAnalysis`.

Modalita standalone attesa:

* riceve un modello applicativo specifico o azioni di progetto gia note;
* esegue le verifiche proprie del materiale o della tipologia strutturale;
* restituisce sempre un `VerificationResult` serializzabile;
* dichiara assunzioni, warning, coefficienti normativi e limiti del metodo;
* non dipende da DOM, React, canvas, file system o stato globale.

Questa modalita serve per:

* verifiche di sola sezione;
* workflow storici gia presenti, come legno-calcestruzzo e legno-XLAM;
* test numerici contro workbook o formule chiuse;
* futuri strumenti frontend che vogliono verificare una sezione o un componente senza costruire una trave FEM.

### Verificatori collegati alla trave semplice

Ogni verificatore che puo usare una trave FEM deve esporre o adattarsi al contratto:

```js
verifySectionActions({
  nEd,
  vEd,
  mEd,
  x,
  context
})
```

Oppure deve avere un wrapper che usa `BeamSectionActionVerifier`.

Modalita integrata attesa:

* `SingleBeamAnalysis` calcola casi, combinazioni, diagrammi e inviluppi;
* il verificatore legge `analysisResult`, `sectionProperties`, metadata di combinazione e unita;
* le verifiche sono eseguite sulle stazioni FEM o su stazioni critiche derivate;
* il risultato aggrega la verifica governante e mantiene il riferimento a combinazione, stazione e stato limite;
* il modulo trave non conosce formule normative del materiale.

Da fare:

* applicare lo stesso schema gia usato per legno e acciaio anche ai moduli composti: completato in prima versione per legno-calcestruzzo e legno-XLAM con adapter `verifySectionActions`;
* creare un verificatore o adapter per travi in c.a. che usi le azioni FEM almeno per verifiche base `N-M`: completato in prima versione;
* rendere configurabile la densita di campionamento delle stazioni da verificare;
* distinguere stazioni informative, stazioni critiche e stazioni utente.

### Preparazione al frontend React

Il motore deve restare indipendente dal frontend. React dovra consumare DTO/JSON, non classi con stato nascosto.

Regole da mantenere:

* input e output devono essere oggetti serializzabili;
* ogni risultato deve avere `id`, `status`, `summary`, `outputs`, `checks`, `warnings`, `assumptions`, `metadata`;
* le unita devono essere sempre esplicite negli input nuovi e nei risultati;
* i report devono essere generati da funzioni pure o classi senza dipendenza UI;
* i diagrammi devono essere restituiti come array di punti, non come immagini;
* i messaggi destinati all'utente devono essere gia pronti per UI: niente stack trace grezzi nei risultati ordinari;
* i cataloghi materiali/sezioni devono poter alimentare select, form e validazioni lato frontend;
* gli errori bloccanti devono restare eccezioni; le condizioni progettuali discutibili devono diventare `warnings`.

DTO minimi da stabilizzare:

* `BeamModelInput`;
* `BeamLoadInput`;
* `BeamCombinationInput`;
* `BeamAnalysisResult`;
* `BeamVerificationResult`;
* `BeamReport`.

Completato in prima versione:

* `SingleBeamDesignModel` serializza l'input applicativo senza funzioni o istanze non gestibili dal frontend;
* `BeamReport` contiene modello, analisi, verifiche, inviluppi, warning, assunzioni e metadata in JSON serializzabile;
* `BeamReportArtifact` espone JSON e Markdown come DTO `{ kind, format, fileName, mediaType, content, metadata }`;
* il contratto minimo e documentato in `docs/beam-report-dto.md`;
* la scrittura su file resta fuori dal core e avviene con `npm run example:beam-reports:write`.

## Stato attuale dei moduli

### 1. Algebra lineare

Stato: implementato.

Componenti principali:

* `DenseLinearSolver`;
* solver denso generale con eliminazione di Gauss/LU e pivot parziale;
* diagnostica su sistemi singolari o quasi singolari;
* interfaccia sostituibile `solve(A, b)` / `solveWithDiagnostics(A, b)`.

Ruolo nella suite:

* backend numerico del core FEM;
* sufficiente per travi e telai piccoli o medi;
* sostituibile in futuro con Cholesky/LDL, solver sparsi o backend esterni senza riscrivere elementi e assemblatore.

Da fare in futuro:

* eventuale solver simmetrico positivo definito per casi lineari ben condizionati;
* eventuale adapter per solver sparsi se i modelli cresceranno oltre il dominio di travi semplici e piccoli telai.

### 2. Core FEM 2D

Stato: implementato e validato sui casi base.

Componenti principali:

* `DofRegistry`;
* `FemAssembler2D`;
* `LinearStaticSolver2D`;
* `BeamLinePreprocessor2D`;
* elemento frame 2D Euler-Bernoulli;
* elemento frame 2D Timoshenko.

Capacita presenti:

* DOF nodali `ux`, `uy`, `rz`;
* elementi inclinati in coordinate globali;
* vincoli nodali semplici;
* molle nodali come contributi diretti alla matrice globale;
* carichi nodali;
* carichi distribuiti uniformi su elemento;
* discretizzazione in punti notevoli;
* reazioni, spostamenti, forze interne e campionamento `N`, `V`, `M`;
* confronti con formule classiche di trave.

Principi da mantenere:

* il FEM rimane infrastruttura comune, non dettaglio interno di un singolo modulo;
* i carichi trapezoidali o parziali non devono moltiplicare casi speciali negli elementi: vanno discretizzati in sottoelementi con carichi uniformi;
* la non linearita deve stare in strategie dedicate, non nel solver lineare.

Da fare in futuro:

* offset rigidi;
* release di estremita tramite condensazione statica;
* multipoint constraints tramite trasformazione cinematica;
* spostamenti imposti piu ricchi;
* strategie non lineari separate: load stepping, Newton-Raphson, line search, controllo di spostamento, commit/rollback dello stato.

### 3. Modulo trave singola

Stato: primo nucleo implementato, con ponte NTC per combinazioni automatiche.

Componenti principali:

* `SingleBeamModel`;
* `SingleBeamFemBuilder`;
* `SingleBeamAnalysis`;
* `ElasticBeamSectionProvider`;
* `TimberBeamSectionProvider`;
* preset vincoli globali;
* supporto a provider statici e context-aware.

Capacita presenti:

* geometria esplicita:

```js
geometry: {
  start: { x: 0, y: 0 },
  end: { x: 5, y: 0.4 }
}
```

* vincoli globali:
  * `free`;
  * `roller`;
  * `hinge`;
  * `fixed`;
* alias italiani per i vincoli principali;
* modello `euler-bernoulli` o `timoshenko`;
* carichi distribuiti e puntuali;
* carichi verticali globali con `loadProjection: "horizontal"` di default;
* raggruppamento dei casi `G1`, `G2`, `Qk`;
* gestione di piu `Qk` come casi separati;
* combinazioni esplicite lineari;
* adapter NTC 2018 per generare combinazioni SLU/SLE annotate;
* provider legno semplice con `kmod`, `kdef`, rigidezza istantanea/finale e metadata di resistenza;
* passaggio al provider del contesto di analisi:
  * `resultType`;
  * `limitState`;
  * `combinationType`;
  * fattori di combinazione;
  * carichi attivi;
  * durata di carico governante;
  * carico governante;
* risultati in unita di input:
  * geometria;
  * rigidezze adottate;
  * reazioni;
  * spostamenti;
  * diagrammi campionati `N`, `V`, `M`;
  * massimi/minimi principali.

Scelta importante gia fatta:

* per combinazioni con rigidezze diverse, la combinazione viene risolta come analisi FEM propria;
* non si assume che lo spostamento combinato sia sempre la somma scalata degli spostamenti dei casi elementari.

Da fare:

* inviluppi completi su casi e combinazioni: completati in prima versione per estremi principali;
* output piu ricco per diagrammi in punti notevoli e stazioni utente;
* adapter ufficiali verso i moduli specialistici di sezione.

### 4. Sezioni in calcestruzzo armato

Stato: motore di sezione implementato per SLU e SLE.

Componenti e capacita presenti:

* `ReinforcedConcreteSection`;
* sezione in cls piu armature discrete;
* materiali cls/acciaio NTC;
* discretizzazione a fibre;
* legami costitutivi per cls e acciaio;
* dominio `N-M` uniaxiale;
* dominio biaxiale;
* solver SLU;
* solver SLE con equilibrio tensionale;
* gestione di riferimento geometrico della sezione.

Da fare:

* trasformare il motore di sezione in provider per il modulo trave: completato in prima versione elastica;
* esporre rigidezze elastiche iniziali:
  * sezione lorda: completato;
  * sezione trasformata: completato;
  * eventuale sezione fessurata equivalente;
* esporre verifiche puntuali per azioni `N`, `V`, `M`;
* completare il modulo deflessioni fessurate.

### 5. Sezioni composte legno-calcestruzzo

Stato: workflow di verifica implementato; provider di rigidezza FEM estratto in prima versione.

Capacita presenti:

* calcolo tipo gamma method;
* `gammaUls`;
* `gammaSle`;
* `inertiaEffUls`;
* `inertiaEffSle`;
* verifiche su legno, soletta, connettori e freccia;
* gestione rigidezza connettori `Kser` / `Ku`;
* uso di materiali e sezioni gia modellati.

Completato:

* estrazione del provider context-aware `TimberConcreteCompositeBeamSectionProvider`;
* calcolo `gammaUls`, `gammaSle`, `inertiaEffUls`, `inertiaEffSle` riusando le formule del workflow esistente;
* restituzione di `EA`, `EI`, `GA`, unita e metadata;
* scelta automatica SLU/SLE dal context di `SingleBeamAnalysis`;
* uso di rigidezza finale per SLE come default, con possibilita di forzare comportamento istantaneo dal context;
* test di regressione sul caso workbook;
* test di integrazione con `SingleBeamAnalysis`.

Contratto implementato:

```js
getElasticBeamProperties(context)
```

Da fare:

* rifare le verifiche usando le azioni FEM lungo la trave, non solo le formule chiuse del caso appoggio-appoggio;
* affinare la distinzione tra SLE rara/frequente/quasi permanente quando servono rigidezze istantanee/finali diverse;
* portare nei metadata anche la classe di durata governante quando il provider verra usato insieme all'adapter NTC;
* aggiungere casi test con trave inclinata, carichi puntuali e vincoli diversi.

### 6. Sezioni composte legno-XLAM

Stato: workflow di verifica implementato; provider di rigidezza FEM estratto in prima versione.

Capacita presenti:

* modello collaborante tra trave lignea e pannello XLAM;
* calcolo e verifiche specifiche del sistema;
* uso di materiali lignei, sezione trave e sezione/pannello XLAM.

Completato:

* provider context-aware `TimberXlamCompositeBeamSectionProvider`;
* esposizione di `EA`, `EJ` come `flexuralRigidity`, `GA`, unita e metadata;
* scelta SLU/SLE dal context di `SingleBeamAnalysis`;
* selezione opzionale della rigidezza finale tramite `deformationState: "final"` o `serviceCombination: "final"`;
* metadata con `gamma1`, `gamma2`, bracci efficaci, rigidezza connettore, `kmod`, `kdef`, classe di servizio e coefficienti parziali;
* test di regressione sui risultati workbook;
* test di integrazione con `SingleBeamAnalysis`.

Da fare:

* predisporre verifiche puntuali su azioni FEM `N`, `V`, `M`.

### 7. Sezioni e pannelli XLAM

Stato: implementato per sezione/pannello out-of-plane.

Capacita presenti:

* `XlamPanelSection`;
* layer attivi e trasversali;
* rigidezza flessionale;
* rigidezza tagliante;
* verifiche out-of-plane;
* impostazione coerente con modello Timoshenko per pannelli/strisce.

Da fare:

* provider per usare una striscia XLAM come trave semplice;
* collegamento diretto al modulo trave Timoshenko;
* verifiche a flessione, taglio e deformazione da azioni FEM;
* vibrazioni;
* incendio con sezione ridotta;
* eventuale modulo pannello XLAM collaborante con profilo metallico.

### 8. Materiali, azioni e unita

Stato: base gia presente.

Capacita presenti:

* materiali cls, acciaio, legno, XLAM, muratura;
* cataloghi NTC per diversi materiali;
* `Action`, `PermanentAction`, `VariableAction` e derivate;
* fattori parziali e coefficienti psi NTC;
* classi di durata carico NTC;
* `kmod` per materiali lignei;
* layer di conversione unita.

Da fare:

* usare sistematicamente le `Action` nei carichi trave;
* generare automaticamente combinazioni da azioni e categorie NTC;
* assicurare che ogni provider riceva un contesto sufficiente per scegliere rigidezze e coefficienti.

## Moduli mancanti prioritari

### A. Adapter combinazioni normative per trave singola

Stato: implementato per NTC 2018.

Priorita: completata per il primo adapter NTC.

Scopo:

* generare automaticamente combinazioni SLU/SLE a partire da carichi classificati;
* non inserire la logica normativa dentro `SingleBeamAnalysis`;
* produrre combinazioni esplicite da passare al modulo trave.

Input atteso:

```js
{
  permanentActions: [G1, G2],
  variableActions: [Qk1, Qk2, ...],
  preset: "NTC2018",
  types: ["ULS", "SLE_RARE", "SLE_FREQUENT", "SLE_QUASI_PERMANENT"]
}
```

Output atteso:

```js
[
  {
    id: "ULS-live-leading",
    limitState: "ULS",
    combinationType: "ULS_STR_GEO",
    factors: {
      G1: 1.3,
      G2: 1.5,
      live: 1.5,
      snow: 0.75
    }
  },
  {
    id: "SLE-rare-live-leading",
    limitState: "SLE",
    combinationType: "SLE_RARE",
    factors: {
      G1: 1.0,
      G2: 1.0,
      live: 1.0,
      snow: 0.5
    }
  }
]
```

Note:

* il progetto contiene ora un adapter ergonomico per il modulo trave;
* ogni combinazione deve portare metadata sufficienti per provider context-aware:
  * `limitState`;
  * tipo combinazione;
  * variabile principale;
  * azioni accompagnatrici;
  * classi di durata.

Completato:

* `createNTC2018BeamCombinations`;
* generazione SLU fondamentale con variabile principale;
* generazione SLE rara, frequente e quasi permanente;
* coefficienti da `Action` NTC o da categorie tabellate;
* metadata per `limitState`, tipo combinazione, variabile principale, azioni accompagnatrici e durate;
* test di integrazione con `SingleBeamAnalysis`.

### B. Provider di rigidezza ufficiali

Priorita: alta.

Provider da creare:

* `ReinforcedConcreteBeamSectionProvider`;
* `TimberBeamSectionProvider`: completato come provider elastico context-aware;
* `SteelBeamSectionProvider`;
* `TimberConcreteCompositeBeamProvider`;
* `TimberXlamCompositeBeamProvider`;
* `XlamBeamStripProvider`.

Contratto comune:

```js
getElasticBeamProperties(context)
```

Risposta comune:

```js
{
  axialRigidity,
  flexuralRigidity,
  shearRigidity,
  shearCorrectionFactor,
  units,
  metadata
}
```

Il provider deve essere il punto in cui si decidono:

* rigidezza da usare in SLU o SLE;
* rigidezza istantanea o finale;
* eventuale `gamma` di collaborazione;
* eventuale `kmod`;
* eventuale `kdef`;
* eventuale stato fessurato/non fessurato.

### C. Interfaccia comune per verifiche di sezione

Priorita: alta.

Stato: implementata in prima versione.

Scopo:

* usare i diagrammi FEM per verificare la sezione lungo la trave;
* non far conoscere al modulo trave le formule dei materiali.

Contratto implementato:

```js
verifySectionActions({
  nEd,
  vEd,
  mEd,
  x,
  context
})
```

Risposta consigliata:

```js
{
  status,
  utilizationRatio,
  checks,
  warnings,
  metadata
}
```

Ogni modulo materiale deve implementare questo contratto a modo suo.

Completato:

* `BeamSectionActionVerifier`;
* funzione helper `verifyBeamSectionActions`;
* scansione dei sample FEM `N`, `V`, `M`;
* filtro per stato limite, per esempio solo `ULS`;
* aggregazione di checks, warning, assunzioni e risultato governante;
* primo collegamento reale nel verificatore di trave in legno per flessione e taglio.

Da fare:

* applicare lo stesso contratto ai moduli composti: completato in prima versione per legno-calcestruzzo e legno-XLAM;
* distinguere stazioni critiche da stazioni solo informative;
* rendere configurabile la densita di campionamento richiesta dalle verifiche;
* separare meglio verifiche di sezione e verifiche globali, come freccia e vibrazioni.

### D. Inviluppi

Priorita: media-alta.

Stato: implementati in prima versione.

Completato nel modulo trave:

* massimo/minimo momento;
* massimo/minimo taglio;
* massimo/minimo sforzo normale;
* massima freccia verticale;
* combinazione governante;
* inviluppi separati per SLU e SLE.

Da aggiungere:

* massime reazioni;
* inviluppi completi campionati per diagrammi continui;
* stazioni utente e punti notevoli;
* posizione governante gia disponibile nel sample, ma da rendere piu ergonomica nei report.

### E. Report strutturato

Priorita: media.

Ogni workflow completo dovrebbe restituire:

* input normalizzati;
* combinazioni generate;
* proprieta di rigidezza usate per ogni combinazione;
* diagrammi;
* inviluppi;
* verifiche;
* assunzioni;
* warning diagnostici.

## Moduli applicativi da completare

### 1. Travi in legno semplice

Stato: provider elastico implementato; primo verificatore flessione/taglio/freccia implementato.

Priorita: alta.

Motivo:

* e il primo workflow ideale per validare combinazioni, `kmod`, `kdef`, modulo trave e verifiche materiali.

Da implementare:

* provider elastico per legno semplice: completato;
* verifiche:
  * flessione: completata in prima versione da risultati FEM;
  * taglio: completato in prima versione da risultati FEM;
  * compressione/tensione parallela se rilevante;
  * instabilita laterale se necessaria;
  * deformazione istantanea: completata in prima versione da risultati FEM;
  * deformazione finale con `kdef`: predisposta nel provider, da collegare a workflow dedicato;
* gestione:
  * classe di servizio;
  * durata carico governante;
  * `kmod`;
  * coefficienti parziali;
  * limiti di freccia.

Possibile riuso:

* estrarre la parte legno gia presente nel modulo legno-calcestruzzo;
* usare materiali e cataloghi NTC gia disponibili.

### 2. Travi composte legno-calcestruzzo

Priorita: alta.

Completato:

* separare calcolo rigidezze efficaci da verifiche;
* esporre provider context-aware;
* usare `SingleBeamAnalysis` per ottenere diagrammi e spostamenti in un test di integrazione;
* mantenere un test di regressione sul workbook esistente.
* usare opzionalmente i diagrammi FEM per `M`, `V` e frecce quando `model.analysisResult` e disponibile.
* esporre un adapter `verifySectionActions` per verifiche ULS lungo le stazioni FEM, mantenendo il workflow standalone da workbook.
* collegare l'adapter al workflow `SingleBeamDesignApplication` tramite input `{ model, analysisResult }`, senza mutare il modello applicativo.

Da fare:

* aggiungere test su geometrie inclinate e combinazioni generate da adapter NTC.

### 3. Travi composte legno-XLAM

Priorita: alta.

Completato:

* provider rigidezza efficace;
* gestione base di stato limite e rigidezza istantanea/finale;
* test di collegamento al modulo trave.
* uso opzionale dei diagrammi FEM per `M`, `V` e frecce quando `model.analysisResult` e disponibile.
* esporre un adapter `verifySectionActions` per verifiche ULS lungo le stazioni FEM, mantenendo il workflow standalone da workbook.
* collegare l'adapter al workflow `SingleBeamDesignApplication` tramite input `{ model, analysisResult }`, senza mutare il modello applicativo.

Da fare:

* gestione di taglio Timoshenko e deformazioni.

### 4. Travi / sezioni in acciaio

Priorita: media-alta.

Stato: provider elastico implementato in prima versione.

Completato:

* provider elastico da profili acciaio;
* collegamento a `SingleBeamAnalysis` anche con modello Timoshenko;
* metadata con profilo, famiglia, grado acciaio, `fyk`, `fyd`, `gammaM0`, resistenza elastica/plastica a flessione e resistenza a taglio base.
* verifiche base lungo trave tramite `verifySectionActions`:
  * flessione elastica;
  * taglio;
  * sforzo normale;
  * interazione lineare assiale-flessione.

Da implementare:

* verifiche avanzate:
  * instabilita flesso-torsionale;
  * instabilita di asta compressa;
  * interazioni normative piu raffinate;
* deformazioni SLE;
* classificazione sezione, se si vuole impostazione normativa completa;
* collegamento al database profili gia presente.

### 5. Deflessioni di travi in c.a. fessurate

Priorita: alta, ma complessita maggiore.

Obiettivo:

* calcolare frecce di travi in c.a. considerando la parzializzazione/fessurazione della sezione.

Workflow consigliato:

1. costruire la trave con sezione in c.a., materiali, geometria, vincoli e carichi SLE;
2. risolvere il modello FEM lineare con rigidezza iniziale non fessurata;
3. ottenere `N(x)`, `V(x)`, `M(x)`;
4. campionare la trave in punti regolari e in corrispondenza di discontinuita;
5. calcolare `Mcr` positivo e negativo;
6. se `|M(x)| <= Mcr`, usare curvatura non fessurata;
7. se `|M(x)| > Mcr`, usare il solver SLE di sezione con cls teso escluso;
8. predisporre tension stiffening o curvatura media;
9. integrare la curvatura lungo la trave;
10. restituire freccia, rotazioni, zone fessurate e warning sui punti non convergenti.

MVP:

* trave prismatica;
* sezione costante;
* appoggio-appoggio e mensola;
* carico uniforme e carichi puntuali;
* Euler-Bernoulli iniziale;
* nessuna rianalisi FEM iterativa della rigidezza;
* test contro formule elastiche quando la sezione non fessura;
* test in cui la freccia fessurata e maggiore della freccia non fessurata.

Output attesi:

* reazioni;
* diagrammi `N`, `V`, `M`;
* diagramma curvatura;
* rotazioni;
* frecce;
* zone fessurate;
* `Mcr+` e `Mcr-`;
* elenco punti non convergenti;
* assunzioni adottate.

### 6. Sistemi misti futuri

Priorita: media-bassa, dopo i workflow principali.

Idee da mantenere:

* `SteelConcreteCompositeSection` per profili metallici collaboranti con soletta;
* modulo pannello XLAM + profilo metallico;
* estensioni XLAM per vibrazioni e incendio.

## Roadmap operativa consigliata

### Fase corrente - MVP esempi, verifiche e report

Stato: avviata.

Obiettivo:

* arrivare in poco tempo a una serie di esempi completi di travi semplici;
* coprire materiali e sezioni diverse;
* generare per ogni esempio un report JSON completo e un report Markdown leggibile;
* usare gli esempi come base futura per CLI, API e frontend React.

Architettura consigliata:

* creare un orchestratore applicativo dedicato, per esempio `SingleBeamDesignApplication`;
* non caricare questa responsabilita su `SingleBeamAnalysis`, che deve restare il motore FEM della trave;
* creare un modello applicativo serializzabile, per esempio `SingleBeamDesignModel`;
* creare un builder di report separato, per esempio `BeamReportBuilder`;
* tenere separati:
  * analisi FEM;
  * provider di rigidezza;
  * verificatore materiale;
  * report;
  * cataloghi/preset normativi.

Contratto operativo del workflow:

```js
{
  modelDescription,
  normalizedInput,
  analysisResult,
  verificationResult,
  report: {
    json,
    markdown
  }
}
```

Report JSON:

* deve contenere input normalizzati, unita, combinazioni, risultati FEM, verifiche, warning e assunzioni;
* deve essere stabile e consumabile da test, API e frontend;
* deve evitare oggetti ciclici o istanze non serializzabili;
* deve conservare riferimenti a combinazione governante, stazione governante e verifica governante.

Report Markdown:

* deve essere generato dal JSON o dagli stessi DTO del JSON;
* deve includere descrizione del modello, schema statico, materiali, sezione, carichi e combinazioni;
* deve riportare rigidezze adottate per combinazione, reazioni, spostamenti, inviluppi e verifiche;
* deve elencare esplicitamente assunzioni, warning e limiti del metodo;
* non deve contenere logica di calcolo.

Esempi prioritari da creare:

1. trave in legno massiccio C24, sezione rettangolare, appoggio-appoggio, carichi `G1`, `G2`, `Qk`;
2. trave in legno lamellare GL24h, sezione rettangolare alta, controllo freccia piu evidente;
3. trave in acciaio S275 con profilo IPE, appoggio-appoggio, verifiche base a flessione, taglio, assiale e interazione;
4. mensola in acciaio S355 con profilo HEA/IPE e carico puntuale in estremita;
5. trave in c.a. C25/30 + B450C con sezione rettangolare armata, per ora analisi elastica non fessurata e report con limiti dichiarati;
6. trave composta legno-calcestruzzo usando il provider context-aware e i diagrammi FEM;
7. trave composta legno-XLAM usando il provider context-aware e combinazioni SLE istantanea/finale;
8. striscia XLAM come trave Timoshenko, dopo aver completato il provider dedicato.

Priorita verifiche:

1. legno semplice: chiudere il workflow end-to-end con flessione, taglio, freccia istantanea e freccia finale;
2. acciaio: consolidare verifiche base e reportare chiaramente che instabilita e classificazione non sono ancora incluse;
3. composti legno-calcestruzzo e legno-XLAM: mantenere i workflow storici standalone, ma aggiungere adapter piu coerenti con `verifySectionActions`: completato in prima versione;
4. c.a.: usare subito il provider elastico per esempi di analisi, poi aggiungere verifiche di sezione da azioni FEM;
5. c.a. fessurato: lasciarlo dopo il primo pacchetto di esempi/report, perche e il blocco con complessita maggiore.

Criteri di accettazione per ogni esempio:

* il modello gira senza eccezioni;
* genera almeno una combinazione SLU e una SLE quando applicabile;
* produce reazioni, spostamenti, diagrammi e inviluppi;
* produce un report JSON serializzabile;
* produce un report Markdown leggibile;
* indica verifica governante, combinazione governante e stazione governante quando disponibili;
* contiene warning chiari per le verifiche non ancora implementate;
* ha almeno un test automatico leggero di regressione.

Cose mancanti per chiudere questa fase:

* creare `SingleBeamDesignApplication` o equivalente: completato in prima versione;
* creare `SingleBeamDesignModel` o DTO equivalente: completato in prima versione;
* creare `BeamReportBuilder`: completato in prima versione;
* aggiungere script esempio, per esempio `npm run example:beam-reports`: completato con tutti gli esempi MVP;
* aggiungere script di esportazione file JSON/Markdown: completato con `npm run example:beam-reports:write`;
* aggiungere fixture esempi in una cartella dedicata: completato in prima versione con `examples/beam-report-fixtures.js`;
* aggiungere test sui report JSON/Markdown: completato in prima versione per legno e acciaio;
* completare inviluppi di reazione e stazioni utente: completato in prima versione;
* completare freccia finale nel workflow legno semplice: completato in prima versione tramite combinazioni quasi permanenti/finali e check dedicato;
* portare i composti verso il contratto comune di verifica lungo trave: completato in prima versione con adapter `verifySectionActions` per legno-calcestruzzo e legno-XLAM, usando `BeamSectionActionVerifier` quando e disponibile `analysisResult`;
* creare una prima verifica c.a. da azioni FEM o dichiarare esplicitamente nel report che il c.a. e solo analisi elastica in questa fase: completato in prima versione per verifica ULS uniaxiale `N-M`;
* stabilizzare i DTO pensati per il futuro frontend React: completato in prima versione con documento DTO e artefatti report JSON/Markdown.

### Fase 1 - Chiudere il ponte normativo

Stato: completata per NTC 2018.

1. creare adapter NTC per combinazioni di trave singola: completato;
2. collegare le `Action` esistenti ai carichi del modulo trave: completato;
3. generare SLU, SLE rara, frequente e quasi permanente: completato;
4. portare nel context:
   * `limitState`;
   * tipo combinazione;
   * variabile principale;
   * classi di durata;
   * fattori psi e gamma usati: completato per metadata e fattori di combinazione.

Risultato atteso:

* il modulo trave riceve combinazioni gia esplicite e completamente annotate.

### Fase 2 - Provider legno semplice

Stato: completata per il provider elastico; verifiche da completare.

1. creare `TimberBeamSectionProvider`: completato;
2. usare `context.governingLoadDurationClass` per scegliere `kmod`: completato;
3. distinguere rigidezza istantanea e finale: completato tramite `deformationState: "final"` / `kdef`;
4. aggiungere verifiche flessione, taglio e freccia: completato in prima versione;
5. testare travi appoggiate e mensole: avviato per integrazione FEM/provider e verifiche base.

Risultato atteso:

* primo workflow end-to-end completo: input trave, combinazioni, FEM, verifiche legno, frecce.

### Fase 3 - Provider composti

Stato: completata in prima versione per legno-calcestruzzo e legno-XLAM.

1. rifattorizzare legno-calcestruzzo: completato in prima versione;
2. rifattorizzare legno-XLAM: completato in prima versione;
3. esporre `EIeff`, `gamma`, `kmod`, `kdef` nei metadata: completato per legno-calcestruzzo e legno-XLAM;
4. mantenere test di regressione sui risultati esistenti: completato per legno-calcestruzzo e legno-XLAM;
5. far risolvere al FEM anche geometrie inclinate e vincoli diversi: da estendere nei test.

Risultato atteso:

* moduli composti collegati al nuovo motore trave senza duplicare logica FEM.

### Fase 4 - Inviluppi e verifiche lungo trave

Stato: avviata; inviluppi principali e interfaccia comune di verifica implementati.

1. aggiungere inviluppi a `SingleBeamAnalysis`: completato in prima versione;
2. definire `verifySectionActions`: completato in prima versione;
3. applicare verifiche a tutte le stazioni FEM o a stazioni critiche: completato in prima versione per legno semplice, acciaio, c.a. `N-M`, legno-calcestruzzo e legno-XLAM;
4. restituire verifiche governanti.

Risultato atteso:

* output pronto per report e interfaccia utente.

### Fase 5 - C.A. fessurato

Stato: avviata.

1. creare provider RC per rigidezza iniziale: completato in prima versione per sezione lorda e trasformata non fessurata;
2. usare il motore RC SLE per curvatura fessurata;
3. integrare curvature;
4. validare contro casi semplici;
5. aggiungere opzioni lungo termine.

Risultato atteso:

* calcolo frecce in c.a. realmente utile in esercizio.

### Fase 6 - Acciaio

Stato: avviata.

1. provider elastico profili acciaio: completato in prima versione;
2. verifiche base: completate in prima versione;
3. instabilita;
4. classificazione sezione;
5. report.

Risultato atteso:

* workflow completo per travi semplici in acciaio.

## Criteri di qualita da mantenere

Ogni nuovo modulo dovrebbe:

* avere test numerici su casi semplici e verificabili;
* usare il layer unita in ingresso e in uscita;
* dichiarare le assunzioni adottate;
* conservare nei risultati i coefficienti usati;
* non duplicare formule FEM;
* non incorporare logica normativa nel core trave;
* restituire warning chiari quando un calcolo e fuori dominio;
* permettere di sostituire provider e verificatori senza cambiare il modulo trave;
* funzionare, quando possibile, sia come modulo standalone sia come modulo collegato a `SingleBeamAnalysis`;
* produrre risultati serializzabili e stabili per un futuro frontend React;
* separare calcolo, verifica, report e presentazione grafica.

## Checklist sintetica

Completato:

* solver lineare denso;
* core FEM 2D;
* elementi Euler-Bernoulli e Timoshenko;
* preprocessore linea trave;
* modulo trave singola FEM;
* provider elastico base;
* analisi sezione c.a. SLU/SLE;
* workflow legno-calcestruzzo;
* workflow legno-XLAM;
* sezione e pannello XLAM;
* cataloghi/materiali/azioni NTC di base;
* adapter NTC 2018 per combinazioni di trave semplice;
* provider elastico legno semplice;
* provider elastico acciaio da profili;
* provider c.a. per rigidezza lorda e trasformata non fessurata;
* provider context-aware per legno-calcestruzzo;
* provider context-aware per legno-XLAM;
* interfaccia `verifySectionActions` e helper `BeamSectionActionVerifier`;
* verifiche base legno semplice da azioni FEM;
* verifiche base acciaio da azioni FEM;
* verifiche base composte legno-calcestruzzo e legno-XLAM da azioni FEM tramite adapter `verifySectionActions`;
* inviluppi principali di `N`, `V`, `M` e freccia.

Da fare a breve:

* creare orchestratore applicativo per esempi completi di trave semplice;
* creare report JSON e Markdown: completato in prima versione;
* aggiungere esempi legno C24, legno lamellare, acciaio IPE, acciaio mensola, c.a. elastico, legno-calcestruzzo, legno-XLAM: completato in prima versione;
* applicare `verifySectionActions` o adapter equivalenti ai moduli composti: completato in prima versione per legno-calcestruzzo e legno-XLAM;
* completare freccia finale nel workflow legno semplice: completato in prima versione;
* aggiungere inviluppi di reazione e stazioni utente: completato in prima versione;
* stabilizzare DTO serializzabili per futuro frontend React: completato in prima versione con `SingleBeamDesignModel`, `BeamReport`, `BeamReportArtifact` e `docs/beam-report-dto.md`;
* aggiungere test automatici sui report e sugli esempi: completato in prima versione.

Da fare dopo:

* ogni verifica avanzata deve essere discussa e approvata prima dell'implementazione, con campo di applicazione, assunzioni, formule e test attesi;
* verifiche acciaio avanzate: instabilita flesso-torsionale, aste compresse, classificazione sezione;
* completare verifiche c.a. avanzate da azioni FEM: taglio, fessurazione, esercizio e deflessioni fessurate;
* vibrazioni XLAM;
* incendio XLAM;
* sistemi misti acciaio-calcestruzzo;
* pannelli XLAM collaboranti con profili metallici.
