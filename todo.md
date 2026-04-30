# TODO

Piano di azione emerso dalla review del 2026-04-25.

Scelte confermate:

- Niente GitHub Actions.
- Niente migrazione a TypeScript.
- Per contratti e autocomplete usare JSDoc e `// @ts-check` in modo graduale, solo dove porta valore.

## 1. Fix correttivi prioritari

- [x] Correggere la conversione di `residualPierWarningThreshold`.
  File: `src/applications/masonry-wall-openings/models/MasonryWallOpeningsModel.js`
  Problema: la soglia viene convertita in metri, ma `...settings` puo sovrascriverla con il valore originale in unita utente.
  Azione: applicare `...settings` prima dei default normalizzati oppure riassegnare `residualPierWarningThreshold` convertito dopo lo spread.
  Test: costruire un modello con `units: { force: "N", length: "mm" }` e `residualPierWarningThreshold: 500`; il valore interno atteso deve essere `0.5`.

- [x] Correggere la conversione di `warpingConstant` negli override dei profili in acciaio.
  File: `src/domain/geometry/SteelProfileSection.js`
  Problema: `warpingConstant` ha dimensione `length^6`, ma oggi un override utente viene usato direttamente senza conversione.
  Azione: aggiungere `warpingConstant` a `convertOverrides()` con `resolver.convert(value, { lengthExponent: 6 })` e usare `resolvedOverrides.warpingConstant` nel costruttore.
  Test: creare un profilo con override `warpingConstant` e unita non interne, verificando il valore convertito in `N/mm` + `mm`.

## 2. Audit unita e normalizzazione

- [x] Cercare altri pattern in cui un valore normalizzato viene poi sovrascritto da uno spread dell'input originale.
- [x] Aggiungere regression test mirati per conversioni con `mm`, `cm`, `m`, `N` e `kN` sui model pubblici piu usati.
- [x] Estrarre helper piccoli per conversioni ripetute di proprieta strutturali, soprattutto dove si mappano area, inerzia, modulo resistente, rigidezza e carichi.
- [x] Documentare nei model principali quali campi sono in unita utente in ingresso e quali sono in unita interne dopo il costruttore.

## 3. Status dei risultati

- [x] Centralizzare gli status in un modulo core, ad esempio `src/core/results/resultStatus.js`.
- [x] Coprire almeno questi valori: `ok`, `not-verified`, `not-supported`, `not-analyzed`, `not-implemented`, `failed`.
- [x] Sostituire progressivamente le stringhe sparse nei moduli con costanti esportate.
- [x] Aggiornare i test di `CalculationResult`, `VerificationResult` e application registry per usare gli status centralizzati.

## 4. Refactor di `SingleBeamAnalysis`

Obiettivo: ridurre il file monolitico senza cambiare API pubblica o risultati numerici.

- [x] Estrarre normalizzazione input e carichi in un modulo dedicato.
- [x] Estrarre gestione stazioni/discretizzazione/verifica in un modulo dedicato.
- [x] Estrarre creazione inviluppi e selezione estremi in un modulo dedicato.
- [x] Estrarre sampling dei risultati FEM e conversione output in un modulo dedicato.
- [x] Tenere `SingleBeamAnalysis` come orchestratore pubblico compatibile con l'API attuale.
- [x] Dopo ogni step, eseguire `npm test` e `npm run validation`.

## 5. API pubblica e packaging

- [x] Aggiungere `exports` in `package.json` mantenendo `main` per compatibilita.
- [x] Esportare almeno:
  - `.` -> `./src/index.js`
  - `./applications` -> `./src/applications/index.js`
  - `./norms/ntc2018` -> `./src/norms/ntc2018/index.js`
  - eventuali subpath di dominio solo se hanno barrel stabili.
- [x] Valutare un barrel `src/domain/index.js` solo se riduce davvero il rumore degli import.
- [x] Aggiungere test di smoke sugli import pubblici principali.

## 6. JSDoc senza migrazione TypeScript

- [x] Aggiungere typedef JSDoc per i DTO pubblici piu grandi:
  - `SingleBeamDesignModel`
  - `MasonryWallOpeningsModel`
  - `ReinforcedConcreteSectionModel`
  - report DTO delle travi
- [x] Abilitare `// @ts-check` solo su file con contratti stabili e basso rischio.
- [x] Usare JSDoc per descrivere shape, unita attese e campi opzionali, non per riscrivere l'architettura.
- [x] Evitare build step TypeScript, file `.ts` e migrazioni massive.

## 7. Quality gate locale

- [x] Aggiungere uno script `check` in `package.json`: `npm test && npm run validation`.
- [x] Valutare uno script locale di syntax check sui file JS, senza introdurre rumore nella pipeline: aggiunto `npm run syntax` con `node --check`.
- [x] Valutare ESLint/Prettier solo se si accetta di introdurre devDependency e una regola di formatting condivisa: rimandati per evitare nuove dipendenze e churn di formatting.
- [x] Tenere la verifica minima sempre disponibile con comandi Node standard.

## 8. Campagna di validazione

- [x] Espandere `validation/` oltre i casi trave esistenti con una prima tranche di casi in cemento armato.
- [x] Aggiungere benchmark esterni o workbook di riferimento per:
  - [x] acciaio: prima tranche con SCI P364 per classificazione, resistenze e instabilita;
  - [x] cemento armato: prima tranche con relazioni locali, JRC EC2 worked examples, SLU/SLE carichi, pressione fondazione e interazione N-M;
  - [x] muratura: prima tranche con curve di capacita, aperture e report cerchiature derivati da input MATLAB;
  - [x] legno/compositi: prima tranche con worked example EC5, workbook gamma method, deformazioni e connettori;
  - [x] XLAM: prima tranche con relazione locale per flessione, vibrazioni e deformazioni.
- [x] Per ogni caso indicare fonte, ipotesi, tolleranza e grandezze confrontate.
- [x] Mantenere il report Markdown della campagna come artefatto leggibile.

## 9. Documentazione tecnica

- [x] Documentare il ciclo consigliato: `npm test`, `npm run validation`, `npm run check`.
- [x] Aggiungere una pagina breve sugli status dei risultati e sul significato applicativo di ciascuno.
- [x] Aggiornare la documentazione dei model quando cambiano contratti, unita o DTO: nessun contratto model cambiato in questa tranche; aggiornata la documentazione del contratto di validazione/report.
- [x] Separare chiaramente limiti implementativi, ipotesi normative e scelte numeriche.

## 10. Ordine suggerito

1. Fix conversioni unita.
2. Script `check` locale.
3. Status centralizzati.
4. JSDoc mirato sui DTO piu usati.
5. API `exports`.
6. Refactor graduale di `SingleBeamAnalysis`.
7. Espansione campagna di validazione.
8. Documentazione di supporto.

---

## Giro 2 - Review first principles del 2026-04-30

Esito del nuovo passaggio indipendente:

- build, syntax check, test e validation campaign sono verdi;
- i rischi residui piu utili da chiudere non sono nuove feature grandi, ma contratti pubblici che devono fallire in modo esplicito quando ricevono dati ambigui;
- la coerenza fra registry, status e verifiche SLE va mantenuta come barriera di sicurezza.

### 1. Contratto status risultati

- [x] Validare `CalculationResult.status` contro gli status pubblici centralizzati.
- [x] Aggiungere regressione che rifiuta uno status libero come `error`.

### 2. Registry applicativo

- [x] Impedire la registrazione silenziosa di due applicazioni con lo stesso `id`.
- [x] Verificare nei test che l'ordine/id del registry di default resti allineato a `APPLICATION_CATALOG`.

### 3. Verifica legno SLE

- [x] Evitare che `TimberBeamVerification` usi risultati ULS come fallback per la verifica di freccia SLE.
- [x] Esporre `serviceability.status = not-analyzed` quando mancano combinazioni SLE.
- [x] Aggiungere un test ULS-only che confermi assenza di check `timber-deflection` e warning esplicito.
