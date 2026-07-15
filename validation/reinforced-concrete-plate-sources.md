# Fonti di validazione per piastre in calcestruzzo armato

## Trasformazione delle risultanti

Le trasformazioni sono verificate contro la moltiplicazione matriciale
indipendente `M' = R^T M R` e `Q' = R^T Q`. La campagna controlla rotazione
nulla, rotazione di 90 gradi, annullamento della torsione negli assi principali,
traccia e determinante del tensore e norma del vettore di taglio.

## Wood-Armer

Riferimento metodologico primario:

- R. H. Wood, *The reinforcement of slabs in accordance with a pre-determined
  field of moments*, Building Research Station, Current Paper CP44/68, 1968.
- G. S. T. Armer, corrispondenza sul metodo, *Concrete*, 1968, pp. 69-76.

L'implementazione adotta esplicitamente l'inviluppo conservativo per maglia
ortogonale:

```text
Mxb = max(0, Mxx + |Mxy|)
Myb = max(0, Myy + |Mxy|)
Mxt = min(0, Mxx - |Mxy|)
Myt = min(0, Myy - |Mxy|)
```

Non vengono implementate varianti ottimizzate che ridistribuiscono la domanda
tra le due direzioni. I casi manuali proteggono momento diretto senza torsione e
torsione pura su entrambe le facce.

## Kernel sezionali e normativi riusati

Le resistenze non sono replicate nella campagna piastre. Restano validate dai
casi già dichiarati in `reinforced-concrete-sources.md` per:

- solver sezionali SLU/SLE con percorso uniaxiale a strisce rettangolari e
  compatibilità delle deformazioni;
- taglio senza armatura trasversale NTC 2018 4.1.2.3.5.1;
- tensioni SLE NTC 2018 4.1.2.2.5;
- fessurazione indiretta, Circolare 2019 C4.1.2.2;
- controllo semplificato di deformabilità, Circolare 2019 tabella C4.1.I.

Per il controllo `flat_slab`, la campagna calcola indipendentemente le aree
`n * pi * phi^2 / 4`, le altezze utili e il `rho_l` di ogni faccia e direzione.
Il limite vale 24 per `rho_l <= 0,5%`, 17 per `rho_l >= 1,5%` ed è interpolato
linearmente nell'intervallo. Per X e Y governa separatamente il limite minore
tra estradosso e intradosso. Il caso di validazione ricade intenzionalmente nel
ramo interpolato.

## Taglio unidirezionale con maglia di S verticali

Il caso `rc-plate-vertical-s-links-shear` usa una maglia di S `phi 8` con
passi `150 x 200 mm`. Per la striscia unitaria il riferimento indipendente è:

```text
A_link = pi 8^2 / 4
Asw/s = 1000 A_link / (150 * 200) = 1,675516082 mm2/mm
```

La campagna conserva e confronta sia la resistenza NTC 2018 4.1.2.3.5.1 senza
armatura trasversale sia il traliccio NTC 2018 4.1.2.3.5.2, verificando il
meccanismo selezionato in X e Y. L'input dichiara implicitamente S verticali a
un ramo efficace e correttamente ancorate; non costituisce una verifica
geometrica dei ganci.
