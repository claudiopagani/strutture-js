# Travi di fondazione in calcestruzzo armato

## Perimetro implementato

Il modulo `reinforced-concrete-foundation-beams` analizza una trave prismatica
orizzontale su un sottofondo elastico di Winkler assegnato. Riutilizza il FEM
lineare 2D delle travi e le verifiche sezionali delle travi in calcestruzzo
armato.

L'input locale comprende:

- geometria e sezione della trave;
- materiali e armature della sezione;
- larghezza efficace di contatto;
- modulo di sottofondo per tratti contigui;
- carichi distribuiti e concentrati;
- cedimenti del suolo uniformi o lineari per tratti;
- combinazioni e stazioni di verifica.

Il modulo non determina il modulo di sottofondo, i cedimenti geotecnici o la
capacita portante del terreno. Questi valori sono input assegnati dal progetto
geotecnico.

## Convenzioni

Le coordinate globali seguono il FEM 2D esistente: `+y` e verso l'alto. Un
carico gravitazionale e quindi negativo. Anche un cedimento verso il basso e
negativo.

La pressione restituita e positiva quando il terreno esercita una reazione
verso l'alto sulla trave. Indicando con `w` lo spostamento della trave e con
`s` il cedimento imposto del terreno:

```text
p = ks (s - w)
kl = ks b
```

dove `ks` ha dimensioni forza/lunghezza cubica, `b` e la larghezza di contatto
e `kl` e la rigidezza del letto per unita di lunghezza della trave.

## Discretizzazione del sottofondo

Per un elemento di lunghezza `Le`, la prima versione condensa il letto
continuo in due molle nodali tributarie:

```text
kn,1 = kn,2 = kl Le / 2
Fs,n = kn,n s
```

I limiti dei tratti di terreno e dei tratti di cedimento sono sempre inseriti
nella mesh. La scelta e intenzionalmente semplice e rende necessario uno
studio di convergenza della discretizzazione. Il benchmark automatico verifica
la convergenza alla soluzione costante `w = q/(ks b)` per carico uniforme.

## Risultati e verifiche

Per ogni caso e combinazione sono restituiti:

- spostamenti, tagli e momenti della trave;
- reazioni delle molle e risultante verticale;
- pressione e reazione lineare campionate al centro degli elementi;
- estremi della pressione;
- indicatore di violazione dell'ipotesi di contatto.

Le azioni FEM alimentano le verifiche sezionali SLU e SLE gia disponibili per
le travi in calcestruzzo armato. Taglio e torsione sono eseguiti soltanto se i
relativi contratti di armatura sono forniti.

## Contatto monolatero e rigidezza fessurata

Il modello in c.a. usa per impostazione predefinita molle reagenti soltanto a
compressione. Un active set elimina le molle che richiederebbero trazione e
riassembla il FEM finche l'insieme dei nodi in contatto e stabile. Se restano
meno di due nodi attivi o l'iterazione non converge, il risultato e
`not-supported` e conserva l'ultimo stato per diagnosi.

Nella stessa iterazione, la rigidezza di ogni elemento viene aggiornata da una
curva momento-curvatura della sezione. La rigidezza secante interpola stato non
fessurato e fessurato; nelle combinazioni quasi permanenti il rapporto modulare
include il coefficiente di viscosita assegnato. Rilassamento, tolleranza,
numero massimo di iterazioni, campionamento della curva e tolleranza sullo
sforzo normale sono configurabili in `verification.crackedStiffness`.

La convergenza richiede contemporaneamente stabilita del contatto e variazione
relativa della rigidezza entro tolleranza. Gli output espongono iterazioni,
cambi di active set, massima variazione di rigidezza e stato di convergenza.

## Limiti

- trave orizzontale prismatica e analisi statica;
- molle indipendenti, senza interazione tra punti del terreno;
- nessuna plasticita, isteresi o dipendenza dalla pressione;
- nessuna verifica geotecnica o calcolo autonomo dei cedimenti;
- nessun dettaglio completo di ancoraggi, sovrapposizioni e zone nodali.

Il modello bilaterale resta disponibile soltanto dichiarandolo esplicitamente
nel contratto generico di fondazione.

## Riferimenti

- C. Caprani, *PyCBA — Theoretical Basis*, sezione "Spring supports and
  foundations": relazione di Winkler `q(x) = -kf v(x)` e assemblaggio per
  rigidezza diretta, https://ccaprani.github.io/pycba/theory.html.
- S. Limkatanyu, K. Kuntiyawichai, E. Spacone, M. Kwon, *Natural stiffness
  matrix for beams on Winkler foundation: exact force-based derivation*,
  Structural Engineering and Mechanics 42(1), 2012, pp. 39-53,
  https://scholarworks.gnu.ac.kr/handle/sw.gnu/22230.
- D.M. 17 gennaio 2018, NTC 2018, paragrafi 6.4 e 7.2.5: distinzione tra
  modello strutturale della fondazione e verifiche geotecniche,
  https://www.gazzettaufficiale.it/eli/id/2018/2/20/18A00716/sg.
