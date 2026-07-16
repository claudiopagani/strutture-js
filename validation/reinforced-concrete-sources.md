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
| `rc-column-ntc2018-slenderness-screening` | primary-method-reference | D.M. 17 gennaio 2018, NTC 2018 § 4.1.2.3.9.2, equations 4.1.41-4.1.42 | Axial-load ratio, radii of gyration and slenderness screening about both section components | High for screening arithmetic; second-order analysis is intentionally not represented |
| `rc-footing-rigid-contact-independent-arithmetic` | primary-method-reference | JRC EUR 26566 EN §§ 4.2.1 and 5.4; rigid-base equilibrium | Full-contact corner pressures, uniaxial contact loss and cantilever-strip integration | High for statics arithmetic; geotechnical bearing capacity is intentionally assigned rather than calculated |
| `foundation-beam-winkler-uniform-solution` | independent-analytical-benchmark | PyCBA theoretical basis, continuous Winkler law; constant-field closed solution | Uniform pressure, vertical equilibrium, constant displacement and vanishing curvature after mesh convergence | High for equilibrium and signs; pressure and bending tolerances explicitly include tributary-lumping discretization error |
| `rc-beam-column-joint-ntc-independent-arithmetic` | primary-method-reference | D.M. 17 January 2018, NTC 2018 §§ 7.4.4.3.1 and 7.4.6.2.3, equations 7.4.7-7.4.10 | Internal-joint demand, diagonal compression, diagonal tension reinforcement and full-confinement classification | High for formula transcription and independent arithmetic; anchorage and 3D directional interaction are outside the case |

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
