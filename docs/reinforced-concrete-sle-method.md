# Metodo SLE per travi in c.a.

Questo documento descrive il metodo implementato per le verifiche agli stati limite di esercizio delle travi in calcestruzzo armato.
Il motore e pensato per funzionare sia come verifica standalone di sezione sia come modulo integrato nel workflow di trave semplice e nei futuri input React/API.

## Perimetro

Il primo perimetro chiuso copre:

* tensioni di esercizio nel calcestruzzo e nelle armature;
* fessurazione indiretta tramite diametro massimo e spaziatura massima delle barre tese;
* deformazione SLE tramite integrazione delle curvature;
* confronto semplificato sulla snellezza della trave;
* sezioni rettangolari e a T con layout automatico delle armature top/bottom;
* sezioni generiche solo con gruppi di armatura espliciti.

I riferimenti normativi dichiarati nel codice sono NTC 2018 4.1.2.2.5 per le tensioni, Circolare 2019 C4.1.2.2 per fessurazione e deformazioni, tabelle C4.1.II e C4.1.III per il controllo indiretto della fessurazione.

## Contratto dati

Le armature longitudinali ordinarie possono essere generate cosi:

```js
const reinforcementLayout = createLongitudinalReinforcementLayout({
  section: concreteSection,
  material: reinforcementMaterial,
  units: { force: "N", length: "mm" },
  bottom: {
    id: "bottom-main",
    diameter: 20,
    count: 2,
    cover: 40,
  },
  top: {
    id: "top-main",
    diameter: 20,
    count: 2,
    cover: 40,
  },
  additionalBars: [],
  groups: [],
});
```

Per sezioni rettangolari il layer inferiore e superiore usa la larghezza della sezione.
Per sezioni a T il layer inferiore usa la larghezza dell'anima, centrata nella larghezza totale, mentre il layer superiore usa la larghezza della flangia.

Il layout produce:

* `reinforcementBars`: barre discrete con coordinate `y/z`;
* `longitudinalReinforcementGroups`: gruppi con `face = "bottom"` o `face = "top"`, `barIds`, diametro, numero, copriferro e area totale;
* metadata serializzabili, riusabili da taglio, fessurazione, report e frontend.

Per sezioni poligonali o definite per punti non viene dedotto automaticamente quale armatura sia superiore o inferiore.
In questi casi l'utente deve fornire gruppi espliciti; se mancano, la fessurazione risulta `not-verified`.

## Tensioni SLE

Classe principale:

* `ReinforcedConcreteServiceabilityVerification`

Il solve di sezione usa:

* calcestruzzo lineare senza trazione;
* acciaio elastico lineare;
* metodo del coefficiente di omogeneizzazione `n`;
* `n = 15` di default, modificabile da input;
* equilibrio su `N`, `Mx`, `My` tramite `RCServiceStressSolver`;
* fallback automatici di curvatura iniziale per migliorare la convergenza con momento positivo o negativo.

Limiti implementati:

* calcestruzzo in combinazione rara/caratteristica: `sigma_c <= 0.60 fck`;
* calcestruzzo in combinazione quasi permanente: `sigma_c <= 0.45 fck`;
* acciaio in combinazione rara/caratteristica: `sigma_s <= 0.80 fyk`.

Output principali:

* `concreteCompression`;
* `steelStress`;
* `strainField`;
* check `rc-sle-concrete-stress`;
* check `rc-sle-steel-stress`.

## Fessurazione indiretta

La fessurazione usa le tabelle della Circolare per armature ordinarie poco sensibili.
La sensibilita e impostata a `low` di default; altri valori generano warning perche non sono ancora supportati come workflow completo.

Mappatura implementata:

| Ambiente | Combinazione frequente | Combinazione quasi permanente |
| --- | --- | --- |
| `ordinary` | `w3` | `w2` |
| `aggressive` | `w2` | `w1` |
| `very_aggressive` | `w1` | `w1` |

Il controllo usa:

* tensione della barra tesa `sigma_s`;
* diametro barra;
* spaziatura locale tra barre della stessa fila, con `rowTolerance = 50 mm` di default;
* tabella C4.1.II per diametro massimo;
* tabella C4.1.III per spaziatura massima.

La scelta del gruppo teso segue il segno del momento nella convenzione del modulo:

* `mEd >= 0`: gruppo `bottom`;
* `mEd < 0`: gruppo `top`.

Output principali:

* `crackWidthClass`;
* `crackControlGroupId`;
* `crackControlFace`;
* `crackControlComplete`;
* `tensileBars`;
* check `rc-sle-crack-bar-diameter`;
* check `rc-sle-crack-bar-spacing`.

## Deformazione

Classe principale:

* `CrackedSectionDeflectionAnalysis`

Il workflow usa i risultati FEM delle combinazioni SLE:

1. campiona le azioni interne `N(x)` e `M(x)`;
2. calcola il momento di fessurazione `Mcr` con `fctm` e modulo elastico della sezione;
3. sotto `Mcr` usa curvatura non fessurata con inerzia omogeneizzata;
4. sopra `Mcr` risolve la sezione parzializzata senza cls teso;
5. applica un modello MVP di tension stiffening:

```txt
zeta = max(0, 1 - beta * (Mcr / M)^2)
curvatura_media = zeta * curvatura_fessurata + (1 - zeta) * curvatura_non_fessurata
```

Valori default:

* `betaShortTerm = 1.0`;
* `betaLongTerm = 0.5`;
* `phi = 2.0` per combinazioni quasi permanenti;
* `phi = 0` per rare/frequenti;
* ritiro escluso;
* limite freccia `L/250`, modificabile.

La viscosita entra tramite modulo efficace:

```txt
Ec,eff = Ec / (1 + phi)
```

L'integrazione delle curvature e trapezoidale. Per travi con due appoggi verticali viene applicata una correzione lineare per imporre freccia nulla agli appoggi estremi.

Output principali:

* `combinations`;
* `points`;
* `mcr`;
* `zeta`;
* `curvature`;
* `maxAbsDeflection`;
* check `rc-sle-deflection-curvature`.

## Snellezza semplificata

La verifica semplificata e un controllo di screening, non sostituisce la freccia calcolata.

Check:

* `rc-sle-deflection-slenderness`

Default:

* sistema `simple_span`;
* livello tensionale `low`;
* limite `L/h <= 20`.

Il valore puo essere configurato tramite:

```js
serviceability: {
  deflection: {
    slendernessSystem: "simple_span",
    slendernessStressLevel: "low",
  },
}
```

## Validazione automatica

I test coprono:

| Area | Test |
| --- | --- |
| Limiti tensioni SLE | `tests/reinforcedConcreteServiceabilityVerification.test.js` |
| Tabelle fessurazione e classi `w1/w2/w3` | `tests/reinforcedConcreteServiceabilityVerification.test.js` |
| Scelta gruppo top/bottom in funzione del segno del momento | `tests/reinforcedConcreteServiceabilityVerification.test.js` |
| Obbligo gruppi espliciti per sezioni generiche | `tests/reinforcedConcreteServiceabilityVerification.test.js` |
| Layout armature rettangolari e a T | `tests/longitudinalReinforcementLayout.test.js` |
| Integrazione curvature e viscosita configurabile | `tests/rcCrackedDeflectionAnalysis.test.js` |
| Integrazione nella verifica di trave e nei report | `tests/singleBeamDesignApplication.test.js` |

Comandi:

```bash
npm test
npm run example:beam-reports:write
```

## Report e frontend

Il report JSON espone dati serializzabili:

* metadata del metodo;
* assunzioni adottate;
* warnings;
* checks con `id`, `demand`, `capacity`, `utilizationRatio`, `ok`;
* gruppi e barre delle armature;
* risultati SLE puntuali e globali.

Il frontend React dovra trattare questi oggetti come DTO:

* selettori per ambiente, combinazione, `n`, `phi`, limite freccia;
* editor top/bottom per rettangolari e T;
* editor avanzato dei gruppi per sezioni generiche;
* visualizzazione tabellare dei checks;
* diagrammi e punti di curvatura/freccia dai dati JSON, non da immagini precalcolate.

## Limiti dichiarati

Restano fuori dal perimetro chiuso:

* ritiro;
* storia di carico completa con separazione rigorosa delle quote istantanee e differite;
* effetti reologici avanzati oltre `phi` globale;
* ampiezza di fessura calcolata direttamente con modello meccanico;
* redistribuzione FEM iterativa della rigidezza fessurata;
* minimi costruttivi, interferro, ancoraggi e dettagli locali;
* torsione e interazioni avanzate;
* validazione estesa su casi continui, mensole e sezioni speciali.

Questi punti sono volutamente mantenuti come evoluzioni successive, non come assunzioni nascoste.

## Riferimenti

* Gazzetta Ufficiale, D.M. 17 gennaio 2018, Aggiornamento delle Norme tecniche per le costruzioni: https://www.gazzettaufficiale.it/eli/id/2018/02/20/18A00716/sg
* Gazzetta Ufficiale, Circolare 21 gennaio 2019, n. 7 C.S.LL.PP.: https://www.gazzettaufficiale.it/eli/id/2019/02/11/19A00855/sg
