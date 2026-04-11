# Roadmap della suite per travi semplici

Questo documento riordina lo stato della suite e definisce i prossimi sviluppi per arrivare a un sistema completo di analisi e verifica di travi semplici per ingegneria civile.

Obiettivo generale:

* mantenere separati i motori di calcolo: algebra, FEM, analisi di sezione, combinazioni normative, verifiche di materiale;
* usare il modulo trave singola come orchestratore FEM, non come verificatore normativo;
* permettere ai moduli specialistici di fornire rigidezze, resistenze e verifiche tramite interfacce comuni;
* restituire sempre risultati leggibili: combinazioni usate, rigidezze adottate, reazioni, spostamenti, diagrammi `N`, `V`, `M`, inviluppi e verifiche governanti.

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

Stato: primo nucleo implementato.

Componenti principali:

* `SingleBeamModel`;
* `SingleBeamFemBuilder`;
* `SingleBeamAnalysis`;
* `ElasticBeamSectionProvider`;
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

* generatore automatico di combinazioni normative;
* inviluppi completi su casi e combinazioni;
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

* trasformare il motore di sezione in provider per il modulo trave;
* esporre rigidezze elastiche iniziali:
  * sezione lorda;
  * sezione trasformata;
  * eventuale sezione fessurata equivalente;
* esporre verifiche puntuali per azioni `N`, `V`, `M`;
* completare il modulo deflessioni fessurate.

### 5. Sezioni composte legno-calcestruzzo

Stato: workflow di verifica implementato, da rifattorizzare in provider riusabile.

Capacita presenti:

* calcolo tipo gamma method;
* `gammaUls`;
* `gammaSle`;
* `inertiaEffUls`;
* `inertiaEffSle`;
* verifiche su legno, soletta, connettori e freccia;
* gestione rigidezza connettori `Kser` / `Ku`;
* uso di materiali e sezioni gia modellati.

Da fare:

* estrarre una funzione/metodo dedicato per calcolare le proprieta efficaci:

```js
getElasticBeamProperties(context)
```

* restituire almeno:

```js
{
  axialRigidity,
  flexuralRigidity,
  shearRigidity,
  units,
  metadata: {
    source: "timber-concrete-gamma-method",
    gamma,
    inertiaEffective,
    kmod,
    loadDurationClass,
    limitState
  }
}
```

* distinguere correttamente:
  * SLU con rigidezza/connessione coerente;
  * SLE rara/frequente/quasi permanente;
  * effetti di lungo termine;
  * `kmod` e `kdef` quando rilevanti;
* collegare il provider al modulo trave singola.

### 6. Sezioni composte legno-XLAM

Stato: workflow di verifica implementato, da rifattorizzare in provider riusabile.

Capacita presenti:

* modello collaborante tra trave lignea e pannello XLAM;
* calcolo e verifiche specifiche del sistema;
* uso di materiali lignei, sezione trave e sezione/pannello XLAM.

Da fare:

* esporre rigidezze efficaci `EA`, `EI`, `GA` al modulo trave;
* gestire `kmod`, durata carico, classe di servizio e stato limite;
* restituire metadata analoghi al modulo legno-calcestruzzo;
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

Priorita: molto alta.

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

* il progetto contiene gia funzioni NTC per combinazioni; il lavoro consiste nel creare un adapter ergonomico per il modulo trave;
* ogni combinazione deve portare metadata sufficienti per provider context-aware:
  * `limitState`;
  * tipo combinazione;
  * variabile principale;
  * azioni accompagnatrici;
  * classi di durata.

### B. Provider di rigidezza ufficiali

Priorita: alta.

Provider da creare:

* `ReinforcedConcreteBeamSectionProvider`;
* `TimberBeamSectionProvider`;
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

Scopo:

* usare i diagrammi FEM per verificare la sezione lungo la trave;
* non far conoscere al modulo trave le formule dei materiali.

Contratto consigliato:

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

### D. Inviluppi

Priorita: media-alta.

Da aggiungere al modulo trave:

* massimo/minimo momento;
* massimo/minimo taglio;
* massimo/minimo sforzo normale;
* massima freccia verticale;
* massime reazioni;
* combinazione governante;
* posizione governante;
* inviluppi separati per SLU e SLE.

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

Priorita: alta.

Motivo:

* e il primo workflow ideale per validare combinazioni, `kmod`, `kdef`, modulo trave e verifiche materiali.

Da implementare:

* provider elastico per legno semplice;
* verifiche:
  * flessione;
  * taglio;
  * compressione/tensione parallela se rilevante;
  * instabilita laterale se necessaria;
  * deformazione istantanea;
  * deformazione finale con `kdef`;
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

Da fare:

* separare calcolo rigidezze efficaci da verifiche;
* esporre provider context-aware;
* usare `SingleBeamAnalysis` per ottenere diagrammi e spostamenti;
* rifare le verifiche usando le azioni FEM, non solo formule chiuse da trave appoggiata se si vuole maggiore generalita;
* mantenere un test di regressione sul workbook esistente.

### 3. Travi composte legno-XLAM

Priorita: alta.

Da fare:

* stesso lavoro del modulo legno-calcestruzzo;
* provider rigidezza efficace;
* verifica lungo trave da diagrammi FEM;
* gestione di taglio Timoshenko e deformazioni.

### 4. Travi / sezioni in acciaio

Priorita: media-alta.

Da implementare:

* provider elastico da profili acciaio;
* verifiche base:
  * flessione;
  * taglio;
  * presso/tenso-flessione;
  * instabilita flesso-torsionale;
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

### Fase 1 - Chiudere il ponte normativo

1. creare adapter NTC per combinazioni di trave singola;
2. collegare le `Action` esistenti ai carichi del modulo trave;
3. generare SLU, SLE rara, frequente e quasi permanente;
4. portare nel context:
   * `limitState`;
   * tipo combinazione;
   * variabile principale;
   * classi di durata;
   * fattori psi e gamma usati.

Risultato atteso:

* il modulo trave riceve combinazioni gia esplicite e completamente annotate.

### Fase 2 - Provider legno semplice

1. creare `TimberBeamSectionProvider`;
2. usare `context.governingLoadDurationClass` per scegliere `kmod`;
3. distinguere rigidezza/verifiche istantanee e finali;
4. aggiungere verifiche flessione, taglio e freccia;
5. testare travi appoggiate e mensole.

Risultato atteso:

* primo workflow end-to-end completo: input trave, combinazioni, FEM, verifiche legno, frecce.

### Fase 3 - Provider composti

1. rifattorizzare legno-calcestruzzo;
2. rifattorizzare legno-XLAM;
3. esporre `EIeff`, `gamma`, `kmod`, `kdef` nei metadata;
4. mantenere test di regressione sui risultati esistenti;
5. far risolvere al FEM anche geometrie inclinate e vincoli diversi.

Risultato atteso:

* moduli composti collegati al nuovo motore trave senza duplicare logica FEM.

### Fase 4 - Inviluppi e verifiche lungo trave

1. aggiungere inviluppi a `SingleBeamAnalysis`;
2. definire `verifySectionActions`;
3. applicare verifiche a tutte le stazioni FEM o a stazioni critiche;
4. restituire verifiche governanti.

Risultato atteso:

* output pronto per report e interfaccia utente.

### Fase 5 - C.A. fessurato

1. creare provider RC per rigidezza iniziale;
2. usare il motore RC SLE per curvatura fessurata;
3. integrare curvature;
4. validare contro casi semplici;
5. aggiungere opzioni lungo termine.

Risultato atteso:

* calcolo frecce in c.a. realmente utile in esercizio.

### Fase 6 - Acciaio

1. provider elastico profili acciaio;
2. verifiche base;
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
* permettere di sostituire provider e verificatori senza cambiare il modulo trave.

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
* cataloghi/materiali/azioni NTC di base.

Da fare a breve:

* adapter combinazioni NTC per trave singola;
* provider legno semplice;
* provider legno-calcestruzzo;
* provider legno-XLAM;
* inviluppi;
* interfaccia verifiche `verifySectionActions`.

Da fare dopo:

* acciaio;
* c.a. fessurato;
* vibrazioni XLAM;
* incendio XLAM;
* sistemi misti acciaio-calcestruzzo;
* pannelli XLAM collaboranti con profili metallici.
