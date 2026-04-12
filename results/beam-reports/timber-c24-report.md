# Trave in legno C24

Trave appoggio-appoggio con carichi permanenti e variabile.

## Modello

* ID: timber-c24-report
* Unita: kN, m
* Modello di analisi: timoshenko
* Lunghezza: 4 m
* Luce orizzontale: 4 m

## Vincoli

| ID | Nodo | Stazione | Tipo | ux | uy | rz |
| --- | --- | --- | --- | --- | --- | --- |
| start-support | timber-c24-report-beam-node-1 | 0 | hinge | si | si | no |
| end-support | timber-c24-report-beam-node-5 | 4 | roller | no | si | no |

## Carichi

| ID | Caso | Tipo | Durata | Fattore |
| --- | --- | --- | --- | --- |
| g1 | G1 | G1 | permanent | 1 |
| g2 | G2 | G2 | permanent | 1 |
| live | LIVE | Qk | medium | 1 |

## Combinazioni

| ID | Stato limite | Tipo | Fattori |
| --- | --- | --- | --- |
| timber-c24-report-ULS-LIVE | ULS | ULS_STR_GEO | G1: 1.3, G2: 1.5, LIVE: 1.5 |
| timber-c24-report-SLE_RARE-LIVE | SLE | SLE_RARE | G1: 1, G2: 1, LIVE: 1 |
| timber-c24-report-SLE_QUASI_PERMANENT-all | SLE | SLE_QUASI_PERMANENT | G1: 1, G2: 1, LIVE: 0.3 |

## Rigidezze adottate

| ID | SL | Tipo | EA | EI | GA | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- |
| timber-c24-report-ULS-LIVE | ULS | ULS_STR_GEO | 431200 | 2817.1733 | 26950 | 0.8 | 0.6 |
| timber-c24-report-SLE_RARE-LIVE | SLE | SLE_RARE | 431200 | 2817.1733 | 26950 | 0.8 | 0.6 |
| timber-c24-report-SLE_QUASI_PERMANENT-all | SLE | SLE_QUASI_PERMANENT | 269500 | 1760.7333 | 16843.75 | 0.8 | 0.6 |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | timber-c24-report-ULS-LIVE | ULS | 6.28 | 2 |
| V max | timber-c24-report-ULS-LIVE | ULS | 6.28 | 0 |
| V min | timber-c24-report-ULS-LIVE | ULS | -6.28 | 4 |
| Freccia SLE max assoluta | timber-c24-report-SLE_QUASI_PERMANENT-all | SLE | 0.0031 | 2 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | timber-c24-report-ULS-LIVE | ULS | start-support | 0 | 0 |
| Ry max assoluto | timber-c24-report-ULS-LIVE | ULS | end-support | 6.28 | 4 |
| Mrz max assoluto | timber-c24-report-ULS-LIVE | ULS | start-support | 0 | 0 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| timber-bending | Bending stress verification | 6.28 | 23.4155 | 0.268 | si |
| timber-shear | Shear stress verification | 6.28 | 55.7511 | 0.113 | si |
| timber-deflection | Serviceability vertical deflection verification | 0.0028 | 0.0133 | 0.21 | si |
| timber-final-deflection | Final serviceability vertical deflection verification | 0.0031 | 0.0133 | 0.229 | si |

## Esito

* Stato: ok
* Utilizzo governante: 0.268
* Verifica governante: timber-bending

## Warning

* Lateral torsional stability is not included in this first timber beam verification.

## Assunzioni

* Nessuna assunzione aggiuntiva.
