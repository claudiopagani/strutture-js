# Metodo per pilastri in calcestruzzo armato

## Perimetro

`reinforced-concrete-columns` esegue una verifica locale di un pilastro in c.a.
con:

- screening della snellezza secondo NTC 2018 § 4.1.2.3.9.2;
- generazione locale dei momenti del secondo ordine con rigidezza nominale;
- dominio resistente biassiale della sezione a fibre;
- taglio nelle due direzioni e taglio da gerarchia delle resistenze;
- armatura longitudinale e trasversale, zone critiche, confinamento,
  ancoraggio e domanda di duttilita.

Il modulo non esegue l'analisi globale del telaio. Le lunghezze efficaci e gli
stati di azione restano input espliciti.

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

In alternativa, impostando un `stability.creepCoefficient` non negativo, il
modulo genera il momento totale per il pilastro isolato. Usa la rigidezza
nominale NTC 2018 [4.1.44]:

```text
EI = 0.3 Ecd Ic / (1 + 0.5 phi)
Ncr = pi^2 EI / l0^2
MEd = M01 / (1 - beta NEd/Ncr)
```

`beta` e `momentDistributionFactor` e vale `1` in assenza di un valore
esplicito. Se il momento di primo ordine e nullo, l'opzione predefinita include
l'eccentricita d'imperfezione locale `L/300`. Se `NEd >= Ncr`, oppure non e
fornito ne il coefficiente di viscosita ne un momento totale, il risultato e
`not-supported`. Il metodo non sostituisce una vera analisi P-Delta del telaio.

## Taglio, dettagli e duttilita

Il contratto opzionale `shear` riusa il kernel NTC 2018 per ciascuna direzione.
Il taglio di progetto puo essere assegnato o ottenuto dall'equilibrio dei
momenti resistenti alle estremita e della lunghezza libera, secondo § 7.4.5.

Il contratto `detailing` controlla i limiti ordinari dei §§ 4.1.6.1.2 e, per
elementi dissipativi, dimensioni, percentuale longitudinale, lunghezza della
zona critica, diametro e passo delle staffe. Il confinamento calcola `alpha_n`,
`alpha_s`, `omega_wd` e verifica le espressioni [7.4.29]-[7.4.31] rispetto alla
domanda esplicita di duttilita in curvatura. Gli ancoraggi usano EN 1992-1-1
§ 8.4, con il requisito NTC aggiuntivo quando il pilastro e teso.

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

Restano fuori dal modulo locale:

- determinazione automatica delle lunghezze libere di inflessione;
- verifica globale degli effetti P-Delta dell'edificio.

Questi limiti sono restituiti nei warning e non devono essere nascosti dal
consumer.

## Fonti e validazione

Fonte normativa primaria:

- D.M. 17 gennaio 2018, NTC 2018, §§ 4.1.2.3.9.2-3, 4.1.6.1.2,
  7.4.5, 7.4.6.1.2 e 7.4.6.2.2,
  [Gazzetta Ufficiale](https://www.gazzettaufficiale.it/eli/id/2018/2/20/18A00716/sg).
- EN 1992-1-1:2004, § 8.4, per aderenza e lunghezze di ancoraggio.

La campagna automatica verifica indipendentemente `nu`, raggi d'inerzia,
snellezze e snellezza limite. Test dedicati coprono amplificazione nominale,
taglio e confinamento; la resistenza biassiale riutilizza i casi del risolutore
sezionale a fibre.
