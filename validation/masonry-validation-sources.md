# Masonry and Ring-Frame Validation Sources

This file tracks masonry, opening and ring-frame validation references before
they become broader NTC/Eurocode coverage. Workspace reports are useful
regressions, especially because some are derived from MATLAB-shaped inputs, but
they are not treated as external authorities.

## Automated Cases

| Case | Source kind | Source | Scope | Confidence |
| --- | --- | --- | --- | --- |
| `masonry-capacity-curve-bilinearization` | internal-reference | Deterministic 70% secant and 20% post-peak drop bilinearization rule | Capacity-curve bilinearization outputs `ks`, `Vy`, `du` and yield displacement | High for local deterministic rule; not an external code benchmark |
| `masonry-project-single-door-ring-frame-report` | project-regression | `results/masonry-wall-openings-cerchiature/cerchiatura-porta-singola-cerchiature-report.md` | Single-door opening, lintel action, ring-frame reactions, pre/post lateral indicators and aggregated/FEM comparison | Medium: report states it is derived from the MATLAB input logic, but the original MATLAB output is not present in the workspace |
| `masonry-project-two-openings-ring-frame-report` | project-regression | `results/masonry-wall-openings-cerchiature/cerchiatura-due-aperture-cerchiature-report.md` | Multiple openings, two-frame cerchiatura input pattern, vertical transfer and lateral pre/post indicators | Medium: good local regression for geometry and transfer logic; source is not independent |

## Online Candidates To Promote Later

| Candidate | Source kind | Why useful | Promotion notes |
| --- | --- | --- | --- |
| JRC Eurocodes collection, "How to design masonry structures to Eurocode 6", https://eurocodes.jrc.ec.europa.eu/index.php/publications/how-design-masonry-structures-eurocode-6 | external-reference-candidate | Curated Eurocode 6 design guidance for vertical and lateral stability | Promote only examples whose EC6 assumptions can be mapped cleanly to the local NTC/existing-masonry model |
| The Concrete Centre, "How to design masonry structures using Eurocode 6", https://eurocodes.jrc.ec.europa.eu/publications/how-design-masonry-structures-using-eurocode-6 | external-reference-candidate | Introductory EC6 guide with actions, material specification and design context | Use as source inventory until numerical examples are extracted with unambiguous inputs |
| JRC, "Eurocodes: Background and applications. Structural fire design. Worked examples", doi:10.2788/85432, https://publications.jrc.ec.europa.eu/repository/handle/JRC90239 | external-reference-candidate | Includes masonry fire-design worked examples in the JRC Eurocode report series | Promote only if/when local masonry fire checks are implemented |

## Promotion Rules

- `internal-reference`: can be blocking for deterministic algorithms and closed
  form helper rules, but it does not validate code assumptions against an
  independent source.
- `project-regression`: can become blocking for arithmetic and report-stability
  slices; do not infer that the engineering judgement in the whole report is
  authoritative.
- `external-reference-candidate`: keep documented until the local codebase
  supports the same assumptions and output quantities.
- Original MATLAB reports, if recovered, should be stored or summarized here as
  higher-confidence references for cerchiature regressions.
