# Fondazioni profonde — capacità assiale del palo singolo

## Stato e perimetro

`geotechnical-deep-foundations` implementa il primo incremento della capacità
verticale delle fondazioni profonde. Il modulo calcola la resistenza geotecnica
assiale statica di un singolo palo verticale, a geometria costante, collegato a
un `GroundModel` stratificato.

Sono disponibili:

- palo, micropalo o elemento profondo generico;
- sezione circolare o proprietà geometriche equivalenti assegnate;
- tecnologia costruttiva e classe di spostamento dichiarate nel modello;
- resistenza di fusto calcolata separatamente per ogni strato;
- metodo `alpha-undrained` in tensioni totali;
- metodo `effective-stress` con `beta` assegnato oppure con
  `beta = K tan(delta)`;
- resistenza unitaria di fusto assegnata;
- resistenza di base `undrained-nc`, `effective-stress-nq` o assegnata;
- compressione e trazione come scenari distinti;
- falda idrostatica letta dal `GroundProfile`;
- limiti espliciti di tensione efficace o resistenza unitaria;
- conversione facoltativa della capacità ultima mediante divisori espliciti;
- risultato serializzabile, tracciato per strato e predisposto allo scambio con
  i moduli strutturali.

Non sono implementati: cedimento, curve carico-cedimento, leggi `t-z`/`q-z`,
attrito negativo, gruppi, ripartizione del carico nel plinto, pali inclinati,
carico ciclico, effetti di installazione dipendenti dal tempo, capacità assiale
sismica e verifica strutturale della sezione del palo.

## Fonte e campo di validità

La formulazione di riferimento è [USACE EM 1110-2-2906, Design of Pile
Foundations](https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-2906.pdf),
paragrafo 4-3a.

Il manuale separa la capacità ultima in resistenza di fusto e di punta:

```text
Qult = Qs + Qb
Qs   = somma_i(fs,i As,i)
Qb   = qb Ab
```

Per terreni granulari la fonte esprime la resistenza unitaria di fusto come
`fs = K sigma'_v tan(delta)` e quella di punta come `qb = Nq sigma'_v`;
per terreni coesivi non drenati usa `fs = alpha su` e `qb = Nc su`, con
`Nc = 9` nella specifica procedura USACE. Nel kernel `alpha`, `K`, `delta`,
`beta`, `Nq` e `Nc` non hanno valori predefiniti: devono essere assegnati dal
metodo di progetto, dall'adapter normativo o dalla caratterizzazione adottata.

Questa scelta evita di applicare coefficienti di una tecnologia di palo a
un'altra. Il `DeepFoundationModel` conserva infatti la tecnologia costruttiva,
ma il kernel non trasforma automaticamente tale descrizione in coefficienti.

La fonte avverte inoltre che, in una stratigrafia, i picchi di resistenza dei
diversi materiali potrebbero non mobilitarsi simultaneamente. Il risultato
somma i contributi assegnati strato per strato e riporta esplicitamente questa
ipotesi; non simula la compatibilità deformativa.

## Unità e coordinate

Ogni costruttore richiede `units: { force, length }`. I dati vengono convertiti
nelle unità interne geotecniche:

- forza: `kN`;
- lunghezza: `m`;
- tensione e resistenza unitaria: `kN/m2`;
- peso di volume: `kN/m3`;
- angoli: radianti dopo la normalizzazione.

L'asse verticale è `z`, positivo verso l'alto. Le azioni assiali sono sempre
memorizzate come magnitudini non negative; `direction` distingue
`compression` e `tension`.

## Contratti del dominio

### `DeepFoundationModel`

Il modello contiene ciò che non cambia tra gli scenari di calcolo:

- `elementType`: `pile`, `micropile` o `deep-foundation-element`;
- `geometry.model`:
  - `circular`, con `diameter`;
  - `assigned-section`, con `equivalentDiameter`, `shaftPerimeter` e
    `baseArea`;
- `placement`: posizione planimetrica, quota della testa, quota di inizio del
  contatto col terreno e quota della punta;
- `construction`: metodo di installazione, materiale strutturale, classe di
  spostamento e condizione della base.

`soilContactTopElevation` è distinto da `headElevation`: un tratto di palo può
trovarsi sopra il terreno o dentro un plinto senza produrre resistenza di
fusto.

La prima versione assume perimetro e area di base costanti. Una variazione di
sezione richiederà un futuro modello segmentato, non una media implicita.

### `AxialPileLoadScenario`

Lo scenario contiene:

- direzione del carico;
- azione facoltativa alla testa;
- sovraccarico uniforme alla superficie;
- un metodo di fusto esplicito per ogni strato attraversato;
- metodo e strato portante della punta, in compressione;
- eventuale conversione della resistenza ultima.

Ogni definizione di resistenza richiede `provenance.source`. L'identificativo
dello strato è la chiave di `shaftResistanceByLayer`: se manca il metodo per
uno strato realmente attraversato, l'analisi fallisce invece di interpolare o
riutilizzare un coefficiente in modo tacito.

In compressione `baseResistance.bearingLayerId` è obbligatorio. Se la punta
cade esattamente su un'interfaccia, deve essere selezionato esplicitamente lo
strato inferiore. In trazione `baseResistance` deve essere omesso.

## Metodi di fusto

### `alpha-undrained`

```text
fs = min(alpha su, fs,max)
Qs,i = fs As,i
```

Il metodo richiede un set di parametri `total-stress-undrained` e legge `su`
dal `GeotechnicalDesignSituation`. `adhesionFactor` è sempre assegnato. Il
limite `maximumUnitResistance` è facoltativo e, se presente, usa unità di
tensione.

### `effective-stress`

```text
fs(z) = beta sigma'_v(z)
beta  = valore assegnato
```

oppure:

```text
beta = K tan(delta)
```

Il secondo caso richiede `lateralEarthPressureCoefficient`,
`interfaceFrictionAngle` e `angleUnits`. Non viene dedotto `delta` dal solo
materiale del palo: correlazioni e valori tabellati dipendono dalla tecnologia,
dalla superficie e dal metodo selezionato e appartengono a un adapter
tracciabile.

L'integrale di `sigma'_v` è eseguito sui tratti delimitati da strati e falda.
Poiché peso di volume e pressione idrostatica sono lineari in ciascun tratto,
l'integrazione è esatta per il modello `GroundProfile`. Sono disponibili due
limiti facoltativi:

- `maximumEffectiveVerticalStress`, applicato prima di moltiplicare per
  `beta`;
- `maximumUnitResistance`, applicato a `fs`.

Questi limiti consentono a un adapter di rappresentare una profondità critica
o un limite di resistenza senza imporre al kernel una correlazione unica.

### `assigned-unit-resistance`

`assignedUnitResistance` viene moltiplicata per l'area laterale dello strato.
È il ramo appropriato quando il metodo esterno restituisce direttamente una
resistenza unitaria, purché la provenienza sia dichiarata.

## Metodi di base

### `undrained-nc`

```text
qb = min(Nc su, qb,max)
Qb = qb Ab
```

Richiede un set `total-stress-undrained`. Il valore `9` citato nella procedura
USACE non è un default software: se quel metodo è adottato, l'utente o
l'adapter deve passare `bearingCapacityFactor: 9`.

### `effective-stress-nq`

```text
qb = min(Nq min(sigma'_v,toe, sigma'v,max), qb,max)
Qb = qb Ab
```

Richiede un set `mohr-coulomb-effective`. `Nq` e gli eventuali limiti devono
essere espliciti.

### `assigned-unit-resistance`

Consente di usare una resistenza unitaria di punta già determinata da una
procedura esterna, una prova o un adapter.

## Stratigrafia vicina alla punta

USACE segnala che strati deboli o dissimili vicini alla punta possono
modificare la capacità di base. Il kernel esegue uno screening geometrico entro
la maggiore tra `1.524 m` e otto diametri equivalenti e restituisce
`toeLayerBoundaryAssessment`.

Lo screening non riduce automaticamente `Qb`, perché stabilire quale strato sia
debole, come si propaghi il meccanismo e quale regola applicare dipende dal
metodo. Se una frontiera cade nella zona, il risultato è `review-required` e
viene emesso un warning; il coefficiente o la resistenza assegnata deve già
riflettere la valutazione progettuale.

## Capacità, domanda e conversione

Senza `resistanceConversion`, il modulo restituisce soltanto
`calculatedUltimateResistance`. Non la denomina resistenza di progetto e non
esegue una verifica normativa.

La conversione attuale è esplicita:

```text
Rd = (Qs / shaftDivisor + Qb / baseDivisor) / overallDivisor
```

In trazione `Qb = 0` e `baseDivisor` non è richiesto. I divisori non hanno
default normativi e richiedono una provenienza. Se sono presenti sia l'azione
alla testa sia la conversione, il modulo produce:

- `demand`;
- `capacity`;
- `utilizationRatio`;
- `checks`;
- stato `ok` o `not-verified`.

Se l'azione è presente ma la conversione manca, viene riportato soltanto il
rapporto informativo rispetto alla capacità ultima; `verification.status`
resta `not-performed`.

Il peso proprio del palo non viene calcolato né aggiunto. Il campo
`action.includesPileSelfWeight` dichiara se l'orchestratore strutturale lo ha
già incluso.

## Interazione con struttura e FEM

`outputs.structuralCoupling.capacityMode` è il contratto immediatamente
utilizzabile dalla struttura:

- identificativo del palo;
- punto di riferimento dell'azione alla testa;
- direzione;
- capacità ultima calcolata;
- eventuale resistenza convertita.

La verifica strutturale del palo resta separata e deve usare le azioni interne,
la sezione e il materiale strutturale.

Il risultato prepara, ma non simula, il futuro modello completo:

```text
struttura / plinto
        |
  azione alla testa
        v
  asse strutturale del palo
        |
  t-z per ogni tratto  ---- GroundModel / stato tensionale iniziale
        |
  q-z alla punta
```

`responseMode.status` è pertanto `not-implemented`. Una futura implementazione
dovrà introdurre leggi `t-z` e `q-z` con fonte, campo di validità, variabili di
stato, tangente e regole di carico-scarico. I valori ultimi calcolati qui
potranno essere capacità limite delle curve, ma non sono di per sé rigidezze o
leggi costitutive.

## Esempio minimo

L'esempio completo è in
[`examples/geotechnical-deep-foundation.js`](../examples/geotechnical-deep-foundation.js).

```bash
npm run example:geotechnical-deep-foundation
```

## Validazione

La campagna `validation/geotechnicalDeepFoundationValidationCampaign.js`
contiene tre ricalcoli indipendenti:

1. palo drenato a due strati con falda, metodo `beta` e punta `Nq`;
2. palo non drenato in compressione con `alpha` e `Nc` espliciti;
3. palo non drenato in trazione, verificando che la punta non contribuisca.

I valori attesi sono calcolati con formule chiuse nella campagna e non
richiamano il kernel sottoposto a verifica.
