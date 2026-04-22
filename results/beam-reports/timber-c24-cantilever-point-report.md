# Mensola in legno C24

Mensola in legno massiccio con carico puntuale in estremita.

## Modello

* ID: timber-c24-cantilever-point-report
* Unita: kN, m
* Modello di analisi: timoshenko
* Lunghezza: 3 m
* Luce orizzontale: 3 m

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
| start-support | timber-c24-cantilever-point-report-beam-node-1 | 0 | fixed | si | si | si |

## Carichi

| ID | Caso | Tipo | Durata | Fattore |
| --- | --- | --- | --- | --- |
| g1 | G1 | G1 | permanent | 1 |
| tip-live | LIVE | Qk | medium | 1 |

## Combinazioni

| ID | Stato limite | Tipo | Fattori |
| --- | --- | --- | --- |
| timber-c24-cantilever-point-report-ULS-LIVE | ULS | ULS_STR_GEO | G1: 1.3, LIVE: 1.5 |
| timber-c24-cantilever-point-report-SLE_RARE-LIVE | SLE | SLE_RARE | G1: 1, LIVE: 1 |
| timber-c24-cantilever-point-report-SLE_QUASI_PERMANENT-all | SLE | SLE_QUASI_PERMANENT | G1: 1, LIVE: 0.3 |

## Rigidezze adottate

| ID | SL | Tipo | EA | EI vert. | EI Y | EI Z | GA vert. | GA Y | GA Z | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| timber-c24-cantilever-point-report-ULS-LIVE | ULS | ULS_STR_GEO | 343200 | 1933.36 | 1933.36 | 411.84 | 21450 | 21450 | 21450 | 0.8 | 0.6 |
| timber-c24-cantilever-point-report-SLE_RARE-LIVE | SLE | SLE_RARE | 343200 | 1933.36 | 1933.36 | 411.84 | 21450 | 21450 | 21450 | 0.8 | 0.6 |
| timber-c24-cantilever-point-report-SLE_QUASI_PERMANENT-all | SLE | SLE_QUASI_PERMANENT | 214500 | 1208.35 | 1208.35 | 257.4 | 13406.25 | 13406.25 | 13406.25 | 0.8 | 0.6 |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 8.91 | 0 |
| MY max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 8.91 | 0 |
| MZ max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 0 | 0 |
| V max | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 4.14 | 0 |
| V min | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 1.8 | 3 |
| VY max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 4.14 | 0 |
| VZ max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 0 | 0 |
| Freccia SLE max assoluta | timber-c24-cantilever-point-report-SLE_RARE-LIVE | SLE | 0.0091 | 3 |

## Azioni principali

| Dominio | Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Tutti | MY max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 8.91 | 0 |
| Tutti | MZ max assoluto | G1 | - | 0 | 0 |
| Tutti | VY max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 4.14 | 0 |
| Tutti | VZ max assoluto | G1 | - | 0 | 0 |
| Combinazioni | MY max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 8.91 | 0 |
| Combinazioni | MZ max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 0 | 0 |
| Combinazioni | VY max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 4.14 | 0 |
| Combinazioni | VZ max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | MY max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 8.91 | 0 |
| SLU | MZ max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | VY max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 4.14 | 0 |
| SLU | VZ max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | 0 | 0 |
| SLE | MY max assoluto | timber-c24-cantilever-point-report-SLE_RARE-LIVE | SLE | 6.3 | 0 |
| SLE | MZ max assoluto | timber-c24-cantilever-point-report-SLE_RARE-LIVE | SLE | 0 | 0 |
| SLE | VY max assoluto | timber-c24-cantilever-point-report-SLE_RARE-LIVE | SLE | 3 | 0 |
| SLE | VZ max assoluto | timber-c24-cantilever-point-report-SLE_RARE-LIVE | SLE | 0 | 0 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | start-support | 0 | 0 |
| Ry max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | start-support | 4.14 | 0 |
| Mrz max assoluto | timber-c24-cantilever-point-report-ULS-LIVE | ULS | start-support | 8.91 | 0 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| timber-bending | Biaxial bending stress verification on principal section axes | 0.5149 | 1 | 0.515 | si |
| timber-shear | Biaxial shear verification on principal section axes | 0.0933 | 1 | 0.093 | si |
| timber-lateral-torsional-stability | Timber lateral-torsional stability with weak-axis moment interaction | 0.5149 | 1 | 0.515 | si |
| timber-deflection | Serviceability vertical deflection verification | 0.0091 | 0.015 | 0.605 | si |
| timber-final-deflection | Final serviceability vertical deflection verification | 0.008 | 0.015 | 0.536 | si |

## Dettagli verifiche

| Verifica | Parametro | Valore |
| --- | --- | --- |
| timber-bending | resultId | timber-c24-cantilever-point-report-ULS-LIVE |
| timber-bending | resultType | combination |
| timber-bending | station | 0 |
| timber-bending | limitState | ULS |
| timber-bending | stationSource | grid |
| timber-bending | stationRole | verification-grid+support+critical-bending+critical-shear |
| timber-bending | stationSelectionMode | combined |
| timber-bending | isRequestedStation | true |
| timber-bending | isUserStation | false |
| timber-bending | isGridStation | true |
| timber-bending | isCriticalStation | true |
| timber-bending | stationTolerance | 0 |
| timber-bending | fmD | 12.8 |
| timber-bending | kmod | 0.8 |
| timber-bending | gammaM | 1.5 |
| timber-bending | actionBasis | principal-actions |
| timber-bending | mYEd | -8.91 |
| timber-bending | mZEd | 0 |
| timber-bending | bendingCapacityY | 17.3056 |
| timber-bending | bendingCapacityZ | 7.9872 |
| timber-bending | utilizationRatioY | 0.5149 |
| timber-bending | utilizationRatioZ | 0 |
| timber-shear | resultId | timber-c24-cantilever-point-report-ULS-LIVE |
| timber-shear | resultType | combination |
| timber-shear | station | 0 |
| timber-shear | limitState | ULS |
| timber-shear | stationSource | grid |
| timber-shear | stationRole | verification-grid+support+critical-bending+critical-shear |
| timber-shear | stationSelectionMode | combined |
| timber-shear | isRequestedStation | true |
| timber-shear | isUserStation | false |
| timber-shear | isGridStation | true |
| timber-shear | isCriticalStation | true |
| timber-shear | stationTolerance | 0 |
| timber-shear | fvD | 2.1333 |
| timber-shear | shearArea | 31200 |
| timber-shear | shearAreaY | 31200 |
| timber-shear | shearAreaZ | 31200 |
| timber-shear | vYEd | 4.14 |
| timber-shear | vZEd | 0 |
| timber-shear | shearCapacityY | 44.3733 |
| timber-shear | shearCapacityZ | 44.3733 |
| timber-shear | utilizationRatioY | 0.0933 |
| timber-shear | utilizationRatioZ | 0 |
| timber-lateral-torsional-stability | method | ntc2018-ec5-timber-lateral-torsional-stability-mvp |
| timber-lateral-torsional-stability | criticalStressSource | ec5-rectangular-simplified |
| timber-lateral-torsional-stability | e0_05 | 7333.3333 |
| timber-lateral-torsional-stability | e0_05Source | mean-elastic-modulus-ratio-2/3 |
| timber-lateral-torsional-stability | fmK | 24 |
| timber-lateral-torsional-stability | fmD | 12.8 |
| timber-lateral-torsional-stability | width | 120 |
| timber-lateral-torsional-stability | height | 260 |
| timber-lateral-torsional-stability | unbracedLength | 3 |
| timber-lateral-torsional-stability | sigmaMcrit | 105.6 |
| timber-lateral-torsional-stability | relativeSlenderness | 0.4767 |
| timber-lateral-torsional-stability | kcrit | 1 |
| timber-lateral-torsional-stability | myEd | -8.91 |
| timber-lateral-torsional-stability | mzEd | 0 |
| timber-lateral-torsional-stability | bendingCapacityY | 17305600 |
| timber-lateral-torsional-stability | bendingCapacityZ | 7987200 |
| timber-lateral-torsional-stability | utilizationRatioY | 0.5149 |
| timber-lateral-torsional-stability | utilizationRatioZ | 0 |
| timber-lateral-torsional-stability | weakAxisMomentIncluded | false |
| timber-lateral-torsional-stability | kmod | 0.8 |
| timber-lateral-torsional-stability | gammaM | 1.5 |
| timber-lateral-torsional-stability | resultId | timber-c24-cantilever-point-report-ULS-LIVE |
| timber-lateral-torsional-stability | resultType | combination |
| timber-lateral-torsional-stability | station | 0 |
| timber-lateral-torsional-stability | limitState | ULS |
| timber-lateral-torsional-stability | combinationType | ULS_STR_GEO |
| timber-lateral-torsional-stability | segmentId | ltb-full-span |
| timber-lateral-torsional-stability | segmentFrom | 0 |
| timber-lateral-torsional-stability | segmentTo | 3 |
| timber-lateral-torsional-stability | unbracedLengthSectionUnits | 3000 |
| timber-lateral-torsional-stability | myEdSectionUnits | -8910000 |
| timber-lateral-torsional-stability | mzEdSectionUnits | 0 |
| timber-deflection | combinationId | timber-c24-cantilever-point-report-SLE_RARE-LIVE |
| timber-deflection | station | 3 |
| timber-deflection | limitDenominator | 200 |
| timber-final-deflection | combinationId | timber-c24-cantilever-point-report-SLE_QUASI_PERMANENT-all |
| timber-final-deflection | station | 3 |
| timber-final-deflection | limitDenominator | 200 |

## Esito

* Stato: ok
* Utilizzo governante: 0.605
* Verifica governante: timber-deflection

## Warning

* Nessun warning.

## Assunzioni

* Timber lateral-torsional stability is checked on ULS FEM principal-axis bending for declared unbraced segments; automatic kcrit is limited to rectangular sections unless kcrit or sigmaMcrit is provided.
* The strong-axis moment My is reduced by kcrit; any weak-axis moment Mz from section rotation is included as an elastic weak-axis bending term.
* SLE vertical deflection limit defaults to L/200 unless overridden.
