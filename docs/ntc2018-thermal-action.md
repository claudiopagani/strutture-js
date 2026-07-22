# Azioni della temperatura NTC 2018

Il modulo `strutture-js/norms/ntc2018` espone un kernel locale per i dati
climatici, gli stati termici uniformi e le deformazioni termiche libere. Il
contratto non contiene geolocalizzazione, chiamate di rete, autorizzazioni o
logiche commerciali.

Un consumer puo quindi usare dati calcolati localmente oppure temperature
medie documentate ottenute da un servizio esterno. La provenienza dei valori
espliciti rimane nel risultato serializzato, ma la libreria non conosce il
servizio che li ha prodotti.

## Fonte e campo di validita

L'implementazione segue il D.M. 17 gennaio 2018, NTC 2018, paragrafo 3.5:

- paragrafo 3.5.2 ed equazioni [3.5.1]-[3.5.8] per le temperature esterne;
- paragrafo 3.5.3 per la temperatura interna convenzionale;
- paragrafo 3.5.4 e Tabella 3.5.I per stato uniforme, temperatura iniziale e
  contributo dell'irraggiamento solare;
- paragrafo 3.5.5 e Tabella 3.5.II per i valori semplificati degli edifici;
- paragrafo 3.5.7 e Tabella 3.5.III per i coefficienti di dilatazione.

Il testo ufficiale e pubblicato nel
[Supplemento ordinario n. 8 alla Gazzetta Ufficiale n. 42 del 20 febbraio 2018](https://www.gazzettaufficiale.it/eli/gu/2018/02/20/42/so/8/sg/pdf).

Le temperature e le loro variazioni sono espresse esplicitamente in `degC`.
La deformazione termica e adimensionale. Le funzioni che ricevono quote
richiedono inoltre un sistema di unita esplicito.

## Temperature dell'aria esterna

`calculateNTC2018ExternalAirTemperatures` calcola `Tmin` e `Tmax`, riferite a
un periodo di ritorno di 50 anni, dalla zona e dalla quota `as` in metri:

| Zona | Regioni indicate dalle NTC | `Tmin` [degC] | `Tmax` [degC] |
| --- | --- | --- | --- |
| `I` | Valle d'Aosta, Piemonte, Lombardia, Trentino-Alto Adige, Veneto, Friuli-Venezia Giulia, Emilia-Romagna | `-15 - 4 as/1000` | `42 - 6 as/1000` |
| `II` | Liguria, Toscana, Umbria, Lazio, Sardegna, Campania, Basilicata | `-8 - 6 as/1000` | `42 - 2 as/1000` |
| `III` | Marche, Abruzzo, Molise, Puglia | `-8 - 7 as/1000` | `42 - 0.3 as/1000` |
| `IV` | Calabria, Sicilia | `-2 - 9 as/1000` | `42 - 2 as/1000` |

Il consumer sceglie la zona. Il kernel non converte coordinate, comuni o
regioni in un identificatore e non sostituisce eventuali indagini statistiche
specifiche del sito.

```js
import {
  calculateNTC2018ExternalAirTemperatures,
} from "strutture-js/norms/ntc2018";

const air = calculateNTC2018ExternalAirTemperatures({
  zone: "II",
  siteAltitude: 500,
  temperatureUnit: "degC",
  units: { force: "kN", length: "m" },
});
```

In mancanza di valutazioni piu precise,
`resolveNTC2018InternalAirTemperature` restituisce `20 degC`.

## Temperatura dell'elemento

Per un elemento monodimensionale, la componente uniforme e:

```text
T = (Tsup,est + Tsup,int) / 2
DeltaTu = T - T0
```

`calculateNTC2018MeanElementTemperature` e
`calculateNTC2018UniformTemperatureChange` implementano queste due relazioni.
In mancanza di una determinazione piu precisa, `T0` puo essere assunta pari a
`15 degC`.

La Tabella 3.5.I fornisce i seguenti contributi solari estivi:

| Superficie | Nord-Est [degC] | Sud-Ovest o orizzontale [degC] |
| --- | ---: | ---: |
| Riflettente | 0 | 18 |
| Chiara | 2 | 30 |
| Scura | 4 | 42 |

In inverno il contributo e nullo. La funzione
`getNTC2018SolarTemperatureIncrement` restituisce il valore tabellato, ma non
lo trasforma automaticamente in una temperatura superficiale. Le NTC
richiedono infatti di considerare irraggiamento, convezione e isolamento nella
trasmissione del calore.

## Valori semplificati per gli edifici

Quando la temperatura non e fondamentale per sicurezza o funzionalita,
`calculateNTC2018BuildingThermalActions` puo usare direttamente la Tabella
3.5.II:

| ID | Tipo di struttura | `DeltaTu` [degC] |
| --- | --- | ---: |
| `EXPOSED_REINFORCED_CONCRETE` | c.a. e c.a.p. esposti | +/- 15 |
| `PROTECTED_REINFORCED_CONCRETE` | c.a. e c.a.p. protetti | +/- 10 |
| `EXPOSED_STEEL` | acciaio esposto | +/- 25 |
| `PROTECTED_STEEL` | acciaio protetto | +/- 15 |

```js
import {
  calculateNTC2018BuildingThermalActions,
} from "strutture-js/norms/ntc2018";

const result = calculateNTC2018BuildingThermalActions({
  simplifiedBuildingType: "EXPOSED_STEEL",
  temperatureUnit: "degC",
});
```

Il risultato `ntc2018-building-thermal-actions/v1` contiene due
`ThermalAction` serializzabili, una estiva positiva e una invernale negativa,
con i fattori di combinazione NTC 2018.

Quando occorre uno studio piu approfondito della trasmissione del calore, il
consumer puo passare le temperature medie gia determinate:

```js
const result = calculateNTC2018BuildingThermalActions({
  summerMeanTemperature: 37,
  winterMeanTemperature: -5,
  temperatureStateSource: "Envelope heat-transfer study HT-01",
  initialTemperature: 12,
  initialTemperatureSource: "Construction record T0-01",
  temperatureUnit: "degC",
});
```

La fonte e obbligatoria. Puo identificare un documento, un calcolo locale o
un risultato normalizzato proveniente da un endpoint; nessuno di questi casi
introduce dipendenze dal prodotto o dal trasporto nella libreria.

## Dilatazione termica

`resolveNTC2018ThermalExpansionCoefficient` espone i valori della Tabella
3.5.III. I valori fissi non possono essere sostituiti implicitamente; per gli
intervalli di muratura e legno ortogonale alle fibre il valore scelto deve
essere dichiarato e appartenere all'intervallo tabellato.

`calculateNTC2018FreeThermalStrain` applica la relazione cinematica lineare:

```text
epsilonT = alphaT * DeltaT
```

La funzione restituisce la deformazione libera. Non calcola tensioni,
sollecitazioni o reazioni: tali effetti dipendono da rigidezza, vincoli e
modello strutturale.

## Limiti del primo incremento

Non sono generati:

- temperature superficiali da un modello di trasmissione del calore;
- componenti lineari `DeltaTMy` e `DeltaTMz`;
- distribuzioni non lineari nella sezione;
- effetti di ciminiere, tubazioni, sili, serbatoi e altre azioni speciali;
- forze, tensioni o reazioni da impedimento della deformazione;
- lookup geografico della zona o accesso a dati climatici remoti.

Questi limiti sono espliciti nel risultato. Eventuali calcoli intensivi o dati
di sito possono essere prodotti da sistemi esterni e poi forniti al kernel
come input tecnici documentati.
