# Striscia XLAM come trave

Pannello XLAM modellato come striscia monodimensionale Timoshenko.

## Modello

* ID: xlam-strip-report
* Unita: kN, m
* Modello di analisi: timoshenko
* Lunghezza: 4.5 m
* Luce orizzontale: 4.5 m

## Assi principali

| Parametro | Valore | Unita |
| --- | --- | --- |
| Alpha | 0 | rad |
| Alpha input | - | - |
| Convenzione | roof-slope | - |
| Asse principale | principalY | - |
| Fonte EI verticale | flexuralRigidity-principal-y | - |
| Fonte GA verticale | shearRigidity-principal-y | - |

## Vincoli

| ID | Nodo | Stazione | Tipo | ux | uy | rz |
| --- | --- | --- | --- | --- | --- | --- |
| start-support | xlam-strip-report-beam-node-1 | 0 | hinge | si | si | no |
| end-support | xlam-strip-report-beam-node-9 | 4.5 | roller | no | si | no |

## Carichi

| ID | Caso | Tipo | Durata | Fattore |
| --- | --- | --- | --- | --- |
| g1 | G1 | G1 | permanent | 1 |
| live | LIVE | Qk | medium | 1 |

## Combinazioni

| ID | Stato limite | Tipo | Fattori |
| --- | --- | --- | --- |
| xlam-strip-report-ULS-LIVE | ULS | ULS_STR_GEO | G1: 1.3, LIVE: 1.5 |
| xlam-strip-report-SLE_RARE-LIVE | SLE | SLE_RARE | G1: 1, LIVE: 1 |
| xlam-strip-report-SLE_QUASI_PERMANENT-all | SLE | SLE_QUASI_PERMANENT | G1: 1, LIVE: 0.3 |

## Rigidezze adottate

| ID | SL | Tipo | EA | EI vert. | EI Y | EI Z | GA vert. | GA Y | GA Z | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| xlam-strip-report-ULS-LIVE | ULS | ULS_STR_GEO | 990000 | 1724.25 | 1724.25 | 82500 | 2800 | 2800 | 62100 | - | 0.8 |
| xlam-strip-report-SLE_RARE-LIVE | SLE | SLE_RARE | 990000 | 1724.25 | 1724.25 | 82500 | 2800 | 2800 | 62100 | - | 0.8 |
| xlam-strip-report-SLE_QUASI_PERMANENT-all | SLE | SLE_QUASI_PERMANENT | 550000 | 957.9167 | 957.9167 | 45833.3333 | 1555.5556 | 1555.5556 | 34500 | - | 0.8 |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | xlam-strip-report-ULS-LIVE | ULS | 10.4794 | 2.25 |
| MY max assoluto | xlam-strip-report-ULS-LIVE | ULS | 10.4794 | 2.25 |
| MZ max assoluto | xlam-strip-report-ULS-LIVE | ULS | 0 | 0 |
| V max | xlam-strip-report-ULS-LIVE | ULS | 9.315 | 0 |
| V min | xlam-strip-report-ULS-LIVE | ULS | -9.315 | 4.5 |
| VY max assoluto | xlam-strip-report-ULS-LIVE | ULS | 9.315 | 4.5 |
| VZ max assoluto | xlam-strip-report-ULS-LIVE | ULS | 0 | 0 |
| Freccia SLE max assoluta | xlam-strip-report-SLE_QUASI_PERMANENT-all | SLE | 0.0156 | 2.25 |

## Azioni principali

| Dominio | Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Tutti | MY max assoluto | xlam-strip-report-ULS-LIVE | ULS | 10.4794 | 2.25 |
| Tutti | MZ max assoluto | G1 | - | 0 | 0 |
| Tutti | VY max assoluto | xlam-strip-report-ULS-LIVE | ULS | 9.315 | 4.5 |
| Tutti | VZ max assoluto | G1 | - | 0 | 0 |
| Combinazioni | MY max assoluto | xlam-strip-report-ULS-LIVE | ULS | 10.4794 | 2.25 |
| Combinazioni | MZ max assoluto | xlam-strip-report-ULS-LIVE | ULS | 0 | 0 |
| Combinazioni | VY max assoluto | xlam-strip-report-ULS-LIVE | ULS | 9.315 | 4.5 |
| Combinazioni | VZ max assoluto | xlam-strip-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | MY max assoluto | xlam-strip-report-ULS-LIVE | ULS | 10.4794 | 2.25 |
| SLU | MZ max assoluto | xlam-strip-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | VY max assoluto | xlam-strip-report-ULS-LIVE | ULS | 9.315 | 4.5 |
| SLU | VZ max assoluto | xlam-strip-report-ULS-LIVE | ULS | 0 | 0 |
| SLE | MY max assoluto | xlam-strip-report-SLE_RARE-LIVE | SLE | 7.5938 | 2.25 |
| SLE | MZ max assoluto | xlam-strip-report-SLE_RARE-LIVE | SLE | 0 | 0 |
| SLE | VY max assoluto | xlam-strip-report-SLE_RARE-LIVE | SLE | 6.75 | 0 |
| SLE | VZ max assoluto | xlam-strip-report-SLE_RARE-LIVE | SLE | 0 | 0 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | xlam-strip-report-ULS-LIVE | ULS | start-support | 0 | 0 |
| Ry max assoluto | xlam-strip-report-ULS-LIVE | ULS | end-support | 9.315 | 4.5 |
| Mrz max assoluto | xlam-strip-report-SLE_QUASI_PERMANENT-all | SLE | end-support | 0 | 4.5 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| xlam-beam-bending | XLAM strip bending stress verification | 4.3455 | 13.2414 | 0.328 | si |
| xlam-beam-rolling-shear | XLAM strip rolling shear verification in cross layers | 0.0901 | 0.6621 | 0.136 | si |
| xlam-beam-deflection | XLAM strip vertical deflection verification | 0.0156 | 0.015 | 1.037 | no |

## Dettagli verifiche

| Verifica | Parametro | Valore |
| --- | --- | --- |
| xlam-beam-bending | resultId | xlam-strip-report-ULS-LIVE |
| xlam-beam-bending | resultType | combination |
| xlam-beam-bending | station | 2.25 |
| xlam-beam-bending | limitState | ULS |
| xlam-beam-bending | stationSource | user |
| xlam-beam-bending | stationRole | verification-user+verification-grid+critical-bending |
| xlam-beam-bending | stationSelectionMode | combined |
| xlam-beam-bending | isRequestedStation | true |
| xlam-beam-bending | isUserStation | true |
| xlam-beam-bending | isGridStation | true |
| xlam-beam-bending | isCriticalStation | true |
| xlam-beam-bending | stationTolerance | 0 |
| xlam-beam-bending | method | xlam-strip-fem-section-actions |
| xlam-beam-bending | e0 | 11000 |
| xlam-beam-bending | bendingStiffness | 1724250000000 |
| xlam-beam-bending | edgeDistance | 65 |
| xlam-beam-bending | kmod | 0.8 |
| xlam-beam-bending | gammaM | 1.45 |
| xlam-beam-bending | kSystem | 1 |
| xlam-beam-bending | includeCrossLayerBending | false |
| xlam-beam-bending | mZEd | 0 |
| xlam-beam-bending | vZEd | 0 |
| xlam-beam-bending | mZEdSectionUnits | 0 |
| xlam-beam-bending | vZEdSectionUnits | 0 |
| xlam-beam-bending | weakAxisComponentsNeglected | false |
| xlam-beam-bending | weakAxisNeglectReason | - |
| xlam-beam-rolling-shear | resultId | xlam-strip-report-ULS-LIVE |
| xlam-beam-rolling-shear | resultType | combination |
| xlam-beam-rolling-shear | station | 0 |
| xlam-beam-rolling-shear | limitState | ULS |
| xlam-beam-rolling-shear | stationSource | grid |
| xlam-beam-rolling-shear | stationRole | verification-grid+support+critical-shear |
| xlam-beam-rolling-shear | stationSelectionMode | combined |
| xlam-beam-rolling-shear | isRequestedStation | true |
| xlam-beam-rolling-shear | isUserStation | false |
| xlam-beam-rolling-shear | isGridStation | true |
| xlam-beam-rolling-shear | isCriticalStation | true |
| xlam-beam-rolling-shear | stationTolerance | 0 |
| xlam-beam-rolling-shear | method | xlam-strip-layer-static-moment |
| xlam-beam-rolling-shear | tau0Max | 0.0901 |
| xlam-beam-rolling-shear | tau90Max | 0.0901 |
| xlam-beam-rolling-shear | rollingShearStrength | 1.2 |
| xlam-beam-rolling-shear | kmod | 0.8 |
| xlam-beam-rolling-shear | gammaM | 1.45 |
| xlam-beam-rolling-shear | mZEd | 0 |
| xlam-beam-rolling-shear | vZEd | 0 |
| xlam-beam-rolling-shear | mZEdSectionUnits | 0 |
| xlam-beam-rolling-shear | vZEdSectionUnits | 0 |
| xlam-beam-rolling-shear | weakAxisComponentsNeglected | false |
| xlam-beam-rolling-shear | weakAxisNeglectReason | - |
| xlam-beam-deflection | resultId | xlam-strip-report-SLE_QUASI_PERMANENT-all |
| xlam-beam-deflection | station | 2.25 |
| xlam-beam-deflection | deflectionLimitDenominator | 300 |

## Esito

* Stato: not-verified
* Utilizzo governante: 1.037
* Verifica governante: xlam-beam-deflection

## Warning

* XLAM vibration verification is outside the current beam domain.
* XLAM fire verification is outside the current beam domain.

## Assunzioni

* The XLAM panel is modeled as a one-dimensional strip in its main spanning direction.
* Rolling shear is checked with a simplified layer static-moment stress recovery.
