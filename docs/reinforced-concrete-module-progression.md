# Progressione dei moduli per strutture in calcestruzzo armato

## Scopo

Questo documento mantiene la progressione tecnica dei moduli per strutture in
calcestruzzo armato. Non descrive scadenze e non presenta come disponibili
funzionalita non implementate. Serve a distinguere:

- kernel di dominio riusabili;
- verifiche locali adatte a una micro-app;
- post-processori che richiedono risultati di un modello FEM globale;
- verificatori di sistema da sviluppare sopra il FEM globale.

Ogni formula, coefficiente o limite dovra essere introdotto soltanto nel modulo
che lo implementa, insieme a fonte verificabile, unita, ipotesi, campo di
validita, test e validazione indipendente.

## Criterio di separazione

Una verifica e adatta a una micro-app quando:

1. geometria, materiali, armature e azioni possono essere descritti con un
   input locale e serializzabile;
2. le azioni di progetto non richiedono di ricostruire la distribuzione delle
   rigidezze nel resto della struttura;
3. assi, punti di riferimento e condizioni al contorno possono essere
   dichiarati senza ambiguita;
4. una modifica locale non richiede normalmente una nuova analisi globale per
   rendere valido il risultato.

Quando una di queste condizioni non e soddisfatta, `strutture-js` deve fornire
il kernel o il verificatore generico, mentre il consumer FEM deve estrarre dal
modello globale geometria, azioni e contesto strutturale.

## Stati usati nella progressione

| Stato | Significato |
| --- | --- |
| `implemented` | Capacita disponibile, testata e documentata nel campo dichiarato. |
| `partial` | Esiste una capacita operativa, ma non copre ancora l'intero elemento o workflow. |
| `planned-local` | Candidato a modulo o micro-app con input locale. Non implementato. |
| `planned-kernel` | Nucleo riusabile necessario a piu workflow. Non implementato. |
| `deferred-fem` | Richiede risultati o contesto del modello globale. Non implementato. |

Gli ultimi tre stati sono solo classificazioni della progressione. Non devono
essere aggiunti al catalogo delle applicazioni come funzionalita disponibili.

## Base disponibile

| Capacita | Stato | Perimetro attuale |
| --- | --- | --- |
| Sezioni in c.a. | `implemented` | SLU/SLE a fibre, dominio monoassiale e biassiale, momento-curvatura e verifiche sezionali coperte dai workflow pubblici. |
| Piastre in c.a. | `implemented` | Verifica locale di risultanti di piastra mediante strisce equivalenti Wood-Armer; non esegue l'analisi globale della piastra. |
| Punzonamento | `implemented` | Verificatore locale con contratto serializzabile e campagna di validazione nel campo documentato. |
| Trave singola in c.a. | `partial` | Analisi 2D, verifiche sezionali e integrazione delle curvature fessurate; torsione, dettaglio completo e duttilita non sono completi. |
| FEM generico | `partial` | Componenti FEM riusabili prevalentemente 2D; non costituisce ancora il verificatore globale per strutture in c.a. |

## Mappa delle dipendenze

```text
sezioni RC
  +-- trave RC completa
  +-- pilastro RC
  +-- verifiche locali di fondazioni

piastre RC + punzonamento + sezioni RC
  +-- plinti superficiali

trave FEM 2D + sezioni RC
  +-- trave di fondazione su suolo elastico

pannello a membrana RC
  +-- verificatore locale di guscio RC
        +-- post-processore di risultati shell FEM
              +-- setti e nuclei
              +-- platee generali
              +-- diaframmi
              +-- serbatoi, silos e altri sistemi a guscio

modello tirante-puntone
  +-- mensole tozze
  +-- travi parete e regioni D
  +-- plinti su pali
  +-- dettagli locali di nodi e appoggi
```

La mappa indica il riuso tecnico, non obbliga ogni verificatore di sistema a
usare un solo tipo di risultato. Per esempio, un setto puo richiedere sia tagli
di sezione integrati lungo l'altezza sia verifiche locali delle shell.

## Progressione dei moduli locali

### 1. Consolidamento delle travi in c.a.

Estensione dei workflow esistenti, senza creare una seconda applicazione per lo
stesso elemento:

- torsione e interazione taglio-torsione;
- dettaglio di armature longitudinali e trasversali;
- ancoraggi, sovrapposizioni e interruzione delle barre;
- zone critiche, duttilita e gerarchia delle resistenze;
- completamento delle verifiche di deformazione a lungo termine.

Destinazione: micro-app esistente `single-beam-design` e verificatori riusabili.

### 2. Pilastri in c.a.

Nuovo verificatore di asta che riutilizza i domini resistenti sezionali:

- pressoflessione monoassiale e deviata;
- snellezza ed effetti del secondo ordine;
- metodi normativi locali applicabili con lunghezza efficace e condizioni al
  contorno esplicite;
- taglio, dettaglio delle armature, confinamento e duttilita.

Destinazione: micro-app, con azioni e lunghezze efficaci assegnate manualmente;
in seguito gli stessi input potranno essere prodotti dal FEM globale.

### 3. Plinti e fondazioni superficiali locali

Workflow costruito sopra piastre, punzonamento e verifiche sezionali:

- distribuzione delle pressioni con ipotesi di contatto dichiarata;
- perdita di contatto;
- flessione nelle due direzioni;
- taglio monodirezionale e punzonamento;
- schiacciamento locale e ancoraggio delle barre del pilastro;
- scorrimento e ribaltamento quando inclusi nel contratto.

La capacita portante geotecnica del terreno resta distinta dalla verifica
strutturale del plinto.

Destinazione iniziale: micro-app per plinti isolati; plinti combinati e
fondazioni geometricamente complesse richiederanno un perimetro separato.

### 4. Travi di fondazione

Prima versione limitata a una trave su suolo elastico con legge e parametri
espliciti:

- carichi distribuiti e concentrati;
- rigidezza del sottofondo per tratti;
- cedimenti imposti;
- verifiche di resistenza e di esercizio della trave in c.a.

Destinazione: micro-app 1D; platee e interazioni spaziali terreno-struttura
restano nel percorso FEM.

### 5. Nodi trave-pilastro

Verificatore locale alimentato dalla geometria, dalle armature e dalle azioni o
capacita delle aste concorrenti:

- pannello nodale;
- confinamento;
- ancoraggio delle barre;
- gerarchia trave-pilastro;
- nodi interni, esterni e d'angolo nei casi supportati.

Destinazione: prima contratto locale con input manuale, poi post-processore dei
nodi estratti dal telaio FEM. La presenza di un input locale non autorizza a
inferire automaticamente azioni globali mancanti.

### 6. Regioni D e modelli tirante-puntone

Prima deve essere implementato un kernel generico e verificabile per nodi,
puntoni e tiranti. Su tale kernel potranno essere costruiti workflow specifici
per:

- mensole tozze;
- travi parete;
- selle e appoggi;
- zone di introduzione di carichi concentrati;
- plinti su pali.

Destinazione: kernel condiviso e micro-app soltanto per schemi con topologia e
campo di validita non ambigui. La generazione automatica di un modello
tirante-puntone arbitrario non rientra nel primo perimetro.

## Progressione dei moduli dipendenti dal FEM globale

### 1. Contratto delle risultanti di superficie

Contratto generico, serializzabile e indipendente dal software FEM per
trasportare almeno:

```js
{
  elementId,
  position,
  combinationId,
  axes,
  referenceSurface,
  membrane: { nxx, nyy, nxy },
  bending: { mxx, myy, mxy },
  transverseShear: { vx, vy },
  units,
  metadata
}
```

Il contratto deve rendere esplicite convenzioni dei segni, assi locali,
superficie di riferimento e posizione di estrazione. Gli adapter verso solver
specifici restano nei consumer.

### 2. Pannello a membrana in c.a.

Kernel locale per un pannello con armature in direzioni assegnate e risultanti
`nxx`, `nyy`, `nxy`.

La membrana pura non e prevista come micro-app autonoma. Serve come:

- caso fondamentale e benchmark indipendente;
- nucleo del verificatore di guscio;
- modalita locale per risultati FEM prevalentemente nel piano.

### 3. Verificatore locale di guscio in c.a.

Verificatore delle risultanti combinate di membrana e flessione, con armature
superiori e inferiori. La formulazione della famiglia Baumann, o una sua
estensione per l'azione combinata `N + M`, dovra essere identificata con una
fonte precisa prima dell'implementazione: formulazioni diverse non devono
essere raccolte sotto un unico nome ambiguo.

Il perimetro dovra distinguere:

- trasformazione nelle direzioni delle armature;
- equilibrio degli strati superiore e inferiore;
- trazioni nelle armature e compressioni nel calcestruzzo;
- combinazione di membrana e flessione;
- taglio trasversale, da verificare con un modello dedicato;
- controlli SLE, separati dal dimensionamento SLU;
- regole di trattamento di picchi, singolarita e dipendenza dalla mesh.

Destinazione: kernel/verificatore locale richiamato dal post-processore FEM;
non e un solutore globale di gusci e non richiede una micro-app autonoma.

### 4. Post-processore shell FEM

Responsabilita della libreria:

- ricevere risultanti nel contratto generico;
- trasformarle e verificarle in modo deterministico;
- conservare valori grezzi e valori di progetto;
- aggregare risultati, warning e assunzioni senza nascondere singolarita o casi
  non supportati.

Responsabilita del consumer:

- leggere il formato del solver concreto;
- selezionare elementi, punti e combinazioni;
- mediare o regolarizzare i risultati secondo una politica esplicita;
- mostrare i risultati sulla mesh e gestire il progetto FEM.

### 5. Verificatori di sistema

Da sviluppare soltanto dopo contratti FEM e kernel locali adeguati:

- setti e nuclei in c.a.;
- pareti accoppiate;
- platee generali;
- diaframmi;
- serbatoi, silos e strutture scatolari;
- altri sistemi a piastra o guscio con comportamento globale.

Il verificatore dei setti deve lavorare sul sistema parete lungo l'altezza,
includendo tagli integrati, diagrammi di progetto, zone critiche, elementi di
bordo e sezioni composte. Non e prevista una micro-app autonoma che tenti di
dedurre queste informazioni da un input sezionale semplificato.

## Collocazione architetturale

La direzione delle dipendenze resta `applications -> norms -> domain`.

- `domain`: risultanti generiche, assi, geometrie, layout di armatura, pannelli,
  strati e primitive numeriche indipendenti dalla norma;
- `norms`: trasformazioni e verifiche normative con fonti e campo di validita;
- `applications`: orchestrazione deterministica delle micro-app e dei
  post-processori generici;
- consumer FEM: adapter del solver, selezione dal modello, UI, persistenza e
  orchestrazione del progetto globale.

Gli esempi destinati ai consumer devono usare soltanto gli entry point pubblici
definiti in `package.json#exports`.

## Criteri per dichiarare completato un modulo

Un modulo pianificato diventa disponibile soltanto quando:

1. il contratto di input dichiara unita, assi, segni e riferimenti;
2. il campo di validita e i casi non supportati sono espliciti;
3. ogni regola tecnica ha una fonte verificabile;
4. le formule sono coperte da test e regressioni;
5. esiste validazione indipendente proporzionata alla criticita;
6. i risultati preservano `status`, `outputs`, `checks`, `warnings`,
   `assumptions`, `metadata`, `demand`, `capacity` e `utilizationRatio` quando
   applicabili;
7. sono stati eseguiti i test pertinenti e i controlli architetturali;
8. soltanto a quel punto il modulo viene esposto e inserito nel catalogo delle
   applicazioni.

## Decisioni registrate

- Il verificatore completo dei setti fara parte del percorso FEM globale.
- Non verra costruita una micro-app setti basata su un input locale
  artificialmente semplificato.
- La membrana pura sara un kernel e una modalita del verificatore di guscio,
  non una micro-app distinta.
- Il verificatore di guscio controllera risultanti FEM locali; il solutore
  globale di shell e un componente separato.
- Le micro-app restano appropriate per travi, pilastri, plinti isolati, travi
  di fondazione e schemi locali con azioni assegnabili senza ambiguita.
- I moduli pianificati non sono funzionalita disponibili e non devono apparire
  come tali nei manifest o nei report.
