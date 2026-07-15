# Metodo per piastre in calcestruzzo armato

## Campo di applicazione

`reinforced-concrete-plates` verifica localmente una piastra piana in c.a.
mediante due strisce ortogonali convenzionali larghe 1.000 mm. Le risultanti
ammesse sono `Mxx`, `Myy`, `Mxy`, `Qx`, `Qy`; le azioni membranali sono nulle:

```text
Nxx = Nyy = Nxy = 0
```

Il modulo è indipendente dalla UI e dalla sorgente delle azioni. Può ricevere
risultanti correlate di una singola combinazione o un array `analysis.states`;
non crea inviluppi indipendenti delle componenti.

Sono esclusi pressoflessione, shell generali, punzonamento, precompressione,
armature non ortogonali, direzioni diverse tra le facce, integrazione delle
curvature, abbassamenti diretti, analisi globale fessurata, redistribuzione,
modelli non lineari a strati e adapter verso software FEM specifici.

## Unità

L'input dichiara `{ force, length }`. Il modello normalizza in `N` e `mm`.

- `thickness`, `diameter`, `clearCover`, `spanX`, `spanY`: lunghezze;
- `Mxx`, `Myy`, `Mxy`: momento per unità di larghezza, internamente
  `N mm/mm` (numericamente `N`);
- `Qx`, `Qy`: taglio per unità di larghezza, internamente `N/mm`;
- i momenti e i tagli passati ai kernel sezionali sono moltiplicati per
  `unitWidth = 1000 mm`.

Con input `{ force: "kN", length: "m" }`, un valore `Mxx = 10` rappresenta
`10 kN m/m`, mentre `Qx = 20` rappresenta `20 kN/m`.

## Armature e geometria

Per ogni combinazione faccia-direzione:

```text
As = n pi phi^2 / 4
s  = 1000 / n
```

`clearCover` è il copriferro netto fino alla superficie della barra. La quota
dell'asse, con `y = 0` all'intradosso, è:

```text
y_bottom = clearCover + phi/2
y_top    = h - clearCover - phi/2
```

Il modello rifiuta valori non positivi, barre esterne allo spessore e strati
ortogonali della stessa faccia che si sovrappongono. Non corregge i copriferri.
Nel solver ciascun layer è rappresentato da una sola area concentrata
equivalente, pari esattamente ad `As`, posta alla quota reale dell'asse delle
barre e al centro della larghezza unitaria. Non è una barra fisica: è il
risultante sezionale dell'intero layer. Diametro, numero di barre e interasse
restano proprietà esplicite del gruppo; l'interasse è usato direttamente dal
controllo indiretto della fessurazione e rimane disponibile ai consumer per la
rappresentazione grafica.

L'armatura a taglio unidirezionale è opzionale e usa il contratto:

```js
reinforcement: {
  shear: {
    diameter,
    spacingX,
    spacingY
  }
}
```

La presenza del blocco dichiara una maglia regolare di S verticali, con un
ramo efficace per elemento e ancoraggio efficace alle armature longitudinali
superiori e inferiori. Il modello deriva area della singola S, numero per metro
quadrato e `Asw/s` della striscia unitaria. Il dettaglio geometrico dei ganci e
la lunghezza di ancoraggio non sono ricostruiti dai tre input e restano
un'assunzione dichiarata.

## Assi e segni

La piastra giace nel piano `X-Y`; la normale positiva è `+Z`. L'angolo comune
delle armature è espresso in gradi e cresce in senso antiorario da `+X`
sorgente a `+X` dell'armatura, osservando dalla normale `+Z`.

Il tensore è simmetrico, `Mxy = Myx`. Il segno positivo di `Mxy` è quello della
componente fuori diagonale del tensore espresso nella base destrorsa `X-Y-Z`.
Il momento diretto positivo è inflessione sagomante e tende l'intradosso; il
momento negativo tende l'estradosso.

Con:

```text
R = [ cos(a) -sin(a) ]
    [ sin(a)  cos(a) ]
```

le trasformazioni sono:

```text
M' = R^T M R
Q' = R^T Q
```

Traccia e determinante di `M`, e norma di `Q`, sono invarianti testati.

## Inviluppo Wood-Armer adottato

Wood-Armer è applicato dopo la rotazione. Il modulo usa un inviluppo
conservativo per maglia ortogonale:

```text
bottom-x = max(0, Mxx' + |Mxy'|)
bottom-y = max(0, Myy' + |Mxy'|)
top-x    = min(0, Mxx' - |Mxy'|)
top-y    = min(0, Myy' - |Mxy'|)
```

La torsione pura genera quindi domanda in entrambe le direzioni e su entrambe
le facce. Non sono implementate varianti ottimizzate che ridistribuiscono la
domanda tra X e Y. Il risultato conserva azioni originarie, angolo, azioni
ruotate, invarianti, quattro momenti equivalenti, faccia e direzione.

Riferimenti metodologici:

- R. H. Wood, *The reinforcement of slabs in accordance with a pre-determined
  field of moments*, Building Research Station, Current Paper CP44/68, 1968
  ([scheda BRE](https://bregroup.com/store/bookshop/the-reinforcement-of-slabs-in-accordance-with-the-pre-determined-field-of-moments.));
- G. S. T. Armer, corrispondenza sul metodo, *Concrete*, 1968, pp. 69-76;
- ACI 447R-18, *Design Guide for Twisting Moments in Slabs*, sezioni 3.5, 3.8
  e 4.2, come inquadramento successivo del metodo e dei suoi limiti
  ([scheda ACI](https://www.concrete.org/store/productdetail.aspx?itemid=44718)).

## SLU flessione e taglio

Ogni momento Wood-Armer alimenta una sezione rettangolare `1000 x h` con le
sole armature X oppure Y. Poiché ogni verifica è a flessione retta, il
discretizzatore usa il metodo `uniaxial-strips`: rettangoli distribuiti solo
lungo l'altezza, ciascuno largo 1.000 mm. Il default è 40 strisce; può essere
aumentato con `analysis.mesh.targetFiberCount`. La griglia bidimensionale resta
il default dei moduli sezionali generali e non viene modificata.

La verifica usa `ReinforcedConcreteSectionVerification` con `NEd = 0` e riceve
per ogni layer l'area totale e la quota reale. Sono restituiti domanda,
resistenza firmata, utilizzo, asse neutro, campo di deformazione, estremi
ultimi, armatura governante ed esito.

`Q'` alimenta due sole verifiche indipendenti, X e Y, con `bw = 1000 mm`,
altezza utile e area longitudinale della faccia tesa. Senza `reinforcement.shear`
il modulo usa il ramo NTC 2018 4.1.2.3.5.1. Con la maglia di S richiama invece
il traliccio a inclinazione variabile NTC 2018 4.1.2.3.5.2 già implementato dal
`ReinforcedConcreteShearVerification`.

Per X, `spacingX` è il passo lungo la striscia e `spacingY` distribuisce le S
sulla larghezza; per Y i ruoli si scambiano. In entrambe le direzioni:

```text
A_link = pi diameter^2 / 4
Asw/s  = 1000 A_link / (spacingX spacingY)
```

Il risultato conserva `VRsd`, `VRcd`, la resistenza del traliccio, la
resistenza senza armatura trasversale e seleziona la maggiore delle ultime due,
come il verificatore per travi. Espone inoltre, per ciascuna direzione,
`longitudinalSpacing`, `transverseSpacing` ed `effectiveLinksAcrossUnitWidth`,
cosi che il consumer non debba ricostruire la discretizzazione equivalente.
Se la faccia è ambigua o il momento è nullo,
entrambe le facce vengono verificate e governa la resistenza minore. Controlli
geometrici di ganci, ancoraggi, armatura minima e limiti di passo non sono
dedotti dai tre input e sono dichiarati nei warning del risultato.

La stessa maglia è verificata indipendentemente per `Qx'` e `Qy'`; non viene
introdotta un'interazione vettoriale o un terzo controllo sul risultante.
`Qres` e il suo angolo restano esclusivamente diagnostici. Il punzonamento è
fuori campo e appartiene a un verificatore distinto.

## SLE tensioni e fessurazione

`SLS_STRESS_CRACKING` accetta combinazioni `SLE_RARE`/caratteristica,
`SLE_FREQUENT` e `SLE_QUASI_PERMANENT`. Tipi mancanti o incompatibili producono
`not-supported` e nessun limite normativo viene applicato.

Ogni striscia equivalente richiama
`ReinforcedConcreteServiceabilityVerification` con `N = 0`. Restano quindi
uniche le implementazioni delle tensioni nel calcestruzzo, nell'acciaio e del
controllo indiretto della fessurazione. I risultati sono descritti come
"tensione nella striscia equivalente Wood-Armer", non come tensione fisica
esatta nel punto della piastra.

Il percorso SLE risolve soltanto le due incognite coerenti con la flessione
retta (`eps0`, `kappaZ`), imponendo `kappaY = 0`. Il solutore biassiale
preesistente resta il default per le sezioni generiche; la riduzione uniaxiale
è attivata esclusivamente dalla discretizzazione `uniaxial-strips`.

Quando `|Mxy'|` non è inferiore al massimo tra `|Mxx'|` e `|Myy'|`, o in
torsione pura, viene emesso un warning informativo di possibile conservatività.
Questa soglia è diagnostica e non è un limite normativo.

## Controllo semplificato di deformabilità

`SLS_SIMPLIFIED_DEFLECTION` esegue soltanto il controllo separato `L/h` in X e
Y tramite la primitiva già usata da `rc-cracked-deflection`. Lo schema è
fissato internamente a `flat_slab`; non è un input. La primitiva usa lo
spessore totale `h`, non l'altezza utile `d`.

Il livello di sollecitazione è derivato dal rapporto geometrico di armatura.
Per ogni faccia e direzione:

```text
rho(face,direction) = As / (1000 d)
```

Ogni faccia conserva il proprio momento Wood-Armer correlato. Il limite `L/h`
della faccia è 24 per `rho <= 0,5%`, 17 per `rho >= 1,5%` e varia linearmente
nell'intervallo:

```text
lambdaLim(face) = 24 + (rho(face) - 0,005) / (0,015 - 0,005) * (17 - 24)
```

Per ciascuna direzione governa il limite inferiore tra estradosso e
intradosso. X e Y restano indipendenti: non viene formato un massimo globale
dei rapporti di armatura. Il momento Wood-Armer è conservato come informazione
correlata della faccia ma non modifica l'interpolazione, che dipende da `rho`.
Il risultato si chiama "Controllo semplificato di deformabilità mediante
snellezza". Non sono calcolate deformata, freccia, curvatura o rigidezza
fessurata.

## Esempio

Eseguire:

```bash
npm run example:rc-plates
```

Il consumer importa dal package root o da
`strutture-js/applications/reinforced-concrete-plates`; i deep import non sono
API pubbliche.
