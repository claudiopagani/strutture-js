# Trave composta legno-XLAM

Trave lignea collaborante con pannello XLAM e connessioni legno-legno.

## Modello

* ID: timber-xlam-report
* Unita: N, mm
* Modello di analisi: timoshenko
* Lunghezza: 9200 mm
* Luce orizzontale: 9200 mm

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
| start-support | timber-xlam-report-beam-node-1 | 0 | hinge | si | si | no |
| end-support | timber-xlam-report-beam-node-11 | 9200 | roller | no | si | no |

## Carichi

| ID | Caso | Tipo | Durata | Fattore |
| --- | --- | --- | --- | --- |
| g1 | G1 | G1 | permanent | 1 |
| live | LIVE | Qk | medium | 1 |

## Combinazioni

| ID | Stato limite | Tipo | Fattori |
| --- | --- | --- | --- |
| timber-xlam-report-ULS-LIVE | ULS | ULS_STR_GEO | G1: 1.3, LIVE: 1.5 |
| timber-xlam-report-SLE_RARE-LIVE | SLE | SLE_RARE | G1: 1, LIVE: 1 |
| timber-xlam-report-SLE_FINAL-LIVE | SLE | SLE_FINAL | G1: 1, LIVE: 1 |

## Rigidezze adottate

| ID | SL | Tipo | EA | EI vert. | EI Y | EI Z | GA vert. | GA Y | GA Z | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| timber-xlam-report-ULS-LIVE | ULS | ULS_STR_GEO | 1539360000 | 33474754705799.137 | 33474754705799.137 | 12650688000000 | 96210000 | 96210000 | 96210000 | 0.9 | 0.8 |
| timber-xlam-report-SLE_RARE-LIVE | SLE | SLE_RARE | 1539360000 | 34372706906201.082 | 34372706906201.082 | 12650688000000 | 96210000 | 96210000 | 96210000 | 0.9 | 0.8 |
| timber-xlam-report-SLE_FINAL-LIVE | SLE | SLE_FINAL | 855200000 | 19665121834337.41 | 19665121834337.41 | 7028160000000 | 96210000 | 96210000 | 96210000 | 0.9 | 0.8 |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | timber-xlam-report-ULS-LIVE | ULS | 168403976 | 4600 |
| MY max assoluto | timber-xlam-report-ULS-LIVE | ULS | 168403976 | 4600 |
| MZ max assoluto | timber-xlam-report-ULS-LIVE | ULS | 0 | 0 |
| V max | timber-xlam-report-ULS-LIVE | ULS | 73219.12 | 0 |
| V min | timber-xlam-report-ULS-LIVE | ULS | -73219.12 | 9200 |
| VY max assoluto | timber-xlam-report-ULS-LIVE | ULS | 73219.12 | 9200 |
| VZ max assoluto | timber-xlam-report-ULS-LIVE | ULS | 0 | 0 |
| Freccia SLE max assoluta | timber-xlam-report-SLE_FINAL-LIVE | SLE | 54.7659 | 4600 |

## Azioni principali

| Dominio | Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Tutti | MY max assoluto | timber-xlam-report-ULS-LIVE | ULS | 168403976 | 4600 |
| Tutti | MZ max assoluto | G1 | - | 0 | 0 |
| Tutti | VY max assoluto | timber-xlam-report-ULS-LIVE | ULS | 73219.12 | 9200 |
| Tutti | VZ max assoluto | G1 | - | 0 | 0 |
| Combinazioni | MY max assoluto | timber-xlam-report-ULS-LIVE | ULS | 168403976 | 4600 |
| Combinazioni | MZ max assoluto | timber-xlam-report-ULS-LIVE | ULS | 0 | 0 |
| Combinazioni | VY max assoluto | timber-xlam-report-ULS-LIVE | ULS | 73219.12 | 9200 |
| Combinazioni | VZ max assoluto | timber-xlam-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | MY max assoluto | timber-xlam-report-ULS-LIVE | ULS | 168403976 | 4600 |
| SLU | MZ max assoluto | timber-xlam-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | VY max assoluto | timber-xlam-report-ULS-LIVE | ULS | 73219.12 | 9200 |
| SLU | VZ max assoluto | timber-xlam-report-ULS-LIVE | ULS | 0 | 0 |
| SLE | MY max assoluto | timber-xlam-report-SLE_RARE-LIVE | SLE | 119384720 | 4600 |
| SLE | MZ max assoluto | timber-xlam-report-SLE_RARE-LIVE | SLE | 0 | 0 |
| SLE | VY max assoluto | timber-xlam-report-SLE_RARE-LIVE | SLE | 51906.4 | 9200 |
| SLE | VZ max assoluto | timber-xlam-report-SLE_RARE-LIVE | SLE | 0 | 0 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | timber-xlam-report-ULS-LIVE | ULS | start-support | 0 | 0 |
| Ry max assoluto | timber-xlam-report-ULS-LIVE | ULS | end-support | 73219.12 | 9200 |
| Mrz max assoluto | timber-xlam-report-SLE_RARE-LIVE | SLE | end-support | 0 | 9200 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| xlam-min-stress | Minimum XLAM stress at ULS | 13.7736 | 14.8966 | 0.925 | si |
| xlam-max-stress | Maximum XLAM stress at ULS | 10.2722 | 14.8966 | 0.69 | si |
| timber-min-stress | Minimum timber beam stress at ULS | 13.2006 | 17.3793 | 0.76 | si |
| timber-max-stress | Maximum timber beam stress at ULS | 14.69 | 17.3793 | 0.845 | si |
| xlam-shear | XLAM shear verification | 0.0114 | 1.6759 | 0.007 | si |
| timber-shear | Timber beam shear verification | 0.8774 | 1.9862 | 0.442 | si |
| connector | Timber-timber connector verification | 4.7046 | 5.4754 | 0.859 | si |
| deflection-short | Short-term deflection verification | 54.7659 | 30.6667 | 1.786 | no |
| deflection-long | Long-term deflection verification | 54.7659 | 46 | 1.191 | no |

## Dettagli verifiche

| Verifica | Parametro | Valore |
| --- | --- | --- |
| xlam-min-stress | resultId | timber-xlam-report-ULS-LIVE |
| xlam-min-stress | resultType | combination |
| xlam-min-stress | station | 4600 |
| xlam-min-stress | limitState | ULS |
| xlam-min-stress | stationSource | critical |
| xlam-min-stress | stationRole | critical-bending |
| xlam-min-stress | stationSelectionMode | all |
| xlam-min-stress | isRequestedStation | false |
| xlam-min-stress | isUserStation | false |
| xlam-min-stress | isGridStation | false |
| xlam-min-stress | isCriticalStation | true |
| xlam-min-stress | stationTolerance | 0.0001 |
| xlam-min-stress | method | timber-xlam-gamma-method-section-actions |
| xlam-min-stress | gamma1Uls | 0.7843 |
| xlam-min-stress | gamma2Uls | 0.3634 |
| xlam-min-stress | ejEffUls | 33474754705799.137 |
| xlam-min-stress | mZEd | 0 |
| xlam-min-stress | vZEd | 0 |
| xlam-min-stress | mZEdSectionUnits | 0 |
| xlam-min-stress | vZEdSectionUnits | 0 |
| xlam-min-stress | weakAxisComponentsNeglected | false |
| xlam-min-stress | weakAxisNeglectReason | - |
| xlam-max-stress | resultId | timber-xlam-report-ULS-LIVE |
| xlam-max-stress | resultType | combination |
| xlam-max-stress | station | 4600 |
| xlam-max-stress | limitState | ULS |
| xlam-max-stress | stationSource | critical |
| xlam-max-stress | stationRole | critical-bending |
| xlam-max-stress | stationSelectionMode | all |
| xlam-max-stress | isRequestedStation | false |
| xlam-max-stress | isUserStation | false |
| xlam-max-stress | isGridStation | false |
| xlam-max-stress | isCriticalStation | true |
| xlam-max-stress | stationTolerance | 0.0001 |
| xlam-max-stress | method | timber-xlam-gamma-method-section-actions |
| xlam-max-stress | gamma1Uls | 0.7843 |
| xlam-max-stress | gamma2Uls | 0.3634 |
| xlam-max-stress | ejEffUls | 33474754705799.137 |
| xlam-max-stress | mZEd | 0 |
| xlam-max-stress | vZEd | 0 |
| xlam-max-stress | mZEdSectionUnits | 0 |
| xlam-max-stress | vZEdSectionUnits | 0 |
| xlam-max-stress | weakAxisComponentsNeglected | false |
| xlam-max-stress | weakAxisNeglectReason | - |
| timber-min-stress | resultId | timber-xlam-report-ULS-LIVE |
| timber-min-stress | resultType | combination |
| timber-min-stress | station | 4600 |
| timber-min-stress | limitState | ULS |
| timber-min-stress | stationSource | critical |
| timber-min-stress | stationRole | critical-bending |
| timber-min-stress | stationSelectionMode | all |
| timber-min-stress | isRequestedStation | false |
| timber-min-stress | isUserStation | false |
| timber-min-stress | isGridStation | false |
| timber-min-stress | isCriticalStation | true |
| timber-min-stress | stationTolerance | 0.0001 |
| timber-min-stress | method | timber-xlam-gamma-method-section-actions |
| timber-min-stress | gamma1Uls | 0.7843 |
| timber-min-stress | gamma2Uls | 0.3634 |
| timber-min-stress | ejEffUls | 33474754705799.137 |
| timber-min-stress | mZEd | 0 |
| timber-min-stress | vZEd | 0 |
| timber-min-stress | mZEdSectionUnits | 0 |
| timber-min-stress | vZEdSectionUnits | 0 |
| timber-min-stress | weakAxisComponentsNeglected | false |
| timber-min-stress | weakAxisNeglectReason | - |
| timber-max-stress | resultId | timber-xlam-report-ULS-LIVE |
| timber-max-stress | resultType | combination |
| timber-max-stress | station | 4600 |
| timber-max-stress | limitState | ULS |
| timber-max-stress | stationSource | critical |
| timber-max-stress | stationRole | critical-bending |
| timber-max-stress | stationSelectionMode | all |
| timber-max-stress | isRequestedStation | false |
| timber-max-stress | isUserStation | false |
| timber-max-stress | isGridStation | false |
| timber-max-stress | isCriticalStation | true |
| timber-max-stress | stationTolerance | 0.0001 |
| timber-max-stress | method | timber-xlam-gamma-method-section-actions |
| timber-max-stress | gamma1Uls | 0.7843 |
| timber-max-stress | gamma2Uls | 0.3634 |
| timber-max-stress | ejEffUls | 33474754705799.137 |
| timber-max-stress | mZEd | 0 |
| timber-max-stress | vZEd | 0 |
| timber-max-stress | mZEdSectionUnits | 0 |
| timber-max-stress | vZEdSectionUnits | 0 |
| timber-max-stress | weakAxisComponentsNeglected | false |
| timber-max-stress | weakAxisNeglectReason | - |
| xlam-shear | resultId | timber-xlam-report-ULS-LIVE |
| xlam-shear | resultType | combination |
| xlam-shear | station | 0 |
| xlam-shear | limitState | ULS |
| xlam-shear | stationSource | critical |
| xlam-shear | stationRole | support+critical-shear |
| xlam-shear | stationSelectionMode | all |
| xlam-shear | isRequestedStation | false |
| xlam-shear | isUserStation | false |
| xlam-shear | isGridStation | false |
| xlam-shear | isCriticalStation | true |
| xlam-shear | stationTolerance | 0.0001 |
| xlam-shear | method | timber-xlam-gamma-method-section-actions |
| xlam-shear | gamma1Uls | 0.7843 |
| xlam-shear | gamma2Uls | 0.3634 |
| xlam-shear | ejEffUls | 33474754705799.137 |
| xlam-shear | mZEd | 0 |
| xlam-shear | vZEd | 0 |
| xlam-shear | mZEdSectionUnits | 0 |
| xlam-shear | vZEdSectionUnits | 0 |
| xlam-shear | weakAxisComponentsNeglected | false |
| xlam-shear | weakAxisNeglectReason | - |
| timber-shear | resultId | timber-xlam-report-ULS-LIVE |
| timber-shear | resultType | combination |
| timber-shear | station | 0 |
| timber-shear | limitState | ULS |
| timber-shear | stationSource | critical |
| timber-shear | stationRole | support+critical-shear |
| timber-shear | stationSelectionMode | all |
| timber-shear | isRequestedStation | false |
| timber-shear | isUserStation | false |
| timber-shear | isGridStation | false |
| timber-shear | isCriticalStation | true |
| timber-shear | stationTolerance | 0.0001 |
| timber-shear | method | timber-xlam-gamma-method-section-actions |
| timber-shear | gamma1Uls | 0.7843 |
| timber-shear | gamma2Uls | 0.3634 |
| timber-shear | ejEffUls | 33474754705799.137 |
| timber-shear | mZEd | 0 |
| timber-shear | vZEd | 0 |
| timber-shear | mZEdSectionUnits | 0 |
| timber-shear | vZEdSectionUnits | 0 |
| timber-shear | weakAxisComponentsNeglected | false |
| timber-shear | weakAxisNeglectReason | - |
| connector | resultId | timber-xlam-report-ULS-LIVE |
| connector | resultType | combination |
| connector | station | 0 |
| connector | limitState | ULS |
| connector | stationSource | critical |
| connector | stationRole | support+critical-shear |
| connector | stationSelectionMode | all |
| connector | isRequestedStation | false |
| connector | isUserStation | false |
| connector | isGridStation | false |
| connector | isCriticalStation | true |
| connector | stationTolerance | 0.0001 |
| connector | method | timber-xlam-gamma-method-section-actions |
| connector | gamma1Uls | 0.7843 |
| connector | gamma2Uls | 0.3634 |
| connector | ejEffUls | 33474754705799.137 |
| connector | mZEd | 0 |
| connector | vZEd | 0 |
| connector | mZEdSectionUnits | 0 |
| connector | vZEdSectionUnits | 0 |
| connector | weakAxisComponentsNeglected | false |
| connector | weakAxisNeglectReason | - |

## Esito

* Stato: not-verified
* Utilizzo governante: 1.786
* Verifica governante: deflection-short

## Warning

* The fire verification worksheet is not implemented yet.
* The long-term deflection follows the workbook formula as written.

## Assunzioni

* Dimensional inputs are normalized through the unit layer when units are declared on the model and related domain objects.
* The XLAM section follows the 5-layer workbook convention with active parallel layers passed in the section definition.
