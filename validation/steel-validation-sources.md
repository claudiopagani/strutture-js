# Steel Validation Sources

This file tracks steel validation references before they become broader member,
connection or frame coverage. Sources are selected to stay close to Eurocode 3
and NTC-style workflows.

## Automated Cases

| Case | Source kind | Source | Scope | Confidence |
| --- | --- | --- | --- | --- |
| `steel-sci-p364-example2-restrained-beam` | external-reference | SCI P364, "Steel Building Design: Worked Examples - Open Sections", Example 2, https://www.steelconstruction.info/images/5/50/Sci_p364.pdf | Laterally restrained beam actions, section classification, shear resistance, bending resistance and SLS deflection | High for EC3 arithmetic; section is rebuilt as a geometric surrogate because the local catalog does not include UKB profiles |
| `steel-sci-p364-example3-ltb` | external-reference | SCI P364, Example 3, https://www.steelconstruction.info/images/5/50/Sci_p364.pdf | Lateral-torsional buckling with published LTBeam `Mcr`, EC3 reduction factor and buckling moment resistance | High for LTB arithmetic; `Mcr` is taken directly from the published example |
| `steel-sci-p364-example9-pinned-column-buckling` | external-reference | SCI P364, Example 9, https://www.steelconstruction.info/images/5/50/Sci_p364.pdf | Class 3 compression section classification and flexural buckling resistance of a pin-ended column | High for EC3 buckling arithmetic; torsional buckling remains documented as a future case |

## Online Candidates To Promote Later

| Candidate | Source kind | Why useful | Promotion notes |
| --- | --- | --- | --- |
| JRC, "Eurocodes: Background & Applications. Design of Steel Buildings. Worked examples", doi:10.2788/605700, https://eurocodes.jrc.ec.europa.eu/index.php/publications/eurocodes-background-applications-design-steel-buildings-worked-examples | external-reference-candidate | Institutional JRC/ECCS Eurocode 3 training material with worked examples and code context | Promote examples with compact numerical outputs that match current local APIs for member and connection checks |
| SCI P363 Blue Book, https://www.steelconstruction.info/The_Blue_Book | external-reference-candidate | Member resistance tables for sections and grades under Eurocode 3 | Promote once table values are extracted for profiles present in the local catalog or when UKB/UKC catalog support is added |
| SCI P360 Stability of Steel Beams and Columns, https://www.steelconstruction.info/images/archive/0/0e/20230424132810%21Sci_p360.pdf | external-reference-candidate | Focused stability guide with simple worked examples for beams and columns | Use for future effective-length, restraint and stability assumptions, especially where P364 is too table-driven |
| SteelConstruction.info Eurocode Design Guides, https://steelconstruction.info/Eurocode_Design_Guides | source-index | Curated index for SCI Eurocode guides, including P360, P363 and P364 | Keep as source map rather than a direct numerical reference |

## Promotion Rules

- `external-reference`: can become a blocking validation when inputs, units,
  design-code assumptions and compared outputs are unambiguous.
- `external-reference-candidate`: keep documented until the codebase supports
  the same profile catalogs, National Annex assumptions or output quantities.
- Table lookups should include the table source and a tolerance that reflects
  published rounding; formula checks should preserve the arithmetic inputs.
