# Beam Validation Campaign

La campagna di validazione vive in `validation/beamValidationCampaign.js` ed e separata dagli esempi dimostrativi. Il nome storico del file resta legato alle travi, ma la campagna copre anche verifiche locali di c.a., acciaio, muratura, legno, XLAM e sistemi collaboranti.

Obiettivo:

* raccogliere casi numerici con valori attesi, fonte, ipotesi, tolleranze e grandezze confrontate;
* rendere ripetibile la verifica dei passaggi chiave del motore di calcolo;
* produrre un report consultabile in Markdown o JSON.

## Comandi

```bash
npm run validation
npm run validation -- --json
npm run check
```

`npm run validation` stampa il report Markdown e termina con codice diverso da zero se almeno un caso fallisce.

`npm run validation -- --json` stampa lo stesso contenuto in forma serializzata, utile per script o confronti automatici.

`npm run check` esegue test, validazione, controllo dei confini architetturali
e verifica del bundle Web Worker; e il gate locale consigliato prima di
consegnare modifiche.

La suite `npm test` include anche la campagna tramite `tests/beamValidationCampaign.test.js`, in modo da intercettare regressioni numeriche dentro il ciclo ordinario dei test.

## Report Markdown

Il report generato da `formatBeamValidationReport()` contiene:

* stato complessivo, numero casi, passati e falliti;
* riepilogo per categoria;
* riepilogo per tipo fonte (`sourceKind`);
* indice dei casi con sorgente, numero controlli e intervallo delle tolleranze;
* dettaglio per caso con titolo, fonte, ipotesi/note e tabella dei confronti.

Ogni riga di dettaglio espone la grandezza confrontata tramite `path`, il valore attuale, il valore atteso e la tolleranza applicata.

## Struttura Caso

Ogni caso dichiara:

```js
{
  id,
  title,
  category,
  source,
  sourceKind,
  notes,
  evaluate,
  expectations
}
```

`evaluate()` restituisce un oggetto serializzabile con i valori calcolati.

`sourceKind` distingue il livello di autorevolezza o uso del caso:

* `external-reference`: fonte esterna normativa, manuale o worked example autorevole;
* `external-worked-example`: worked example pubblico usato come confronto indipendente;
* `project-regression`: relazione, workbook o report locale utile come regressione, non assunto come verita assoluta;
* `internal-reference`: formula chiusa o contratto interno deterministico.

Ogni aspettativa usa:

```js
{
  id,
  path,
  expected,
  tolerance,
  type
}
```

Tipi supportati:

* `approx`: confronto numerico con tolleranza;
* `equal`: confronto esatto;
* `greater-than`: confronto di soglia inferiore.

## Copertura Attuale

La prima tranche estesa include:

* acciaio: classificazione locale, resistenza flessionale/tagliante, instabilita LTB e aste compresse da SCI P364;
* cemento armato: combinazioni di carico da relazioni locali, pressione fondazione, interazione N-M da JRC EC2, taglio e SLE;
* muratura: bilinearizzazione della curva di capacita e regressioni su report cerchiature derivati da input MATLAB;
* legno e sistemi collaboranti: worked example EC5, workbook locali per travi lignee, legno-XLAM e legno-calcestruzzo;
* XLAM: regressione locale per flessione, deformazioni e vibrazioni;
* contratti trasversali: FEM trave, selezione stazioni di verifica e mapping SLE.

Le note di fonte e promozione dei casi sono raccolte anche in:

* `validation/steel-validation-sources.md`;
* `validation/reinforced-concrete-sources.md`;
* `validation/timber-xlam-validation-sources.md`;
* `validation/masonry-validation-sources.md`.

## Criteri di Inserimento

Un nuovo caso dovrebbe entrare solo se dichiara:

* fonte o origine del dato;
* ipotesi principali e limiti di interpretazione;
* grandezze confrontate;
* tolleranza numerica motivata;
* motivo per cui e un benchmark esterno, una regressione di progetto o un contratto interno.

Per relazioni e workbook locali, il caso resta `project-regression` finche non viene confrontato anche con una fonte indipendente o con un calcolo manuale ricostruito.
