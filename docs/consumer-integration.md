# Consumer Integration

Un'applicazione esterna consuma `strutture-js` come dipendenza pubblica. Il
mapping tra form, API, database o file del consumer e i modelli della libreria
rimane nel repository del consumer.

## Import pubblici

Usare il package root quando serve un insieme trasversale di API:

```js
import {
  RESULT_STATUS,
  createDefaultApplicationRegistry,
} from "strutture-js";
```

Usare un subpath ufficiale quando riduce il grafo importato:

```js
import {
  CrackedSectionDeflectionAnalysis,
} from "strutture-js/applications/rc-cracked-deflection";

import { LinearStaticSolver2D } from "strutture-js/domain/fem";
```

Non importare `strutture-js/src/...` e non risalire con percorsi relativi
dentro `node_modules`. Solo gli entry point in `package.json#exports` sono
supportati.

## Facade locale del consumer

Il consumer dovrebbe esporre un proprio adapter o facade. Questo strato
traduce gli input applicativi in modelli pubblici, invoca il workflow e crea
l'envelope persistito, senza duplicare formule:

```js
import {
  createDefaultApplicationRegistry,
} from "strutture-js";

const registry = createDefaultApplicationRegistry();

export function runCalculation({
  applicationId,
  model,
  libraryVersion,
  methodId,
}) {
  const calculation = registry.run(applicationId, { model });
  const result = calculation.toJSON?.() ?? calculation;

  return {
    schemaVersion: "calculation-record/v1",
    engine: {
      name: "strutture-js",
      version: libraryVersion,
    },
    method: {
      id: methodId,
      applicationId,
    },
    recordedAt: new Date().toISOString(),
    result,
  };
}
```

`libraryVersion` deve essere iniettata dal build o ricavata dalla versione
risolta nel lockfile del consumer. Non va stimata dal contenuto del risultato.
Se il workflow espone una versione di schema o metodo, conservarla in
`method` o nel relativo report DTO.

## Persistenza e serializzazione

Prima di salvare o trasmettere un risultato, usare `toJSON()` quando presente
e verificare la serializzabilita con `JSON.stringify`. Conservare l'intero
risultato, non soltanto il rapporto governante:

```js
const payload = calculation.toJSON?.() ?? calculation;
const serialized = JSON.stringify(payload);
```

Il consumer deve mantenere insieme `status`, `outputs`, `checks`, `warnings`,
`assumptions`, `metadata`, unita e versione della libreria. Arrotondamenti di
presentazione non devono sostituire i valori serializzati.

## UI e report

Una UI o un renderer usa direttamente i dati restituiti:

- `status` decide il tipo generale di esito;
- `checks[].ok` e `checks[].utilizationRatio` alimentano tabelle e indicatori;
- `demand`, `capacity` e `utilizationRatio` vengono mostrati con le unita
  dichiarate;
- `warnings` e `assumptions` restano visibili nel report;
- `outputs` contiene diagrammi, inviluppi e dettagli gia calcolati.

Il consumer non deve ricalcolare capacita, rapporti o status a partire da una
formula duplicata. Puo formattare, ordinare e filtrare i dati, ma la decisione
tecnica resta quella registrata nel risultato.

Gestire distintamente almeno questi casi:

- `not-supported`: metodo esistente, caso fuori dal campo coperto; richiedere
  un metodo o input diverso;
- `not-implemented`: capacita dichiarata come placeholder; non presentarla
  come calcolo disponibile;
- `failed`: esecuzione non affidabile per errore tecnico o numerico; conservare
  diagnostica e consentire una nuova esecuzione.

Per tutti gli status vedere [Result Status](result-status.md); per gli entry
point supportati vedere [Public API Policy](public-api-policy.md).
