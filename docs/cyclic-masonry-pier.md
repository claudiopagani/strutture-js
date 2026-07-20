# Macroelemento ciclico 2D per maschi murari

## Stato e campo di impiego

`CyclicMasonryPier2D` e una prima implementazione funzionante di un
macroelemento meccanico nel piano. Non e una verifica normativa e non fornisce
parametri universali: resistenze, deformazioni limite, leggi di degrado,
pinching e lunghezze caratteristiche devono essere calibrati per la muratura e
il dettaglio costruttivo studiati.

Il modello combina sempre due interfacce terminali a fibre, un corpo elastico
assiale-flessionale e una molla centrale non lineare a taglio. Non usa soglie
del rapporto `N/(fc*A)` e il meccanismo riportato in output e solo diagnostico.

I riferimenti concettuali principali sono i macroelementi a meccanismi
accoppiati di [Penna, Lagomarsino e Galasco (2014)](https://doi.org/10.1002/eqe.2335)
e [Chen, Moon e Yi (2008)](https://doi.org/10.1016/j.engstruct.2007.12.001).
La formulazione Turnsek-Sheppard sostituibile e documentata anche nel caso di
studio sperimentale di [Guerrini et al. (2021)](https://doi.org/10.3390/geosciences11060230).
La separazione esplicita di inviluppo, pinching e degrado per escursione/energia
segue una struttura analoga, non una replica, del materiale
[OpenSees Pinching4](https://opensees.berkeley.edu/OpenSees/manuals/usermanual/1152.htm).

## Architettura rilevata e punti di estensione

La libreria usa ESM, JavaScript con JSDoc e unita esplicite. `Node` normalizza
le coordinate in `kN,m`; `DofRegistry` identifica i gradi di liberta con
`ux`, `uy`, `rz`; gli elementi di telaio hanno sei gradi di liberta, matrice di
trasformazione lineare locale-globale e assemblaggio mediante `FemAssembler2D`.
Le travi Euler-Bernoulli e Timoshenko sono lineari. Il solver non lineare
generico preesistente e a controllo di spostamento, ma non esponeva un contratto
costitutivo `trial/commit/revert` ne una trasformazione corotazionale.

I nuovi moduli restano nel layer `domain`:

- `domain/materials/masonry`: materiali ciclici e strategie di resistenza;
- `domain/sections/masonry`: interfaccia terminale a fibre;
- `domain/fem/elements/masonry`: cinematica e macroelemento;
- `domain/fem/nonlinear`: protocollo ciclico per un maschio isolato;
- `validation`: quattro benchmark qualitativi e dati JSON/CSV.

Gli entry point pubblici sono il package root e `strutture-js/domain/fem`. Non
sono necessari deep import.

## Unita e segni

Ogni costruttore richiede `{ force, length }`; lo stato interno FEM e sempre
`{ force: "kN", length: "m" }`. Spostamenti passati direttamente ai metodi
FEM sono quindi in metri, rotazioni e deformazioni sono adimensionali, tensioni
in `kN/m2`, forze in `kN` e momenti in `kN*m`.

- tensione e deformazione di fibra: positive a trazione, negative a compressione;
- `axialForce` dell'elemento: positivo a trazione;
- `currentAxialCompression`: positivo a compressione e sempre limitato inferiormente a zero;
- taglio e momento: segni della cinematica locale di telaio;
- `axialCompression` del protocollo isolato: valore positivo applicato in compressione.

La matrice di trasformazione e la stessa trasformazione lineare degli elementi
di telaio esistenti. La versione corrente non include P-Delta o una
trasformazione corotazionale, perche tali servizi non sono presenti nel layer
FEM generico.

## Interfaccia terminale a fibre

Per ogni fibra, con coordinata `x_i`, area `A_i=t*l/n_f` e lunghezza di cerniera
`L_h`:

```text
delta_i   = delta_0 + theta*x_i
epsilon_i = delta_i/L_h
N         = sum(sigma_i*A_i)
M         = sum(sigma_i*A_i*x_i)
```

La tangente consistente dell'interfaccia e:

```text
K_NM = sum[(E_ti*A_i/L_h) * [[1, x_i], [x_i, x_i^2]]]
```

La lunghezza compressa e la somma delle porzioni di fibra per cui la
deformazione e oltre la deformazione corrente di richiusura. La frazione della
fibra attraversata dall'asse neutro e interpolata linearmente: il risultato non
salta di una intera larghezza di fibra. Per il taglio viene usato, di default,
il minimo tra le lunghezze compresse delle due estremita; l'alternativa
`average` e gia disponibile.

Rocking significa perdita e recupero del contatto. Prima di
`damageOnsetStrain` l'apertura non aggiorna danno o deformazione plastica.

## Materiale ciclico di compressione

La compressione e trattata in valore assoluto `x=-epsilon`. L'inviluppo
pre-picco puo essere lineare oppure cubico. Nel caso cubico, posto
`r=x/epsilon_c0` e `s=E*epsilon_c0/fc`:

```text
sigma_c/fc = (s-2)*r^3 + (3-2s)*r^2 + s*r
```

La curva raggiunge `fc` con tangente nulla al picco. Il ramo post-picco e
lineare fino a `residualStrengthRatio*fc` a `ultimateStrain`. In alternativa
`ultimateStrain` puo essere derivata dall'energia di frattura a compressione:

```text
epsilon_u = epsilon_c0 + 2*G_fc/[L_h*fc*(1-r_res)]
```

Il danno inizia soltanto oltre `damageOnsetStrain`. Le variabili di danno di
rigidezza e resistenza combinano il massimo avanzamento di schiacciamento e,
se attivato, l'energia dissipata normalizzata. Lo scarico usa una rigidezza
degradata e la sua intercetta a tensione nulla definisce `plasticStrain` e
`zeroStressStrain`. Apertura e richiusura usano questa intercetta senza
modificare lo stato committed.

La trazione e nulla per default. Se sono assegnati `tensileStrength` e
`tensionFractureEnergy`, il softening a trazione e regolarizzato con `L_h`.

Ogni fibra possiede un clone indipendente e separa:

- deformazione totale, elastica, plastica e di apertura;
- danno di rigidezza e di resistenza;
- massima compressione e tensione raggiunta;
- lavoro, energia dissipata, inversioni e ramo corrente;
- stato trial e committed.

## Materiale ciclico a taglio

La rigidezza iniziale e `K_s=G*A_s/h_d`, salvo assegnazione esplicita. La forza
elastica traslata e:

```text
V_e = (1-d_k)*K_s*(Delta_s-Delta_s^p)
```

L'inviluppo e lineare fino alla capacita corrente, ammette incrudimento fino a
`peakShearStrain*h_d`, softening fino a `ultimateShearStrain*h_d` e un ramo
residuo. Sul ramo limitato:

```text
V = sign(V_e) * phi_p * V_envelope
Delta_s^p = Delta_s - V/[(1-d_k)*K_s]
```

Sul ramo di scarico `V=phi_p*V_e`. Il fattore `phi_p` varia in modo continuo da
1 al punto di inversione fino a `pinching.factor` in prossimita dell'origine,
poi recupera verso 1. Massimi positivo/negativo, deformazione plastica,
inversioni, energia, danno e memoria di pinching sono variabili distinte.

Il danno e il massimo committed della somma configurabile di una quota per
escursione oltre lo snervamento e una quota per energia. Non viene aggiornato
irreversibilmente durante un trial.

### Capacita concorrenti

La strategia Turnsek-Sheppard implementata e sostituibile:

```text
sigma_c = max(N_c,0)/(t*l_c)
V_DT,0  = t*l_c*ft/b * sqrt(1+sigma_c/ft)
```

`damageCoefficient` e `crushingReductionCoefficient` applicano i due degradi
espliciti. `MohrCoulombModel` e un'alternativa generica nello stesso slot.

Lo scorrimento usa:

```text
V_SL = c_d*t*l_c + mu_d*max(N_c,0)
```

La coesione ha un pavimento residuo configurabile; l'attrito non degrada se
`frictionDamageCoefficient=0`. Con `residualStrengthMode="sliding-floor"` il
pavimento residuo protegge anche il contributo d'attrito nel ramo ultimo.

Le due capacita non sono selezionate con uno switch. Competono mediante un
minimo regolarizzato:

```text
V_R = (V_DT^(-q) + V_SL^(-q))^(-1/q)
```

`competitionExponent=q` e esplicito. Il minimo regolarizzato e leggermente
conservativo rispetto al minimo esatto e mantiene una transizione continua.

## Cinematica, equilibrio e tangente

I gradi di liberta sono `[u1,v1,theta1,u2,v2,theta2]`. La deformazione base e
`v=B*u_local`; le cinque deformazioni interne sono
`z=[deltaI,phiI,deltaJ,phiJ,Delta_s]`. La compatibilita e:

```text
v = v_body + C*z
```

Il corpo centrale contiene soltanto elasticita assiale e flessionale:

```text
K_body = diag(EA/L) (+ blocco flessionale EI/L * [[4,2],[2,4]])
```

Non contiene plasticita flessionale e non contiene rigidezza a taglio. La
deformabilita a taglio e quindi contata una sola volta nella molla centrale.

L'iterazione locale impone:

```text
r(z) = f_components(z,N,l_c,d_c) - C^T*K_body*(v-C*z) = 0
```

Usa Newton scalato, ricerca lineare e correzioni least-squares regolarizzate in
caso di perdita di rango. La tangente delle fibre e analitica; le derivate di
accoppiamento del taglio rispetto a `N`, `l_c` e crushing sono calcolate
numericamente in modo locale. Dopo la convergenza:

```text
J         = dr/dz
dz/dv     = J^(-1)*C^T*K_body
K_basic   = K_body*(I-C*dz/dv)
K_local   = B^T*K_basic*B
K_global  = T^T*K_local*T
```

Le rigidezze residue numeriche sono disattivate per default e configurabili
con `numericalTangentRatio`. Una mancata convergenza produce un errore con
residuo, deformazioni interne e squilibrio della molla; non viene mascherata.

## Stato, commit e rollback

Materiali, fibre ed elemento espongono `commitState`, `revertToLastCommit`,
`revertToStart`, `clone` e import/export serializzabile. Ogni valutazione trial
riparte esclusivamente dallo stato committed. `evaluate({state,...})` usa un
clone e restituisce il nuovo stato senza contaminare l'oggetto originario.

`CyclicMasonryPierAnalysis2D` prescrive lo spostamento laterale e risolve con
Newton lo spostamento assiale e, per il cantilever, la rotazione superiore. Lo
stato viene committed solo a convergenza globale; in caso contrario viene
ripristinato l'ultimo passo convergente. La suddivisione automatica non e
inclusa: i protocolli di validazione dichiarano esplicitamente passi da 0.1 mm.

## Output

La risposta include forze e tangenti locali/globali, `N`, `V`, momenti,
deformazione di taglio, rotazioni delle interfacce, estremi delle deformazioni
di fibra, lunghezze compresse, danni, energia, capacita correnti, deformazione
plastica, pinching, indici e meccanismi attivati. Gli indici sono:

```text
eta_rock = 1-l_c/l
eta_C    = max(|epsilon_c|)/epsilon_c0
eta_DT   = |V|/V_DT
eta_SL   = |V|/V_SL
```

Il `predominantMechanism` e il massimo degli indici e non modifica la risposta.

Questo macroelemento non applica limiti di drift o resistenze normative come
criteri di arresto. L'inviluppo bilineare distinto, aderente al campo NTC 2018
documentato, è descritto in
[Modello normativo NTC 2018 del maschio murario](ntc2018-masonry-pier.md).

## Validazione e benchmark

I valori seguenti sono una calibrazione illustrativa di regressione, non dati
normativi o una validazione sperimentale:

| Caso | N [kN] | Picco | Esito caratteristico |
| --- | ---: | ---: | --- |
| A rocking | 40 | circa 7.48 kN | `eta_rock>0.90`, nessun crushing |
| B misto | 250 | circa 25.46 kN | rocking e trazione diagonale attivati |
| C crushing | 600 | circa 32.56 kN | `eta_C>1.10`, danno di compressione > 0.02 |
| D sliding | 100 | circa 8.43 kN | `eta_SL` circa 1, deformazione permanente |

La suite verifica inoltre simmetria vergine positiva/negativa, 8/16/32/64
fibre, sensibilita a `L_h`, assenza di dissipazione spuria nel rocking elastico,
rollback, doppio conteggio e tangenti mediante differenze finite. Nel caso A la
differenza sul picco rispetto a 64 fibre e inferiore all'8% con 8 fibre e
inferiore all'1% con 16, 32 e 64 fibre.

Comandi:

```bash
npm test
npm run validation
npm run example:masonry-cyclic
npm run example:masonry-cyclic -- --csv
npm run check
```

## Limiti della versione 1

- trasformazione geometrica lineare: niente P-Delta/corotazionale;
- integrazione nel solver globale esistente limitata al contratto elemento;
  il protocollo isolato e il percorso non lineare verificato end-to-end;
- niente degrado delle fibre causato dal danno di taglio; il flag richiesto
  genera un warning `not implemented` e il punto software e predisposto;
- nessuna calibrazione automatica e nessun set normativo di default;
- softening di compressione e trazione regolarizzabile per energia; il
  softening di taglio usa deformazioni caratteristiche riferite a `h_d` e deve
  essere ricalibrato se cambia tale lunghezza;
- non sono modellati disgregazione, delaminazione, meccanismi fuori piano,
  torsione o interazione con diaframmi;
- la localizzazione estrema e tangenti negative richiedono incrementi piccoli;
  non e disponibile un metodo arc-length.

La parte a fibre e meccanica: contatto, interazione N-M e crushing emergono
dalla distribuzione delle tensioni. La molla di taglio e invece una componente
fenomenologica meccanicamente accoppiata: inviluppo, pinching e degradi
richiedono calibrazione sperimentale. Richiedono calibrazione anche `L_h`,
deformazioni di picco/ultime, energie di frattura, fattori di distribuzione,
coesione, attrito, resistenze residue e tutti i coefficienti di danno.

## Evoluzioni proposte

1. trasformazione corotazionale e rigidezza geometrica comune al FEM;
2. solver globale con commit/rollback nativo e substepping adattivo;
3. regolarizzazione energetica del softening di taglio con area di fessura;
4. trasferimento bidirezionale del danno taglio-interfacce;
5. strategie aggiuntive calibrate e campagne sperimentali indipendenti;
6. condensazione force-based/arc-length per rami con snap-back marcato.
