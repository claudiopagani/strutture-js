# Trave composta legno-calcestruzzo

Trave collaborante con soletta in calcestruzzo e connettori.

## Modello

* ID: timber-concrete-report
* Unita: N, mm
* Modello di analisi: euler-bernoulli
* Lunghezza: 4250 mm
* Luce orizzontale: 4250 mm

## Assi principali

| Parametro | Valore | Unita |
| --- | --- | --- |
| Alpha | 0 | rad |
| Alpha input | - | - |
| Convenzione | roof-slope | - |
| Asse principale | principalY | - |
| Fonte EI verticale | flexuralRigidity-principal-y | - |
| Fonte GA verticale | shearRigidity-unavailable | - |

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

| ID | SL | Tipo | EA | EI vert. | EI Y | EI Z | GA vert. | GA Y | GA Z | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| timber-concrete-report-ULS-LIVE | ULS | ULS_STR_GEO | 4004408000 | 10787141677579.354 | 10787141677579.354 | 920280326666666.6 | - | - | - | 0.8 | 0.6 |
| timber-concrete-report-SLE_RARE-LIVE | SLE | SLE_RARE | 2502755000 | 9003235314404.855 | 9003235314404.855 | 575175204166666.6 | - | - | - | 0.8 | 0.6 |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | timber-concrete-report-ULS-LIVE | ULS | 28222656.25 | 2125 |
| MY max assoluto | timber-concrete-report-ULS-LIVE | ULS | 28222656.25 | 2125 |
| MZ max assoluto | timber-concrete-report-ULS-LIVE | ULS | 0 | 0 |
| V max | timber-concrete-report-ULS-LIVE | ULS | 26562.5 | 0 |
| V min | timber-concrete-report-ULS-LIVE | ULS | -26562.5 | 4250 |
| VY max assoluto | timber-concrete-report-ULS-LIVE | ULS | 26562.5 | 4250 |
| VZ max assoluto | timber-concrete-report-ULS-LIVE | ULS | 0 | 0 |
| Freccia SLE max assoluta | timber-concrete-report-SLE_RARE-LIVE | SLE | 4.2466 | 2125 |

## Azioni principali

| Dominio | Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Tutti | MY max assoluto | timber-concrete-report-ULS-LIVE | ULS | 28222656.25 | 2125 |
| Tutti | MZ max assoluto | G1 | - | 0 | 0 |
| Tutti | VY max assoluto | timber-concrete-report-ULS-LIVE | ULS | 26562.5 | 4250 |
| Tutti | VZ max assoluto | G1 | - | 0 | 0 |
| Combinazioni | MY max assoluto | timber-concrete-report-ULS-LIVE | ULS | 28222656.25 | 2125 |
| Combinazioni | MZ max assoluto | timber-concrete-report-ULS-LIVE | ULS | 0 | 0 |
| Combinazioni | VY max assoluto | timber-concrete-report-ULS-LIVE | ULS | 26562.5 | 4250 |
| Combinazioni | VZ max assoluto | timber-concrete-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | MY max assoluto | timber-concrete-report-ULS-LIVE | ULS | 28222656.25 | 2125 |
| SLU | MZ max assoluto | timber-concrete-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | VY max assoluto | timber-concrete-report-ULS-LIVE | ULS | 26562.5 | 4250 |
| SLU | VZ max assoluto | timber-concrete-report-ULS-LIVE | ULS | 0 | 0 |
| SLE | MY max assoluto | timber-concrete-report-SLE_RARE-LIVE | SLE | 20320312.5 | 2125 |
| SLE | MZ max assoluto | timber-concrete-report-SLE_RARE-LIVE | SLE | 0 | 0 |
| SLE | VY max assoluto | timber-concrete-report-SLE_RARE-LIVE | SLE | 19125 | 0 |
| SLE | VZ max assoluto | timber-concrete-report-SLE_RARE-LIVE | SLE | 0 | 0 |

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

## Dettagli verifiche

| Verifica | Parametro | Valore |
| --- | --- | --- |
| timber-bottom-stress | resultId | timber-concrete-report-ULS-LIVE |
| timber-bottom-stress | resultType | combination |
| timber-bottom-stress | station | 2125 |
| timber-bottom-stress | limitState | ULS |
| timber-bottom-stress | stationSource | critical |
| timber-bottom-stress | stationRole | critical-bending |
| timber-bottom-stress | stationSelectionMode | all |
| timber-bottom-stress | isRequestedStation | false |
| timber-bottom-stress | isUserStation | false |
| timber-bottom-stress | isGridStation | false |
| timber-bottom-stress | isCriticalStation | true |
| timber-bottom-stress | stationTolerance | 0 |
| timber-bottom-stress | method | gelfi-gamma-method-section-actions |
| timber-bottom-stress | gammaUls | 0.1981 |
| timber-bottom-stress | inertiaEffUls | 980649243.4163 |
| timber-bottom-stress | mZEd | 0 |
| timber-bottom-stress | vZEd | 0 |
| timber-bottom-stress | mZEdSectionUnits | 0 |
| timber-bottom-stress | vZEdSectionUnits | 0 |
| timber-bottom-stress | weakAxisComponentsNeglected | false |
| timber-bottom-stress | weakAxisNeglectReason | - |
| timber-top-stress | resultId | timber-concrete-report-ULS-LIVE |
| timber-top-stress | resultType | combination |
| timber-top-stress | station | 2125 |
| timber-top-stress | limitState | ULS |
| timber-top-stress | stationSource | critical |
| timber-top-stress | stationRole | critical-bending |
| timber-top-stress | stationSelectionMode | all |
| timber-top-stress | isRequestedStation | false |
| timber-top-stress | isUserStation | false |
| timber-top-stress | isGridStation | false |
| timber-top-stress | isCriticalStation | true |
| timber-top-stress | stationTolerance | 0 |
| timber-top-stress | method | gelfi-gamma-method-section-actions |
| timber-top-stress | gammaUls | 0.1981 |
| timber-top-stress | inertiaEffUls | 980649243.4163 |
| timber-top-stress | mZEd | 0 |
| timber-top-stress | vZEd | 0 |
| timber-top-stress | mZEdSectionUnits | 0 |
| timber-top-stress | vZEdSectionUnits | 0 |
| timber-top-stress | weakAxisComponentsNeglected | false |
| timber-top-stress | weakAxisNeglectReason | - |
| slab-bending | resultId | timber-concrete-report-ULS-LIVE |
| slab-bending | resultType | combination |
| slab-bending | station | 2125 |
| slab-bending | limitState | ULS |
| slab-bending | stationSource | critical |
| slab-bending | stationRole | critical-bending |
| slab-bending | stationSelectionMode | all |
| slab-bending | isRequestedStation | false |
| slab-bending | isUserStation | false |
| slab-bending | isGridStation | false |
| slab-bending | isCriticalStation | true |
| slab-bending | stationTolerance | 0 |
| slab-bending | method | gelfi-gamma-method-section-actions |
| slab-bending | gammaUls | 0.1981 |
| slab-bending | inertiaEffUls | 980649243.4163 |
| slab-bending | mZEd | 0 |
| slab-bending | vZEd | 0 |
| slab-bending | mZEdSectionUnits | 0 |
| slab-bending | vZEdSectionUnits | 0 |
| slab-bending | weakAxisComponentsNeglected | false |
| slab-bending | weakAxisNeglectReason | - |
| connector | type | circular-reference |

## Esito

* Stato: ok
* Utilizzo governante: 0.931
* Verifica governante: connector

## Warning

* Nessun warning.

## Assunzioni

* Dimensional inputs are normalized through the unit layer when units are declared on the model and related domain objects.
* The implementation follows the spreadsheet procedure supplied by the user.
