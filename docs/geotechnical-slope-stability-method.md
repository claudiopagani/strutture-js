# Stabilità dei pendii 2D — metodo, contratti e limiti

## 1. Stato e scopo

La microapp `geotechnical-slope-stability` implementa il primo workflow di
equilibrio limite per pendii in `strutture-js`. Il perimetro operativo è:

- sezione bidimensionale in deformazione piana, di larghezza unitaria;
- superficie di scorrimento circolare assegnata oppure ricerca circolare
  vincolata;
- analisi statica e pseudostatica;
- metodo di Spencer con equilibrio delle forze e dei momenti, statico e
  pseudostatico;
- metodo di Bishop semplificato come default statico;
- metodo ordinario delle strisce, o Fellenius, come confronto statico
  diagnostico;
- resistenza drenata di Mohr-Coulomb in tensioni efficaci;
- resistenza non drenata in tensioni totali con `phi_u = 0` e `c_u = su`;
- terreni eterogenei descritti dalle zone di `GroundSection2D`;
- pressione interstiziale assegnata mediante `PorePressureField2D`;
- sovraccarichi verticali uniformi su intervalli della superficie;
- tiranti attivi cementati rettilinei, importati da un risultato verificato o
  assegnati mediante un contratto esplicito, con forza piena o proporzionale
  alla posizione della superficie rispetto al bulbo.

Il workflow non è una verifica normativa e non sceglie coefficienti parziali,
combinazioni o valori di progetto. Queste scelte devono essere costruite da un
adapter normativo e registrate in `GeotechnicalDesignSituation` prima del
calcolo.

## 2. Fonti tecniche

La fonte primaria è
[USACE EM 1110-2-1902, Slope Stability (2003)](https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-1902.pdf):

- Appendice C, equazione C-12 per il metodo ordinario delle strisce;
- Appendice C, equazioni C-15 e C-16 per Bishop semplificato;
- Appendice F per segni, costruzione delle strisce, pesi, proprietà alla base
  e procedura iterativa;
- capitolo 4 per ricerca, minimi locali e verifica dei risultati.

Come controllo convergente della formulazione è consultabile anche
[FHWA GEC 7, Soil Nail Walls — Reference Manual](https://www.fhwa.dot.gov/engineering/geotech/pubs/nhi17068.pdf),
nelle sezioni dedicate all'equilibrio limite e al metodo di Bishop.

Per Spencer sono fonti primarie:

- [Spencer (1967), *A method of analysis of the stability of embankments
  assuming parallel inter-slice forces*](https://doi.org/10.1680/geot.1967.17.1.11);
- [USBR Design Standards No. 13, Chapter 4 (2011), Appendix B](https://www.usbr.gov/tsc/techreferences/designstandards-datacollectionguides/finalds-pdfs/DS13-4.pdf),
  che espone la ricorrenza delle forze interstriscia e l'inclusione delle
  azioni esterne.

Per l'interazione con i tiranti la fonte primaria è
[FHWA GEC 4, *Ground Anchors and Anchored Systems*, sezione 5.8.3.2](https://www.fhwa.dot.gov/engineering/geotech/pubs/if99015.pdf).
Per pareti con più ordini richiede superfici dietro ciascun ordine e distingue
la forza intera, quando la superficie passa davanti al bulbo, dalla quota
proporzionale di forza quando la superficie attraversa il bulbo. Il modello
implementato adotta l'ipotesi FHWA di tensione di aderenza uniforme.

USACE dichiara che Bishop semplificato soddisfa l'equilibrio verticale delle
singole strisce e l'equilibrio globale dei momenti, ma non l'equilibrio
orizzontale. Lo limita alle superfici circolari e raccomanda un metodo che
soddisfi tutte le condizioni di equilibrio, come Spencer, per il controllo
finale delle opere maggiori. Per questo il ramo pseudostatico usa solo Spencer;
la limitazione di Bishop è parte del risultato, non una nota nascosta.

## 3. Convenzioni e unità

Le coordinate sono `(x, z)`, con `x` orizzontale verso destra e `z` verticale
verso l'alto. La direzione di movimento è esplicita:

- `left-to-right`;
- `right-to-left`.

L'angolo `alpha` della base di una striscia è positivo quando la base scende
nella direzione di movimento. Di conseguenza `W sin(alpha)` è positivo per un
contributo motore e può essere negativo sul tratto opposto della circonferenza.

L'inerzia orizzontale pseudostatica è positiva nella direzione di movimento.
Il segno verticale segue la convenzione dichiarata da
`GeotechnicalDesignSituation`:
`positive-kv-reduces-effective-gravity-through-factor-1-minus-kv`. Quindi un
`kv` positivo riduce la componente verticale del peso; un `kv` negativo la
aumenta.

Le unità interne geotecniche sono:

| Grandezza | Unità interna |
| --- | --- |
| lunghezza | m |
| forza per larghezza fuori piano | kN/m |
| tensione e pressione | kN/m² |
| peso di volume | kN/m³ |
| angolo | rad |
| fattore di sicurezza | adimensionale |

Ogni costruttore pubblico richiede un sistema di unità esplicito. I risultati
restano serializzabili e dichiarano le unità in `metadata.units`.

## 4. Superficie circolare

`CircularSlipSurface2D` rappresenta il ramo inferiore di una circonferenza. Può
essere costruita assegnando centro e raggio oppure mediante:

```js
CircularSlipSurface2D.fromChordAndSagitta({
  entry,
  exit,
  sagitta,
  movementDirection,
  units,
});
```

La saetta è misurata perpendicolarmente alla corda verso la massa inferiore.
Nel modello iniziale deve essere positiva e minore della metà della lunghezza
della corda. I due estremi devono appartenere alla superficie del terreno e
l'arco deve restare sotto di essa nell'intervallo analizzato.

Lo schema serializzato è `circular-slip-surface-2d/v1`. La geometria espone
quota inferiore, inclinazione della tangente e intersezioni con segmenti o
polilinee. Queste query appartengono al dominio e potranno essere riutilizzate
da muri, paratie e confronti FEM, senza dipendere dalla microapp.

## 5. Costruzione delle strisce

`SlopeSliceDiscretizer2D` separa la geometria dall'equilibrio. L'intervallo tra
ingresso e uscita viene inizialmente diviso in `sliceCount` parti e arricchito
con frontiere in corrispondenza di:

- vertici della superficie;
- ascisse dei vertici delle zone di materiale;
- intersezioni fra base circolare e confini di materiale;
- estremi dei sovraccarichi.

Il numero effettivo di strisce può quindi superare quello richiesto. Una
striscia quasi nulla viene eliminata; una massa con vuoti, sovrapposizioni
ambigue alla base o altezza non positiva è rifiutata.

### 5.1 Area e peso

Area e peso sono integrati con quadratura di Gauss-Legendre a cinque punti in
ogni striscia. A ciascuna ascissa di quadratura la verticale è suddivisa nelle
zone attraversate e i contributi sono sommati. Il risultato conserva:

- area;
- peso proprio totale;
- baricentro del peso proprio;
- peso suddiviso per materiale;
- peso verticale modificato da `kv`, inerzia orizzontale `kh W`, carico
  superficiale e carico verticale totale;
- braccio della base e momento motore rispetto al centro della circonferenza.

Per campi `hydrostatic-horizontal` e `phreatic-line`, il peso saturo è usato
sotto il livello d'acqua se il materiale lo definisce; sopra viene usato il
peso di volume `bulk`. Una griglia di pressioni assegnate non identifica da
sola una superficie di saturazione: in quel caso il peso non viene modificato
implicitamente.

### 5.2 Resistenza alla base

Conformemente all'Appendice F di USACE, la resistenza è quella del materiale
immediatamente sopra il punto medio della base, non una media dei materiali
contenuti nella striscia. Il set è risolto tramite
`GeotechnicalDesignSituation`, conservando zona, materiale, set, base,
drenaggio e fonte della selezione.

Per una base drenata:

```text
tau_f = c' + sigma'_n tan(phi')
```

Per una base non drenata:

```text
tau_f = su
phi_u = 0
```

Nel secondo caso la formulazione è in tensioni totali: la pressione
interstiziale non viene sottratta una seconda volta.

### 5.3 Pressione interstiziale

Nel caso drenato `u` è campionata al punto medio della base mediante il campo
selezionato dalla situazione di progetto. Il valore è una pressione, non un
rapporto `ru`. La risultante sulla base è `u l`, con `l` lunghezza della base.

Pressioni negative non sono accettate perché il primo modello non attribuisce
resistenza alla suzione. Acqua esterna sopra il piano campagna è rifiutata:
richiederebbe le forze idrostatiche esterne e i relativi momenti, che non sono
ancora implementati.

## 6. Metodo ordinario delle strisce

Per ogni striscia, in assenza di forze esterne diverse dai carichi verticali,
la forma implementata dell'equazione USACE C-12 è:

```text
N'i = Vi cos(alpha_i) - ui li cos²(alpha_i)

F_OMS = sum[c_i li + N'i tan(phi_i)]
        / sum[Vi sin(alpha_i)]
```

dove `Vi` comprende peso proprio e sovraccarico verticale, `li` è la lunghezza
della base e `ui = 0` per una striscia in tensioni totali. La formulazione
trascura le forze interstriscia e soddisfa soltanto l'equilibrio globale dei
momenti. È sempre calcolata e riportata come controllo, anche quando il metodo
statico selezionato è Bishop o Spencer. Non è estesa al ramo pseudostatico.

Una forza normale efficace negativa è considerata non ammissibile: fessure di
trazione e separazione non vengono introdotte automaticamente.

## 7. Metodo di Bishop semplificato

Senza acqua esterna, la forma implementata delle equazioni USACE C-15/C-16 è:

```text
m_alpha_i = cos(alpha_i)
            + sin(alpha_i) tan(phi_i) / F

F = sum[(c_i b_i + (Vi - ui li) tan(phi_i)) / m_alpha_i]
    / sum[Vi sin(alpha_i)]
```

`bi` è la larghezza orizzontale. Il fattore compare in `m_alpha` e viene
risolto iterativamente. L'avvio usa il fattore OMS, salvo un valore iniziale
esplicito. Sono configurabili tolleranza e numero massimo di iterazioni; una
mancata convergenza non produce un risultato apparentemente valido.

Il solver restituisce per ogni striscia il termine motore, `m_alpha`, la forza
di pressione sulla base, i termini coesivo e attritivo e la resistenza
corretta. Questo dettaglio serve al controllo manuale e alla futura diagnostica
grafica dei consumer.

## 8. Metodo di Spencer

Spencer assume che tutte le risultanti interstriscia siano parallele, con una
stessa inclinazione `theta` incognita. Il solver determina simultaneamente
`F` e `theta` imponendo la chiusura delle forze interstriscia e del momento
globale. Con le convenzioni di questo modulo, per ogni striscia:

```text
Di  = Vi sin(alpha_i) + Hi cos(alpha_i)
N0i = Vi cos(alpha_i) - Hi sin(alpha_i)
Ui  = ui li
qi  = theta - alpha_i

DeltaZi = [ci li/F - Di + (N0i - Ui) tan(phi_i)/F]
           / [cos(qi) - sin(qi) tan(phi_i)/F]

Zi = Z(i-1) + DeltaZi
Ni = N0i + DeltaZi sin(qi)
Ti = [ci li + (Ni - Ui) tan(phi_i)] / F
```

`Z0 = 0` sul primo bordo e la prima equazione globale richiede `Zn = 0`
sull'ultimo. La seconda richiede che la somma dei momenti resistenti `Ti ri`
eguagli il momento motore delle azioni esterne rispetto al centro della
circonferenza. `ri` è il braccio del punto medio della corda di base. Peso e
azioni sono applicati ai rispettivi punti di integrazione; le forze interne si
elidono nel momento globale.

La coppia non lineare è risolta con Newton numerico smorzato, ricerca lineare
e avvii deterministici di riserva. La soluzione è accettata soltanto se:

- `F > 0` e `|theta|` resta nel limite configurato;
- i residui normalizzati di forza e momento soddisfano la tolleranza;
- il residuo locale di taglio è compatibile con la tolleranza;
- nessuna striscia sviluppa forza normale efficace di trazione.

L'ultimo controllo è deliberato: il kernel non elimina la resistenza di una
porzione in trazione e non crea automaticamente una fessura asciutta o piena
d'acqua. In quel caso l'analisi Spencer restituisce `not-supported`; in una
analisi statica Bishop può ancora essere restituito insieme a un warning che
Spencer non è ammissibile per quella discretizzazione.

Il dettaglio espone `intersliceForceInclination`, numero di iterazioni e avvii,
residui globali, normali, tagli mobilitati e forze interstriscia per ogni
striscia. Il modello rispetta equilibrio delle forze e momento globale, ma non
ricostruisce una distribuzione indipendente delle quote di applicazione delle
forze interstriscia.

Spencer accetta inoltre `externalPointLoads` firmati per striscia. Per ogni
azione conserva componente orizzontale nella direzione di movimento,
componente verticale positiva verso il basso e momento motore rispetto al
centro della circonferenza. Il tirante usa questo contratto nel punto in cui il
suo asse interseca la superficie: la forza non è aggiunta come termine
empirico al numeratore, ma entra sia nell'equilibrio locale delle forze sia
nell'equilibrio globale dei momenti.

## 9. Azione pseudostatica

Il sisma è rappresentato come azione statica equivalente. Per il peso proprio
integrato non modificato `Wi` e per il sovraccarico verticale statico `Qi`:

```text
Vi = (1 - kv) Wi + Qi
Hi = kh Wi
```

`Hi` agisce nella direzione di movimento scelta. Il momento motore è calcolato
con `Vi` al baricentro del peso, `Qi` al centro del tratto caricato e `Hi` al
baricentro del peso. La pressione interstiziale assegnata non viene modificata
implicitamente. L'inerzia del sovraccarico non è inclusa; se necessaria dovrà
essere introdotta da un futuro contratto di massa/carico più generale.

`kh` e `kv` provengono da `GeotechnicalDesignSituation`. Il solver non li
calcola da accelerazione, categoria di sottosuolo, norma o prestazione: questo
compito appartiene a un adapter normativo. L'unica convenzione verticale oggi
accettata è
`positive-kv-reduces-effective-gravity-through-factor-1-minus-kv`.

Nel ramo pseudostatico il metodo omesso viene risolto come `spencer`. Una
richiesta esplicita di `bishop-simplified` o
`ordinary-method-of-slices` restituisce `not-supported`, perché i due kernel
statici non soddisfano il sistema di equilibrio richiesto dalla forza
orizzontale.

Questo risultato non è un'analisi dinamica e non stima accelerazioni nel tempo,
deformazioni cicliche, degradazione di resistenza o spostamenti permanenti
tipo Newmark. Il coefficiente di sicurezza pseudostatico è quindi una misura
di equilibrio sotto azioni equivalenti assegnate, non una previsione di danno
o movimento.

## 10. Sovraccarichi

`SlopeSurfaceSurcharge2D` rappresenta un'intensità uniforme, verticale verso il
basso, applicata alla proiezione orizzontale compresa tra `minimumX` e
`maximumX`. La forza sulla striscia è:

```text
Qi = q * lunghezza(intersezione orizzontale)
```

e viene sommata al peso in `Vi`. Le azioni dei tiranti sono invece carichi
puntuali inclinati costruiti da `GroundAnchorStabilityAction2D`; gli altri
carichi concentrati o inclinati, gli altri rinforzi e le pressioni su una
superficie immersa richiedono contratti distinti e non sono simulati con
`SlopeSurfaceSurcharge2D`.

Lo schema serializzato è `slope-surface-surcharge-2d/v1`.

### 10.1 Tiranti che intersecano la superficie

`GroundAnchorStabilityAction2D` è il contratto serializzabile
`ground-anchor-stability-action-2d/v1`. Contiene testata, inizio e fine del
bulbo, forza di progetto del singolo tirante, interasse orizzontale, stato
della verifica sorgente e provenienza. Il metodo
`fromGroundAnchorResult(result)` consuma direttamente il risultato della
microapp dei tiranti; una sorgente con status diverso da `ok` non può essere
accreditata e produce `not-verified`.

Indicando con `s` la distanza dell'intersezione dalla testata, `Lf` la
lunghezza libera, `Lb` la lunghezza del bulbo e `Td` la forza di progetto:

```text
s <= Lf       : eta = 1
Lf < s < Lf+Lb: eta = (Lf + Lb - s) / Lb
s >= Lf+Lb    : eta = 0
Tmob          = eta Td
tmob          = Tmob / interasse
```

Se l'intero tirante resta nella massa mobile, la superficie è dietro il bulbo
e il contributo è nullo. Una doppia intersezione dell'asse con la stessa
superficie circolare è `not-supported`, perché il modello FHWA a singolo
attraversamento non è applicabile. Un tirante che non si oppone alla direzione
di movimento selezionata viene rifiutato invece di essere accreditato.

La forza di progetto è quella del risultato locale verificato, non la sola
forza di bloccaggio. La testata, il corrente, la parete e la compatibilità di
deformazione restano verifiche separate. In presenza di almeno un tirante il
metodo è obbligatoriamente `spencer`; Bishop e Fellenius non sono calcolati.

## 11. Analisi assegnata e ricerca critica

`CircularSlopeStabilityAnalysis` offre due modalità:

- `assigned-surface`: verifica una `CircularSlipSurface2D` assegnata;
- `critical-surface-search`: cerca il minimo nel dominio indicato.

La ricerca usa una griglia sui tre parametri:

- ascissa di ingresso;
- ascissa di uscita;
- saetta.

Segue un raffinamento locale deterministico attorno al miglior candidato. Ogni
intervallo ha minimo, massimo e numero di campioni; sono inoltre configurabili
numero di raffinamenti, tolleranza geometrica, luce minima e numero di
candidati conservati.

Il risultato di ricerca include conteggi di candidati valutati, validi e
rifiutati, motivi di rifiuto, passo finale e migliori alternative. Il dominio
è deliberatamente finito: il minimo ottenuto è il minimo trovato nel dominio,
non una garanzia matematica di minimo globale. USACE avverte che ricerche con
un solo punto iniziale possono fermarsi in minimi locali; il consumer deve
esplorare domini indipendenti e controllare le superfici trattenute.

Con tiranti, ogni candidato conserva la relazione `in-front-of-bond-zone`,
`through-bond-zone`, `behind-bond-zone` o `no-axis-crossing`. Il campo
`search.groundAnchorCoverage` raggruppa per tirante il numero di candidati e il
minimo fattore trovato per ogni relazione.
`search.groundAnchorVerificationFamilies` controlla inoltre che il dominio
contenga almeno una superficie dietro ciascun ordine e almeno una superficie
esterna all'intero sistema. Se una famiglia manca, il suo status è
`not-analyzed` e viene emesso un warning: le coordinate del dominio restano un
input esplicito e devono essere impostate indipendentemente dietro ciascun
ordine, come richiesto dalla fonte FHWA.

## 12. Contratto del risultato

La microapp restituisce un `CalculationResult`. Quando `status` è `ok`, gli
output principali sono:

```text
factorOfSafety
criticalSurface
discretization.slices[]
methods.bishop-simplified
methods.ordinary-method-of-slices
methods.spencer
comparison
search
surfaceSurcharges
groundAnchors
```

Il risultato conserva inoltre `warnings`, `assumptions` e `metadata`, inclusi
fonte metodologica, unità e situazione di progetto serializzata.

Gli stati hanno significati distinti:

- `ok`: problema risolto nel campo implementato;
- `not-supported`: metodo, geometria o stato fisico incompatibile con il
  modello circolare disponibile, inclusa la trazione normale senza un modello
  di fessura;
- `failed`: errore di contratto o input non costruibile.

Gli schemi del dettaglio numerico sono
`slope-slice-discretization-2d/v1` e
`circular-slope-stability-result/v1`.

## 13. Limiti espliciti

Non sono implementati:

- superfici non circolari, spezzate o composite;
- acqua esterna, invaso e rapido svaso;
- fessure di trazione asciutte o riempite d'acqua;
- suzione e resistenza dei terreni insaturi;
- carichi concentrati o inclinati;
- chiodature, geosintetici, pali stabilizzanti, rinforzi diversi dai tiranti
  rettilinei cementati e opere strutturali;
- legge non uniforme di trasferimento del carico lungo il bulbo, interazione
  tridimensionale del gruppo e compatibilità non lineare tirante-terreno;
- resistenza anisotropa, variabile in modo continuo o dipendente dallo stato;
- analisi probabilistica e 3D;
- risposta dinamica, degradazione ciclica e spostamenti permanenti;
- inerzia associata ai sovraccarichi superficiali;
- filtrazione, consolidazione e accoppiamento idromeccanico;
- fattori parziali e verifiche normative automatiche.

Il ramo sismico usa Spencer proprio perché USACE evidenzia il limite di Bishop
semplificato quando si introduce una forza orizzontale. Non viene quindi
estesa formalmente una formula statica fuori dal proprio equilibrio.

## 14. Validazione e test

I test automatici coprono:

- geometria e serializzazione della circonferenza;
- conversione delle unità;
- equazioni OMS e Bishop con aritmetica indipendente;
- limite non drenato con `phi_u = 0`;
- pendio omogeneo drenato e non drenato;
- falda, peso saturo e pressione alla base;
- sovraccarico;
- zone stratificate e set di parametri differenti;
- ricerca deterministica e diagnostica dei candidati;
- Spencer statico, convergenza e residui di equilibrio;
- intersezione tirante-superficie, forza piena, proporzionale e nulla;
- rifiuto di sorgenti non verificate, direzione non resistente e doppia
  intersezione;
- ricerca con copertura delle relazioni superficie-bulbo;
- assemblaggio pseudostatico `kh/kv` e rifiuto dei metodi statici;
- wrapper applicativo ed export pubblici.

`validation/geotechnicalSlopeStabilityValidationCampaign.js` aggiunge sette
controlli indipendenti:

1. valutazione numerica separata delle equazioni C-12, C-15 e C-16;
2. confronto fra area/peso discretizzati e formula esatta del segmento
   circolare;
3. identità OMS/Bishop nel caso limite in tensioni totali con `phi_u = 0` e
   geometria di base compatibile;
4. chiusura analitica del fattore e dell'inclinazione interstriscia di Spencer
   in un caso statico con `phi = 0`;
5. la stessa chiusura con inerzia orizzontale pseudostatica e controllo dei
   residui locali.
6. intersezione analitica linea-circonferenza e rapporti FHWA di forza piena,
   proporzionale e nulla;
7. chiusura analitica di Spencer nel limite `phi = 0` con una forza puntuale
   resistente e relativo momento.

Il benchmark completo di un pendio pubblicato, incluse geometria e tabelle
delle strisce, rimane un ampliamento necessario della campagna prima di usare
il kernel come unico controllo per un'opera maggiore.

## 15. Ponte verso struttura e FEM

Questa microapp non crea elementi FEM, ma prepara contratti riusabili:

- `GroundSection2D` e `PorePressureField2D` restano la sorgente comune di
  geometria e stato idraulico;
- i risultati verificati dei tiranti possono essere consumati direttamente e
  mobilitati superficie per superficie; muri, paratie, fondazioni e altri
  rinforzi richiedono ancora i rispettivi contratti;
- strisce e contributi forniscono un controllo globale indipendente;
- il FEM continuo potrà riusare materiali, selezione dei parametri e campo
  idraulico, ma non le strisce come elementi;
- il confronto futuro naturale è la riduzione della resistenza al taglio del
  continuo, con mesh e stato geostatico propri.

Per includere un'opera non basta aggiungere il suo peso come sovraccarico: sono
necessari geometria, contatto, forze interne e cinematica coerenti. L'estensione
sarà quindi composta nell'applicazione dell'opera, mantenendo separato il
kernel di pendio.

## 16. Esempio eseguibile

L'esempio pubblico è `examples/geotechnical-slope-stability.js` e può essere
eseguito con:

```bash
npm run example:geotechnical-slope
```

Usa soltanto gli entry point esportati dal package e mostra una ricerca
circolare statica vincolata con falda e sovraccarico al coronamento, seguita da
una superficie assegnata pseudostatica risolta con Spencer.
