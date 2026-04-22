# Trave in acciaio IPE200 con compressione

Trave appoggio-appoggio con carico assiale e verifica di interazione N + My.

## Modello

* ID: steel-ipe200-compression-interaction-report
* Unita: kN, m
* Modello di analisi: timoshenko
* Lunghezza: 5 m
* Luce orizzontale: 5 m

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
| start-support | steel-ipe200-compression-interaction-report-beam-node-1 | 0 | hinge | si | si | no |
| end-support | steel-ipe200-compression-interaction-report-beam-node-7 | 5 | roller | no | si | no |

## Carichi

| ID | Caso | Tipo | Durata | Fattore |
| --- | --- | --- | --- | --- |
| g1 | G1 | G1 | permanent | 1 |
| live | LIVE | Qk | medium | 1 |
| axial | AXIAL | Qk | medium | 1 |

## Combinazioni

| ID | Stato limite | Tipo | Fattori |
| --- | --- | --- | --- |
| steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | ULS_STR_GEO | G1: 1.3, LIVE: 1.5, AXIAL: 1.05 |
| steel-ipe200-compression-interaction-report-ULS-AXIAL | ULS | ULS_STR_GEO | G1: 1.3, LIVE: 1.05, AXIAL: 1.5 |
| steel-ipe200-compression-interaction-report-SLE_RARE-LIVE | SLE | SLE_RARE | G1: 1, LIVE: 1, AXIAL: 0.7 |
| steel-ipe200-compression-interaction-report-SLE_RARE-AXIAL | SLE | SLE_RARE | G1: 1, LIVE: 0.7, AXIAL: 1 |

## Rigidezze adottate

| ID | SL | Tipo | EA | EI vert. | EI Y | EI Z | GA vert. | GA Y | GA Z | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | ULS_STR_GEO | 598080 | 4080.3 | 4080.3 | 299.04 | 137307.6923 | 137307.6923 | 113076.9231 | - | - |
| steel-ipe200-compression-interaction-report-ULS-AXIAL | ULS | ULS_STR_GEO | 598080 | 4080.3 | 4080.3 | 299.04 | 137307.6923 | 137307.6923 | 113076.9231 | - | - |
| steel-ipe200-compression-interaction-report-SLE_RARE-LIVE | SLE | SLE_RARE | 598080 | 4080.3 | 4080.3 | 299.04 | 137307.6923 | 137307.6923 | 113076.9231 | - | - |
| steel-ipe200-compression-interaction-report-SLE_RARE-AXIAL | SLE | SLE_RARE | 598080 | 4080.3 | 4080.3 | 299.04 | 137307.6923 | 137307.6923 | 113076.9231 | - | - |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 17.1875 | 2.5 |
| MY max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 17.1875 | 2.5 |
| MZ max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 0 | 0 |
| V max | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 13.75 | 0 |
| V min | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | -13.75 | 5 |
| VY max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 13.75 | 0 |
| VZ max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 0 | 0 |
| Freccia SLE max assoluta | steel-ipe200-compression-interaction-report-SLE_RARE-LIVE | SLE | 0.0081 | 2.5 |

## Azioni principali

| Dominio | Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Tutti | MY max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 17.1875 | 2.5 |
| Tutti | MZ max assoluto | G1 | - | 0 | 0 |
| Tutti | VY max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 13.75 | 0 |
| Tutti | VZ max assoluto | G1 | - | 0 | 0 |
| Combinazioni | MY max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 17.1875 | 2.5 |
| Combinazioni | MZ max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 0 | 0 |
| Combinazioni | VY max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 13.75 | 0 |
| Combinazioni | VZ max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | MY max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 17.1875 | 2.5 |
| SLU | MZ max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | VY max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 13.75 | 0 |
| SLU | VZ max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | 0 | 0 |
| SLE | MY max assoluto | steel-ipe200-compression-interaction-report-SLE_RARE-LIVE | SLE | 12.5 | 2.5 |
| SLE | MZ max assoluto | steel-ipe200-compression-interaction-report-SLE_RARE-LIVE | SLE | 0 | 0 |
| SLE | VY max assoluto | steel-ipe200-compression-interaction-report-SLE_RARE-LIVE | SLE | 10 | 0 |
| SLE | VZ max assoluto | steel-ipe200-compression-interaction-report-SLE_RARE-LIVE | SLE | 0 | 0 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | steel-ipe200-compression-interaction-report-ULS-AXIAL | ULS | start-support | 105 | 0 |
| Ry max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | start-support | 13.75 | 0 |
| Mrz max assoluto | steel-ipe200-compression-interaction-report-ULS-LIVE | ULS | start-support | 0 | 0 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| steel-section-classification | Local steel section classification for the current N-M state | 1 | 3 | 0 | si |
| steel-bending | Biaxial bending resistance verification governed by section class | 17.1875 | 57.7751 | 0.297 | si |
| steel-shear | Biaxial shear resistance verification | 13.75 | 257.0537 | 0.053 | si |
| steel-axial | Axial resistance verification | 105 | 745.8912 | 0.141 | si |
| steel-elastic-stress | Normal-plus-shear stress screening with selected section modulus | 105.2185 | 261.9 | 0.402 | si |
| steel-axial-bending-interaction | Linear axial-bending interaction | 0.4017 | 1 | 0.402 | si |
| steel-lateral-torsional-buckling | Lateral-torsional buckling resistance of the steel beam segment | 17.1875 | 20.3141 | 0.846 | si |
| steel-compression-buckling | Compression buckling resistance of the steel member | 105 | 98.6008 | 1.065 | no |
| steel-beam-column-interaction-n-my | N+My member stability interaction by Method B | 1.7018 | 1 | 1.702 | no |
| steel-sle-deflection | Steel beam vertical deflection in service | 0.0081 | 0.02 | 0.403 | si |

## Dettagli verifiche

| Verifica | Parametro | Valore |
| --- | --- | --- |
| steel-section-classification | resultId | steel-ipe200-compression-interaction-report-ULS-AXIAL |
| steel-section-classification | resultType | combination |
| steel-section-classification | station | 0 |
| steel-section-classification | limitState | ULS |
| steel-section-classification | stationSource | grid |
| steel-section-classification | stationRole | verification-grid+support+critical-shear |
| steel-section-classification | stationSelectionMode | combined |
| steel-section-classification | isRequestedStation | true |
| steel-section-classification | isUserStation | false |
| steel-section-classification | isGridStation | true |
| steel-section-classification | isCriticalStation | true |
| steel-section-classification | stationTolerance | 0 |
| steel-section-classification | method | ntc2018-en1993-section-classification-mvp |
| steel-section-classification | sectionClass | 1 |
| steel-section-classification | profileName | IPE200 |
| steel-section-classification | family | IPE |
| steel-section-classification | epsilon | 0.9244 |
| steel-section-classification | axialForceConvention | absolute |
| steel-section-classification | axialCompressionForce | 105000 |
| steel-section-classification | nEd | -105 |
| steel-section-classification | mEd | 0 |
| steel-section-classification | mzEd | 0 |
| steel-section-classification | nEdSectionUnits | -105000 |
| steel-section-classification | mEdSectionUnits | 0 |
| steel-section-classification | mzEdSectionUnits | 0 |
| steel-section-classification | classificationSeverity | 0.7313 |
| steel-section-classification | flangeClass | 1 |
| steel-section-classification | webClass | 1 |
| steel-section-classification | flangeRatio | 4.1412 |
| steel-section-classification | webRatio | 28.3929 |
| steel-section-classification | webAlpha | 1 |
| steel-section-classification | webPsi | 1 |
| steel-bending | resultId | steel-ipe200-compression-interaction-report-ULS-LIVE |
| steel-bending | resultType | combination |
| steel-bending | station | 2.5 |
| steel-bending | limitState | ULS |
| steel-bending | stationSource | user |
| steel-bending | stationRole | verification-user+verification-grid+critical-bending |
| steel-bending | stationSelectionMode | combined |
| steel-bending | isRequestedStation | true |
| steel-bending | isUserStation | true |
| steel-bending | isGridStation | true |
| steel-bending | isCriticalStation | true |
| steel-bending | stationTolerance | 0 |
| steel-bending | fyd | 261.9 |
| steel-bending | gammaM0 | 1.05 |
| steel-bending | sectionClass | 1 |
| steel-bending | resistanceBasis | plastic |
| steel-bending | resistanceBasisZ | plastic |
| steel-bending | actionBasis | principal-actions |
| steel-bending | mYEd | 17.1875 |
| steel-bending | mZEd | 0 |
| steel-bending | selectedSectionModulus | 220600 |
| steel-bending | selectedSectionModulusZ | 44610 |
| steel-bending | elasticSectionModulus | 194300 |
| steel-bending | elasticSectionModulusZ | 28470 |
| steel-bending | plasticSectionModulus | 220600 |
| steel-bending | plasticSectionModulusZ | 44610 |
| steel-bending | elasticMomentResistance | 50887170 |
| steel-bending | plasticMomentResistance | 57775140 |
| steel-bending | bendingCapacityY | 57.7751 |
| steel-bending | bendingCapacityZ | 11.6834 |
| steel-bending | utilizationRatioY | 0.2975 |
| steel-bending | utilizationRatioZ | 0 |
| steel-shear | resultId | steel-ipe200-compression-interaction-report-ULS-LIVE |
| steel-shear | resultType | combination |
| steel-shear | station | 0 |
| steel-shear | limitState | ULS |
| steel-shear | stationSource | grid |
| steel-shear | stationRole | verification-grid+support+critical-shear |
| steel-shear | stationSelectionMode | combined |
| steel-shear | isRequestedStation | true |
| steel-shear | isUserStation | false |
| steel-shear | isGridStation | true |
| steel-shear | isCriticalStation | true |
| steel-shear | stationTolerance | 0 |
| steel-shear | fyd | 261.9 |
| steel-shear | shearArea | 1700 |
| steel-shear | shearAreaY | 1700 |
| steel-shear | shearAreaZ | 1400 |
| steel-shear | vYEd | 13.75 |
| steel-shear | vZEd | 0 |
| steel-shear | shearCapacityY | 257.0537 |
| steel-shear | shearCapacityZ | 211.6912 |
| steel-shear | utilizationRatioY | 0.0535 |
| steel-shear | utilizationRatioZ | 0 |
| steel-axial | resultId | steel-ipe200-compression-interaction-report-ULS-AXIAL |
| steel-axial | resultType | combination |
| steel-axial | station | 0 |
| steel-axial | limitState | ULS |
| steel-axial | stationSource | grid |
| steel-axial | stationRole | verification-grid+support+critical-shear |
| steel-axial | stationSelectionMode | combined |
| steel-axial | isRequestedStation | true |
| steel-axial | isUserStation | false |
| steel-axial | isGridStation | true |
| steel-axial | isCriticalStation | true |
| steel-axial | stationTolerance | 0 |
| steel-axial | fyd | 261.9 |
| steel-axial | area | 2848 |
| steel-elastic-stress | resultId | steel-ipe200-compression-interaction-report-ULS-AXIAL |
| steel-elastic-stress | resultType | combination |
| steel-elastic-stress | station | 2.5 |
| steel-elastic-stress | limitState | ULS |
| steel-elastic-stress | stationSource | user |
| steel-elastic-stress | stationRole | verification-user+verification-grid+critical-bending |
| steel-elastic-stress | stationSelectionMode | combined |
| steel-elastic-stress | isRequestedStation | true |
| steel-elastic-stress | isUserStation | true |
| steel-elastic-stress | isGridStation | true |
| steel-elastic-stress | isCriticalStation | true |
| steel-elastic-stress | stationTolerance | 0 |
| steel-elastic-stress | method | selected-modulus-von-mises-section-stress-screening |
| steel-elastic-stress | fyd | 261.9 |
| steel-elastic-stress | axialStress | 36.868 |
| steel-elastic-stress | bendingStress | 68.3505 |
| steel-elastic-stress | bendingStressZ | 0 |
| steel-elastic-stress | maxNormalStress | 105.2185 |
| steel-elastic-stress | shearStress | 0 |
| steel-elastic-stress | shearStressZ | 0 |
| steel-elastic-stress | equivalentStress | 105.2185 |
| steel-elastic-stress | area | 2848 |
| steel-elastic-stress | resistanceBasis | plastic |
| steel-elastic-stress | selectedSectionModulus | 220600 |
| steel-elastic-stress | elasticSectionModulus | 194300 |
| steel-elastic-stress | shearArea | 1700 |
| steel-axial-bending-interaction | resultId | steel-ipe200-compression-interaction-report-ULS-AXIAL |
| steel-axial-bending-interaction | resultType | combination |
| steel-axial-bending-interaction | station | 2.5 |
| steel-axial-bending-interaction | limitState | ULS |
| steel-axial-bending-interaction | stationSource | user |
| steel-axial-bending-interaction | stationRole | verification-user+verification-grid+critical-bending |
| steel-axial-bending-interaction | stationSelectionMode | combined |
| steel-axial-bending-interaction | isRequestedStation | true |
| steel-axial-bending-interaction | isUserStation | true |
| steel-axial-bending-interaction | isGridStation | true |
| steel-axial-bending-interaction | isCriticalStation | true |
| steel-axial-bending-interaction | stationTolerance | 0 |
| steel-axial-bending-interaction | axialUtilizationRatio | 0.1408 |
| steel-axial-bending-interaction | bendingUtilizationRatio | 0.261 |
| steel-lateral-torsional-buckling | method | ntc2018-en1993-lateral-torsional-buckling-mvp |
| steel-lateral-torsional-buckling | family | IPE |
| steel-lateral-torsional-buckling | E | 210000 |
| steel-lateral-torsional-buckling | G | 80769.2308 |
| steel-lateral-torsional-buckling | Iz | 1424000 |
| steel-lateral-torsional-buckling | It | 68460 |
| steel-lateral-torsional-buckling | Iw | 12746000000 |
| steel-lateral-torsional-buckling | unbracedLength | 5 |
| steel-lateral-torsional-buckling | effectiveLength | 5000 |
| steel-lateral-torsional-buckling | effectiveLengthFactor | 1 |
| steel-lateral-torsional-buckling | warpingLengthFactor | 1 |
| steel-lateral-torsional-buckling | momentGradientFactor | 1 |
| steel-lateral-torsional-buckling | warpingTerm | 8950.8427 |
| steel-lateral-torsional-buckling | torsionTerm | 46837.5124 |
| steel-lateral-torsional-buckling | criticalMomentMethod | ntc2018-en1993-ltb-mcr-ih-simplified |
| steel-lateral-torsional-buckling | sectionClass | 1 |
| steel-lateral-torsional-buckling | curve | b |
| steel-lateral-torsional-buckling | gammaM1 | 1.05 |
| steel-lateral-torsional-buckling | fyk | 275 |
| steel-lateral-torsional-buckling | bendingSectionModulus | 220600 |
| steel-lateral-torsional-buckling | referenceMoment | 60665000 |
| steel-lateral-torsional-buckling | criticalMoment | 27.8844 |
| steel-lateral-torsional-buckling | criticalMomentSource | automatic-simplified |
| steel-lateral-torsional-buckling | relativeSlenderness | 1.475 |
| steel-lateral-torsional-buckling | chiLT | 0.3516 |
| steel-lateral-torsional-buckling | baseChiLT | 0.3516 |
| steel-lateral-torsional-buckling | phiLT | 1.8045 |
| steel-lateral-torsional-buckling | alphaLT | 0.34 |
| steel-lateral-torsional-buckling | beta | 1 |
| steel-lateral-torsional-buckling | lambda0 | 0.2 |
| steel-lateral-torsional-buckling | fFactor | 1 |
| steel-lateral-torsional-buckling | kChi | 1 |
| steel-lateral-torsional-buckling | resultId | steel-ipe200-compression-interaction-report-ULS-LIVE |
| steel-lateral-torsional-buckling | resultType | combination |
| steel-lateral-torsional-buckling | station | 2.5 |
| steel-lateral-torsional-buckling | limitState | ULS |
| steel-lateral-torsional-buckling | combinationType | ULS_STR_GEO |
| steel-lateral-torsional-buckling | segmentId | ltb-full-span |
| steel-lateral-torsional-buckling | segmentFrom | 0 |
| steel-lateral-torsional-buckling | segmentTo | 5 |
| steel-lateral-torsional-buckling | unbracedLengthSectionUnits | 5000 |
| steel-lateral-torsional-buckling | mEd | 17.1875 |
| steel-lateral-torsional-buckling | mzEd | 0 |
| steel-lateral-torsional-buckling | mEdSectionUnits | 17187500 |
| steel-lateral-torsional-buckling | mzEdSectionUnits | 0 |
| steel-lateral-torsional-buckling | nEdSectionUnits | -73500 |
| steel-lateral-torsional-buckling | resistanceBasis | plastic |
| steel-lateral-torsional-buckling | criticalMomentSectionUnits | 27884367.5681 |
| steel-compression-buckling | method | ntc2018-4.2.4.1.3.1-compression-buckling |
| steel-compression-buckling | family | IPE |
| steel-compression-buckling | sectionClass | 1 |
| steel-compression-buckling | axialForceConvention | absolute |
| steel-compression-buckling | gammaM1 | 1.05 |
| steel-compression-buckling | fyk | 275 |
| steel-compression-buckling | elasticModulus | 210000 |
| steel-compression-buckling | area | 2848 |
| steel-compression-buckling | lengthY | 5 |
| steel-compression-buckling | lengthZ | 5 |
| steel-compression-buckling | effectiveLengthY | 5 |
| steel-compression-buckling | effectiveLengthZ | 5 |
| steel-compression-buckling | effectiveLengthFactorY | 1 |
| steel-compression-buckling | effectiveLengthFactorZ | 1 |
| steel-compression-buckling | curveY | a |
| steel-compression-buckling | curveZ | b |
| steel-compression-buckling | curveSource | ntc2018-table-4.2.VIII-rolled-ih |
| steel-compression-buckling | governingAxis | z |
| steel-compression-buckling | axisYResistance | 633.2808 |
| steel-compression-buckling | axisZResistance | 98.6008 |
| steel-compression-buckling | axisYUtilizationRatio | 0.1658 |
| steel-compression-buckling | axisZUtilizationRatio | 1.0649 |
| steel-compression-buckling | axisYRelativeSlenderness | 0.6973 |
| steel-compression-buckling | axisZRelativeSlenderness | 2.5757 |
| steel-compression-buckling | chiY | 0.849 |
| steel-compression-buckling | chiZ | 0.1322 |
| steel-compression-buckling | nCrY | 1610837.8735 |
| steel-compression-buckling | nCrZ | 118056.26 |
| steel-compression-buckling | resultId | steel-ipe200-compression-interaction-report-ULS-AXIAL |
| steel-compression-buckling | resultType | combination |
| steel-compression-buckling | station | 4.1667 |
| steel-compression-buckling | limitState | ULS |
| steel-compression-buckling | combinationType | ULS_STR_GEO |
| steel-compression-buckling | nEd | -105 |
| steel-compression-buckling | nEdSectionUnits | -105000 |
| steel-compression-buckling | mEd | 8.3767 |
| steel-compression-buckling | mzEd | 0 |
| steel-compression-buckling | mEdSectionUnits | 8376736.1111 |
| steel-compression-buckling | lengthInferenceSource | inferred-pinned-pinned |
| steel-compression-buckling | axisYResistanceSectionUnits | 633280.776 |
| steel-compression-buckling | axisZResistanceSectionUnits | 98600.82 |
| steel-beam-column-interaction-n-my | method | circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my |
| steel-beam-column-interaction-n-my | interactionTable | C4.2.V-open-torsionally-deformable-members |
| steel-beam-column-interaction-n-my | domain | N+My |
| steel-beam-column-interaction-n-my | excludedActions | Mz, torsion, torsional-interactions |
| steel-beam-column-interaction-n-my | family | IPE |
| steel-beam-column-interaction-n-my | sectionClass | 1 |
| steel-beam-column-interaction-n-my | axialForceConvention | absolute |
| steel-beam-column-interaction-n-my | gammaM1 | 1.05 |
| steel-beam-column-interaction-n-my | fyk | 275 |
| steel-beam-column-interaction-n-my | area | 2848 |
| steel-beam-column-interaction-n-my | bendingSectionModulus | 220600 |
| steel-beam-column-interaction-n-my | chiY | 0.849 |
| steel-beam-column-interaction-n-my | chiZ | 0.1322 |
| steel-beam-column-interaction-n-my | chiLT | 0.3516 |
| steel-beam-column-interaction-n-my | relativeSlendernessY | 0.6973 |
| steel-beam-column-interaction-n-my | relativeSlendernessZ | 2.5757 |
| steel-beam-column-interaction-n-my | axialRatioY | 0.1658 |
| steel-beam-column-interaction-n-my | axialRatioZ | 1.0649 |
| steel-beam-column-interaction-n-my | bendingRatio | 0.7423 |
| steel-beam-column-interaction-n-my | equationY | 0.9693 |
| steel-beam-column-interaction-n-my | equationZ | 1.7018 |
| steel-beam-column-interaction-n-my | governingEquation | z |
| steel-beam-column-interaction-n-my | kyy | 1.0825 |
| steel-beam-column-interaction-n-my | kzy | 0.858 |
| steel-beam-column-interaction-n-my | alphaMy | 1 |
| steel-beam-column-interaction-n-my | alphaMLT | 1 |
| steel-beam-column-interaction-n-my | resultId | steel-ipe200-compression-interaction-report-ULS-AXIAL |
| steel-beam-column-interaction-n-my | resultType | combination |
| steel-beam-column-interaction-n-my | station | 2.5 |
| steel-beam-column-interaction-n-my | limitState | ULS |
| steel-beam-column-interaction-n-my | combinationType | ULS_STR_GEO |
| steel-beam-column-interaction-n-my | nEd | -105 |
| steel-beam-column-interaction-n-my | nEdSectionUnits | -105000 |
| steel-beam-column-interaction-n-my | myEd | 15.0781 |
| steel-beam-column-interaction-n-my | mzEd | 0 |
| steel-beam-column-interaction-n-my | myEdSectionUnits | 15078125 |
| steel-beam-column-interaction-n-my | mzEdSectionUnits | 0 |
| steel-beam-column-interaction-n-my | lengthY | 5 |
| steel-beam-column-interaction-n-my | lengthZ | 5 |
| steel-beam-column-interaction-n-my | effectiveLengthY | 5 |
| steel-beam-column-interaction-n-my | effectiveLengthZ | 5 |
| steel-beam-column-interaction-n-my | lengthInferenceSource | inferred-pinned-pinned |
| steel-beam-column-interaction-n-my | resistanceBasis | plastic |
| steel-beam-column-interaction-n-my | resistanceBasisZ | plastic |
| steel-beam-column-interaction-n-my | chiLTSource | ltb-verification |
| steel-beam-column-interaction-n-my | segmentId | ltb-full-span |
| steel-beam-column-interaction-n-my | unbracedLength | 5 |
| steel-beam-column-interaction-n-my | unbracedLengthSectionUnits | 5000 |
| steel-beam-column-interaction-n-my | criticalMoment | 27.8844 |
| steel-beam-column-interaction-n-my | criticalMomentSectionUnits | 27884367.5681 |
| steel-beam-column-interaction-n-my | criticalMomentSource | automatic-simplified |
| steel-sle-deflection | method | ntc2018-4.2.4.2.1-screening |
| steel-sle-deflection | resultId | steel-ipe200-compression-interaction-report-SLE_RARE-LIVE |
| steel-sle-deflection | resultType | combination |
| steel-sle-deflection | limitState | SLE |
| steel-sle-deflection | combinationType | SLE_RARE |
| steel-sle-deflection | station | 2.5 |
| steel-sle-deflection | span | 5 |
| steel-sle-deflection | deflectionLimitRatio | 250 |
| steel-sle-deflection | maxAbsDeflection | 0.0081 |

## Esito

* Stato: not-verified
* Utilizzo governante: 1.702
* Verifica governante: steel-beam-column-interaction-n-my

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
