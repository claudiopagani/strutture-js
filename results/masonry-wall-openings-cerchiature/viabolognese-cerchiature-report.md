# Via Bolognese

Esempio ricostruito da viaBolognese_cerch_rev04.txt. Le coordinate delle aperture sono convertite da centro apertura a spigolo inferiore sinistro per il modello JS.

Input: `viabolognese.json`

## Verifica carichi verticali

### Stato di fatto

Esito: not-verified. Combinazione: ULS_FUNDAMENTAL. Equilibrio: ok (scarto 0 N).

| Maschio | x [m] | L [m] | N [N] | Peso [N] | Reazione [N] | Esito | Util. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| viabolognese-sdf-pier-1 | 0 | 3.1 | 131479.774 | 20088 | 151567.774 | not-verified | 1.25 |
| viabolognese-sdf-pier-2 | 3.9 | 0.24 | 24677.426 | 1555.2 | 26232.626 | not-verified | 1.25 |
| viabolognese-sdf-pier-3 | 4.14 | 4.04 | 154602 | 26179.2 | 180781.2 | not-verified | 1.25 |

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
| viabolognese-progetto-pier-1 | 0 | 0.7 | 26140.435 | 2980.8 | 29121.235 | not-verified | 1.25 |
| viabolognese-progetto-pier-2 | 3.44 | 0.7 | 26140.435 | 2980.8 | 29121.235 | not-verified | 1.25 |
| viabolognese-progetto-pier-3 | 4.14 | 4.04 | 154602 | 26179.2 | 180781.2 | not-verified | 1.25 |

| Apertura | Carico sup. [N] | Carico fascia [N] | Reaz. sx [N] | Reaz. dx [N] |
| --- | --- | --- | --- | --- |
| apertura-2 | 102321.13 | 2367.36 | 52344.245 | 52344.245 |

| Apertura | Esito | Tipo | L [m] | Mmax [Nm] | Vmax [N] | Util. |
| --- | --- | --- | --- | --- | --- | --- |
| apertura-2 | ok | steel | 3.34 | 51559.082 | 52344.245 | 0.458 |

## Comportamento laterale pre/post - maschi aggregati

| Stato | Esito | ks [N/m] | Vy [N] | Vmax [N] | du [m] | Contrib. | Cerch. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Stato di fatto | ok | 33565290.966 | 101413.557 | 101675.815 | 0.03 | 3 | 0 |
| Progetto | ok | 15798194.37 | 473961.629 | 407768.319 | 0.03 | 4 | 1 |

| Indicatore | Delta | Delta % | Lettura |
| --- | --- | --- | --- |
| Rigidezza ks | -17767096.596 | -52.93% | attenzione |
| Taglio equivalente Vy | 372548.073 | +367.36% | ok |
| Spostamento ultimo du | 0 | +0% | ok |
| Taglio massimo | 306092.504 | - | - |

## Confronto con report DOCX

Fonte DOCX: viabolognese_cerch_rev04.docx.

| Stato | Indicatore | DOCX | Nostro aggregato | Delta | Delta % |
| --- | --- | --- | --- | --- | --- |
| Stato di fatto | Rigidezza ke | 38.26 kN/mm | 33.57 kN/mm | -4.69 kN/mm | -12.27% |
| Stato di fatto | Resistenza Vy | 113.16 kN | 101.41 kN | -11.75 kN | -10.38% |
| Stato di fatto | Spostamento du | 30 mm | 30 mm | 0 mm | +0% |
| Progetto | Rigidezza ke | 33.84 kN/mm | 15.8 kN/mm | -18.04 kN/mm | -53.32% |
| Progetto | Resistenza Vy | 362.11 kN | 473.96 kN | 111.85 kN | +30.89% |
| Progetto | Spostamento du | 37.5 mm | 30 mm | -7.5 mm | -20% |

### Cerchiature riportate nel DOCX

| Stato | Profilo | Telai | ke DOCX | Vy DOCX |
| --- | --- | --- | --- | --- |
| Progetto | HEB200 | 2 | 12.65 kN/mm | 304.74 kN |


## Differenza maschi aggregati vs FEM con fasce

### Stato di fatto

Telaio: pier-spandrel. Strategia: direct-global-frame-pushover.

| Indicatore | Aggregato | FEM fasce | Delta | Delta % |
| --- | --- | --- | --- | --- |
| Rigidezza iniziale ks | 33565290.966 | 35459958.758 | 1894667.793 | +5.64% |
| Taglio equivalente Vy | 101413.557 | 101986.832 | 573.275 | +0.57% |
| Taglio massimo Vmax | 101675.815 | 102211.067 | 535.252 | +0.53% |
| Spostamento ultimo du | 0.03 | 0.03 | 0 | -0.88% |

### Progetto

Telaio: pier-spandrel-ring-frame. Strategia: direct-global-frame-pushover.

| Indicatore | Aggregato | FEM fasce | Delta | Delta % |
| --- | --- | --- | --- | --- |
| Rigidezza iniziale ks | 15798194.37 | 15846446.858 | 48252.488 | +0.31% |
| Taglio equivalente Vy | 473961.629 | 475409.252 | 1447.623 | +0.31% |
| Taglio massimo Vmax | 407768.319 | 408577.834 | 809.515 | +0.2% |
| Spostamento ultimo du | 0.03 | 0.03 | 0 | +0% |

## Note

- Input MATLAB originale: viaBolognese_cerch_rev04.txt.
- Risultati di riferimento estratti da viabolognese_cerch_rev04.docx.
- I carichi del file MATLAB sono totali per muro; qui sono convertiti in carichi lineari dividendo per la lunghezza del muro.

## Warning

- Pier viabolognese-sdf-pier-2 reached a yield displacement beyond its drift capacity; the elastic branch was capped at 95% of du to keep a consistent first-release contribution curve.
- Opening apertura-2 scales the steel ring-frame contribution by 2 because multiple identical parallel frames were declared through the ringFrame count.
- The capacity curve never dropped by the requested 20% from peak resistance, so the last available point was used as ultimate displacement.
- Equivalent-energy bilinearization reached a negative quadratic radicand; the solution was clamped to preserve a valid bilinear curve.

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
