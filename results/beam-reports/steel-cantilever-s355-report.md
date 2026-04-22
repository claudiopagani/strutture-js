# Mensola in acciaio S355 HEA200

Mensola con carico puntuale in estremita e verifiche di sezione e stabilita N+My.

## Modello

* ID: steel-cantilever-s355-report
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

| ID | SL | Tipo | EA | EI vert. | EI Y | EI Z | GA vert. | GA Y | GA Z | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| steel-cantilever-s355-report-ULS-LIVE | ULS | ULS_STR_GEO | 1130430 | 7753.2 | 7753.2 | 2805.6 | 323076.9231 | 323076.9231 | 146030.7692 | - | - |
| steel-cantilever-s355-report-SLE_RARE-LIVE | SLE | SLE_RARE | 1130430 | 7753.2 | 7753.2 | 2805.6 | 323076.9231 | 323076.9231 | 146030.7692 | - | - |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 35.775 | 0 |
| MY max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 35.775 | 0 |
| MZ max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 0 | 0 |
| V max | steel-cantilever-s355-report-ULS-LIVE | ULS | 14.85 | 0 |
| V min | steel-cantilever-s355-report-ULS-LIVE | ULS | 9 | 3 |
| VY max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 14.85 | 0 |
| VZ max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 0 | 0 |
| Freccia SLE max assoluta | steel-cantilever-s355-report-SLE_RARE-LIVE | SLE | 0.009 | 3 |

## Azioni principali

| Dominio | Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Tutti | MY max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 35.775 | 0 |
| Tutti | MZ max assoluto | G1 | - | 0 | 0 |
| Tutti | VY max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 14.85 | 0 |
| Tutti | VZ max assoluto | G1 | - | 0 | 0 |
| Combinazioni | MY max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 35.775 | 0 |
| Combinazioni | MZ max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 0 | 0 |
| Combinazioni | VY max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 14.85 | 0 |
| Combinazioni | VZ max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | MY max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 35.775 | 0 |
| SLU | MZ max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | VY max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 14.85 | 0 |
| SLU | VZ max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | 0 | 0 |
| SLE | MY max assoluto | steel-cantilever-s355-report-SLE_RARE-LIVE | SLE | 24.75 | 0 |
| SLE | MZ max assoluto | steel-cantilever-s355-report-SLE_RARE-LIVE | SLE | 0 | 0 |
| SLE | VY max assoluto | steel-cantilever-s355-report-SLE_RARE-LIVE | SLE | 10.5 | 0 |
| SLE | VZ max assoluto | steel-cantilever-s355-report-SLE_RARE-LIVE | SLE | 0 | 0 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | start-support | 0 | 0 |
| Ry max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | start-support | 14.85 | 0 |
| Mrz max assoluto | steel-cantilever-s355-report-ULS-LIVE | ULS | start-support | 35.775 | 0 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| steel-section-classification | Local steel section classification for the current N-M state | 2 | 3 | 0 | si |
| steel-bending | Biaxial bending resistance verification governed by section class | 35.775 | 145.214 | 0.246 | si |
| steel-shear | Biaxial shear resistance verification | 14.85 | 780.8085 | 0.019 | si |
| steel-axial | Axial resistance verification | 0 | 1819.9923 | 0 | si |
| steel-elastic-stress | Normal-plus-shear stress screening with selected section modulus | 83.5424 | 338.1 | 0.247 | si |
| steel-axial-bending-interaction | Linear axial-bending interaction | 0.2464 | 1 | 0.246 | si |
| steel-lateral-torsional-buckling | Lateral-torsional buckling resistance of the steel beam segment | 35.775 | 94.1085 | 0.38 | si |
| steel-compression-buckling | Compression buckling resistance of the steel member | 0 | 529.7292 | 0 | si |
| steel-beam-column-interaction-n-my | N+My member stability interaction by Method B | 0.3801 | 1 | 0.38 | si |
| steel-sle-deflection | Steel beam vertical deflection in service | 0.009 | 0.012 | 0.75 | si |

## Dettagli verifiche

| Verifica | Parametro | Valore |
| --- | --- | --- |
| steel-section-classification | resultId | steel-cantilever-s355-report-ULS-LIVE |
| steel-section-classification | resultType | combination |
| steel-section-classification | station | 0 |
| steel-section-classification | limitState | ULS |
| steel-section-classification | stationSource | critical |
| steel-section-classification | stationRole | support+critical-bending+critical-shear |
| steel-section-classification | stationSelectionMode | all |
| steel-section-classification | isRequestedStation | false |
| steel-section-classification | isUserStation | false |
| steel-section-classification | isGridStation | false |
| steel-section-classification | isCriticalStation | true |
| steel-section-classification | stationTolerance | 0 |
| steel-section-classification | method | ntc2018-en1993-section-classification-mvp |
| steel-section-classification | sectionClass | 2 |
| steel-section-classification | profileName | HEA200 |
| steel-section-classification | family | HEA |
| steel-section-classification | epsilon | 0.8136 |
| steel-section-classification | axialForceConvention | absolute |
| steel-section-classification | axialCompressionForce | 0 |
| steel-section-classification | nEd | 0 |
| steel-section-classification | mEd | -35.775 |
| steel-section-classification | mzEd | 0 |
| steel-section-classification | nEdSectionUnits | 0 |
| steel-section-classification | mEdSectionUnits | -35775000 |
| steel-section-classification | mzEdSectionUnits | 0 |
| steel-section-classification | classificationSeverity | 0.6914 |
| steel-section-classification | flangeClass | 2 |
| steel-section-classification | webClass | 1 |
| steel-section-classification | flangeRatio | 7.875 |
| steel-section-classification | webRatio | 20.6154 |
| steel-section-classification | webAlpha | 0.5 |
| steel-section-classification | webPsi | -1 |
| steel-bending | resultId | steel-cantilever-s355-report-ULS-LIVE |
| steel-bending | resultType | combination |
| steel-bending | station | 0 |
| steel-bending | limitState | ULS |
| steel-bending | stationSource | critical |
| steel-bending | stationRole | support+critical-bending+critical-shear |
| steel-bending | stationSelectionMode | all |
| steel-bending | isRequestedStation | false |
| steel-bending | isUserStation | false |
| steel-bending | isGridStation | false |
| steel-bending | isCriticalStation | true |
| steel-bending | stationTolerance | 0 |
| steel-bending | fyd | 338.1 |
| steel-bending | gammaM0 | 1.05 |
| steel-bending | sectionClass | 2 |
| steel-bending | resistanceBasis | plastic |
| steel-bending | resistanceBasisZ | plastic |
| steel-bending | actionBasis | principal-actions |
| steel-bending | mYEd | -35.775 |
| steel-bending | mZEd | 0 |
| steel-bending | selectedSectionModulus | 429500 |
| steel-bending | selectedSectionModulusZ | 203800 |
| steel-bending | elasticSectionModulus | 388600 |
| steel-bending | elasticSectionModulusZ | 133600 |
| steel-bending | plasticSectionModulus | 429500 |
| steel-bending | plasticSectionModulusZ | 203800 |
| steel-bending | elasticMomentResistance | 131385660 |
| steel-bending | plasticMomentResistance | 145213950 |
| steel-bending | bendingCapacityY | 145.214 |
| steel-bending | bendingCapacityZ | 68.9048 |
| steel-bending | utilizationRatioY | 0.2464 |
| steel-bending | utilizationRatioZ | 0 |
| steel-shear | resultId | steel-cantilever-s355-report-ULS-LIVE |
| steel-shear | resultType | combination |
| steel-shear | station | 0 |
| steel-shear | limitState | ULS |
| steel-shear | stationSource | critical |
| steel-shear | stationRole | support+critical-bending+critical-shear |
| steel-shear | stationSelectionMode | all |
| steel-shear | isRequestedStation | false |
| steel-shear | isUserStation | false |
| steel-shear | isGridStation | false |
| steel-shear | isCriticalStation | true |
| steel-shear | stationTolerance | 0 |
| steel-shear | fyd | 338.1 |
| steel-shear | shearArea | 4000 |
| steel-shear | shearAreaY | 4000 |
| steel-shear | shearAreaZ | 1808 |
| steel-shear | vYEd | 14.85 |
| steel-shear | vZEd | 0 |
| steel-shear | shearCapacityY | 780.8085 |
| steel-shear | shearCapacityZ | 352.9254 |
| steel-shear | utilizationRatioY | 0.019 |
| steel-shear | utilizationRatioZ | 0 |
| steel-axial | resultId | steel-cantilever-s355-report-ULS-LIVE |
| steel-axial | resultType | combination |
| steel-axial | station | 0 |
| steel-axial | limitState | ULS |
| steel-axial | stationSource | critical |
| steel-axial | stationRole | support+critical-bending+critical-shear |
| steel-axial | stationSelectionMode | all |
| steel-axial | isRequestedStation | false |
| steel-axial | isUserStation | false |
| steel-axial | isGridStation | false |
| steel-axial | isCriticalStation | true |
| steel-axial | stationTolerance | 0 |
| steel-axial | fyd | 338.1 |
| steel-axial | area | 5383 |
| steel-elastic-stress | resultId | steel-cantilever-s355-report-ULS-LIVE |
| steel-elastic-stress | resultType | combination |
| steel-elastic-stress | station | 0 |
| steel-elastic-stress | limitState | ULS |
| steel-elastic-stress | stationSource | critical |
| steel-elastic-stress | stationRole | support+critical-bending+critical-shear |
| steel-elastic-stress | stationSelectionMode | all |
| steel-elastic-stress | isRequestedStation | false |
| steel-elastic-stress | isUserStation | false |
| steel-elastic-stress | isGridStation | false |
| steel-elastic-stress | isCriticalStation | true |
| steel-elastic-stress | stationTolerance | 0 |
| steel-elastic-stress | method | selected-modulus-von-mises-section-stress-screening |
| steel-elastic-stress | fyd | 338.1 |
| steel-elastic-stress | axialStress | 0 |
| steel-elastic-stress | bendingStress | 83.2945 |
| steel-elastic-stress | bendingStressZ | 0 |
| steel-elastic-stress | maxNormalStress | 83.2945 |
| steel-elastic-stress | shearStress | 3.7125 |
| steel-elastic-stress | shearStressZ | 0 |
| steel-elastic-stress | equivalentStress | 83.5424 |
| steel-elastic-stress | area | 5383 |
| steel-elastic-stress | resistanceBasis | plastic |
| steel-elastic-stress | selectedSectionModulus | 429500 |
| steel-elastic-stress | elasticSectionModulus | 388600 |
| steel-elastic-stress | shearArea | 4000 |
| steel-axial-bending-interaction | resultId | steel-cantilever-s355-report-ULS-LIVE |
| steel-axial-bending-interaction | resultType | combination |
| steel-axial-bending-interaction | station | 0 |
| steel-axial-bending-interaction | limitState | ULS |
| steel-axial-bending-interaction | stationSource | critical |
| steel-axial-bending-interaction | stationRole | support+critical-bending+critical-shear |
| steel-axial-bending-interaction | stationSelectionMode | all |
| steel-axial-bending-interaction | isRequestedStation | false |
| steel-axial-bending-interaction | isUserStation | false |
| steel-axial-bending-interaction | isGridStation | false |
| steel-axial-bending-interaction | isCriticalStation | true |
| steel-axial-bending-interaction | stationTolerance | 0 |
| steel-axial-bending-interaction | axialUtilizationRatio | 0 |
| steel-axial-bending-interaction | bendingUtilizationRatio | 0.2464 |
| steel-lateral-torsional-buckling | method | ntc2018-en1993-lateral-torsional-buckling-mvp |
| steel-lateral-torsional-buckling | criticalMomentMethod | - |
| steel-lateral-torsional-buckling | family | HEA |
| steel-lateral-torsional-buckling | sectionClass | 2 |
| steel-lateral-torsional-buckling | curve | b |
| steel-lateral-torsional-buckling | gammaM1 | 1.05 |
| steel-lateral-torsional-buckling | fyk | 355 |
| steel-lateral-torsional-buckling | bendingSectionModulus | 429500 |
| steel-lateral-torsional-buckling | referenceMoment | 152472500 |
| steel-lateral-torsional-buckling | criticalMoment | 180 |
| steel-lateral-torsional-buckling | criticalMomentSource | example-user-input |
| steel-lateral-torsional-buckling | relativeSlenderness | 0.9204 |
| steel-lateral-torsional-buckling | chiLT | 0.6481 |
| steel-lateral-torsional-buckling | baseChiLT | 0.6481 |
| steel-lateral-torsional-buckling | phiLT | 1.046 |
| steel-lateral-torsional-buckling | alphaLT | 0.34 |
| steel-lateral-torsional-buckling | beta | 1 |
| steel-lateral-torsional-buckling | lambda0 | 0.2 |
| steel-lateral-torsional-buckling | fFactor | 1 |
| steel-lateral-torsional-buckling | kChi | 1 |
| steel-lateral-torsional-buckling | resultId | steel-cantilever-s355-report-ULS-LIVE |
| steel-lateral-torsional-buckling | resultType | combination |
| steel-lateral-torsional-buckling | station | 0 |
| steel-lateral-torsional-buckling | limitState | ULS |
| steel-lateral-torsional-buckling | combinationType | ULS_STR_GEO |
| steel-lateral-torsional-buckling | segmentId | ltb-full-span |
| steel-lateral-torsional-buckling | segmentFrom | 0 |
| steel-lateral-torsional-buckling | segmentTo | 3 |
| steel-lateral-torsional-buckling | unbracedLength | 3 |
| steel-lateral-torsional-buckling | unbracedLengthSectionUnits | 3000 |
| steel-lateral-torsional-buckling | mEd | -35.775 |
| steel-lateral-torsional-buckling | mzEd | 0 |
| steel-lateral-torsional-buckling | mEdSectionUnits | -35775000 |
| steel-lateral-torsional-buckling | mzEdSectionUnits | 0 |
| steel-lateral-torsional-buckling | nEdSectionUnits | 0 |
| steel-lateral-torsional-buckling | resistanceBasis | plastic |
| steel-lateral-torsional-buckling | criticalMomentSectionUnits | 180000000 |
| steel-compression-buckling | method | ntc2018-4.2.4.1.3.1-compression-buckling |
| steel-compression-buckling | family | HEA |
| steel-compression-buckling | sectionClass | 2 |
| steel-compression-buckling | axialForceConvention | absolute |
| steel-compression-buckling | gammaM1 | 1.05 |
| steel-compression-buckling | fyk | 355 |
| steel-compression-buckling | elasticModulus | 210000 |
| steel-compression-buckling | area | 5383 |
| steel-compression-buckling | lengthY | 3 |
| steel-compression-buckling | lengthZ | 3 |
| steel-compression-buckling | effectiveLengthY | 6 |
| steel-compression-buckling | effectiveLengthZ | 6 |
| steel-compression-buckling | effectiveLengthFactorY | 2 |
| steel-compression-buckling | effectiveLengthFactorZ | 2 |
| steel-compression-buckling | curveY | b |
| steel-compression-buckling | curveZ | c |
| steel-compression-buckling | curveSource | ntc2018-table-4.2.VIII-rolled-ih |
| steel-compression-buckling | governingAxis | z |
| steel-compression-buckling | axisYResistance | 1146.8955 |
| steel-compression-buckling | axisZResistance | 529.7292 |
| steel-compression-buckling | axisYUtilizationRatio | 0 |
| steel-compression-buckling | axisZUtilizationRatio | 0 |
| steel-compression-buckling | axisYRelativeSlenderness | 0.9482 |
| steel-compression-buckling | axisZRelativeSlenderness | 1.5762 |
| steel-compression-buckling | chiY | 0.6302 |
| steel-compression-buckling | chiZ | 0.2911 |
| steel-compression-buckling | nCrY | 2125583.8012 |
| steel-compression-buckling | nCrZ | 769171.1697 |
| steel-compression-buckling | resultId | steel-cantilever-s355-report-ULS-LIVE |
| steel-compression-buckling | resultType | combination |
| steel-compression-buckling | station | 0 |
| steel-compression-buckling | limitState | ULS |
| steel-compression-buckling | combinationType | ULS_STR_GEO |
| steel-compression-buckling | nEd | 0 |
| steel-compression-buckling | nEdSectionUnits | 0 |
| steel-compression-buckling | mEd | -35.775 |
| steel-compression-buckling | mzEd | 0 |
| steel-compression-buckling | mEdSectionUnits | -35775000 |
| steel-compression-buckling | lengthInferenceSource | inferred-cantilever-fixed-free |
| steel-compression-buckling | axisYResistanceSectionUnits | 1146895.4797 |
| steel-compression-buckling | axisZResistanceSectionUnits | 529729.1776 |
| steel-beam-column-interaction-n-my | method | circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my |
| steel-beam-column-interaction-n-my | interactionTable | C4.2.V-open-torsionally-deformable-members |
| steel-beam-column-interaction-n-my | domain | N+My |
| steel-beam-column-interaction-n-my | excludedActions | Mz, torsion, torsional-interactions |
| steel-beam-column-interaction-n-my | family | HEA |
| steel-beam-column-interaction-n-my | sectionClass | 2 |
| steel-beam-column-interaction-n-my | axialForceConvention | absolute |
| steel-beam-column-interaction-n-my | gammaM1 | 1.05 |
| steel-beam-column-interaction-n-my | fyk | 355 |
| steel-beam-column-interaction-n-my | area | 5383 |
| steel-beam-column-interaction-n-my | bendingSectionModulus | 429500 |
| steel-beam-column-interaction-n-my | chiY | 0.6302 |
| steel-beam-column-interaction-n-my | chiZ | 0.2911 |
| steel-beam-column-interaction-n-my | chiLT | 0.6481 |
| steel-beam-column-interaction-n-my | relativeSlendernessY | 0.9482 |
| steel-beam-column-interaction-n-my | relativeSlendernessZ | 1.5762 |
| steel-beam-column-interaction-n-my | axialRatioY | 0 |
| steel-beam-column-interaction-n-my | axialRatioZ | 0 |
| steel-beam-column-interaction-n-my | bendingRatio | 0.3801 |
| steel-beam-column-interaction-n-my | equationY | 0.3801 |
| steel-beam-column-interaction-n-my | equationZ | 0.3801 |
| steel-beam-column-interaction-n-my | governingEquation | y |
| steel-beam-column-interaction-n-my | kyy | 1 |
| steel-beam-column-interaction-n-my | kzy | 1 |
| steel-beam-column-interaction-n-my | alphaMy | 1 |
| steel-beam-column-interaction-n-my | alphaMLT | 1 |
| steel-beam-column-interaction-n-my | resultId | steel-cantilever-s355-report-ULS-LIVE |
| steel-beam-column-interaction-n-my | resultType | combination |
| steel-beam-column-interaction-n-my | station | 0 |
| steel-beam-column-interaction-n-my | limitState | ULS |
| steel-beam-column-interaction-n-my | combinationType | ULS_STR_GEO |
| steel-beam-column-interaction-n-my | nEd | 0 |
| steel-beam-column-interaction-n-my | nEdSectionUnits | 0 |
| steel-beam-column-interaction-n-my | myEd | -35.775 |
| steel-beam-column-interaction-n-my | mzEd | 0 |
| steel-beam-column-interaction-n-my | myEdSectionUnits | -35775000 |
| steel-beam-column-interaction-n-my | mzEdSectionUnits | 0 |
| steel-beam-column-interaction-n-my | lengthY | 3 |
| steel-beam-column-interaction-n-my | lengthZ | 3 |
| steel-beam-column-interaction-n-my | effectiveLengthY | 6 |
| steel-beam-column-interaction-n-my | effectiveLengthZ | 6 |
| steel-beam-column-interaction-n-my | lengthInferenceSource | inferred-cantilever-fixed-free |
| steel-beam-column-interaction-n-my | resistanceBasis | plastic |
| steel-beam-column-interaction-n-my | resistanceBasisZ | plastic |
| steel-beam-column-interaction-n-my | chiLTSource | ltb-verification |
| steel-beam-column-interaction-n-my | segmentId | ltb-full-span |
| steel-beam-column-interaction-n-my | unbracedLength | 3 |
| steel-beam-column-interaction-n-my | unbracedLengthSectionUnits | 3000 |
| steel-beam-column-interaction-n-my | criticalMoment | 180 |
| steel-beam-column-interaction-n-my | criticalMomentSectionUnits | 180000000 |
| steel-beam-column-interaction-n-my | criticalMomentSource | example-user-input |
| steel-sle-deflection | method | ntc2018-4.2.4.2.1-screening |
| steel-sle-deflection | resultId | steel-cantilever-s355-report-SLE_RARE-LIVE |
| steel-sle-deflection | resultType | combination |
| steel-sle-deflection | limitState | SLE |
| steel-sle-deflection | combinationType | SLE_RARE |
| steel-sle-deflection | station | 3 |
| steel-sle-deflection | span | 3 |
| steel-sle-deflection | deflectionLimitRatio | 250 |
| steel-sle-deflection | maxAbsDeflection | 0.009 |

## Esito

* Stato: ok
* Utilizzo governante: 0.75
* Verifica governante: steel-sle-deflection

## Warning

* Section classification is included for I/H and UPN profiles, but effective class-4 section properties are not implemented yet.
* Steel member stability excludes torsion and torsional interactions; N+My+Mz is available only for supported doubly symmetric I/H profiles.

## Assunzioni

* Steel section bending resistance is governed by local section class: class 1/2 can use Wpl, class 3 uses Wel, class 4 is blocked until effective properties exist.
* Steel section classification is evaluated locally for each ULS FEM station.
* Axial force is treated as compression by absolute value for section classification unless a different convention is configured.
* Lateral-torsional buckling is checked on ULS FEM bending maxima for declared unbraced segments; automatic Mcr is limited to doubly symmetric I/H profiles.
* Compression buckling uses NTC 2018 flexural buckling reductions about y and z; effective lengths default from the simple-beam supports and can be overridden.
* Steel beam-column stability interaction uses Circolare NTC 2018 Method B; Mz is included for supported doubly symmetric I/H profiles, while torsion and torsional interactions are excluded.
* SLE vertical deflection limit defaults to L/250 unless overridden.
