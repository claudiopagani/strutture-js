# Convenzioni di segno per le sezioni in calcestruzzo armato

## Assi e momenti

La sezione giace nel piano `y-z`:

- `z` positivo verso destra;
- `y` positivo verso l'alto;
- `x` longitudinale alla trave, positivo entrante nel piano del foglio quando
  la sezione e vista frontalmente.

Per una forza longitudinale `F` applicata in `(y, z)`, rispetto al punto di riferimento della sezione:

```txt
Mzz = -F * y
Myy =  F * z
```

I nomi storici dell'API restano invariati:

```txt
Mx / MxRd = Mzz
My / MyRd = Myy
```

Di conseguenza `mxEd` deve essere confrontato direttamente con `MxRd` e
`myEd` direttamente con `MyRd`, senza negazioni nei wrapper.

## Orientamento theta

`theta` descrive l'orientamento dell'asse neutro:

- `theta = 0`: asse neutro parallelo a `+z`;
- `theta > 0`: rotazione antioraria da `+z` verso `+y`;
- `theta = pi/2`: asse neutro parallelo a `+y`;
- `theta` e `theta + 2 pi` sono equivalenti.

La coordinata normale usata dai solver e:

```txt
p(y, z, theta) = y cos(theta) - z sin(theta)
```

Con `sideSign = +1` per `compressedSide = "positive"` e `-1` per
`"negative"`:

```txt
kappaY = sideSign * kappa * sin(theta)
kappaZ = sideSign * kappa * cos(theta)
epsilon = epsilon0 + kappaY * z - kappaZ * y
        = epsilon0 - sideSign * kappa * p
```

Quindi:

- compressione sul bordo `y` positivo a `theta = 0` produce `Mx > 0`;
- compressione sul bordo `z` negativo a `theta = pi/2` produce `My > 0`;
- invertire `compressedSide` inverte il verso della curvatura e del momento.

## Nota di migrazione

Questa modifica e potenzialmente breaking.

- `RCSectionStateIntegrator.state.Mx` e i contributi `fiber.mx`/`bar.mx`
  cambiano segno: ora applicano direttamente `-F * deltaY`.
- `RCUltimateSectionSolver.solveAtAxialLoad()` cambia orientamento angolare e
  segni rispetto alla vecchia convenzione. A `theta = 0`, la compressione sul
  lato positivo restituisce ora `MxRd > 0`.
- `solveUniaxialAtAxialLoad()` non nega piu `MxRd`; a parita di problema
  uniaxiale il risultato pubblico resta coerente con il segno ingegneristico
  precedente, ma ora coincide anche con `state.Mx`.
- `RCMomentCurvatureAnalyzer` non nega piu `state.Mx` e accetta
  `theta`/`compressedSide`. `compressedEdge` resta l'alias uniaxiale
  `top -> positive`, `bottom -> negative`; negli output orientati con
  `theta != 0`, `compressedEdge` e `null` e il lato e descritto da
  `compressedSide`.
- I wrapper SLE e le verifiche non negano piu `mxEd` o `myEd`. Il cambiamento
  piu visibile riguarda stati biassiali con `myEd`, che prima potevano essere
  risolti sul lato opposto.
- Il dominio biassiale percorso con `theta` crescente passa da `+Mx` a `+My`
  nel primo quadrante.

I nomi `Mx` e `My` sono ambigui perche non coincidono con i nomi degli assi
geometrici dichiarati. Non vengono rinominati in questa versione per evitare
un'ulteriore rottura dell'API; nuovi consumer dovrebbero trattarli
esplicitamente come alias di `Mzz` e `Myy`.

Non rientrano in questa modifica:

- l'applicazione SCA che consuma la libreria;
- `theta` della verifica a taglio, che indica l'inclinazione del puntone e non
  l'orientamento dell'asse neutro;
- la nomenclatura FEM `mY`/`mZ` e la convenzione `sectionRotation`, che restano
  contratti separati. Nel provider per travi in c.a. la proiezione resta
  `mY -> mxEd` e `mZ -> myEd`.
