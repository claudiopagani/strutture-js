# Metodo per travi semplici in acciaio

Questo documento descrive il metodo implementato per travi semplici in acciaio.
Il perimetro e prudente: la classificazione locale della sezione governa la resistenza a flessione, l'instabilita flesso-torsionale e implementata in MVP per profili I/H, `RHS` o con `Mcr` fornito dall'utente, l'instabilita di aste compresse segue le curve NTC 2018 e la pressoflessione normativa copre `N + Mzz`, con estensione `N + Mzz + Myy` per profili doppiamente simmetrici supportati.
Torsione, interazioni torsionali, affinamenti LTB sofisticati e sezioni efficaci di classe 4 restano fuori dal dominio attuale.

## Perimetro

Il workflow copre:

* profili da catalogo `HEA`, `HEB`, `HEM`, `IPE`, `UPN`, `CHS`, `SHS`, `RHS`, `L`, `LU`, `T`, `FLAT`, `ROUND`;
* materiali `S235`, `S275`, `S355`;
* analisi FEM della trave con modello Euler-Bernoulli o Timoshenko;
* classificazione locale della sezione per stazioni FEM ULS;
* verifiche ULS di sezione da diagrammi FEM, con flessione governata dalla classe;
* instabilita flesso-torsionale su segmenti non controventati;
* instabilita di aste compresse con lunghezze efficaci configurabili;
* interazione di stabilita `N + Mzz` e, quando `Myy` e presente, `N + Mzz + Myy` secondo Metodo B della Circolare per profili doppiamente simmetrici supportati;
* verifica SLE di freccia verticale;
* report JSON/Markdown con checks, metadata, warning e assunzioni.

## Unita

Le sezioni e i materiali sono normalizzati internamente in:

* forza: `N`;
* lunghezza: `mm`;
* tensione: `N/mm2`;
* momento: `Nmm`.

`SteelBeamSectionProvider` espone le rigidezze in `N/mm`, poi `SingleBeamAnalysis` le converte nelle unita del modello di trave, per esempio `kN/m`.
Questo mantiene coerenti rigidezza FEM, resistenze e report.

## Convenzione Assi SCA

Le sezioni in acciaio esposte dal profilario seguono la stessa convenzione SCA:

* `y-y` verticale nel piano della sezione;
* `z-z` orizzontale nel piano della sezione;
* `x-x` longitudinale alla trave, entrante nel foglio quando si guarda la sezione frontalmente.

Per un IPE/HE in posizione ordinaria l'asse forte e quindi `z-z`: il catalogo pubblico normalizzato espone `Izz`, `Wel_zz`, `Wpl_zz` come proprieta forti e `Iyy`, `Wel_yy`, `Wpl_yy` come proprieta deboli. I campi legacy `inertiaY`, `elasticSectionModulusY` e `plasticSectionModulusY` restano usati internamente dal FEM come slot di flessione verticale primaria; nei metadata dei check sono esplicitati come `Mzz/Wzz`.

## Verificatore

Classe principale:

* `SteelMemberVerification`

Checks implementati:

* `steel-section-classification`: classificazione locale della sezione;
* `steel-bending`: resistenza a flessione governata dalla classe;
* `steel-shear`: resistenza a taglio;
* `steel-axial`: resistenza assiale;
* `steel-elastic-stress`: screening tensionale con il modulo resistente selezionato;
* `steel-axial-bending-interaction`: screening lineare locale assiale-flessione.
* `steel-lateral-torsional-buckling`: instabilita flesso-torsionale del segmento non controventato.
* `steel-compression-buckling`: instabilita di asta compressa.
* `steel-beam-column-interaction-n-my`: interazione di stabilita `N + Mzz` (id storico).
* `steel-beam-column-interaction-n-my-mz`: interazione di stabilita `N + Mzz + Myy` (id storico).

La tensione di progetto e:

```txt
fyd = fyk / gammaM0
```

con `gammaM0 = 1.05` nei preset NTC 2018.

## Classificazione della sezione

La classificazione e valutata per ogni stazione FEM ULS, usando lo stato locale `N-M`.
Questo evita di trattare la classe come proprieta fissa del profilo quando la distribuzione tensionale cambia lungo la trave.

Profili supportati:

* I/H: `IPE`, `HEA`, `HEB`, `HEM`;
* canali: `UPN`;
* tubolari: `CHS`, `SHS`, `RHS`;
* barre e piatti: `ROUND`, `FLAT`;
* profili aperti aggiuntivi: `L`, `LU`, `T`.

Il metodo usa:

* `epsilon = sqrt(235 / fyk)`;
* flangia compressa come elemento sporgente;
* anima come elemento interno con distribuzione tensionale elastica da `N-M`;
* classe globale = peggiore tra flangia e anima.

Per l'anima vengono riportati:

* `alpha`: quota compressa dell'anima;
* `psi`: rapporto tra tensione minima e massima ai bordi dell'anima;
* rapporto `c/t`;
* limiti di classe 1, 2, 3.

Per gli `UPN` la classificazione locale e supportata. L'instabilita flesso-torsionale degli `UPN` richiede invece `Mcr` fornito dall'utente: il motore non riusa automaticamente la formula semplificata dei profili I/H o `RHS`.

Se la sezione risulta in classe 4:

* il check `steel-section-classification` e non soddisfatto;
* la verifica globale risulta `not-verified`;
* viene emesso un warning esplicito per indicare che servono proprieta efficaci non ancora implementate.

## Verifiche ULS Di Sezione

La flessione usa il modulo resistente coerente con la classe locale:

| Classe | Modulo usato |
| --- | --- |
| 1 | `Wpl,zz` |
| 2 | `Wpl,zz` |
| 3 | `Wel,zz` |
| 4 | verifica bloccata finche non esistono proprieta efficaci |

```txt
Mzz,Rd = Wzz * fyd
```

Il taglio usa l'area efficace disponibile nel catalogo:

```txt
VRd = Av,y * fyd / sqrt(3)
```

Lo screening tensionale espone:

```txt
sigmaN = |NEd| / A
sigmaM = |Mzz,Ed| / Wzz
tau = |VEd| / Av,y
sigmaEq = sqrt((sigmaN + sigmaM)^2 + 3 tau^2)
```

Il controllo e considerato soddisfatto se:

```txt
sigmaEq <= fyd
```

L'interazione lineare assiale-flessione e uno screening locale conservativo:

```txt
NEd / NRd + MEd / MRd <= 1
```

La verifica di stabilita a pressoflessione normativa e descritta piu sotto e non coincide con questo screening locale.

## Instabilita Flesso-Torsionale

La verifica implementata e:

* `steel-lateral-torsional-buckling`

Il controllo usa il massimo momento ULS FEM nel segmento non controventato.
Gli input principali sono:

* `stability.lateralTorsionalBuckling.unbracedLength`;
* oppure `stability.lateralTorsionalBuckling.segments`;
* `criticalMoment` / `mCr`, se noto;
* coefficienti opzionali `gammaM1`, `curve`, `imperfectionFactor`, `effectiveLengthFactor`, `warpingLengthFactor`, `momentGradientFactor`.

Se `criticalMoment` non e fornito, il motore calcola automaticamente `Mcr` per profili I/H doppiamente simmetrici (`IPE`, `HEA`, `HEB`, `HEM`) e per `RHS` con la formula semplificata:

```txt
Mcr = C1 * pi^2 * E * Iyy / Lcr^2 * sqrt(Iw / Iyy / kw^2 + Lcr^2 * G * IT / (pi^2 * E * Iyy))
```

Assunzioni del calcolo automatico:

* profilo I/H doppiamente simmetrico o `RHS`;
* flessione principale;
* carico applicato senza effetto destabilizzante torsionale esplicito;
* coefficienti default `C1 = 1`, `k = 1`, `kw = 1`.

La resistenza e calcolata come:

```txt
lambdaLT = sqrt(Wzz * fyk / Mcr)
Mb,Rd = chiLT * Wzz * fyk / gammaM1
```

Per `CHS`, `SHS` e `ROUND` il controllo classico LTB e trattato come non richiesto (`chiLT = 1`). Per `UPN`, `L`, `LU`, `T` e `FLAT` la verifica e disponibile se l'utente fornisce `Mcr`; in caso contrario il report segnala che la verifica non puo essere generata.

Per una trave dichiarata controventata lateralmente si puo disattivare il controllo con:

```js
new SteelMemberVerification({
  stability: {
    lateralTorsionalBuckling: {
      enabled: false
    }
  }
})
```

## Instabilita Di Aste Compresse

La verifica implementata e:

* `steel-compression-buckling`

Il controllo usa il massimo sforzo normale di compressione nelle combinazioni ULS FEM.
Per default la convenzione dello sforzo normale e prudente:

```txt
NEd,compression = |NEd|
```

Si puo rendere esplicita con:

* `axialForceConvention: "compression-positive"`;
* `axialForceConvention: "compression-negative"`;
* `axialForceConvention: "absolute"`.

Per ogni asse principale:

```txt
Ncr,i = pi^2 * E * Ii / L0,i^2
lambdaBar_i = sqrt(A * fyk / Ncr,i)
Phi_i = 0.5 * [1 + alpha_i * (lambdaBar_i - 0.2) + lambdaBar_i^2]
chi_i = 1 / [Phi_i + sqrt(Phi_i^2 - lambdaBar_i^2)] <= 1
Nb,Rd,i = chi_i * A * fyk / gammaM1
```

Il check usa la minore tra `Nb,Rd,y` e `Nb,Rd,z`.
Le curve di instabilita sono inferite per i profili laminati I/H, per `UPN`, per i tubolari chiusi e per barre/piatti; restano sovrascrivibili con `curveY` e `curveZ`.

Le lunghezze libere si impostano con:

```js
new SteelMemberVerification({
  stability: {
    compressionBuckling: {
      lengthY: 5,
      lengthZ: 5,
      effectiveLengthFactorY: 1,
      effectiveLengthFactorZ: 1
    }
  }
})
```

Se non sono fornite, il wrapper della trave semplice usa la luce FEM e prova a inferire il fattore dai vincoli:

| Schema riconosciuto | Fattore default |
| --- | --- |
| appoggio-appoggio | `1.0` |
| mensola incastro-libero | `2.0` |
| incastro-cerniera/appoggio | `0.7` |
| incastro-incastro | `0.5` |

Per telai complessi o vincoli non riconducibili allo schema di trave semplice, la lunghezza libera deve essere fornita dall'utente.

## Pressoflessione N + Mzz e N + Mzz + Myy

Le verifiche implementate sono:

* `steel-beam-column-interaction-n-my`
* `steel-beam-column-interaction-n-my-mz`

Il dominio `N + Mzz` resta usato quando `Myy` e nullo:

```txt
NEd + Mzz,Ed
```

Quando `Myy` e significativo e il profilo e doppiamente simmetrico supportato, il dominio diventa:

```txt
NEd + Mzz,Ed + Myy,Ed
```

Restano non considerate:

* torsione;
* interazioni torsionali;
* instabilita torsionale non rappresentata dal modello LTB MVP.

Per sezioni di classe 1, 2 o 3 il controllo `N + Mzz` usa il Metodo B della Circolare:

```txt
NEd * gammaM1 / (chi_y * A * fyk)
  + kyy * Mzz,Ed * gammaM1 / (chiLT * Wzz * fyk) <= 1

NEd * gammaM1 / (chi_z * A * fyk)
  + kzy * Mzz,Ed * gammaM1 / (chiLT * Wzz * fyk) <= 1
```

Il controllo `N + Mzz + Myy` usa l'estensione biaxiale:

```txt
NEd * gammaM1 / (chi_y * A * fyk)
  + kyy * Mzz,Ed * gammaM1 / (chiLT * Wzz * fyk)
  + kyz * Myy,Ed * gammaM1 / (Wyy * fyk) <= 1

NEd * gammaM1 / (chi_z * A * fyk)
  + kzy * Mzz,Ed * gammaM1 / (chiLT * Wzz * fyk)
  + kzz * Myy,Ed * gammaM1 / (Wyy * fyk) <= 1
```

Dove:

* `chi_y` e `chi_z` arrivano dal modulo di instabilita a compressione;
* `chiLT` arriva dal modulo di instabilita flesso-torsionale, oppure vale `1` se la trave e dichiarata controventata;
* `Wzz` e `Wpl,zz` per classi 1-2 e `Wel,zz` per classe 3;
* `Wyy` e `Wpl,yy` per classi 1-2 e `Wel,yy` per classe 3;
* `kyy`, `kyz`, `kzy` e `kzz` sono i coefficienti di interazione del modello Metodo B MVP;
* i coefficienti di momento `alphaMy`, `alphaMz` e `alphaMLT` valgono `1.0` di default e sono configurabili.

Configurazione tipica:

```js
new SteelMemberVerification({
  stability: {
    compressionBuckling: {
      lengthY: 5,
      lengthZ: 5
    },
    lateralTorsionalBuckling: {
      unbracedLength: 2.5
    },
    beamColumnInteraction: {
      alphaMy: 1,
      alphaMz: 1,
      alphaMLT: 1
    }
  }
})
```

Per sezioni di classe 4 il check e bloccato, perche servono `Aeff` e `Weff`.
Per `UPN`, il motore mantiene le verifiche di sezione, classificazione, aste compresse e LTB con `Mcr` utente; l'interazione Method B automatica resta disabilitata salvo override esplicito o estensione dedicata per sezioni semplicemente simmetriche. Per `L`, `LU` e `T`, l'instabilita e l'interazione automatica restano protette per evitare di trascurare modi torsionali o flesso-torsionali.

## Verifica SLE

La verifica SLE implementata e:

* `steel-sle-deflection`

Il controllo usa la freccia massima FEM delle combinazioni SLE:

```txt
deltaMax <= L / limitRatio
```

Default:

* `limitRatio = 250`;
* modificabile tramite `deflectionLimitRatio` o `serviceability.deflection.limitRatio`.

Il check riporta:

* combinazione governante;
* stazione;
* luce;
* freccia massima;
* limite adottato.

## Report e frontend

Il report JSON espone ogni verifica nel formato comune:

```js
{
  id,
  description,
  demand,
  capacity,
  utilizationRatio,
  ok,
  metadata
}
```

I metadata dei checks acciaio includono grandezze utili per il frontend:

* `fyd`;
* `gammaM0`;
* `area`;
* `elasticSectionModulus`;
* `plasticSectionModulus`;
* `selectedSectionModulus`;
* `resistanceBasis`;
* `shearArea`;
* `axialStress`;
* `bendingStress`;
* `shearStress`;
* `equivalentStress`;
* `sectionClass`;
* `flangeClass`;
* `webClass`;
* `webAlpha`;
* `webPsi`;
* `nEd` e `mEd` nelle unita del modello di trave;
* `mzzEd` e `myyEd` nelle unita del modello di trave, coerenti con la convenzione SCA;
* `nEdSectionUnits` e `mEdSectionUnits` nelle unita interne della sezione;
* `mzzEdSectionUnits` e `myyEdSectionUnits` nelle unita interne della sezione;
* `resultId`;
* `station`;
* `combinationType`;
* `deflectionLimitRatio`;
* `criticalMoment`;
* `criticalMomentSource`;
* `relativeSlenderness`;
* `chiLT`;
* `chiY`, `chiZ`;
* `effectiveLengthY`, `effectiveLengthZ`;
* `lengthInferenceSource`;
* `kyy`, `kzy`;
* `equationY`, `equationZ`;
* `excludedActions`;
* `unbracedLength`;
* `segmentId`.

## Validazione automatica

I test coprono:

| Area | Test |
| --- | --- |
| Conversione rigidezza provider acciaio | `tests/steelBeamSectionProvider.test.js` |
| Classificazione locale I/H, UPN e famiglie estese | `tests/steelBeamSectionProvider.test.js` |
| Blocco prudente per classe 4 | `tests/steelBeamSectionProvider.test.js` |
| Resistenze da profilo, materiale e classe | `tests/steelBeamSectionProvider.test.js` |
| Instabilita flesso-torsionale I/H/RHS automatica, CHS esente e UPN con `Mcr` utente | `tests/steelBeamSectionProvider.test.js` |
| Instabilita aste compresse e interazioni `N + Mzz` / `N + Mzz + Myy` standalone | `tests/steelBeamSectionProvider.test.js` |
| Sezioni composte 2UPN e 2L come proprieta geometriche | `tests/steelCompoundProfileSection.test.js` |
| Report acciaio con checks di stabilita `LTB`, aste compresse e `N + Mzz` | `tests/singleBeamDesignApplication.test.js` |
| Verifica ULS da diagrammi FEM | `tests/steelBeamSectionProvider.test.js` |
| Verifica SLE freccia da diagrammi FEM | `tests/steelBeamSectionProvider.test.js` |
| Integrazione nei report di trave semplice | `tests/singleBeamDesignApplication.test.js` |

Comandi:

```bash
npm test
npm run example:beam-reports:write
```

## Limiti dichiarati

Restano fuori dal perimetro di questo MVP:

* torsione e interazioni torsionali;
* verifica `N + Mzz + Myy` automatica per profili non doppiamente simmetrici;
* verifica normativa completa delle sezioni composte `COMPOUND`;
* classificazione locale biaxiale raffinata oltre il criterio MVP;
* affinamento dei coefficienti LTB per diagrammi di momento e vincoli laterali specifici;
* influenza del taglio sulla resistenza a flessione;
* imbozzamento locale;
* affinamento di vincoli laterali, lunghezze libere e coefficienti di vincolo oltre l'MVP;
* proprieta efficaci per sezioni di classe 4.

Questi punti richiedono input e assunzioni specifiche, quindi vanno discussi prima dell'implementazione.

## Riferimenti

* Gazzetta Ufficiale, D.M. 17 gennaio 2018, Aggiornamento delle Norme tecniche per le costruzioni: https://www.gazzettaufficiale.it/eli/id/2018/02/20/18A00716/sg
* Circolare 21 gennaio 2019 n. 7, istruzioni per l'applicazione delle NTC 2018, paragrafi C4.2.4.1.3.1-C4.2.4.1.3.3.
