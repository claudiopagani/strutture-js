# Repository Instructions

Queste regole valgono per agenti automatici e contributori assistiti da AI.

- Mantieni `strutture-js` una libreria pubblica di calcolo strutturale,
  indipendente dai repository e dai prodotti che la consumano.
- Non aggiungere UI, componenti di framework, stato di pagina, autenticazione,
  database, storage applicativo, analytics, chiamate di rete o orchestrazione
  server.
- Non aggiungere adapter verso software o prodotti specifici. Definisci invece
  contratti generici e serializzabili; gli adapter concreti restano nei
  consumer.
- Rispetta i livelli esistenti: `applications -> norms -> domain`. Non aggirare
  `package.json#exports` negli esempi destinati ai consumer.
- Non inventare riferimenti normativi, coefficienti, formule o limiti. Ogni
  implementazione tecnica deve citare fonti verificabili e dichiarare unita,
  ipotesi e campo di validita.
- Non implementare o modificare formule senza test. Aggiungi validazione
  indipendente proporzionata alla criticita e regressioni per ogni bug
  numerico.
- Non presentare scaffold, mock o placeholder come funzionalita disponibile.
  Usa lo status `not-implemented` e documenta chiaramente il limite.
- Mantieni risultati serializzabili e preserva `status`, `outputs`, `checks`,
  `warnings`, `assumptions`, `metadata`, `demand`, `capacity` e
  `utilizationRatio` quando applicabili.
- Evita refactoring estesi non necessari e non cambiare formule, licenza,
  package manager, linguaggio o framework senza una richiesta esplicita.
- Prima di consegnare esegui i test pertinenti, le campagne di validazione e i
  controlli architetturali. Per modifiche trasversali esegui `npm run check`.
- Non copiare nel repository piani, milestone, sequenze temporali, strategie o
  altre informazioni non pubbliche provenienti da organizzazioni o prodotti
  esterni.

I criteri decisionali completi sono in `docs/project-boundaries.md`; la
stabilita degli entry point e descritta in `docs/public-api-policy.md`.
