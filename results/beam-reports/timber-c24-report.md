# Trave in legno C24

Trave appoggio-appoggio con carichi permanenti e variabile.

## Modello

* ID: timber-c24-report
* Unita: kN, m
* Modello di analisi: timoshenko
* Lunghezza: 4 m
* Luce orizzontale: 4 m

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
| start-support | timber-c24-report-beam-node-1 | 0 | hinge | si | si | no |
| end-support | timber-c24-report-beam-node-5 | 4 | roller | no | si | no |

## Carichi

| ID | Caso | Tipo | Durata | Fattore |
| --- | --- | --- | --- | --- |
| g1 | G1 | G1 | permanent | 1 |
| g2 | G2 | G2 | permanent | 1 |
| live | LIVE | Qk | medium | 1 |

## Combinazioni

| ID | Stato limite | Tipo | Fattori |
| --- | --- | --- | --- |
| timber-c24-report-ULS-LIVE | ULS | ULS_STR_GEO | G1: 1.3, G2: 1.5, LIVE: 1.5 |
| timber-c24-report-SLE_RARE-LIVE | SLE | SLE_RARE | G1: 1, G2: 1, LIVE: 1 |
| timber-c24-report-SLE_QUASI_PERMANENT-all | SLE | SLE_QUASI_PERMANENT | G1: 1, G2: 1, LIVE: 0.3 |

## Rigidezze adottate

| ID | SL | Tipo | EA | EI vert. | EI Y | EI Z | GA vert. | GA Y | GA Z | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| timber-c24-report-ULS-LIVE | ULS | ULS_STR_GEO | 431200 | 2817.1733 | 2817.1733 | 704.2933 | 26950 | 26950 | 26950 | 0.8 | 0.6 |
| timber-c24-report-SLE_RARE-LIVE | SLE | SLE_RARE | 431200 | 2817.1733 | 2817.1733 | 704.2933 | 26950 | 26950 | 26950 | 0.8 | 0.6 |
| timber-c24-report-SLE_QUASI_PERMANENT-all | SLE | SLE_QUASI_PERMANENT | 269500 | 1760.7333 | 1760.7333 | 440.1833 | 16843.75 | 16843.75 | 16843.75 | 0.8 | 0.6 |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | timber-c24-report-ULS-LIVE | ULS | 6.28 | 2 |
| MY max assoluto | timber-c24-report-ULS-LIVE | ULS | 6.28 | 2 |
| MZ max assoluto | timber-c24-report-ULS-LIVE | ULS | 0 | 0 |
| V max | timber-c24-report-ULS-LIVE | ULS | 6.28 | 0 |
| V min | timber-c24-report-ULS-LIVE | ULS | -6.28 | 4 |
| VY max assoluto | timber-c24-report-ULS-LIVE | ULS | 6.28 | 4 |
| VZ max assoluto | timber-c24-report-ULS-LIVE | ULS | 0 | 0 |
| Freccia SLE max assoluta | timber-c24-report-SLE_QUASI_PERMANENT-all | SLE | 0.0031 | 2 |

## Azioni principali

| Dominio | Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Tutti | MY max assoluto | timber-c24-report-ULS-LIVE | ULS | 6.28 | 2 |
| Tutti | MZ max assoluto | G1 | - | 0 | 0 |
| Tutti | VY max assoluto | timber-c24-report-ULS-LIVE | ULS | 6.28 | 4 |
| Tutti | VZ max assoluto | G1 | - | 0 | 0 |
| Combinazioni | MY max assoluto | timber-c24-report-ULS-LIVE | ULS | 6.28 | 2 |
| Combinazioni | MZ max assoluto | timber-c24-report-ULS-LIVE | ULS | 0 | 0 |
| Combinazioni | VY max assoluto | timber-c24-report-ULS-LIVE | ULS | 6.28 | 4 |
| Combinazioni | VZ max assoluto | timber-c24-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | MY max assoluto | timber-c24-report-ULS-LIVE | ULS | 6.28 | 2 |
| SLU | MZ max assoluto | timber-c24-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | VY max assoluto | timber-c24-report-ULS-LIVE | ULS | 6.28 | 4 |
| SLU | VZ max assoluto | timber-c24-report-ULS-LIVE | ULS | 0 | 0 |
| SLE | MY max assoluto | timber-c24-report-SLE_RARE-LIVE | SLE | 4.4 | 2 |
| SLE | MZ max assoluto | timber-c24-report-SLE_RARE-LIVE | SLE | 0 | 0 |
| SLE | VY max assoluto | timber-c24-report-SLE_RARE-LIVE | SLE | 4.4 | 0 |
| SLE | VZ max assoluto | timber-c24-report-SLE_RARE-LIVE | SLE | 0 | 0 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | timber-c24-report-ULS-LIVE | ULS | start-support | 0 | 0 |
| Ry max assoluto | timber-c24-report-ULS-LIVE | ULS | end-support | 6.28 | 4 |
| Mrz max assoluto | timber-c24-report-ULS-LIVE | ULS | start-support | 0 | 0 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| timber-bending | Biaxial bending stress verification on principal section axes | 0.2682 | 1 | 0.268 | si |
| timber-shear | Biaxial shear verification on principal section axes | 0.1126 | 1 | 0.113 | si |
| timber-lateral-torsional-stability | Timber lateral-torsional stability with weak-axis moment interaction | 0.2682 | 1 | 0.268 | si |
| timber-deflection | Serviceability vertical deflection verification | 0.0028 | 0.0133 | 0.21 | si |
| timber-final-deflection | Final serviceability vertical deflection verification | 0.0031 | 0.0133 | 0.229 | si |

## Dettagli verifiche

| Verifica | Parametro | Valore |
| --- | --- | --- |
| timber-bending | resultId | timber-c24-report-ULS-LIVE |
| timber-bending | resultType | combination |
| timber-bending | station | 2 |
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
| timber-bending | mYEd | 6.28 |
| timber-bending | mZEd | 0 |
| timber-bending | bendingCapacityY | 23.4155 |
| timber-bending | bendingCapacityZ | 11.7077 |
| timber-bending | utilizationRatioY | 0.2682 |
| timber-bending | utilizationRatioZ | 0 |
| timber-shear | resultId | timber-c24-report-ULS-LIVE |
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
| timber-shear | fvD | 2.1333 |
| timber-shear | shearArea | 39200 |
| timber-shear | shearAreaY | 39200 |
| timber-shear | shearAreaZ | 39200 |
| timber-shear | vYEd | 6.28 |
| timber-shear | vZEd | 0 |
| timber-shear | shearCapacityY | 55.7511 |
| timber-shear | shearCapacityZ | 55.7511 |
| timber-shear | utilizationRatioY | 0.1126 |
| timber-shear | utilizationRatioZ | 0 |
| timber-lateral-torsional-stability | method | ntc2018-ec5-timber-lateral-torsional-stability-mvp |
| timber-lateral-torsional-stability | criticalStressSource | ec5-rectangular-simplified |
| timber-lateral-torsional-stability | e0_05 | 7333.3333 |
| timber-lateral-torsional-stability | e0_05Source | mean-elastic-modulus-ratio-2/3 |
| timber-lateral-torsional-stability | fmK | 24 |
| timber-lateral-torsional-stability | fmD | 12.8 |
| timber-lateral-torsional-stability | width | 140 |
| timber-lateral-torsional-stability | height | 280 |
| timber-lateral-torsional-stability | unbracedLength | 4 |
| timber-lateral-torsional-stability | sigmaMcrit | 100.1 |
| timber-lateral-torsional-stability | relativeSlenderness | 0.4897 |
| timber-lateral-torsional-stability | kcrit | 1 |
| timber-lateral-torsional-stability | myEd | 6.28 |
| timber-lateral-torsional-stability | mzEd | 0 |
| timber-lateral-torsional-stability | bendingCapacityY | 23415466.6667 |
| timber-lateral-torsional-stability | bendingCapacityZ | 11707733.3333 |
| timber-lateral-torsional-stability | utilizationRatioY | 0.2682 |
| timber-lateral-torsional-stability | utilizationRatioZ | 0 |
| timber-lateral-torsional-stability | weakAxisMomentIncluded | false |
| timber-lateral-torsional-stability | kmod | 0.8 |
| timber-lateral-torsional-stability | gammaM | 1.5 |
| timber-lateral-torsional-stability | resultId | timber-c24-report-ULS-LIVE |
| timber-lateral-torsional-stability | resultType | combination |
| timber-lateral-torsional-stability | station | 2 |
| timber-lateral-torsional-stability | limitState | ULS |
| timber-lateral-torsional-stability | combinationType | ULS_STR_GEO |
| timber-lateral-torsional-stability | segmentId | ltb-full-span |
| timber-lateral-torsional-stability | segmentFrom | 0 |
| timber-lateral-torsional-stability | segmentTo | 4 |
| timber-lateral-torsional-stability | unbracedLengthSectionUnits | 4000 |
| timber-lateral-torsional-stability | myEdSectionUnits | 6280000 |
| timber-lateral-torsional-stability | mzEdSectionUnits | 0 |
| timber-deflection | combinationId | timber-c24-report-SLE_RARE-LIVE |
| timber-deflection | station | 2 |
| timber-deflection | limitDenominator | 300 |
| timber-final-deflection | combinationId | timber-c24-report-SLE_QUASI_PERMANENT-all |
| timber-final-deflection | station | 2 |
| timber-final-deflection | limitDenominator | 300 |

## Esito

* Stato: ok
* Utilizzo governante: 0.268
* Verifica governante: timber-bending

## Warning

* Nessun warning.

## Assunzioni

* Timber lateral-torsional stability is checked on ULS FEM principal-axis bending for declared unbraced segments; automatic kcrit is limited to rectangular sections unless kcrit or sigmaMcrit is provided.
* The strong-axis moment My is reduced by kcrit; any weak-axis moment Mz from section rotation is included as an elastic weak-axis bending term.
* SLE vertical deflection limit defaults to L/300 unless overridden.
