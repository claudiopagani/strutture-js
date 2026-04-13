# Classi strutturali

Base code OOP in JavaScript per costruire una codebase condivisa dedicata al calcolo strutturale.

## Obiettivi

- organizzare il dominio strutturale in classi riusabili;
- separare materiali, geometria, elementi, vincoli e carichi;
- introdurre un livello architetturale stabile per ospitare applicazioni verticali di calcolo e verifica;
- distinguere materiali nuovi e materiali esistenti;
- includere un modello estendibile per la muratura esistente con coefficienti correttivi e di miglioramento in ottica NTC 2018;
- preparare una base solida per futuri moduli di analisi, verifiche e normativa.

## Struttura

- `src/core`: contratti comuni per applicazioni, codici normativi e risultati di calcolo/verifica;
- `src/applications`: moduli verticali per singole applicazioni strutturali;
- `src/config`: cataloghi e manifesti ad alto livello del package;
- `src/domain/materials`: materiali generici, nuovi ed esistenti;
- `src/domain/geometry`: nodi e sezioni, incluse geometrie parametriche e poligonali;
- `src/domain/composite`: componenti e sezioni composte omogeneizzate;
- `src/domain/catalogs`: registri e cataloghi estendibili per elementi e prodotti;
- `src/domain/reinforcement`: armature discrete riusabili nelle sezioni;
- `src/domain/connectors`: connettori meccanici e cataloghi produttore;
- `src/domain/elements`: elementi strutturali, travi e sistemi di travi;
- `src/domain/actions`: gerarchia delle azioni normative con durata del carico, coefficienti `psi` e coefficienti parziali;
- `src/domain/slabs`: carichi di solaio, aggregatore immutabile e analisi SLU/SLE;
- `src/domain/supports`: vincoli;
- `src/domain/loads`: gerarchia astratta dei carichi per punto, linea, area e volume, con specializzazioni per nodi ed elementi;
- `src/domain/analysis`: casi di carico e combinazioni astratte/specializzate;
- `src/domain/model`: aggregatore del modello strutturale;
- `src/norms/ntc2018`: preset normativi e factory dedicate a materiali e combinazioni.

## Architettura per applicazioni

La codebase ora e predisposta per crescere su due livelli:

- `domain`: entita condivise e primitive di calcolo riusabili trasversalmente;
- `applications`: workflow applicativi completi, ciascuno con propri input, analisi/verifiche e manifest.

Le applicazioni scaffoldate al momento sono:

- `steel-frames`: calcolo di telai in acciaio e verifiche di aste;
- `masonry-ring-beams`: calcolo e verifica di cerchiature in pareti murarie portanti;
- `reinforced-concrete-sections`: calcolo e verifica di sezioni pressoinflesse in c.a.;
- `timber-beams`: verifiche di travi in legno;
- `timber-concrete-composite-beams`: verifiche di travi in legno con soletta collaborante;
- `timber-xlam-composite-beams`: verifiche di travi lignee collaboranti con pannelli XLAM;
- `xlam-panels-out-of-plane`: verifica fuori piano di pannelli XLAM impiegati come solai o coperture;
- `rc-cracked-deflection`: inflessione di travi in c.a. con sezione fessurata;
- `masonry-out-of-plane`: analisi di cinematismi fuori piano di pareti murarie;
- `micropiles-broms`: calcolo dei micropali secondo la teoria di Broms.

Ogni modulo contiene:

- un entrypoint applicativo con metodo `run()`;
- un modello dati iniziale dedicato;
- una prima classe di `analysis` o `checks` come estensione naturale futura;
- metadati di maturita e capability pianificate, utili per CLI, UI o plugin futuri.

## Nuove primitive di dominio

La codebase ora include anche componenti condivise utili per futuri moduli di verifica:

- sezioni geometriche `RectangularSection`, `CircularSection`, `TSection`, `PolygonSection`;
- sezione `XlamPanelSection` per pannelli XLAM a strati con lamelle attive configurabili;
- materiale `XlamMaterial` con parametri longitudinali, trasversali e rolling shear;
- primitive generiche `CompositeSectionComponent` e `CompositeSection` per legno-calcestruzzo, acciaio-calcestruzzo e altre sezioni miste;
- sezione `ReinforcedConcreteSection` costruita da una sezione in calcestruzzo e da armature posizionate;
- grandezze geometriche di base gia calcolate nelle classi, come area, baricentro, momenti di inerzia e moduli elastici;
- classe `ReinforcementBar` per armature discrete con diametro o area e classe di resistenza `B450A` / `B450C`;
- classe `TecnariaConnector` con catalogo integrato `BASE` e `MAXI` per tavolato `0`, `2`, `4` cm.
- classe `TimberDowelConnector` per unioni legno-legno con rigidezza `Kser/Ku` e resistenza tipo Johansen.
- catalogo estendibile dei pannelli XLAM con `registerXlamPanelProduct`, `getXlamPanelProduct`, `listXlamPanelProducts`.

## Travi In Acciaio

Il workflow per travi semplici in acciaio include ora un MVP di sezione e stabilita:

- profili da catalogo `HEA`, `HEB`, `HEM`, `IPE`, `UPN`;
- materiali `S235`, `S275`, `S355`;
- provider elastico coerente con le unita interne `N/mm` e conversione automatica verso le unita della trave;
- classificazione locale della sezione per profili I/H e UPN in funzione dello stato `N-M` della stazione FEM ULS;
- verifiche ULS da diagrammi FEM: flessione governata dalla classe (`Wpl` per classi 1-2, `Wel` per classe 3), taglio, sforzo normale, screening tensionale e interazione lineare assiale-flessione;
- instabilita flesso-torsionale MVP: automatica per profili I/H doppiamente simmetrici, oppure con `Mcr` fornito dall'utente per profili come `UPN`;
- instabilita di aste compresse secondo NTC 2018, con curve di instabilita, lunghezze efficaci `y/z` e default inferiti dai vincoli della trave semplice;
- pressoflessione normativa `N + My` secondo Metodo B della Circolare, per profili I/H doppiamente simmetrici e sezioni di classe 1, 2 o 3;
- verifica SLE di freccia verticale con limite default `L/250`;
- report JSON/Markdown con checks e metadata.

Il metodo e documentato in `docs/steel-beam-method.md`.
Il dominio attuale della stabilita a pressoflessione e `N + My`: `Mz`, torsione e interazioni torsionali non sono considerate. Proprieta efficaci per sezioni di classe 4, interazione con `Mz`, torsione/interazioni torsionali e affinamenti LTB sofisticati restano estensioni future.

## Travi Legno-Cls

E stato aggiunto un primo modulo implementato per la verifica di travi in legno con soletta collaborante.

- il modello applicativo e `TimberConcreteCompositeBeamModel`;
- la verifica e `TimberConcreteCompositeBeamVerification`;
- il metodo replica la procedura del foglio di calcolo fornito, basata sul coefficiente di efficacia `gamma`, sulla sezione efficace e sulle verifiche di legno, soletta, connettori e freccia.

Il caso di riferimento del file Excel e coperto da test automatico, cosi da mantenere l'allineamento numerico anche nelle future evoluzioni del modulo.

E stato aggiunto anche un modulo per travi lignee collaboranti con pannelli XLAM.

- il modello applicativo e `TimberXlamCompositeBeamModel`;
- la verifica e `TimberXlamCompositeBeamVerification`;
- il metodo replica il foglio Excel fornito per lo stato `SLU-SLE`, con rigidezza efficace, distribuzione delle sollecitazioni, verifiche a flessione/taglio, unione legno-legno e deformabilita.

E stato aggiunto anche un modulo per il caso di semplice pannello XLAM soggetto a flessione fuori piano.

- il modello applicativo e `XlamOutOfPlanePanelModel`;
- la verifica e `XlamOutOfPlanePanelVerification`;
- il metodo segue l'impostazione 1D-plate del paper WCTE 2010 / CLTdesigner, con rigidezza flessionale, rigidezza tagliante, verifica a flessione, rolling shear e deformabilita.

La struttura del dominio e stata impostata per poter riusare lo stesso `XlamPanelSection` sia come pannello standalone sia come componente di sistemi collaboranti con travi lignee o profilati metallici. Inoltre il registro prodotti XLAM e gia predisposto per futuri cataloghi dei produttori.

## Modulo Sezioni RC

Il modulo `reinforced-concrete-sections` e ora utilizzabile per un primo set di workflow di sezione in c.a. interamente in JavaScript, senza librerie numeriche esterne:

- `uls-uniaxial-resistance`: momento resistente `MxRd` a dato sforzo normale `N`;
- `uls-biaxial-domain`: dominio `Mx-My` a dato `N`;
- `uls-uniaxial-domain`: dominio `M-N` per una lista assegnata di valori `N`;
- `service-stress`: stato tensionale/deformativo per una terna `N-Mx-My`, con cls teso escluso.

I blocchi principali esposti dal package sono:

- `ReinforcedConcreteSection`: sezione in c.a. con geometria del cls e armature discrete;
- `createLongitudinalReinforcementLayout`: generatore dichiarativo di armature longitudinali top/bottom per sezioni rettangolari e a T;
- `ConcreteParabolaRectangleLaw`, `ConcreteNoTensionLaw`, `SteelElasticLaw`, `SteelElasticPerfectlyPlasticLaw`;
- `IllinoisRootSolver`;
- `SectionFiberDiscretizer`, `RCSectionStateIntegrator`, `RCUltimateSectionSolver`, `RCBiaxialDomainBuilder`, `RCUniaxialDomainBuilder`, `RCServiceStressSolver`;
- `ReinforcedConcreteSectionModel` e `ReinforcedConcreteSectionApplication`.

Per le travi in c.a. il workflow integrato include ora verifiche ULS `N-M`, taglio MVP, tensioni SLE, fessurazione indiretta e deformazioni fessurate da integrazione delle curvature.
La descrizione del metodo SLE, del contratto dati e della validazione automatica e in `docs/reinforced-concrete-sle-method.md`.

Struttura minima del modello applicativo:

```js
const model = new ReinforcedConcreteSectionModel({
  id: "rc-demo",
  units: { force: "N", length: "m" },
  section,
  analysisType: "uls-uniaxial-resistance",
  materials: { concreteMaterial, reinforcementMaterial },
  mesh: { targetFiberCount: 120 },
  solver: { tolerance: 1e-6, maxIterations: 100 },
  actions: { nEd: -800000, mEd: 1.5e5 },
});
```

Layer unita:

- il package accetta ora un oggetto opzionale `units: { force, length }` nei principali costruttori di materiali, geometrie, carichi, connettori e modelli applicativi;
- dalle due unita base vengono ricavate automaticamente le grandezze derivate, ad esempio momento, carico lineare, tensione, modulo elastico, area, volume e inerzia;
- quando `units` non e specificato, il comportamento legacy resta invariato per compatibilita con il codice esistente e con i test storici.

Esempio con input esplicito in `kN` e `m`:

```js
const model = new TimberConcreteCompositeBeamModel({
  id: "gelfi-si",
  units: { force: "kN", length: "m" },
  span: 4.25,
  slabSection: new RectangularSection({
    width: 1.8,
    height: 0.06,
    units: { force: "kN", length: "m" },
  }),
  timberSection: new RectangularSection({
    width: 0.22,
    height: 0.25,
    units: { force: "kN", length: "m" },
  }),
  timberConcreteGap: 0.10,
  reinforcementSpacing: 0.10,
  connectorSpacing: 0.15,
  loads: {
    ulsLineLoad: 15.966,
    sleRareLineLoad: 10.998,
  },
});
```

Se `units` non viene dichiarato, resta comunque disponibile la compatibilita legacy per il codice storico del modulo RC:

- unita interne consigliate: `mm`, `N`, `Nmm`, `MPa`;
- tensioni positive a trazione;
- cls a trazione escluso nei workflow `service-stress` e nei solve SLU a fibre;
- solve SLU basato su compatibilita delle deformazioni ed equilibrio assiale con metodo di Illinois.

Esempio dedicato:

```bash
npm run example:rc-sections
```

### Review Tecnica E Limiti Attuali

Il modulo RC e ora coerente e usabile per i workflow implementati, ma ci sono alcuni limiti attuali da considerare esplicitamente:

- il solve `uls-uniaxial-resistance` e `uls-biaxial-domain` usa un approccio a compatibilita delle deformazioni con controllo della deformazione ultima del cls sul bordo compresso; non e ancora presente una gestione piu completa e classificata dei diversi modi di crisi governati dall'acciaio;
- il dominio `Mx-My` e costruito per campionamento dell'orientazione dell'asse neutro, quindi la qualita del contorno dipende da `angleCount`; non e ancora implementato un infittimento adattivo locale vicino a una direzione di domanda assegnata;
- il dominio `M-N` e costruito su un intervallo assiale convenzionalmente limitato da `Nt,Rd = As fyd` e `Nc,Rd = 0.8 Ac fcd + As fyd`, risolvendo entrambi i segni di curvatura; valori `N` espliciti permettono anche di costruire un dominio di sezione non tagliato sul lato della compressione;
- il solver `service-stress` usa Newton smorzato con Jacobiano numerico a differenze finite; e robusto sui casi coperti dai test, ma non e ancora stato raffinato con strategie avanzate di fallback o con una gestione dedicata di casi particolarmente degeneri;
- nel caso di esercizio il cls teso e escluso, come richiesto, ma non sono ancora presenti opzioni piu evolute per tension stiffening, fessurazione progressiva o leggi costitutive SLE piu sofisticate;
- la discretizzazione del cls e basata su griglia regolare nel bounding box con accettazione dei baricentri interni al contorno; per le sezioni ordinarie funziona bene, ma non e ancora ottimizzata con mesh adattive o discretizzazioni mirate nelle zone a maggiore gradiente di deformazione;
- il codice storico puo ancora usare `mm`, `N`, `Nmm`, `MPa` senza dichiarare `units`, ma il package usa ora un layer dedicato di conversione automatica delle unita in input;
- non sono ancora implementati momento-curvatura, colonna modello e post-processing di duttilita, che restano le estensioni naturali del nucleo gia realizzato.

In sintesi, il modulo e adatto come motore frontend per analisi di sezione RC a fibre sui workflow oggi coperti, ma va ancora considerato come prima versione strutturata e non come motore normativo completo in tutti i casi limite.

## Strategia di crescita suggerita

Per mantenere la codebase ordinata conviene seguire questa convenzione:

- mettere in `src/domain` solo entita veramente condivise tra piu applicazioni;
- spostare in `src/applications/<modulo>` la logica specifica del caso d'uso;
- lasciare nei moduli normativi solo preset, coefficienti, tabelle e factory di codice;
- far restituire a ogni applicazione un `CalculationResult` o `VerificationResult` uniforme;
- usare `createDefaultApplicationRegistry()` come punto di accesso unico per registrare moduli, CLI, API o interfacce grafiche.

## Nota su NTC 2018

La classe `ExistingMasonryMaterial` non pretende di sostituire un motore normativo completo. In questa prima base:

- le proprieta meccaniche di partenza sono archiviate in `baseProperties`;
- i coefficienti dello stato di fatto sono archiviati in `surveyFactors`;
- i coefficienti degli interventi migliorativi sono archiviati in `improvementFactors`;
- il prodotto dei coefficienti viene applicato alle proprieta base tramite `adjustedProperty()` e `adjustedProperties()`.

Questo approccio rende semplice sostituire o specializzare in futuro la logica con tabelle, preset o formule piu aderenti ai casi previsti dalle NTC 2018.

## Preset NTC 2018 disponibili

Il layer `src/norms/ntc2018` aggiunge una prima libreria di preset normativi:

- calcestruzzo: classi da `C12/15` a `C50/60`, con calcolo di `fcd`, `fctm` ed `Ecm`;
- acciaio per c.a.: preset `B450A` e `B450C`;
- acciaio da carpenteria: preset `S235`, `S275`, `S355`;
- legno: gerarchia con `TimberMaterial`, `SolidTimberMaterial`, `GlulamTimberMaterial`, e preset iniziali NTC/EN per classi massicce `Cxx` e lamellari `GLxxh/GLxxc`;
- muratura esistente: mapping del livello di conoscenza `LC1/LC2/LC3` al fattore di confidenza;
- muratura esistente NTC 2018: tipologie tabellate della Circolare con parametri originali, stato di fatto e post-intervento, piu regole di incompatibilita tra coefficienti;
- workflow muratura NTC 2018: helper per costruire lo stato dei coefficienti, gestire i toggle esclusivi e valutare i parametri meccanici a partire da uno stato UI-like;
- profilati in acciaio: database integrato di sezioni `HEA`, `HEB`, `HEM`, `IPE`, `UPN` con classe dedicata `SteelProfileSection` e helper di lookup/catalogo;
- combinazioni di carico: factory per `ULS` fondamentale e `SLE` rara, frequente e quasi permanente;
- categorie variabili: catalogo `psi0`, `psi1`, `psi2` per categorie d'uso e azioni tipiche.
- carichi di solaio NTC 2018: classi per carichi superficiali, stratiformi, lineari e pareti equivalenti, piu cataloghi integrati per pesi specifici e sovraccarichi d'uso.
- azioni NTC 2018: gerarchia per permanenti, variabili, traffico, neve, vento, termiche, accidentali e sismiche, con durata del carico, coefficienti parziali e helper per `kmod` del legno.

Le assunzioni progettuali che dipendono dal caso specifico sono salvate nei `metadata` dei materiali e delle combinazioni, in modo da renderle esplicite e facilmente sostituibili.

## Riferimenti normativi usati

- Decreto Ministeriale 17 gennaio 2018, Norme Tecniche per le Costruzioni;
- Circolare 21 gennaio 2019 n. 7 C.S.LL.PP. per i livelli di conoscenza e i fattori di confidenza sugli edifici esistenti.

## Esempio

```bash
npm run example
```

```bash
npm run example:applications
```

```bash
npm run example:rc-sections
```
