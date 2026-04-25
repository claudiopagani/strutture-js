# Cerchiatura su allineamento con due aperture

Esempio con due aperture nello stato di fatto e progetto con una finestra invariata e una nuova apertura cerchiata.

Input: `cerchiatura-due-aperture.json`

## Verifica carichi verticali

### Stato di fatto

Esito: ok. Combinazione: ULS_FUNDAMENTAL. Equilibrio: ok (scarto 0 N).

| Maschio | x [m] | L [m] | N [N] | Peso [N] | Reazione [N] | Esito | Util. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cerchiatura-due-aperture-sdf-pier-1 | 0 | 1.2 | 109156 | 26265.6 | 135421.6 | ok | 0.221 |
| cerchiatura-due-aperture-sdf-pier-2 | 2.2 | 2.65 | 237365.6 | 58003.2 | 295368.8 | ok | 0.219 |
| cerchiatura-due-aperture-sdf-pier-3 | 5.95 | 2.45 | 190809.6 | 53625.6 | 244435.2 | ok | 0.196 |

| Apertura | Carico sup. [N] | Carico fascia [N] | Reaz. sx [N] | Reaz. dx [N] |
| --- | --- | --- | --- | --- |
| - | - | - | - | - |

| Apertura | Esito | Tipo | L [m] | Mmax [Nm] | Vmax [N] | Util. |
| --- | --- | --- | --- | --- | --- | --- |
| window-left | ok | steel | 1.6 | 18719.8 | 34036 | 0.577 |
| window-right | ok | steel | 1.7 | 21527.77 | 37439.6 | 0.663 |

### Progetto

Esito: ok. Combinazione: ULS_FUNDAMENTAL. Equilibrio: ok (scarto 0 N).

| Maschio | x [m] | L [m] | N [N] | Peso [N] | Reazione [N] | Esito | Util. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cerchiatura-due-aperture-progetto-pier-1 | 0 | 1.2 | 109156 | 26265.6 | 135421.6 | ok | 0.221 |
| cerchiatura-due-aperture-progetto-pier-2 | 2.2 | 2 | 159236 | 40273.92 | 199509.92 | ok | 0.213 |
| cerchiatura-due-aperture-progetto-pier-3 | 6.15 | 2.25 | 140850 | 45745.92 | 186595.92 | ok | 0.175 |

| Apertura | Carico sup. [N] | Carico fascia [N] | Reaz. sx [N] | Reaz. dx [N] |
| --- | --- | --- | --- | --- |
| opening-framed | 122070 | 6669 | 64369.5 | 64369.5 |

| Apertura | Esito | Tipo | L [m] | Mmax [Nm] | Vmax [N] | Util. |
| --- | --- | --- | --- | --- | --- | --- |
| window-left | ok | steel | 1.6 | 18719.8 | 34036 | 0.577 |
| opening-framed | ok | steel | 2.55 | 50690.981 | 64369.5 | 0.79 |

## Comportamento laterale pre/post - maschi aggregati

| Stato | Esito | ks [N/m] | Vy [N] | Vmax [N] | du [m] | Contrib. | Cerch. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Stato di fatto | ok | 120743236.824 | 155078.789 | 155108.543 | 0.016 | 3 | 0 |
| Progetto | ok | 16654079.127 | 292713.456 | 295632.212 | 0.032 | 4 | 1 |

| Indicatore | Delta | Delta % | Lettura |
| --- | --- | --- | --- |
| Rigidezza ks | -104089157.696 | -86.21% | attenzione |
| Taglio equivalente Vy | 137634.667 | +88.75% | ok |
| Spostamento ultimo du | 0.016 | +100.01% | ok |
| Taglio massimo | 140523.669 | - | - |



## Differenza maschi aggregati vs FEM con fasce

### Stato di fatto

Telaio: pier-spandrel. Strategia: direct-global-frame-pushover.

| Indicatore | Aggregato | FEM fasce | Delta | Delta % |
| --- | --- | --- | --- | --- |
| Rigidezza iniziale ks | 120743236.824 | 184417004.128 | 63673767.305 | +52.73% |
| Taglio equivalente Vy | 155078.789 | 157534.06 | 2455.271 | +1.58% |
| Taglio massimo Vmax | 155108.543 | 157786.993 | 2678.449 | +1.73% |
| Spostamento ultimo du | 0.016 | 0.016 | 0 | +0.51% |

### Progetto

Telaio: pier-spandrel-ring-frame. Strategia: direct-global-frame-pushover.

| Indicatore | Aggregato | FEM fasce | Delta | Delta % |
| --- | --- | --- | --- | --- |
| Rigidezza iniziale ks | 16654079.127 | 17044918.691 | 390839.563 | +2.35% |
| Taglio equivalente Vy | 292713.456 | 298553.541 | 5840.085 | +2% |
| Taglio massimo Vmax | 295632.212 | 299429.887 | 3797.675 | +1.28% |
| Spostamento ultimo du | 0.032 | 0.032 | 0 | -0.01% |

## Note

- Il caso serve a produrre fasce murarie nel telaio equivalente FEM e a verificare che la cerchiatura venga letta anche con piu aperture.
- La cerchiatura e dichiarata con due telai paralleli, in analogia al parametro ntelai degli input MATLAB.

## Warning

- Opening opening-framed scales the steel ring-frame contribution by 2 because multiple identical parallel frames were declared through the ringFrame count.
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
- ... altre 16 assunzioni nel JSON.
