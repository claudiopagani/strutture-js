# Copertura dei moduli per strutture in calcestruzzo armato

## Scopo della dichiarazione

Questo documento descrive esclusivamente capacità presenti nel codice e limiti
verificabili. Il perimetro dichiarato è quello degli edifici ordinari in
calcestruzzo armato gettato in opera. Non viene rivendicata la copertura
integrale dei capitoli 4 e 7 per prefabbricati, precompressi, ponti o altri
campi esterni a tale perimetro. La copertura del perimetro dichiarato è
completa.

La fonte eseguibile della matrice è
`getNTC2018RcBuildingCoverage()`. La funzione
`evaluateNTC2018RcBuildingCompleteness()` restituisce `complete` solo se tutte
le capacità obbligatorie del perimetro hanno stato `available`.

Gli stati hanno questo significato:

| Stato | Significato |
| --- | --- |
| `available` | Capacità implementata e coperta da test nel campo dichiarato. |
| `adapter-required` | Il kernel è disponibile, ma serve una trasformazione esplicita dipendente dal modello del consumer. |
| `not-implemented` | Capacità non disponibile; non può contribuire a un esito positivo completo. |
| `outside-declared-scope` | Parte delle NTC non inclusa nel perimetro degli edifici ordinari gettati in opera. |

## Confine con i solutori FEM

Il solutore FEM globale è esterno alla libreria. Qualunque producer deve
fornire gli stessi cinque contratti generici:

1. `FemCapabilitiesContract`;
2. `GlobalFemModelContract`;
3. `GlobalFemAnalysisContract`;
4. `GlobalFemResultContract`;
5. `FemEntityMappingContract`.

Il postprocessore produce un `GlobalFemDemandSet` serializzabile. Ogni stato
mantiene unità, assi locali, convenzione dei segni, combinazione o caso di
carico, elemento e stazione.

Le proiezioni concorrenti:

- includono tutti gli elementi assegnati a un membro;
- non sostituiscono componenti mancanti con zero;
- non costruiscono vettori artificiali usando inviluppi di combinazioni
  diverse;
- trasformano vettori, tensori di shell, section-cut e reazioni solo mediante
  matrici proprie ortogonali esplicitamente dichiarate nel mapping;
- conservano stati concorrenti di membri, giunti, shell, section-cut e
  reazioni.

Una prova di conformità usa due producer sintetici con identità e versioni
diverse e verifica sia la semantica estratta sia l’esito completo
dell’edificio. Nessun adapter nomina NextFEM, OCFEM o un altro prodotto.

## Capacità locali disponibili

| Capacità | Campo dichiarato |
| --- | --- |
| Sezioni in c.a. | SLU a fibre, domini monoassiali e biassiali, SLE, momento-curvatura. |
| Travi | Flessione, taglio, torsione nel campo supportato, SLE, deformazioni e dettagli locali con dati assegnati. |
| Pilastri | Pressoflessione biassiale, snellezza locale, taglio e dettagli con lunghezze efficaci e dati assegnati. |
| Nodi trave-pilastro | Verifiche locali e stati direzionali concorrenti con geometria, armature, azioni e capacità assegnate. |
| Piastre | Verifica locale di risultanti mediante strisce equivalenti e trasformazioni Wood-Armer. |
| Punzonamento | Verifica locale nelle geometrie dichiarate dal relativo manifest; i casi non supportati restituiscono uno stato non positivo. |
| Plinti isolati | Contatto e verifiche strutturali nel campo geometrico dichiarato; le resistenze geotecniche sono input separati. |
| Travi di fondazione | Trave prismatica orizzontale su Winkler con contatto monolatero e verifiche locali. |
| Regioni D | Modello tirante-puntone 2D a topologia assegnata secondo il codice dichiarato dal modulo; non equivale a una copertura NTC automatica delle regioni D. |

Le applicazioni locali non generano armature, non scelgono la classe di
duttilità e non deducono condizioni al contorno mancanti.

## Kernel globali NTC 2018 disponibili

Sono implementati e testati:

- scelta esplicita del comportamento strutturale e del tipo strutturale;
- fattore di comportamento, rapporto `αu/α1` e riduzione per irregolarità in
  elevazione nel campo delle tipologie dichiarate;
- regolarità in pianta e in altezza secondo i criteri espliciti del § 7.2.1;
- ammissibilità dell’analisi statica lineare solo con regolarità in elevazione
  e dati di periodo sufficienti;
- drift di piano, coefficiente `θ`, intervalli P-Delta e distanza tra
  costruzioni contigue;
- gerarchia trave-pilastro e domande di taglio di capacità per travi,
  pilastri e nodi;
- altezza della zona critica, traslazione dei momenti, domanda di taglio,
  controlli di bordo e confinamento dei setti nel campo dichiarato;
- amplificazione 1,30 delle azioni di diaframma prevista dal § 7.4.4.4.1;
- pressoflessione biassiale dei setti tramite intersezione fra il raggio della
  domanda e il dominio resistente campionato;
- masse modali partecipanti, CQC, combinazione 100/30/30 ed eccentricità
  accidentale con entrambi i segni a ogni piano;
- verifica lungo l’altezza dei setti, inviluppo delle strutture miste,
  pareti estese debolmente armate e travi di accoppiamento;
- trasformazione tensoriale delle risultanti di piastra, aggregazione
  SLU/SLE, punzonamento e resistenza nel piano dei diaframmi;
- mapping univoco supporto-fondazione e raggruppamento concorrente delle
  reazioni per verifiche strutturali, geotecniche, SLE e sismiche.

Il dominio biassiale non identifica l’orientazione dell’asse neutro con quella
del vettore momento. La regressione usa una sezione asimmetrica, un dominio di
riferimento più fitto e una ricerca del bordo mediante bisezione
punto-nel-poligono.

## Condizioni per l’esito completo

`RcBuildingVerificationApplication` ha maturità `complete` nel perimetro
dichiarato, ma non presume dati o capacità mancanti. Un esito positivo richiede:

- contratti FEM, mapping degli assi e provenienza validi;
- scelte esplicite di comportamento, tipologia, regolarità e dati dinamici;
- verificatori locali applicabili per ogni membro, nodo, section-cut di
  parete, stato di piastra, connessione a punzonamento e fondazione;
- tutte le famiglie SLU/SLE, di dettaglio, duttilità e gerarchia applicabili;
- nessuna readiness bloccata e nessun controllo non soddisfatto.

I verificatori locali ricevono contesti generici e possono essere quelli della
libreria o composizioni del consumer. Se una famiglia è omessa, il risultato
è non positivo; una callback priva di stato o di controlli obbligatori non
diventa implicitamente `ok`.

Restano fuori dal perimetro dichiarato c.a. precompresso, prefabbricati,
ponti e le altre tipologie esplicitamente marcate
`outside-declared-scope`. `wholeChapter4And7CoverageClaimed` resta quindi
`false`, mentre `declaredScopeCoverageComplete` vale `true`.

## D.M. 52/2023

Il D.M. 9 marzo 2023, n. 52 non introduce acciai B600, fattori parziali o
regole di dettaglio per il calcestruzzo armato dei capitoli 4 e 7.

Nel modulo è registrato soltanto ciò che risulta dall’atto:

- la disposizione transitoria di sette anni per opere pubbliche e private già
  affidate o contrattualizzate;
- la sospensione temporanea del § 11.4.2;
- la sospensione temporanea del § 11.5.2 limitata agli ancoraggi passivi
  geotecnici;
- termine delle sospensioni: 22 marzo 2025.

Il lookup di una clausola dei capitoli 4 o 7 restituisce quindi che non esiste
un emendamento RC del D.M. 52/2023.

## Fonti

- D.M. 17 gennaio 2018, NTC 2018:
  <https://www.gazzettaufficiale.it/eli/id/2018/2/20/18A00716/sg>
- Circolare 21 gennaio 2019, n. 7:
  <https://www.gazzettaufficiale.it/eli/id/2019/02/11/19A00855/sg>
- D.M. 9 marzo 2023, n. 52:
  <https://www.gazzettaufficiale.it/eli/id/2023/03/22/23A01847/sg>

Le formule e i coefficienti sono citati nei moduli che li implementano e sono
coperti da test mirati e casi di validazione proporzionati alla criticità.
