# Confronto curva di capacita alignment-single-pier-capacity-pier-1

Report sintetico di confronto tra curva di capacita aggregata del maschio e pushover FEM non lineare del corrispondente macroelemento.

## Modello

* Allineamento: Maschio singolo flessionale
* ID allineamento: alignment-single-pier-capacity
* Unita: N, m
* Maschio: alignment-single-pier-capacity-pier-1
* Muro: wall-a
* Vincolo in sommita: free
* Meccanismo aggregato governante: rocking-toe-crushing

## Sintesi Curve

| Modello | ks | Vy | du | Vmax | Note | Terminazione |
| --- | --- | --- | --- | --- | --- | --- |
| Metodo aggregato | 7552447.5524 | 5017.4996 | 0.03 | 5017.4996 | rocking-toe-crushing | - |
| FEM non lineare | 7552447.552 | 5015.6842 | 0.03 | 5017.4996 | 1 cerniere | target-displacement-reached |

## Confronto Indicatori

| Indicatore | Aggregato | FEM | Delta | Delta % |
| --- | --- | --- | --- | --- |
| Rigidezza iniziale ks | 7552447.5524 | 7552447.552 | -0.0004 | +0% |
| Taglio equivalente Vy | 5017.4996 | 5015.6842 | -1.8154 | -0.04% |
| Taglio massimo Vmax | 5017.4996 | 5017.4996 | 0 | +0% |
| Spostamento ultimo du | 0.03 | 0.03 | 0 | +0% |

## Punti Campionati

| Spostamento | V aggregato | V FEM | Delta | Delta % |
| --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 0 | - |
| 0.0007 | 5017.4996 | 4590.5007 | -426.9989 | -8.51% |
| 0.0043 | 5017.4996 | 5017.4996 | 0 | +0% |
| 0.0086 | 5017.4996 | 5017.4996 | 0 | +0% |
| 0.0129 | 5017.4996 | 5017.4996 | 0 | +0% |
| 0.0171 | 5017.4996 | 5017.4996 | 0 | +0% |
| 0.0214 | 5017.4996 | 5017.4996 | 0 | +0% |
| 0.0257 | 5017.4996 | 5017.4996 | 0 | +0% |
| 0.03 | 5017.4996 | 5017.4996 | 0 | +0% |

## Lettura

* Outcome: consistent
* Esito sintetico: Il pushover FEM del maschio riproduce la curva aggregata con scarti contenuti su rigidezza, resistenza e deformabilita.
* Indicatore governante: aligned-response

* Scarto rigidezza ks: 0%.
* Scarto resistenza Vy: -0.036181%.
* Scarto deformabilita du: 0.000667%.

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
