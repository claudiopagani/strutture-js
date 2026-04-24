# Confronto maschio singolo a tre livelli di impegno normale

Report combinato dei tre scenari richiesti con impegno a compressione `p = P / (fc * t * L)`.

## Sintesi scenari

| Scenario | p | Famiglia attesa | Famiglia trovata | Modo trovato | du agg. | du FEM | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Maschio p=0.05 | 0.05 | flexural | flexural | rocking-toe-crushing | 0.03 | 0.03 | consistent |
| Maschio p=0.35 | 0.35 | shear | shear | diagonal-cracking | 0.018 | 0.018 | consistent |
| Maschio p=0.60 | 0.6 | flexural | flexural | rocking-toe-crushing | 0.015 | 0.015 | consistent |

## Indicatori

### Maschio p=0.05

| Indicatore | Aggregato | FEM | Delta | Delta % |
| --- | --- | --- | --- | --- |
| Rigidezza iniziale ks | 7552447.5524 | 7552447.5525 | 0.0001 | +0% |
| Taglio equivalente Vy | 20329.4118 | 20326.5512 | -2.8606 | -0.01% |
| Taglio massimo Vmax | 20329.4118 | 20329.4118 | 0 | +0% |
| Spostamento ultimo du | 0.03 | 0.03 | 0 | +0% |

### Maschio p=0.35

| Indicatore | Aggregato | FEM | Delta | Delta % |
| --- | --- | --- | --- | --- |
| Rigidezza iniziale ks | 7552447.5524 | 7552447.5525 | 0.0001 | +0% |
| Taglio equivalente Vy | 60668.2784 | 60664.1437 | -4.1347 | -0.01% |
| Taglio massimo Vmax | 60668.2784 | 60668.2784 | 0 | +0% |
| Spostamento ultimo du | 0.018 | 0.018 | 0 | +0% |

### Maschio p=0.60

| Indicatore | Aggregato | FEM | Delta | Delta % |
| --- | --- | --- | --- | --- |
| Rigidezza iniziale ks | 7552447.5524 | 7552279.0534 | -168.4991 | +0% |
| Taglio equivalente Vy | 76235.2941 | 76230.5688 | -4.7253 | -0.01% |
| Taglio massimo Vmax | 76235.2941 | 76235.2941 | 0 | +0% |
| Spostamento ultimo du | 0.015 | 0.015 | 0 | +0% |
