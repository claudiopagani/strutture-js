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
| `implemented-local` | Verificatore locale disponibile, testato e validato nel campo dichiarato; azioni e contesto globale restano input del consumer. |
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
| Trave singola in c.a. | `implemented-local` | Analisi 2D e verifiche locali di sezione, taglio, torsione, dettaglio, ancoraggio, duttilita e deformazione a lungo termine; la torsione resta un'azione assegnata. |
| Pilastri in c.a. | `implemented-local` | Secondo ordine a rigidezza nominale per lunghezze efficaci assegnate, resistenza biassiale, taglio, dettaglio, confinamento e duttilita; il P-Delta globale resta escluso. |
| Plinti isolati in c.a. | `implemented-local` | Contatto rigido completo o parziale anche biassiale, verifiche strutturali, schiacciamento e ancoraggi; le resistenze geotecniche restano assegnate. |
| Travi di fondazione in c.a. | `implemented-local` | Trave prismatica orizzontale su Winkler, contatto monolatero, rigidezza fessurata iterativa, carichi, cedimenti e verifiche locali. |
| Nodi trave-pilastro in c.a. | `implemented-local` | Verifica locale NTC 2018 di nodi interni, esterni e d'angolo, ancoraggi, eccentricita e stati 3D concorrenti con azioni e capacita assegnate. |
| Regioni D e modelli tirante-puntone | `partial` | Kernel 2D e verifica EN 1992 di topologie assegnate; nessuna generazione automatica dello schema resistente. |
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

### 1. Consolidamento delle travi in c.a. (`implemented-local`)

Estensione dei workflow esistenti, senza creare una seconda applicazione per lo
stesso elemento:

- torsione e interazione taglio-torsione: primo verificatore locale implementato;
- dettaglio di armature longitudinali e trasversali: implementato con contratto esplicito;
- ancoraggi: implementati; sovrapposizioni e interruzione delle barre restano proprieta del layout fornito dal consumer;
- zone critiche e regole locali di duttilita: implementate;
- deformazioni a lungo termine: viscosita e curvatura da ritiro implementate.

Destinazione: micro-app esistente `single-beam-design` e verificatori riusabili.

### 2. Pilastri in c.a. (`implemented-local`)

Nuovo verificatore di asta che riutilizza i domini resistenti sezionali:

- pressoflessione monoassiale e deviata;
- snellezza ed effetti del secondo ordine;
- metodi normativi locali applicabili con lunghezza efficace e condizioni al
  contorno esplicite;
- taglio, dettaglio delle armature, confinamento e duttilita.

Il perimetro locale e implementato: oltre allo screening e al dominio
biassiale, genera i momenti del secondo ordine con rigidezza nominale quando
sono assegnati coefficiente di viscosita e lunghezze efficaci. Sono disponibili
taglio, armature, confinamento e domanda di duttilita. Il P-Delta globale resta
di competenza del modello FEM.

Destinazione: micro-app, con azioni e lunghezze efficaci assegnate manualmente;
in seguito gli stessi input potranno essere prodotti dal FEM globale.

### 3. Plinti e fondazioni superficiali locali (`implemented-local`)

Workflow costruito sopra piastre, punzonamento e verifiche sezionali:

- distribuzione delle pressioni con ipotesi di contatto dichiarata;
- perdita di contatto;
- flessione nelle due direzioni;
- taglio monodirezionale e punzonamento;
- schiacciamento locale e ancoraggio delle barre del pilastro;
- scorrimento e ribaltamento quando inclusi nel contratto.

La capacita portante geotecnica del terreno resta distinta dalla verifica
strutturale del plinto.

Il perimetro locale per plinti rettangolari con pilastro centrato comprende
contatto completo, parziale monoassiale e parziale biassiale, verifiche
strutturali sul poligono compresso, schiacciamento e ancoraggi. Capacita
portante e scorrimento restano resistenze geotecniche assegnate.

Destinazione iniziale: micro-app per plinti isolati; plinti combinati e
fondazioni geometricamente complesse richiederanno un perimetro separato.

### 4. Travi di fondazione (`implemented-local`)

Prima versione limitata a una trave su suolo elastico con legge e parametri
espliciti:

- carichi distribuiti e concentrati;
- rigidezza del sottofondo per tratti;
- cedimenti imposti;
- verifiche di resistenza e di esercizio della trave in c.a.

Destinazione: micro-app 1D; platee e interazioni spaziali terreno-struttura
restano nel percorso FEM.

Il perimetro locale e implementato per una trave prismatica orizzontale. Il letto di
Winkler e condensato in molle nodali tributarie e puo variare per tratti; sono
supportati carichi distribuiti e concentrati, combinazioni e cedimenti imposti
per tratti. Il contatto monolatero e risolto con active set e la rigidezza
fessurata e aggiornata iterativamente dalle curve momento-curvatura, includendo
la viscosita nelle combinazioni quasi permanenti. Il modulo di sottofondo e i
cedimenti restano input geotecnici assegnati.

### 5. Nodi trave-pilastro (`implemented-local`)

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

Il perimetro locale e implementato per nodi interni, esterni e d'angolo
dissipativi NTC 2018. Verifica domanda e compressione del
pannello nodale, armatura orizzontale con una delle due formulazioni normative,
confinamento, staffe e gerarchia pilastro-trave. Azioni, aree di armatura e
resistenze delle aste sono assegnate; le resistenze dei pilastri devono essere
gia selezionate rispetto ai segni dei momenti. Sono inoltre verificati
ancoraggi, trasferimento dell'eccentricita e stati 3D concorrenti mediante
aggregazione delle verifiche direzionali.

### 6. Regioni D e modelli tirante-puntone (`partial`)

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

Il primo MVP generico e implementato per tralicci piani a topologia assegnata.
Risolve forze assiali e reazioni, controlla la compatibilita di segno di
puntoni e tiranti e verifica puntoni, armature e facce nodali secondo
EN 1992-1-1:2004. Le zone nodali e i parametri nazionali sono input espliciti.
Topologia automatica, modelli 3D, ancoraggi e armature di splitting restano
fuori dal perimetro. I workflow geometrici per mensole, travi parete e plinti
su pali devono essere validati separatamente sopra questo kernel.

## Stato di chiusura del percorso c.a.

I cinque verificatori locali per travi, pilastri, plinti isolati, travi di
fondazione e nodi trave-pilastro sono `implemented-local`. Ognuno dispone di
un caso applicativo bloccante nella campagna di validazione, oltre ai test
unitari e ai benchmark dei kernel riusati. Lo stato certifica esclusivamente
il campo locale dichiarato: non include la generazione delle azioni o del
contesto resistente da un modello strutturale globale.

Per completare l'intero percorso dei verificatori in c.a. restano:

1. completamento dei modelli tirante-puntone per ancoraggi, armature di
   splitting e workflow geometrici validati per mensole, travi parete e
   plinti su pali;
2. contratto generico e serializzabile delle risultanti di superficie;
3. kernel di pannello a membrana, da usare come benchmark e nucleo del guscio,
   non come micro-app autonoma;
4. verificatore locale di guscio con formulazione Baumann precisamente
   identificata e validata, inclusi `N + M`, taglio trasversale e controlli
   SLE nel rispettivo campo di validita;
5. post-processore generico dei risultati shell FEM;
6. verificatori globali di sistema per setti e nuclei, pareti accoppiate,
   platee, diaframmi, serbatoi, silos e strutture scatolari;
7. orchestratore di edificio completo con scelta del comportamento strutturale,
   gerarchia delle resistenze e verifiche globali NTC 2018.

I punti 2-6 seguono la progressione FEM descritta di seguito; il punto 7 e il
nuovo macro-workflow di sintesi che completa la libreria. Non sono
funzionalita locali mancanti dei cinque moduli appena chiusi.

## Matrice normativa di riferimento

Tutte le verifiche fanno riferimento ai seguenti documenti, con ciascuna
formula dichiarata nel modulo che la implementa:

| Fonte | Riferimento | Capitoli pertinenti |
| --- | --- | --- |
| D.M. 17/01/2018 (NTC 2018) | [G.U. n. 42 del 20/02/2018](https://www.gazzettaufficiale.it/eli/id/2018/2/20/18A00716/sg) | § 3.2 (azione sismica), § 7.2 (criteri generali), § 7.3-7.4 (edifici in c.a.), § 7.8 (strutture non dissipative), § 7.9 (spostamenti) |
| Circolare 21/01/2019 n. 7 | [G.U. n. 35 del 11/02/2019](https://www.gazzettaufficiale.it/eli/id/2019/02/11/19A00855/sg) | C7.2 (regolarità), C7.3-C7.4 (dettagli c.a.), C7.8 (non dissipativo), C7.9 (drift) |
| D.M. 52 del 07/03/2023 | Emendamenti NTC 2018 | Aggiornamento materiali, fattori parziali, regole di dettaglio |

La matrice dettagliata "verifica → fonte normativa" e riportata in ogni modulo.
Non vengono introdotti coefficienti o formule senza citazione puntuale del
paragrafo e dell'equazione.

## Progressione verifiche globali edificio in c.a.

Il solutore FEM resta esterno. `strutture-js` riceve i risultati tramite i
contratti `GlobalFemModelContract`, `GlobalFemAnalysisContract`,
`GlobalFemResultContract` e `FemEntityMappingContract` (tutti v0, gia
implementati in `domain/fem/contracts`). L'adapter verso il solver concreto
appartiene al consumer.

### WP1 – Comportamento strutturale (`planned-kernel`)

**Dove:** `src/norms/ntc2018/reinforced-concrete/` (nuovo:
`structuralBehavior.js`)

**Cosa:** La scelta del comportamento strutturale e una decisione utente che
governa tutte le verifiche successive. Non e una deduzione automatica.

| Elemento | Riferimento | Descrizione |
| --- | --- | --- |
| `NTC2018StructuralBehavior` | § 7.3.2, § 7.8 | Enum: `non-dissipative`, `cd-a`, `cd-b`. Non dissipativo ammesso solo in zona sismica 3-4 o con `ag < 0.075g` (§ 7.8.1) |
| `NTC2018StructuralType` | § 7.3.3, § 7.4.2 | Enum: `frame`, `wall`, `coupled-wall`, `dual`, `core`, `torsionally-flexible`, `inverted-pendulum` |
| `selectOverstrengthFactors()` | § 7.4.4, Tab. 7.2.I | `gammaRd` **per meccanismo**: `beamShear`, `columnBending`, `columnShear`, `jointShear`, `wallShear` |
| `selectBaseQFactor()` | § 7.3.2.1, Tab. 7.3.II | `q0` per tipo strutturale e CD; `alpha_u/alpha_1` solo per telaio/pareti accoppiate/miste |
| `computeEffectiveQFactor()` | § 7.3.1, Eq. [7.3.1] | `q = q0 * kr`; `kr = 1.0` regolare, `0.8` non regolare in altezza |
| `selectAllowedAnalysisMethods()` | § 7.2.3 | Determina i metodi di analisi ammissibili: statica lineare, dinamica lineare |
| `NTC2018_QLimits` | Tab. 7.3.I | Limiti di `q` per stato limite: SLO/SLD `q=1` (SLD `<=1.5`); SLV dissipativo `>=1.5`, non dissipativo `<=1.5` |

**Stato:** `implemented` (in `structuralBehavior.js`). I fattori `gammaRd`
seguono la **Tab. 7.2.I per meccanismo** (travi taglio 1.20/1.10, pilastri
pressoflessione 1.30/1.30, pilastri taglio 1.30/1.10, nodi 1.20/1.10,
pareti taglio 1.20/—). I `q0` seguono la **Tab. 7.3.II** (telaio
4.5/3.0·αu/α1, pareti non accoppiate 4.0/3.0, pareti accoppiate e miste
4.5/3.0·αu/α1, deformabili torsionalmente 3.0/2.0, pendolo inverso
2.0/1.5). Validato dal caso indipendente `rc-cd-beam-column-hierarchy`.

**Output:** Contratto `structuralBehavior` serializzabile. Il consumer lo
imposta una volta; ogni verificatore lo riceve come input.

**Esclusioni:** Armature automatiche, deduzione automatica del tipo
strutturale, scelta automatica della classe di duttilita.

### WP2 – Regolarita strutturale (`planned-kernel`)

**Dove:** `src/norms/ntc2018/reinforced-concrete/` (nuovo:
`structuralRegularity.js`)

**Cosa:** Verifica della regolarita in pianta e in altezza secondo § 7.2.2.
I dati provengono dal modello FEM globale (masse di piano, rigidezze,
geometrie) e dal mapping strutturale.

| Verifica | Riferimento | Condizioni |
| --- | --- | --- |
| Regolarita in pianta | § 7.2.2.1, Tab. 7.2.I | Snellezza `Lmax/Lmin <= 4`, rientranze `<= 25%`, discontinuita impalcati, eccentricita masse-rigidezze `<= 0.3 r` |
| Regolarita in altezza | § 7.2.2.2, Tab. 7.2.II | Rapporto resistenze piano `>= 0.8`, variazione massa `<= 25%`, arretramenti `<= 20%`, assenza elementi inclinati |
| `kr` da regolarita | § 7.3.1 | `1.0` se regolare in altezza, `0.8` se non regolare |
| Metodo di analisi | § 7.2.3 | La regolarita condiziona il metodo: statica lineare solo per regolari in altezza con `T1 <= 2.5 TC` |

**Input:** Dal `GlobalFemModelContract` + `FemEntityMappingContract`:
coordinate dei nodi di piano, masse, rigidezze elastiche dei membri.

**Stato:** `implemented` (in `structuralRegularity.js`). La regolarita in
pianta e validata dal caso indipendente `rc-reg-plan`.

**Esclusioni:** Analisi non lineare, pushover, time history.

### WP3 – Adattamento kernel locali a input globale (`planned-local`)

**Obiettivo:** I verificatori locali esistenti (trave, pilastro, nodo) devono
poter ricevere input dal contesto globale senza duplicare il codice di
verifica. I kernel di calcolo restano identici; cambia solo l'adapter di input.

| Modulo | Adattamento richiesto |
| --- | --- |
| `single-beam-design` | Estrarre azioni dal `GlobalFemDemandSet` per il membro; usare le combinazioni dell'analisi globale; conservare il riferimento al membro |
| `reinforced-concrete-columns` | Estrarre azioni globali per il membro pilastro; dedurre lunghezze efficaci dai vincoli di telaio (fattore `beta`); ricevere `structuralBehavior` per applicare regole di dettaglio CD |
| `reinforced-concrete-beam-column-joints` | Iterare sui `joints` del `FemEntityMappingContract`; estrarre azioni alle estremita delle aste dal demand set; ricevere `gammaRd` dal comportamento |
| `reinforced-concrete-isolated-footings` | Estrarre reazioni dai vincoli di base del FEM globale; ricevere resistenze geotecniche dal modulo geotecnico esistente |

**Stato:** `planned-local`. I kernel non vengono modificati; gli adapter sono
nuovi file che affiancano le applicazioni esistenti.

**Esclusioni:** P-Delta globale (resta nel solutore FEM esterno); plinti
combinati e fondazioni complesse.

### WP4 – Gerarchia delle resistenze (capacity design) (`deferred-fem`)

**Dove:** `src/norms/ntc2018/reinforced-concrete/` (nuovo:
`capacityDesign.js`) e orchestratore in
`src/applications/rc-building-verification/`

**Cosa:** L'orchestratore raccoglie i momenti resistenti dai verificatori
locali, applica i `gammaRd` e confronta domanda e capacita secondo i
criteri di gerarchia NTC 2018. Attivo solo per comportamento dissipativo
(CD"A" e CD"B"); per non dissipativo restituisce `not-analyzed`.

| Verifica | Riferimento | Calcolo |
| --- | --- | --- |
| Gerarchia trave-pilastro | § 7.4.4, Eq. [7.4.4] | `gammaRd * sum(MRb) <= sum(MRc)` al netto dello sforzo normale; per ogni nodo e per ogni direzione sismica |
| Taglio di capacita travi | § 7.4.5, Eq. [7.4.14-15] | `VEd = gammaRd * (M+ + M-) / lcl + Vg+q`; confronto con `VRd` del kernel trave esistente |
| Taglio di capacita pilastri | § 7.4.6.1, Eq. [7.4.16-17] | `VEd = gammaRd * (M+ + M-) / lcl`; confronto con `VRd` del kernel pilastro esistente |
| Gerarchia nodi | § 7.4.7, Eq. [7.4.6-7] | Delegata al modulo `reinforced-concrete-beam-column-joints` esistente, alimentato con `gammaRd` |

**Input:** `FemEntityMappingContract`, `GlobalFemResultContract`,
`NTC2018StructuralBehavior`, output dei verificatori locali (momenti
resistenti).

**Output per membro e giunto:** `capacityDesignDemand`, `capacity`,
`utilizationRatio`, `checks[]`.

**Stato:** `implemented` il kernel di domanda (in `capacityDesign.js`);
`partial` l'orchestratore in `rc-building-verification/` (la raccolta dei
momenti resistenti dai verificatori locali non e ancora automatizzata).
Validato dai casi indipendenti `rc-cd-beam-column-hierarchy`,
`rc-cd-beam-capacity-shear`, `rc-cd-column-capacity-shear`.

**Esclusioni:** Gerarchia per pareti (richiede WP-SETTI); giunti non
conformi al modulo esistente.

### WP5 – Verifiche globali di spostamento (`deferred-fem`)

**Dove:** `src/norms/ntc2018/reinforced-concrete/` (nuovo:
`displacementChecks.js`)

**Cosa:** Verifiche di drift di interpiano ed effetti del secondo ordine
(P-Delta) secondo §§ 7.3.5, 7.3.7, 7.9.

| Verifica | Riferimento | Formula / Limite |
| --- | --- | --- |
| Drift SLE (SLO/SLD) | § 7.3.7.1, Eq. [7.3.6] | `dr <= 0.005 h` per tamponamenti collegati rigidamente; `0.01 h` per tamponamenti non collegati; `0.01 h` per edifici senza tamponamenti |
| Drift SLU (SLV) | § 7.3.7.2, Eq. [7.3.7] | `dr <= 0.01 h` per edifici dissipativi; per non dissipativi: limiti SLE |
| Effetti P-Delta | § 7.3.5, Eq. [7.3.2] | `theta = P * dr / (V * h) <= 0.1` (statica lineare); se `0.1 < theta <= 0.2`, amplifica spostamenti di `1/(1-theta)`; se `theta > 0.2`, analisi non lineare richiesta |
| Giunto sismico | § 7.2.2, Eq. [7.2.1] | Distanza minima tra edifici adiacenti: `max(d1, d2)` con `d = 0.01 * h` per CD oppure spostamento SLV |

**Input:** `GlobalFemResultContract` (spostamenti nodali, reazioni di piano),
`FemEntityMappingContract` (piani/storeys), `NTC2018StructuralBehavior`.

**Output per piano:** `drift`, `storeyShear`, `storeyWeight`, `theta`,
`checks[]`.

**Stato:** `implemented` il kernel (in `displacementChecks.js`); `partial`
l'integrazione nell'orchestratore (pesi e tagli di piano non sono ancora
estratti automaticamente dai contratti FEM, quindi il P-Delta si auto-salta
quando i dati mancano). Validato dai casi indipendenti
`rc-disp-storey-drift` e `rc-disp-pdelta`.

**Esclusioni:** Analisi non lineare (pushover o time history); `theta > 0.2`
restituisce `not-supported` e richiede al consumer un'analisi non lineare.

### WP6 – Orchestratore di edificio (`deferred-fem`)

**Dove:** `src/applications/rc-building-verification/` (nuovo)

**Cosa:** L'applicazione che cuce l'intero flusso di verifica edificio.
Riceve tutti i contratti, la scelta di comportamento e i materiali, esegue
le verifiche in sequenza e produce un report di edificio serializzabile.

**Pipeline `run()`:**

```text
1. Validazione contratti (validator esistenti)
2. Classificazione entita (GlobalFemStructuralClassifier esistente)
3. Estrazione domande (GlobalFemDemandExtractor esistente)
4. WP2 – Regolarita strutturale → kr, q effettivo
5. Per ogni membro trave: SingleBeamAnalysis (kernel esistente, WP3)
6. Per ogni membro pilastro: ReinforcedConcreteColumnVerification (WP3)
7. Per ogni giunto: BeamColumnJointVerification (WP3)
8. WP4 – Gerarchia delle resistenze → aggiorna tagli di calcolo
9. Riverifica tagli con i valori di capacita (kernel esistenti)
10. WP5 – Spostamenti di piano e P-Delta
11. Aggregazione esiti → VerificationResult edificio
```

**Output (serializzabile):**
- `status`: `ok` se tutte le verifiche applicabili sono soddisfatte
- `structuralBehavior`: confermato dal consumer
- `regularity`: classi, `kr`, `q0`, `q`, metodo di analisi
- `members[]`: per ogni membro, i propri `checks`, `demand`, `capacity`, `utilizationRatio`
- `joints[]`: checks aggregati per nodo
- `storeys[]`: drift, theta, P-Delta
- `capacityDesign`: rapporti gerarchici per nodo e membro
- `checks[]`: checks globali (`regularity-plan`, `regularity-elevation`, `drift-sle`, `drift-slu`, `pdelta`)
- `warnings[]`, `assumptions[]`, `metadata`

**Stati parziali:**
- Se comportamento non dissipativo: WP4, nodi e gerarchia → `not-analyzed`
- Se manca il mapping: profilo bloccato (`not-implemented` per verifiche
  semantiche)
- Se mancano dati FEM: assessment `blocked` con `missingInputs`

**Stato:** `partial`. Implementate la validazione contratti, il behavior,
la regolarita (WP2), gli spostamenti/P-Delta (WP5, con pesi e tagli di
piano estratti da `storeyResults.resultants`), la verifica member-level
tramite **verificatori iniettati dal consumer** (`memberVerifiers`) e la
gerarchia trave-pilastro (WP4) tramite `jointHierarchy`. Le armature non
sono generate automaticamente: il consumer fornisce sezioni, materiali e
verificatori per ciascun membro.

**Correzioni applicate (verifica contro D.M. 17/01/2018):**
- Displacement: lettura `translations.{x,y,z}` (minuscolo) dal contratto
  risultati, non piu `Ux` — prima il drift risultava sempre nullo.
- Footing: lettura `forces.{x,y,z}`/`moments.{x,y,z}` (con alias legacy).
- P-Delta: si attiva solo se peso e taglio di piano sono positivi; altrimenti
  si auto-salta invece di lanciare.

**Esclusioni:** Armature automatiche, solutore FEM interno, analisi non
lineare, tamponamenti, verifica di setti e piastre (seguono percorsi
separati).

### WP7 – Emendamenti D.M. 52/2023 (`planned-kernel`)

**Dove:** `src/norms/ntc2018/reinforced-concrete/` (nuovo: `dm522023.js`)

**Cosa:** Funzioni e costanti che affiancano o sovrascrivono i valori NTC
2018 base in presenza degli emendamenti.

| Ambito | Possibile impatto |
| --- | --- |
| Acciai B450C-B600 | Estensione catalogo `NTC2018_REINFORCEMENT_STEEL_GRADES` |
| Fattori parziali modificati | `gammaC`, `gammaS` |
| Regole di dettaglio aggiuntive | Zone critiche pilastri, passo staffe |

**Stato:** `planned-kernel`. L'implementazione e subordinata alla verifica
del testo ufficiale. Ogni sovrascrittura dichiara esplicitamente la fonte.

**Esclusioni:** Interpretazioni non ufficiali; norme regionali.

---

## Progressione setti in c.a. da FEM esterno

I setti (pareti sismiche) ricevono le azioni dal solutore FEM esterno tramite
section cut verticali lungo l'altezza del setto. Il solutore FEM non fa parte
di `strutture-js`; la libreria riceve i risultati gia integrati.

### SETTI-1 – Contratto section cut per setti (`planned-kernel`)

**Dove:** `src/domain/fem/contracts/` (estensione dei contratti esistenti)

**Cosa:** Un section cut verticale allineato con l'asse del setto, per ogni
piano e per ogni combinazione sismica, trasporta:

```js
{
  wallId,
  storeyId,
  combinationId,
  elevation,           // quota del taglio [length]
  axes,                // terna locale: x=longitudinale, y=trasversale, z=verticale
  integratedActions: {
    N,                 // sforzo normale [force] (+ compressione)
    Vx, Vy,            // tagli nelle due direzioni [force]
    Mx, My,            // momenti flettenti [force*length]
    T,                 // momento torcente [force*length]
  },
  units,
  metadata
}
```

Le convenzioni dei segni devono essere coerenti con il sistema globale. Un
capitolo `wallSectionCuts` nei contratti FEM descrive le capability richieste
(`sectionCut` deve essere `true`).

**Stato:** `planned-kernel`.

### SETTI-2 – Verificatore sezionale del setto (`deferred-fem`)

**Dove:** `src/norms/ntc2018/reinforced-concrete/` (nuovo:
`ntc2018ShearWall.js`)

**Cosa:** Per ogni sezione orizzontale del setto (a ogni piano), verifica
pressoflessione deviata e taglio. La sezione e composta: anima + eventuali
elementi di bordo (bulbi). Il dominio resistente e costruito con il kernel
a fibre esistente.

| Verifica | Riferimento | Calcolo |
| --- | --- | --- |
| Pressoflessione deviata | § 4.1.2.3.9, § 7.4.4.5.1 | Dominio biassiale a fibre con `NEd` assegnato; confronto raggio vettore `(Mx, My)` con contorno |

**Stato:** `implemented`. La pressoflessione biassiale e collegata al
risolutore a fibre (`RCUltimateSectionSolver.solveAtAxialLoad`) tramite
`verifyWallBiaxialBending` in
`src/applications/rc-building-verification/wallBiaxialVerification.js`
(livello `applications`, perche compone solver `applications` + leggi
`domain`). L'orchestratore la esegue per ogni setto con sezione e azioni
fornite dal consumer (`wallSections`). Validato dal caso indipendente
`rc-wall-biaxial-bending`.
| Taglio | § 7.4.8.2, Eq. [7.4.22-23] | `VRd = VRd,c + VRd,s` con `alpha_c = 1.0` per setti tozzi (`h_w/l_w <= 2`); `cot(theta) = 1.0` per CD"A" |
| Compressione diagonale anima | § 7.4.8.2, Eq. [7.4.24] | `VRd,max = 0.8 * fcd * bw * l_w * 0.8 * cot(theta) / (1 + cot^2(theta))` per CD"B"; fattore `0.15` aggiuntivo in CD"A" |

### SETTI-3 – Gerarchia e traslazione dei momenti (`deferred-fem`)

**Dove:** `src/norms/ntc2018/reinforced-concrete/ntc2018ShearWall.js`

**Cosa:** La regola di capacity design per i setti snelli (§ 7.4.4.5.1)
richiede la traslazione verso l'alto del diagramma dei momenti flettenti per
coprire gli effetti dei modi superiori. Questa e una delle particolarita
normative piu rilevanti.

| Parametro | CD"A" | CD"B" |
| --- | --- | --- |
| Altezza zona critica `h_cr` (Eq. [7.4.13]) | `max(l_w, h_w / 6)`, inoltre `<= 2 l_w` e `<= h_s` se fornita | uguale |
| Traslazione momento `a_l` (Presso-flessione) | `a_l = h_cr` | `a_l = h_cr` |
| Taglio di capacita (Taglio) | `eps = 1.5 * q * (gammaRd * MRd / MEd) * (Se(T_C) / Se(T_1))^2`, `VEd = eps * V_analisi` | uguale |

La traslazione `a_l` sposta il diagramma dei momenti di progetto verso
l'alto: il momento a quota `z` diventa il momento a quota `z + a_l`,
producendo una domanda maggiorata nelle zone critiche alla base. Il taglio
amplificato non puo essere inferiore al taglio da analisi.

> **Correzione (verifica contro NTC 2018):** una versione precedente di
> questa sezione riportava `a_l = max(0.5 l_w, 0.5 h_cr)` per CD"A",
> `max(0.25 l_w, 0.25 h_cr)` per CD"B" e `VEd = gammaRd * MRd / h_w * omega`
> con `omega = 1.5 / 1.3`. Tali formule **non compaiono** nel D.M.
> 17/01/2018: la traslazione e `h_cr` e il taglio segue l'espressione con
> `Se(T_C)/Se(T_1)` sopra riportata. Il kernel `ntc2018ShearWall.js` e stato
> corretto di conseguenza.

**Stato:** `implemented` (in `ntc2018ShearWall.js`). Validato dai casi
indipendenti `rc-wall-critical-zone`, `rc-wall-moment-shift`,
`rc-wall-capacity-shear`.

**Riferimenti:** § 7.4.4.5.1, Eq. [7.4.13] (h_cr), Presso-flessione
(traslazione), Taglio (amplificazione); Circolare C7.4.4.5.

### SETTI-4 – Elementi di bordo confinati (`deferred-fem`)

**Dove:** `src/norms/ntc2018/reinforced-concrete/ntc2018ShearWall.js`

**Cosa:** Verifica della necessita di elementi di bordo confinati alle
estremita del setto (§ 7.4.8.4).

| Condizione | Riferimento | Soglia |
| --- | --- | --- |
| Compressione massima | § 7.4.8.4, Eq. [7.4.25] | `sigma_c > 0.20 fcd` → richiede confinamento |
| Profondita zona confinata | § 7.4.8.4, Eq. [7.4.26] | `x_u = (nu + omega_v) * l_w * b / b0` |
| Lunghezza elemento di bordo | § 7.4.8.4 | `max(l_w / 6, x_u * (1 - x_u / l_w))` ma non meno di `bw` |
| Armatura trasversale | § 7.4.8.4, Eq. [7.4.29] | `omega_wd >= max(0.08, 30 * mu_phi * nu * eps_sy * b / b0 - 0.035)` per CD"A" |
| Duttilita in curvatura `mu_phi` | § 7.4.8.4 | `mu_phi = 2 q - 1` per `T1 >= TC`; `mu_phi = 1 + 2 (q - 1) * TC / T1` per `T1 < TC` |

Per CD"B" le verifiche di confinamento sono ridotte: `omega_wd >= 0.04` e
non dipendono dalla domanda di duttilita.

### SETTI-5 – Post-processore di sistema setto (`deferred-fem`)

**Dove:** `src/applications/rc-building-verification/` (integrato
nell'orchestratore)

**Cosa:** Per ogni setto mappato nel `FemEntityMappingContract`:

1. raccoglie i section cut verticali per ogni piano;
2. applica la traslazione dei momenti `a_l` (SETTI-3);
3. verifica pressoflessione e taglio a ogni livello (SETTI-2);
4. verifica elementi di bordo alla base e ai piani critici (SETTI-4);
5. verifica drift di piano (WP5, condiviso con i telai);
6. aggrega in `checks[]` e restituisce `utilizationRatio` per setto.

**Particolarita:** Il setto non e una trave inflessa: le sezioni orizzontali
sono alimentate dalle risultanti integrate dei section cut, non da un modello
di asta equivalente. La lunghezza `l_w` e l'altezza `H_w` provengono dal
`FemEntityMappingContract`.

**Stato:** `deferred-fem`.

**Esclusioni:**
- Pareti accoppiate (richiedono un modello di trave di accoppiamento non
  ancora implementato);
- Setti debolmente armati (§ 7.4.8.5): primo perimetro solo setti duttili
  CD"A" e CD"B";
- Instabilita fuori piano (§ 7.4.8.3): richiede analisi di buckling dedicata;
- Generazione automatica dei section cut: il consumer FEM deve fornirli.

---

## Progressione piastre e diaframmi da FEM esterno

Le piastre ricevono le risultanti shell dal solutore FEM esterno tramite il
contratto `shellResultants` gia presente in `GlobalFemResultContract`. Il
verificatore locale Wood-Armer (`reinforced-concrete-plates`) e gia
`implemented`. Manca il post-processore che trasforma le risultanti FEM in
input per il verificatore e gestisce l'azione diaframma.

### PIASTRE-1 – Post-processore risultanti shell per piastre (`deferred-fem`)

**Dove:** `src/applications/rc-building-verification/` (integrato
nell'orchestratore)

**Cosa:** Per ogni impalcato mappato nel `FemEntityMappingContract`:

1. raccoglie le risultanti shell dal `GlobalFemResultContract`
   (`bending: {mxx, myy, mxy}`, `transverseShear: {vx, vy}`);
2. per ogni elemento shell, applica Wood-Armer (kernel `reinforced-concrete-plates`
   esistente) con l'angolo delle armature dichiarato;
3. aggrega i risultati per impalcato: inviluppo dei momenti di progetto,
   verifiche SLU flessione e taglio, controlli SLE;
4. restituisce `checks[]` per impalcato.

**Particolarita:** Il contratto `shellResultants` dichiara gia `face`,
`localAxes` e `location`. L'angolo delle armature della piastra deve essere
fornito dal consumer (non esiste una convenzione universale). Il
post-processore applica la rotazione nel piano prima di invocare Wood-Armer.

**Stato:** `deferred-fem`.

### PIASTRE-2 – Verifica a diaframma (`deferred-fem`)

**Dove:** `src/norms/ntc2018/reinforced-concrete/` (nuovo:
`ntc2018Diaphragm.js`)

**Cosa:** Verifica dell'impalcato come diaframma orizzontale (§ 7.4.8.5).
L'azione nel piano (membrana) trasferisce le forze sismiche di piano ai
sistemi resistenti verticali.

| Verifica | Riferimento | Calcolo |
| --- | --- | --- |
| Trazione diagonale | § 4.1.2.3.5, § 7.4.8.5 | `sigma_t = V / (b * h) <= fctd` con verifica a compressione-trave |
| Compressione puntoni | § 4.1.2.3.5 | `sigma_c = 2 V / (b * h) <= 0.5 fcd` |
| Armatura cordolo | § 7.4.8.5 | `As >= V / fyd` perimetrale; `A_s,min = 0.003 Ac` per cordoli |
| Taglio connessione | § 7.4.8.5 | `tau = V / (b * z) <= 0.30 fcd` per giunti di ripresa |

Le risultanti membranali `nxx`, `nyy`, `nxy` provengono dal contratto
`shellResultants` del FEM esterno.

**Stato:** `deferred-fem`.

**Esclusioni:** Solai metallici o misti acciaio-calcestruzzo; piastre con
discontinuita geometriche complesse; analisi non lineare del diaframma.

---

## Sottomodulo tirante-puntone

Il modello tirante-puntone resta in un percorso separato che alimenta
micro-app indipendenti. Non viene integrato nell'orchestratore edificio.

| Capacita | Stato |
| --- | --- |
| Kernel 2D traliccio piano a topologia assegnata | `partial` |
| Ancoraggi e armature di splitting | `planned-kernel` |
| Mensole tozze (workflow geometrico) | `planned-local` |
| Travi parete (workflow geometrico) | `planned-local` |
| Plinti su pali (workflow geometrico) | `planned-local` |

**Destinazione:** `src/applications/reinforced-concrete-strut-and-tie/` e
future micro-app `rc-corbel`, `rc-deep-beam`, `rc-pile-cap`.

---

## Mappa delle dipendenze aggiornata

```text
sezioni RC
  +-- trave RC completa
  +-- pilastro RC
  +-- verifiche locali di fondazioni

piastre RC + punzonamento + sezioni RC
  +-- plinti superficiali
  +-- post-processore piastre da FEM (PIASTRE-1)
        +-- verifica a diaframma (PIASTRE-2)

trave FEM 2D + sezioni RC
  +-- trave di fondazione su suolo elastico

pannello a membrana RC
  +-- verificatore locale di guscio RC
        +-- post-processore di risultati shell FEM
              +-- setti e nuclei
              +-- platee generali
              +-- diaframmi
              +-- serbatoi, silos e altri sistemi a guscio

modello tirante-puntone (percorso indipendente)
  +-- mensole tozze
  +-- travi parete e regioni D
  +-- plinti su pali

comportamento strutturale (WP1) + regolarita (WP2)
  +-- gerarchia delle resistenze (WP4)
  +-- verifiche globali di spostamento (WP5)
  +-- orchestratore edificio (WP6)
        +-- adattatori kernel locali (WP3)
        +-- verificatore setti (SETTI-5)
        +-- post-processore piastre (PIASTRE-1)
```

---

## Riepilogo nuovi stati

| Capacita | Stato | Note |
| --- | --- | --- |
| Comportamento strutturale NTC 2018 | `planned-kernel` | WP1 |
| Regolarita strutturale | `planned-kernel` | WP2 |
| Adattatori kernel locali a FEM globale | `planned-local` | WP3 |
| Gerarchia delle resistenze (capacity design) | `deferred-fem` | WP4 |
| Verifiche globali di spostamento (drift, P-Delta) | `deferred-fem` | WP5 |
| Orchestratore edificio in c.a. | `deferred-fem` | WP6 |
| Emendamenti D.M. 52/2023 | `planned-kernel` | WP7 |
| Section cut per setti | `planned-kernel` | SETTI-1 |
| Verificatore sezionale setti | `deferred-fem` | SETTI-2 |
| Traslazione momenti e taglio di capacita setti | `deferred-fem` | SETTI-3 |
| Elementi di bordo confinati setti | `deferred-fem` | SETTI-4 |
| Post-processore di sistema setto | `deferred-fem` | SETTI-5 |
| Post-processore piastre da FEM | `deferred-fem` | PIASTRE-1 |
| Verifica a diaframma | `deferred-fem` | PIASTRE-2 |

---

## Collocazione architetturale

La direzione delle dipendenze resta `applications -> norms -> domain`.

- `domain`: risultanti generiche, assi, geometrie, layout di armatura, pannelli,
  strati, primitive numeriche e contratti FEM indipendenti dalla norma;
- `norms`: trasformazioni e verifiche normative con fonti e campo di validita;
  qui risiedono i nuovi kernel `structuralBehavior`, `structuralRegularity`,
  `capacityDesign`, `displacementChecks`, `ntc2018ShearWall`,
  `ntc2018Diaphragm`, `dm522023`;
- `applications`: orchestrazione deterministica delle micro-app e
  dell'orchestratore edificio `rc-building-verification`;
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
- La scelta del comportamento strutturale (dissipativo CD"A"/CD"B" o non
  dissipativo) e una decisione esplicita del consumer e non viene dedotta
  automaticamente.
- Le armature automatiche restano escluse: tutti i layout di armatura sono
  input forniti dal consumer.
- Il solutore FEM e esterno; `strutture-js` fornisce i contratti di scambio
  e i verificatori, non esegue l'analisi globale.
- Il modello tirante-puntone resta un percorso indipendente che alimenta
  micro-app separate.
- L'analisi non lineare (pushover, time history) e esclusa dal perimetro.
- I tamponamenti e la loro interazione con il telaio sono esclusi dal
  perimetro.
- Le verifiche geotecniche (capacita portante, scorrimento, ribaltamento)
  sono gia implementate nei moduli `geotechnical-*` e restano input assegnati
  per le fondazioni.
- Ogni formula che coinvolge `gammaRd`, `q0`, `kr`, `a_l` o `omega` deve
  dichiarare esplicitamente il riferimento normativo (NTC 2018, Circolare
  2019 o D.M. 52/2023) nel modulo che la implementa.
