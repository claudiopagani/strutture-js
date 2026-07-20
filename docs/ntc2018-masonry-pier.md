# Modello normativo NTC 2018 del maschio murario

## Separazione dal modello fisico

`strutture-js` espone due modelli deliberatamente distinti:

- `CyclicMasonryPier2D` e il relativo protocollo di analisi costituiscono il
  macroelemento fisico ciclico. Rocking, schiacciamento, taglio diagonale e
  scorrimento coesistono; degrado, pinching e deformazioni residue dipendono
  dalla storia;
- `NTC2018MasonryPierModel` con `NTC2018MasonryPierAnalysis` costituisce
  l'inviluppo normativo bilineare. La resistenza e il minimo esatto dei tre
  meccanismi e lo spostamento ultimo dipende dal meccanismo governante.

Il secondo modello non e una calibrazione del primo e non viene usato per
commutare i suoi meccanismi. Il confronto fra i due ha quindi significato di
controllo, non di identita delle curve.

## Campo di applicazione

La prima versione autonoma copre maschi rettangolari in muratura ordinaria
esistente, in analisi statica non lineare allo SLC, secondo NTC 2018 e
Circolare 21 gennaio 2019 n. 7. La muratura armata, la muratura confinata, le
fasce di piano e un modello autonomo a tre meccanismi per costruzioni nuove
sono fuori campo.

Gli input dichiarano sempre `{ force, length }`; il modello normalizza in
`N` e `mm`. Le tensioni interne sono quindi in `N/mm2`. La compressione assiale
e positiva. Uno sforzo di trazione non incrementa l'attrito e rende nulla la
resistenza a pressoflessione.

## Resistenze

Per una sezione di lunghezza `l`, spessore `t`, sforzo normale di compressione
`N` e luce di taglio `h0`, la pressoflessione usa:

```text
sigma0 = N / (l t)
Mu = l^2 t sigma0 / 2 [1 - sigma0 / (0.85 fm)]
Vflex = Mu / h0
```

Il termine tra parentesi non puo essere negativo. Per `N <= 0` la capacità è
zero e tale zero partecipa al minimo: non viene ignorato come valore non
positivo.

Lo scorrimento usa:

```text
Vsl = l' t min(fv0 + 0.4 N/(l' t), fv,lim)
```

La lunghezza compressa deriva dal diagramma lineare senza trazione:

```text
l' = l                         per e <= l/6
l' = 3 (l/2 - e)               per e > l/6
e  = Vsl h0 / N
```

L'equazione implicita è risolta in forma chiusa su ciascun ramo. Per i blocchi
di forma standard, se non è fornito direttamente `shearStrengthLimit`, il
modello lo ricava da `blockCompressiveStrength` come
`fv,lim = 0.065 fb / 0.7`. Il dato `fb` deve essere la resistenza normalizzata
del blocco; il modello non la deduce da `fm`.

Per tessitura irregolare si usa Turnšek-Cacovic:

```text
ftd = 1.5 tau0d
b = clamp(h/l, 1, 1.5)
Vdt = l t ftd / b sqrt(1 + sigma0/ftd)
```

Per tessitura regolare la strategia a fessura a scaletta usa `fv0`, il
coefficiente di attrito locale `mu` e il coefficiente di ingranamento `phi`:

```text
Vjoint = l t / b (fv0 + mu sigma0) / (1 + mu phi)
Vblock = l t / b fbt/2.3 sqrt(1 + sigma0/fbt)
Vdt = min(Vjoint, Vblock)
```

Il valore di riferimento `mu = 0.577` e quello suggerito dalla Circolare;
`phi` deve derivare dal rilievo della tessitura. Se `fbt` non è assegnata, può
essere stimata dal dato esplicito `fb` come `0.1 fb`, come indicato dalla
Circolare. Nessuno dei due dati viene ricavato dalla resistenza della muratura.

La capacità laterale è infine:

```text
VR = min(Vflex, Vsl, Vdt)
```

Un meccanismo non valutabile per input mancante produce `not-implemented` nel
workflow autonomo. Non è sostituito da una formula incompleta.

## Rigidezza laterale normativa

Il modello normativo somma le cedevolezze flessionale e tagliante una sola
volta:

```text
Kb = rcr c E I / hdef^3
Ks = rcr kappa G A / hdef
K  = 1 / (1/Kb + 1/Ks)
```

con `c = 3` per mensola e `c = 12` per doppio incastro, `kappa = 5/6` e
`rcr = 0.5` per la stima semplificata delle rigidezze fessurate. Un valore
diverso di `rcr` è ammesso come dato esplicito quando deriva da una valutazione
più accurata; non è una costante normativa universale.

Nel macroelemento fisico la rigidezza è invece la condensazione in serie di
corpo elastico, due interfacce a fibre e molla centrale a taglio. Cambia con
contatto, sforzo normale, danno e storia ciclica. Perciò le due rigidezze non
sono obbligate a coincidere.

## Spostamento ultimo e curva

Dopo avere determinato il minimo resistente, il modello assegna allo SLC:

- pressoflessione: `du = 0.01 h`;
- scorrimento: `du = 0.005 h`;
- fessurazione diagonale: `du = 0.005 h`;
- fessurazione diagonale in muratura moderna a blocchi forati: `du = 0.004 h`.

Questi limiti non dipendono dal rapporto `N/(fm A)` nel modello normativo qui
implementato. Lo sforzo normale modifica invece le tre resistenze e quindi il
meccanismo che seleziona il drift ultimo. Non viene introdotta la precedente
legge `0.0125(1-p)`, non presente nelle espressioni adottate.

La curva è elastica-perfettamente plastica fino a `du`, con
`dy = VR/K`. Se `dy >= du`, il risultato è `not-verified` e la curva non viene
alterata: non si aumenta artificialmente `K` e non si sposta `dy` al 95% di
`du`. Per uno spostamento assegnato oltre `du`, la resistenza restituita è zero.
Il modello è un inviluppo monotono, non una legge isteretica.

## Valori medi e fattore di confidenza

Per costruzioni esistenti in analisi non lineare, `fm`, `tau0`, `fv0`, `fb` e
`fbt` sono trattati come valori medi e divisi per il fattore di confidenza.
`E` e `G` non sono divisi per il fattore di confidenza. I valori tabellati e le
stime dei blocchi richiedono sempre una valutazione coerente con il livello di
conoscenza e con le prove disponibili.

## API essenziale

```js
import {
  MasonryPierApplication,
  NTC2018MasonryPierModel,
} from "strutture-js/applications/masonry-piers";

const model = new NTC2018MasonryPierModel({
  id: "P1",
  units: { force: "kN", length: "m" },
  geometry: { height: 3, length: 1.5, thickness: 0.3 },
  material: {
    units: { force: "kN", length: "m" },
    fm: 4000,
    tau0: 80,
    fv0: 120,
    E: 1.8e6,
    G: 0.6e6,
  },
  actions: { axialForce: 300, lateralDisplacement: 0.02 },
  design: { confidenceFactor: 1.2 },
  normative: {
    scope: "existing",
    masonryTexture: "irregular",
    blockCompressiveStrength: 12000,
  },
});

const result = new MasonryPierApplication().run({
  analysisType: "ntc2018-bilinear",
  model,
});
```

Il risultato è un `VerificationResult` serializzabile con `status`, `outputs`,
`checks`, `warnings`, `assumptions`, `demand`, `capacity` e
`utilizationRatio`.

## Fonti

- [DM 17 gennaio 2018 — NTC 2018, testo ufficiale](https://www.gazzettaufficiale.it/eli/gu/2018/02/20/42/so/8/sg/pdf), §§7.8.1.5.2, 7.8.1.5.4, 7.8.2.2.1 e 7.8.2.2.2.
- [Circolare 21 gennaio 2019 n. 7, pubblicazione ufficiale](https://www.gazzettaufficiale.it/eli/id/2019/02/11/19A00855/sg), §C8.7.1.3.1.1, formule C8.7.1.14 e C8.7.1.16-C8.7.1.18.
