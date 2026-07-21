# Fondazioni profonde soggette ad azioni laterali

## Stato del modulo

L'entry point pubblico e `geotechnical-lateral-piles`. Sono disponibili due
workflow distinti:

- `broms-short-free-head`, per la capacita ultima statica di un palo corto e
  rigido in terreno omogeneo;
- `beam-on-py-springs`, per la risposta statica non lineare di un palo
  Euler-Bernoulli su curve `p-y` assegnate per strato e profondita.

Il secondo workflow produce mesh, spostamenti, rotazioni, tagli, momenti,
reazioni del terreno, stato secante e tangente delle molle e diagnostica di
convergenza. Non deduce automaticamente le curve empiriche dai soli parametri
del terreno: ogni curva deve avere una provenienza esplicita.

`micropiles-broms` e mantenuto come entry point deprecato: inoltra i nuovi
contratti al solver generale, mentre il vecchio `MicropileBromsModel`, privo
dei dati geotecnici necessari, resta `not-implemented`.

## Contratti di ingresso

L'applicazione riceve:

- `GroundModel`, con un `GroundProfile` che si estende sotto la punta;
- `GeotechnicalDesignSituation` statica, con stato limite, drenaggio e base
  dei parametri dichiarati;
- `DeepFoundationModel`, condiviso con la capacita assiale;
- `LateralPileLoadScenario` per Broms oppure
  `LateralPileResponseScenario` per il metodo `p-y`;
- unita esplicite `{ force, length }`.

Nel ramo Broms le azioni sono magnitudini non negative. `lateralShear` e
`overturningMoment` devono essere gia trasferiti al punto
`groundline-at-pile-axis` e agire nello stesso verso del meccanismo. La
classificazione `short-rigid` e un'asserzione tracciata del progetto: il
solver non la deduce da `EI` o dalla rigidezza del terreno.

Nel ramo `p-y`, taglio e momento sono firmati e applicabili alla testa del palo
o al piano campagna. Sono coniugati rispettivamente allo spostamento laterale e
alla rotazione `dy/dx`, con la profondita `x` positiva verso il basso. Testa e
punta possono avere traslazione e rotazione `free` o `fixed`.

Il modello normalizza internamente forze in `kN`, lunghezze in `m`, momenti in
`kN.m`, tensioni in `kN/m2` e reazioni distribuite in `kN/m`.

## Fonte e campo di validita

La formulazione segue FHWA GEC 9, FHWA-HIF-18-031 (2018): sezione 6.5,
equazioni 6-8--6-17, per Broms; sezioni 6.3--6.3.1, equazioni 6-1--6-5, per il
modello trave su molle. La fonte circoscrive Broms a pali corti e rigidi e
raccomanda `p-y` per pali lunghi governati da flessione e deformazione.

Sono quindi condizioni obbligatorie:

- palo singolo verticale e sezione uniforme rappresentata dal diametro
  equivalente `B`;
- contatto terreno-palo a partire dal piano campagna;
- un solo strato omogeneo per l'intera infissione;
- terreno orizzontale e carico statico;
- testa `free-to-rotate` e comportamento dichiarato `short-rigid`;
- ramo coesivo in tensioni totali oppure ramo incoerente in tensioni efficaci.

Questi limiti riguardano Broms. Il workflow `p-y` ammette stratigrafia e
vincoli di testa generali, ma nel presente incremento resta statico monotono e
a palo singolo.

## Ramo coesivo non drenato

Con resistenza non drenata `su` e larghezza equivalente `B`, i primi `1.5 B`
non forniscono resistenza. Sotto tale profondita la reazione ultima per unita
di lunghezza e:

```text
p_u = 9 su B
f   = P_t / p_u
M_max = M_t + P_t (1.5 B + 0.5 f)
g   = sqrt(M_max / (2.25 su B))
L_richiesta = 1.5 B + f + g
```

`P_t` e il taglio al piano campagna e `M_t` il momento applicato nello stesso
verso. La capacita laterale per l'infissione disponibile e la radice monotona
per cui `L_richiesta` coincide con `L`.

## Ramo incoerente drenato

Per `c'=0` si usa il coefficiente passivo di Rankine:

```text
K_p = tan^2(45 deg + phi'/2)
p_u(z) = 3 B gamma' z K_p
P_ult = 0.5 gamma' B L^2 K_p - M_t/L
f = sqrt(P_t / (1.5 B gamma' K_p))
M_max = M_t + P_t f - 0.5 B gamma' K_p f^3
```

Il solver restituisce inoltre l'infissione richiesta, risolvendo
numericamente l'equilibrio cubico. `gamma'` e:

- il peso di volume bulk se la falda non e modellata o e alla/sotto la punta;
- `gamma_sat - gamma_w` se la falda e al/sopra il piano campagna.

Una falda interna all'infissione interrompe il gradiente lineare richiesto da
questa idealizzazione e restituisce `not-supported`; non viene sostituita con
un peso equivalente implicito.

## Resistenza nominale e verifica

FHWA segnala che Broms per pali corti non e calibrato direttamente nel formato
LRFD. Senza `resistanceConversion`, il modulo restituisce la capacita nominale
e `verification.status = not-performed`.

Una verifica e eseguita solo se il consumer assegna esplicitamente:

```js
resistanceConversion: {
  model: "soil-reaction-factor",
  factor: 0.8,
  provenance: { source: "project-specific basis" },
}
```

Il fattore, compreso tra zero e uno, scala la reazione ultima del terreno e
quindi modifica in modo coerente capacita, profondita caratteristiche e
momento massimo. Non e un coefficiente normativo predefinito.

## Risultato e interazione strutturale

Il risultato serializzabile `lateral-pile-capacity-result/v1` conserva:

- dati normalizzati di palo, scenario, strato e parametri risolti;
- capacita nominale ed eventuale capacita convertita;
- infissione richiesta, `f`, `g`, posizione del taglio nullo e `M_max`;
- schema di reazione limite idealizzato;
- `demand`, `capacity`, `checks` e `utilizationRatio` quando la conversione e
  disponibile;
- `structuralCoupling.actionEffects`, con taglio al piano campagna e massimo
  momento flettente da passare a un verificatore strutturale separato.

Lo schema di reazione e un'immagine del meccanismo completamente mobilitato,
non una legge di molla. Non deve essere trasformato in una rigidezza FEM.

## Modello trave su molle p-y

### Legge di trasferimento

`PileTransferLaw` implementa il contratto versionato `pile-transfer-law/v1`.
Nel ramo attuale:

- `kind = p-y`;
- la curva e simmetrica e statica monotona;
- i punti positivi sono coppie `displacement`--`resistancePerLength`;
- l'interpolazione fra punti e lineare;
- oltre l'ultimo punto la legge e costante o lineare secondo
  `extrapolation`;
- la resistenza mobilitata ha il segno dello spostamento; la reazione del
  terreno sul palo ha segno opposto.

Le curve sono assegnate in `soilResponse.curvesByLayer`. Ogni strato contiene
una o piu stazioni, individuate dalla profondita sotto piano campagna. Se sono
presenti piu stazioni, il solver interpola linearmente le risposte e le
tangenti valutate allo stesso spostamento. Fuori dall'intervallo delle stazioni
usa la stazione piu vicina, senza estrapolare implicitamente la dipendenza
dalla profondita.

Un eventuale `reactionMultiplier` diverso da uno richiede una provenienza
esplicita e scala sia la resistenza sia la tangente; non e dedotto dal gruppo
o dalla tecnologia del palo.

### Discretizzazione e assemblaggio

La mesh comprende testa, piano campagna, punta e tutte le interfacce di strato;
ogni intervallo e suddiviso rispettando `maxElementLength`. Il palo e una trave
Euler-Bernoulli con `EI` costante assegnato e tracciato.

La reazione `p` e forza per unita di lunghezza. Ogni elemento interrato assegna
meta della propria lunghezza tributaria a ciascun nodo. Un nodo su
un'interfaccia riceve quindi due contributi distinti, valutati con le curve dei
due strati adiacenti. La molla nodale restituisce:

```text
R_i(y_i) = sum_j p_j(y_i) L_tributaria,j
K_t,i    = sum_j dp_j/dy L_tributaria,j
```

La forma ridotta risolta, senza carico assiale e senza carico distribuito sul
fusto, e:

```text
EI d4y/dx4 + p(y,x) = 0
```

Le azioni concentrate e le condizioni cinematiche entrano nel sistema FEM
nodale. Non viene applicata una rigidezza secante globale: ogni iterazione usa
la tangente del tratto corrente di ciascuna curva.

### Soluzione non lineare

Il carico e applicato incrementalmente. Ogni passo usa Newton con tangente
analitica e ricerca lineare; se non converge, l'incremento viene dimezzato fino
a `minimumLoadIncrement`. Il risultato conserva passi accettati, iterazioni,
riduzioni della ricerca lineare, cutback, fattore di carico raggiunto e motivo
dell'eventuale arresto.

La convergenza e controllata sui residui dei gradi di liberta liberi, con scale
separate per forze e momenti. `equilibrium` espone inoltre il bilancio globale
fra taglio applicato, reazioni del terreno e reazioni dei vincoli.

### Risultato p-y

`lateral-pile-py-result/v1` contiene:

- mesh serializzabile e associazione elemento--strato;
- spostamento e rotazione di tutti i nodi;
- reazione, rigidezza secante, tangente e contributi tributari di ogni molla;
- taglio e momento agli estremi di ogni elemento e relativi massimi;
- reazioni dei vincoli e residui di equilibrio;
- storia incrementale e diagnostica di convergenza;
- `structuralCoupling.responseMode.status = available`, con stato nodale
  riusabile dal FEM strutturale.

`capacity`, `checks` e `utilizationRatio` restano nulli o vuoti: questa e
un'analisi di risposta, non una verifica strutturale o una resistenza
geotecnica normativa.

## Ponte verso il FEM completo

L'API separa geometria del palo, situazione geotecnica, azioni e leggi di
trasferimento. Il modello ridotto ora fornisce:

- discretizzazione dell'asse del palo come trave strutturale;
- curve `p-y` per stazione, fonte e parametri tracciati;
- stato, tangente e limiti di ogni molla non lineare;
- spostamento, rotazione, taglio, momento e reazione lungo il palo;
- condizioni di testa e punta, stratigrafia e diagnostica di discretizzazione;
- un contratto nodale consumabile senza dipendenze da UI o prodotti esterni.

Il futuro FEM continuo restera un livello distinto per installazione,
interfaccia tridimensionale, meccanismi di gruppo e calibrazione dei modelli
ridotti. Restano fuori dal modello attuale:

- carico ciclico, degradazione, scarico-ricarico e deformazioni permanenti;
- sisma, liquefazione e spostamento imposto del terreno;
- carico assiale e rigidezza geometrica `P-delta`;
- rigidezza flessionale non lineare, fessurazione e deformazione a taglio;
- interazione di gruppo e `p-multiplier` automatici;
- curve empiriche generate automaticamente da classificazione e parametri del
  terreno;
- verifica strutturale delle sezioni del palo.

## Validazione

`validation/geotechnicalLateralPileValidationCampaign.js` verifica con
ricalcoli indipendenti:

1. le equazioni coesive 6-8--6-12 e la radice di capacita;
2. il ramo incoerente, `Kp`, momento massimo e conversione assegnata;
3. il peso di volume immerso con falda al piano campagna.

I test di contratto coprono inoltre conversione delle unita, serializzazione,
stratigrafia non supportata, falda interna, ponte strutturale e compatibilita
dell'entry point deprecato.

`validation/geotechnicalLateralPilePyValidationCampaign.js` aggiunge:

1. mensola Euler-Bernoulli con soluzione chiusa;
2. trave lunga su Winkler lineare confrontata con la soluzione semi-infinita;
3. equilibrio chiuso di una molla non lineare a plateau accoppiata a un
   elemento flessionale.

I test `p-y` verificano anche unita e simmetria della legge, interpolazione per
profondita, stratigrafia, contributi all'interfaccia, routing applicativo,
equilibrio globale e guardrail sismico.

Riferimento primario:
[FHWA GEC 9, Design and Analysis of Laterally Loaded Deep Foundations](https://www.fhwa.dot.gov/engineering/geotech/pubs/hif18031.pdf).
