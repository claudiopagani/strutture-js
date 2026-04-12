# Mensola in acciaio S355 HEA200

Mensola con carico puntuale in estremita e verifiche base.

## Modello

* ID: steel-cantilever-s355-report
* Unita: kN, m
* Modello di analisi: timoshenko
* Lunghezza: 3 m
* Luce orizzontale: 3 m

## Vincoli

| ID | Nodo | Stazione | Tipo | ux | uy | rz |
| --- | --- | --- | --- | --- | --- | --- |
| start-support | steel-cantilever-s355-report-beam-node-1 | 0 | fixed | si | si | si |

## Carichi

| ID | Caso | Tipo | Durata | Fattore |
| --- | --- | --- | --- | --- |
| g1 | G1 | G1 | permanent | 1 |
| tip-load | LIVE | Qk | medium | 1 |

## Combinazioni

| ID | Stato limite | Tipo | Fattori |
| --- | --- | --- | --- |
| steel-cantilever-s355-report-ULS-LIVE | ULS | ULS_STR_GEO | G1: 1.3, LIVE: 1.5 |
| steel-cantilever-s355-report-SLE_RARE-LIVE | SLE | SLE_RARE | G1: 1, LIVE: 1 |

## Rigidezze adottate

| ID | SL | Tipo | EA | EI | GA | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- |
| steel-cantilever-s355-report-ULS-LIVE | ULS | ULS_STR_GEO | 1130430000 | 7753199999999.998 | 323076923.0769 | - | - |
| steel-cantilever-s355-report-SLE_RARE-LIVE | SLE | SLE_RARE | 1130430000 | 7753199999999.998 | 323076923.0769 | - | - |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 35.775 | 0 |
| V max | steel-cantilever-s355-report-ULS-LIVE | ULS | 14.85 | 0 |
| V min | steel-cantilever-s355-report-ULS-LIVE | ULS | 9 | 3 |
| Freccia SLE max assoluta | steel-cantilever-s355-report-SLE_RARE-LIVE | SLE | 0 | 3 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | start-support | 0 | 0 |
| Ry max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | start-support | 14.85 | 0 |
| Mrz max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | start-support | 35.775 | 0 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| steel-bending | Elastic bending resistance verification | 35.775 | 131385660 | 0 | si |
| steel-shear | Shear resistance verification | 14.85 | 780808.5041 | 0 | si |
| steel-axial | Axial resistance verification | 0 | 1819992.3 | 0 | si |
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
