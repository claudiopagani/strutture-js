# Carichi imposti NTC 2018

Il modulo `ntc2018ImposedLoads.js` rappresenta il contratto locale e
serializzabile dei sovraccarichi per opere civili e industriali. Non contiene
UI, persistenza, chiamate di rete o adattatori verso prodotti specifici.

## Fonti e campo di applicazione

Il riferimento e il D.M. 17 gennaio 2018, NTC 2018:

- Tabella 3.1.II per `qk`, `Qk` e `Hk`;
- §3.1.4.1 ed equazioni 3.1.1 e 3.1.2 per le riduzioni;
- §3.1.4.2 per le impronte dei carichi concentrati;
- §3.1.4.3 per i carichi orizzontali lineari;
- Tabelle 2.5.I e 2.6.I per i coefficienti di combinazione e parziali.

I valori del catalogo sono espressi internamente in `{ force: "kN", length:
"m" }`: `qk` in `kN/m^2`, `Qk` in `kN` e `Hk` in `kN/m`. Ogni valore
documentato ricevuto dal chiamante richiede invece un sistema di unita
esplicito ed e normalizzato nelle unita interne.

## Catalogo generico

`NTC2018_IMPOSED_LOAD_CATALOG` contiene tutte le righe della Tabella 3.1.II,
incluse le categorie I e K e le righe specifiche per scale, balconi e
ballatoi. Ogni definizione espone:

- specifiche separate per `qk`, `Qk` e `Hk`;
- modalita `fixed`, `minimum`, `case-by-case` o `served-category`;
- regole di applicazione locale di `Qk` e `Hk`;
- identificativo stabile e riferimenti normativi.

La funzione `resolveNTC2018ImposedLoadDefinition` produce il contratto
risolto. I valori fissi sono automatici. Le prescrizioni minime e i casi da
valutare caso per caso richiedono tutti i valori pertinenti e
`documentation.reference`; un valore inferiore al valore tabellare o al
minimo viene rifiutato.

Esempio per la categoria G:

```js
import { resolveNTC2018ImposedLoadDefinition } from "strutture-js/norms/ntc2018";

const imposedLoads = resolveNTC2018ImposedLoadDefinition({
  definitionId: "G-medium-vehicles",
  documentedValues: {
    qk: 6,
    Qk: 60,
    Hk: 1.2,
  },
  documentation: {
    reference: "Relazione dei carichi, paragrafo 4.2",
  },
  units: { force: "kN", length: "m" },
});
```

Per le categorie I e K anche i coefficienti `psi0`, `psi1` e `psi2` sono da
valutare caso per caso secondo la Tabella 2.5.I. Il resolver richiede quindi
`documentedCombinationFactors`. La categoria I eredita invece i carichi
caratteristici dalla destinazione servita di categoria A-D.

## Applicazione locale

`Qk` e `Hk` sono destinati a verifiche locali distinte e non sono combinati
con i carichi impiegati nelle verifiche globali dell'edificio. Il contratto
espone esplicitamente questa esclusione.

In assenza di indicazioni piu precise, l'impronta di `Qk` e quadrata da
`50 x 50 mm`. Per F sono previste due impronte da `100 x 100 mm`, per G due
impronte da `200 x 200 mm`; in entrambi i casi l'interasse e `1.80 m`.

`Hk` si applica alle pareti a `1.20 m` dal piano di calpestio e ai parapetti o
mancorrenti sul bordo superiore. Per F e G il valore tabellare riguarda solo
parapetti e partizioni delle zone pedonali; l'azione dei veicoli sulle barriere
resta da valutare caso per caso.

## Riduzioni

`calculateNTC2018ImposedLoadAreaReduction` implementa:

```text
alphaA = min(1, 5/7 * psi0 + 10/A)
```

per le categorie A, B, C, D, H e I. Per C e D vale inoltre
`alphaA >= 0.6`. In categoria I `psi0` e la relativa fonte devono essere
documentati.

`calculateNTC2018ImposedLoadMultiStoreyReduction` implementa:

```text
alphaN = (2 + (n - 2) * psi0) / n
```

per membrature verticali di edifici con piu di due piani caricati e categorie
A-D. `alphaA` e `alphaN` non possono essere combinati; entrambi i risultati
espongono questa esclusione.

## Coefficienti parziali e traffico

Le azioni variabili ordinarie, comprese le categorie F e G degli edifici,
usano i coefficienti della Tabella 2.6.I: `1.5` in A1 e `1.3` in A2 per
effetto sfavorevole. I coefficienti del traffico sui ponti stradali sono
distinti nella famiglia parziale `roadBridgeTraffic` (`1.35` in A1 e `1.15`
in A2, Tabella 5.1.V); questa distinzione non costituisce un'implementazione
dei modelli di traffico del Capitolo 5.

## Compatibilita dei vecchi cataloghi dei solai

`NTC2018_SLAB_VARIABLE_ACTIONS_DATABASE` e mantenuto come adapter deprecato
per gli identificativi numerici esistenti. I valori numerici sono derivati dal
catalogo generico. Nei casi non automatici `qk` e `null` e il chiamante deve
passare un valore documentato oppure usare il resolver completo.

`NTC2018_SLAB_MATERIAL_WEIGHT_DATABASE` e anch'esso mantenuto come alias
deprecato. Il nome canonico e `SLAB_MATERIAL_WEIGHT_PRESET_DATABASE` e la
relativa metadata dichiara `normative: false`: si tratta di preset storici da
verificare contro dati di prodotto, prove o fonti documentate. L'unico
catalogo dei pesi unitari tratto dalla Tabella 3.1.I e
`NTC2018_UNIT_WEIGHT_CATALOG`.

## Limiti

Il modulo non genera automaticamente geometrie di carico, casi FEM o
combinazioni locali/globali. Non valuta amplificazioni dinamiche rilevanti,
carichi atipici, azioni dei materiali immagazzinati, urti sulle barriere o
azioni da ponte. Queste decisioni restano input espliciti o moduli separati.
