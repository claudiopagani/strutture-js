# Validazione deformata RC appoggio-appoggio

Confronto tra sezione interamente reagente, sezione totalmente fessurata, workflow dell'app con Mcr + tension stiffening e screening di snellezza.

## Geometria

- Luce: 5 m
- Sezione: 300 x 500 mm
- Combinazione usata per la deformata: SLE_QUASI_PERMANENT
- Rapporto modulare SLE: n = 15

## Vincoli

- start: hinge
- end: roller

## Carichi lineari

- G1: 8 kN/m
- LIVE: 5 kN/m

## Confronto deformate

| Metodo | Freccia max [mm] | Stazione [m] | Note |
| --- | ---: | ---: | --- |
| 1. Interamente reagente (FEM, sezione omogeneizzata n=15) | 0.633 | 2.5 | Cls interamente reagente, armatura trasformata con n = 15. |
| 2. Totalmente fessurata (curvatura fessurata pura) | 4.441 | 2.5 | Cls teso escluso in tutta la trave, senza tension stiffening. |
| 3. Metodo app (Mcr + tension stiffening) | 3.072 | 2.5 | Curvatura media con zeta = 1 - beta (Mcr/M)^2 sopra Mcr. |

## Dati sezione e fessurazione

- Momento di prima fessurazione Mcr: 32 kNm
- Fibre cls usate nel solve fessurato: 308
- Freccia governante metodo app: 3.072 mm
- Freccia governante totalmente fessurata: 4.441 mm

## Verifica semplificata di snellezza

| Controllo | Domanda | Capacita | Utilizzazione | Esito |
| --- | ---: | ---: | ---: | --- |
| L/h | 10 | 20 | 0.5 | OK |

## Lettura dei risultati

- Il metodo 1 fornisce il limite inferiore delle frecce: sezione tutta reagente e non fessurata.
- Il metodo 2 fornisce il limite superiore: la trave e trattata come completamente fessurata lungo tutta la luce.
- Il metodo 3 e il workflow dell'app: sotto Mcr resta non fessurato, sopra Mcr usa la curvatura fessurata mediata con tension stiffening.
- Il controllo di snellezza e uno screening separato e non sostituisce il calcolo della freccia.
