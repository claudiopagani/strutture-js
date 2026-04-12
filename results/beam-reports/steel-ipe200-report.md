# Trave in acciaio IPE200

Trave appoggio-appoggio con profilo IPE e verifiche base.

## Modello

* ID: steel-ipe200-report
* Unita: kN, m
* Modello di analisi: timoshenko
* Lunghezza: 5 m
* Luce orizzontale: 5 m

## Vincoli

| ID | Nodo | Stazione | Tipo | ux | uy | rz |
| --- | --- | --- | --- | --- | --- | --- |
| start-support | steel-ipe200-report-beam-node-1 | 0 | hinge | si | si | no |
| end-support | steel-ipe200-report-beam-node-5 | 5 | roller | no | si | no |

## Carichi

| ID | Caso | Tipo | Durata | Fattore |
| --- | --- | --- | --- | --- |
| g1 | G1 | G1 | permanent | 1 |
| live | LIVE | Qk | medium | 1 |

## Combinazioni

| ID | Stato limite | Tipo | Fattori |
| --- | --- | --- | --- |
| steel-ipe200-report-ULS-LIVE | ULS | ULS_STR_GEO | G1: 1.3, LIVE: 1.5 |
| steel-ipe200-report-SLE_RARE-LIVE | SLE | SLE_RARE | G1: 1, LIVE: 1 |

## Rigidezze adottate

| ID | SL | Tipo | EA | EI | GA | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- |
| steel-ipe200-report-ULS-LIVE | ULS | ULS_STR_GEO | 598080000 | 4080299999999.999 | 137307692.3077 | - | - |
| steel-ipe200-report-SLE_RARE-LIVE | SLE | SLE_RARE | 598080000 | 4080299999999.999 | 137307692.3077 | - | - |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | steel-ipe200-report-ULS-LIVE | ULS | 21.5625 | 2.5 |
| V max | steel-ipe200-report-ULS-LIVE | ULS | 17.25 | 0 |
| V min | steel-ipe200-report-ULS-LIVE | ULS | -17.25 | 5 |
| Freccia SLE max assoluta | steel-ipe200-report-SLE_RARE-LIVE | SLE | 0 | 2.5 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | steel-ipe200-report-ULS-LIVE | ULS | start-support | 0 | 0 |
| Ry max assoluto | steel-ipe200-report-ULS-LIVE | ULS | start-support | 17.25 | 0 |
| Mrz max assoluto | steel-ipe200-report-ULS-LIVE | ULS | start-support | 0 | 0 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| steel-bending | Elastic bending resistance verification | 0 | 50887170 | 0 | si |
| steel-shear | Shear resistance verification | 17.25 | 257053.6604 | 0 | si |
| steel-axial | Axial resistance verification | 0 | 745891.2 | 0 | si |
| steel-axial-bending-interaction | Linear axial-bending interaction | 0 | 1 | 0 | si |

## Esito

* Stato: ok
* Utilizzo governante: 0
* Verifica governante: steel-shear

## Warning

* Section classification and local buckling are not included in this first steel verification.
* Lateral-torsional buckling and member stability are not included yet.

## Assunzioni

* Nessuna assunzione aggiuntiva.
