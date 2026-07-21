# Tiranti di ancoraggio nel terreno

## Stato e perimetro

Il modulo `geotechnical-ground-anchors` implementa il progetto di tiranti
attivi cementati in terreno o roccia. Il workflow comprende:

- geometria del tirante nella sezione geotecnica 2D;
- domanda assegnata o importata dalla risposta per fasi di una paratia;
- posizione del bulbo rispetto alla superficie critica;
- suddivisione esatta del bulbo nelle zone di `GroundSection2D`;
- capacita di trasferimento terreno-boiacca per ogni tratto;
- verifiche del tendine, del carico di bloccaggio e del carico di prova;
- capacita assegnate della testata e dell'aderenza tendine-boiacca;
- scelta della classe di protezione anticorrosiva;
- elaborazione di prove di qualificazione, prestazione e creep;
- payload per paratia, struttura, stabilita globale e futuro FEM completo.

La microapp pubblica e `GeotechnicalGroundAnchorApplication`. Il modulo non
duplica la verifica della parete, del corrente o della piastra di ripartizione,
ne calcola la stabilita globale: espone le azioni e la geometria che i relativi
workflow devono consumare.

## Riferimento e formato di sicurezza

Il metodo implementato segue
[FHWA GEC 4, Ground Anchors and Anchored Systems, FHWA-IF-99-015](https://www.fhwa.dot.gov/engineering/geotech/pubs/if99015.pdf),
in particolare:

- sezione 5.3 per geometria, domanda, lunghezze, capacita del bulbo, interassi
  e tendine;
- sezione 6.4 per la protezione anticorrosiva;
- sezione 7.4.5 per accettazione, creep e lunghezza libera apparente;
- specifica generica, sezione 3.06, per le lunghezze minime del bulbo.

Il workflow FHWA e basato su carichi ammissibili. Non viene eseguita una
conversione automatica verso formati NTC o Eurocodice a coefficienti parziali.
Ogni eventuale conversione deve appartenere a un adapter normativo separato e
deve dichiarare i propri coefficienti.

## Contratti pubblici

| Contratto | Schema | Responsabilita |
| --- | --- | --- |
| `GroundAnchorModel` | `ground-anchor-model/v1` | Geometria, tendine, protezione e capacita assegnate dei componenti. |
| `GroundAnchorDesignScenario` | `ground-anchor-design-scenario/v1` | Domanda, superficie critica, resistenze del bulbo, ambiente e prove. |
| `GroundAnchorAnalysis` | `ground-anchor-design-result/v1` | Risoluzione della domanda, verifiche e contratti di accoppiamento. |
| `GroundAnchorStabilityAction2D` | `ground-anchor-stability-action-2d/v1` | Conversione del risultato verificato in azione piena, proporzionale o nulla per ogni superficie circolare. |
| catalogo FHWA | dati pubblici immutabili | Valori presuntivi di trasferimento delle tabelle 6 e 8. |

Input e risultati sono serializzabili. Le unita devono essere sempre
esplicite; il kernel normalizza in `kN`, `m`, `kN/m` e `kN/m2`.

## Geometria

Il tirante e una linea retta nel piano `x-z` di `GroundSection2D`:

- `head` definisce la testata;
- `horizontalDirection` seleziona `positive-x` o `negative-x`;
- `inclination` e positiva verso il basso;
- `freeLength` e la lunghezza libera;
- `bondLength` e la lunghezza del bulbo;
- `horizontalSpacing` e l'interasse lungo la parete;
- `groutBodyDiameter` e il diametro del corpo iniettato.

Il punto a distanza `s` dalla testata e:

```text
x(s) = x_head +/- s cos(theta)
z(s) = z_head - s sin(theta)
```

Il bulbo viene intersecato con tutti i poligoni della sezione. Il risultato
conserva, per ciascun tratto, zona, materiale, estremi geometrici, lunghezza
reale e lunghezza efficace usata nella capacita. Un vuoto non assegnato nella
sezione produce un errore esplicito.

## Superficie critica e lunghezza libera

Sono disponibili tre modelli:

- `assigned-distance`: distanza dell'intersezione lungo il tirante;
- `assigned-polyline`: polilinea generica, adatta a ricevere una superficie
  critica da un'analisi di stabilita;
- `rankine-active-wedge`: piano a `45 deg + phi'/2` originato dal fondo scavo.

Il ramo Rankine e intenzionalmente limitato a parete verticale, piano campagna
orizzontale e terreno incoerente drenato omogeneo. Negli altri casi va usata
una superficie assegnata ottenuta da un'analisi globale o a cunei.

L'inizio del bulbo deve trovarsi oltre la superficie critica di almeno:

```text
clearance = max(1.5 m, H / 5)
```

La lunghezza libera minima e `3 m` per barre e `4.5 m` per trefoli. Entrambi i
controlli sono separati: soddisfare la lunghezza minima non garantisce il
corretto superamento della superficie critica.

## Domanda e collegamento con la paratia

La domanda puo essere:

- `assigned-tendon-load`, gia espressa lungo il tirante;
- `assigned-horizontal-line-load`, reazione orizzontale per metro di parete;
- `embedded-retaining-wall-result`, letta direttamente dal risultato della
  paratia per uno specifico `supportId`.

Per una reazione orizzontale della striscia `R_strip`, larghezza analizzata
`b_a`, interasse `s_h` e inclinazione `theta`:

```text
q_h = abs(R_strip) / b_a
H_anchor = q_h s_h
T_design = H_anchor / cos(theta)
V_anchor = T_design sin(theta)
```

La selezione puo usare una fase specifica oppure il massimo assoluto tra tutte
le fasi in cui il sostegno e attivo. Il risultato conserva la fase governante
e le componenti per singolo tirante e per unita di parete.

`groundAnchorDemandFromEmbeddedWallResult` rende disponibile la stessa
conversione come funzione pura.

## Capacita del bulbo

Ogni zona o materiale puo usare:

- `fhwa-presumptive`, selezionando una voce delle tabelle FHWA;
- `ultimate-transfer-load`, con resistenza ultima assegnata in `kN/m`;
- `ultimate-bond-stress`, con tensione ultima assegnata e diametro del bulbo.

Per un tratto di lunghezza `L`:

```text
R_ult = q_ult L
```

oppure:

```text
q_ult = pi D tau_ult
R_ult = pi D tau_ult L
```

La capacita ammissibile del tratto e `R_ult / FS`; per i modelli manuali il
divisore e obbligatorio e la provenienza e sempre richiesta. Le capacita dei
tratti vengono sommate.

Il catalogo FHWA contiene valori presuntivi per piccoli tiranti rettilinei
cementati a gravita. I divisori associati sono `2.0` nel terreno e `3.0` nella
roccia competente. Per geomateriali deboli il progettista deve assegnare la
classificazione e il divisore appropriati.

Per i valori presuntivi nel terreno, senza una tecnica speciale di
trasferimento, il calcolo accredita al massimo `12 m` di bulbo. Il risultato
segnala sempre che i valori di catalogo servono al predimensionamento e che la
capacita deve essere confermata dalle prove di produzione.

Le lunghezze minime verificate sono:

| Mezzo | Barra | Trefolo |
| --- | ---: | ---: |
| terreno | 4.5 m | 4.5 m |
| roccia | 3.0 m | 4.5 m |

Per un tirante interamente nel terreno si controllano inoltre `4.5 m` di
ricoprimento verticale sul centro del bulbo. Un bulbo misto terreno-roccia
restituisce questo controllo come `not-analyzed`, richiedendo una valutazione
specifica.

## Tendine, testata e componenti

Il tendine dichiara tipo, area di acciaio, modulo elastico, resistenza minima a
trazione specificata `SMTS` e provenienza. Sono verificati:

```text
T_design  <= 0.60 SMTS
T_lockoff <= 0.70 SMTS
T_test    <= 0.80 SMTS
```

dove `SMTS = A_s f_pu` come forza. I fattori di carico di bloccaggio e prova
sono conservati nello scenario; i default del workflow sono rispettivamente
`1.00` e `1.33` volte il carico di progetto.

Le resistenze della testata e dell'aderenza tendine-boiacca possono essere
assegnate e sono confrontate con il massimo carico di prova. Se mancano, i
controlli restano `not-analyzed`: la parete, il corrente, la piastra e il
collegamento sono demandati al verificatore strutturale.

## Interasse e costruibilita

Il controllo FHWA richiede un interasse orizzontale maggiore di `1.2 m`. Il
campo usuale di inclinazione e `10-45 deg`; valori esterni non vengono
automaticamente rifiutati, ma producono una valutazione di costruibilita
`not-analyzed`. Sotto `10 deg` il modello puo registrare una tecnica speciale
di iniezione con provenienza obbligatoria.

## Protezione anticorrosiva

`corrosionEnvironment` dichiara:

- vita `temporary-support-of-excavation` o `permanent`;
- aggressivita `non-aggressive`, `aggressive` o `unknown`;
- conseguenze del cedimento;
- costo relativo della protezione superiore;
- eventuali misure di pH, resistivita, solfuri, correnti vaganti e attacco a
  strutture adiacenti.

Il terreno e classificato aggressivo se `pH < 4.5`, resistivita `< 2000
ohm-cm` o se sono presenti gli altri indicatori FHWA. Il diagramma decisionale
della sezione 6.4 seleziona la classe minima:

- temporaneo non aggressivo: nessuna protezione;
- temporaneo aggressivo o ignoto: classe II;
- permanente aggressivo, ignoto o con conseguenze serie: classe I;
- permanente non aggressivo e non critico: classe I o II secondo il costo
  della protezione superiore.

La classe selezionata dal modello deve essere almeno pari a quella richiesta.
I dettagli costruttivi restano nel payload `details` e non sono sostituiti da
una semplice etichetta di classe.

## Prove e accettazione

Ogni record contiene tipo, carico di allineamento, carico di prova, letture
tempo-movimento e movimento elastico al carico di prova.

Per prove `proof` e `performance` il movimento deve essere al massimo:

- `1 mm` fra 1 e 10 minuti;
- se il primo limite e superato, `2 mm` fra 6 e 60 minuti.

Per `extended-creep`, ogni mantenimento deve restare entro `2 mm` nell'ultimo
ciclo logaritmico di tempo. L'interpolazione tra letture e lineare rispetto a
`log10(t)`.

La lunghezza libera apparente e:

```text
L_a = A_t E_s delta_e / (T_test - T_alignment)
```

e deve essere almeno:

```text
L_jack + 0.80 L_free
```

Per una prova `proof`, se il movimento residuo non e disponibile, puo essere
usato il movimento totale come previsto dalla fonte. L'assenza di prove non
fa fallire il progetto, ma lascia l'accettazione `not-analyzed` e genera un
avviso esplicito.

## Risultati e integrazioni

Il risultato conserva `status`, `demand`, `capacity`, `checks`,
`utilizationRatio`, `warnings`, `assumptions` e `metadata`.

`couplings` contiene:

- `embeddedRetainingWall`: fonte e fase della reazione consumata;
- `structuralWallAndWaler`: azioni orizzontali e verticali alla testata;
- `globalStability`: asse, posizione del bulbo e forze di progetto/bloccaggio
  per tirante e per unità di larghezza;
- `fem`: link assiale ridotto con rigidezza `A E / L_free` e forza iniziale.

`GroundAnchorStabilityAction2D.fromGroundAnchorResult(result)` consuma il
payload quando il risultato sorgente ha status `ok`. Il solver circolare di
stabilità determina quindi per ogni superficie:

- forza completa se l'intersezione è nella lunghezza libera;
- forza proporzionale alla lunghezza di bulbo rimanente oltre la superficie se
  l'intersezione cade nel bulbo;
- forza nulla se il tirante è racchiuso nella massa mobile o la superficie non
  ne attraversa l'asse.

La forza viene applicata come azione puntuale inclinata all'intersezione e
partecipa agli equilibri di forza e momento di Spencer. La proporzione segue
l'ipotesi di tensione di aderenza uniforme della sezione 5.8.3.2 di FHWA GEC 4.
Il link FEM non sostituisce il trasferimento distribuito nel bulbo, che resta
una capacità esterna del modello ridotto.

## Validazione

La campagna
`validation/geotechnicalGroundAnchorValidationCampaign.js` verifica con
calcoli indipendenti:

1. intersezione del bulbo con due zone e somma delle capacita;
2. trasformazione da reazione di parete a forza nel tirante inclinato;
3. equazione della lunghezza libera apparente e movimento di creep.

I test di regressione coprono anche serializzazione, catalogo immutabile,
importazione dalla paratia, classi di corrosione e superamento della capacita
del tendine.

## Limiti dichiarati

Non sono inclusi:

- tiranti curvi, elicoidali, ad espansione o non cementati;
- interazione tridimensionale fra gruppi oltre al controllo di interasse;
- rilassamento, perdite differite e cicli isteretici del tendine;
- calcolo strutturale della parete, del corrente, della piastra o della
  testata non dotata di capacita assegnata;
- distribuzione non uniforme del trasferimento lungo il bulbo, compatibilità
  non lineare tirante-terreno e superfici che intersecano due volte lo stesso
  asse;
- conversioni normative automatiche diverse dal formato FHWA dichiarato;
- controllo automatico dei dettagli costruttivi e della qualita di iniezione.

Queste voci non sono restituite come implicitamente soddisfatte.
