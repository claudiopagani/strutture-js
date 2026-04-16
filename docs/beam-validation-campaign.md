# Beam Validation Campaign

La campagna di validazione delle travi semplici vive in `validation/beamValidationCampaign.js` ed e separata dagli esempi dimostrativi.

Obiettivo:

* raccogliere casi numerici con valori attesi, tolleranze, fonte e note;
* rendere ripetibile la verifica dei passaggi chiave del motore trave;
* produrre un report sintetico consultabile in Markdown o JSON.

## Comandi

```bash
npm run validation
npm run validation -- --json
```

Il comando esce con codice diverso da zero se almeno un caso fallisce.

La suite `npm test` include anche la campagna tramite `tests/beamValidationCampaign.test.js`.

## Casi iniziali

* `beam-eb-simply-supported-udl`: trave Euler-Bernoulli appoggio-appoggio con carico uniforme, validata contro formule chiuse di reazione, momento massimo e freccia.
* `steel-ipe200-classification-pure-bending`: classificazione locale di un profilo IPE200 S275 in flessione pura.
* `rc-shear-stirrups-cottheta-optimization`: taglio c.a. con staffe verticali e ottimizzazione di `cotTheta`, regressione dal foglio fornito.
* `rc-sle-stress-limit-factors`: limiti tensionali SLE `0.60 fck`, `0.45 fck` e `0.80 fyk`.
* `rc-sle-crack-environment-mapping`: classe di fessurazione indiretta da ambiente e combinazione.
* `rc-sle-crack-tension-group-selection`: selezione automatica del gruppo teso inferiore/superiore in funzione del segno del momento.
* `beam-verification-user-station-selection`: contratto `verificationStations` con filtro sulle stazioni utente.

## Struttura Caso

Ogni caso dichiara:

```js
{
  id,
  title,
  category,
  source,
  notes,
  evaluate,
  expectations
}
```

`evaluate()` restituisce un oggetto serializzabile con i valori calcolati.

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

## Estensioni Prioritarie

* acciaio: LTB con `Mcr` utente per UPN, aste compresse, interazione `N + My`;
* c.a.: SLE tensioni, fessurazione indiretta, frecce fessurate;
* legno: appoggio-appoggio, mensola, carico puntuale e freccia finale;
* composti: geometria inclinata o carico puntuale;
* XLAM trave: rigidezza Timoshenko, taglio e freccia.
