# Trave in legno lamellare GL24h

Trave lamellare con luce maggiore e controllo di deformabilita.

## Modello

* ID: glulam-gl24h-report
* Unita: kN, m
* Modello di analisi: timoshenko
* Lunghezza: 6 m
* Luce orizzontale: 6 m

## Vincoli

| ID | Nodo | Stazione | Tipo | ux | uy | rz |
| --- | --- | --- | --- | --- | --- | --- |
| start-support | glulam-gl24h-report-beam-node-1 | 0 | hinge | si | si | no |
| end-support | glulam-gl24h-report-beam-node-5 | 6 | roller | no | si | no |

## Carichi

| ID | Caso | Tipo | Durata | Fattore |
| --- | --- | --- | --- | --- |
| g1 | G1 | G1 | permanent | 1 |
| g2 | G2 | G2 | permanent | 1 |
| live | LIVE | Qk | medium | 1 |

## Combinazioni

| ID | Stato limite | Tipo | Fattori |
| --- | --- | --- | --- |
| glulam-gl24h-report-ULS-LIVE | ULS | ULS_STR_GEO | G1: 1.3, G2: 1.5, LIVE: 1.5 |
| glulam-gl24h-report-SLE_RARE-LIVE | SLE | SLE_RARE | G1: 1, G2: 1, LIVE: 1 |
| glulam-gl24h-report-SLE_QUASI_PERMANENT-all | SLE | SLE_QUASI_PERMANENT | G1: 1, G2: 1, LIVE: 0.3 |

## Rigidezze adottate

| ID | SL | Tipo | EA | EI | GA | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- |
| glulam-gl24h-report-ULS-LIVE | ULS | ULS_STR_GEO | 662400 | 7153.92 | 41400 | 0.8 | 0.6 |
| glulam-gl24h-report-SLE_RARE-LIVE | SLE | SLE_RARE | 662400 | 7153.92 | 41400 | 0.8 | 0.6 |
| glulam-gl24h-report-SLE_QUASI_PERMANENT-all | SLE | SLE_QUASI_PERMANENT | 414000 | 4471.2 | 25875 | 0.8 | 0.6 |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 21.96 | 3 |
| V max | glulam-gl24h-report-ULS-LIVE | ULS | 14.64 | 0 |
| V min | glulam-gl24h-report-ULS-LIVE | ULS | -14.64 | 6 |
| Freccia SLE max assoluta | glulam-gl24h-report-SLE_QUASI_PERMANENT-all | SLE | 0.0091 | 3 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | start-support | 0 | 0 |
| Ry max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | start-support | 14.64 | 0 |
| Mrz max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | start-support | 0 | 0 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| timber-bending | Bending stress verification | 21.96 | 44.2368 | 0.496 | si |
| timber-shear | Shear stress verification | 14.64 | 71.68 | 0.204 | si |
| timber-deflection | Serviceability vertical deflection verification | 0.0085 | 0.02 | 0.423 | si |
| timber-final-deflection | Final serviceability vertical deflection verification | 0.0091 | 0.02 | 0.454 | si |

## Dettagli verifiche

| Verifica | Parametro | Valore |
| --- | --- | --- |
| timber-bending | resultId | glulam-gl24h-report-ULS-LIVE |
| timber-bending | resultType | combination |
| timber-bending | station | 3 |
| timber-bending | limitState | ULS |
| timber-bending | fmD | 12.8 |
| timber-bending | kmod | 0.8 |
| timber-bending | gammaM | 1.5 |
| timber-shear | resultId | glulam-gl24h-report-ULS-LIVE |
| timber-shear | resultType | combination |
| timber-shear | station | 0 |
| timber-shear | limitState | ULS |
| timber-shear | fvD | 1.8667 |
| timber-shear | shearArea | 57600 |
| timber-deflection | combinationId | glulam-gl24h-report-SLE_RARE-LIVE |
| timber-deflection | station | 3 |
| timber-deflection | limitDenominator | 300 |
| timber-final-deflection | combinationId | glulam-gl24h-report-SLE_QUASI_PERMANENT-all |
| timber-final-deflection | station | 3 |
| timber-final-deflection | limitDenominator | 300 |

## Esito

* Stato: ok
* Utilizzo governante: 0.496
* Verifica governante: timber-bending

## Warning

* Lateral torsional stability is not included in this first timber beam verification.

## Assunzioni

* Nessuna assunzione aggiuntiva.
