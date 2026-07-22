# Carichi permanenti NTC 2018

Il modulo `strutture-js/norms/ntc2018` espone un contratto locale e
deterministico per calcolare pesi propri e carichi permanenti superficiali. Il
modulo non sceglie la classe dell'azione, non assegna la direzione del carico e
non interpreta la geometria del modello strutturale: queste decisioni restano
esplicite nel consumer.

## Fonti e campo di validita

I riferimenti implementati sono:

- D.M. 17 gennaio 2018, NTC 2018, paragrafo 3.1.2 e Tabella 3.1.I per i
  pesi per unita di volume;
- D.M. 17 gennaio 2018, NTC 2018, paragrafo 3.1.3 per il carico uniforme
  equivalente degli elementi divisori interni;
- D.M. 17 gennaio 2018, NTC 2018, paragrafo 2.6.1 e Tabella 2.6.I per i
  coefficienti parziali delle azioni permanenti.

Il testo ufficiale e pubblicato nel
[Supplemento ordinario n. 8 alla Gazzetta Ufficiale n. 42 del 20 febbraio 2018](https://www.gazzettaufficiale.it/eli/gu/2018/02/20/42/so/8/sg/pdf).

I risultati sono magnitudini caratteristiche non negative. Il consumer deve
decidere esplicitamente:

- la classe `G1` o `G2`;
- l'effetto `favourable` o `unfavourable`;
- direzione, segno e posizione geometrica del carico.

## Catalogo normativo

`NTC2018_UNIT_WEIGHT_CATALOG` riproduce la Tabella 3.1.I in `kN/m^3`. Le voci
sono immutabili e hanno identificativi stabili. Una voce `fixed` restituisce il
valore tabellato; una voce `range` richiede al chiamante una scelta esplicita
compresa nell'intervallo normativo.

```js
import {
  resolveNTC2018UnitWeight,
} from "strutture-js/norms/ntc2018";

const reinforcedConcrete = resolveNTC2018UnitWeight({
  materialId: "reinforced-or-prestressed-concrete",
});

const lightweightConcrete = resolveNTC2018UnitWeight({
  materialId: "lightweight-concrete",
  value: 18,
});
```

Il precedente `NTC2018_SLAB_MATERIAL_WEIGHT_DATABASE` resta disponibile per
compatibilita, ma include anche stime tecniche e prodotti non presenti nella
Tabella 3.1.I. Non deve essere trattato come copia normativa della tabella.

## Correzione del coefficiente favorevole G2

Il coefficiente parziale favorevole G2 dei set A1 e A2 e `0.8`, come indicato
dalla Tabella 2.6.I. Questa implementazione corregge i precedenti valori
incoerenti `0.0` nel catalogo delle azioni e `0.9` nell'analisi legacy dei
solai. La modifica del risultato numerico e quindi una correzione normativa
coperta da test di regressione.

## Pesi propri

Le API numeriche richiedono sempre `{ force, length }` e normalizzano il
risultato in `{ force: "kN", length: "m" }`:

- `calculateNTC2018AreaSelfWeight`: `unitWeight * thickness` in `kN/m^2`;
- `calculateNTC2018LineSelfWeight`: `unitWeight * crossSectionArea` in `kN/m`;
- `calculateNTC2018SelfWeight`: `unitWeight * volume` in `kN`.

`unitWeight` indica un peso per unita di volume, non una densita di massa. Non
viene ricavato automaticamente da `BaseMaterial.density`, perche quel campo
non costituisce oggi un contratto affidabile per questa conversione.

## Workflow dei carichi superficiali

`calculateNTC2018PermanentAreaLoads` aggrega elementi con ID forniti dal
consumer e restituisce un `CalculationResult`. Gli operandi normalizzati e la
formula di ogni elemento vengono conservati nel risultato.

```js
import {
  calculateNTC2018PermanentAreaLoads,
} from "strutture-js/norms/ntc2018";

const result = calculateNTC2018PermanentAreaLoads({
  units: { force: "kN", length: "m" },
  items: [
    {
      id: "structural-slab",
      description: "Soletta in calcestruzzo armato",
      model: "layer",
      permanentClass: "G1",
      unitWeight: 25,
      thickness: 0.2,
    },
    {
      id: "finishes",
      model: "surface",
      permanentClass: "G2",
      areaLoad: 1.5,
    },
  ],
});
```

I modelli supportati sono:

| `model` | Operandi | Formula del carico superficiale |
| --- | --- | --- |
| `layer` | `unitWeight`, `thickness` | `unitWeight * thickness` |
| `surface` | `areaLoad` | valore assegnato |
| `repeated-line` | `lineLoad`, `spacing` | `lineLoad / spacing` |
| `repeated-section` | `unitWeight`, `crossSectionArea`, `spacing` | `unitWeight * crossSectionArea / spacing` |
| `distributed-wall` | `unitWeight`, `height`, `thickness`, `spacing` | `unitWeight * height * thickness / spacing` |

Lo schema di output e `ntc2018-permanent-area-loads/v1`. Oltre agli elementi
normalizzati, `outputs` contiene le `PermanentAction`, gli `AreaLoad` e i
totali caratteristici distinti per classe ed effetto.

## Elementi divisori interni

`calculateNTC2018EquivalentPartitionAreaLoad` applica gli intervalli del
paragrafo 3.1.3:

| Peso lineare del divisorio | Carico uniforme equivalente |
| --- | --- |
| fino a `1 kN/m` | `0.4 kN/m^2` |
| oltre `1` e fino a `2 kN/m` | `0.8 kN/m^2` |
| oltre `2` e fino a `3 kN/m` | `1.2 kN/m^2` |
| oltre `3` e fino a `4 kN/m` | `1.6 kN/m^2` |
| oltre `4` e fino a `5 kN/m` | `2.0 kN/m^2` |

Per un peso lineare maggiore di `5 kN/m`, il risultato imposta
`requiresActualPositioning: true` e non produce un carico uniforme. La
libreria non inventa la posizione dei divisori.

## Confine di integrazione

Il calcolo e sincrono, locale e serializzabile. Eventuali adapter di UI,
persistenza o trasporto di rete devono consumare questo contratto dagli entry
point pubblici e restano esterni alla libreria.
