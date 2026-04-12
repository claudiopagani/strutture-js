# Trave composta legno-calcestruzzo

Trave collaborante con soletta in calcestruzzo e connettori.

## Modello

* ID: timber-concrete-report
* Unita: N, mm
* Modello di analisi: euler-bernoulli
* Lunghezza: 4250 mm
* Luce orizzontale: 4250 mm

## Vincoli

| ID | Nodo | Stazione | Tipo | ux | uy | rz |
| --- | --- | --- | --- | --- | --- | --- |
| start-support | timber-concrete-report-beam-node-1 | 0 | hinge | si | si | no |
| end-support | timber-concrete-report-beam-node-9 | 4250 | roller | no | si | no |

## Carichi

| ID | Caso | Tipo | Durata | Fattore |
| --- | --- | --- | --- | --- |
| g1 | G1 | G1 | permanent | 1 |
| live | LIVE | Qk | medium | 1 |

## Combinazioni

| ID | Stato limite | Tipo | Fattori |
| --- | --- | --- | --- |
| timber-concrete-report-ULS-LIVE | ULS | ULS_STR_GEO | G1: 1.3, LIVE: 1.5 |
| timber-concrete-report-SLE_RARE-LIVE | SLE | SLE_RARE | G1: 1, LIVE: 1 |

## Rigidezze adottate

| ID | SL | Tipo | EA | EI | GA | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- |
| timber-concrete-report-ULS-LIVE | ULS | ULS_STR_GEO | 4004408000 | 10787141677579.354 | - | 0.8 | 0.6 |
| timber-concrete-report-SLE_RARE-LIVE | SLE | SLE_RARE | 2502755000 | 9003235314404.855 | - | 0.8 | 0.6 |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | timber-concrete-report-ULS-LIVE | ULS | 28222656.25 | 2125 |
| V max | timber-concrete-report-ULS-LIVE | ULS | 26562.5 | 0 |
| V min | timber-concrete-report-ULS-LIVE | ULS | -26562.5 | 4250 |
| Freccia SLE max assoluta | timber-concrete-report-SLE_RARE-LIVE | SLE | 4.2466 | 2125 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | timber-concrete-report-ULS-LIVE | ULS | start-support | 0 | 0 |
| Ry max assoluto | timber-concrete-report-ULS-LIVE | ULS | end-support | 26562.5 | 4250 |
| Mrz max assoluto | timber-concrete-report-SLE_RARE-LIVE | SLE | start-support | 0 | 0 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| timber-bottom-stress | Timber stress at intrados | 2.3632 | 9.4815 | 0.249 | si |
| timber-top-stress | Timber stress at extrados | 4.8317 | 9.4815 | 0.51 | si |
| slab-bending | RC slab bending verification | 2668185.6873 | 6968261.5173 | 0.383 | si |
| connector | Connector shear-flow verification | 9583.571 | 10293.3333 | 0.931 | si |
| deflection | Serviceability deflection verification | 4.2466 | 170 | 0.025 | si |

## Esito

* Stato: ok
* Utilizzo governante: 0.931
* Verifica governante: connector

## Warning

* Nessun warning.

## Assunzioni

* Dimensional inputs are normalized through the unit layer when units are declared on the model and related domain objects.
* The implementation follows the spreadsheet procedure supplied by the user.
