# Metodo per la torsione di travi in calcestruzzo armato

## Perimetro

`ReinforcedConcreteTorsionVerification` verifica elementi prismatici pieni o
cavi per i quali sia applicabile il traliccio resistente periferico delle NTC
2018 § 4.1.2.3.6.

Il verificatore puo essere usato direttamente oppure dal verificatore di trave
quando il risultato di analisi contiene `t`, `tEd` o `torsion` in ogni stazione.
Il FEM 2D della trave singola non genera autonomamente la torsione.

## Unita e input

L'input dichiara `{ force, length }`; le unita interne sono `N` e `mm`.

Sono richiesti:

- `tEd` e, per l'interazione, `vEd`;
- sezione e materiali;
- staffa chiusa con area di una gamba, passo e `fyd`;
- area longitudinale esplicitamente assegnata alla torsione;
- geometria del profilo medio, esplicita o derivabile da un rettangolo;
- `cotTheta`, oppure dati completi per ricavare il valore compatibile in
  torsione pura.

L'area longitudinale non viene dedotta automaticamente da tutte le barre della
sezione, per evitare di contare come disponibile per torsione un'armatura gia
interamente impegnata dalla flessione.

## Geometria resistente

Per una sezione piena:

```text
t = Ac / u
```

con il limite inferiore prescritto rispetto alla distanza tra bordo e centro
dell'armatura longitudinale. Il consumer deve fornire tale distanza oppure lo
spessore efficace gia risolto.

Per una sezione rettangolare il modulo deriva:

```text
A  = (b - t) (h - t)
um = 2 [(b - t) + (h - t)]
```

dove `A` e l'area racchiusa dalla fibra media e `um` il relativo perimetro.
Per altre geometrie `medianArea` e `medianPerimeter` devono essere espliciti.

## Resistenze

Con `c = cot(theta)`:

```text
TRcd = 2 A t f'cd c / (1 + c^2)
TRsd = 2 A (As/s) fyd c
TRld = 2 A Al fyd / (um c)
TRd  = min(TRcd, TRsd, TRld)
```

Il campo implementato e:

```text
1 <= cot(theta) <= 2.5
```

In assenza di un valore esplicito e con armature complete, per torsione pura si
usa il valore compatibile:

```text
cot(theta) = sqrt[(Al/um) / (As/s)]
```

limitato al campo ammesso.

Il valore predefinito della resistenza ridotta del calcestruzzo e
`f'cd = 0.5 fcd`, modificabile esplicitamente nel contratto.

## Interazione taglio-torsione

Quando `vEd` e diverso da zero, il modulo richiede anche i parametri della
verifica a taglio. La resistenza delle bielle viene valutata con lo stesso
`cotTheta` e si controlla:

```text
TEd / TRcd + VEd / VRcd <= 1
```

Se i parametri del taglio mancano, il risultato e `not-verified`: la sola
verifica delle tre resistenze torsionali non viene presentata come sufficiente.

## Torsione di equilibrio e di congruenza

Con `equilibriumRequired: false` il modulo restituisce `not-analyzed` e registra
che la torsione e stata classificata dal consumer come torsione di congruenza.
Il verificatore non prende autonomamente questa decisione strutturale.

## Limiti attuali

- sole staffe chiuse ortogonali;
- nessun dettaglio automatico di passo, ancoraggio o barre agli spigoli;
- nessuna sovrapposizione automatica tra armatura longitudinale di torsione e
  armatura richiesta da flessione e sforzo normale;
- nessuna sezione aperta a parete sottile;
- nessuna torsione da ingobbamento;
- nessuna analisi FEM torsionale della trave 3D.

## Fonti e validazione

Fonte normativa primaria:

- D.M. 17 gennaio 2018, NTC 2018, § 4.1.2.3.6, espressioni
  [4.1.34]-[4.1.40],
  [Gazzetta Ufficiale](https://www.gazzettaufficiale.it/eli/id/2018/2/20/18A00716/sg).

La campagna automatica confronta spessore efficace, area e perimetro medi,
`TRcd`, `TRsd`, `TRld`, `VRcd` e interazione con valori di calcolo indipendenti
memorizzati come regressione.
