# Faentina

Esempio ricostruito da faentina_cerch_rev03.txt con coordinate aperture convertite da centro a spigolo inferiore sinistro.

Input: `faentina.json`

## Verifica carichi verticali

### Stato di fatto

Esito: not-verified. Combinazione: ULS_FUNDAMENTAL. Equilibrio: ok (scarto 0 N).

| Maschio | x [m] | L [m] | N [N] | Peso [N] | Reazione [N] | Esito | Util. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faentina-sdf-pier-1 | 0 | 4.39 | 859615.459 | 91031.04 | 950646.499 | ok | 0.697 |
| faentina-sdf-pier-2 | 6.53 | 0.29 | 215157.981 | 6013.44 | 221171.421 | not-verified | 2.456 |
| faentina-sdf-pier-3 | 6.82 | 0.925 | 569331.68 | 19180.8 | 588512.48 | not-verified | 2.049 |
| faentina-sdf-pier-4 | 12.655 | 0.565 | 509031.68 | 11715.84 | 520747.52 | not-verified | 2.969 |

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
| faentina-progetto-pier-1 | 0 | 1.36 | 279496.361 | 28200.96 | 307697.321 | ok | 0.486 |
| faentina-progetto-pier-2 | 2.16 | 2.83 | 632588.123 | 58682.88 | 691271.003 | ok | 0.525 |
| faentina-progetto-pier-3 | 6.53 | 0.29 | 167613.756 | 6013.44 | 173627.196 | not-verified | 1.286 |
| faentina-progetto-pier-4 | 6.82 | 0.925 | 569331.68 | 19180.8 | 588512.48 | not-verified | 2.049 |
| faentina-progetto-pier-5 | 12.655 | 0.565 | 509031.68 | 11715.84 | 520747.52 | not-verified | 2.969 |

| Apertura | Carico sup. [N] | Carico fascia [N] | Reaz. sx [N] | Reaz. dx [N] |
| --- | --- | --- | --- | --- |
| - | - | - | - | - |

| Apertura | Esito | Tipo | L [m] | Mmax [Nm] | Vmax [N] | Util. |
| --- | --- | --- | --- | --- | --- | --- |
| - | - | - | - | - | - | - |

## Comportamento laterale pre/post - maschi aggregati

| Stato | Esito | ks [N/m] | Vy [N] | Vmax [N] | du [m] | Contrib. | Cerch. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Stato di fatto | ok | 66902758.192 | 289666.79 | 308511.285 | 0.032 | 4 | 0 |
| Progetto | ok | 50256740.424 | 213408.845 | 231709.121 | 0.032 | 5 | 0 |

| Indicatore | Delta | Delta % | Lettura |
| --- | --- | --- | --- |
| Rigidezza ks | -16646017.768 | -24.88% | attenzione |
| Taglio equivalente Vy | -76257.945 | -26.33% | attenzione |
| Spostamento ultimo du | 0 | +0% | ok |
| Taglio massimo | -76802.164 | - | - |

## Confronto con report DOCX

Fonte DOCX: faentina_cerch_rev03.docx.

| Stato | Indicatore | DOCX | Nostro aggregato | Delta | Delta % |
| --- | --- | --- | --- | --- | --- |
| Stato di fatto | Rigidezza ke | 100.4 kN/mm | 66.9 kN/mm | -33.5 kN/mm | -33.36% |
| Stato di fatto | Resistenza Vy | 439.33 kN | 289.67 kN | -149.66 kN | -34.07% |
| Stato di fatto | Spostamento du | 15.99 mm | 32 mm | 16.01 mm | +100.13% |
| Progetto | Rigidezza ke | 140.85 kN/mm | 50.26 kN/mm | -90.59 kN/mm | -64.32% |
| Progetto | Resistenza Vy | 453.21 kN | 213.41 kN | -239.8 kN | -52.91% |
| Progetto | Spostamento du | 32 mm | 32 mm | 0 mm | +0% |


## Differenza maschi aggregati vs FEM con fasce

### Stato di fatto

Telaio: pier-spandrel. Strategia: direct-global-frame-pushover.

| Indicatore | Aggregato | FEM fasce | Delta | Delta % |
| --- | --- | --- | --- | --- |
| Rigidezza iniziale ks | 66902758.192 | 66930160.787 | 27402.595 | +0.04% |
| Taglio equivalente Vy | 289666.79 | 288815.89 | -850.901 | -0.29% |
| Taglio massimo Vmax | 308511.285 | 306470.055 | -2041.229 | -0.66% |
| Spostamento ultimo du | 0.032 | 0.032 | 0 | -1.04% |

### Progetto

Telaio: pier-spandrel. Strategia: direct-global-frame-pushover.

| Indicatore | Aggregato | FEM fasce | Delta | Delta % |
| --- | --- | --- | --- | --- |
| Rigidezza iniziale ks | 50256740.424 | 76228143.4 | 25971402.976 | +51.68% |
| Taglio equivalente Vy | 213408.845 | 218859.534 | 5450.689 | +2.55% |
| Taglio massimo Vmax | 231709.121 | 237637.826 | 5928.705 | +2.56% |
| Spostamento ultimo du | 0.032 | 0.032 | 0 | +0% |

## Note

- Input MATLAB originale: faentina_cerch_rev03.txt.
- Risultati di riferimento estratti da faentina_cerch_rev03.docx.
- Nel TXT le due strutture metalliche non sono richiamate da aperture con strumet; il modello le lascia quindi escluse, come nel riepilogo laterale del DOCX.

## Warning

- Pier faentina-sdf-pier-2 reached a yield displacement beyond its drift capacity; the elastic branch was capped at 95% of du to keep a consistent first-release contribution curve.
- Pier faentina-sdf-pier-4 reached a yield displacement beyond its drift capacity; the elastic branch was capped at 95% of du to keep a consistent first-release contribution curve.
- Pier faentina-progetto-pier-3 reached a yield displacement beyond its drift capacity; the elastic branch was capped at 95% of du to keep a consistent first-release contribution curve.
- Pier faentina-progetto-pier-5 reached a yield displacement beyond its drift capacity; the elastic branch was capped at 95% of du to keep a consistent first-release contribution curve.
- The capacity curve never dropped by the requested 20% from peak resistance, so the last available point was used as ultimate displacement.

## Assunzioni principali

- Pier tributary top loads follow the requested width rule: gross pier width plus half of each adjacent opening only when that opening is not intercepted by a ring frame.
- The masonry band above each opening is transferred to adjacent masonry piers when no ring frame is present, and to ring-frame jambs when the opening is framed in steel.
- Lintel beam analysis is optional and does not alter the global equilibrium roll-up; only the transferred masonry-band load is added to pier axial forces in the current release.
- The first mechanical-state resolver distinguishes state-of-fact and design by selecting stage-specific masonry property sets when available, while preserving the original wall geometry and load definition.
- If no dedicated stage-specific property set exists, the resolver falls back to the best available base or direct masonry properties and traces that fallback in warnings.
- Piers are extracted as wall-bounded vertical strips whose x-interval is not occupied by sanitized opening projections; their deformable height is resolved with the Dolce 30-degree construction when adjacent openings exist.
- Spandrels are extracted as the masonry band directly above each sanitized opening, capped by the next overlapping opening above or by the local wall top.
- The first seismic release follows the official minimum method described in todo.md: the global capacity curve is the sum of the individual pier and ring-frame contributions at a common top-displacement axis.
- ... altre 12 assunzioni nel JSON.
