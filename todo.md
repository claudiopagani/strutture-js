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

Nota taglio c.a. approvata:

* il taglio deve distinguere elementi senza armatura trasversale e con armatura trasversale;
* per NTC 2018 4.1.2.3.5.1 non si devono dedurre automaticamente `d`, `bw` e armature longitudinali tese per sezioni generiche;
* `bw` puo essere derivato solo per rettangoli e sezioni a T chiare, altrimenti deve essere esplicito;
* `d` e `Asl` devono essere espliciti o derivati da un gruppo di armature longitudinali dichiarato;
* lo sforzo normale di compressione deve avere convenzione di segno dichiarata e non deve aumentare la resistenza se e di trazione;
* per NTC 2018 4.1.2.3.5.2 l'MVP accetta staffe verticali con diametro, numero di bracci, interasse e acciaio;
* per sezioni armate a taglio `cotTheta` deve essere scelto nel range ammesso per massimizzare `min(VRsd, VRcd)`, cioe il minimo tra meccanismo resistente a trazione delle staffe e meccanismo resistente a compressione del puntone;
* quando sono disponibili anche i parametri del caso senza armatura trasversale, la resistenza a taglio della sezione armata e assunta come `max(VRd con staffe, VRd senza staffe)`;
* dettagli costruttivi, minimi di armatura, ancoraggi, torsione e casi generici restano fuori dal primo MVP.

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

Stato: MVP completato per travi semplici da azioni FEM, con resistenza di sezione governata dalla classe, controlli di stabilita principali e dominio di pressoflessione `N + My`.

Completato:

* provider elastico da profili acciaio;
* unita del provider acciaio corrette: rigidezze e resistenze esposte in `N/mm` e convertite dal motore FEM nelle unita del modello;
* collegamento a `SingleBeamAnalysis` anche con modello Timoshenko;
* metadata con profilo, famiglia, grado acciaio, `fyk`, `fyd`, `gammaM0`, resistenza elastica/plastica a flessione e resistenza a taglio base.
* verifiche base lungo trave tramite `verifySectionActions`:
  * flessione governata dalla classe locale: `Wpl` per classi 1-2, `Wel` per classe 3;
  * taglio;
  * sforzo normale;
  * screening tensionale con modulo resistente selezionato;
  * interazione lineare assiale-flessione.
* verifica SLE di freccia verticale da combinazioni FEM con limite default `L/250` modificabile;
* classificazione locale della sezione per stazioni FEM ULS, dipendente da `N-M`;
* classificazione profili I/H (`IPE`, `HEA`, `HEB`, `HEM`) e `UPN`;
* instabilita flesso-torsionale MVP:
  * calcolo automatico `Mcr` per profili I/H doppiamente simmetrici;
  * verifica `UPN` possibile con `Mcr` fornito dall'utente;
  * input per lunghezza libera laterale o segmenti non controventati;
* instabilita di aste compresse secondo NTC 2018:
  * calcolo `Ncr,y/z`, snellezze normalizzate, curve di instabilita e coefficienti `chi_y/chi_z`;
  * lunghezze libere `y/z` configurabili;
  * default inferito dai vincoli della trave semplice: appoggio-appoggio `1L`, mensola `2L`, incastro-cerniera `0.7L`, incastro-incastro `0.5L`;
* interazione normativa di stabilita `N + My` secondo Metodo B della Circolare:
  * due disuguaglianze con `chi_y`, `chi_z`, `chiLT`, `kyy`, `kzy`;
  * termini `Mz` nulli per dominio attuale;
  * coefficienti di momento `alphaMy` e `alphaMLT` configurabili, default `1.0`;
* blocco prudente per sezioni in classe 4 con warning su proprieta efficaci non implementate;
* integrazione nei report JSON/Markdown di trave semplice;
* test automatici su provider, ULS, SLE e report;
* documentazione metodo in `docs/steel-beam-method.md`.

Da implementare dopo approvazione:

* verifiche avanzate:
  * affinare la classificazione per pressoflessione forte e casi con convenzione assiale esplicita;
  * affinare instabilita flesso-torsionale con coefficienti di momento, quote di applicazione carico, vincoli torsionali e casi non doppiamente simmetrici;
  * estendere la pressoflessione da `N + My` a `N + My + Mz`;
  * interazioni normative piu raffinate e casi non doppiamente simmetrici, inclusi `UPN` senza override manuale;
  * influenza del taglio sulla resistenza a flessione;
  * torsione e interazioni torsionali;
* per sezioni in classe 4, mantenere blocco con warning esplicito e, in futuro, implementare la sezione efficace per permettere la verifica;
* definizione input per vincoli laterali, lunghezze libere e coefficienti di vincolo.

### 5. Taglio di travi in c.a.

Stato: completato in prima versione MVP.

Completato:

* `ReinforcedConcreteShearVerification` standalone;
* modalita `without-transverse-reinforcement` per NTC 2018 4.1.2.3.5.1;
* modalita `with-transverse-reinforcement` per NTC 2018 4.1.2.3.5.2 con staffe verticali;
* scelta automatica di `cotTheta` per massimizzare `min(VRsd, VRcd)` nel campo ammesso;
* per sezioni con staffe, confronto tra resistenza con armatura trasversale e resistenza senza armatura trasversale quando i parametri necessari sono disponibili;
* resolver prudente dei parametri:
  * `bw` esplicito oppure derivato solo da sezione rettangolare o T;
  * `d` esplicito oppure derivato da gruppo barre;
  * `Asl` esplicito oppure derivato da gruppo barre;
  * `rhoL`, `sigmaCp`, `nEdCompression` e fonti dei dati riportati negli output;
* collegamento opzionale a `ReinforcedConcreteBeamVerification` da azioni FEM;
* report dell'esempio c.a. aggiornato con verifica a taglio con staffe;
* test automatici standalone e integrati.

Da completare dopo approvazione:

* minimi di armatura e limiti geometrici delle staffe;
* angoli staffe diversi da 90 gradi;
* torsione e interazione taglio-torsione;
* gestione avanzata di sezioni generiche/poligonali;
* selezione automatica del gruppo teso lungo la trave in base al segno del momento, da usare solo con regole dichiarate.

### 6. Verifiche SLE di travi in c.a.

Stato: avviato con tensioni, fessurazione indiretta e deformazioni MVP.

Completato:

* `ReinforcedConcreteServiceabilityVerification` standalone;
* integrazione opzionale in `ReinforcedConcreteBeamVerification` sulle combinazioni SLE;
* layout dichiarativo delle armature longitudinali top/bottom per sezioni rettangolari e a T tramite diametro, numero e copriferro;
* gruppi `top`/`bottom` salvati nei metadata della sezione e riusati da fessurazione, SLE e taglio;
* tensioni di esercizio con sezione parzializzata e metodo `n`;
* default `n = 15`;
* limiti di tensione NTC 2018 4.1.2.2.5:
  * calcestruzzo in combinazione caratteristica/rara;
  * calcestruzzo in combinazione quasi permanente;
  * acciaio in combinazione caratteristica/rara;
* fessurazione indiretta per armature ordinarie poco sensibili con tabelle C4.1.II e C4.1.III;
* default ambiente `ordinary`;
* verifica del diametro massimo e della spaziatura massima delle barre tese;
* report JSON/Markdown con tensioni, limiti, classe di apertura `w1/w2/w3`, barra governante e metadata;
* calcolo freccia MVP tramite integrazione delle curvature su combinazioni SLE;
* viscosita gestita con `phi = 2.0` di default e modificabile negli input;
* ritiro escluso dal primo modello di deformazione, con assunzione riportata nei metadata;
* confronto semplificato di snellezza della trave secondo tabella Circolare-like.
* validazione automatica dei fattori limite SLE `0.60 fck`, `0.45 fck`, `0.80 fyk`;
* validazione della mappatura ambiente/combinazione verso classi `w1/w2/w3`;
* validazione della selezione del gruppo teso `bottom`/`top` in base al segno del momento;
* per sezioni definite per punti o generiche, richiesta esplicita dei gruppi superiori/inferiori senza deduzioni automatiche;
* validazione del blocco prudente per sezioni generiche senza gruppi espliciti;
* validazione di viscosita configurabile nella freccia e ritiro escluso;
* documentazione metodo SLE in `docs/reinforced-concrete-sle-method.md`.

Da completare:

* validare/raffinare la deformazione con casi di riferimento e storia di carico piu completa, separando meglio quote istantanee e differite;
* validare il confronto di snellezza semplificato con casi dedicati e valori di riferimento della Circolare;
* casi ambientali aggressivi/molto aggressivi da ampliare con esempi numerici di progetto, oltre alla mappatura tabellare gia coperta;
* migliorare editor/API per sezioni generiche con dichiarazione guidata dei gruppi superiori/inferiori;
* possibilita di aggiungere armature extra oltre ai layer principali top/bottom, mantenendo chiara la loro appartenenza o esclusione dai gruppi di verifica.

### 7. Deflessioni di travi in c.a. fessurate

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

Decisione MVP approvata:

* la viscosita entra con coefficiente `phi = 2.0` di default;
* `phi` deve essere modificabile manualmente dall'utente negli input della verifica;
* il ritiro non viene considerato nel primo modello di deformazione;
* il report deve dichiarare esplicitamente `phi`, se la deformazione e istantanea o differita, e che il ritiro e escluso.

Prima implementazione completata:

* `CrackedSectionDeflectionAnalysis` integra le curvature dai risultati FEM SLE;
* modello di sezione fessurata no-tension con tension stiffening MVP;
* verifica `rc-sle-deflection-curvature` per la freccia calcolata;
* verifica `rc-sle-deflection-slenderness` per il confronto semplificato di snellezza;
* test automatici dedicati su casi non fessurati e fessurati.

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

### 8. Sistemi misti futuri

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
2. acciaio: consolidare verifiche base, classificazione locale, uso plastico controllato dalla classe, LTB MVP, aste compresse, interazione `N + My` e report; restano da discutere estensione `Mz`, torsione/interazioni torsionali, affinamenti LTB e sezioni efficaci di classe 4;
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
5. aggiungere opzioni lungo termine con `phi = 2.0` modificabile e ritiro escluso dal primo MVP.

Risultato atteso:

* calcolo frecce in c.a. realmente utile in esercizio.

### Fase 6 - Acciaio

Stato: MVP completato per trave semplice nel dominio attuale `N + My`.

1. provider elastico profili acciaio: completato in prima versione;
2. verifiche base ULS, resistenza di sezione governata dalla classe e freccia SLE: completate in prima versione;
3. classificazione sezione locale per stazioni FEM ULS: completata in prima versione per I/H e UPN;
4. instabilita flesso-torsionale MVP: completata in prima versione per I/H automatico e UPN con `Mcr` utente;
5. blocco prudente classe 4: completato con warning su proprieta efficaci non implementate;
6. report JSON/Markdown: completati in prima versione;
7. instabilita di asta compressa: completata in prima versione con lunghezze efficaci configurabili e default da vincoli di trave semplice;
8. pressoflessione normativa `N + My`: completata in prima versione con Metodo B della Circolare per sezioni I/H doppiamente simmetriche di classe 1-3;
9. da fare dopo approvazione: estensione `N + My + Mz`, torsione/interazioni torsionali, affinamenti LTB, casi non doppiamente simmetrici completi, sezioni efficaci classe 4.

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

## Fase attiva - Chiusura travi semplici

Decisione corrente:

* completare ora:
  * campagna di validazione;
  * stazioni di verifica piu controllabili;
  * esempi aggiuntivi mirati;
  * validazione SLE c.a. piu profonda;
  * XLAM come trave;
  * schema DTO/frontend piu formale;
* conservare nel backlog gli altri sviluppi avanzati, senza implementarli in questa fase.

### A. Campagna di validazione

Obiettivo:

* costruire una campagna di test numerici ripetibile, con casi semplici e valori attesi documentati;
* separare casi di validazione da esempi dimostrativi;
* produrre output consultabili in JSON/Markdown o snapshot testabili.

Prima implementazione completata:

* creata cartella dedicata `validation/`;
* definita struttura dati comune per casi di validazione: input calcolato da `evaluate`, valore atteso, tolleranza, fonte, note;
* aggiunto comando `npm run validation`, con output Markdown o JSON tramite `-- --json`;
* integrata la campagna in `npm test`;
* creato documento `docs/beam-validation-campaign.md`;
* casi iniziali:
  * trave Euler-Bernoulli appoggio-appoggio con carico uniforme contro formule chiuse;
  * classificazione acciaio IPE200 S275 in flessione pura;
  * taglio c.a. con staffe verticali e ottimizzazione `cotTheta` contro regressione dal foglio utente;
  * selezione stazioni utente tramite `verificationStations`.

Da ampliare:

* acciaio:
  * classificazione sezione;
  * flessione/taglio/assiale;
  * LTB;
  * aste compresse;
  * interazione `N + My`;
* c.a.:
  * SLU `N-M`;
  * taglio senza staffe;
  * taglio con staffe;
  * SLE tensioni;
  * fessurazione indiretta;
  * frecce fessurate;
* legno e composti:
  * appoggio-appoggio;
  * mensola;
  * carichi puntuali;
  * geometrie inclinate;
  * combinazioni con rigidezze diverse;
* esportazione opzionale degli artefatti di validazione in `results/validation-campaign`.

### B. Stazioni di verifica piu controllabili

Obiettivo:

* distinguere in modo esplicito stazioni FEM, stazioni informative, stazioni critiche e stazioni utente;
* rendere configurabile la densita di campionamento usata dalle verifiche;
* evitare che una verifica importante dipenda solo dalla discretizzazione FEM di default.

Prima implementazione completata:

* introdotta una configurazione stabile, per esempio:

```js
verificationStations: {
  mode: "all" | "auto" | "user" | "combined" | "critical",
  count: 21,
  includeSupports: true,
  includeLoadPoints: true,
  includeExtrema: true,
  userStations: [0, 2.5, 5]
}
```

* `SingleBeamAnalysis` inserisce nella mesh le stazioni di griglia e utente dichiarate;
* `SingleBeamDesignApplication` propaga `verificationStations` al verificatore materiale;
* `BeamSectionActionVerifier` puo usare tutte le stazioni, solo quelle utente, una griglia, combinazioni griglia+utente o le stazioni critiche;
* i verificatori c.a., acciaio, legno, legno-calcestruzzo e legno-XLAM accettano la stessa configurazione;
* metadata dei check aggiornati con:
  * `stationSource`;
  * `stationRole`;
  * `isUserStation`;
  * `isGridStation`;
  * `isCriticalStation`;
  * `stationSelectionMode`;
* report JSON/Markdown alimentati dai metadata dei check;
* test automatici su inserimento stazioni e filtro per stazioni utente.

Da raffinare:

* usare in modo esplicito le opzioni `includeSupports`, `includeLoadPoints` e `includeExtrema` per costruire set misti di verifica;
* aggiungere test su campionamento molto rado/fitto e modalita `critical`;
* valutare una tabella dedicata nel report Markdown per spiegare le stazioni verificate, oltre ai metadata dei singoli check.

### C. Esempi aggiuntivi mirati

Obiettivo:

* coprire casi che esercitano davvero i warning, i limiti e le nuove verifiche;
* usare gli esempi come materiale di test, documentazione e futura UI.

Prima implementazione completata:

* acciaio `UPN200` con `Mcr` fornito dall'utente;
* acciaio `IPE200` con carico assiale e momento, per mostrare il check `N + My`;
* c.a. in ambiente aggressivo con fessurazione SLE nei metadata di report;
* legno C24 a mensola con carico puntuale;
* test sui report mirati per verificare metadata `UPN`/`Mcr` utente e ambiente aggressivo c.a.;

Da aggiungere:

* acciaio classe 4, con blocco e warning su proprieta efficaci non implementate;
* c.a. senza staffe e c.a. con staffe in due report affiancati;
* trave composta con carico puntuale o geometria inclinata;
* striscia XLAM Timoshenko.

### D. Validazione SLE c.a. piu profonda

Obiettivo:

* trasformare lo SLE c.a. da MVP prudente a modulo piu affidabile per uso ricorrente.

Prima implementazione completata:

* aggiunti alla campagna di validazione:
  * limiti tensionali SLE `0.60 fck`, `0.45 fck`, `0.80 fyk`;
  * mappatura ambiente/combinazione verso classi di fessurazione `w1/w2/w3`;
  * selezione gruppo teso `bottom`/`top` in funzione del segno del momento;
* aggiunto report c.a. in ambiente aggressivo.

Da raffinare:

* validare tensioni con metodo `n` contro casi manuali esterni:
  * sezione non fessurata;
  * sezione fessurata;
  * momento positivo e negativo;
* validare fessurazione indiretta con esempi numerici di progetto:
  * ambiente ordinario;
  * ambiente aggressivo;
  * ambiente molto aggressivo;
  * combinazione rara/frequente/quasi permanente quando applicabile;
* validare deformazioni:
  * caso non fessurato contro formula elastica;
  * caso fessurato con freccia maggiore della non fessurata;
  * effetto di `phi` modificabile;
  * ritiro escluso e dichiarato nei metadata;
* validare confronto semplificato di snellezza con casi dedicati;
* migliorare metadata e report:
  * quota istantanea;
  * quota differita;
  * `phi`;
  * zone fessurate;
  * punti non convergenti;
* ampliare esempi numerici con classi ambientali diverse.

### E. XLAM come trave

Obiettivo:

* usare una striscia di pannello XLAM come trave semplice Timoshenko;
* ottenere analisi FEM, verifiche e report come per gli altri materiali.

Prima implementazione completata:

* creato provider dedicato `XlamBeamSectionProvider`;
* esposti:
  * `EA`;
  * `EI`;
  * `GA`;
  * unita;
  * metadata di layer, orientamento, larghezza efficace e prodotto;
* collegato il provider a `SingleBeamAnalysis` con modello Timoshenko;
* creato verificatore trave XLAM da azioni FEM:
  * flessione;
  * taglio;
  * deformazione;
  * warning su vibrazioni/incendio fuori dominio;
  * gestione esplicita di `mZ/vZ` da assi ruotati come componenti nel piano della lastra, riportate nei metadata e trascurate con warning fisico;
* aggiunto esempio/report `xlam-strip-report`;
* aggiunti test su rigidezza, freccia e verifiche base;
* documentato metodo in `docs/xlam-beam-method.md`.

Da raffinare:

* calibrare la rigidezza a taglio efficace contro riferimenti esterni o produttori;
* aggiungere vibrazioni XLAM;
* aggiungere incendio XLAM;
* ampliare cataloghi/prodotti con preset di strati reali.

### F. Frontend/schema DTO piu formale

Obiettivo:

* stabilizzare il contratto JSON per API e futuro frontend React;
* rendere validabili input, risultati, report e cataloghi.

Prima implementazione completata:

* versionato `BeamReport` con `schemaVersion = "beam-report/v1"`;
* aggiunto validatore runtime leggero `validateBeamReportDto`;
* aggiunta costante `BEAM_REPORT_SCHEMA_VERSION`;
* propagata la versione negli artefatti JSON/Markdown;
* aggiornata documentazione in `docs/beam-report-dto.md`;
* aggiunti test strutturali sul report e sugli artefatti.

Da fare:

* formalizzare in modo completo:
  * `BeamModelInput`;
  * `BeamLoadInput`;
  * `BeamCombinationInput`;
  * `BeamAnalysisResult`;
  * `BeamVerificationResult`;
  * `BeamReport`;
  * `BeamReportArtifact`;
* creare JSON Schema o Zod-like schema se il frontend ne avra bisogno;
* normalizzare warning e assunzioni con campi strutturati:
  * `code`;
  * `severity`;
  * `message`;
  * `source`;
  * `relatedCheckId`;
* esporre cataloghi materiali/sezioni in DTO comodi per form React;
* aggiungere esempi JSON minimi per ogni famiglia di trave.

## Fase nuova - Assi principali ruotati della sezione

Stato implementazione MVP, 2026-04-17:

* completato modulo di geometria masse con `Iyz`, inerzie principali e rotazione delle inerzie;
* completato contratto `sectionRotation` con `alpha = 0` come default compatibile e input in radianti o gradi;
* completata proiezione 2D delle rigidezze verticali equivalenti `EI`/`GA`;
* completata scomposizione delle azioni FEM in `vY/vZ` e `mY/mZ`;
* completata propagazione verso provider, inviluppi, report e `BeamSectionActionVerifier`;
* completata integrazione nelle verifiche legno, acciaio e c.a.; per XLAM e travi composte viene verificato l'asse principale gia coperto dal metodo e dichiarata in warning la componente debole non coperta dal modello specialistico 1D;
* aggiunto warning automatico quando `alpha != 0`: il core resta FEM 2D con rigidezza verticale equivalente, senza torsione e senza spostamento trasversale debole indipendente;
* test di regressione e suite completa verdi.

Stato copertura `Mz` da completare:

* le azioni `mZ/vZ` ora non spariscono piu: sono nei risultati, negli inviluppi, nei metadata e nei report;
* la verifica resistente di sezione e gia biaxiale per legno semplice e acciaio base;
* il c.a. usa il dominio biaxiale in SLU quando `mZ` e significativo;
* restano da coprire o dichiarare meglio le verifiche di stabilita e servizio dove la componente `mZ` cambia il dominio del metodo;
* per sezioni a lastra o sistemi collaboranti estesi, `mZ` puo essere trascurato in prima implementazione se il verificatore emette un warning motivato: la rigidezza/resistenza nel piano della lastra rende questa componente in genere non governante rispetto alla flessione fuori piano forte, ma la scelta deve essere visibile nel risultato.

Obiettivo:

* permettere che gli assi principali di inerzia della sezione siano ruotati di un angolo `alpha` rispetto alla configurazione corrente della trave;
* modellare il caso tipico delle travi di falda, dove la trave segue una pendenza ma il carico gravitazionale resta agente nel piano verticale;
* scomporre le azioni trasversali verticali nelle due componenti sugli assi principali della sezione;
* mantenere `alpha = 0` come comportamento identico a oggi;
* portare le componenti principali dentro rigidezze, diagrammi, verifiche, report e DTO, senza rompere i moduli gia esistenti.

### Stato attuale rilevato

Esiste gia una base di proprieta geometriche nelle classi di sezione:

* `CrossSection` espone area, baricentro, `inertiaY`, `inertiaZ`, moduli elastici/plastici e aree di taglio;
* `RectangularSection`, `CircularSection`, `TSection`, `PolygonSection`, `SteelProfileSection`, `ReinforcedConcreteSection`, `XlamPanelSection` e `CompositeSection` calcolano o ricevono proprieta geometriche;
* i provider di trave usano quasi sempre `bendingInertiaAxis = "inertiaY"` e `shearAreaAxis = "shearAreaY"`;
* `SingleBeamAnalysis` supporta gia geometria inclinata della linea trave e carichi verticali globali con `loadProjection: "horizontal"` di default;
* i risultati FEM e `BeamSectionActionVerifier` passano oggi solo `nEd`, `vEd`, `mEd`;
* i verificatori materiali sono quindi principalmente uniaxiali: legno, acciaio, XLAM e composti leggono `V` e `M`; il c.a. ha gia un motore biaxiale standalone, ma il wrapper trave usa ancora il dominio uniaxiale `N-M`.

Manca invece un modulo unitario di geometria delle masse della sezione:

* non esiste ancora un calcolo comune di `Iyz`;
* non esiste una risoluzione unica degli assi principali;
* non esiste una trasformazione standard delle inerzie sotto rotazione;
* non esiste un contratto comune per dire a provider, FEM e verificatori quali sono asse forte, asse debole e angolo di rotazione.

### Decisioni di modellazione

Distinguere sempre due concetti:

* inclinazione geometrica della linea trave: gia presente in `geometry.start/end`;
* rotazione degli assi principali della sezione attorno all'asse longitudinale della trave: nuova proprieta `sectionRotation`.

Contratto input proposto:

```js
sectionRotation: {
  alpha: 0,
  units: "rad", // "rad" default, "deg" ammesso negli input ergonomici
  convention: "roof-slope",
  primaryAxis: "principalY"
}
```

Convenzione MVP:

* `alpha = 0` riproduce il comportamento attuale: il carico verticale produce solo azione sul ramo principale gia usato da `inertiaY`;
* per una trave di falda con pendenza `alpha`, il carico verticale viene scomposto in:
  * componente principale forte: `qY = q * cos(alpha)`;
  * componente principale debole: `qZ = q * sin(alpha)`;
* la stessa scomposizione vale per taglio e momento derivati dal diagramma FEM:
  * `vY = v * cos(alpha)`;
  * `vZ = v * sin(alpha)`;
  * `mY = m * cos(alpha)`;
  * `mZ = m * sin(alpha)`;
* i segni devono essere conservati nei valori e accompagnati da metadata, evitando di nascondere il verso fisico dietro valori assoluti;
* il nome `alpha` resta allineato al linguaggio di progetto delle falde, ma il DTO deve dichiarare chiaramente la convenzione.

Per le deformazioni nel piano verticale, finche il core resta FEM 2D, usare una rigidezza equivalente coerente con la scomposizione:

```txt
EI_vertical = 1 / (cos(alpha)^2 / EIY + sin(alpha)^2 / EIZ)
GA_vertical = 1 / (cos(alpha)^2 / GAY + sin(alpha)^2 / GAZ)
```

Questa e una scelta da MVP 2D:

* conserva equilibrio verticale, reazioni e diagrammi globali;
* rende la freccia verticale sensibile anche alla rigidezza debole;
* produce azioni principali `Y/Z` per le verifiche;
* non sostituisce un futuro elemento beam 3D con due spostamenti trasversali indipendenti e torsione.

### A. Modulo geometria delle masse della sezione

Creare un modulo puro, per esempio:

* `src/domain/geometry/SectionMassProperties.js`;
* export pubblici da `src/index.js`.

Funzioni minime:

```js
calculateSectionMassProperties(sectionOrShape)
principalSecondMoments({ inertiaY, inertiaZ, productOfInertiaYZ })
rotateSecondMoments({ inertiaY, inertiaZ, productOfInertiaYZ, alpha })
resolvePrincipalSectionFrame(section)
```

Output comune:

```js
{
  area,
  centroidY,
  centroidZ,
  inertiaY,
  inertiaZ,
  productOfInertiaYZ,
  principalInertiaMajor,
  principalInertiaMinor,
  principalAxisAngle,
  radiusOfGyrationY,
  radiusOfGyrationZ,
  metadata
}
```

Copertura per tutte le sezioni disponibili:

* `CrossSection`: accetta `productOfInertiaYZ`, proprieta principali esplicite e fallback prudente `Iyz = 0` quando le assi sono dichiarate principali;
* `RectangularSection`: `Iyz = 0`, assi principali coincidenti con assi locali;
* `CircularSection`: `Iy = Iz`, ogni asse baricentrico e principale; metadata dedicato per evitare ambiguita;
* `TSection`: `Iyz = 0` per la T simmetrica oggi modellata;
* `PolygonSection`: calcolo generale con formule di shoelace per area, baricentro, `Iy`, `Iz`, `Iyz` e assi principali;
* `SteelProfileSection`: usa dati catalogo `Iy/Iz`; `Iyz = 0` se il profilo di catalogo e gia espresso sugli assi principali; permettere override per profili non standard;
* `CompositeSection`: calcolo trasformato con teorema di Huygens anche per `Iyz`;
* `ReinforcedConcreteSection`: propaga proprieta lorde e trasformate, con barre come aree puntuali nella trasformata;
* `XlamPanelSection`: proprieta degli strati attivi e, dove serve, proprieta totali del pannello; `Iyz = 0` nel caso stratificato simmetrico attuale.

Test da aggiungere:

* rettangolo e cerchio con `Iyz = 0`;
* poligono non simmetrico con `Iyz != 0` e assi principali ruotati;
* sezione composta con componenti eccentriche anche in `Y` e `Z`;
* c.a. trasformato con barre eccentriche;
* profilo acciaio da catalogo con metadata di assi principali;
* XLAM con assi coerenti con strati attivi.

### B. Contratto provider per due assi principali

Estendere i provider mantenendo compatibilita:

* i campi attuali `axialRigidity`, `flexuralRigidity`, `shearRigidity` restano validi;
* quando `sectionRotation.alpha` e diverso da zero, il provider deve esporre anche le rigidezze principali:

```js
{
  flexuralRigidityY,
  flexuralRigidityZ,
  shearRigidityY,
  shearRigidityZ,
  principalAxes: {
    alpha,
    primaryAxis,
    convention
  }
}
```

Regola:

* se `alpha = 0`, usare il percorso attuale senza cambiare numeri e metadata;
* se `alpha != 0` e mancano proprieta del secondo asse, il provider deve generare errore bloccante o warning esplicito a seconda del dominio applicativo;
* il core FEM riceve `EI_vertical` e `GA_vertical` equivalenti;
* i verificatori ricevono invece le componenti principali, non solo il momento verticale risultante.

Provider da aggiornare:

* `ElasticBeamSectionProvider`: caso generale per sezioni elastiche semplici e composte;
* `TimberBeamSectionProvider`: `EIY/EIZ`, `GAY/GAZ`, moduli `Wy/Wz`;
* `SteelBeamSectionProvider`: `Iy/Iz`, `Wel_y/Wel_z`, `Wpl_y/Wpl_z`, aree di taglio `Av_y/Av_z`;
* `ReinforcedConcreteBeamSectionProvider`: stati `gross` e `transformed` su entrambi gli assi;
* `XlamBeamSectionProvider`: asse longitudinale e asse trasversale del pannello, con warning se la componente debole esce dal metodo 1D;
* `TimberConcreteCompositeBeamSectionProvider`: asse collaborante forte piu una rigidezza debole dichiarata o calcolata in modo prudente;
* `TimberXlamCompositeBeamSectionProvider`: idem, distinguendo componente collaborante e componente trasversale.

### C. Analisi trave e risultati FEM

Aggiornare `SingleBeamModel` e `SingleBeamFemBuilder`:

* accettare `sectionRotation` nell'input trave;
* normalizzare `alpha`, unita e convenzione;
* passare `sectionRotation` al `providerContext`;
* ricevere dal provider rigidezze principali e rigidezza equivalente verticale;
* salvare nei metadata di ogni risultato:
  * `sectionRotation`;
  * `principalAxes`;
  * `verticalFlexuralRigiditySource`;
  * `verticalShearRigiditySource`.

Aggiornare `sampleBeamResult`:

* mantenere `n`, `v`, `m` come oggi;
* aggiungere a ogni sample:

```js
principalActions: {
  vY,
  vZ,
  mY,
  mZ,
  alpha,
  convention
}
```

Aggiornare inviluppi:

* mantenere inviluppi attuali;
* aggiungere, quando disponibili:
  * `maxAbsBendingMomentY`;
  * `maxAbsBendingMomentZ`;
  * `maxAbsShearForceY`;
  * `maxAbsShearForceZ`.

Nota sui carichi:

* non duplicare i casi di carico in due analisi FEM nel primo MVP;
* la linea FEM resta una trave 2D con rigidezza verticale equivalente;
* la scomposizione `Y/Z` serve per recupero tensionale e verifica;
* un vero beam 3D con `uy/uz/rx/ry/rz`, torsione e vincoli fuori piano resta una fase successiva.

### D. Contratto verifiche di sezione

Estendere il contratto senza rompere quello vecchio:

```js
verifySectionActions({
  nEd,
  vEd,
  mEd,
  principalActions: {
    vY,
    vZ,
    mY,
    mZ
  },
  x,
  context
})
```

Regole:

* i verificatori vecchi continuano a funzionare con `vEd/mEd`;
* i verificatori aggiornati devono preferire `principalActions` quando presenti;
* `BeamSectionActionVerifier` deve propagare `principalActions` e metadata di stazione;
* ogni check deve indicare nei metadata se usa azioni globali o componenti principali.

### E. Impatto sui verificatori materiali

Legno semplice:

* aggiornare flessione da uniaxiale a biaxiale: completato in MVP:
  * `sigmaM,Y = |mY| / Wy`;
  * `sigmaM,Z = |mZ| / Wz`;
  * check combinato elastico con somma dei rapporti sui due assi principali;
* aggiornare taglio su `vY/vZ` con `shearAreaY/shearAreaZ`: completato in MVP;
* freccia verticale usa il risultato FEM gia calcolato con rigidezza equivalente;
* stabilita laterale/flesso-torsionale: completata in MVP per sezioni rettangolari con tratti non controventati, `kcrit` automatico o override utente.

Acciaio:

* estendere resistenza di sezione da `N + My` a `N + My + Mz` almeno per verifiche elastiche/plastiche base;
* usare `Wel_y/Wel_z` e `Wpl_y/Wpl_z`;
* classificazione locale: inizialmente mantenere classificazione governata dal caso piu severo, poi raffinare per biaxialita;
* LTB resta legata al momento forte `My` nel primo passaggio, con metadata che dichiara la quota `Mz`;
* interazione di stabilita Metodo B deve diventare una fase esplicita: oggi e `N + My`, quindi con `mZ` non trascurabile deve avvisare o usare formula estesa solo quando implementata.

Calcestruzzo armato:

* usare il motore biaxiale gia presente per SLU quando `mZ` non e nullo: completato;
* aggiornare `ReinforcedConcreteBeamVerification` per scegliere: completato:
  * uniaxiale se `|mZ|` e trascurabile;
  * biaxiale se `|mZ|` e significativo;
* SLE tensioni: passare `N-Mx-My` al solver di servizio gia predisposto: completato;
* SLE fessurazione: mantenere controllo indiretto sul momento principale `My`, con warning quando `Mz` viene trascurato;
* taglio: usare solo la componente principale `vY`; `vZ` viene trascurato nel primo dominio con warning esplicito.

XLAM come trave:

* componente `mY/vY`: verificata con il metodo attuale di trave/striscia fuori piano;
* componente `mZ/vZ`: completata in MVP come componente nel piano della lastra, riportata nei metadata di risultato e di check e trascurata con warning motivato;
* rolling shear e freccia dichiarano implicitamente il dominio `mY/vY` tramite metadata delle azioni principali e warning sulle componenti escluse.

Composti legno-calcestruzzo:

* il metodo gamma attuale resta forte-asse;
* recupero azioni `mY/vY` sul sistema collaborante: completato via `verifySectionActions`;
* componente `mZ/vZ`: completata in MVP come componente nel piano della soletta collaborante, riportata nei metadata di risultato e di check e trascurata con warning motivato;
* il report deve mostrare chiaramente quale quota del carico e stata verificata come collaborante e quale e stata esclusa per dominio fisico del metodo.

Composti legno-XLAM:

* stesso schema dei legno-calcestruzzo;
* componente forte `mY/vY` nel metodo gamma esistente;
* componente `mZ/vZ`: completata in MVP come azione nel piano del pannello XLAM, riportata nei metadata di risultato e di check e trascurata con warning motivato.

### E-bis. Copertura residua della componente `Mz`

Regola di progetto:

* ogni verifica deve classificare esplicitamente `mZ/vZ` come:
  * verificata con formula dedicata;
  * inclusa in una verifica combinata conservativa;
  * trascurata con warning motivato;
  * non verificata con warning bloccante e stato `not-verified`;
* nessun verificatore deve ignorare `mZ/vZ` in modo silenzioso.

Acciaio:

* completare instabilita asta-colonna da `N + My` a `N + My + Mz`;
* aggiornare o affiancare il check LTB per dichiarare il dominio corretto in presenza di `Mz`;
* chiarire la classificazione locale con pressoflessione biaxiale, almeno con criterio conservativo governante;
* mantenere l'attuale comportamento prudente finche il dominio non e completo: `Mz` significativo produce warning e `not-verified` per l'interazione di stabilita completa.

#### Fase acciaio - definizione implementativa e normativa

Stato implementazione, 2026-04-17:

* completata funzione `verifySteelBeamColumnInteractionMyMz`;
* completati coefficienti `kyy/kyz/kzy/kzz` nel modello Method B MVP;
* completata integrazione nel verificatore FEM: `Mz = 0` usa il vecchio check `N + My`, `Mz` significativo usa il nuovo check `N + My + Mz`;
* completato fallback prudente per profili non supportati, torsione/interazioni torsionali e sezioni di classe 4;
* completati test standalone e da risultati FEM per la nuova interazione.

Obiettivo della fase:

* sostituire l'attuale interazione di stabilita `N + My` con un dominio `N + My + Mz` per profili I/H doppiamente simmetrici;
* mantenere comportamento prudente per profili non doppiamente simmetrici, sezioni di classe 4, torsione o dati mancanti;
* lasciare la LTB come riduzione del termine di momento forte `My`, facendo entrare `Mz` nelle equazioni di interazione complessive;
* evitare che il warning su `Mz` resti permanente quando la verifica `N + My + Mz` e effettivamente disponibile.

Dominio normativo proposto:

* NTC 2018 / Circolare per aste compresse e inflesse, usando lo schema di interazione tipo Metodo B gia avviato nel codice;
* due equazioni da soddisfare:
  * asse instabilita `y`: termine assiale con `chi_y`, termine `My` con `chiLT`, termine `Mz` senza riduzione LTB;
  * asse instabilita `z`: termine assiale con `chi_z`, termine `My` con `chiLT`, termine `Mz` senza riduzione LTB;
* coefficienti di interazione da estendere da `kyy/kzy` a `kyy/kyz/kzy/kzz`;
* `My,Rk` e `Mz,Rk` scelti con lo stesso criterio gia usato per la resistenza di sezione: plastico per classi 1/2 se disponibile, elastico per classe 3 o fallback;
* `chiLT` applicato solo al termine `My`, non al termine `Mz`;
* torsione, instabilita torsionale e flesso-torsionale non sono incluse in questa fase.

Scelte implementative adottate:

* creata una nuova funzione `verifySteelBeamColumnInteractionMyMz` in `SteelBeamColumnInteraction.js`;
* mantenere `verifySteelBeamColumnInteractionMy` come wrapper o alias compatibile per i test e gli utenti esistenti;
* aggiunta `calculateSteelMethodBInteractionCoefficientsMyMz` con output completo:

```js
{
  kyy,
  kyz,
  kzy,
  kzz,
  cmy,
  cmz,
  cmLT,
  source
}
```

* input configurabili in `stability.beamColumnInteraction`:
  * `momentFactorY` / `cmy`;
  * `momentFactorZ` / `cmz`;
  * `momentFactorLT` / `cmLT`;
  * `method: "B"` come default;
  * `allowSinglySymmetric` solo come override esplicito e con warning;
* aggiungere metadata con i singoli rapporti:
  * `axialRatioY`, `axialRatioZ`;
  * `bendingRatioYLT`;
  * `bendingRatioZ`;
  * `equationY`, `equationZ`;
  * `governingEquation`;
* id check nuovo: `steel-beam-column-interaction-n-my-mz`;
* durante una transizione, raggruppare il vecchio e il nuovo check evitando duplicati fuorvianti nel report.

Classificazione della sezione:

* MVP prudente: classificare separatamente `N + My` e `N + Mz` quando possibile e usare la classe peggiore;
* se il classificatore non sa ancora modellare correttamente `N + Mz` per una famiglia, usare la classificazione esistente `N + My` e aggiungere metadata/warning `biaxialClassification: "not-fully-resolved"`;
* le sezioni di classe 4 restano bloccate finche non esistono proprieta efficaci.

LTB:

* il check autonomo `steel-lateral-torsional-buckling` resta governato da `My`;
* se `Mz` e presente e l'interazione `N + My + Mz` e disponibile, il check LTB deve indicare nei metadata che `Mz` e trattato nel check di interazione, non nel check LTB isolato;
* se l'interazione `N + My + Mz` non viene generata, `Mz` significativo deve continuare a produrre warning e stato `not-verified`.

Test minimi:

* caso `alpha = 0`: resta generato il dominio equivalente al vecchio `N + My`, senza regressioni numeriche;
* caso `alpha != 0`: il check nuovo contiene `Mz`, coefficienti `kyz/kzz`, due equazioni e non emette piu il warning "full N-Mx-My instability is not verified" quando i dati sono sufficienti;
* caso `Mz` presente ma profilo non supportato o classe 4: warning bloccante;
* caso LTB disabilitata o trave dichiarata controventata: `chiLT = 1` o fonte metadata chiara;
* report acciaio: deve mostrare il check `N + My + Mz` e non solo il vecchio `N + My`.

Legno semplice:

* la resistenza di sezione a flessione/taglio biaxiale e coperta in MVP;
* stabilita laterale/flesso-torsionale completata in MVP per sezioni rettangolari:
  * input in `stability.lateralTorsionalBuckling` / `stability.ltb`;
  * default: trave non controventata sull'intera luce FEM;
  * tratti configurabili con `segments` / `unbracedSegments`;
  * override disponibili: `unbracedLength`, `kcrit`, `sigmaMcrit`, `e0_05`;
  * `My` entra con riduzione `kcrit`, `Mz` entra come termine elastico debole nella stessa verifica;
  * `restrained: true` o `enabled: false` disabilita il check con assunzione esplicita;
* limiti residui:
  * formula automatica di `sigma_m,crit` limitata al rettangolo; altre sezioni richiedono `kcrit` o `sigmaMcrit`;
  * torsione pura, vincoli torsionali avanzati e distribuzione non uniforme del momento restano fuori dall'MVP;
  * il FEM resta 2D: con `alpha != 0` il warning globale sull'assenza di torsione/DOF fuori piano resta corretto.

Calcestruzzo armato:

* SLU pressoflessione biaxiale e coperta con dominio resistente campionato;
* SLE tensioni da trave coperto con solver biaxiale `N-Mx-My`;
* SLE fessurazione: scelta normativa MVP approvata:
  * usa sempre il momento principale `My` per selezione gruppi intradosso/estradosso e controlli tabellari;
  * `Mz` e riportato e trascurato con warning, assumendo angoli `alpha` generalmente piccoli e gruppi armatura definiti sul piano principale;
* taglio debole `vZ`: escluso dal primo dominio applicativo, con warning che dichiara gli effetti trascurati;
* resta futura una verifica direzionale di taglio debole solo se verranno definiti `bw/d` e armature coerenti anche per l'asse trasversale.

Sezioni a lastra e sistemi collaboranti estesi:

* per XLAM, legno-XLAM, legno-calcestruzzo e casi simili, la componente `Mz` puo essere trascurata nel primo dominio applicativo se e fisicamente una flessione/resistenza nel piano della lastra;
* il warning deve spiegare che la verifica stringente resta quella della componente fuori piano forte gia coperta dal metodo;
* il warning deve indicare il valore di `mZ/vZ` trascurato e il motivo fisico;
* se la configurazione non e una lastra o non sono presenti metadata sufficienti per giustificare la trascurabilita, il risultato deve essere `not-verified`.

Stato implementazione, 2026-04-17:

* XLAM trave, legno-calcestruzzo e legno-XLAM: completato audit MVP;
* `mZ/vZ` non fanno fallire la verifica quando il sistema e una lastra o contiene una lastra collaborante con rigidezza/resistenza nel piano;
* i valori `mZ/vZ` sono riportati sia nel risultato della verifica sia nei metadata dei singoli check;
* warning standard: la componente e trascurata per azione nel piano della lastra, mentre il metodo verifica la componente governante fuori piano `mY/vY`;
* aggiunti test dedicati con `alpha != 0`/azioni principali ruotate per le tre famiglie.

### F. DTO, report e documentazione

Stato implementazione, 2026-04-17:

* `SingleBeamDesignModel.toJSON` espone `beamInput.sectionRotation` quando dichiarato;
* `BeamReportDto` valida i campi espliciti per assi ruotati e azioni principali;
* `BeamReportBuilder` espone:
  * `analysis.sectionRotation`;
  * `analysis.principalAxes`;
  * `analysis.sectionRigidity`;
  * `analysis.principalActionEnvelopes`;
  * `governing.ulsMomentY`;
  * `governing.ulsMomentZ`;
* il Markdown include sezioni dedicate `Assi principali` e `Azioni principali`;
* `docs/beam-report-dto.md` documenta il contratto per `alpha`, rigidezze principali e inviluppi `mY/mZ/vY/vZ`;
* aggiunto test report con `sectionRotation.alpha = 15 deg`.

Aggiornamenti completati:

* `SingleBeamDesignModel.toJSON`;
* `BeamReportDto`;
* `BeamReportBuilder`;
* documentazione `docs/beam-report-dto.md`;
* documenti metodo per acciaio, legno, c.a., XLAM e composti: coperti dalle note metodo gia presenti; eventuali raffinamenti restano editoriali.

Campi nuovi minimi nel report:

* `model.beamInput.sectionRotation`;
* `analysis.raw.*.sectionProperties.metadata.principalAxes`;
* `analysis.sectionRotation`, `analysis.principalAxes`, `analysis.sectionRigidity`;
* `analysis.principalActionEnvelopes`;
* tabella rigidezze con `EIY`, `EIZ`, `EI_vertical`;
* tabella inviluppi con momenti/tagli principali;
* dettagli verifica con `mY`, `mZ`, `vY`, `vZ`.

### G. Test e validazione

Stato implementazione, 2026-04-17:

* regressioni `alpha = 0` coperte dalla suite esistente;
* test dedicati per scomposizione `mY/mZ/vY/vZ`, rigidezze verticali equivalenti e warning FEM 2D;
* test materiali per legno, acciaio, c.a., XLAM e compositi con componenti principali;
* test DTO/report con `sectionRotation.alpha = 15 deg`;
* `npm test`: verde;
* `npm run validation`: verde, 7 casi su 7.

Test di regressione obbligatori:

* `alpha = 0` lascia invariati i risultati esistenti;
* una trave orizzontale con sezione rettangolare e `alpha = 30 deg` produce:
  * reazioni verticali uguali al carico verticale totale;
  * `mY = m * cos(alpha)`;
  * `mZ = m * sin(alpha)`;
  * freccia maggiore quando `EIZ < EIY`;
* una trave inclinata geometricamente mantiene la proiezione orizzontale del carico e in piu scompone le azioni sulla sezione ruotata;
* provider legno, acciaio, c.a., XLAM e composti espongono metadata coerenti;
* `BeamSectionActionVerifier` propaga le azioni principali;
* report JSON/Markdown includono `sectionRotation` e inviluppi principali.

Validazione numerica:

* confronto manuale con formula chiusa di trave appoggiata:
  * `Mmax = q L^2 / 8`;
  * `Vmax = q L / 2`;
  * scomposizione con seno/coseno;
  * freccia con `EI_vertical`;
* caso falda con `alpha = 20-35 deg`, sezione rettangolare lignea, carico permanente + neve;
* caso acciaio IPE ruotato con `mZ` non nullo e warning/interazione documentati;
* caso c.a. con dominio biaxiale attivato;
* caso composto con componente debole gestita o bloccata in modo esplicito.

### Sequenza operativa proposta

1. Implementare e testare `SectionMassProperties`.
2. Aggiungere `sectionRotation` e normalizzazione input, senza cambiare ancora i risultati numerici.
3. Estendere i provider per restituire rigidezze principali e rigidezza verticale equivalente.
4. Aggiungere `principalActions` nei risultati FEM e negli inviluppi.
5. Estendere `BeamSectionActionVerifier`.
6. Aggiornare verifiche legno e acciaio base.
7. Aggiornare c.a. sfruttando il solver biaxiale gia presente.
8. Aggiornare XLAM e composti con check reali dove disponibili e warning bloccanti dove il dominio non e ancora affidabile.
9. Aggiornare report/DTO/documentazione.
10. Aggiungere validazione numerica e casi report dedicati.

Criterio di accettazione della feature:

* nessun risultato esistente cambia con `alpha = 0`;
* con `alpha != 0`, ogni analisi deve dichiarare rigidezze principali, rigidezza verticale equivalente e componenti principali delle azioni;
* ogni verificatore deve usare `principalActions` oppure dichiarare in modo bloccante perche non puo verificare quella componente;
* nessuna componente trasversale del carico deve sparire silenziosamente;
* i report devono rendere visibile la quota forte/debole del carico e la verifica governante corrispondente.

## Backlog conservato per fasi successive

Questi punti restano nella todolist ma non fanno parte della fase attiva.

### Acciaio avanzato

* estensione da `N + My` a `N + My + Mz`;
* torsione e interazioni torsionali;
* affinamenti LTB con coefficienti di momento, quote di applicazione carico, vincoli torsionali e casi non doppiamente simmetrici;
* gestione completa di `UPN` e altri profili non doppiamente simmetrici senza override manuale;
* influenza del taglio sulla resistenza a flessione;
* sezioni efficaci di classe 4;
* affinamento della classificazione in forte pressoflessione.

### C.A. avanzato

* minimi di armatura trasversale;
* limiti geometrici delle staffe;
* staffe inclinate diverse da 90 gradi;
* torsione e interazione taglio-torsione;
* gestione avanzata di sezioni generiche/poligonali;
* selezione automatica del gruppo teso lungo la trave, solo con regole dichiarate.

### Legno, composti e XLAM avanzati

* eventuale stabilita laterale delle travi in legno;
* vibrazioni XLAM;
* incendio XLAM;
* sistemi misti acciaio-calcestruzzo;
* pannelli XLAM collaboranti con profili metallici.

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
* inviluppi principali di `N`, `V`, `M` e freccia;
* stazioni di verifica configurabili e metadata di sorgente/ruolo della stazione;
* prima campagna di validazione ripetibile con comando `npm run validation`;
* esempi mirati aggiuntivi: UPN con `Mcr` utente, acciaio con compressione, c.a. aggressivo, mensola in legno;
* validazione SLE c.a. rafforzata su limiti tensionali, fessurazione per ambiente e gruppi tesi;
* XLAM come trave semplice con provider Timoshenko, verificatore FEM e report `xlam-strip-report`;
* DTO report versionato `beam-report/v1` con validatore runtime leggero;
* report JSON/Markdown ed esempi MVP.

Da fare nella fase attiva:

* fase attiva completata in prima implementazione; restano solo raffinamenti puntuali indicati sopra.

Da fare dopo:

* verifiche acciaio avanzate oltre `N + My`;
* dettagli costruttivi avanzati c.a.;
* torsione e interazioni torsionali;
* sezioni efficaci acciaio classe 4;
* vibrazioni e incendio XLAM;
* sistemi misti acciaio-calcestruzzo;
* pannelli XLAM collaboranti con profili metallici.
