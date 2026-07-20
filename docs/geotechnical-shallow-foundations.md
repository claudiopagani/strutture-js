# Fondazioni superficiali geotecniche

## 1. Stato e perimetro

L'applicazione pubblica `geotechnical-shallow-foundations` implementa la
capacita ULS statica e il primo incremento SLS statico di cedimento immediato.
Il calcolo e indipendente dalle verifiche strutturali del plinto e consuma gli
stessi `GroundModel` e `GeotechnicalDesignSituation` usati dalle altre
applicazioni geotecniche.

Sono implementati:

- fondazioni rettangolari, nastriformi e circolari;
- risultante verticale, taglio orizzontale e momento alla base;
- eccentricita e dimensioni efficaci;
- capacita portante drenata e non drenata;
- confronto parallelo tra USACE/Meyerhof e FHWA/Vesic;
- falda idrostatica orizzontale o linea freatica 2D valutata localmente;
- meccanismo omogeneo nello strato di base;
- punch-through limitato a strato resistente sopra strato debole non drenato;
- scorrimento alla base con attrito e adesione di interfaccia assegnati;
- confronti domanda/capacita e fattori di sicurezza senza coefficienti
  normativi impliciti;
- parametri di deformabilita tipizzati e selezionabili per materiale, zona o
  strato;
- cedimento immediato stratificato da CPT secondo Schmertmann;
- integrazione incrementale delle deformazioni verticali da modulo vincolato;
- cedimento, rotazione e rigidezze statiche di un rettangolo rigido su mezzo
  elastico omogeneo equivalente secondo Pais-Kausel;
- cedimento differenziale e distorsione angolare fra due fondazioni;
- criteri SLS assegnati esplicitamente e discretizzazione con controllo di
  convergenza;
- risultato serializzabile e contratto di trasferimento unidirezionale verso
  la verifica strutturale.

Non sono implementati nello stesso solver:

- consolidazione primaria, secondaria, creep e cedimenti nel tempo;
- cedimenti sismici, collasso volumetrico, rigonfiamento e rebound di scavo;
- base inclinata o terreno adiacente inclinato;
- capacita portante o scorrimento sismici;
- resistenza passiva davanti a una fondazione incassata;
- sollevamento;
- punch-through generico multistrato o per fondazioni circolari;
- campi di pressione interstiziale a griglia assegnata;
- coefficienti parziali o verifiche NTC/Eurocodice.

Questi limiti non sono sostituiti da valori presunti. Il workflow restituisce
`not-supported` quando il caso richiede una delle generalizzazioni che possono
cambiare la resistenza governante.

## 2. Fonti del metodo

Le fonti primarie sono:

- [USACE EM 1110-1-1905, Geotechnical Design of Shallow Foundations on Soils (31 July 2025)](https://publibrary.sec.usace.army.mil/api/download?filename=EM+1110-1-1905_Geotechincal+Design+of+Shallow+Foundations+on+Soils_2025+07+22+-+Final.pdf&id=54658636-77d2-48df-f26b-5295a01899a7&preview=true),
  capitolo 5 e appendice B;
- [FHWA GEC 6, Shallow Foundations, FHWA-IF-02-054 (2002)](https://www.fhwa.dot.gov/engineering/geotech/pubs/010943.pdf),
  capitoli 5 e 7;
- [NIST GCR 12-917-21, Soil-Structure Interaction for Building Structures (2012)](https://www.nist.gov/publications/soil-structure-interaction-building-structures),
  paragrafo 2.2.1 e tabelle 2-2a/2-2b;
- [FEMA P-2091, A Practical Guide to Soil-Structure Interaction (2020)](https://www.fema.gov/sites/default/files/documents/fema_p-2091-soil-structure-interaction.pdf),
  capitolo 6.

Il manuale USACE 2025 presenta affiancati il metodo USACE basato su Meyerhof e
il metodo AASHTO/FHWA basato su Vesic. Raccomanda di eseguire entrambi e rende
la loro differenza un indicatore dell'incertezza del metodo. Il kernel conserva
percio entrambi i risultati, la media e lo scarto. La selezione predefinita per
il campo `capacity` e il minimo; il consumer puo scegliere esplicitamente la
media o uno dei due metodi.

La media non e una resistenza normativa e non viene applicata di nascosto.

## 3. Entry point e oggetti pubblici

Il consumer usa esclusivamente gli entry point pubblici:

```js
import {
  GeotechnicalShallowFoundationApplication,
} from "strutture-js/applications/geotechnical-shallow-foundations";

import {
  ShallowFoundationActionState,
  ShallowFoundationModel,
  ShallowFoundationServiceabilityAnalysis,
  calculateShallowFoundationDifferentialMovement,
} from "strutture-js/domain/geotechnics";
```

### 3.1 `ShallowFoundationModel`

Il modello geometrico ha schema `shallow-foundation-model/v1` e contiene:

- `id`, `name` e `metadata`;
- `shape`: `rectangular`, `strip` o `circular`;
- `geometry`;
- `placement.x`, `placement.y` e `placement.baseElevation`;
- sistema di unita esplicito.

Geometrie richieste:

| Forma | Input | Vincolo |
| --- | --- | --- |
| rettangolare | `width`, `length` | `0 < width <= length`. |
| nastriforme | `width` | il calcolo e per unita di lunghezza lungo l'asse continuo. |
| circolare | `diameter` | diametro positivo. |

Gli assi locali sono:

- `x`: direzione della larghezza;
- `y`: direzione della lunghezza o asse continuo;
- `z`: positivo verso l'alto.

La base e identificata dal suo centro. La versione corrente richiede una base
orizzontale.

### 3.2 `ShallowFoundationActionState`

Lo stato di azione ha schema `shallow-foundation-action-state/v1`.

Per una fondazione rettangolare o circolare usa `basis: "total"`:

- `verticalForce`, positiva verso il basso;
- `horizontalX`, `horizontalY`;
- `momentX`, `momentY`, con regola della mano destra.

Per una fondazione nastriforme usa `basis: "per-unit-length"`:

- `verticalForcePerUnitLength`;
- `horizontalForcePerUnitLength` in direzione trasversale;
- `momentPerUnitLength` rispetto all'asse continuo.

Il campo obbligatorio
`resultantScope: "total-at-foundation-base"` dichiara che la risultante e gia
trasferita al centro della base e comprende il peso della fondazione e gli
altri carichi verticali permanenti applicabili. Il solver non stima il peso del
calcestruzzo o del terreno sopra il plinto.

Un consumer strutturale deve eseguire una sola volta il trasferimento delle
azioni e non deve aggiungere nuovamente il peso proprio dopo aver costruito
questo DTO.

### 3.3 Parametri di deformabilita

`SoilMaterial` conserva i set resistenti e i set deformativi in collezioni
distinte. Un `deformationParameterSet` dichiara sempre:

- `id`, `basis`, `drainage` e `model`;
- `settlementComponent`;
- `stressRange` e `strainRange`, quando disponibili;
- `provenance.source`, obbligatoria;
- la grandezza meccanica richiesta dal modello.

I modelli disponibili sono:

| `model` | Dato principale | Uso corrente |
| --- | --- | --- |
| `schmertmann-cpt` | `coneTipResistance` | cedimento immediato drenato da CPT. |
| `constrained-modulus` | `constrainedModulus` | deformazione verticale incrementale; nel solver corrente solo componente classificata `immediate`. |
| `isotropic-elastic` | una sola fra `youngModulus` e `shearModulus`, piu `poissonRatio` | rigidezze statiche e movimenti di fondazione rettangolare rigida. |

Il modulo elastico deve inoltre dichiarare `modulusDefinition`, per esempio
`secant`, `strain-compatible` o `small-strain`. Un valore `small-strain` senza
riduzione compatibile con il livello deformativo produce `not-verified`, non
viene accettato silenziosamente come modulo operativo SLS.

`GeotechnicalDesignSituation.parameterSelection` offre
`deformationByLayer`, `deformationByZone` e `deformationByMaterial`. La
precedenza e zona, strato, materiale, set predefinito. La risoluzione controlla
separatamente base del parametro, drenaggio e autorizzazione dei valori
indicativi.

## 4. Unita interne e segni

Gli input dichiarano sempre `{ force, length }`. Il kernel normalizza in:

- forza: `kN`;
- lunghezza: `m`;
- momento: `kN.m`;
- tensione: `kN/m2`;
- peso di volume: `kN/m3`.

Per la fondazione nastriforme:

- forza: `kN/m`;
- momento per unita di lunghezza: `kN.m/m`, numericamente equivalente a `kN`;
- area per unita di lunghezza: `m2/m`.

La compressione verticale e positiva. La pressione interstiziale e positiva
in compressione e riduce la tensione efficace.

## 5. Eccentricita e dimensioni efficaci

Per la fondazione rettangolare:

```text
eB = |My| / V
eL = |Mx| / V
B' = B - 2 eB
L' = L - 2 eL
A' = B' L'
```

Il kernel conserva sia le dimensioni rispetto agli assi originali sia la
coppia ordinata minore/maggiore usata nei fattori di forma.

Per la fondazione nastriforme:

```text
e = |M| / V
B' = B - 2 e
```

Per la fondazione circolare sono applicate le equazioni USACE 5-9--5-14:
area del segmento circolare residuo, assi dell'ellisse equivalente e rettangolo
equivalente di uguale area. Il metodo e ammissibile solo per `e < R`.

Il risultato espone tre diagnostiche distinte:

- `compressiveEquilibriumUtilization`: il risultante deve rimanere dentro il
  perimetro della base;
- `middleThirdUtilization`: controllo geometrico per asse;
- `exactNoTensionKernUtilization`: controllo del nocciolo senza trazione; per
  il rettangolo biassiale usa la somma dei contributi e per il cerchio usa il
  nocciolo circolare esatto.

Se il risultante resta dentro la base ma esce dal nocciolo, la capacita
portante viene calcolata con l'area efficace, il check `full-compression-kern`
fallisce e lo status diventa `not-verified`. La distribuzione di contatto
strutturale resta una verifica distinta.

## 6. Capacita portante

La forma generale e l'equazione USACE 5-22:

```text
qult = sc dc ic c Nc
     + sq dq iq q0 Nq
     + sg dg ig 0.5 B' gamma' Ngamma
```

I fattori di inclinazione della base e del terreno valgono uno perche le
relative inclinazioni non sono nel perimetro corrente.

### 6.1 Analisi drenata

Il parametro resistente e il modello Mohr-Coulomb efficace:

- `phi' = strength.frictionAngle`;
- `c' = strength.cohesion`;
- `q0` e la tensione verticale efficace alla quota della base.

Sono calcolati:

```text
N  = (1 + sin(phi')) / (1 - sin(phi'))
Nq = N exp(pi tan(phi'))
Nc = (Nq - 1) cot(phi')
```

Il termine `Ngamma` e i fattori di forma e profondita sono quelli delle due
colonne della tabella USACE 5-2:

| Parte | USACE/Meyerhof | FHWA/Vesic |
| --- | --- | --- |
| `Ngamma` | `(Nq - 1) tan(1.4 phi')` | `2 (Nq + 1) tan(phi')`. |
| `sq` | `1 + 0.1 N B'/L'` | `1 + (B'/L') tan(phi')`. |
| `sc` | `1 + 0.2 N B'/L'` | `1 + (B'/L') Nq/Nc`. |
| `sgamma` | `1 + 0.1 N B'/L'` | `1 - 0.4 B'/L'`. |
| `dq` | `1 + 0.1 sqrt(N) Df/B'` | espressione Vesic con limite `dq <= 1.4`. |
| `dc` | `1 + 0.2 sqrt(N) Df/B'` | `1`. |
| `dgamma` | `1 + 0.1 sqrt(N) Df/B'` | `1`. |

Per il nastriforme `B'/L' = 0`.

### 6.2 Analisi non drenata

Il parametro resistente e `su` con `phi_u = 0`:

```text
Nc = 2 + pi
Nq = 1
Ngamma = 0
sc = 1 + 0.2 B'/L'
```

Il metodo USACE usa `dc = min(1 + 0.2 Df/B', 1.5)`. Il metodo FHWA omette
conservativamente il fattore di profondita. `q0` e la tensione verticale
totale alla base.

### 6.3 Carico inclinato

Il modulo considera `H = hypot(Hx, Hy)` e `beta = atan(H/V)`.

Il metodo USACE applica i fattori delle tabelle 5-3 e 5-4 insieme ai fattori
di forma. I fattori sono limitati inferiormente a zero quando il rapporto di
carico esce dal dominio utile della formula.

Per il ramo FHWA, i fattori di inclinazione sono posti uguali a uno quando si
usano i fattori di forma, seguendo la raccomandazione FHWA richiamata dal
paragrafo USACE 5-5f(3). La domanda orizzontale viene comunque verificata nello
scorrimento. La politica applicata e salvata in
`factors.inclination.policy`.

### 6.4 Selezione della capacita

`bearingSelection` puo valere:

- `minimum`, default;
- `mean`;
- `usace-meyerhof-2025`;
- `fhwa-vesic-2002`.

Il risultato conserva sempre:

- `methodCapacities`;
- `meanUltimateGrossBearingPressure`;
- `methodAbsoluteSpread`;
- `methodRelativeSpreadToMean`;
- meccanismo governante separato per ciascun metodo.

## 7. Pressione equivalente, falda e sovraccarico

La domanda e:

```text
qeq = V / A' - uD
```

oppure `V/B' - uD` per il nastriforme. Il termine `uD` e la pressione
interstiziale locale alla base.

La tensione geostatica e integrata strato per strato tra superficie e base:

- `unitWeight.bulk` sopra la superficie d'acqua;
- `unitWeight.saturated` sotto la superficie d'acqua;
- sovraccarico uniforme `surfaceSurcharge` aggiunto alla superficie;
- pressione interstiziale sottratta solo nel ramo drenato.

Sono ammessi:

- falda del `GroundProfile`;
- `PorePressureField2D` `none`;
- `hydrostatic-horizontal`;
- `phreatic-line`, valutata alla coordinata `placement.x`.

Una `assigned-grid` puo descrivere pressione ma non identifica in modo
univoco quali pesi di volume totali usare nella zona di rottura. Il metodo
restituisce quindi `not-supported`, anziche inferire saturazione o gradiente di
filtrazione.

Il peso efficace nel termine `Ngamma` usa le correzioni USACE 5-19 e FHWA
5-20. Il peso di volume saturo e obbligatorio se l'acqua interseca la zona di
influenza.

Se `qeq <= 0`, il problema e governato dal sollevamento e il solver ULS
corrente restituisce `not-supported`.

## 8. Stratigrafia e punch-through

Il `GroundProfile` deve estendersi almeno:

- `2 B'` sotto la base per fondazioni isolate;
- `4 B'` sotto la base per fondazioni nastriformi.

Il meccanismo di base usa il set di parametri selezionato per lo strato
immediatamente sotto la fondazione. Limiti interni che mantengono lo stesso
materiale e lo stesso set di parametri sono trattati come continuita dello
stesso mezzo.

Per una fondazione rettangolare o nastriforme e implementato il controllo
USACE 5-17/5-18 quando:

- lo strato superiore e resistente;
- lo strato inferiore usa parametri non drenati;
- il tetto dello strato debole ricade fra `0.5 B'` e `2 B'` per una fondazione
  isolata, oppure fra `B'` e `4 B'` per una nastriforme;
- la diffusione e `2V:1H`.

Per ogni strato debole candidato sono calcolate entrambe le capacita e il
fattore di diffusione. Il minimo fra rottura nello strato di base e
punch-through governa separatamente per USACE e FHWA.

Una discontinuita drenata dentro la profondita tipica `B'`, uno strato debole
troppo vicino alla base o il punch-through di una fondazione circolare
producono `not-supported`. Una discontinuita drenata piu profonda ma dentro la
massima profondita di ricerca produce un warning e non viene presentata come
meccanismo verificato.

Questa regola e intenzionalmente limitata: non e un modello multistrato
generale e non sostituisce analisi numeriche o metodi specifici per strati
rigidi/deboli complessi.

## 9. Scorrimento alla base

Lo scorrimento e opzionale e richiede un `SoilStructureInterface`.

In condizioni drenate, senza forze attive/passive laterali:

```text
R = (N - U) tan(delta') + (ca/c') c' A
```

In condizioni non drenate:

```text
R = (ca/su) su A
```

`delta'` deriva dal set di interfaccia e viene limitato all'angolo di attrito
del terreno dal contratto comune. I rapporti `drainedAdhesionRatio` e
`undrainedAdhesionRatio` sono sempre espliciti e compresi fra zero e uno. Non
sono dedotti dal materiale della fondazione.

Il catalogo delle superfici puo proporre valori indicativi in funzione di
materiale e finitura della superficie; tali valori conservano `basis:
"indicative"` e generano un warning. I dati di prova o di progetto possono
essere inseriti manualmente in un set `representative`, `characteristic` o
`design`.

Se il risultante esce dal nocciolo senza trazione, lo scorrimento non usa una
area di adesione presunta: resta `not-analyzed` finche una analisi di contatto
non determina l'area effettivamente compressa.

La spinta passiva del terreno davanti al plinto non e sommata. Il manuale
USACE richiede resistenze sviluppate e un equilibrio attivo/passivo coerente;
questo sara un workflow esplicito, riusando il kernel delle spinte, non un
coefficiente implicito nello scorrimento di base.

## 10. Cedimento immediato e rotazione SLS

Lo schema di output SLS e `shallow-foundation-sls-result/v1`. L'analisi
richiede `limitState: "SLS"`, un metodo esplicito e una situazione statica non
`long-term`. Tutte le tensioni e deformazioni sono ricondotte alla quota della
base; la pressione netta sottrae sia la tensione geostatica efficace sia la
pressione interstiziale dalla pressione lorda della fondazione.

Il parametro `preexistingSurfaceSurcharge` rappresenta un carico gia presente
prima della costruzione della fondazione. Non coincide con il carico della
fondazione e non va duplicato nello stato di azione.

### 10.1 Incremento di tensione verticale

Il metodo a modulo vincolato usa le approssimazioni di Boussinesq delle
equazioni USACE 6-8--6-11 per cerchio, quadrato, rettangolo e nastro. A ogni
quota `z`:

```text
Delta sigma_v(z) = Iz(z) qnet
Delta epsilon_v(z) = Delta sigma_v(z) / M(z)
s = integral(Delta epsilon_v dz)
```

La mesh verticale include sempre i contatti fra strati. Lo spessore massimo
iniziale e raffinato per dimezzamenti finche la variazione relativa del
cedimento soddisfa `convergenceTolerance`, oppure fino a
`maximumRefinements`. Un mancato raggiungimento della tolleranza genera un
check fallito e `not-verified`.

La profondita corrente e `2 B` per fondazioni isolate e `6 B` per il nastro.
Il profilo deve coprire l'intera profondita: il solver non prolunga l'ultimo
strato implicitamente.

### 10.2 Schmertmann da CPT

`usace-schmertmann-cpt-2025` implementa le equazioni USACE 7-16--7-26. Per
ogni strato usa `qc` assegnato e:

```text
Es = 2.5 qc                 fondazione quadrata/assialsimmetrica
Es = 3.5 qc                 limite di deformazione piana
Es = (2.5 + fL) qc          interpolazione rettangolare, 0 <= fL <= 1
s = C1 C2 integral(qnet Iz / Es dz)
```

La forma di `Iz`, la profondita del picco e la profondita di influenza sono
interpolate fra quadrato (`2 B`) e nastro (`4 B`) in funzione di `L/B`,
limitato a 10. `C1` e la correzione di incasso della fonte. `C2` e fissato a
1.0: l'output e quindi il solo cedimento immediato e non include creep.

L'Appendice C, esempio C-7, contiene una incongruenza aritmetica interna: i
contributi di strato mostrati danno `sum(Iz H / Es) ~= 0.0194 ft3/ton`, mentre
il totale stampato e `0.0266` e una delle righe mostra `0.008` dove il prodotto
dei valori di riga e `0.0008`. La validazione non forza il risultato stampato
di 1.5 in: applica le equazioni ai dati di riga pubblicati e ottiene 0.71627 in
per `C2=1`, conservando la discrepanza come nota di tracciabilita.

### 10.3 Integrazione con modulo vincolato

`usace-incremental-constrained-modulus-2025` applica l'equazione incrementale
USACE 7-10 alla stratigrafia. Accetta set `constrained-modulus` solo se
`settlementComponent: "immediate"`. Un modulo edometrico classificato come
`primary-consolidation` viene respinto con `not-supported`: usare la stessa
formula senza storia tensionale e tempo confonderebbe cedimento immediato e
consolidazione.

Il `testMethod` e conservato nel set, per esempio `dmt`, `oedometer` o una
designazione sito-specifica. Il kernel non converte automaticamente fra prove
diverse e non crea correlazioni non dichiarate.

### 10.4 Fondazione rigida elastica

`nist-pais-kausel-elastic-2012` implementa le rigidezze statiche di Pais e
Kausel riportate da NIST e FEMA per un rettangolo rigido su semispazio elastico
omogeneo. Nelle formule `B` e `L` sono le semidimensioni e `L >= B`:

```text
Kz  = G B/(1-nu) [3.1 (L/B)^0.75 + 1.6]
Kyy = G B^3/(1-nu) [3.73 (L/B)^2.4 + 0.27]
Kxx = G B^3/(1-nu) [3.2 (L/B) + 0.8]
```

Il ramo restituisce traslazione verticale, rotazioni con segno, spostamenti ai
quattro vertici e le tre rigidezze. Richiede:

- rettangolo isolato e contatto completo senza trazione;
- un unico set elastico equivalente nell'intera `elasticAveragingDepth`;
- modulo secante o compatibile con la deformazione di esercizio;
- risposta immediata.

Per default `embedmentContact: "surface-equivalent"` non applica i
moltiplicatori di incasso. `full-sidewall-contact` applica le tabelle NIST
2-2b solo quando il consumer dichiara esplicitamente che il contatto laterale
e mobilitabile. La scelta e registrata nell'output.

Queste rigidezze sono un ponte per un modello strutturale ridotto, non una
legge di contatto non lineare e non una soluzione di continuo stratificato.

### 10.5 Controlli e confronto fra fondazioni

`criteria.maximumSettlement` e `criteria.maximumRotation` sono facoltativi e
non hanno default normativi. Il confronto produce `demand`, `capacity`,
`utilizationRatio` e check serializzabili. La rotazione e disponibile soltanto
nel ramo rigido elastico; chiederne un limite con un metodo deformativo 1D
produce `not-supported`.

Ogni risultato espone un `movementState` alla mezzeria della base, con
cedimento positivo verso il basso, rotazione e unita. La funzione
`calculateShallowFoundationDifferentialMovement` combina due stati, converte
le rispettive unita, calcola:

```text
Delta s = s2 - s1
distorsione angolare = |Delta s| / distanza orizzontale
```

e applica solo i limiti esplicitamente assegnati. Il confronto non sostituisce
la valutazione della deformata della sovrastruttura fra i due appoggi.

### 10.6 Limiti SLS espliciti

Non sono inclusi consolidazione, creep, cedimenti sismici, liquefazione,
collasso volumetrico, rigonfiamento, rebound, filtrazione accoppiata, fondazioni
flessibili o interazione fra fondazioni vicine. Un
`PorePressureField2D` a griglia assegnata non identifica da solo il campo di
peso saturo necessario all'integrazione e resta `not-supported`.

Schmertmann e modulo vincolato restituiscono il cedimento della mezzeria di
un'area caricata equivalente flessibile. Non producono una rotazione da un
momento e non devono essere trasformati automaticamente in una distribuzione
di molle.

## 11. Risultato e status

Gli schemi di output sono `shallow-foundation-uls-result/v1` e
`shallow-foundation-sls-result/v1`.

Campi principali:

- `foundation`, `actionState`, `effectiveGeometry`;
- `stressAtBase`, `groundwater`;
- `bearing.demand`, `bearing.capacity`, `bearing.utilizationRatio`;
- `bearing.factorOfSafety`;
- `bearing.baseMechanism`, `punchThroughCandidates` e
  `governingByMethod`;
- `sliding`;
- `checks`;
- `demand`, `capacity`, `utilizationRatio` aggregati;
- `structuralCoupling`;
- `warnings`, `assumptions`, `metadata` e riferimenti.

Per SLS si aggiungono `settlement`, `rotation`, `cornerMovements`,
`methodResult`, `movementState` e la rigidezza statica quando giustificata dal
metodo elastico.

Gli status hanno questo significato:

| Status | Significato |
| --- | --- |
| `ok` | calcolo completato e nessun check esplicito fallito. |
| `not-verified` | calcolo completato, ma nocciolo o criterio esplicito non verificato. |
| `not-supported` | il caso richiede un modello fuori dal perimetro dichiarato. |
| `failed` | input incoerente o errore di calcolo; il messaggio e in `warnings`. |

I criteri `minimumBearingFactorOfSafety` e
`minimumSlidingFactorOfSafety` sono facoltativi e assegnati dal consumer. Il
kernel non inserisce valori normativi predefiniti.

## 12. Interazione con la struttura

Il livello implementato e il trasferimento unidirezionale:

```text
azioni strutturali alla base
  -> ShallowFoundationActionState
  -> capacita geotecniche ultime oppure movimenti immediati SLS
  -> adapter normativo
  -> resistenze di progetto assegnate al verificatore strutturale
```

`outputs.structuralCoupling` conserva:

- identificativi di fondazione e stato di azione;
- punto di riferimento della risultante;
- resistenza ultima a pressione e scorrimento;
- `designConversion.status: "required"`.

Nel risultato SLS conserva inoltre il `movementState`, le rigidezze statiche
solo quando derivano dal ramo rigido elastico, il tipo di contatto assunto e
il limite di impiego FEM.

Il verificatore strutturale del plinto non importa questa applicazione. Un
orchestratore consumer:

1. raccoglie le azioni della sovrastruttura;
2. aggiunge una sola volta peso della fondazione e carichi permanenti
   applicabili;
3. costruisce lo stato di azione geotecnico;
4. applica l'adapter normativo per ottenere resistenze di progetto;
5. assegna tali resistenze alla verifica strutturale;
6. conserva entrambi i risultati e i warning.

La distribuzione rigida di contatto resta affidata al contratto comune
`RectangularFootingContactAnalysis`; non e duplicata nella capacita portante.

## 13. Ponte al FEM

I DTO introdotti sono riusabili nel modello FEM senza fingere che il terreno
sia gia un continuo non lineare:

- `placement` identifica la superficie di interfaccia;
- geometria e assi definiscono la footprint;
- `actionState` e la risultante di controllo dell'equilibrio globale;
- la capacita ULS e un benchmark indipendente per un'analisi FEM;
- il `movementState` riporta cedimento e rotazione alla sovrastruttura;
- il ramo Pais-Kausel fornisce rigidezze diagonali traslazione-rocking
  iniziali per modelli globali ridotti, con ipotesi e provenienza;
- `SoilStructureInterface` porta materiale, finitura, attrito e provenienza;
- `GroundModel` e `PorePressureField2D` restano la sorgente unica di
  stratigrafia e pressione interstiziale.

Progressione prevista:

1. assemblaggio esplicito delle rigidezze rigide nel FEM globale e ritorno dei
   movimenti;
2. distribuzione rigida di contatto e confronto con la pressione equivalente;
3. molle distribuite o contatto monolatero calibrati con un modello dedicato;
4. piastra su suolo e iterazione azioni-cedimenti;
5. elementi di interfaccia nel continuo geotecnico;
6. confronto tra capacita ULS chiusa e riduzione della resistenza FEM.

Una capacita portante non viene trasformata automaticamente in rigidezza di
molla.

## 14. Incrementi ancora necessari

### 14.1 Consolidazione

Richiede un incremento autonomo con storia tensionale, preconsolidazione,
compressibilita, permeabilita, condizioni di drenaggio e tempo. Non viene
presentato come parte del cedimento immediato.

### 14.2 Adapter normativi

Gli adapter NTC/Eurocodice dovranno:

- selezionare basi dei parametri e coefficienti;
- trasformare le azioni e le resistenze;
- dichiarare approccio e combinazione;
- restituire il percorso decisionale e la fonte;
- produrre la resistenza di progetto consumabile dalla verifica strutturale.

### 14.3 Generalizzazioni geometriche e di carico

Restano separati base o piano campagna inclinati, sisma, passiva davanti al
plinto, uplift, fondazioni flessibili e interazione di gruppo. La loro
introduzione richiedera nuovi riferimenti e benchmark, non opzioni aggiunte ai
metodi correnti senza controllo.

## 15. Validazione

La campagna
`validation/geotechnicalShallowFoundationValidationCampaign.js` contiene:

1. esempio USACE B-3, sabbia su argilla debole, incluse le due capacita, la
   pressione equivalente e il fattore `2V:1H`;
2. esempio USACE B-4 non drenato;
3. ricalcolo indipendente dell'area efficace circolare;
4. equilibrio indipendente dello scorrimento drenato con attrito e adesione.

La campagna SLS
`validation/geotechnicalShallowFoundationServiceabilityValidationCampaign.js`
aggiunge:

1. fattore di influenza delle tensioni della tabella C-7;
2. percorso di equazioni Schmertmann sui dati pubblicati C-7, con la
   discrepanza del totale stampato esplicitamente esclusa dal target;
3. tre rigidezze Pais-Kausel ricalcolate indipendentemente;
4. geometria del cedimento differenziale e della distorsione angolare.

I test unitari aggiungono conversione delle unita, DTO, rettangolo/nastro/
cerchio, inclinazione del carico, falda non supportata a griglia, interfaccia e
serializzazione dell'applicazione.

La campagna e inclusa in `npm run validation` e l'intero modulo deve superare
`npm run check` prima della consegna.
