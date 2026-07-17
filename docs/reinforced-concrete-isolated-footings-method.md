# Metodo per plinti isolati in calcestruzzo armato

## Perimetro

`reinforced-concrete-isolated-footings` verifica localmente un plinto
rettangolare con pilastro rettangolare centrato e non ruotato. Le azioni devono
essere gia ridotte al centro della base del plinto.

Il modulo separa deliberatamente:

- analisi del contatto e integrazione delle pressioni;
- confronto con resistenze geotecniche assegnate;
- verifiche strutturali del plinto in calcestruzzo armato.

Non calcola la capacita portante o la resistenza allo scorrimento del terreno.
Tali resistenze dipendono dal modello geotecnico, dall'approccio di progetto e
dai coefficienti parziali scelti e devono essere fornite dal responsabile della
verifica geotecnica.

## Unita, assi e segni

L'input dichiara `{ force, length }`; le unita interne sono `N` e `mm`.

- `columnVerticalForce` e positivo verso il basso;
- `horizontalX` e `horizontalY` sono le azioni parallele alla base;
- `momentX` e `momentY` sono momenti rispetto agli assi baricentrici della
  base;
- `uniformDownwardPressure` rappresenta un carico verticale uniforme gia
  fattorizzato, per esempio peso proprio del plinto e terreno soprastante.

La forza di contatto totale e:

```text
NEd,total = columnVerticalForce + uniformDownwardPressure Bx By
```

## Contatto completo

Il plinto e assunto rigido e il terreno non reagente a trazione. Finche tutte
le pressioni agli spigoli sono non negative si usa il campo lineare:

```text
q(x,y) = N/A + My x/Iy + Mx y/Ix
```

con:

```text
A  = Bx By
Ix = Bx By^3 / 12
Iy = By Bx^3 / 12
```

Il confronto geotecnico usa `qmax` e la resistenza di progetto assegnata
`soil.designBearingResistance`.

## Perdita di contatto

In flessione monoassiale, se il risultante esce dal nocciolo ma resta entro la
base, viene risolta la distribuzione triangolare priva di trazioni:

```text
c    = 3 (B/2 - |e|)
qmax = 2 N / (c Btrasversale)
```

Il risultato espone lunghezza e area di contatto, bordo compresso e pressione
massima.

Per perdita di contatto biassiale viene risolto iterativamente il piano
`q = max(0, a + bx + cy)`. Il poligono attivo e ottenuto tagliando la base con
la retta a pressione nulla; area e momenti del poligono sono integrati in forma
chiusa e i tre coefficienti sono corretti finche risultante e due momenti
coincidono con le azioni assegnate. Gli output espongono poligono, residui e
numero di iterazioni.

Se il risultante esce dalla base, il risultato e `not-verified` per assenza di
equilibrio compresso.

## Flessione e taglio monodirezionale

La pressione, anche parziale e biassiale, viene integrata sui mensoloni ai
quattro lati del pilastro. Per ciascuna direzione si ricavano:

- momento per unita di larghezza alla faccia del pilastro;
- taglio per unita di larghezza alla distanza `d` dalla faccia;
- posizione e lato che governano.

Il peso uniforme discendente viene sottratto dalla pressione del terreno prima
dell'integrazione delle azioni strutturali. La resistenza a flessione riusa il
solutore sezionale a fibre su una striscia da 1000 mm; il taglio riusa la
verifica NTC 2018 senza armatura trasversale.

## Punzonamento

La prima integrazione automatica usa il perimetro di controllo a `2d` di
EN 1992-1-1:2004+A1:2014 e richiede una selezione normativa esplicita nel
contratto `punching.code`.

La forza di punzonamento e ottenuta
per equilibrio sottraendo alla forza del pilastro la reazione efficace del
terreno racchiusa dal perimetro. Nel contatto parziale l'intersezione tra il
poligono compresso e il perimetro arrotondato a `2d` e integrata esplicitamente.

Se il perimetro completo a `2d` raggiunge il bordo del plinto, il meccanismo di
punzonamento viene registrato come non applicabile e resta attiva la verifica a
taglio monodirezionale.

## Scorrimento

Quando l'azione orizzontale e diversa da zero deve essere fornita
`soil.designSlidingResistance`. Il modulo confronta domanda e resistenza ma non
deduce quest'ultima da un coefficiente di attrito implicito. Eventuali
contributi laterali o passivi devono essere gia giustificati nella resistenza
assegnata e nella relativa sorgente.

## Schiacciamento e ancoraggi

Per carico centrato, la resistenza locale usa EN 1992-1-1 [6.63], con area
caricata, area di ripartizione effettivamente disponibile e limite al fattore
di incremento. In presenza di eccentricita si usa conservativamente il picco
elastico di tensione all'interfaccia senza incremento per diffusione.

Gli ancoraggi opzionali delle barre del pilastro e delle due armature inferiori
usano `fbd` e `lbd` di EN 1992-1-1 § 8.4. Condizione di aderenza, fattori alpha,
tensione di progetto e lunghezza disponibile sono input espliciti.

## Limiti attuali

- pilastro centrato, rettangolare e non ruotato;
- base rettangolare rigida;
- punzonamento automatico della generazione EN 1992-1-1:2004;
- nessun calcolo di capacita portante, cedimenti o interazione terreno-struttura;
- nessun plinto combinato, zoppo o su pali.

## Fonti e validazione

- D.M. 17 gennaio 2018, NTC 2018, §§ 7.2.5 e 7.11.5.3.1,
  [Gazzetta Ufficiale](https://www.gazzettaufficiale.it/eli/id/2018/2/20/18A00716/sg).
- JRC EUR 26566 EN, *Eurocode 2: Background & Applications. Design of
  Concrete Buildings - Worked Examples*, §§ 4.2.1 e 5.4,
  [doi:10.2788/35386](https://doi.org/10.2788/35386).
- EN 1992-1-1:2004+A1:2014 per le verifiche strutturali richiamate dai kernel
  di sezione, taglio e punzonamento.

La campagna automatica controlla pressioni elastiche, perdita di contatto
monoassiale e biassiale, equilibrio del poligono attivo e integrazione
indipendente delle azioni di una striscia. Test applicativi coprono inoltre
schiacciamento e ancoraggi.
