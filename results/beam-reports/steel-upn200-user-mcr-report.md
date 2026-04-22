# Trave in acciaio UPN200 con Mcr utente

Profilo UPN verificato con momento critico elastico fornito dall'utente.

## Modello

* ID: steel-upn200-user-mcr-report
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
| start-support | steel-upn200-user-mcr-report-beam-node-1 | 0 | hinge | si | si | no |
| end-support | steel-upn200-user-mcr-report-beam-node-7 | 4.5 | roller | no | si | no |

## Carichi

| ID | Caso | Tipo | Durata | Fattore |
| --- | --- | --- | --- | --- |
| g1 | G1 | G1 | permanent | 1 |
| live | LIVE | Qk | medium | 1 |

## Combinazioni

| ID | Stato limite | Tipo | Fattori |
| --- | --- | --- | --- |
| steel-upn200-user-mcr-report-ULS-LIVE | ULS | ULS_STR_GEO | G1: 1.3, LIVE: 1.5 |
| steel-upn200-user-mcr-report-SLE_RARE-LIVE | SLE | SLE_RARE | G1: 1, LIVE: 1 |

## Rigidezze adottate

| ID | SL | Tipo | EA | EI vert. | EI Y | EI Z | GA vert. | GA Y | GA Z | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| steel-upn200-user-mcr-report-ULS-LIVE | ULS | ULS_STR_GEO | 676200 | 4011 | 4011 | 310.8 | 63726.9231 | 63726.9231 | 118246.1538 | - | - |
| steel-upn200-user-mcr-report-SLE_RARE-LIVE | SLE | SLE_RARE | 676200 | 4011 | 4011 | 310.8 | 63726.9231 | 63726.9231 | 118246.1538 | - | - |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 15.0609 | 2.25 |
| MY max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 15.0609 | 2.25 |
| MZ max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 0 | 0 |
| V max | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 13.3875 | 0 |
| V min | steel-upn200-user-mcr-report-ULS-LIVE | ULS | -13.3875 | 4.5 |
| VY max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 13.3875 | 0 |
| VZ max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 0 | 0 |
| Freccia SLE max assoluta | steel-upn200-user-mcr-report-SLE_RARE-LIVE | SLE | 0.0059 | 2.25 |

## Azioni principali

| Dominio | Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Tutti | MY max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 15.0609 | 2.25 |
| Tutti | MZ max assoluto | G1 | - | 0 | 0 |
| Tutti | VY max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 13.3875 | 0 |
| Tutti | VZ max assoluto | G1 | - | 0 | 0 |
| Combinazioni | MY max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 15.0609 | 2.25 |
| Combinazioni | MZ max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 0 | 0 |
| Combinazioni | VY max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 13.3875 | 0 |
| Combinazioni | VZ max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | MY max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 15.0609 | 2.25 |
| SLU | MZ max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | VY max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 13.3875 | 0 |
| SLU | VZ max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | 0 | 0 |
| SLE | MY max assoluto | steel-upn200-user-mcr-report-SLE_RARE-LIVE | SLE | 10.8844 | 2.25 |
| SLE | MZ max assoluto | steel-upn200-user-mcr-report-SLE_RARE-LIVE | SLE | 0 | 0 |
| SLE | VY max assoluto | steel-upn200-user-mcr-report-SLE_RARE-LIVE | SLE | 9.675 | 0 |
| SLE | VZ max assoluto | steel-upn200-user-mcr-report-SLE_RARE-LIVE | SLE | 0 | 0 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | start-support | 0 | 0 |
| Ry max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | start-support | 13.3875 | 0 |
| Mrz max assoluto | steel-upn200-user-mcr-report-ULS-LIVE | ULS | start-support | 0 | 0 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| steel-section-classification | Local steel section classification for the current N-M state | 1 | 3 | 0 | si |
| steel-bending | Biaxial bending resistance verification governed by section class | 15.0609 | 59.7132 | 0.252 | si |
| steel-shear | Biaxial shear resistance verification | 13.3875 | 119.3031 | 0.112 | si |
| steel-axial | Axial resistance verification | 0 | 843.318 | 0 | si |
| steel-elastic-stress | Normal-plus-shear stress screening with selected section modulus | 66.0567 | 261.9 | 0.252 | si |
| steel-axial-bending-interaction | Linear axial-bending interaction | 0.2522 | 1 | 0.252 | si |
| steel-lateral-torsional-buckling | Lateral-torsional buckling resistance of the steel beam segment | 15.0609 | 37.5192 | 0.401 | si |
| steel-compression-buckling | Compression buckling resistance of the steel member | 0 | 118.6087 | 0 | si |
| steel-sle-deflection | Steel beam vertical deflection in service | 0.0059 | 0.018 | 0.327 | si |

## Dettagli verifiche

| Verifica | Parametro | Valore |
| --- | --- | --- |
| steel-section-classification | resultId | steel-upn200-user-mcr-report-ULS-LIVE |
| steel-section-classification | resultType | combination |
| steel-section-classification | station | 2.25 |
| steel-section-classification | limitState | ULS |
| steel-section-classification | stationSource | user |
| steel-section-classification | stationRole | verification-user+verification-grid+critical-bending |
| steel-section-classification | stationSelectionMode | combined |
| steel-section-classification | isRequestedStation | true |
| steel-section-classification | isUserStation | true |
| steel-section-classification | isGridStation | true |
| steel-section-classification | isCriticalStation | true |
| steel-section-classification | stationTolerance | 0 |
| steel-section-classification | method | ntc2018-en1993-section-classification-mvp |
| steel-section-classification | sectionClass | 1 |
| steel-section-classification | profileName | UPN200 |
| steel-section-classification | family | UPN |
| steel-section-classification | epsilon | 0.9244 |
| steel-section-classification | axialForceConvention | absolute |
| steel-section-classification | axialCompressionForce | 0 |
| steel-section-classification | nEd | 0 |
| steel-section-classification | mEd | 15.0609 |
| steel-section-classification | mzEd | 0 |
| steel-section-classification | nEdSectionUnits | 0 |
| steel-section-classification | mEdSectionUnits | 15060937.5 |
| steel-section-classification | mzEdSectionUnits | 0 |
| steel-section-classification | classificationSeverity | 0.3981 |
| steel-section-classification | flangeClass | 1 |
| steel-section-classification | webClass | 1 |
| steel-section-classification | flangeRatio | 5.1522 |
| steel-section-classification | webRatio | 18.1176 |
| steel-section-classification | webAlpha | 0.5 |
| steel-section-classification | webPsi | -1 |
| steel-bending | resultId | steel-upn200-user-mcr-report-ULS-LIVE |
| steel-bending | resultType | combination |
| steel-bending | station | 2.25 |
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
| steel-bending | mYEd | 15.0609 |
| steel-bending | mZEd | 0 |
| steel-bending | selectedSectionModulus | 228000 |
| steel-bending | selectedSectionModulusZ | 51800 |
| steel-bending | elasticSectionModulus | 191000 |
| steel-bending | elasticSectionModulusZ | 27000 |
| steel-bending | plasticSectionModulus | 228000 |
| steel-bending | plasticSectionModulusZ | 51800 |
| steel-bending | elasticMomentResistance | 50022900 |
| steel-bending | plasticMomentResistance | 59713200 |
| steel-bending | bendingCapacityY | 59.7132 |
| steel-bending | bendingCapacityZ | 13.5664 |
| steel-bending | utilizationRatioY | 0.2522 |
| steel-bending | utilizationRatioZ | 0 |
| steel-shear | resultId | steel-upn200-user-mcr-report-ULS-LIVE |
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
| steel-shear | shearArea | 789 |
| steel-shear | shearAreaY | 789 |
| steel-shear | shearAreaZ | 1464 |
| steel-shear | vYEd | 13.3875 |
| steel-shear | vZEd | 0 |
| steel-shear | shearCapacityY | 119.3031 |
| steel-shear | shearCapacityZ | 221.3686 |
| steel-shear | utilizationRatioY | 0.1122 |
| steel-shear | utilizationRatioZ | 0 |
| steel-axial | resultId | steel-upn200-user-mcr-report-ULS-LIVE |
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
| steel-axial | area | 3220 |
| steel-elastic-stress | resultId | steel-upn200-user-mcr-report-ULS-LIVE |
| steel-elastic-stress | resultType | combination |
| steel-elastic-stress | station | 2.25 |
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
| steel-elastic-stress | axialStress | 0 |
| steel-elastic-stress | bendingStress | 66.0567 |
| steel-elastic-stress | bendingStressZ | 0 |
| steel-elastic-stress | maxNormalStress | 66.0567 |
| steel-elastic-stress | shearStress | 0 |
| steel-elastic-stress | shearStressZ | 0 |
| steel-elastic-stress | equivalentStress | 66.0567 |
| steel-elastic-stress | area | 3220 |
| steel-elastic-stress | resistanceBasis | plastic |
| steel-elastic-stress | selectedSectionModulus | 228000 |
| steel-elastic-stress | elasticSectionModulus | 191000 |
| steel-elastic-stress | shearArea | 789 |
| steel-axial-bending-interaction | resultId | steel-upn200-user-mcr-report-ULS-LIVE |
| steel-axial-bending-interaction | resultType | combination |
| steel-axial-bending-interaction | station | 2.25 |
| steel-axial-bending-interaction | limitState | ULS |
| steel-axial-bending-interaction | stationSource | user |
| steel-axial-bending-interaction | stationRole | verification-user+verification-grid+critical-bending |
| steel-axial-bending-interaction | stationSelectionMode | combined |
| steel-axial-bending-interaction | isRequestedStation | true |
| steel-axial-bending-interaction | isUserStation | true |
| steel-axial-bending-interaction | isGridStation | true |
| steel-axial-bending-interaction | isCriticalStation | true |
| steel-axial-bending-interaction | stationTolerance | 0 |
| steel-axial-bending-interaction | axialUtilizationRatio | 0 |
| steel-axial-bending-interaction | bendingUtilizationRatio | 0.2522 |
| steel-lateral-torsional-buckling | method | ntc2018-en1993-lateral-torsional-buckling-mvp |
| steel-lateral-torsional-buckling | criticalMomentMethod | - |
| steel-lateral-torsional-buckling | family | UPN |
| steel-lateral-torsional-buckling | sectionClass | 1 |
| steel-lateral-torsional-buckling | curve | d |
| steel-lateral-torsional-buckling | gammaM1 | 1.05 |
| steel-lateral-torsional-buckling | fyk | 275 |
| steel-lateral-torsional-buckling | bendingSectionModulus | 228000 |
| steel-lateral-torsional-buckling | referenceMoment | 62700000 |
| steel-lateral-torsional-buckling | criticalMoment | 120 |
| steel-lateral-torsional-buckling | criticalMomentSource | example-user-mcr |
| steel-lateral-torsional-buckling | relativeSlenderness | 0.7228 |
| steel-lateral-torsional-buckling | chiLT | 0.6283 |
| steel-lateral-torsional-buckling | baseChiLT | 0.6283 |
| steel-lateral-torsional-buckling | phiLT | 0.9599 |
| steel-lateral-torsional-buckling | alphaLT | 0.76 |
| steel-lateral-torsional-buckling | beta | 1 |
| steel-lateral-torsional-buckling | lambda0 | 0.2 |
| steel-lateral-torsional-buckling | fFactor | 1 |
| steel-lateral-torsional-buckling | kChi | 1 |
| steel-lateral-torsional-buckling | resultId | steel-upn200-user-mcr-report-ULS-LIVE |
| steel-lateral-torsional-buckling | resultType | combination |
| steel-lateral-torsional-buckling | station | 2.25 |
| steel-lateral-torsional-buckling | limitState | ULS |
| steel-lateral-torsional-buckling | combinationType | ULS_STR_GEO |
| steel-lateral-torsional-buckling | segmentId | ltb-full-span |
| steel-lateral-torsional-buckling | segmentFrom | 0 |
| steel-lateral-torsional-buckling | segmentTo | 4.5 |
| steel-lateral-torsional-buckling | unbracedLength | 4.5 |
| steel-lateral-torsional-buckling | unbracedLengthSectionUnits | 4500 |
| steel-lateral-torsional-buckling | mEd | 15.0609 |
| steel-lateral-torsional-buckling | mzEd | 0 |
| steel-lateral-torsional-buckling | mEdSectionUnits | 15060937.5 |
| steel-lateral-torsional-buckling | mzEdSectionUnits | 0 |
| steel-lateral-torsional-buckling | nEdSectionUnits | 0 |
| steel-lateral-torsional-buckling | resistanceBasis | plastic |
| steel-lateral-torsional-buckling | criticalMomentSectionUnits | 120000000 |
| steel-compression-buckling | method | ntc2018-4.2.4.1.3.1-compression-buckling |
| steel-compression-buckling | family | UPN |
| steel-compression-buckling | sectionClass | 1 |
| steel-compression-buckling | axialForceConvention | absolute |
| steel-compression-buckling | gammaM1 | 1.05 |
| steel-compression-buckling | fyk | 275 |
| steel-compression-buckling | elasticModulus | 210000 |
| steel-compression-buckling | area | 3220 |
| steel-compression-buckling | lengthY | 4.5 |
| steel-compression-buckling | lengthZ | 4.5 |
| steel-compression-buckling | effectiveLengthY | 4.5 |
| steel-compression-buckling | effectiveLengthZ | 4.5 |
| steel-compression-buckling | effectiveLengthFactorY | 1 |
| steel-compression-buckling | effectiveLengthFactorZ | 1 |
| steel-compression-buckling | curveY | c |
| steel-compression-buckling | curveZ | c |
| steel-compression-buckling | curveSource | ntc2018-table-4.2.VIII-u-section-default |
| steel-compression-buckling | governingAxis | z |
| steel-compression-buckling | axisYResistance | 625.1745 |
| steel-compression-buckling | axisZResistance | 118.6087 |
| steel-compression-buckling | axisYUtilizationRatio | 0 |
| steel-compression-buckling | axisZUtilizationRatio | 0 |
| steel-compression-buckling | axisYRelativeSlenderness | 0.673 |
| steel-compression-buckling | axisZRelativeSlenderness | 2.4178 |
| steel-compression-buckling | chiY | 0.7413 |
| steel-compression-buckling | chiZ | 0.1406 |
| steel-compression-buckling | nCrY | 1954912.7532 |
| steel-compression-buckling | nCrZ | 151480.1505 |
| steel-compression-buckling | resultId | steel-upn200-user-mcr-report-ULS-LIVE |
| steel-compression-buckling | resultType | combination |
| steel-compression-buckling | station | 0 |
| steel-compression-buckling | limitState | ULS |
| steel-compression-buckling | combinationType | ULS_STR_GEO |
| steel-compression-buckling | nEd | 0 |
| steel-compression-buckling | nEdSectionUnits | 0 |
| steel-compression-buckling | mEd | 0 |
| steel-compression-buckling | mzEd | 0 |
| steel-compression-buckling | mEdSectionUnits | 0 |
| steel-compression-buckling | lengthInferenceSource | inferred-pinned-pinned |
| steel-compression-buckling | axisYResistanceSectionUnits | 625174.4865 |
| steel-compression-buckling | axisZResistanceSectionUnits | 118608.7266 |
| steel-sle-deflection | method | ntc2018-4.2.4.2.1-screening |
| steel-sle-deflection | resultId | steel-upn200-user-mcr-report-SLE_RARE-LIVE |
| steel-sle-deflection | resultType | combination |
| steel-sle-deflection | limitState | SLE |
| steel-sle-deflection | combinationType | SLE_RARE |
| steel-sle-deflection | station | 2.25 |
| steel-sle-deflection | span | 4.5 |
| steel-sle-deflection | deflectionLimitRatio | 250 |
| steel-sle-deflection | maxAbsDeflection | 0.0059 |

## Esito

* Stato: not-verified
* Utilizzo governante: 0.401
* Verifica governante: steel-lateral-torsional-buckling

## Warning

* Section classification is included for I/H and UPN profiles, but effective class-4 section properties are not implemented yet.
* N+My Method B stability interaction is implemented for doubly symmetric I/H profiles; profile family UPN requires a dedicated extension or explicit override.
* No steel beam-column interaction check was generated; Method B needs ULS FEM samples, class 1-3 section, compression buckling data, chiLT and section moduli.
* Steel member stability excludes torsion and torsional interactions; N+My+Mz is available only for supported doubly symmetric I/H profiles.

## Assunzioni

* Steel section bending resistance is governed by local section class: class 1/2 can use Wpl, class 3 uses Wel, class 4 is blocked until effective properties exist.
* Steel section classification is evaluated locally for each ULS FEM station.
* Axial force is treated as compression by absolute value for section classification unless a different convention is configured.
* Lateral-torsional buckling is checked on ULS FEM bending maxima for declared unbraced segments; automatic Mcr is limited to doubly symmetric I/H profiles.
* Compression buckling uses NTC 2018 flexural buckling reductions about y and z; effective lengths default from the simple-beam supports and can be overridden.
* Steel beam-column stability interaction uses Circolare NTC 2018 Method B; Mz is included for supported doubly symmetric I/H profiles, while torsion and torsional interactions are excluded.
* SLE vertical deflection limit defaults to L/250 unless overridden.
