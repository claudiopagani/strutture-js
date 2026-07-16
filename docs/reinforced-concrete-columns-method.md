# Metodo per pilastri in calcestruzzo armato

## Perimetro

`reinforced-concrete-columns` esegue una verifica locale di un pilastro in c.a.
con:

- screening della snellezza secondo NTC 2018 § 4.1.2.3.9.2;
- dominio resistente biassiale della sezione a fibre;
- momenti di progetto assegnati separatamente nelle due componenti della
  sezione.

Il modulo non esegue l'analisi globale del telaio e non genera con una formula
locale gli effetti del secondo ordine di un pilastro snello.

## Unita e segni

L'input dichiara sempre `{ force, length }` ed e convertito internamente in
`N` e `mm`.

Per impostazione predefinita:

- `nEd < 0` indica compressione;
- `mxEd` e associato a `concreteSection.inertiaY`;
- `myEd` e associato a `concreteSection.inertiaZ`.

La convenzione dello sforzo normale puo essere modificata soltanto tramite
`stability.compressionSignConvention`.

## Screening della snellezza

Per ciascuna componente si calcolano:

```text
nu        = NEd,compression / (Ac fcd)
i         = sqrt(Ic / Ac)
lambda    = l0 / i
lambdaLim = 25 / sqrt(nu)
```

Lo screening implementa le espressioni [4.1.41] e [4.1.42] delle NTC 2018.
`l0` non viene dedotta automaticamente dai vincoli del telaio: deve essere
fornita mediante `effectiveLengthMx` e `effectiveLengthMy`, oppure coincide con
la lunghezza geometrica dichiarata.

Quando `lambda <= lambdaLim`, il modulo verifica la sezione con i momenti di
primo ordine assegnati.

Quando `lambda > lambdaLim`, il modulo richiede una delle seguenti condizioni:

- momento totale esplicito `mxEdTotal` o `myEdTotal`;
- dichiarazione `designMomentsIncludeSecondOrder: true`, se i momenti di input
  provengono gia da un'analisi adeguata del secondo ordine.

In assenza di tali informazioni il risultato e `not-supported`. Il modulo non
amplifica autonomamente i momenti, perche le NTC richiedono di considerare
imperfezioni geometriche, viscosita, fessurazione e non linearita dei
materiali.

## Verifica resistente

Se la domanda e completa, il modulo:

1. costruisce il dominio biassiale a sforzo normale assegnato mediante il
   risolutore a fibre esistente;
2. interseca il raggio avente la direzione del vettore dei momenti di progetto
   con il contorno discretizzato del dominio;
3. confronta il modulo del momento agente con la distanza dell'intersezione.

Il risultato conserva il risultato sezionale completo, le snellezze, le
lunghezze efficaci e l'origine dei momenti utilizzati.

## Limiti attuali

Non sono ancora inclusi:

- generazione dei momenti del secondo ordine;
- determinazione automatica delle lunghezze libere di inflessione;
- eccentricita minima e imperfezioni generate dal modulo;
- taglio del pilastro;
- minimi e massimi geometrici di armatura;
- passo delle staffe, confinamento e dettagli costruttivi;
- zone critiche, duttilita e gerarchia delle resistenze sismica;
- verifica globale degli effetti P-Delta dell'edificio.

Questi limiti sono restituiti nei warning e non devono essere nascosti dal
consumer.

## Fonti e validazione

Fonte normativa primaria:

- D.M. 17 gennaio 2018, NTC 2018, § 4.1.2.3.9.2 e § 4.1.2.3.9.3,
  [Gazzetta Ufficiale](https://www.gazzettaufficiale.it/eli/id/2018/2/20/18A00716/sg).

La campagna automatica verifica indipendentemente `nu`, raggi d'inerzia,
snellezze e snellezza limite. La resistenza biassiale riutilizza i test e i casi
di validazione del risolutore sezionale a fibre.
