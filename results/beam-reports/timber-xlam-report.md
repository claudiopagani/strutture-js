# Trave composta legno-XLAM

Trave lignea collaborante con pannello XLAM e connessioni legno-legno.

## Modello

* ID: timber-xlam-report
* Unita: N, mm
* Modello di analisi: timoshenko
* Lunghezza: 9200 mm
* Luce orizzontale: 9200 mm

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

| ID | SL | Tipo | EA | EI | GA | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- |
| timber-xlam-report-ULS-LIVE | ULS | ULS_STR_GEO | 1539360000 | 33474754705799.137 | 96210000 | 0.9 | 0.8 |
| timber-xlam-report-SLE_RARE-LIVE | SLE | SLE_RARE | 1539360000 | 34372706906201.082 | 96210000 | 0.9 | 0.8 |
| timber-xlam-report-SLE_FINAL-LIVE | SLE | SLE_FINAL | 855200000 | 19665121834337.41 | 96210000 | 0.9 | 0.8 |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | timber-xlam-report-ULS-LIVE | ULS | 168403976 | 4600 |
| V max | timber-xlam-report-ULS-LIVE | ULS | 73219.12 | 0 |
| V min | timber-xlam-report-ULS-LIVE | ULS | -73219.12 | 9200 |
| Freccia SLE max assoluta | timber-xlam-report-SLE_FINAL-LIVE | SLE | 54.7659 | 4600 |

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
| xlam-min-stress | method | timber-xlam-gamma-method-section-actions |
| xlam-min-stress | gamma1Uls | 0.7843 |
| xlam-min-stress | gamma2Uls | 0.3634 |
| xlam-min-stress | ejEffUls | 33474754705799.137 |
| xlam-max-stress | resultId | timber-xlam-report-ULS-LIVE |
| xlam-max-stress | resultType | combination |
| xlam-max-stress | station | 4600 |
| xlam-max-stress | limitState | ULS |
| xlam-max-stress | method | timber-xlam-gamma-method-section-actions |
| xlam-max-stress | gamma1Uls | 0.7843 |
| xlam-max-stress | gamma2Uls | 0.3634 |
| xlam-max-stress | ejEffUls | 33474754705799.137 |
| timber-min-stress | resultId | timber-xlam-report-ULS-LIVE |
| timber-min-stress | resultType | combination |
| timber-min-stress | station | 4600 |
| timber-min-stress | limitState | ULS |
| timber-min-stress | method | timber-xlam-gamma-method-section-actions |
| timber-min-stress | gamma1Uls | 0.7843 |
| timber-min-stress | gamma2Uls | 0.3634 |
| timber-min-stress | ejEffUls | 33474754705799.137 |
| timber-max-stress | resultId | timber-xlam-report-ULS-LIVE |
| timber-max-stress | resultType | combination |
| timber-max-stress | station | 4600 |
| timber-max-stress | limitState | ULS |
| timber-max-stress | method | timber-xlam-gamma-method-section-actions |
| timber-max-stress | gamma1Uls | 0.7843 |
| timber-max-stress | gamma2Uls | 0.3634 |
| timber-max-stress | ejEffUls | 33474754705799.137 |
| xlam-shear | resultId | timber-xlam-report-ULS-LIVE |
| xlam-shear | resultType | combination |
| xlam-shear | station | 0 |
| xlam-shear | limitState | ULS |
| xlam-shear | method | timber-xlam-gamma-method-section-actions |
| xlam-shear | gamma1Uls | 0.7843 |
| xlam-shear | gamma2Uls | 0.3634 |
| xlam-shear | ejEffUls | 33474754705799.137 |
| timber-shear | resultId | timber-xlam-report-ULS-LIVE |
| timber-shear | resultType | combination |
| timber-shear | station | 0 |
| timber-shear | limitState | ULS |
| timber-shear | method | timber-xlam-gamma-method-section-actions |
| timber-shear | gamma1Uls | 0.7843 |
| timber-shear | gamma2Uls | 0.3634 |
| timber-shear | ejEffUls | 33474754705799.137 |
| connector | resultId | timber-xlam-report-ULS-LIVE |
| connector | resultType | combination |
| connector | station | 0 |
| connector | limitState | ULS |
| connector | method | timber-xlam-gamma-method-section-actions |
| connector | gamma1Uls | 0.7843 |
| connector | gamma2Uls | 0.3634 |
| connector | ejEffUls | 33474754705799.137 |

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
