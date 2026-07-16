# Modelli tirante-puntone per regioni D

## Perimetro

Il modulo `reinforced-concrete-strut-and-tie` analizza e verifica un modello
tirante-puntone bidimensionale la cui topologia e assegnata esplicitamente. E
un kernel per regioni D e non un generatore automatico di schemi resistenti.

Il primo perimetro operativo comprende:

- nodi geometrici nel piano;
- puntoni di calcestruzzo e tiranti di armatura;
- carichi nodali e vincoli traslazionali;
- soluzione a traliccio lineare con aste incernierate;
- controllo del segno delle forze nelle aste;
- resistenza dei puntoni, dei tiranti e delle zone nodali secondo
  EN 1992-1-1:2004+A1:2014, paragrafo 6.5;
- parametri nazionali nodali espliciti;
- risultati e diagnostica serializzabili.

Il modulo e generico. Mensole tozze, travi parete, selle, plinti su pali e zone
di carico concentrato potranno riusarlo attraverso contratti di topologia
specifici e validati separatamente.

## Contratto statico

Ogni nodo possiede coordinate `x`, `y`. Ogni asta dichiara:

```js
{
  id: "C1",
  type: "strut", // oppure "tie"
  startNodeId: "A",
  endNodeId: "C",
  area: 100000,
  strengthModel: "transverse-tension"
}
```

L'area di un puntone e l'area efficace ortogonale al suo asse; quella di un
tirante e l'area efficace di armatura ancorata. Le rigidezze di analisi sono
ottenute da queste aree e dai moduli elastici dei materiali, salvo un modulo di
analisi esplicito per la singola asta.

Il solver usa due gradi di liberta traslazionali per nodo e piccole
deformazioni. La forza assiale e positiva a trazione. Un puntone trovato in
trazione o un tirante trovato in compressione genera una verifica non
soddisfatta: l'asta incompatibile non viene rimossa iterativamente.

Per un modello iperstatico, la distribuzione delle forze dipende dalle
rigidezze assiali assegnate. Il risultato espone
`forceDistributionDependsOnAxialRigidity` e un warning. La quantita
`staticIndeterminacy = members + restraints - 2 nodes` e solo un indicatore
topologico: stabilita e singolarita sono controllate anche dal sistema
numerico.

## Unita

L'input deve dichiarare `{ force, length }`. Il modello conserva internamente:

- forze in `N`;
- lunghezze in `mm`;
- aree in `mm2`;
- tensioni e moduli elastici in `N/mm2`.

## Puntoni e tiranti

Per i puntoni sono disponibili due modelli EN 1992:

```text
uncracked-uniaxial:  sigmaRd,max = fcd
transverse-tension: sigmaRd,max = 0.6 nu' fcd
nu' = 1 - fck / 250
```

Le espressioni corrispondono alle equazioni 6.55 e 6.56. Il secondo modello
deve essere selezionato quando le trazioni trasversali riducono la resistenza
del campo compresso. La selezione e responsabilita del modello e non viene
dedotta dalla sola topologia.

La resistenza del tirante e:

```text
Ft,Rd = As fyd
```

L'area `As` deve comprendere soltanto armatura efficacemente ancorata nel nodo.
Il modulo verifica la forza, ma non la lunghezza o la forma dell'ancoraggio.

## Zone nodali

Una zona nodale rappresenta una specifica faccia compressa, non soltanto il
punto geometrico del traliccio. Dichiara area, tipo e origine della forza:

```js
{
  id: "load-face",
  nodeId: "C",
  type: "cct",
  area: 45000,
  forceReference: {
    kind: "load",
    id: "P",
    normal: { x: 0, y: 1 }
  },
  factors: { k2: 1.0 }
}
```

Sono supportati riferimenti a un'asta, a un carico, a una reazione o a una
forza esplicita. Per carichi e reazioni la domanda e la proiezione assoluta
sulla normale dichiarata alla faccia.

Le resistenze seguono le equazioni 6.60-6.62:

```text
CCC: sigmaRd,max = k1 nu' fcd
CCT: sigmaRd,max = k2 nu' fcd
CTT: sigmaRd,max = k3 nu' fcd
```

I valori raccomandati EN 1992 sono `k1 = 1.0`, `k2 = 0.85` e `k3 = 0.75`.
Poiche sono parametri nazionali, il contratto consente di assegnarli sulla
singola zona e registra se il valore deriva dalla raccomandazione o da input
esplicito. L'esempio italiano ECP usato per la validazione assegna `k2 = 1.0`.

## Rapporto con NTC 2018

Il primo verificatore implementa direttamente EN 1992-1-1:2004+A1:2014. Le
NTC 2018 non forniscono nel capitolo 4 un corpus generale equivalente per ogni
tipo di regione D. L'uso del metodo in un progetto NTC deve quindi essere
inquadrato dal professionista secondo il capitolo 12, scegliendo una normativa
di comprovata validita e i parametri nazionali applicabili. Il modulo non
etichetta automaticamente come `NTC2018` una verifica Eurocodice.

## Limiti

Non sono ancora inclusi:

- generazione, ottimizzazione o scelta automatica della topologia;
- analisi non lineare con rimozione di aste incompatibili;
- modelli tridimensionali;
- ancoraggio, piegatura e distribuzione reale dei tiranti;
- forze di splitting dei puntoni a bottiglia e relativa armatura;
- armatura minima diffusa e controllo della fessurazione;
- interferenza geometrica tra puntoni, tiranti e contorno della regione D;
- verifica automatica che tutte le facce nodali necessarie siano state mappate;
- fatica, incendio e stati limite di esercizio.

Questi limiti sono restituiti nei warning. Un risultato `ok` vale soltanto per
la topologia, le aree e le facce esplicitamente dichiarate.

## Fonti e validazione

- EN 1992-1-1:2004+A1:2014, paragrafo 6.5, equazioni 6.55, 6.56 e
  6.60-6.62.
- European Concrete Platform,
  [EC2 Worked Examples, revisione A 31-03-2017](https://www.theconcreteinitiative.eu/images/ECP_Documents/Eurocode2_WorkedExamples.pdf),
  esempio 6.9, mensola tozza.
- European Commission JRC,
  [Eurocode 2: Background and Applications](https://publications.jrc.ec.europa.eu/repository/handle/JRC89037),
  raccolta ufficiale di esempi e supporto all'applicazione dell'Eurocodice.
- D.M. 17 gennaio 2018,
  [NTC 2018](https://www.gazzettaufficiale.it/eli/gu/2018/02/20/42/so/8/sg/pdf),
  capitolo 12 per i riferimenti tecnici di comprovata validita.

La campagna automatica ricostruisce il traliccio isostatico dell'esempio 6.9:
con `FEd = 700 kN`, eccentricita efficace `169 mm` e braccio `288 mm`, ottiene
circa `411 kN` nel tirante, `812 kN` nel puntone e residuo di equilibrio nullo.
