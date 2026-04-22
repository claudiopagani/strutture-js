# Trave in legno lamellare GL24h

Trave lamellare con luce maggiore e controllo di deformabilita.

## Modello

* ID: glulam-gl24h-report
* Unita: kN, m
* Modello di analisi: timoshenko
* Lunghezza: 6 m
* Luce orizzontale: 6 m

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

| ID | SL | Tipo | EA | EI vert. | EI Y | EI Z | GA vert. | GA Y | GA Z | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| glulam-gl24h-report-ULS-LIVE | ULS | ULS_STR_GEO | 662400 | 7153.92 | 7153.92 | 1413.12 | 41400 | 41400 | 41400 | 0.8 | 0.6 |
| glulam-gl24h-report-SLE_RARE-LIVE | SLE | SLE_RARE | 662400 | 7153.92 | 7153.92 | 1413.12 | 41400 | 41400 | 41400 | 0.8 | 0.6 |
| glulam-gl24h-report-SLE_QUASI_PERMANENT-all | SLE | SLE_QUASI_PERMANENT | 414000 | 4471.2 | 4471.2 | 883.2 | 25875 | 25875 | 25875 | 0.8 | 0.6 |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 21.96 | 3 |
| MY max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 21.96 | 3 |
| MZ max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 0 | 0 |
| V max | glulam-gl24h-report-ULS-LIVE | ULS | 14.64 | 0 |
| V min | glulam-gl24h-report-ULS-LIVE | ULS | -14.64 | 6 |
| VY max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 14.64 | 0 |
| VZ max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 0 | 0 |
| Freccia SLE max assoluta | glulam-gl24h-report-SLE_QUASI_PERMANENT-all | SLE | 0.0091 | 3 |

## Azioni principali

| Dominio | Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Tutti | MY max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 21.96 | 3 |
| Tutti | MZ max assoluto | G1 | - | 0 | 0 |
| Tutti | VY max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 14.64 | 0 |
| Tutti | VZ max assoluto | G1 | - | 0 | 0 |
| Combinazioni | MY max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 21.96 | 3 |
| Combinazioni | MZ max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 0 | 0 |
| Combinazioni | VY max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 14.64 | 0 |
| Combinazioni | VZ max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | MY max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 21.96 | 3 |
| SLU | MZ max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | VY max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 14.64 | 0 |
| SLU | VZ max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | 0 | 0 |
| SLE | MY max assoluto | glulam-gl24h-report-SLE_RARE-LIVE | SLE | 15.3 | 3 |
| SLE | MZ max assoluto | glulam-gl24h-report-SLE_RARE-LIVE | SLE | 0 | 0 |
| SLE | VY max assoluto | glulam-gl24h-report-SLE_RARE-LIVE | SLE | 10.2 | 0 |
| SLE | VZ max assoluto | glulam-gl24h-report-SLE_RARE-LIVE | SLE | 0 | 0 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | start-support | 0 | 0 |
| Ry max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | start-support | 14.64 | 0 |
| Mrz max assoluto | glulam-gl24h-report-ULS-LIVE | ULS | start-support | 0 | 0 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| timber-bending | Biaxial bending stress verification on principal section axes | 0.4964 | 1 | 0.496 | si |
| timber-shear | Biaxial shear verification on principal section axes | 0.2042 | 1 | 0.204 | si |
| timber-lateral-torsional-stability | Timber lateral-torsional stability with weak-axis moment interaction | 0.4964 | 1 | 0.496 | si |
| timber-deflection | Serviceability vertical deflection verification | 0.0085 | 0.02 | 0.423 | si |
| timber-final-deflection | Final serviceability vertical deflection verification | 0.0091 | 0.02 | 0.454 | si |

## Dettagli verifiche

| Verifica | Parametro | Valore |
| --- | --- | --- |
| timber-bending | resultId | glulam-gl24h-report-ULS-LIVE |
| timber-bending | resultType | combination |
| timber-bending | station | 3 |
| timber-bending | limitState | ULS |
| timber-bending | stationSource | critical |
| timber-bending | stationRole | critical-bending |
| timber-bending | stationSelectionMode | all |
| timber-bending | isRequestedStation | false |
| timber-bending | isUserStation | false |
| timber-bending | isGridStation | false |
| timber-bending | isCriticalStation | true |
| timber-bending | stationTolerance | 0 |
| timber-bending | fmD | 12.8 |
| timber-bending | kmod | 0.8 |
| timber-bending | gammaM | 1.5 |
| timber-bending | actionBasis | principal-actions |
| timber-bending | mYEd | 21.96 |
| timber-bending | mZEd | 0 |
| timber-bending | bendingCapacityY | 44.2368 |
| timber-bending | bendingCapacityZ | 19.6608 |
| timber-bending | utilizationRatioY | 0.4964 |
| timber-bending | utilizationRatioZ | 0 |
| timber-shear | resultId | glulam-gl24h-report-ULS-LIVE |
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
| timber-shear | stationTolerance | 0 |
| timber-shear | fvD | 1.8667 |
| timber-shear | shearArea | 57600 |
| timber-shear | shearAreaY | 57600 |
| timber-shear | shearAreaZ | 57600 |
| timber-shear | vYEd | 14.64 |
| timber-shear | vZEd | 0 |
| timber-shear | shearCapacityY | 71.68 |
| timber-shear | shearCapacityZ | 71.68 |
| timber-shear | utilizationRatioY | 0.2042 |
| timber-shear | utilizationRatioZ | 0 |
| timber-lateral-torsional-stability | method | ntc2018-ec5-timber-lateral-torsional-stability-mvp |
| timber-lateral-torsional-stability | criticalStressSource | ec5-rectangular-simplified |
| timber-lateral-torsional-stability | e0_05 | 7666.6667 |
| timber-lateral-torsional-stability | e0_05Source | mean-elastic-modulus-ratio-2/3 |
| timber-lateral-torsional-stability | fmK | 24 |
| timber-lateral-torsional-stability | fmD | 12.8 |
| timber-lateral-torsional-stability | width | 160 |
| timber-lateral-torsional-stability | height | 360 |
| timber-lateral-torsional-stability | unbracedLength | 6 |
| timber-lateral-torsional-stability | sigmaMcrit | 70.8741 |
| timber-lateral-torsional-stability | relativeSlenderness | 0.5819 |
| timber-lateral-torsional-stability | kcrit | 1 |
| timber-lateral-torsional-stability | myEd | 21.96 |
| timber-lateral-torsional-stability | mzEd | 0 |
| timber-lateral-torsional-stability | bendingCapacityY | 44236800 |
| timber-lateral-torsional-stability | bendingCapacityZ | 19660800 |
| timber-lateral-torsional-stability | utilizationRatioY | 0.4964 |
| timber-lateral-torsional-stability | utilizationRatioZ | 0 |
| timber-lateral-torsional-stability | weakAxisMomentIncluded | false |
| timber-lateral-torsional-stability | kmod | 0.8 |
| timber-lateral-torsional-stability | gammaM | 1.5 |
| timber-lateral-torsional-stability | resultId | glulam-gl24h-report-ULS-LIVE |
| timber-lateral-torsional-stability | resultType | combination |
| timber-lateral-torsional-stability | station | 3 |
| timber-lateral-torsional-stability | limitState | ULS |
| timber-lateral-torsional-stability | combinationType | ULS_STR_GEO |
| timber-lateral-torsional-stability | segmentId | ltb-full-span |
| timber-lateral-torsional-stability | segmentFrom | 0 |
| timber-lateral-torsional-stability | segmentTo | 6 |
| timber-lateral-torsional-stability | unbracedLengthSectionUnits | 6000 |
| timber-lateral-torsional-stability | myEdSectionUnits | 21960000 |
| timber-lateral-torsional-stability | mzEdSectionUnits | 0 |
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

* Nessun warning.

## Assunzioni

* Timber lateral-torsional stability is checked on ULS FEM principal-axis bending for declared unbraced segments; automatic kcrit is limited to rectangular sections unless kcrit or sigmaMcrit is provided.
* The strong-axis moment My is reduced by kcrit; any weak-axis moment Mz from section rotation is included as an elastic weak-axis bending term.
* SLE vertical deflection limit defaults to L/300 unless overridden.
