# Azione della neve NTC 2018

Il modulo `strutture-js/norms/ntc2018` calcola localmente il carico
caratteristico della neve sulle coperture e lo associa a una `SnowAction` e a
un `AreaLoad` serializzabili. Non effettua geolocalizzazione, chiamate di rete
o selezioni implicite basate sul comune o sulla provincia.

## Fonte e convenzione

L'implementazione segue il D.M. 17 gennaio 2018, NTC 2018, paragrafo 3.4:

- paragrafo 3.4.1 ed equazione [3.4.1] per
  `qs = mu_i * qsk * CE * Ct`;
- paragrafo 3.4.2 ed equazioni [3.4.2]-[3.4.5] per il carico al suolo;
- paragrafo 3.4.3 e Tabella 3.4.II per il coefficiente nominale `mu1`;
- paragrafo 3.4.4 e Tabella 3.4.I per il coefficiente di esposizione;
- paragrafo 3.4.5 per il coefficiente termico.

Il testo ufficiale e pubblicato nel
[Supplemento ordinario n. 8 alla Gazzetta Ufficiale n. 42 del 20 febbraio 2018](https://www.gazzettaufficiale.it/eli/gu/2018/02/20/42/so/8/sg/pdf).

Il carico risultante agisce verticalmente ed e riferito alla proiezione
orizzontale della copertura. Il sistema interno e
`{ force: "kN", length: "m" }`.

## Carico della neve al suolo

`calculateNTC2018GroundSnowLoad` richiede la zona e la quota del sito. Le zone
pubbliche sono:

| ID | Quota fino a 200 m | Quota oltre 200 m |
| --- | ---: | --- |
| `I_ALPINE` | `1.50 kN/m^2` | `1.39 * [1 + (as / 728)^2]` |
| `I_MEDITERRANEAN` | `1.50 kN/m^2` | `1.35 * [1 + (as / 602)^2]` |
| `II` | `1.00 kN/m^2` | `0.85 * [1 + (as / 481)^2]` |
| `III` | `0.60 kN/m^2` | `0.51 * [1 + (as / 481)^2]` |

La libreria non associa province o coordinate a una zona: `zone` e una scelta
tecnica esplicita del consumer.

Le formule zonali vengono applicate fino a 1500 m. Per quote superiori,
`calculateNTC2018SnowAreaLoad` restituisce `not-supported` se manca un valore
locale documentato. Un `groundSnowLoad` esplicito deve avere
`groundSnowLoadSource` e non puo essere inferiore al valore zonale calcolato a
1500 m.

## Coefficienti di copertura

Per una falda con scorrimento non impedito,
`calculateNTC2018PitchedRoofShapeCoefficient` applica:

| Inclinazione `alpha` | `mu1` |
| --- | ---: |
| `0 <= alpha <= 30 gradi` | `0.8` |
| `30 < alpha < 60 gradi` | `0.8 * (60 - alpha) / 30` |
| `alpha >= 60 gradi` | `0` |

Se `slidingPrevented` e `true`, viene applicato il limite inferiore `mu1 =
0.8` previsto quando la parte bassa della falda termina con parapetto,
barriera o altra ostruzione.

Le classi di esposizione disponibili sono `WIND_SWEPT` (`CE = 0.9`), `NORMAL`
(`CE = 1.0`) e `SHELTERED` (`CE = 1.1`). Una valutazione diversa puo essere
fornita con `exposureCoefficient` e una fonte esplicita.

In assenza di uno studio specifico documentato, il workflow applica `Ct = 1`.
Un valore diverso richiede `thermalCoefficientSource`.

## Workflow completo

```js
import {
  calculateNTC2018SnowAreaLoad,
} from "strutture-js/norms/ntc2018";

const result = calculateNTC2018SnowAreaLoad({
  id: "roof-snow",
  actionId: "snow-action",
  zone: "I_ALPINE",
  siteAltitude: 300,
  roofAngleDegrees: 20,
  exposureClass: "NORMAL",
  units: { force: "kN", length: "m" },
});
```

Il risultato usa lo schema `ntc2018-snow-area-load/v1` e conserva:

- `qsk`, formula zonale e quota normalizzata;
- coefficiente di forma e ipotesi sullo scorrimento;
- `CE` e `Ct` con la relativa provenienza;
- `qs`, formula e operandi normalizzati;
- `SnowAction`, inclusi i fattori di combinazione per quota fino a o oltre
  1000 m;
- `AreaLoad` verticale riferito alla proiezione orizzontale.

## Valori documentati e limiti

Per coperture complesse e possibile fornire direttamente
`shapeCoefficient`, accompagnato da `shapeCoefficientSource`. Lo stesso
meccanismo e disponibile per `groundSnowLoad`, `exposureCoefficient` e per un
`thermalCoefficient` diverso da uno.

Questi valori vengono validati e conservati, ma la libreria non ricostruisce
la configurazione geometrica che li ha prodotti. In particolare questo primo
incremento non genera:

- i tre casi alternativi completi delle coperture a due falde;
- accumuli per coperture multiple o contigue a edifici piu alti;
- accumuli contro parapetti, barriere o altri ostacoli;
- distribuzioni locali ricavate dalla Circolare o da altri documenti tecnici;
- riduzioni del periodo di ritorno per fasi costruttive o transitorie.

Per questi casi il consumer deve fornire coefficienti e configurazioni
documentati oppure attendere un'estensione specifica del kernel locale. La
libreria non trasforma il limite in un valore nominale apparentemente
completo.
