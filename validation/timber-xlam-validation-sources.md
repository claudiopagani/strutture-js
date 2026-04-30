# Timber and XLAM Validation Sources

This file tracks timber, XLAM and timber-composite validation candidates before
they become broader design-code coverage. Project workbooks and reports are
useful regressions, but they are not treated as authoritative references until
each calculation slice is independently reviewed.

## Automated Cases

| Case | Source kind | Source | Scope | Confidence |
| --- | --- | --- | --- | --- |
| `timber-ec5-structville-sawn-beam-example` | external-worked-example | Structville, "Design of Timber Beams", 2020, https://structville.com/2020/04/structural-design-of-timber-beams.html | EC5 sawn timber beam bending, shear and deflection arithmetic | Medium: transparent worked example; bearing check intentionally excluded because one published rounded value is inconsistent with the stated force and bearing area |
| `xlam-project-aule-grande-luce-panel` | project-regression | `solaio_aule_grande_luce.pdf` | XLAM slab bending, final deflection and vibration comfort margins | Medium: clean rounded report values; source may still contain assumptions to review |
| `timber-project-c25021-roof-beam-workbook` | project-regression | `C25-021_travi_legno.xlsx` | Solid timber beam stress, lateral torsional and deflection ratios | Medium: spreadsheet outputs are readable; formulas should be audited before treating as normative truth |
| `timber-xlam-composite-project-workbook` | project-regression | `Travi_legno_XLAM_collab.xlsx` | Timber-XLAM gamma method, connector force, stresses and short-term deflection | Medium-high for regression because the local model reconstructs the workbook inputs; engineering assumptions still need review |
| `timber-concrete-composite-project-workbook` | project-regression | `legno_cls_collaborante_travi_solaiosoggiornoP1.xlsx` | Timber-concrete gamma method, stresses, connector utilization and SLE deflection | Medium-high for regression because the local model reconstructs the workbook inputs; engineering assumptions still need review |

## Online Candidates To Promote Later

| Candidate | Source kind | Why useful | Promotion notes |
| --- | --- | --- | --- |
| proHolz Austria, "Cross-Laminated Timber Structural Design: Basic design and engineering principles according to Eurocode", https://www.proholz.at/publikationen/cross-laminated-timber-structural-design | external-reference-candidate | CLT/XLAM manual with Eurocode-oriented modelling assumptions, material values and application examples | Promote selected examples only after extracting unambiguous geometry, layer build-up, load case and reported verification values |
| Huber and Deix, "Comparison of Calculation Methods of Elastic Bonding: Limits of the Gamma Method Using an Example of a Wood-Concrete Composite Floor with Single Loads", Materials 2021, https://www.mdpi.com/1996-1944/14/23/7211 | external-reference-candidate | Open-access comparison of gamma, differential-equation and discrete methods for timber-concrete composites | Use as reference for limitations and future differential/discrete comparison; promote numerical tables only after matching load position, connector spacing and modelling assumptions |
| proHolz Austria, "Cross-Laminated Timber Structural Design Volume II: Applications", https://www.proholz.at/fileadmin/proholz/media/shop_Publikationen/Information_pdf/Cross_laminated_timber_II.pdf | external-reference-candidate | Application-oriented CLT floor/wall examples, concentrated loads, openings and effective widths | Useful once the local XLAM API exposes comparable panel-design outputs beyond one-way slab report regressions |

## Promotion Rules

- `external-worked-example`: can become a blocking validation when the example
  has transparent arithmetic and no hidden software assumptions.
- `external-reference`: can become blocking when the source, inputs, design-code
  assumptions and compared outputs are unambiguous.
- `project-regression`: can become blocking only for arithmetic or for a
  reviewed calculation slice; never assume the whole report/workbook is correct.
- `external-reference-candidate`: keep documented until the codebase supports
  the same modelling assumptions and output quantities.
