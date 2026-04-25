# Cerchiatura porta singola

Esempio sintetico ricavato dalla struttura logica degli input MATLAB: un allineamento con apertura esistente e progetto con apertura allargata cerchiata.

Input: `cerchiatura-porta-singola.json`

## Verifica carichi verticali

### Stato di fatto

Esito: ok. Combinazione: ULS_FUNDAMENTAL. Equilibrio: ok (scarto 0 N).

| Maschio | x [m] | L [m] | N [N] | Peso [N] | Reazione [N] | Esito | Util. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cerchiatura-porta-singola-sdf-pier-1 | 0 | 2.95 | 131665.5 | 47790 | 179455.5 | ok | 0.136 |
| cerchiatura-porta-singola-sdf-pier-2 | 3.8 | 0.4 | 33745.5 | 6480 | 40225.5 | ok | 0.225 |

| Apertura | Carico sup. [N] | Carico fascia [N] | Reaz. sx [N] | Reaz. dx [N] |
| --- | --- | --- | --- | --- |
| - | - | - | - | - |

| Apertura | Esito | Tipo | L [m] | Mmax [Nm] | Vmax [N] | Util. |
| --- | --- | --- | --- | --- | --- | --- |
| door-existing | ok | steel | 1.45 | 9422.569 | 18385.5 | 0.29 |

### Progetto

Esito: ok. Combinazione: ULS_FUNDAMENTAL. Equilibrio: ok (scarto 0 N).

| Maschio | x [m] | L [m] | N [N] | Peso [N] | Reazione [N] | Esito | Util. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cerchiatura-porta-singola-progetto-pier-1 | 0 | 2.25 | 86400 | 34506 | 120906 | ok | 0.127 |
| cerchiatura-porta-singola-progetto-pier-2 | 3.9 | 0.3 | 11520 | 2916 | 14436 | ok | 0.179 |

| Apertura | Carico sup. [N] | Carico fascia [N] | Reaz. sx [N] | Reaz. dx [N] |
| --- | --- | --- | --- | --- |
| door-framed | 63360 | 6682.5 | 35021.25 | 35021.25 |

| Apertura | Esito | Tipo | L [m] | Mmax [Nm] | Vmax [N] | Util. |
| --- | --- | --- | --- | --- | --- | --- |
| door-framed | ok | steel | 2.25 | 24952.641 | 35021.25 | 0.797 |

## Comportamento laterale pre/post - maschi aggregati

| Stato | Esito | ks [N/m] | Vy [N] | Vmax [N] | du [m] | Contrib. | Cerch. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Stato di fatto | ok | 57895725.262 | 53241.465 | 53570.842 | 0.015 | 2 | 0 |
| Progetto | ok | 6646393.523 | 50640.078 | 50302.262 | 0.015 | 3 | 1 |

| Indicatore | Delta | Delta % | Lettura |
| --- | --- | --- | --- |
| Rigidezza ks | -51249331.739 | -88.52% | attenzione |
| Taglio equivalente Vy | -2601.386 | -4.89% | attenzione |
| Spostamento ultimo du | 0 | +0% | ok |
| Taglio massimo | -3268.581 | - | - |



## Differenza maschi aggregati vs FEM con fasce

### Stato di fatto

Telaio: pier-spandrel. Strategia: direct-global-frame-pushover.

| Indicatore | Aggregato | FEM fasce | Delta | Delta % |
| --- | --- | --- | --- | --- |
| Rigidezza iniziale ks | 57895725.262 | 70921115.875 | 13025390.613 | +22.5% |
| Taglio equivalente Vy | 53241.465 | 54161.223 | 919.759 | +1.73% |
| Taglio massimo Vmax | 53570.842 | 54211.446 | 640.604 | +1.2% |
| Spostamento ultimo du | 0.015 | 0.015 | 0 | +0.53% |

### Progetto

Telaio: pier-spandrel-ring-frame. Strategia: direct-global-frame-pushover.

| Indicatore | Aggregato | FEM fasce | Delta | Delta % |
| --- | --- | --- | --- | --- |
| Rigidezza iniziale ks | 6646393.523 | 6815029.328 | 168635.805 | +2.54% |
| Taglio equivalente Vy | 50640.078 | 50630.987 | -9.091 | -0.02% |
| Taglio massimo Vmax | 50302.262 | 50377.676 | 75.414 | +0.15% |
| Spostamento ultimo du | 0.015 | 0.015 | 0 | +0.96% |

## Note

- Il confronto pre/post usa due modelli geometrici separati nello stesso file, come gli allineamenti attuale/progetto degli input MATLAB.
- La verifica laterale aggregata somma i contributi dei maschi murari e delle cerchiature; il confronto FEM include le fasce murarie elastiche e la cerchiatura esplicita.

## Warning

- Nessun warning.

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
