# Piano — Sistema documentale normativo (NTC 2018 + Circolare 7/2019)

Piano operativo approvato in data 2026-07-24. Questo file e' il riferimento
per riprendere il lavoro in sessioni future. **Non** iniziare la conversione
integrale delle NTC prima di completare la Fase 2.

## Decisione architetturale di fondo (aggiornata)

- Il corpus documentale vive in una **repository autonoma** `strutture-normativa`
  (package npm `@strutture-js/normativa`), NON dentro `strutture-js`.
- Motivazione: il bundle web di `strutture-js` deve restare leggero; il corpus
  completo (NTC + Circolare + figure) pesa diversi MB e cresce nel tempo.
- In `strutture-js` resta **solo** il collegamento:
  1. i `*_REFERENCES` gia' presenti nei moduli (stringhe, zero byte aggiuntivi);
  2. la documentazione tecnica in `docs/ntc2018-*.md` (resta com'e');
  3. le app consumer (SPA, siti) importano `@strutture-js/normativa` come
     dipendenza **separata e opzionale**, con caricamento per capitolo.
- Gli ID normativi NON contengono path ne' nomi di repo: la migrazione da
  eventuale modulo interno a repo autonoma non cambia alcun ID.

## Convenzioni consolidate (da non rinegoziare senza ADR)

- ID gerarchici: `ntc2018:c3/s3.3/p3.3.7`, `ntc2018:c3/s3.3/tab3.3.ii`,
  `ntc2018:c3/s3.3/eq3.3.7`, `circ2019:c3/s3.3/p-c3.3.7`.
  - Formule senza numero: `eq<paragrafo>-a`, `-b`, ... con `officialNumber: null`.
  - Slug: id con `:` e `/` -> `-`, `.` -> `-`, tutto minuscolo.
  - ID deprecati mai riusati; rinumerazioni con relazione `supersedes` + redirect.
- Versionamento: `documentId` (opera) / `editionId` (atto GU) / `versionId`
  (testo coordinato). Mai l'etichetta generica `NTC2018` per contenuti diversi.
- Testo ufficiale VERBATIM dentro `<OfficialText>`; niente parafrasi o
  correzioni; refusi segnalati solo nel report anomalie.
- Marcatori obbligatori: `[DA_VERIFICARE]`, `[FORMULA_NON_LEGGIBILE]`,
  `[TABELLA_DA_REVISIONARE]`, `[FIGURA_MANCANTE]`, `[RIFERIMENTO_AMBIGUO]`.
- Componenti MDX ammessi (set minimo, 8): `OfficialText`, `Formula`,
  `NormativeTable`, `NormativeFigure`, `CircularCommentary`, `EditorialNote`,
  `CodeReference`, `ReviewWarning`. Nessun testo libero fuori dai componenti.
- Tabelle in JSON strutturato (celle + colSpan/rowSpan), non in Markdown.
- Figure: raster estratto dalla fonte (prova di fedelta') + SVG ridisegnato
  solo manuale e verificato. Mai ridisegno automatico.
- Mapping NTC-Circolare: pre-match automatico `suggested`, conferma solo umana.
- Code-map: manifest centralizzato nella repo normativa, con test che verifica
  l'esistenza degli export di `strutture-js`. Il codice di `strutture-js` non
  importa MAI il corpus documentale (niente dipendenze circolari, niente
  impatto sul bundle).

## Pesi REALI misurati in Fase 1 (2026-07-25)

- NTC 2018: **372 pagine -> testo estratto 1.38 MB**.
- Circolare 7/2019: **348 pagine -> testo estratto 1.01 MB**.
- Tabelle/JSON + descrittori: da misurare in Fase 2.
- Indice di ricerca compresso: < 0,5 MB (stima).
- **Nel bundle di `strutture-js`: 0 byte.** Il testo normativo e' leggero
  (molto meno di una foto JPEG); il peso percepito dei PDF viene da font e
  impaginazione, non dal contenuto. Nelle app consumer si carica solo
  l'indice + il capitolo richiesto on-demand.

## Repo creata

- Percorso locale: `C:\Users\pagan\Documents\Javascript\strutture-normativa`
  (sibling di questa repo, NON dentro di essa).
- Package: `@strutture-js/normativa` v0.1.0, TypeScript nativo (Node 22
  `--experimental-strip-types`, nessun build step), ESM, `sideEffects:false`.
- Git inizializzato, commit iniziale fatto. **Da pushare su GitHub a cura
  dell'utente.**
- Verifiche: 29/29 test verdi, `validate:all` verde, typecheck pulito.

## Fasi

### Fase 0 — Creazione repo e scaffold  ✅ COMPLETATA (2026-07-25)

- [x] Repo locale `strutture-normativa` creata (sibling). Push su GitHub a
      cura dell'utente.
- [x] Scaffold package `@strutture-js/normativa`: ESM, `sideEffects:false`,
      TypeScript nativo + `node:test` (niente framework, niente build step).
- [x] Schema Zod: `unit.schema.ts`, `table.schema.ts`, `formula.schema.ts`,
      `source.schema.ts`, `mapping.schema.ts` in `src/schema/`.
- [x] Script `validate-schema` e `validate-ids` + PoC `p3.3.7.mdx`.
- [x] Criterio di completamento: `validate:all` verde sull'esempio.

### Fase 1 — Fonti e provenienza  ✅ COMPLETATA (2026-07-25)

- [x] PDF NTC 2018 (GU n. 42 del 20-02-2018, S.O. n. 8) e Circolare 21-01-2019
      n. 7 acquisiti dal desktop e registrati in `sources/sources.json` con
      hash SHA-256 (NTC `dda1e397…05a46`, Circolare `f7c3b8d1…aed7c`).
- [ ] Verificare esistenza di errata corrige / testi coordinati ufficiali
      (fonte CS.LL.PP. / GU). **Non citare a memoria: solo fonti verificate.**
- [x] Script `extract-source.ts` (pdftotext se disponibile, fallback
      pdfjs-dist). Testo estratto in `extracted/<sourceId>/`.
- [x] Pesi reali misurati: NTC testo 1.38 MB, Circolare testo 1.01 MB
      (figure da misurare in Fase 2).
- [ ] Verifica legale riproduzione testi normativi (documentare esito).
- Qualita' estrazione verificata: testo corpo pulito e verbatim; Tabella 3.3.II
      estratta perfettamente; **formula [3.3.7] NTC corrotta nei glyph
      matematici** (richiede crop immagine o [FORMULA_NON_LEGGIBILE]).

### Fase 2 — Pilota: vento, NTC §3.3 + Circ. C3.3

Scelta motivata: `strutture-js` implementa gia' `calculateNTC2018Wind*`,
tabelle 3.3.I/3.3.II come dati, test esistenti, doc `docs/ntc2018-wind-load.md`.

- [ ] Conversione MDX §3.3.1-3.3.9 con prompt DeepSeek (vedi chat 2026-07-24,
      sezione "PROMPT OPERATIVO PER DEEPSEEK": salvarlo come file
      `docs/deepseek-prompt.md` nella repo normativa al momento della creazione).
- [ ] Tabelle JSON `tab3.3.i`, `tab3.3.ii`; figure `fig3.3.1` (se leggibile),
      `fig3.3.2` (profili coefficiente di esposizione).
- [ ] Conversione Circ. C3.3.1-C3.3.9 + mapping `mappings/ntc2018-circ2019/c3.json`
      (stato `suggested`, conferma ingegnere).
- [ ] Code-map `code-map/ntc2018-wind.js` con voci per
      `calculateNTC2018BaseWindSpeed`, `calculateNTC2018WindReturnCoefficient`,
      `calculateNTC2018WindPressure`, `calculateNTC2018WindExposureCoefficient`;
      test di esistenza export contro `strutture-js/norms/ntc2018`.
- [ ] Suite validazione completa: `validate-schema`, `validate-ids`,
      `validate-links`, `validate-source-text`, `validate-formulas`,
      `validate-tables`, `validate-code-references`, `generate-review-report`.
- [ ] Review tecnica (ingegnere strutturista) su OfficialText, formule, tabelle.
- [ ] Criterio di completamento: suite verde, review firmata, **tasso
      unita'/giorno misurato** registrato qui sotto per calibrare il resto.
- [ ] Misura pilota: ___ unita' convertite, ___ ore conversione, ___ ore review.

### Fase 3 — Indice e loader

- [ ] `build-index.js` -> `dist/index/norm-index.json` (units, fulltext,
      symbols, exports, circularMap, redirects).
- [ ] `loader.js`: `loadUnit(id, { version })`, `loadChapter(doc, cap)`,
      `queryByExport(name)`; chunk per capitolo.
- [ ] Guardia versione: `assertFunctionValidForEdition(key, editionId)`.
- [ ] Test `index.test.js`.

### Fase 4 — App di consultazione (consumer, non questa repo)

- [ ] App React/Next con gli 8 componenti MDX, breadcrumb, prev/next,
      ricerca client-side sull'indice, link permanenti.
- [ ] Accessibilita': KaTeX + MathML, alt figure, tabelle semantiche.
- [ ] Demo pubblica della pagina `ntc2018/c3/s3.3/p3.3.7`.

### Fase 5 — Estensione per capitoli

- [ ] Ordine suggerito: cap. 2, resto cap. 3 (neve §3.4 — gia' implementato
      in strutture-js), cap. 4.1 (c.a.), cap. 7 (murature), poi gli altri.
- [ ] Un capitolo alla volta: conversione -> validazione -> review -> merge.
- [ ] Aggiornare code-map per ogni area gia' implementata in strutture-js.

### Fase 6 — Versioni, errata, manutenzione

- [ ] Ingestione errata/coordinati con relazioni `amends`/`supersedes`.
- [ ] `check-source-freshness.js` schedulato (mensile): URL, hash, ETag.
- [ ] Procedura documentata per nuove edizioni.

## Collegamento con strutture-js (unica modifica prevista qui)

- [ ] Aggiungere a `README.md` e/o `docs/consumer-integration.md` un link al
      package `@strutture-js/normativa` quando pubblicato (Fase 3+).
- [ ] Nessuna dipendenza npm da `strutture-js` verso il corpus: il
      collegamento resta documentale (i `*_REFERENCES` gia' presenti).

## Rischi principali (sintesi)

1. Qualita' estrazione PDF (formule come immagini) -> rawExtract + crop +
   marcatori, mai ricostruzioni.
2. Review tecnica collo di bottiglia -> pubblicazione per capitolo.
3. Deriva codice<->norma -> test esistenza export in CI bloccante.
4. Errata non rilevati -> freshness check mensile.
5. Scope creep (Eurocodici) -> fuori scope finche' NTC+Circolare non completi.

## Riferimenti

- Progettazione completa (architettura, schemi, ADR, prompt DeepSeek):
  conversazione del 2026-07-24; salvare il prompt DeepSeek come
  `docs/deepseek-prompt.md` nella repo normativa (Fase 2).
- Convenzioni repo calcolo: `AGENTS.md`, `docs/project-boundaries.md`,
  `docs/public-api-policy.md`.
