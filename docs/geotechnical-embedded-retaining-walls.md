# Paratie e scavi sostenuti

## Stato

Il modulo `geotechnical-embedded-retaining-walls` implementa la risposta 2D
per fasi di una paratia verticale modellata come trave Euler-Bernoulli su
molle laterali non lineari indipendenti sui due lati.

Il perimetro disponibile comprende:

- paratia continua per striscia o trave equivalente;
- rigidezza flessionale `EI` costante o variabile a tratti;
- terreno trattenuto e lato scavo associati anche a profili differenti;
- leggi efficaci pressione-spostamento assegnate per strato e profondita;
- pressione interstiziale da `PorePressureField2D` selezionabile per fase;
- sequenza deterministica di fasi di scavo o riporto;
- tiranti, puntoni e sostegni elastici bilaterali o monolaterali;
- pretensione e controllo di una capacita assegnata del sostegno;
- carichi nodali e diagrammi distribuiti statici o pseudostatici;
- soluzione incrementale non lineare, diagnostica di convergenza ed
  equilibrio globale;
- trasferimento serializzabile di spostamenti, azioni e rigidezze tangenti
  verso il FEM strutturale.

Il modulo calcola la risposta e le azioni. Il progetto completo dei tiranti e
disponibile nella microapp separata
[`geotechnical-ground-anchors`](geotechnical-ground-anchors.md), che puo
consumare direttamente le reazioni per fase. La verifica strutturale della
paratia e la stabilita globale restano nei rispettivi workflow. Fondo scavo e
meccanismi idraulici non appartengono al perimetro scelto per questa microapp.

## Riferimenti metodologici

La distinzione tra fasi di scavo, comportamento a mensola, sostegni e
resistenza passiva dell'infissione segue l'impostazione generale di
[FHWA GEC 4, Ground Anchors and Anchored Systems, FHWA-IF-99-015](https://www.fhwa.dot.gov/engineering/geotech/pubs/if99015.pdf),
in particolare i capitoli 5 e 8.

Il ruolo dell'attivazione/disattivazione di terreno, carichi, falda e sostegni
nelle analisi per fasi e coerente con la panoramica FHWA sulle funzionalita dei
modelli geotecnici agli elementi finiti:
[FHWA-HRT-10-077, capitolo 6](https://www.fhwa.dot.gov/publications/research/infrastructure/10077/006.cfm).

Questi riferimenti non definiscono una singola correlazione universale
pressione-spostamento. Le curve sono quindi dati assegnati, con provenienza
obbligatoria, e non vengono dedotte automaticamente dai soli parametri di
resistenza del terreno.

## Contratti pubblici

Il modulo espone quattro contratti principali:

| Contratto | Schema | Responsabilita |
| --- | --- | --- |
| `WallSoilReactionLaw` | `wall-soil-reaction-law/v1` | Inviluppo monotono pressione efficace-chiusura. |
| `EmbeddedRetainingWallModel` | `embedded-retaining-wall-model/v1` | Geometria, larghezza analizzata, `EI` e vincoli ideali. |
| `EmbeddedRetainingWallScenario` | `embedded-retaining-wall-scenario/v1` | Due lati, sostegni, fasi, acqua e carichi. |
| `EmbeddedRetainingWallAnalysis` | `embedded-retaining-wall-result/v1` | Mesh, soluzione non lineare, azioni, equilibrio e ponte FEM. |

Tutti gli input e i risultati sono serializzabili. La microapp pubblica e
`GeotechnicalEmbeddedRetainingWallApplication`.

## Unita e convenzioni

Gli input devono dichiarare almeno `force` e `length`. Il kernel normalizza in:

| Grandezza | Unita interna |
| --- | --- |
| lunghezza e spostamento | `m` |
| forza della striscia | `kN` |
| pressione | `kN/m2` |
| momento | `kN.m` |
| rigidezza flessionale | `kN.m2` |
| rigidezza del sostegno | `kN/m` |
| tangente pressione-spostamento | `kN/m3` |

L'asse verticale globale e `z`, positivo verso l'alto. La coordinata locale
della trave cresce verso il basso dalla testa della paratia.

Lo spostamento della paratia e positivo dal terreno trattenuto verso lo scavo.
La rotazione e `dy/dx`, con `x` positivo verso il basso.

Le pressioni dei due lati sono memorizzate come magnitudini positive. La loro
direzione sulla paratia e:

- positiva per il lato trattenuto;
- negativa per il lato scavo.

## Legge pressione-spostamento

`WallSoilReactionLaw` descrive la pressione orizzontale efficace in funzione
della chiusura relativa tra parete e terreno del lato considerato.

La chiusura positiva significa che la parete entra nel terreno:

- lato trattenuto: `closure = -wallDisplacement`;
- lato scavo: `closure = +wallDisplacement`.

I punti devono:

- essere almeno due;
- avere spostamenti strettamente crescenti;
- comprendere lo spostamento nullo;
- avere pressioni non negative e non decrescenti;
- dichiarare `provenance.source`.

Il punto o l'interpolazione a chiusura nulla rappresenta lo stato di pressione
efficace iniziale scelto dal progettista. Spostamenti di apertura possono
ridurre la pressione verso il limite attivo; spostamenti di chiusura possono
aumentarla verso il limite passivo.

L'estrapolazione e `constant` o `linear`. Una estrapolazione lineare che
produrrebbe trazione viene troncata a pressione nulla. Ogni uso esterno
all'intervallo assegnato e riportato nel risultato.

La legge e un inviluppo statico senza memoria. Non rappresenta scarico,
ricarico, isteresi, degradazione ciclica o deformazione permanente.

## Stratigrafia dei due lati

`soilResponse.sides.retained` e `soilResponse.sides.excavation` dichiarano:

- il `profileId` nel `GroundModel`;
- la coordinata `xCoordinate` usata per interrogare il campo di pressione
  interstiziale;
- l'eventuale `defaultPorePressureFieldId`;
- `curvesByLayer`, con una o piu stazioni per ogni strato interessato.

Le stazioni sono espresse come profondita sotto la superficie del rispettivo
profilo. Tra due stazioni vengono interpolate pressione e rigidezza tangente.
Fuori dal loro intervallo viene usata la stazione piu vicina.

Il nodo posto su una interfaccia stratigrafica riceve separatamente le
semi-lunghezze tributarie degli elementi sopra e sotto l'interfaccia.

## Modello della paratia

`EmbeddedRetainingWallModel` richiede:

- quota di testa e quota di punta;
- larghezza della striscia analizzata;
- segmenti contigui che coprono tutta la parete;
- `EI` e provenienza per ogni segmento;
- vincoli ideali opzionali in traslazione o rotazione alla testa e alla punta.

La larghezza predefinita e `1 m`. Le pressioni vengono moltiplicate per questa
larghezza prima dell'assemblaggio. Per pareti discontinue o travi equivalenti
la scelta della larghezza e della rigidezza deve essere esplicita e coerente.

La deformazione a taglio, la rigidezza assiale, la rigidezza geometrica e una
legge momento-curvatura non lineare non sono incluse.

## Fasi costruttive

Ogni fase definisce lo stato completo corrente:

- `retainedGroundElevation`;
- `excavationGroundElevation`;
- elenco `activeSupportIds`;
- eventuale campo di pressione interstiziale per ciascun lato;
- diagrammi di pressione additivi;
- azioni nodali.

L'ordine dell'array `stages` e l'ordine fisico della costruzione. Il solver
interpola dalla configurazione completa precedente a quella corrente. In
questo modo l'asportazione del terreno, la variazione dell'acqua, l'attivazione
dei sostegni e l'applicazione dei carichi entrano nello stesso equilibrio
incrementale.

Una fase non e una copia del FEM continuo: descrive lo stato attivo del
modello ridotto. Le deformazioni accumulate della trave sono conservate tra le
fasi.

## Pressione interstiziale

La legge di molla contiene soltanto pressione efficace del terreno. La
pressione dell'acqua viene interrogata separatamente dal
`PorePressureField2D` selezionato e sommata alla pressione efficace.

Il contatto idraulico e applicato solo dove il terreno del lato e attivo. Una
colonna d'acqua libera sopra il fondo scavo deve essere rappresentata con un
diagramma di pressione assegnato. Il modulo non risolve filtrazione,
abbassamento transitorio della falda o consolidazione.

## Tiranti e puntoni

I sostegni disponibili sono:

- `ground-anchor`;
- `strut`;
- `generic-support`.

Ogni sostegno dichiara quota, rigidezza, pretensione, direzione dell'azione e
provenienza. Il comportamento puo essere:

- `unilateral`: la forza scalare non puo diventare negativa;
- `bilateral`: la forza puo cambiare segno.

Quando un sostegno compare per la prima volta tra gli `activeSupportIds`, il
suo riferimento cinematico viene posto nello spostamento raggiunto dalla
paratia alla fine della fase precedente. La pretensione viene applicata nella
transizione della nuova fase.

Una `capacity.maximumForce` opzionale produce domanda, capacita e rapporto di
utilizzo. Il superamento restituisce `not-verified`; non introduce
automaticamente uno snervamento o la rottura del sostegno.

Le verifiche di aderenza, lunghezza libera e ancorata, bulbo, connessioni,
acciaio e prove di accettazione restano moduli distinti.

## Carichi distribuiti e pseudostatica

`stage.pressureLoads` accetta:

- segmenti lineari assegnati con pressione superiore e inferiore;
- un `PressureDiagram2D`, scegliendo un componente, normalmente
  `totalNormal`.

I carichi distribuiti sono trasformati in carichi nodali consistenti della
trave Euler-Bernoulli. Forza e momento risultanti sono conservati.

La condizione `pseudostatic` richiede:

- una situazione geotecnica pseudostatica coerente;
- `loadingProvenance.source`;
- almeno un diagramma con `category: "seismic"`.

Un diagramma prodotto dal ramo Mononobe-Okabe puo quindi essere applicato alla
paratia. Il risultato `resultant-only` del metodo a cuneo non viene trasformato
implicitamente in una distribuzione: occorre una distribuzione giustificata e
assegnata.

La pseudostatica non aggiunge automaticamente inerzia della parete, risposta
dinamica, degradazione ciclica o spostamenti permanenti.

## Soluzione numerica

La mesh include sempre:

- testa e punta;
- cambi di `EI`;
- interfacce degli strati;
- stazioni delle leggi;
- quote di scavo;
- quote dei sostegni e delle azioni;
- estremi dei diagrammi distribuiti.

Gli intervalli vengono suddivisi rispettando `maxElementLength`. La parete usa
elementi Euler-Bernoulli a due gradi di liberta per nodo. Le molle del terreno
sono concentrate ai nodi usando le lunghezze tributarie dei due elementi
adiacenti.

Ogni transizione e risolta con:

1. controllo di carico incrementale;
2. Newton con tangente analitica delle molle;
3. ricerca lineare;
4. dimezzamento automatico dell'incremento in caso di mancata convergenza;
5. arresto esplicito se non viene raggiunta la fase completa.

Non viene eseguito automaticamente uno studio di convergenza della mesh. Il
consumer deve ripetere il caso riducendo `maxElementLength`.

## Risultati

Per ogni fase vengono restituiti:

- spostamento e rotazione di ogni nodo;
- contributi separati dei due lati;
- pressione efficace, pressione dell'acqua e forza nodale;
- rigidezza tangente e indicatore di estrapolazione;
- forza dei sostegni, deformazione e riferimento di installazione;
- taglio e momento nella paratia;
- massimi assoluti;
- reazioni dei vincoli ideali;
- bilancio globale di forze e momenti;
- residuo sui gradi di liberta liberi;
- storia di convergenza, iterazioni, line search e cutback.

Il risultato complessivo contiene `demand`, `capacity`, `checks` e
`utilizationRatio`. La resistenza strutturale della parete resta `null`, mentre
le capacita assegnate dei sostegni vengono controllate.

## Ponte verso il FEM completo

`structuralCoupling.responseMode` espone per ogni fase:

- nodi, quote, spostamenti e rotazioni;
- forze del terreno sui due lati;
- rigidezze tangenti;
- stato e forze dei sostegni;
- massimi di momento e taglio.

Questo contratto alimenta i verificatori strutturali della parete e dei
puntoni. Le reazioni dei sostegni di tipo `ground-anchor` sono consumabili da
`GroundAnchorAnalysis`, che applica interasse e inclinazione per ricavare la
forza nel singolo tirante. Nel futuro FEM continuo gli stessi dati diventano
elementi trave, interfacce terreno-struttura, condizioni idrauliche e oggetti
attivati per fase.

Il modello corrente resta un modello ridotto. Non ricostruisce lo stato
tensionale nel volume di terreno e non sostituisce una analisi continua nei
casi in cui siano determinanti cinematismi profondi, effetti 3D o interazione
con strutture adiacenti.

## Validazione

La campagna
`validation/geotechnicalEmbeddedRetainingWallValidationCampaign.js` contiene:

1. mensola con pressione uniforme confrontata con la soluzione esatta
   Euler-Bernoulli;
2. paratia lunga su due letti di Winkler lineari confrontata con la soluzione
   chiusa della trave semi-infinita;
3. grado di liberta della trave accoppiato a un sostegno elastico confrontato
   con la somma indipendente delle rigidezze.

I test aggiungono equilibrio simmetrico, separazione della pressione
interstiziale, scavo per fasi, installazione senza salto di forza, capacita dei
sostegni, serializzazione, routing applicativo e coerenza della situazione
pseudostatica.

## Limiti espliciti

Non sono implementati:

- generazione automatica delle curve da correlazioni empiriche;
- plasticita con memoria, scarico-ricarico e degrado ciclico;
- pareti inclinate o geometria tridimensionale;
- comportamento Timoshenko, `P-delta` o sezione strutturale non lineare;
- inerzia automatica della parete e analisi dinamica nel tempo;
- consolidazione e accoppiamento idromeccanico;
- attrito verticale lungo la parete;
- rilascio tensionale tridimensionale dello scavo;
- interazione tra paratie opposte o telai di puntoni;
- stabilita globale, demandata al relativo workflow con payload esplicito;
- fondo scavo, sifonamento, uplift e piping, esclusi dal perimetro scelto;
- verifica di parete, correnti e collegamenti, demandata ai moduli strutturali;
- progetto dei tiranti, non interno alla microapp paratie ma disponibile come
  modulo separato `geotechnical-ground-anchors`;

Questi limiti sono riportati come capacita separate, non come risultati
implicitamente soddisfatti.
