# Confronto curva di capacita alignment-p-035-pier-1

Report sintetico di confronto tra curva di capacita aggregata del maschio e pushover FEM non lineare del corrispondente macroelemento.

## Modello

* Allineamento: Maschio p=0.35
* ID allineamento: alignment-p-035
* Unita: N, m
* Maschio: alignment-p-035-pier-1
* Muro: wall-a
* Vincolo in sommita: free
* Meccanismo aggregato governante: diagonal-cracking

## Sintesi Curve

| Modello | ks | Vy | du | Vmax | Note | Terminazione |
| --- | --- | --- | --- | --- | --- | --- |
| Metodo aggregato | 7552447.5524 | 60668.2784 | 0.018 | 60668.2784 | diagonal-cracking | - |
| FEM non lineare | 7552447.5525 | 60664.1437 | 0.018 | 60668.2784 | 0 cerniere | target-displacement-reached |

## Confronto Indicatori

| Indicatore | Aggregato | FEM | Delta | Delta % |
| --- | --- | --- | --- | --- |
| Rigidezza iniziale ks | 7552447.5524 | 7552447.5525 | 0.0001 | +0% |
| Taglio equivalente Vy | 60668.2784 | 60664.1437 | -4.1347 | -0.01% |
| Taglio massimo Vmax | 60668.2784 | 60668.2784 | 0 | +0% |
| Spostamento ultimo du | 0.018 | 0.018 | 0 | +0% |

## Punti Campionati

| Spostamento | V aggregato | V FEM | Delta | Delta % |
| --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 0 | - |
| 0.0026 | 19420.4089 | 19420.5794 | 0.1706 | +0% |
| 0.0051 | 38840.8177 | 38841.1588 | 0.3411 | +0% |
| 0.0077 | 58261.2266 | 58261.7383 | 0.5117 | +0% |
| 0.008 | 60668.2784 | 60313.1028 | -355.1756 | -0.59% |
| 0.0103 | 60668.2784 | 60668.2784 | 0 | +0% |
| 0.0129 | 60668.2784 | 60668.2784 | 0 | +0% |
| 0.0154 | 60668.2784 | 60668.2784 | 0 | +0% |
| 0.018 | 60668.2784 | 60668.2784 | 0 | +0% |

## Lettura

* Outcome: consistent
* Esito sintetico: Il pushover FEM del maschio riproduce la curva aggregata con scarti contenuti su rigidezza, resistenza e deformabilita.
* Indicatore governante: aligned-response

* Scarto rigidezza ks: 0%.
* Scarto resistenza Vy: -0.006815%.
* Scarto deformabilita du: 0.001111%.

## Warning

* Material wall-a resolved design properties through the fallback source directProperties.

## Assunzioni

* The first seismic release follows the official minimum method described in todo.md: the global capacity curve is the sum of the individual pier and ring-frame contributions at a common top-displacement axis.
* Pier axial forces are taken from the static vertical analysis in seismic combination: base reaction for flexural capacity and drift, mid-height compression for shear capacity.
* Each masonry pier is represented by an elastic-perfectly-plastic contribution up to its drift-based ultimate displacement, followed by a drop to zero resistance.
* The first mechanical-state resolver distinguishes state-of-fact and design by selecting stage-specific masonry property sets when available, while preserving the original wall geometry and load definition.
* If no dedicated stage-specific property set exists, the resolver falls back to the best available base or direct masonry properties and traces that fallback in warnings.
* Pier tributary top loads follow the requested width rule: gross pier width plus half of each adjacent opening only when that opening is not intercepted by a ring frame.
* The masonry band above each opening is transferred to adjacent masonry piers when no ring frame is present, and to ring-frame jambs when the opening is framed in steel.
* Lintel beam analysis is optional and does not alter the global equilibrium roll-up; only the transferred masonry-band load is added to pier axial forces in the current release.
* In this first release, piers are extracted as wall-bounded full-height vertical strips whose x-interval is not occupied by sanitized opening projections.
* Spandrels are extracted as the masonry band directly above each sanitized opening, capped by the next overlapping opening above or by the local wall top.
* The non-linear displacement-control solver uses the augmented equilibrium system [Kt -Fext; c^T 0], so it can continue through singular tangents when the control equation regularizes the mechanism.
* The displacement-control step length is currently constant; no adaptive step-size strategy or line search is applied yet.
* Flexural-governed piers are compared through an equivalent-frame pushover with concentrated end plastic hinges; shear-governed piers are compared through a single-DOF non-linear lateral mechanism calibrated on the same ks, Vy and du.
* The single-pier pushover uses the same MRd and du reference already adopted by the aggregated method, so the comparison isolates the consistency of the FEM force-displacement evolution.
