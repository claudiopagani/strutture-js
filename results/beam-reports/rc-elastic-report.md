# Trave in c.a. elastica C25/30

Analisi elastica non fessurata con rigidezza trasformata e prima verifica ULS di sezione da azioni FEM.

## Modello

* ID: rc-elastic-report
* Unita: kN, m
* Modello di analisi: euler-bernoulli
* Lunghezza: 5 m
* Luce orizzontale: 5 m

## Vincoli

| ID | Nodo | Stazione | Tipo | ux | uy | rz |
| --- | --- | --- | --- | --- | --- | --- |
| start-support | rc-elastic-report-beam-node-1 | 0 | hinge | si | si | no |
| end-support | rc-elastic-report-beam-node-7 | 5 | roller | no | si | no |

## Carichi

| ID | Caso | Tipo | Durata | Fattore |
| --- | --- | --- | --- | --- |
| g1 | G1 | G1 | permanent | 1 |
| live | LIVE | Qk | medium | 1 |

## Combinazioni

| ID | Stato limite | Tipo | Fattori |
| --- | --- | --- | --- |
| rc-elastic-report-ULS-LIVE | ULS | ULS_STR_GEO | G1: 1.3, LIVE: 1.5 |
| rc-elastic-report-SLE_RARE-LIVE | SLE | SLE_RARE | G1: 1, LIVE: 1 |

## Rigidezze adottate

| ID | SL | Tipo | EA | EI | GA | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rc-elastic-report-ULS-LIVE | ULS | ULS_STR_GEO | 4985293.7829 | 108918.2513 | 1967250 | - | - |
| rc-elastic-report-SLE_RARE-LIVE | SLE | SLE_RARE | 4985293.7829 | 108918.2513 | 1967250 | - | - |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | rc-elastic-report-ULS-LIVE | ULS | 55.9375 | 2.5 |
| V max | rc-elastic-report-ULS-LIVE | ULS | 44.75 | 0 |
| V min | rc-elastic-report-ULS-LIVE | ULS | -44.75 | 5 |
| Freccia SLE max assoluta | rc-elastic-report-SLE_RARE-LIVE | SLE | 0.001 | 2.5 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | rc-elastic-report-ULS-LIVE | ULS | start-support | 0 | 0 |
| Ry max assoluto | rc-elastic-report-ULS-LIVE | ULS | start-support | 44.75 | 0 |
| Mrz max assoluto | rc-elastic-report-ULS-LIVE | ULS | start-support | 0 | 0 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| rc-uls-uniaxial-bending | Uniaxial bending resistance at assigned axial force | 55937500 | 103510562.2613 | 0.54 | si |

## Esito

* Stato: ok
* Utilizzo governante: 0.54
* Verifica governante: rc-uls-uniaxial-bending

## Warning

* Shear resistance, crack control, detailing and second-order effects are not included in this first RC beam verification.

## Assunzioni

* Current workflow implements only ULS uniaxial resistance with concrete ultimate strain governing the compressed edge.
* Concrete in tension is neglected during the ULS resistance integration.
* Each FEM station is checked as an independent uniaxial RC section at the corresponding N-M pair.
