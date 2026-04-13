# Trave in c.a. elastica C25/30

Analisi elastica non fessurata con rigidezza trasformata e prima verifica ULS di sezione da azioni FEM.

## Modello

* ID: rc-elastic-report
* Unita: kN, m
* Modello di analisi: euler-bernoulli
* Lunghezza: 5 m
* Luce orizzontale: 5 m

## Vincoli

| ID | Nodo | Stazione | Tipo | ux | uy | rz |
| --- | --- | --- | --- | --- | --- | --- |
| start-support | rc-elastic-report-beam-node-1 | 0 | hinge | si | si | no |
| end-support | rc-elastic-report-beam-node-7 | 5 | roller | no | si | no |

## Carichi

| ID | Caso | Tipo | Durata | Fattore |
| --- | --- | --- | --- | --- |
| g1 | G1 | G1 | permanent | 1 |
| live | LIVE | Qk | medium | 1 |

## Combinazioni

| ID | Stato limite | Tipo | Fattori |
| --- | --- | --- | --- |
| rc-elastic-report-ULS-LIVE | ULS | ULS_STR_GEO | G1: 1.3, LIVE: 1.5 |
| rc-elastic-report-SLE_RARE-LIVE | SLE | SLE_RARE | G1: 1, LIVE: 1 |
| rc-elastic-report-SLE_FREQUENT-LIVE | SLE | SLE_FREQUENT | G1: 1, LIVE: 0.5 |
| rc-elastic-report-SLE_QUASI_PERMANENT-all | SLE | SLE_QUASI_PERMANENT | G1: 1, LIVE: 0.3 |

## Rigidezze adottate

| ID | SL | Tipo | EA | EI | GA | k/gamma | finale/kdef |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rc-elastic-report-ULS-LIVE | ULS | ULS_STR_GEO | 4985293.7829 | 108918.2513 | 1967250 | - | - |
| rc-elastic-report-SLE_RARE-LIVE | SLE | SLE_RARE | 4985293.7829 | 108918.2513 | 1967250 | - | - |
| rc-elastic-report-SLE_FREQUENT-LIVE | SLE | SLE_FREQUENT | 4985293.7829 | 108918.2513 | 1967250 | - | - |
| rc-elastic-report-SLE_QUASI_PERMANENT-all | SLE | SLE_QUASI_PERMANENT | 4985293.7829 | 108918.2513 | 1967250 | - | - |

## Inviluppi governanti

| Grandezza | Risultato | SL | Valore | Stazione |
| --- | --- | --- | --- | --- |
| M max assoluto | rc-elastic-report-ULS-LIVE | ULS | 55.9375 | 2.5 |
| V max | rc-elastic-report-ULS-LIVE | ULS | 44.75 | 0 |
| V min | rc-elastic-report-ULS-LIVE | ULS | -44.75 | 5 |
| Freccia SLE max assoluta | rc-elastic-report-SLE_RARE-LIVE | SLE | 0.001 | 2.5 |

## Reazioni governanti

| Grandezza | Risultato | SL | Supporto | Valore | Stazione |
| --- | --- | --- | --- | --- | --- |
| Rx max assoluto | rc-elastic-report-ULS-LIVE | ULS | start-support | 0 | 0 |
| Ry max assoluto | rc-elastic-report-ULS-LIVE | ULS | start-support | 44.75 | 0 |
| Mrz max assoluto | rc-elastic-report-ULS-LIVE | ULS | start-support | 0 | 0 |

## Verifiche

| ID | Descrizione | Domanda | Capacita | Utilizzo | OK |
| --- | --- | --- | --- | --- | --- |
| rc-uls-uniaxial-bending | Uniaxial bending resistance at assigned axial force | 55937500 | 103510562.2613 | 0.54 | si |
| rc-shear-resistance | Shear resistance as maximum between stirrup and no-stirrup mechanisms | 44750 | 265529.9244 | 0.169 | si |
| rc-sle-concrete-stress | Concrete compression stress limit in service | 3.4244 | 15 | 0.228 | si |
| rc-sle-steel-stress | Reinforcement stress limit in service | 159.8141 | 360 | 0.444 | si |
| rc-sle-crack-bar-diameter | Indirect crack control through maximum reinforcing bar diameter | 20 | 32 | 0.625 | si |
| rc-sle-crack-bar-spacing | Indirect crack control through maximum reinforcing bar spacing | 200 | 300 | 0.667 | si |
| rc-sle-deflection-curvature | RC deflection from curvature integration | 2.0092 | 20 | 0.1 | si |
| rc-sle-deflection-slenderness | Simplified RC span-depth deflection screening | 10 | 20 | 0.5 | si |

## Dettagli verifiche

| Verifica | Parametro | Valore |
| --- | --- | --- |
| rc-uls-uniaxial-bending | resultId | rc-elastic-report-ULS-LIVE |
| rc-uls-uniaxial-bending | resultType | combination |
| rc-uls-uniaxial-bending | station | 2.5 |
| rc-uls-uniaxial-bending | limitState | ULS |
| rc-uls-uniaxial-bending | compressedEdge | top |
| rc-shear-resistance | resultId | rc-elastic-report-ULS-LIVE |
| rc-shear-resistance | resultType | combination |
| rc-shear-resistance | station | 0 |
| rc-shear-resistance | limitState | ULS |
| rc-shear-resistance | method | ntc2018-4.1.2.3.5.2 |
| rc-shear-resistance | selectedMechanism | with-transverse-reinforcement |
| rc-shear-resistance | vRdWithTransverseReinforcement | 265529.9244 |
| rc-shear-resistance | vRdWithoutTransverseReinforcement | 61182.3002 |
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
| rc-sle-concrete-stress | resultId | rc-elastic-report-SLE_RARE-LIVE |
| rc-sle-concrete-stress | resultType | combination |
| rc-sle-concrete-stress | station | 2.5 |
| rc-sle-concrete-stress | limitState | SLE |
| rc-sle-concrete-stress | method | ntc2018-4.1.2.2.5.1-characteristic |
| rc-sle-concrete-stress | combinationType | SLE_RARE |
| rc-sle-concrete-stress | limitFactor | 0.6 |
| rc-sle-concrete-stress | fck | 25 |
| rc-sle-concrete-stress | sigmaCMax | 3.4244 |
| rc-sle-concrete-stress | modularRatio | 15 |
| rc-sle-steel-stress | resultId | rc-elastic-report-SLE_RARE-LIVE |
| rc-sle-steel-stress | resultType | combination |
| rc-sle-steel-stress | station | 2.5 |
| rc-sle-steel-stress | limitState | SLE |
| rc-sle-steel-stress | method | ntc2018-4.1.2.2.5.2-characteristic |
| rc-sle-steel-stress | combinationType | SLE_RARE |
| rc-sle-steel-stress | limitFactor | 0.8 |
| rc-sle-steel-stress | fyk | 450 |
| rc-sle-steel-stress | sigmaSMax | 159.8141 |
| rc-sle-steel-stress | modularRatio | 15 |
| rc-sle-crack-bar-diameter | resultId | rc-elastic-report-SLE_QUASI_PERMANENT-all |
| rc-sle-crack-bar-diameter | resultType | combination |
| rc-sle-crack-bar-diameter | station | 0.5 |
| rc-sle-crack-bar-diameter | limitState | SLE |
| rc-sle-crack-bar-diameter | method | circolare-ntc2018-c4.1.ii |
| rc-sle-crack-bar-diameter | combinationType | SLE_QUASI_PERMANENT |
| rc-sle-crack-bar-diameter | environment | ordinary |
| rc-sle-crack-bar-diameter | crackWidthClass | w2 |
| rc-sle-crack-bar-diameter | groupId | bottom-main |
| rc-sle-crack-bar-diameter | face | bottom |
| rc-sle-crack-bar-diameter | barId | bottom-main-1 |
| rc-sle-crack-bar-diameter | sigmaS | 42.0434 |
| rc-sle-crack-bar-diameter | diameter | 20 |
| rc-sle-crack-bar-diameter | diameterLimit | 32 |
| rc-sle-crack-bar-spacing | resultId | rc-elastic-report-SLE_FREQUENT-LIVE |
| rc-sle-crack-bar-spacing | resultType | combination |
| rc-sle-crack-bar-spacing | station | 0.5 |
| rc-sle-crack-bar-spacing | limitState | SLE |
| rc-sle-crack-bar-spacing | method | circolare-ntc2018-c4.1.iii |
| rc-sle-crack-bar-spacing | combinationType | SLE_FREQUENT |
| rc-sle-crack-bar-spacing | environment | ordinary |
| rc-sle-crack-bar-spacing | crackWidthClass | w3 |
| rc-sle-crack-bar-spacing | groupId | bottom-main |
| rc-sle-crack-bar-spacing | face | bottom |
| rc-sle-crack-bar-spacing | barId | bottom-main-1 |
| rc-sle-crack-bar-spacing | sigmaS | 46.469 |
| rc-sle-crack-bar-spacing | spacing | 200 |
| rc-sle-crack-bar-spacing | spacingLimit | 300 |
| rc-sle-crack-bar-spacing | rowTolerance | 50 |
| rc-sle-deflection-curvature | resultId | rc-elastic-report-SLE_RARE-LIVE |
| rc-sle-deflection-curvature | resultType | combination |
| rc-sle-deflection-curvature | limitState | SLE |
| rc-sle-deflection-curvature | combinationType | SLE_RARE |
| rc-sle-deflection-curvature | station | 2.5 |
| rc-sle-deflection-curvature | creepCoefficient | 0 |
| rc-sle-deflection-curvature | modularRatio | 6.6718 |
| rc-sle-deflection-curvature | limitRatio | 250 |
| rc-sle-deflection-curvature | maxAbsDeflection | 2.0092 |
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

* Stato: ok
* Utilizzo governante: 0.667
* Verifica governante: rc-sle-crack-bar-spacing

## Warning

* Minimum shear reinforcement detailing, spacing limits, anchorage and torsion are not included in this MVP check.
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
* Each FEM station is checked as an independent uniaxial RC section at the corresponding N-M pair.
