# Nodi trave-pilastro in calcestruzzo armato

## Perimetro

Il modulo `reinforced-concrete-beam-column-joints` esegue una verifica locale
dei nodi trave-pilastro dissipativi secondo NTC 2018. Il modello rappresenta
una sola direzione sismica e un solo verso sfavorevole per volta. Geometria,
armature, azioni e resistenze delle aste concorrenti sono input espliciti: il
modulo non ricostruisce il telaio globale e non e un solutore FEM.

Il primo perimetro operativo comprende:

- nodi interni ed esterni;
- domanda di taglio del pannello nodale;
- limite di compressione diagonale;
- armatura orizzontale secondo la verifica di trazione diagonale oppure il
  modello a traliccio successivo alla fessurazione;
- classificazione del nodo interamente confinato;
- diametro, quantita e passo delle staffe del nodo;
- gerarchia delle resistenze pilastro-trave con resistenze gia risolte rispetto
  ai segni dei momenti.

## Unita e convenzioni

L'input deve dichiarare un sistema di unita supportato. Il modello converte e
conserva internamente:

- forze in `N`;
- lunghezze in `mm`;
- aree in `mm2`;
- tensioni in `N/mm2`;
- momenti in `N mm`.

Lo sforzo normale del pilastro e positivo a compressione. Il taglio del
pilastro sopra il nodo e una grandezza con segno, orientata come la risultante
delle armature della trave, e viene sottratta da questa. Le aree superiore e
inferiore della trave devono essere quelle pertinenti al verso sismico
verificato. Il verso opposto richiede un secondo stato di input.

## Formulazione NTC 2018

Il fattore di sovraresistenza vale `gammaRd = 1.2` in CDA e `1.0` in CDB. La
larghezza efficace del nodo e:

```text
bj = min(max(bc, bw), min(bc, bw) + hc / 2)
```

Per un nodo esterno la domanda e calcolata con l'equazione 7.4.6; per un nodo
interno con l'equazione 7.4.7:

```text
Vjbd = |gammaRd As1 fyd - Vc|                 nodo esterno
Vjbd = |gammaRd (As1 + As2) fyd - Vc|         nodo interno
```

Il valore assoluto rende positiva la domanda dopo avere applicato la
convenzione di segno dichiarata. La resistenza a compressione diagonale segue
le equazioni 7.4.8 e 7.4.9:

```text
Vj,Rd = eta fcd bj hjc sqrt(1 - nuD / eta)
eta   = alphaJ (1 - fck / 250)
alphaJ = 0.60 per nodi interni; 0.48 per nodi esterni
nuD   = NEd / (bc hc fcd)
```

Se il radicando non e positivo, la capacita restituita e nulla e la verifica
non e soddisfatta.

Per la trazione diagonale sono disponibili, come alternative dichiarate
nell'input, l'equazione 7.4.10 e il modello a traliccio delle equazioni 7.4.11
o 7.4.12. Il risultato espone il fabbisogno di entrambe le alternative e usa
solo quella selezionata per determinare lo stato:

```text
Ash fywd >= {[(Vjbd / (bj hjc))^2 / (fctd + nuD fcd)] - fctd} bj hjw
```

Nel secondo metodo l'area longitudinale e `As1 + As2` per il nodo interno e
`As2` per il nodo esterno, con il fattore `(1 - 0.8 nuD)` non assunto minore di
zero.

Se `fctd` non e assegnato, il modulo usa
`fctd = 0.7 fctm / gammaC`, purche `fctm` e `gammaC` siano presenti nel
materiale. La sorgente del valore e conservata negli output.

## Confinamento, staffe e gerarchia

La classificazione `fully-confined` richiede travi su tutte e quattro le facce
del nodo, ciascuna con copertura non minore di `0.75`, e sovrapposizione delle
due coppie di travi opposte non minore di `0.75` dell'altezza della sezione del
pilastro. Tutti e sei i rapporti sono obbligatori anche quando il nodo non e
interamente confinato.

Il diametro delle staffe del nodo non puo essere minore di `6 mm`. L'area per
insieme di staffe e confrontata con il requisito dominante delle zone di
pilastro adiacenti. Il passo non puo superare il passo dominante adiacente;
nei nodi interamente confinati puo essere raddoppiato, senza superare `150 mm`.
Il confronto di area presuppone insiemi di staffe omogenei e gia ricondotti a
un'area resistente per livello.

La gerarchia controlla:

```text
gammaRd sum(MRb) <= sum(MRc efficace)
```

L'input `effectiveColumnMomentResistance` deve essere gia ridotto secondo i
segni dei momenti delle aste e l'equilibrio al nodo richiesti dall'equazione
7.4.4. Il modello lo rende esplicito tramite
`preReducedForMomentSigns: true`; non deduce quali pilastri contribuiscano
senza il contesto del telaio. Le sole esenzioni previste dalla norma possono
essere dichiarate esplicitamente con una motivazione.

## Limiti

Non sono ancora verificati:

- ancoraggio, piegatura, sovrapposizione e scorrimento delle barre;
- trasferimento eccentrico e nodi tridimensionali;
- interazione simultanea tra le due direzioni sismiche;
- nodi d'angolo come tipologia normativa autonoma;
- generazione delle azioni o delle resistenze delle aste concorrenti;
- dettaglio completo di duttilita delle travi e dei pilastri adiacenti.

Questi limiti sono restituiti nei `warnings` e impediscono di usare il
risultato locale come sostituto della verifica completa del telaio.

## Fonti e validazione

- D.M. 17 gennaio 2018, NTC 2018, paragrafi 7.4.4, 7.4.4.3.1 e 7.4.6.2.3,
  equazioni 7.4.4 e 7.4.6-7.4.12,
  [testo ufficiale in Gazzetta Ufficiale](https://www.gazzettaufficiale.it/eli/gu/2018/02/20/42/so/8/sg/pdf).
- NTC 2018, paragrafo 4.1.2.1.1.2, resistenza di progetto a trazione del
  calcestruzzo.
- [Relazione di calcolo pubblica](https://affidamenti.comune.fi.it/sites/affidamenti.comune.fi.it/files/profilo/documenti-di-gara/20180703/SPST04%20Relazione%20di%20calcolo%28firmato%29.pdf),
  usata come caso aritmetico per domanda del nodo interno, compressione
  diagonale e armatura di confinamento.

Test e campagna di validazione confrontano separatamente domanda, larghezza
efficace, capacita a compressione e fabbisogno a trazione. Il benchmark
pubblicato usa un arrotondamento intermedio di `eta`; la regressione della
libreria mantiene invece la precisione completa fino all'output.
