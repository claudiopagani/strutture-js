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
