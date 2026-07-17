# Reinforced Concrete Validation Sources

This file tracks reinforced-concrete validation candidates before they become
hard regression checks. Project reports are useful, but they are not treated as
authoritative references until each calculation is independently reviewed.

## Automated Cases

| Case | Source kind | Source | Scope | Confidence |
| --- | --- | --- | --- | --- |
| `rc-project-grado-slab-load-combinations` | project-regression | `CdCGrado-V1-S-03-Relazione_calcolo_solai_5m_rev06.pdf` | Slab SLU/SLE surface loads and bearing pressure arithmetic | Medium: clean arithmetic, source may still contain engineering assumptions to review |
| `rc-project-trieste-slab-load-combinations` | project-regression | `CdC_Trieste-Relazione_di_calcolo-SolaiPT-rev04.pdf` | Slab SLU/SLE surface loads and slab-beam interface shear | Medium: clean arithmetic, anchorage resistance is taken from the report |
| `rc-project-rgl-ramp-foundation-pressure` | project-regression | `RGL-004-VAR01-02-Relazione_sulle strutture-rev01.pdf` | Ramp slab shear summary and footing pressure arithmetic | Medium: clean arithmetic, geotechnical assumptions not independently reviewed |
| `rc-jrc-ec2-column-b2-interaction-parameters` | external-reference | JRC EUR 26566 EN, "Eurocode 2: Background and applications. Design of concrete buildings. Worked examples", doi:10.2788/35386 | Column B2 normalized interaction parameters and 8 phi 20 reinforcement check | High for published arithmetic; medium for comparison with local fiber solver because detailing assumptions are simplified |
| `rc-circular-shear-cosenza-2016` | external-reference | E. Cosenza, G. Maddaloni, G. Cuomo, "A simplified method for shear capacity assessment of circular RC cross-sections" (2016), Equations (3) and (5) | Circular RC shear resistance with and without transverse reinforcement | High for formula transcription; empirical research formulation without code partial factors |
| `rc-torsion-ntc2018-independent-arithmetic` | primary-method-reference | D.M. 17 gennaio 2018, NTC 2018 § 4.1.2.3.6, equations 4.1.35-4.1.40 | Rectangular-section torsion truss, reinforcement resistances and shear-torsion interaction | High for formula transcription and independent arithmetic; detailing remains outside the case |
| `rc-column-ntc2018-slenderness-screening` | primary-method-reference | D.M. 17 gennaio 2018, NTC 2018 § 4.1.2.3.9.2, equations 4.1.41-4.1.42 | Axial-load ratio, radii of gyration and slenderness screening about both section components | High for screening arithmetic; complemented by the complete local application case below |
| `rc-footing-rigid-contact-independent-arithmetic` | primary-method-reference | JRC EUR 26566 EN §§ 4.2.1 and 5.4; rigid-base equilibrium | Full contact, uniaxial and biaxial contact loss, equilibrium residual and cantilever-strip integration | High for statics arithmetic; geotechnical bearing capacity is intentionally assigned rather than calculated |
| `rc-en1992-detailing-independent-arithmetic` | primary-method-reference | EN 1992-1-1:2004 expressions 6.63, 7.21 and 8.2-8.6 | Bond, anchorage, local bearing and shrinkage-curvature helper arithmetic | High for direct formula transcription with explicit units and inputs |
| `foundation-beam-winkler-uniform-solution` | independent-analytical-benchmark | PyCBA theoretical basis, continuous Winkler law; constant-field closed solution | Uniform pressure, unilateral-contact convergence, vertical equilibrium, constant displacement and vanishing curvature after mesh convergence | High for equilibrium and signs; pressure and bending tolerances explicitly include tributary-lumping discretization error |
| `rc-beam-column-joint-ntc-independent-arithmetic` | primary-method-reference | D.M. 17 January 2018, NTC 2018 §§ 7.4.4.3.1 and 7.4.6.2.3, equations 7.4.7-7.4.10 | Internal-joint demand, diagonal compression, diagonal tension reinforcement and full-confinement classification | High for formula transcription; complemented by the complete local application case below |
| `rc-strut-and-tie-ecp-corbel-equilibrium` | external-reference | European Concrete Platform, EC2 Worked Examples rev. A 31-03-2017, Example 6.9 | Determinate corbel equilibrium, main tie area and CCT load-face stress | High for equilibrium and published arithmetic; topology generation, anchorage and splitting reinforcement are outside the case |
| `rc-beam-local-detailing-ductility-anchorage` | primary-method-reference | D.M. 17 gennaio 2018, NTC 2018 §§ 4.1.6.1.1, 7.4.6.1.1 and 7.4.6.2.1; EN 1992-1-1:2004 § 8.4 | Complete local beam detailing contract: steel areas, critical zone, dissipative hoop spacing and anchorage | High for direct independent arithmetic with explicit N-mm units |
| `rc-column-local-second-order-shear-confinement` | primary-method-reference | D.M. 17 gennaio 2018, NTC 2018 §§ 4.1.2.3.5.2, 4.1.2.3.9.2, 4.1.6.1.2 and 7.4.6.2.2, equations 7.4.29-7.4.31 | Complete local column workflow: nominal-stiffness moments, two-axis shear, critical zone and mechanical confinement | High for independently recomputed Euler loads, magnification and confinement arithmetic |
| `rc-footing-local-biaxial-contact-bearing-anchorage` | primary-method-reference | EN 1992-1-1:2004 §§ 6.7 and 8.4; JRC EUR 26566 EN, "Eurocode 2: Background and applications. Design of concrete buildings. Worked examples", 2013, § 5.4 | Complete local isolated-footing workflow: biaxial compression-only contact, local bearing and three anchorage contracts | High for resultant equilibrium and direct contract checks; geotechnical resistance remains an assigned input |
| `rc-foundation-beam-local-unilateral-cracked-iteration` | independent-analytical-benchmark | M. Hetenyi, "Beams on Elastic Foundation", 1946; EN 1992-1-1:2004 §§ 5.4 and 7.4 | Complete local foundation-beam workflow: compression-only Winkler contact, iterative cracked stiffness and RC checks | High for exact global equilibrium under the uniform-load constant-field solution; nonlinear iteration is checked for convergence |
| `rc-joint-local-corner-eccentric-3d-anchorage` | primary-method-reference | D.M. 17 gennaio 2018, NTC 2018 §§ 7.4.6.1.3 and 7.4.6.2.1-7.4.6.2.3; EN 1992-1-1:2004 § 8.4 | Complete local joint workflow: concurrent orthogonal directions, corner mapping, eccentric transfer, anchorage and 3D aggregation | High for eccentric-transfer equilibrium and deterministic directional aggregation |

## Online Candidates To Promote Later

| Candidate | Source kind | Why useful | Promotion notes |
| --- | --- | --- | --- |
| JRC EC2 worked examples, T-beam bending and shear chapters | external-reference | Public European Commission/JRC worked example with EC2 assumptions close to NTC workflows | Extract a clean beam section with `MEd`, `VEd`, reinforcement layout and concrete class before making it blocking |
| JRC EC2 worked examples, slab crack-width chapter | external-reference | Useful for SLE crack-width and stress-limit checks | Promote once the local crack-control API exposes comparable `wk` values, not only limit classes |
| StructurePoint tied RC column interaction example, ACI 318 | external-reference-candidate | Detailed hand/reference/software comparison for interaction diagrams | Keep as candidate only unless an ACI material/stress-block mode is added or an assumptions adapter is documented |

## Promotion Rules

- `external-reference`: can become a blocking validation when input, units,
  assumptions and expected output are unambiguous.
- `project-regression`: can become blocking only for arithmetic or for a
  reviewed calculation slice; never assume the whole report is correct.
- `external-reference-candidate`: keep documented until the codebase supports
  the same design-code assumptions.
