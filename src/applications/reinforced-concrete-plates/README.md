# RC Plates

Modulo applicativo pubblico `reinforced-concrete-plates` per verifiche locali di
piastre piane in calcestruzzo armato su strisce convenzionali larghe 1.000 mm.

Workflow disponibili:

- `ULS_BENDING_SHEAR`;
- `SLS_STRESS_CRACKING`;
- `SLS_SIMPLIFIED_DEFLECTION`.

Il modulo ruota le risultanti negli assi comuni delle armature, costruisce le
domande equivalenti Wood-Armer e delega resistenza SLU, taglio, tensioni SLE e
fessurazione ai verificatori sezionali esistenti. Il terzo workflow esegue solo
lo screening di snellezza `flat_slab`: non calcola abbassamenti.
Il limite di snellezza è calcolato separatamente per estradosso e intradosso;
in ciascuna direzione governa il limite inferiore delle due facce, interpolato
tra 24 a `rho_l = 0,5%` e 17 a `rho_l = 1,5%`.

Il taglio può essere verificato senza armatura trasversale oppure con una
maglia regolare di S verticali descritta da `diameter`, `spacingX` e
`spacingY`. Il risultato espone resistenza del traliccio, resistenza non armata
e meccanismo selezionato. Il punzonamento non è incluso.

Le verifiche sezionali usano rettangoli uniaxiali estesi per tutta la larghezza
della striscia.

La specifica completa, incluse unità, segni, fonti e limiti, è in
[`docs/reinforced-concrete-plates-method.md`](../../../docs/reinforced-concrete-plates-method.md).

Entry point pubblico:

```js
import {
  ReinforcedConcretePlateApplication,
  ReinforcedConcretePlateModel,
} from "strutture-js/applications/reinforced-concrete-plates";
```
