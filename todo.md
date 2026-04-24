# TODO - Motore first-principles per allineamenti murari con aperture

## Intento

Questo documento non descrive il porting letterale della vecchia app MATLAB.

La MATLAB app serve solo come riferimento per:

- vedere un'applicazione che funziona;
- capire come venivano forniti gli input;
- capire quali output ingegneristici vogliamo ottenere;
- avere un benchmark minimo di comportamento.

Il nuovo motore di calcolo va invece ripensato da zero, secondo `first principles`, dentro l'architettura del progetto JavaScript attuale.

Obiettivo:

- costruire un core engine modulare per allineamenti murari con aperture;
- riusare i moduli gia maturi del progetto;
- mantenere il focus su input, modelli meccanici, analisi e output;
- non spostare nel codice responsabilita che restano del progettista.

Fuori perimetro:

- UI o frontend;
- plotting o reporting MATLAB;
- replica uno-a-uno della struttura applicativa MATLAB.

## Principi guida

- La MATLAB app e un benchmark, non un vincolo architetturale.
- L'input del motore e il solo allineamento.
- I materiali devono essere quelli gia definiti nel progetto.
- I carichi verticali devono seguire il sistema gia presente nel progetto (`G1`, `G2`, `Qk`, combinazioni, ecc.).
- Gli orientamenti interpretativi servono come preset di default e come warning mirati, non come screening normativo totale.
- Il metodo sismico minimo ufficiale e la somma dei contributi dei singoli maschi e delle singole cerchiature.
- Un modello FEM non lineare globale dell'allineamento e un obiettivo successivo e opzionale: se non produce risultati puliti e convergenti, si torna al metodo aggregato.

## Riferimenti

- Legacy MATLAB:
  - `build.m`
  - `analizzaAllineamento.m`
  - `solve.m`
- Riferimento normativo / interpretativo:
  - `C:/Users/pagan/Desktop/orientamenti_interpretativi.pdf`
- Moduli JS da riusare:
  - materiali muratura NTC / custom
  - modulo `masonry-piers`
  - modulo `steel-frames`
  - core FEM 2D
  - solver pushover in controllo indiretto di spostamento
  - sistema carichi e combinazioni gia presente

## Preset normativo di default

Il workflow per nuove aperture deve avere opzioni globali dedicate.

Preset iniziale:

- `normativePreset = "tuscany-openings-2022"`
- `stiffnessSelection = "mean"`
- `strengthSelection = "mean"`
- `stiffnessState = "cracked"`
- `useCorrectiveModifiers = true`
- `divideByConfidenceFactor = false` per il confronto murario ante/post

Tutti questi valori devono essere modificabili dall'utente.

Il motore deve sempre tracciare nei metadata:

- valori base;
- modificatori applicati;
- valori adottati nello stato di fatto;
- valori adottati nello stato di progetto;
- override espliciti dell'utente.

## Quadro teorico generale

Questa sezione fissa il quadro concettuale del motore, indipendentemente dai dettagli implementativi.

L'idea di fondo e distinguere con chiarezza:

- oggetto fisico reale;
- astrazione geometrica;
- macroelementi meccanici;
- modelli numerici usati nelle analisi.

### 1. Oggetto fisico e astrazione di calcolo

L'oggetto fisico reale e un allineamento murario con:

- uno o piu muri;
- aperture;
- eventuali architravi;
- eventuali cerchiature in acciaio;
- carichi verticali distribuiti in sommita.

Il motore non modella il pannello murario come continuo 2D diffuso mattone-malta.

L'astrazione scelta e invece a macroelementi:

- si parte dalla geometria dell'allineamento;
- si sanitizzano le aperture;
- si ricava la topologia muraria residua;
- si identificano maschi e fasce;
- si costruisce, quando serve, un telaio equivalente.

Questo approccio e coerente con:

- il livello di input effettivamente disponibile;
- le formulazioni normative per i macroelementi murari;
- l'obiettivo pratico del software, che e fare calcoli robusti e leggibili, non una micro-modellazione della muratura.

Nel caso di allineamenti composti da piu muri:

- i muri si concatenano in una unica ascissa globale dell'allineamento;
- ogni muro conserva pero il proprio materiale, spessore e carico verticale;
- la presenza o meno di una apertura a cavallo del giunto tra muri determina se il giunto generi due maschi distinti oppure no.

### 2. Materiali

#### Muratura come materiale equivalente del macroelemento

La muratura viene trattata come materiale equivalente omogeneizzato al livello del macroelemento.

Questo significa che:

- il motore non distingue esplicitamente tra blocchi, malta, tessitura e giunti in un modello locale;
- il comportamento nel piano del maschio o della fascia viene descritto tramite proprieta equivalenti gia consolidate nel dominio del progetto.

Le proprieta meccaniche di riferimento restano:

- `E`
- `G`
- `fm`
- `fv0`
- `tau0`
- `density`
- `mu`
- `phi`

La stessa muratura deve poter essere risolta in due stati:

- stato di fatto;
- stato di progetto.

Il resolver materiali deve quindi essere pensato come un passaggio teorico essenziale, non come semplice lettura di campi:

- parte da un materiale base;
- applica preset normativi o input manuale;
- applica modificatori;
- restituisce le proprieta effettivamente usate dal calcolo.

#### Acciaio come sottosistema gia risolto

L'acciaio di cerchiature e architravi non va rimodellato nel dominio muratura.

Teoricamente:

- la cerchiatura e un sottosistema strutturale locale in acciaio;
- l'architrave e un elemento trave opzionale;
- entrambi usano il dominio acciaio gia presente nel progetto.

Conseguenza architetturale:

- il motore murario non deve duplicare leggi costitutive, classificazioni o verifiche dell'acciaio;
- deve solo chiedere al sottosistema acciaio le grandezze che servono per il problema dell'allineamento.

### 3. Aperture come oggetti topologici

Le aperture non sono solo vuoti geometrici da sottrarre all'area della parete.

Nel motore esse sono gli oggetti che governano la topologia resistente dell'allineamento, perche:

- definiscono la nascita dei maschi murari laterali;
- definiscono la nascita delle fasce sovrastanti;
- determinano dove possono comparire cerchiature e architravi;
- modificano la ripartizione dei carichi verticali;
- controllano la forma del telaio equivalente.

Per questo motivo, la sanitizzazione delle aperture e un passaggio teoricamente centrale:

- aperture esterne vengono scartate;
- aperture al bordo vengono tagliate;
- aperture intersecate vengono fuse;
- aperture sovrapposte in verticale vengono trattate come unica apertura equivalente.

Quest'ultima scelta e coerente con l'idea che, quando due aperture si impilano, il residuo intermedio non vada trattato automaticamente come una fascia significativa del telaio equivalente.

Nel caso di apertura che attraversa il confine tra due muri concatenati:

- il giunto tra muri non genera automaticamente un maschio intermedio;
- i due maschi laterali all'apertura sono definiti rispetto al vuoto complessivo risultante;
- i carichi verticali tributari di quei maschi vanno poi ricostruiti sommando le porzioni di influenza provenienti da ciascun muro interessato.

Le aperture possono avere associati:

- una cerchiatura;
- una architrave opzionale.

### 4. Telaio equivalente come livello intermedio di modellazione

Il telaio equivalente e la traduzione meccanica della parete forata in un sistema di aste deformabili e tratti rigidi.

Non e l'unico modo in cui il motore produce risultati, ma e il livello geometrico-meccanico comune che mette in relazione:

- metodo aggregato a contributi sommati;
- analisi lineari del sistema;
- futura analisi pushover FEM dell'allineamento.

Il suo significato teorico e il seguente:

- i maschi rappresentano i pannelli verticali che resistono alle azioni nel piano;
- le fasce rappresentano i collegamenti orizzontali sopra le aperture;
- i nodi del telaio derivano dalle relazioni geometriche tra assi di maschi e fasce;
- i blocchi murari residui non deformabili vengono trattati come tratti rigidi o offset.

Il telaio equivalente quindi non nasce da una discretizzazione numerica arbitraria, ma da regole geometriche determinate dalla disposizione delle aperture.

### 5. Maschi murari

Il maschio e il macroelemento principale della risposta nel piano.

Dal punto di vista teorico, il maschio concentra tre funzioni:

- porta il carico verticale derivante dalla sua area di influenza;
- contribuisce alla rigidezza laterale dell'allineamento;
- sviluppa la resistenza laterale attraverso meccanismi flessionali e a taglio.

Nel modello:

- il maschio e una trave di Timoshenko;
- puo avere tratti rigidi terminali;
- ha base incastrata;
- in sommita puo essere libero di ruotare, vincolato, oppure collegato a una fascia esplicita.

La parte deformabile del maschio non coincide automaticamente con tutta la sua altezza geometrica:

- va definita con il metodo Dolce;
- il resto viene trattato come tratto rigido terminale.

Dal punto di vista non lineare:

- il ramo flessionale e associato al raggiungimento del momento resistente e alla formazione di cerniere plastiche;
- il ramo a taglio e associato al raggiungimento della resistenza a taglio governante, seguito da scorrimento plastico con resistenza circa costante fino a `du`;
- il collasso e legato al raggiungimento della capacita ultima di spostamento coerente con il meccanismo governante.

Nel metodo aggregato ogni maschio produce un proprio contributo forza-spostamento.

Nel FEM, invece, i maschi interagiscono tramite nodi, fasce e cerchiature.

### 6. Fasce di piano

La fascia e il macroelemento orizzontale che si sviluppa sopra l'apertura.

Il suo significato teorico principale non e solo resistente, ma anche cinematico:

- collega i maschi laterali;
- condiziona la rotazione delle loro estremita superiori;
- modifica rigidezza, distribuzione degli sforzi e meccanismo globale dell'allineamento.

Per il primo rilascio del motore:

- la fascia viene introdotta come elemento elastico lineare di Timoshenko muraria pura;
- la parte deformabile coincide con la larghezza dell'apertura sottostante;
- il resto della lunghezza e trattato come tratto rigido.

Questa scelta e teoricamente coerente con l'obiettivo iniziale:

- cogliere l'effetto di accoppiamento tra maschi;
- evitare di introdurre troppo presto una non linearita delle fasce ancora non ben controllata;
- mantenere il metodo aggregato come riferimento minimo di robustezza.

### 7. Cerchiature

La cerchiatura e un presidio strutturale locale in acciaio associato a una apertura.

Dal punto di vista teorico non va confusa con:

- una proprieta della muratura;
- una semplice correzione empirica della resistenza del pannello.

La cerchiatura e invece un sottosistema resistente autonomo che:

- intercetta una parte dei carichi verticali;
- li scarica ai piedritti;
- contribuisce alla risposta laterale dell'allineamento;
- modifica localmente il percorso delle forze attorno all'apertura.

Nel software questo implica che:

- la cerchiatura va trattata come componente accoppiata al dominio murario;
- la sua risposta deve essere ottenuta dal modulo `steel-frames`;
- il motore dell'allineamento deve evitare doppi conteggi tra contributo del maschio residuo e contributo del telaio in acciaio.

Regole teoriche specifiche:

- in presenza di cerchiatura, il maschio laterale residuo va considerato con larghezza ridotta di una quota pari alla larghezza del profilo nel piano del telaio, sul lato interessato;
- se nello spessore murario sono presenti piu telai identici in parallelo, il modello dell'allineamento non deve generare `n` telai FEM distinti, ma un unico telaio equivalente;
- nel telaio equivalente della cerchiatura, le proprieta geometriche e meccaniche devono essere assunte pari a `n` volte quelle del telaio semplice, per quanto compatibile con il modello acciaio gia adottato;
- deve essere esplicitata anche l'orientazione del profilo rispetto al piano del telaio, in modo da distinguere i casi con asse forte o asse debole nel piano resistente.

### 8. Gerarchia dei modelli numerici

Per evitare ambiguita, il motore deve avere una gerarchia chiara dei livelli di modellazione:

1. Livello geometrico:
   - input dell'allineamento e sanitizzazione aperture.
2. Livello macroelemento:
   - estrazione di maschi, fasce, architravi e cerchiature.
3. Livello analitico minimo:
   - analisi statica verticale;
   - analisi sismica aggregata a contributi sommati.
4. Livello avanzato:
   - costruzione del telaio equivalente esplicito;
   - analisi lineari;
   - pushover FEM opzionale.

Questa gerarchia e importante per una ragione architetturale precisa:

- il modello avanzato non deve sostituire quello minimo finche non dimostra di essere altrettanto robusto, leggibile e coerente.

Nel livello avanzato, la pushover dell'allineamento deve inoltre appoggiarsi a un vincolo cinematico globale di diaframma di piano sui nodi sommitali significativi:

- sommita dei maschi;
- nodi sommitali delle fasce;
- nodi sommitali delle cerchiature.

Questo consente di trascinare un unico punto di controllo e costruire una curva di capacita globale dell'allineamento coerente con il cinematismo imposto.

## Dominio ingegneristico

### 1. Materiali

#### Muratura

La muratura deve essere definibile in due modi:

- manualmente;
- a partire dai parametri da Circolare / NTC gia presenti nel progetto.

La muratura deve supportare due stati distinti:

- stato di fatto;
- stato di progetto.

Entrambi devono poter usare:

- coefficienti modificatori dello stato di fatto;
- coefficienti modificatori dello stato di progetto;
- opzioni globali di scelta dei moduli e delle resistenze.

Proprieta meccaniche da risolvere:

- `E`
- `G`
- `fm`
- `fv0`
- `tau0`
- `density`
- `mu`
- `phi`

Il motore non deve introdurre un nuovo sistema materiali:

- deve riusare le classi/materiali gia presenti;
- deve aggiungere solo resolver e adapter specifici per il dominio degli allineamenti murari.

#### Acciaio

Per telai di cerchiatura e architravi:

- usare l'acciaio gia definito nel progetto;
- riusare i moduli e le verifiche acciaio gia esistenti.

### 2. Carichi verticali

I carichi verticali devono essere definiti come carichi distribuiti per unita di linea.

Devono seguire il sistema gia costruito nel progetto:

- `G1`
- `G2`
- `Qk`
- coefficienti combinativi
- combinazioni statiche e sismiche coerenti col resto della codebase

Il motore degli allineamenti non deve inventare un secondo sistema di carico:

- deve appoggiarsi alle astrazioni e alle combinazioni gia presenti;
- deve solo tradurre i carichi lineari dell'allineamento nei carichi applicati ai singoli elementi derivati.

## Modelli dati di input

### 1. Allineamento

Un allineamento e costituito da un insieme ordinato di muri.

Ogni muro ha almeno:

- `id`
- `length`
- `height`
- `thickness`
- `material`
- `verticalLineLoad`

I muri sono concatenati in sequenza lungo l'asse `x` globale dell'allineamento.

Regola geometrica fondamentale:

- se una apertura non attraversa il giunto tra due muri, il giunto genera due maschi separati, anche se geometricamente adiacenti;
- se una apertura attraversa il giunto tra due muri, il giunto non genera un maschio autonomo nel varco dell'apertura.

L'allineamento ha almeno:

- `id`
- `label`
- `units`
- `walls`
- `openings`
- `settings`

L'allineamento e dato dal progettista come input.

Il codice:

- non ricostruisce automaticamente il contesto globale dell'edificio;
- non decide quale porzione di edificio debba essere analizzata;
- lavora sul solo allineamento ricevuto in input.

### 2. Aperture

Le aperture sono definite tramite:

- `id`
- `x`
- `y`
- `width`
- `height`
- `ringFrame`
- `lintel` opzionale

Le aperture sono posizionate nel sistema di riferimento dell'allineamento.

#### Regole geometriche sulle aperture

Regole da implementare:

1. Aperture completamente fuori dall'allineamento:
   - vengono scartate.
2. Aperture a cavallo del bordo dell'allineamento:
   - vengono tagliate ai bordi dell'allineamento, su tutti e quattro i lati.
3. Aperture intersecate tra loro:
   - vengono fuse in una sola apertura equivalente.
4. Aperture una sopra l'altra:
   - vengono fuse in una sola apertura equivalente;
   - il preprocessore deve emettere un warning esplicito all'utente.

Warning geometrico minimo da implementare:

- segnalare aperture che lasciano mazzette residue laterali inferiori a `50 cm`.

Questo warning deve essere:

- informativo;
- non bloccante.

### 3. Cerchiature

Ogni apertura puo avere associata una cerchiatura.

Il modello teorico e il calcolo della cerchiatura non vanno reinventati qui:

- vedere modulo gia sviluppato `steel-frames`.

Il nuovo motore murario deve:

- poter referenziare una cerchiatura come componente dell'apertura;
- ottenere dal modulo `steel-frames` le grandezze che servono alle analisi dell'allineamento;
- usare la cerchiatura come contributo locale nella risposta statica e sismica.

La definizione della cerchiatura deve inoltre contemplare almeno:

- numero di telai paralleli nello spessore murario;
- larghezza del profilo nel piano del telaio, da usare per la riduzione della larghezza netta del maschio adiacente;
- orientazione del profilo rispetto al piano del telaio, per distinguere i casi in asse forte o in asse debole nel piano resistente.

### 4. Architravi

Caso opzionale:

- a una apertura puo essere associata una architrave.

L'architrave:

- prende il carico dalla porzione di muratura di larghezza pari a quella dell'apertura e che arriva fino al soffitto;
- prende anche il carico distribuito sulla sommita dell'allineamento;
- viene verificata come trave in semplice appoggio;
- ha luce pari a:
  - larghezza apertura
  - piu due appoggi laterali

Valore di default degli appoggi:

- `0.30 m` per lato

Tale valore deve essere:

- opzionale;
- modificabile dall'utente.

Per l'acciaio dell'architrave si riusano:

- classe della sezione;
- verifiche acciaio;
- eventuale infrastruttura trave gia presente nel progetto.

## Modelli dati derivati

### 1. Pier

Il `Pier` e il macroelemento murario verticale residuo ai lati delle aperture.

In presenza di cerchiatura:

- la larghezza resistente del maschio va ridotta di una quota pari alla larghezza del profilo della cerchiatura misurata nel piano del telaio, sul lato interessato;
- questa riduzione serve a evitare doppi conteggi tra il pannello murario residuo e il sottosistema in acciaio.

Campi minimi:

- `id`
- `wallId`
- `sourceWallIds`
- `alignmentId`
- `x`
- `length`
- `effectiveLength`
- `height`
- `thickness`
- `material`
- `tributaryVerticalLoad`
- `tributaryLoadByWall`
- `deformableHeight`
- `rigidBottomLength`
- `rigidTopLength`
- `topBoundaryMode`
- `mechanics`
- `capacity`

### 2. Spandrel

La `Spandrel` e il macroelemento orizzontale sopra le aperture.

Campi minimi:

- `id`
- `alignmentId`
- `xStart`
- `xEnd`
- `height`
- `thickness`
- `material`
- `deformableLength`
- `rigidLeftLength`
- `rigidRightLength`
- `mechanics`

### 3. Apertura sanitizzata

Dopo clipping/merge, ogni apertura deve diventare una apertura sanitizzata pronta per:

- estrazione geometrica del telaio equivalente;
- calcolo di maschi e fasce;
- associazione di architravi e cerchiature.

## Telaio equivalente

### Concetto

La parete muraria viene definita in funzione della presenza delle aperture.

Regola base:

- ai lati delle aperture ci sono i maschi murari;
- sopra le aperture ci sono le fasce di piano.

### Estrazione geometrica

Il preprocessore deve:

- partire dall'allineamento e dalle aperture sanitizzate;
- ricavare i vuoti;
- ricavare i pannelli murari residui;
- classificare i pannelli residui come:
  - `pier`
  - `spandrel`
  - eventuale residuo non modellato

Caso delicato:

- apertura sopra apertura;
- in questo caso si crea una apertura unica equivalente;
- il preprocessore deve emettere un warning;
- il residuo murario eventualmente non significativo non deve generare macroelementi spurii.

Regole aggiuntive per allineamenti multi-muro:

- il giunto tra muri concatenati e una discontinuita topologica rilevante solo se non e attraversato da una apertura;
- in assenza di apertura a cavallo del giunto, il preprocessore deve generare due maschi distinti, uno per ciascun muro;
- in presenza di apertura a cavallo del giunto, il preprocessore non deve generare un maschio intermedio sul confine;
- i maschi laterali risultanti possono ricevere contributi di carico tributario da piu muri.

### Parte deformabile dei maschi - metodo Dolce

Per i maschi va usato il metodo Dolce.

Definizione:

- la parte deformabile e la porzione dell'asse del maschio ottenibile dall'intersezione dell'asse del maschio con una linea che parte con inclinazione di `30 deg` dal vertice dell'apertura adiacente.

Conseguenze:

- se l'apertura e sufficientemente distante dall'asse del maschio, la parte deformabile coincide con l'altezza interpiano;
- il resto del maschio e trattato come tratto rigido terminale.

### Parte deformabile delle fasce

Per le fasce:

- la parte deformabile e la larghezza dell'apertura sottostante;
- il resto e composto da tratti rigidi.
- i nodi estremi della fascia nel telaio equivalente devono coincidere con le teste dei maschi adiacenti;
- l'asse della parte deformabile della fascia deve essere collocato nel baricentro della fascia muraria sopra l'apertura;
- i tratti rigidi tra teste dei maschi e parte deformabile baricentrica devono essere modellati tramite condensazione statica / offset rigidi 2D, non come elementi deformabili aggiuntivi.

Dal punto di vista FEM:

- i tratti rigidi vanno trattati con condensazioni statiche / rigid offsets;
- la logica deve essere coerente con quanto gia fatto nel modulo travi.

## Modello meccanico dei maschi

### Modello FEM

Il maschio e modellato come:

- trave di Timoshenko;
- con eventuali tratti rigidi terminali.

Vincoli:

- base sempre incastrata.

In sommita ci sono tre scenari:

1. Modellazione esplicita delle fasce:
   - i maschi sono collegati alle fasce.
2. Nessuna fascia, caso limite superiore/libero:
   - estremita superiore libera di ruotare.
3. Nessuna fascia, caso limite superiore vincolato:
   - estremita superiore vincolata a non ruotare.

Interpretazione:

- caso 2 corrisponde all'assenza di fasce;
- caso 3 corrisponde a fasce infinitamente rigide.

Test richiesto:

- la rigidezza e la resistenza laterale di un allineamento con fasce esplicite devono collocarsi tra i due casi limite.

### Legge costitutiva laterale

I maschi hanno comportamento:

- elastico-perfettamente plastico.

La resistenza laterale e il minimo tra:

- meccanismo di rocking / toe crushing;
- meccanismo di taglio per scorrimento sui letti di malta;
- meccanismo di fessurazione diagonale.

Impostazione teorica iniziale:

- il valore di resistenza laterale del maschio e il minimo tra i meccanismi considerati;
- l'impostazione deve restare coerente con il programma MATLAB legacy;
- le formulazioni operative di partenza sono quelle coerenti con le NTC / Circolare e richiamate anche nella tesi.

#### Meccanismo di rocking - toe crushing

Formulazione operativa iniziale:

```text
V_r-tc = (P / 2) * (L / H0) * (1 - kappa * P / (f_c * t * L))
kappa = 1 / 0.85
```

Dove:

- `P` e lo sforzo normale di compressione adottato per il meccanismo;
- `L` e la lunghezza del maschio;
- `H0` e l'altezza di riferimento del meccanismo;
- `f_c` e la resistenza a compressione adottata per la muratura;
- `t` e lo spessore del maschio.

Nel metodo aggregato semplificato:

- `H0 = H` se il maschio e libero di ruotare in sommita;
- `H0 = H / 2` se il maschio e vincolato alla rotazione in sommita.

#### Meccanismo di bed-joint sliding

Formulazione di riferimento:

```text
V_bjs = c * t * L' + 0.4 * P
```

Dove:

- `c` e la coesione;
- `t` e lo spessore del maschio;
- `L'` e la profondita della zona compressa;
- `P` e lo sforzo normale di compressione adottato per il meccanismo.

Nota di implementazione:

- nel dominio software la coesione `c` va mappata sulla proprieta muraria `fv0`, cioe la resistenza a taglio in assenza di sforzo normale;
- la profondita della zona compressa va assunta come `L' = L - 2e`, con `e = M / P`, dove `M` e il momento flettente nel piano del maschio nella sezione considerata;
- per robustezza numerica `L'` va limitata all'intervallo fisicamente ammissibile `0 <= L' <= L`;
- l'implementazione deve restare coerente con il legacy MATLAB, dove il meccanismo di scorrimento / fessurazione regolare e gia espresso attraverso i parametri equivalenti del materiale.

#### Meccanismo di diagonal cracking

Formulazione operativa iniziale:

```text
V_dc = (f_t * t * L / b) * sqrt(1 + P / (f_t * t * L))
b = min(max(H / L, 1.0), 1.5)
```

Dove:

- `f_t` e la resistenza a trazione / taglio adottata per il meccanismo;
- `t` e lo spessore del maschio;
- `L` e la lunghezza del maschio;
- `H` e l'altezza del maschio;
- `P` e lo sforzo normale di compressione adottato per il meccanismo.

Nota di implementazione:

- nel dominio software si assume inizialmente `f_t = 1.5 * tau0`;
- anche qui l'implementazione iniziale deve restare coerente con il programma MATLAB, che usa una formulazione equivalente basata sui parametri di resistenza gia presenti nel dominio muratura del progetto.

#### Meccanismo flessionale: nota teorica per il modello FEM

La formulazione `V_r-tc` puo essere interpretata come trasformazione della capacita flettente in una forza laterale resistente quando lo schema statico e noto.

Tuttavia, nel caso di presenza di fasce o di schema resistente non immediatamente riducibile a un singolo caso elementare, e preferibile trattare il meccanismo flessionale in questo modo:

- si calcola il momento flettente resistente del maschio in funzione dello sforzo normale, coerentemente con la formula di pressoflessione in piano delle NTC 2018;
- si confronta il momento flettente agente nelle sezioni critiche del maschio con il momento resistente;
- la capacita laterale del maschio e la forza orizzontale corrispondente al raggiungimento di tale momento resistente.

Formula operativa iniziale per il momento resistente:

```text
MRd = (L^2 * t * sigma_0 / 2) * (1 - sigma_0 / (0.85 * f_c))
```

Dove:

- `L` e la lunghezza del maschio;
- `t` e lo spessore del maschio;
- `sigma_0` e la tensione normale di compressione adottata per il meccanismo flessionale;
- `f_c` e la resistenza a compressione adottata per la muratura.

Nota utile:

- in prima istanza si puo assumere `sigma_0 = P / (t * L)`, con `P` valutato secondo la combinazione sismica adottata per il meccanismo flessionale.

Implicazione architetturale:

- nel metodo aggregato minimo si puo ancora usare una trasformazione diretta in `V_r-tc` quando lo schema statico e chiaramente definito;
- nel modello FEM esplicito dell'allineamento il meccanismo flessionale deve essere preferibilmente implementato come criterio a momento resistente, non solo come formula chiusa su `V`.

Decisione di riferimento per l'implementazione FEM del maschio:

- cerniere perfettamente plastiche flessionali alle estremita del maschio, sul modello gia usato nel telaio in acciaio;
- rappresentazione esplicita della crisi a taglio come meccanismo perfettamente plastico a taglio;
- una volta raggiunta la resistenza del meccanismo di taglio governante, il maschio continua a scorrere lateralmente con resistenza circa costante;
- il maschio perde poi la resistenza a taglio e viene considerato rotto quando lo spostamento laterale raggiunge il limite ultimo `du` coerente con il meccanismo governante;
- la risposta laterale del maschio e quindi definita dal minimo tra ramo flessionale e ramo a taglio, con evoluzione post-elastica coerente con il meccanismo che governa.

Decisione numerica per il solver:

- a livello di output ingegneristico e di lettura risultati, dopo `du` la resistenza del meccanismo va considerata nulla;
- a livello interno di solver, e ammesso mantenere una rigidezza / resistenza residua puramente numerica molto piccola, solo quanto basta a evitare instabilita spurie e problemi di convergenza;
- tale residuo numerico non deve essere interpretato come resistenza strutturale reale e non deve alterare in modo apprezzabile curva di capacita, bilinearizzazione e individuazione del collasso.

#### Sforzo normale da usare nei meccanismi laterali

Il carico assiale da usare non deve essere in combinazione SLU.

Va usata la combinazione sismica, con:

- coefficienti quasi tutti unitari;
- carico variabile moltiplicato per `psi2`.

Regole operative:

- flessione / rocking-toe crushing:
  - usare lo sforzo normale alla base del maschio, con tutto il peso proprio del maschio;
- taglio:
  - usare lo sforzo normale a meta maschio, con meta peso proprio del maschio;
- drift capacity:
  - usare lo stesso sforzo normale del caso flessionale.

La capacita di spostamento:

- dipende dal carico verticale applicato;
- dipende dalla tipologia di rottura governante;
- va ricavata secondo NTC e Circolare.

Formulazione operativa iniziale per la drift capacity:

```text
theta_u_NTC18 =
  min(0.0125 * (1 - P / (fc * t * L)), 0.010)   for flexural failure
  0.005                                         for shear failure
```

Dove:

- `P` e il carico assiale di compressione applicato;
- `fc` e la resistenza a compressione adottata per la muratura;
- `t` e lo spessore del maschio;
- `L` e la lunghezza del maschio.

Il motore deve poi ricavare `du` dalla drift capacity adottata usando l'altezza totale del maschio, non l'altezza deformabile.

### Verifiche verticali

Per i carichi verticali:

- riusare le verifiche dei maschi gia sviluppate nel progetto;
- il nuovo motore deve fare da orchestratore e adapter, non duplicare la logica gia valida.

## Modello meccanico delle fasce

Primo step:

- modello elastico lineare di Timoshenko muraria pura.

Step successivo:

- introdurre la non linearita anche sulle fasce.

Per ora la fascia serve soprattutto a:

- trasferire rigidezza orizzontale;
- influenzare il vincolo di rotazione dei maschi;
- consentire la costruzione di un telaio equivalente piu realistico del semplice modello a contributi sommati.

## Modello di architrave

L'architrave e un componente opzionale distinto dalla cerchiatura.

Modello iniziale:

- trave in semplice appoggio;
- luce = larghezza apertura + 2 * appoggio laterale;
- carico da porzione di muratura di larghezza pari all'apertura e altezza fino al soffitto;
- carico distribuito in sommita dall'allineamento.

Le sue verifiche devono riusare il piu possibile il sistema acciaio gia presente.

## Analisi statica

### Obiettivo

Condurre una analisi statica verticale dell'allineamento.

### Carichi applicati ai maschi

I carichi derivanti dai carichi distribuiti ricadono sui maschi in base alla loro area di influenza.

Regola di influenza:

- larghezza del maschio
- piu meta larghezza delle aperture adiacenti

Questa regola resta valida:

- anche in presenza di architravi.

Eccezione:

- nel caso delle cerchiature, l'area di influenza e modificata perche il telaio prende il carico e lo scarica a terra con i piedritti.

Per allineamenti composti da piu muri:

- la larghezza di influenza di ciascun maschio va ricostruita per tratti, rispettando i confini dei muri reali;
- se il maschio e laterale a una apertura che attraversa piu muri, il suo carico tributario e la somma delle porzioni di influenza che ricadono sui singoli muri interessati;
- il risultato finale va espresso sia come carico totale sul maschio sia, internamente, come decomposizione per muro sorgente.

### Elementi considerati

Per l'analisi statica verticale:

- considerare i maschi;
- considerare i piedritti delle cerchiature per il carico che intercettano;
- considerare le architravi se presenti;
- trascurare le fasce.

### Verifiche richieste

- verifiche a carichi verticali dei maschi;
- verifiche degli architravi;
- controllo di equilibrio globale delle reazioni.

Test richiesto:

- la somma delle reazioni verticali dei maschi e dei piedritti delle cerchiature deve essere circa uguale ai carichi applicati piu i pesi propri degli elementi modellati.

## Analisi sismica

### Obiettivo

Calcolare la curva di capacita alle azioni orizzontali dell'allineamento.

Componenti da considerare:

- maschi murari;
- eventuali cerchiature;
- opzionalmente fasce di piano.

### Metodo minimo obbligatorio

Il programma MATLAB sommava tra loro i contributi singoli di ciascun maschio e di ciascuna cerchiatura.

Questo rappresenta:

- l'obiettivo minimo da cui partire;
- il fallback affidabile a cui tornare se il modello FEM non lineare globale non risulta pulito e convergente.

Questa modalita deve quindi essere implementata come metodo ufficiale, non come ripiego informale.

### Modellazione delle fasce nella risposta sismica

Deve essere opzionale considerare le fasce.

In assenza di fasce:

- deve essere possibile scegliere il vincolo di rotazione in sommita dei maschi.

Opzioni richieste:

- `topRotation = free`
- `topRotation = fixed`

Con fasce esplicite:

- il vincolo emerge dal modello del telaio equivalente.

Nel modello FEM esplicito dell'allineamento:

- tutti i nodi sommitali dei maschi;
- tutti i nodi sommitali delle fasce;
- tutti i nodi sommitali delle cerchiature

devono essere collegati da un vincolo cinematico di diaframma di piano, cosi che l'analisi pushover possa essere pilotata tramite un unico punto di controllo globale che trascina l'insieme dei nodi sommitali.

### Estensione futura: modello FEM non lineare dell'allineamento

Obiettivo avanzato:

- modello FEM non lineare globale;
- analisi statica non lineare in controllo indiretto di spostamento.

Condizione di accettazione:

- risultati puliti;
- risultati convergenti;
- risultati ingegneristicamente coerenti col metodo minimo.

Se questo non accade:

- si mantiene come motore principale il metodo aggregato a contributi sommati.

### Criterio di prosecuzione della curva

La curva di capacita dovrebbe avanzare preferibilmente:

- fino al collasso di tutti i maschi;
- oppure almeno finche si raggiunge un calo di resistenza dell'ordine del `30-40%`.

### Bilinearizzazione

Sulla curva di capacita va applicata una bilinearizzazione equivalente.

Regole richieste:

- tratto elastico secante passante per il punto al `70%` della resistenza massima;
- tratto post-elastico perfettamente plastico;
- spostamento ultimo in corrispondenza del punto in cui si ha un calo del `20%` della resistenza;
- resistenza laterale equivalente ricavata per equivalenza energetica delle aree sottese.

La bilineare equivalente deve definire:

- `ks`
- `Vy`
- `du`

Queste grandezze sono gli output sintetici per le verifiche strutturali.

### Confronto ante/post

Il fine ultimo del calcolo sismico e verificare che, dopo l'intervento:

- la rigidezza non peggiori in modo non accettabile;
- la resistenza non peggiori;
- la deformabilita non peggiori.

Riferimento iniziale da recepire come default:

- variazione di rigidezza non significativa, indicativamente entro `+/- 15%`.

## Integrazione con i moduli gia esistenti

### Materiali murari

Da riusare:

- materiali custom;
- materiali muratura da NTC / Circolare;
- modificatori stato di fatto / progetto gia presenti nel progetto.

### Carichi e combinazioni

Da riusare:

- classi carico e combinazioni gia presenti;
- convenzioni `G1`, `G2`, `Qk`, ecc.

### Maschi murari

Da riusare dove possibile:

- verifiche verticali del modulo `masonry-piers`.

### Cerchiature

Da riusare:

- modulo `steel-frames`.

### FEM e pushover

Da riusare:

- core FEM 2D;
- Timoshenko beam;
- rigid offsets / condensazioni statiche;
- solver pushover in controllo indiretto.

## Moduli e interfacce da creare

### A. Input model dell'allineamento

#### `MasonryWallOpeningsModel`

Responsabilita:

- normalizzare input;
- contenere muri, aperture, architravi, cerchiature, opzioni globali;
- costruire la coordinata globale `x` dell'allineamento concatenando i muri in sequenza;
- serializzare l'input applicativo.

### B. Sanitizzazione geometrica delle aperture

#### `sanitizeAlignmentOpenings({ alignment }) -> SanitizedOpeningSet`

Responsabilita:

- scartare aperture fuori allineamento;
- tagliare aperture ai bordi;
- fondere aperture intersecate;
- fondere in una unica apertura equivalente anche il caso di aperture sovrapposte/impilate verticalmente;
- restituire aperture pulite e warning geometrici.

### C. Estrazione dei macroelementi

#### `extractEquivalentFrameMembers({ alignment, sanitizedOpenings }) -> { piers, spandrels }`

Responsabilita:

- ricavare maschi e fasce dalla geometria residua;
- calcolare parti deformabili e tratti rigidi;
- rispettare i giunti tra muri solo quando non sono attraversati da aperture;
- ridurre la larghezza netta dei maschi in presenza di cerchiature, in funzione della larghezza del profilo nel piano;
- gestire casi geometrici degeneri in modo robusto.

### D. Resolver materiali e proprieta meccaniche

#### `resolveAlignmentMechanicalState({ alignment, stage, options }) -> ResolvedAlignmentState`

Dove:

- `stage = state-of-fact | design`

Responsabilita:

- risolvere materiali murari;
- applicare modificatori;
- produrre proprieta meccaniche adottate nello scenario.

### E. Analisi statica verticale

#### `analyzeAlignmentStatic({ alignment, stage, options }) -> AlignmentStaticResult`

Responsabilita:

- tradurre carichi distribuiti in carichi sui maschi;
- includere contributi delle cerchiature sui carichi verticali;
- analizzare architravi;
- eseguire verifiche verticali dei maschi;
- produrre reazioni e controlli di equilibrio.

### F. Analisi sismica minima aggregata

#### `analyzeAlignmentSeismicAggregated({ alignment, stage, options }) -> AlignmentCapacityResult`

Responsabilita:

- calcolare il contributo di ogni maschio;
- calcolare il contributo di ogni cerchiatura;
- includere opzionalmente le fasce;
- sommare i contributi in una curva globale;
- bilinearizzare la curva.

### G. Builder del telaio equivalente

#### `buildEquivalentFrame({ alignment, stage, options }) -> MasonryEquivalentFrame`

Responsabilita:

- costruire il modello esplicito del telaio equivalente;
- supportare maschi, fasce e contributi equivalenti delle cerchiature;
- condensare eventuali telai multipli paralleli nello spessore in un unico telaio equivalente;
- applicare il vincolo di diaframma di piano ai nodi sommitali significativi;
- preparare input coerente per analisi lineari e non lineari.

### H. Analisi pushover FEM opzionale

#### `runEquivalentFramePushover({ frame, options }) -> AlignmentCapacityResult`

Responsabilita:

- eseguire pushover sull'allineamento;
- pilotare la risposta globale tramite un unico punto di controllo coerente col vincolo di diaframma di piano;
- restituire curva, stati e meccanismi;
- confrontare i risultati con il metodo aggregato.

### I. Bilinearizzazione

#### `bilinearizeCapacityCurve({ curve, options }) -> EquivalentBilinearCurve`

Responsabilita:

- applicare la procedura richiesta;
- restituire `ks`, `Vy`, `du`;
- mantenere tracciabilita dei punti usati.

### J. Applicazione orchestratrice

#### `MasonryWallOpeningsApplication.run(input) -> CalculationResult`

Modalita iniziali:

- `sanitize-only`
- `static-state-of-fact`
- `static-design`
- `seismic-aggregated-state-of-fact`
- `seismic-aggregated-design`
- `equivalent-frame-linear`
- `equivalent-frame-pushover`
- `compare-state-of-fact-vs-design`

## Struttura file proposta

- `src/applications/masonry-wall-openings/models/`
  - `MasonryWallOpeningsModel.js`
  - `MasonryWallAlignmentModel.js`
  - `MasonryWallPierModel.js`
  - `MasonryWallSpandrelModel.js`
  - `MasonryOpeningModel.js`
  - `MasonryLintelModel.js`
- `src/applications/masonry-wall-openings/geometry/`
  - `sanitizeAlignmentOpenings.js`
  - `OpeningMergeResolver.js`
  - `PierAndSpandrelExtractor.js`
  - `DolceDeformableZoneResolver.js`
- `src/applications/masonry-wall-openings/materials/`
  - `resolveAlignmentMechanicalState.js`
  - `resolveMasonryStageMaterial.js`
- `src/applications/masonry-wall-openings/analysis/`
  - `AlignmentStaticAnalysis.js`
  - `AlignmentSeismicAggregatedAnalysis.js`
  - `AlignmentCapacityBilinearization.js`
  - `MasonryEquivalentFrameBuilder.js`
  - `MasonryEquivalentFramePushoverAnalysis.js`
- `src/applications/masonry-wall-openings/adapters/`
  - `MasonryPierVerificationAdapter.js`
  - `SteelRingFrameAdapter.js`
  - `SteelLintelVerificationAdapter.js`
- `src/applications/masonry-wall-openings/`
  - `MasonryWallOpeningsApplication.js`
  - `index.js`

## Test richiesti

### Geometria

- aperture completamente fuori allineamento: scartate;
- aperture a cavallo dei bordi: tagliate correttamente;
- aperture intersecate: fuse correttamente;
- aperture una sopra l'altra: fuse in una apertura unica con warning;
- warning su mazzette residue inferiori a `50 cm`;
- giunto tra muri senza apertura a cavallo: genera due maschi distinti;
- giunto tra muri con apertura a cavallo: non genera un maschio intermedio;
- casi geometrici anomali come aperture sovrapposte/impilate: gestione robusta e deterministica.

### Materiali

- muratura manuale;
- muratura da NTC / Circolare;
- modificatori stato di fatto;
- modificatori stato di progetto;
- override delle opzioni globali.

### Statica verticale

- corretta attribuzione delle larghezze di influenza ai maschi;
- corretta ripartizione dei carichi tributari dei maschi laterali quando l'apertura insiste su piu muri;
- corretta deviazione del carico alle cerchiature;
- verifica che la somma delle reazioni verticali sia circa uguale ai carichi applicati piu i pesi propri modellati;
- verifiche verticali dei maschi riusate correttamente;
- verifiche delle architravi.

### Sismica

- curva di capacita aggregata dei soli maschi;
- curva di capacita con cerchiature;
- casi senza fasce e top rotation `free`;
- casi senza fasce e top rotation `fixed`;
- caso con fasce esplicite: rigidezza e resistenza tra i due casi limite;
- il metodo sismico aggregato resta limitato ai maschi e alle cerchiature; le fasce non entrano nel metodo aggregato e sono considerate solo nel FEM esplicito;
- riduzione della larghezza del maschio in presenza di cerchiatura coerente con la larghezza del profilo nel piano;
- cerchiature multiple nello spessore: equivalenza con un unico telaio avente proprieta moltiplicate per il numero di telai;
- orientazione del profilo della cerchiatura nel piano resistente: caso asse forte e caso asse debole;
- vincolo di diaframma sui nodi sommitali dei maschi, delle fasce e delle cerchiature: curva di capacita ottenuta trascinando un unico punto di controllo globale;
- maschio governato da taglio: plateau di resistenza quasi costante fino a `du` e poi caduta a resistenza nulla;
- maschio governato da flessione: attivazione coerente delle cerniere di estremita e capacita ultima coerente con la `theta_u` flessionale;
- collasso post-`du`: eventuale residuo numerico interno consentito solo per stabilita del solver, ma output utente riportato come resistenza nulla;
- bilinearizzazione con passaggio al `70%`, equivalenza energetica e `du` al `20%` di calo.

### Regressione / robustezza

- confronto con casi MATLAB campione;
- confronto ante/post stato di fatto vs progetto;
- fallback ordinato al metodo aggregato se il modello FEM non lineare non e convergente.

## Roadmap di sviluppo

1. Rifinire i DTO di input dell'allineamento e le opzioni globali.
2. Implementare sanitizzazione e merge delle aperture.
3. Implementare estrazione geometrica di maschi e fasce.
4. Implementare resolver materiali per stato di fatto e progetto.
5. Implementare analisi statica verticale:
   - carichi sui maschi
   - architravi
   - equilibrio reazioni
6. Integrare le verifiche verticali dei maschi gia esistenti.
7. Implementare analisi sismica minima aggregata:
   - contributi dei maschi
   - contributi delle cerchiature
   - esclusione esplicita delle fasce dal metodo aggregato
8. Implementare bilinearizzazione della curva di capacita.
9. Implementare builder del telaio equivalente lineare.
10. Implementare modellazione esplicita delle fasce nel telaio equivalente:
   - nodi coincidenti con le teste dei maschi
   - asse deformabile baricentrico della fascia
   - tratti rigidi con condensazione statica / offset rigidi 2D
11. Implementare pushover FEM opzionale dell'allineamento.
12. Inserire le cerchiature nel telaio FEM esplicito e vincolare i loro nodi sommitali al diaframma di piano.
13. Validare il FEM non lineare contro il metodo aggregato minimo e contro casi input MATLAB forniti successivamente.

## Criteri di accettazione della pianificazione

Questo piano e accettabile se risultano condivisi i seguenti punti:

- il motore viene ripensato da zero e non portato pari pari dal MATLAB;
- la MATLAB app resta solo un riferimento di input/output e benchmark;
- i materiali sono quelli gia presenti nel progetto;
- i carichi verticali seguono il sistema carichi/combinazioni gia esistente;
- l'input del motore e il solo allineamento;
- il metodo sismico minimo ufficiale e la somma dei contributi dei singoli maschi e delle singole cerchiature;
- il modello FEM non lineare globale e opzionale e subordinato alla qualita dei risultati;
- le fasce sono escluse dal metodo sismico aggregato e sono opzionali solo nel FEM esplicito; inizialmente sono elastiche lineari di Timoshenko muraria pura;
- la statica verticale trascura le fasce e si concentra su maschi, architravi e cerchiature;
- la bilinearizzazione finale deve restituire `ks`, `Vy`, `du`;
- il warning sulle mazzette residue inferiori a `50 cm` resta non bloccante.

## Decisioni operative aggiornate

- Completato: metodo Dolce sui maschi, con calcolo della parte deformabile e dei tratti rigidi terminali verticali.
- Completato: fasce elastiche lineari nel telaio FEM esplicito, con nodi esterni coincidenti con le teste dei maschi adiacenti.
- Completato: parte deformabile delle fasce posta sulla quota baricentrica della fascia sopra l'apertura; tratti rigidi rappresentati tramite offset rigidi 2D / condensazione statica dell'elemento.
- Completato: cerchiature inserite nel FEM esplicito dell'allineamento tramite il modulo `steel-frames`.
- Completato: i nodi sommitali delle cerchiature vengono collegati al diaframma di piano insieme alle teste dei maschi.
- Completato: le cerchiature dichiarate come piu telai paralleli nello spessore vengono condensate in un unico telaio equivalente con rigidezze e momenti plastici scalati.
- Completato: nel pushover FEM globale le cerchiature esplicite contribuiscono tramite elementi acciaio a cerniere plastiche, evitando il doppio conteggio della curva aggregata dell'acciaio.
- Completato: orientazione forte/debole dei profili di cerchiatura, con default asse forte nel piano per piedritti e architrave e default UPN del traverso inferiore ruotato con lato senza labbri verso l'alto.
- Completato: override utente dell'orientazione per singolo membro della cerchiatura (`leftColumn`, `rightColumn`, `topBeam`, `bottomBeam`) tramite asse forte/debole o rotazione locale a 90 gradi.
- Il metodo sismico aggregato resta maschi piu eventuali cerchiature gia modellate come contributi indipendenti; le fasce non entrano nel metodo aggregato.
- Rimane da fare: validazione esterna contro l'applicazione MATLAB quando saranno disponibili i file di input campione.
- Rimane da fare dopo la validazione esterna: introdurre e calibrare la non linearita delle fasce.

## Decisione FEM non lineare dei maschi

Le scelte teoriche principali per il primo modello FEM del maschio sono ora fissate:

- `MRd` da formula di pressoflessione in piano;
- `L' = L - 2e` con `e = M / P`;
- `H0` nel metodo aggregato coerente con lo schema statico noto;
- ramo flessionale rappresentato con cerniere perfettamente plastiche alle estremita;
- ramo a taglio rappresentato come svincolo / meccanismo perfettamente plastico a taglio con resistenza costante dopo il raggiungimento di `VRd`;
- collasso del meccanismo a taglio al raggiungimento dello spostamento ultimo `du` del maschio, con annullamento della resistenza residua.
- per robustezza numerica il solver puo mantenere internamente un residuo minimo non significativo, pur continuando a restituire al livello applicativo un collasso a resistenza nulla.

Scelta architetturale di riferimento:

- il metodo aggregato resta il riferimento minimo ufficiale della capacita dell'allineamento;
- il FEM esplicito deve essere coerente con lo stesso quadro meccanico;
- il post-elastico del maschio non viene lasciato a semplici warning, ma e rappresentato con rami perfettamente plastici distinti per flessione e taglio.
