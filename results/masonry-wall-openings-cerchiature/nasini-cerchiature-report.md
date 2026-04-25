# Nasini

Esempio ricostruito da nasini_cerch_rev01.txt con coordinate aperture convertite da centro a spigolo inferiore sinistro.

Input: `nasini.json`

## Verifica carichi verticali

### Stato di fatto

Esito: ok. Combinazione: ULS_FUNDAMENTAL. Equilibrio: ok (scarto 0 N).

| Maschio | x [m] | L [m] | N [N] | Peso [N] | Reazione [N] | Esito | Util. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| nasini-sdf-pier-1 | 0 | 1.33 | 171636.364 | 37905 | 209541.364 | ok | 0.737 |
| nasini-sdf-pier-2 | 2.13 | 8.87 | 906443.636 | 252795 | 1159238.636 | ok | 0.611 |

| Apertura | Carico sup. [N] | Carico fascia [N] | Reaz. sx [N] | Reaz. dx [N] |
| --- | --- | --- | --- | --- |
| - | - | - | - | - |

| Apertura | Esito | Tipo | L [m] | Mmax [Nm] | Vmax [N] | Util. |
| --- | --- | --- | --- | --- | --- | --- |
| - | - | - | - | - | - | - |

### Progetto

Esito: not-verified. Combinazione: ULS_FUNDAMENTAL. Equilibrio: ok (scarto 0 N).

| Maschio | x [m] | L [m] | N [N] | Peso [N] | Reazione [N] | Esito | Util. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| nasini-progetto-pier-1 | 0 | 1.15 | 112072.727 | 29355 | 141427.727 | ok | 0.642 |
| nasini-progetto-pier-2 | 2.31 | 8.69 | 846880 | 244245 | 1091125 | ok | 0.596 |

| Apertura | Carico sup. [N] | Carico fascia [N] | Reaz. sx [N] | Reaz. dx [N] |
| --- | --- | --- | --- | --- |
| apertura-2 | 113047.273 | 8816 | 60931.636 | 60931.636 |

| Apertura | Esito | Tipo | L [m] | Mmax [Nm] | Vmax [N] | Util. |
| --- | --- | --- | --- | --- | --- | --- |
| apertura-2 | not-verified | steel | 1.76 | 35949.665 | 60931.636 | 1.654 |

## Comportamento laterale pre/post - maschi aggregati

| Stato | Esito | ks [N/m] | Vy [N] | Vmax [N] | du [m] | Contrib. | Cerch. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Stato di fatto | ok | 198522347.825 | 393008.366 | 393254.536 | 0.015 | 2 | 0 |
| Progetto | ok | 177950847.375 | 382943.134 | 397005.187 | 0.015 | 3 | 1 |

| Indicatore | Delta | Delta % | Lettura |
| --- | --- | --- | --- |
| Rigidezza ks | -20571500.449 | -10.36% | ok |
| Taglio equivalente Vy | -10065.233 | -2.56% | attenzione |
| Spostamento ultimo du | 0 | +0% | ok |
| Taglio massimo | 3750.652 | - | - |

## Confronto con report DOCX

Fonte DOCX: nasini_cerch_rev01.docx.

| Stato | Indicatore | DOCX | Nostro aggregato | Delta | Delta % |
| --- | --- | --- | --- | --- | --- |
| Stato di fatto | Rigidezza ke | 184.23 kN/mm | 198.52 kN/mm | 14.29 kN/mm | +7.76% |
| Stato di fatto | Resistenza Vy | 367.56 kN | 393.01 kN | 25.45 kN | +6.92% |
| Stato di fatto | Spostamento du | 15 mm | 15 mm | 0 mm | +0% |
| Progetto | Rigidezza ke | 176.34 kN/mm | 177.95 kN/mm | 1.61 kN/mm | +0.91% |
| Progetto | Resistenza Vy | 371.71 kN | 382.94 kN | 11.23 kN | +3.02% |
| Progetto | Spostamento du | 15 mm | 15 mm | 0 mm | +0% |

### Cerchiature riportate nel DOCX

| Stato | Profilo | Telai | ke DOCX | Vy DOCX |
| --- | --- | --- | --- | --- |
| Progetto | HEA100 | 2 | 3.11 kN/mm | 67.91 kN |


## Differenza maschi aggregati vs FEM con fasce

### Stato di fatto

Telaio: pier-spandrel. Strategia: direct-global-frame-pushover.

| Indicatore | Aggregato | FEM fasce | Delta | Delta % |
| --- | --- | --- | --- | --- |
| Rigidezza iniziale ks | 198522347.825 | 198568079.125 | 45731.301 | +0.02% |
| Taglio equivalente Vy | 393008.366 | 392858.686 | -149.681 | -0.04% |
| Taglio massimo Vmax | 393254.536 | 393254.536 | 0 | +0% |
| Spostamento ultimo du | 0.015 | 0.015 | 0 | -0.89% |

### Progetto

Telaio: pier-spandrel-ring-frame. Strategia: direct-global-frame-pushover.

| Indicatore | Aggregato | FEM fasce | Delta | Delta % |
| --- | --- | --- | --- | --- |
| Rigidezza iniziale ks | 177950847.375 | 177942731.307 | -8116.068 | +0% |
| Taglio equivalente Vy | 382943.134 | 382563.92 | -379.214 | -0.1% |
| Taglio massimo Vmax | 397005.187 | 397006.258 | 1.071 | +0% |
| Spostamento ultimo du | 0.015 | 0.015 | 0 | +0.52% |

## Note

- Input MATLAB originale: nasini_cerch_rev01.txt.
- Risultati di riferimento estratti da nasini_cerch_rev01.docx.
- L'allineamento usa la zona deformabile totale; nel nostro modello questo resta rappresentato dalla geometria piena del maschio.

## Warning

- Opening apertura-2 scales the steel ring-frame contribution by 2 because multiple identical parallel frames were declared through the ringFrame count.

## Assunzioni principali

- Pier tributary top loads follow the requested width rule: gross pier width plus half of each adjacent opening only when that opening is not intercepted by a ring frame.
- The masonry band above each opening is transferred to adjacent masonry piers when no ring frame is present, and to ring-frame jambs when the opening is framed in steel.
- Lintel beam analysis is optional and does not alter the global equilibrium roll-up; only the transferred masonry-band load is added to pier axial forces in the current release.
- The first mechanical-state resolver distinguishes state-of-fact and design by selecting stage-specific masonry property sets when available, while preserving the original wall geometry and load definition.
- If no dedicated stage-specific property set exists, the resolver falls back to the best available base or direct masonry properties and traces that fallback in warnings.
- Piers are extracted as wall-bounded vertical strips whose x-interval is not occupied by sanitized opening projections; their deformable height is resolved with the Dolce 30-degree construction when adjacent openings exist.
- Spandrels are extracted as the masonry band directly above each sanitized opening, capped by the next overlapping opening above or by the local wall top.
- The first seismic release follows the official minimum method described in todo.md: the global capacity curve is the sum of the individual pier and ring-frame contributions at a common top-displacement axis.
- ... altre 16 assunzioni nel JSON.
