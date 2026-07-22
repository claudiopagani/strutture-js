# Azione del vento NTC 2018

Il modulo `strutture-js/norms/ntc2018` fornisce un kernel locale per la
pressione statica equivalente del vento. Gli input dipendenti dal sito e dalla
geometria restano espliciti; il modulo non effettua geolocalizzazione, non
riconosce automaticamente la forma dell'edificio e non usa servizi remoti.

## Fonte e campo di validita

L'implementazione segue il D.M. 17 gennaio 2018, NTC 2018, paragrafo 3.3:

- paragrafo 3.3.1, equazioni [3.3.1] e [3.3.1.b] e Tabella 3.3.I per `vb`;
- paragrafo 3.3.2, equazioni [3.3.2] e [3.3.3] per `vr` e `cr`;
- paragrafo 3.3.4, equazione [3.3.4] per la pressione normale;
- paragrafo 3.3.6, equazione [3.3.6] per la pressione cinetica `qr`;
- paragrafo 3.3.7, equazione [3.3.7] e Tabella 3.3.II per `ce`;
- paragrafi 3.3.8 e 3.3.9 per i coefficienti aerodinamico e dinamico.

Il testo ufficiale e pubblicato nel
[Supplemento ordinario n. 8 alla Gazzetta Ufficiale n. 42 del 20 febbraio 2018](https://www.gazzettaufficiale.it/eli/gu/2018/02/20/42/so/8/sg/pdf).

Le velocita sono espresse esplicitamente in `m/s`; pressioni e risultati sono
normalizzati nel sistema `{ force: "kN", length: "m" }`.

## Velocita base

`calculateNTC2018BaseWindSpeed` usa la zona e la quota del sito dichiarate dal
consumer. I parametri della Tabella 3.3.I sono:

| ID | `vb0` [m/s] | `a0` [m] | `ks` |
| --- | ---: | ---: | ---: |
| `ZONE_1` | 25 | 1000 | 0.40 |
| `ZONE_2` | 25 | 750 | 0.45 |
| `ZONE_3` | 27 | 500 | 0.37 |
| `ZONE_4` | 28 | 500 | 0.36 |
| `ZONE_5` | 28 | 750 | 0.40 |
| `ZONE_6` | 28 | 500 | 0.36 |
| `ZONE_7` | 28 | 1000 | 0.54 |
| `ZONE_8` | 30 | 1500 | 0.50 |
| `ZONE_9` | 31 | 500 | 0.32 |

Per `as <= a0` vale `ca = 1`; oltre `a0` e fino a 1500 m vale:

```text
ca = 1 + ks * (as / a0 - 1)
vb = vb0 * ca
```

La libreria non converte regioni, province o coordinate in una zona. La scelta
di `zone` e parte del contratto tecnico del consumer.

Sopra 1500 m la formula zonale non viene estrapolata. Il workflow restituisce
`not-supported` in assenza di un `baseWindSpeed` locale documentato. Il valore
esplicito deve essere in `m/s`, avere `baseWindSpeedSource` e non essere
inferiore al minimo zonale valutato a 1500 m.

## Periodo di ritorno e pressione cinetica

`calculateNTC2018WindReturnCoefficient` applica:

```text
cr = 0.75 * sqrt(1 - 0.2 * ln[-ln(1 - 1 / TR)])
vr = vb * cr
```

Per il valore ordinario `TR = 50 anni`, `cr` e assunto esattamente pari a uno.
Il contratto non accetta periodi inferiori a 5 anni, minimo indicato dalle NTC
per le fasi costruttive o transitorie brevi.
La pressione cinetica usa la densita convenzionale dell'aria
`rho = 1.25 kg/m^3`:

```text
qr = 0.5 * rho * vr^2
```

## Coefficiente di esposizione

Per altezze non superiori a 200 m,
`calculateNTC2018WindExposureCoefficient` applica:

```text
ce = kr^2 * ct * ln(z / z0) * [7 + ct * ln(z / z0)]
```

Se `z < zmin`, il valore viene calcolato a `zmin`.

| Categoria | `kr` | `z0` [m] | `zmin` [m] |
| --- | ---: | ---: | ---: |
| `I` | 0.17 | 0.01 | 2 |
| `II` | 0.19 | 0.05 | 4 |
| `III` | 0.20 | 0.10 | 5 |
| `IV` | 0.22 | 0.30 | 8 |
| `V` | 0.23 | 0.70 | 12 |

Il coefficiente topografico `ct` vale uno se non viene fornito un valore
diverso. Un valore diverso richiede `topographyCoefficientSource`. La
categoria di esposizione deve essere già determinata dal consumer; il kernel
non implementa la classificazione geografica della Figura 3.3.2.

Oltre 200 m il workflow richiede un `exposureCoefficient` con fonte
documentata e non estende la formula nominale.

## Pressione normale e segni

La pressione normale viene calcolata mediante:

```text
p = qr * ce * cp * cd
```

La convenzione serializzata e:

- valore positivo: pressione;
- valore negativo: depressione o risucchio.

`cp` dipende da tipologia, geometria e orientamento. Deve quindi essere sempre
fornito insieme a `pressureCoefficientSource`; la libreria non inventa un
coefficiente aerodinamico dalla sola descrizione dell'edificio.

`cd = 1` viene applicato soltanto quando il chiamante dichiara
`regularConstruction: true` e `constructionHeight <= 80 m`. Negli altri casi
serve un `dynamicCoefficient` accompagnato da `dynamicCoefficientSource`.

## Workflow completo

```js
import {
  calculateNTC2018WindAreaLoad,
} from "strutture-js/norms/ntc2018";

const result = calculateNTC2018WindAreaLoad({
  id: "facade-wind",
  actionId: "wind-action",
  zone: "ZONE_1",
  siteAltitude: 100,
  returnPeriodYears: 50,
  exposureCategory: "II",
  heightAboveGround: 10,
  pressureCoefficient: -0.8,
  pressureCoefficientSource: "Documented facade coefficient CP-01",
  constructionHeight: 20,
  regularConstruction: true,
  units: { force: "kN", length: "m" },
});
```

Lo schema `ntc2018-wind-area-load/v1` conserva velocita, coefficienti,
pressione, formule, fonti, `WindAction` e `AreaLoad`. Il carico superficiale ha
direzione `surface-normal` e mantiene il segno di `cp`.

## Limiti del primo incremento

Non sono ancora generati:

- coefficienti di pressione esterna o interna dalla geometria;
- combinazioni tra le pressioni sulle due facce di un elemento;
- azione tangente e coefficiente d'attrito `cf`;
- distribuzioni di pressione lungo edifici e coperture;
- risposta dinamica di costruzioni alte, snelle, leggere o flessibili;
- distacco dei vortici, galoppo, divergenza torsionale e flutter;
- interferenza tra costruzioni vicine;
- lookup geografico di zona, rugosita o categoria di esposizione.

I coefficienti ottenuti da analisi, documenti affidabili o prove in galleria
del vento possono essere passati come input documentati. Il kernel li conserva
senza presentare come implementata la procedura che li ha prodotti.
