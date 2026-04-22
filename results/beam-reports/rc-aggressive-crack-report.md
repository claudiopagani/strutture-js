# Trave in c.a. ambiente aggressivo

Esempio mirato alla fessurazione indiretta SLE in ambiente aggressivo.

## Modello

* ID: rc-aggressive-crack-report
* Unita: kN, m
* Modello di analisi: euler-bernoulli
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
| start-support | rc-aggressive-crack-report-beam-node-1 | 0 | hinge | si | si | no |
| end-support | rc-aggressive-crack-report-beam-node-7 | 5 | roller | no | si | no |

## Carichi

| ID | Caso | Tipo | Durata | Fattore |
| --- | --- | --- | --- | --- |
| g1 | G1 | G1 | permanent | 1 |
| live | LIVE | Qk | medium | 1 |

## Combinazioni

| ID | Stato limite | Tipo | Fattori |
| --- | --- | --- | --- |
| rc-aggressive-crack-report-ULS-LIVE | ULS | ULS_STR_GEO | G1: 1.3, LIVE: 1.5 |
| rc-aggressive-crack-report-SLE_RARE-LIVE | SLE | SLE_RARE | G1: 1, LIVE: 1 |
| rc-aggressive-crack-report-SLE_FREQUENT-LIVE | SLE | SLE_FREQUENT | G1: 1, LIVE: 0.5 |
| rc-aggressive-crack-report-SLE_QUASI_PERMANENT-all | SLE | SLE_QUASI_PERMANENT | G1: 1, LIVE: 0.3 |

## Rigidezze adottate

| ID | SL | Tipo | EA | EI vert. | EI Y | EI Z | GA vert. | GA Y | GA Z | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rc-aggressive-crack-report-ULS-LIVE | ULS | ULS_STR_GEO | 4890292.0211 | 105253.97 | 105253.97 | 37167.6526 | 1967250 | 1967250 | 1967250 | - | - |
| rc-aggressive-crack-report-SLE_RARE-LIVE | SLE | SLE_RARE | 4890292.0211 | 105253.97 | 105253.97 | 37167.6526 | 1967250 | 1967250 | 1967250 | - | - |
| rc-aggressive-crack-report-SLE_FREQUENT-LIVE | SLE | SLE_FREQUENT | 4890292.0211 | 105253.97 | 105253.97 | 37167.6526 | 1967250 | 1967250 | 1967250 | - | - |
| rc-aggressive-crack-report-SLE_QUASI_PERMANENT-all | SLE | SLE_QUASI_PERMANENT | 4890292.0211 | 105253.97 | 105253.97 | 37167.6526 | 1967250 | 1967250 | 1967250 | - | - |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | 61.25 | 2.5 |
| MY max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | 61.25 | 2.5 |
| MZ max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | 0 | 0 |
| V max | rc-aggressive-crack-report-ULS-LIVE | ULS | 49 | 0 |
| V min | rc-aggressive-crack-report-ULS-LIVE | ULS | -49 | 5 |
| VY max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | 49 | 0 |
| VZ max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | 0 | 0 |
| Freccia SLE max assoluta | rc-aggressive-crack-report-SLE_RARE-LIVE | SLE | 0.0011 | 2.5 |

## Azioni principali

| Dominio | Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Tutti | MY max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | 61.25 | 2.5 |
| Tutti | MZ max assoluto | G1 | - | 0 | 0 |
| Tutti | VY max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | 49 | 0 |
| Tutti | VZ max assoluto | G1 | - | 0 | 0 |
| Combinazioni | MY max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | 61.25 | 2.5 |
| Combinazioni | MZ max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | 0 | 0 |
| Combinazioni | VY max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | 49 | 0 |
| Combinazioni | VZ max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | MY max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | 61.25 | 2.5 |
| SLU | MZ max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | 0 | 0 |
| SLU | VY max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | 49 | 0 |
| SLU | VZ max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | 0 | 0 |
| SLE | MY max assoluto | rc-aggressive-crack-report-SLE_RARE-LIVE | SLE | 43.75 | 2.5 |
| SLE | MZ max assoluto | rc-aggressive-crack-report-SLE_RARE-LIVE | SLE | 0 | 0 |
| SLE | VY max assoluto | rc-aggressive-crack-report-SLE_RARE-LIVE | SLE | 35 | 5 |
| SLE | VZ max assoluto | rc-aggressive-crack-report-SLE_RARE-LIVE | SLE | 0 | 0 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | start-support | 0 | 0 |
| Ry max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | start-support | 49 | 0 |
| Mrz max assoluto | rc-aggressive-crack-report-ULS-LIVE | ULS | start-support | 0 | 0 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| rc-uls-uniaxial-bending | Uniaxial bending resistance at assigned axial force | 61250000 | 68365094.6314 | 0.896 | si |
| rc-shear-resistance | Shear resistance as maximum between stirrup and no-stirrup mechanisms | 49000 | 265529.9244 | 0.185 | si |
| rc-sle-concrete-stress | Concrete compression stress limit in service | 4.4593 | 15 | 0.297 | si |
| rc-sle-steel-stress | Reinforcement stress limit in service | 263.4563 | 360 | 0.732 | si |
| rc-sle-crack-bar-diameter | Indirect crack control through maximum reinforcing bar diameter | 16 | 22.4695 | 0.712 | si |
| rc-sle-crack-bar-spacing | Indirect crack control through maximum reinforcing bar spacing | 204 | 185.9418 | 1.097 | no |
| rc-sle-deflection-curvature | RC deflection from curvature integration | 3.3952 | 20 | 0.17 | si |
| rc-sle-deflection-slenderness | Simplified RC span-depth deflection screening | 10 | 20 | 0.5 | si |

## Dettagli verifiche

| Verifica | Parametro | Valore |
| --- | --- | --- |
| rc-uls-uniaxial-bending | resultId | rc-aggressive-crack-report-ULS-LIVE |
| rc-uls-uniaxial-bending | resultType | combination |
| rc-uls-uniaxial-bending | station | 2.5 |
| rc-uls-uniaxial-bending | limitState | ULS |
| rc-uls-uniaxial-bending | stationSource | user |
| rc-uls-uniaxial-bending | stationRole | verification-user+verification-grid+critical-bending |
| rc-uls-uniaxial-bending | stationSelectionMode | combined |
| rc-uls-uniaxial-bending | isRequestedStation | true |
| rc-uls-uniaxial-bending | isUserStation | true |
| rc-uls-uniaxial-bending | isGridStation | true |
| rc-uls-uniaxial-bending | isCriticalStation | true |
| rc-uls-uniaxial-bending | stationTolerance | 0 |
| rc-uls-uniaxial-bending | compressedEdge | top |
| rc-shear-resistance | resultId | rc-aggressive-crack-report-ULS-LIVE |
| rc-shear-resistance | resultType | combination |
| rc-shear-resistance | station | 0 |
| rc-shear-resistance | limitState | ULS |
| rc-shear-resistance | stationSource | grid |
| rc-shear-resistance | stationRole | verification-grid+support+critical-shear |
| rc-shear-resistance | stationSelectionMode | combined |
| rc-shear-resistance | isRequestedStation | true |
| rc-shear-resistance | isUserStation | false |
| rc-shear-resistance | isGridStation | true |
| rc-shear-resistance | isCriticalStation | true |
| rc-shear-resistance | stationTolerance | 0 |
| rc-shear-resistance | method | ntc2018-4.1.2.3.5.2 |
| rc-shear-resistance | selectedMechanism | with-transverse-reinforcement |
| rc-shear-resistance | vRdWithTransverseReinforcement | 265529.9244 |
| rc-shear-resistance | vRdWithoutTransverseReinforcement | 52725.308 |
| rc-shear-resistance | vRsd | 265529.9244 |
| rc-shear-resistance | vRcd | 296837.069 |
| rc-shear-resistance | Asw | 100.531 |
| rc-shear-resistance | spacing | 150 |
| rc-shear-resistance | AswPerS | 0.6702 |
| rc-shear-resistance | fyd | 391.3 |
| rc-shear-resistance | z | 405 |
| rc-shear-resistance | cotTheta | 2.5 |
| rc-shear-resistance | thetaSelection | steel-boundary-max-cot |
| rc-shear-resistance | cotThetaMin | 1 |
| rc-shear-resistance | cotThetaMax | 2.5 |
| rc-shear-resistance | bw | 300 |
| rc-shear-resistance | d | 450 |
| rc-shear-resistance | fcd | 14.17 |
| rc-shear-resistance | fcdPrime | 7.085 |
| rc-shear-resistance | alphaC | 1 |
| rc-sle-concrete-stress | resultId | rc-aggressive-crack-report-SLE_RARE-LIVE |
| rc-sle-concrete-stress | resultType | combination |
| rc-sle-concrete-stress | station | 2.5 |
| rc-sle-concrete-stress | limitState | SLE |
| rc-sle-concrete-stress | stationSource | user |
| rc-sle-concrete-stress | stationRole | verification-user+verification-grid+critical-bending |
| rc-sle-concrete-stress | stationSelectionMode | combined |
| rc-sle-concrete-stress | isRequestedStation | true |
| rc-sle-concrete-stress | isUserStation | true |
| rc-sle-concrete-stress | isGridStation | true |
| rc-sle-concrete-stress | isCriticalStation | true |
| rc-sle-concrete-stress | stationTolerance | 0 |
| rc-sle-concrete-stress | method | ntc2018-4.1.2.2.5.1-characteristic |
| rc-sle-concrete-stress | combinationType | SLE_RARE |
| rc-sle-concrete-stress | limitFactor | 0.6 |
| rc-sle-concrete-stress | fck | 25 |
| rc-sle-concrete-stress | sigmaCMax | 4.4593 |
| rc-sle-concrete-stress | modularRatio | 15 |
| rc-sle-concrete-stress | mxEd | -43750000 |
| rc-sle-concrete-stress | myEd | 0 |
| rc-sle-concrete-stress | biaxialStress | false |
| rc-sle-steel-stress | resultId | rc-aggressive-crack-report-SLE_RARE-LIVE |
| rc-sle-steel-stress | resultType | combination |
| rc-sle-steel-stress | station | 2.5 |
| rc-sle-steel-stress | limitState | SLE |
| rc-sle-steel-stress | stationSource | user |
| rc-sle-steel-stress | stationRole | verification-user+verification-grid+critical-bending |
| rc-sle-steel-stress | stationSelectionMode | combined |
| rc-sle-steel-stress | isRequestedStation | true |
| rc-sle-steel-stress | isUserStation | true |
| rc-sle-steel-stress | isGridStation | true |
| rc-sle-steel-stress | isCriticalStation | true |
| rc-sle-steel-stress | stationTolerance | 0 |
| rc-sle-steel-stress | method | ntc2018-4.1.2.2.5.2-characteristic |
| rc-sle-steel-stress | combinationType | SLE_RARE |
| rc-sle-steel-stress | limitFactor | 0.8 |
| rc-sle-steel-stress | fyk | 450 |
| rc-sle-steel-stress | sigmaSMax | 263.4563 |
| rc-sle-steel-stress | modularRatio | 15 |
| rc-sle-steel-stress | mxEd | -43750000 |
| rc-sle-steel-stress | myEd | 0 |
| rc-sle-steel-stress | biaxialStress | false |
| rc-sle-crack-bar-diameter | resultId | rc-aggressive-crack-report-SLE_QUASI_PERMANENT-all |
| rc-sle-crack-bar-diameter | resultType | combination |
| rc-sle-crack-bar-diameter | station | 2.5 |
| rc-sle-crack-bar-diameter | limitState | SLE |
| rc-sle-crack-bar-diameter | stationSource | user |
| rc-sle-crack-bar-diameter | stationRole | verification-user+verification-grid+critical-bending |
| rc-sle-crack-bar-diameter | stationSelectionMode | combined |
| rc-sle-crack-bar-diameter | isRequestedStation | true |
| rc-sle-crack-bar-diameter | isUserStation | true |
| rc-sle-crack-bar-diameter | isGridStation | true |
| rc-sle-crack-bar-diameter | isCriticalStation | true |
| rc-sle-crack-bar-diameter | stationTolerance | 0 |
| rc-sle-crack-bar-diameter | method | circolare-ntc2018-c4.1.ii |
| rc-sle-crack-bar-diameter | combinationType | SLE_QUASI_PERMANENT |
| rc-sle-crack-bar-diameter | environment | aggressive |
| rc-sle-crack-bar-diameter | crackWidthClass | w1 |
| rc-sle-crack-bar-diameter | groupId | bottom-main |
| rc-sle-crack-bar-diameter | face | bottom |
| rc-sle-crack-bar-diameter | barId | bottom-main-1 |
| rc-sle-crack-bar-diameter | sigmaS | 171.2466 |
| rc-sle-crack-bar-diameter | diameter | 16 |
| rc-sle-crack-bar-diameter | diameterLimit | 22.4695 |
| rc-sle-crack-bar-diameter | momentBasis | primary-moment-only |
| rc-sle-crack-bar-diameter | mEd | 28437500 |
| rc-sle-crack-bar-diameter | weakAxisMomentNeglected | false |
| rc-sle-crack-bar-diameter | neglectedMyEd | 0 |
| rc-sle-crack-bar-spacing | resultId | rc-aggressive-crack-report-SLE_QUASI_PERMANENT-all |
| rc-sle-crack-bar-spacing | resultType | combination |
| rc-sle-crack-bar-spacing | station | 2.5 |
| rc-sle-crack-bar-spacing | limitState | SLE |
| rc-sle-crack-bar-spacing | stationSource | user |
| rc-sle-crack-bar-spacing | stationRole | verification-user+verification-grid+critical-bending |
| rc-sle-crack-bar-spacing | stationSelectionMode | combined |
| rc-sle-crack-bar-spacing | isRequestedStation | true |
| rc-sle-crack-bar-spacing | isUserStation | true |
| rc-sle-crack-bar-spacing | isGridStation | true |
| rc-sle-crack-bar-spacing | isCriticalStation | true |
| rc-sle-crack-bar-spacing | stationTolerance | 0 |
| rc-sle-crack-bar-spacing | method | circolare-ntc2018-c4.1.iii |
| rc-sle-crack-bar-spacing | combinationType | SLE_QUASI_PERMANENT |
| rc-sle-crack-bar-spacing | environment | aggressive |
| rc-sle-crack-bar-spacing | crackWidthClass | w1 |
| rc-sle-crack-bar-spacing | groupId | bottom-main |
| rc-sle-crack-bar-spacing | face | bottom |
| rc-sle-crack-bar-spacing | barId | bottom-main-1 |
| rc-sle-crack-bar-spacing | sigmaS | 171.2466 |
| rc-sle-crack-bar-spacing | spacing | 204 |
| rc-sle-crack-bar-spacing | spacingLimit | 185.9418 |
| rc-sle-crack-bar-spacing | rowTolerance | 50 |
| rc-sle-crack-bar-spacing | momentBasis | primary-moment-only |
| rc-sle-crack-bar-spacing | mEd | 28437500 |
| rc-sle-crack-bar-spacing | weakAxisMomentNeglected | false |
| rc-sle-crack-bar-spacing | neglectedMyEd | 0 |
| rc-sle-deflection-curvature | resultId | rc-aggressive-crack-report-SLE_RARE-LIVE |
| rc-sle-deflection-curvature | resultType | combination |
| rc-sle-deflection-curvature | limitState | SLE |
| rc-sle-deflection-curvature | combinationType | SLE_RARE |
| rc-sle-deflection-curvature | station | 2.5 |
| rc-sle-deflection-curvature | creepCoefficient | 0 |
| rc-sle-deflection-curvature | modularRatio | 6.6718 |
| rc-sle-deflection-curvature | limitRatio | 250 |
| rc-sle-deflection-curvature | maxAbsDeflection | 3.3952 |
| rc-sle-deflection-curvature | span | 5000 |
| rc-sle-deflection-curvature | mcr | 32000000 |
| rc-sle-deflection-slenderness | method | circolare-ntc2018-c4.1.i-screening |
| rc-sle-deflection-slenderness | system | simple_span |
| rc-sle-deflection-slenderness | stressLevel | low |
| rc-sle-deflection-slenderness | k | 1 |
| rc-sle-deflection-slenderness | span | 5000 |
| rc-sle-deflection-slenderness | sectionHeight | 500 |
| rc-sle-deflection-slenderness | slendernessLimit | 20 |

## Esito

* Stato: not-verified
* Utilizzo governante: 1.097
* Verifica governante: rc-sle-crack-bar-spacing

## Warning

* Minimum shear reinforcement detailing, spacing limits, anchorage and torsion are not included in this MVP check.
* Crack-control environment aggressive was used; default is ordinary.
* Full member detailing and second-order effects are not included in this RC beam verification step.

## Assunzioni

* Current workflow implements only ULS uniaxial resistance with concrete ultimate strain governing the compressed edge.
* Concrete in tension is neglected during the ULS resistance integration.
* NTC 2018 4.1.2.3.5.2 is evaluated with the variable-angle truss model for vertical stirrups and cotTheta selected to maximize min(VRsd, VRcd).
* For reinforced sections the reported shear resistance is the maximum between the stirrup mechanism and the no-stirrup mechanism when both are available.
* The lever arm z defaults to 0.9 d unless shear.leverArm is passed explicitly.
* RC SLE stresses are solved with a linear no-tension concrete section and the modular-ratio method.
* The first SLE cracking MVP uses ordinary reinforcing steel as low-sensitivity reinforcement.
* Creep coefficient for the deflection MVP is set to phi = 2; shrinkage curvature is not included.
* Curvatures are integrated numerically along FEM service-combination stations.
* Concrete tension is excluded in cracked service-section states.
* Long-term quasi-permanent curvature uses phi = 2; shrinkage curvature is excluded.
* Each FEM station is checked as an independent RC section; ULS bending and SLE stress checks use biaxial actions when present, while crack control remains based on the primary bending plane.
