# strutture-js

Motore open source in JavaScript per il calcolo strutturale.

`strutture-js` nasce per diventare una base comune, verificabile e riusabile su cui costruire software di calcolo strutturale: librerie, API, plugin, strumenti desktop, applicazioni web e interfacce specialistiche.

La missione e costruire una unica source of truth per il calcolo strutturale: non una raccolta di script isolati, non un insieme di fogli di calcolo tradotti in codice, ma un nucleo condiviso in cui modelli, ipotesi, formule, unita, test, validazioni e limiti siano dichiarati nello stesso posto e possano essere discussi, migliorati e verificati dalla comunita.

Il progetto e distribuito con licenza MIT.

## Visione

Il settore del calcolo strutturale produce ogni giorno conoscenza tecnica in forme fragili: fogli Excel personali, macro non versionate, software chiusi, implementazioni parziali, report non riproducibili, passaggi manuali difficili da controllare.

`strutture-js` vuole offrire un'alternativa aperta:

- un dominio strutturale comune, scritto in JavaScript moderno;
- API piccole, componibili e documentate;
- test numerici e campagne di validazione ripetibili;
- ipotesi normative esplicite;
- risultati serializzabili e adatti a UI, report e automazioni;
- un processo di sviluppo in cui l'AI puo accelerare il coding, ma la responsabilita tecnica resta nella revisione, nei test e nella tracciabilita delle fonti.

L'obiettivo non e sostituire il giudizio dell'ingegnere. L'obiettivo e rendere il codice di calcolo piu trasparente, condivisibile e controllabile.

## Open source e comunita

Per questo progetto l'open source non e solo una licenza: e il metodo con cui una comunita tecnica puo far crescere conoscenza condivisa.

Nel calcolo strutturale molti strumenti nascono per risolvere problemi reali di studio, cantiere, ricerca o didattica, ma restano spesso confinati in contesti privati. Il risultato e che molti ingegneri risolvono piu volte gli stessi problemi, verificano a mano le stesse formule, mantengono fogli di calcolo paralleli e si fidano di implementazioni che pochi possono leggere.

`strutture-js` vuole trasformare questa energia dispersa in infrastruttura comune:

- ogni contributo utile puo diventare patrimonio tecnico riusabile;
- ogni bug corretto migliora il lavoro di tutti;
- ogni caso di validazione rafforza la fiducia nella libreria;
- ogni riferimento normativo esplicitato riduce ambiguita e interpretazioni nascoste;
- ogni interfaccia costruita sopra la libreria beneficia dello stesso nucleo verificato;
- ogni revisione tecnica lascia una traccia che puo essere studiata, discussa e migliorata.

L'open source diventa cosi un motore di progresso per la comunita degli ingegneri: non per eliminare la responsabilita professionale, ma per darle strumenti piu trasparenti, piu controllabili e piu evolutivi.

Una source of truth condivisa permette anche di costruire software diversi senza frammentare il sapere: una UI per il professionista, un tool didattico, un plugin BIM, una API server-side o un report generator possono usare lo stesso modello di calcolo, gli stessi test e le stesse ipotesi dichiarate.

## Perche JavaScript

La scelta di JavaScript e intenzionale.

Il calcolo strutturale sta diventando sempre piu interattivo: configuratori web, report dinamici, plugin BIM, strumenti collaborativi, notebook, validazioni automatiche, AI coding assistant, interfacce parametriche.

JavaScript rende la libreria web native:

- gira nel browser, in Node.js e in ambienti edge;
- permette di condividere lo stesso motore tra backend e frontend;
- produce oggetti JSON nativi per UI, report, audit trail e integrazioni;
- abbassa la barriera di ingresso per sviluppatori web e ingegneri che vogliono collaborare;
- consente di separare il nucleo di calcolo dalle interfacce, evitando che ogni UI ricrei il proprio motore.

`strutture-js` deve essere prima di tutto una libreria di calcolo. Le interfacce utente devono poter nascere sopra la libreria, non dentro la libreria.

## Principi

Il progetto prende ispirazione da una certa cultura del software resa evidente anche da Salvatore Sanfilippo nello sviluppo di Redis.

L'ispirazione non e celebrativa e non riguarda Redis come tecnologia specifica. Riguarda un modo di costruire open source:

- partire da problemi reali, non da architetture astratte;
- rendere il nucleo del software utile, leggibile e piacevole da usare;
- tenere il design interno abbastanza semplice da poter essere capito e discusso;
- accettare nuove feature solo quando hanno un uso chiaro e si integrano bene nel progetto;
- lavorare nell'interesse della comunita degli utenti, anche quando lo sviluppo e sostenuto da aziende o strumenti esterni;
- considerare il codice non solo come mezzo operativo, ma come artefatto tecnico che deve poter essere letto, mantenuto e tramandato.

In questo senso, `strutture-js` vuole essere "mattoncini per ingegneri": primitive affidabili, componibili e verificabili con cui costruire applicazioni diverse, senza chiudere il sapere dentro una singola interfaccia o un singolo prodotto.

Applicato al calcolo strutturale, significa:

- chiarezza prima di astrazione;
- API leggibili prima di architetture ambiziose;
- risultati espliciti prima di magie interne;
- test e validazioni prima di fiducia implicita;
- limiti dichiarati prima di completezza apparente;
- comunita prima di proprieta individuale della conoscenza;
- compatibilita e stabilita prima di riscritture non necessarie;
- poche dipendenze e complessita giustificata;
- piccoli incrementi funzionanti prima di grandi riscritture;
- documentazione tecnica come parte del prodotto, non come accessorio.

Anche l'uso dell'AI segue questa linea. L'AI puo accelerare scrittura del codice, refactor, generazione di test, ricerca di bug e produzione di esempi. Ma la visione del software, la scelta delle astrazioni, la responsabilita tecnica e la validazione restano umane. Il codice generato entra nella source of truth solo quando e compreso, revisionato, testato e documentato.

La libreria deve restare comprensibile. Se un contributo implementa una formula, un metodo numerico o una scelta normativa, deve rendere chiaro:

- da dove arriva;
- quali ipotesi fa;
- quali unita usa;
- quali casi copre;
- quali casi non copre;
- come viene verificato.

## Stato del progetto

La suite automatica copre il comportamento numerico principale e i contratti applicativi:

```bash
npm test
```

Per eseguire test, validazioni, controllo dei confini architetturali e verifica
del bundle Web Worker:

```bash
npm run check
```

Gate aggiuntivi, eseguiti anche dalla CI:

```bash
npm run lint
npm run typecheck
npm run coverage
npm run check:performance
```

Il type-check JavaScript e adottato in modo graduale sui kernel matematici e
FEM stabilizzati; la coverage minima e 85% linee, 60% branch e 88% funzioni.
I performance budget combinano limiti deterministici sul numero di operazioni
con soglie temporali larghe, adatte anche ai runner CI condivisi.

Stato sintetico dei moduli applicativi:

| Modulo | Stato | Cosa fa oggi |
| --- | --- | --- |
| `single-beam-design` | MVP | Analisi FEM 2D di trave semplice, verifiche opzionali e report JSON/Markdown. |
| `steel-frames` | Parziale | Verifiche di aste in acciaio da risultati FEM e pushover standalone di cerchiature metalliche rettangolari. |
| `masonry-piers` | Parziale | Verifica verticale NTC 2018 di maschi murari e idealizzazione 2D a telaio equivalente. |
| `masonry-wall-openings` | Implementato | Verifiche di cerchiature su allineamenti murari, confronto pre/post e contributo laterale della cerchiatura. |
| `masonry-ring-beams` | Scaffold | Modello e placeholder per cerchiature in muratura. |
| `reinforced-concrete-sections` | Implementato | Analisi SLU/SLE di sezioni in c.a. a fibre. |
| `reinforced-concrete-plates` | Implementato | Verifica locale SLU/SLE di piastre piane in c.a. mediante strisce equivalenti Wood-Armer. |
| `reinforced-concrete-punching` | MVP | Verifica locale a punzonamento con contratto serializzabile e campo di applicazione documentato. |
| `timber-beams` | Parziale | Verifiche di travi in legno da risultati FEM disponibili. |
| `timber-concrete-composite-beams` | Implementato | Verifica gamma-method di travi legno-calcestruzzo con connettori. |
| `timber-xlam-composite-beams` | Implementato | Verifica gamma-method di travi lignee collaboranti con pannelli XLAM. |
| `xlam-panels-out-of-plane` | Implementato | Verifica fuori piano di pannelli XLAM/CLT come strip 1D. |
| `rc-cracked-deflection` | Parziale | Integrazione delle curvature fessurate su risultati FEM SLE. |
| `masonry-out-of-plane` | Scaffold | Modello e placeholder per cinematismi fuori piano. |
| `micropiles-broms` | Scaffold | Modello e placeholder per analisi Broms dei micropali. |

## Architettura

La libreria e organizzata in livelli.

| Cartella | Ruolo |
| --- | --- |
| `src/core` | Contratti comuni per applicazioni, codici normativi e risultati. |
| `src/domain` | Entita riusabili: materiali, geometrie, carichi, azioni, FEM, sezioni, travi, solutori, unita. |
| `src/applications` | Workflow verticali: modelli, analisi, verifiche, report e manifest applicativi. |
| `src/norms` | Preset, cataloghi e factory normative. Oggi include NTC 2018 e acciai storici italiani. |
| `src/config` | Cataloghi e manifesti di alto livello. |
| `docs` | Note metodologiche, limiti implementativi e contratti tecnici. |
| `examples` | Esempi eseguibili e generatori di report. |
| `validation` | Campagne di validazione numerica con fonti, ipotesi e tolleranze. |
| `tests` | Test automatici di dominio, applicazioni, regressioni e contratti pubblici. |

La regola di base e semplice:

- `src/domain` contiene cio che puo servire a piu applicazioni;
- `src/applications/<modulo>` contiene workflow specifici;
- `src/norms` contiene interpretazioni, preset e cataloghi normativi;
- ogni applicazione deve restituire un risultato leggibile, serializzabile e testabile.

Le dipendenze ammesse seguono la direzione `applications -> norms -> domain`:
`domain` non puo importare `norms` o `applications`, mentre `norms` non puo
importare `applications`. Il vincolo e verificato automaticamente con:

```bash
npm run check:architecture
```

Il package pubblica l'ESM sorgente come condizione `import`, lasciando il
bundle `dist/index.mjs` come fallback. Per ridurre il grafo caricato e
migliorare il tree-shaking sono disponibili subpath granulari:

```js
import { BandedLinearSolver } from "strutture-js/domain/math";
import { CrackedSectionDeflectionAnalysis } from "strutture-js/applications/rc-cracked-deflection";
import { getSteelProfileSectionData } from "strutture-js/catalogs/steel-profiles";
```

I confini della libreria, gli entry point supportati e il pattern di
integrazione per applicazioni esterne sono documentati in:

- [docs/project-boundaries.md](docs/project-boundaries.md);
- [docs/public-api-policy.md](docs/public-api-policy.md);
- [docs/consumer-integration.md](docs/consumer-integration.md).

I consumer devono usare soltanto il package root o i subpath dichiarati in
`package.json#exports`; i deep import in `src` non sono API supportate.

## Contratti pubblici

Le applicazioni restituiscono uno tra:

- `CalculationResult`: risultato di analisi o workflow, con `status`, `outputs`, `warnings`, `assumptions`, `metadata`;
- `VerificationResult`: risultato di verifica, con `checks`, `utilizationRatio`, `capacity`, `demand` e metodo `isVerified()`.

Gli stati principali sono:

- `ok`: calcolo o verifica conclusi con esito positivo;
- `not-verified`: calcolo concluso, ma almeno una verifica non passa;
- `not-supported`: caso fuori dal campo coperto dal workflow;
- `not-implemented`: modulo o ramo ancora placeholder;
- `failed`: errore tecnico o numerico.

I risultati devono essere adatti a tre usi:

- consumo programmatico da API e UI;
- generazione di report;
- audit tecnico di ipotesi, warning e limiti.

## Unita

I costruttori principali richiedono un sistema di unita esplicito:

```js
const units = { force: "N", length: "mm" };
```

Da `force` e `length` la libreria ricava le grandezze derivate: momento, carico lineare, tensione, modulo elastico, area, volume, inerzia e moduli resistenti.

Regole pratiche:

- sezioni, materiali e connettori usano spesso `{ force: "N", length: "mm" }`;
- modelli di trave e input utente possono usare anche `{ force: "kN", length: "m" }`;
- i valori vengono convertiti nelle unita interne del modulo;
- `toJSON().units` espone le unita interne;
- `metadata.sourceUnitSystem` conserva le unita dichiarate dall'utente.

Vedi [docs/unit-normalization.md](docs/unit-normalization.md).

## Esempio minimo

```js
import {
  RectangularSection,
  SingleBeamDesignApplication,
  SingleBeamDesignModel,
  TimberBeamVerification,
  createNTC2018TimberMaterial,
} from "strutture-js";

const units = { force: "N", length: "mm" };

const section = new RectangularSection({
  width: 120,
  height: 240,
  units,
});

const material = createNTC2018TimberMaterial({
  strengthClass: "C24",
  serviceClass: 1,
  units,
});

const model = new SingleBeamDesignModel({
  id: "beam-01",
  units,
  beamInput: {
    units,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
    },
    section,
    material,
    supports: {
      start: "hinge",
      end: "roller",
    },
    loads: [
      {
        id: "g1",
        loadCaseId: "G1",
        actionType: "G1",
        type: "uniform",
        value: -3,
      },
    ],
    combinations: [
      {
        id: "uls",
        limitState: "ULS",
        factors: { G1: 1.3 },
      },
    ],
    discretization: { elementCount: 8 },
  },
  verification: {
    verifier: new TimberBeamVerification({
      deflectionLimitDenominator: 300,
    }),
    input: { section, material },
  },
});

const result = new SingleBeamDesignApplication().run({ model });

console.log(result.status);
console.log(result.outputs.analysis);
console.log(result.outputs.verification);
```

Nel repository gli esempi importano spesso da `./src/index.js` per usare direttamente il sorgente locale.

## Esempi

```bash
npm run example
npm run example:ntc2018
npm run example:applications
npm run example:rc-sections
npm run example:beam-reports
npm run example:masonry-wall-openings:cerchiature
```

I report generati dagli esempi vengono scritti in `results/`.

## Validazione

La validazione e parte del progetto, non una fase esterna.

```bash
npm run validation
npm run validation -- --json
npm run check
```

Ogni caso di validazione dovrebbe dichiarare:

- fonte o origine del dato;
- ipotesi principali;
- grandezze confrontate;
- tolleranza numerica;
- motivo per cui il caso e un benchmark esterno, una regressione di progetto o un contratto interno.

Documentazione utile:

- [docs/beam-validation-campaign.md](docs/beam-validation-campaign.md);
- [docs/project-boundaries.md](docs/project-boundaries.md);
- [docs/public-api-policy.md](docs/public-api-policy.md);
- [docs/consumer-integration.md](docs/consumer-integration.md);
- [docs/implementation-boundaries.md](docs/implementation-boundaries.md);
- [docs/reinforced-concrete-module-progression.md](docs/reinforced-concrete-module-progression.md);
- [docs/result-status.md](docs/result-status.md);
- [docs/steel-beam-method.md](docs/steel-beam-method.md);
- [docs/reinforced-concrete-sle-method.md](docs/reinforced-concrete-sle-method.md).
- [docs/reinforced-concrete-plates-method.md](docs/reinforced-concrete-plates-method.md).

## Collaborazione

La collaborazione deve proteggere la source of truth. L'obiettivo non e accettare piu codice possibile, ma accettare codice comprensibile, verificabile e mantenibile.

### Proposta A - Core piccolo, RFC leggere

Adatta quando il progetto cresce e molte persone propongono modifiche trasversali.

- le modifiche locali entrano con issue e pull request;
- le modifiche a contratti pubblici, unita, risultati, norme o solutori richiedono una mini RFC;
- la RFC deve spiegare problema, API proposta, fonti, limiti e strategia di test;
- i maintainer proteggono coerenza architetturale e compatibilita.

Vantaggio: massima coerenza del nucleo.  
Rischio: puo rallentare contributi piccoli se applicata in modo troppo rigido.

### Proposta B - Gruppi di lavoro per dominio

Adatta quando contribuiscono ingegneri con competenze diverse.

- ogni area tecnica ha un piccolo gruppo di riferimento: c.a., acciaio, muratura, legno, FEM, normative, integrazioni consumer;
- i gruppi curano fonti, casi di validazione e priorita;
- le API comuni restano discusse centralmente;
- le implementazioni verticali possono avanzare in parallelo.

Vantaggio: valorizza competenze specialistiche.  
Rischio: senza regole comuni puo creare stili diversi tra moduli.

### Proposta C - Pipeline AI-assisted

Adatta al modo in cui il software puo essere sviluppato oggi.

- ogni issue deve distinguere specifica tecnica, implementazione, test, validazione e documentazione;
- l'AI puo aiutare a generare codice, test, esempi e refactor;
- nessun codice generato viene accettato senza review umana;
- le formule devono avere fonte o derivazione controllabile;
- le pull request devono includere un resoconto di cosa e stato verificato.

Vantaggio: accelera lo sviluppo senza perdere tracciabilita.  
Rischio: serve disciplina, altrimenti si produce codice plausibile ma non abbastanza verificato.

### Modello consigliato

Il modello consigliato e ibrido:

- Core piccolo e stabile.
- RFC leggere per cambiamenti architetturali o normativi.
- Gruppi di lavoro per domini specialistici.
- AI usata come acceleratore, non come autorita tecnica.
- Validazione numerica come criterio di accettazione.

## Come contribuire

Un buon contributo segue questa sequenza:

1. Apri una issue con problema, contesto tecnico e risultato atteso.
2. Indica se stai modificando dominio, applicazione, norma, validazione o documentazione.
3. Aggiungi o aggiorna test automatici.
4. Se il contributo cambia risultati numerici pubblici, aggiungi un caso in `validation/`.
5. Documenta ipotesi, unita, limiti e fonti.
6. Apri una pull request piccola e leggibile.

Tipi di contributo utili:

- casi di validazione con fonti affidabili;
- correzioni di bug numerici;
- implementazioni di metodi mancanti;
- miglioramento dei contratti JSON;
- esempi riproducibili;
- report piu chiari;
- documentazione metodologica;
- feedback ed esempi di integrazione da consumer esterni, mantenendo il loro codice applicativo fuori dalla libreria.

## Criteri per nuovo codice di calcolo

Ogni nuovo workflow dovrebbe rispondere a queste domande:

- Quale problema tecnico risolve?
- Quali input minimi richiede?
- Quali unita accetta?
- Quale riferimento normativo o metodologico usa?
- Quali risultati produce?
- Quali warning e assunzioni espone?
- Quali casi non supporta?
- Quali test lo proteggono?
- Quale validazione numerica lo rende credibile?

Una funzionalita di calcolo entra quando e riutilizzabile, deterministica o con
dipendenze esplicite, indipendente da UI/rete/database/software proprietario,
serializzabile, testata e supportata da fonti e validazione adeguate. Uno
scaffold puo descrivere un limite con `not-implemented`, ma non e una
funzionalita operativa e non sostituisce questi criteri. Vedi
[docs/project-boundaries.md](docs/project-boundaries.md).

## Limiti generali

- La libreria non e ancora un software normativo completo.
- Alcuni moduli sono scaffold intenzionali.
- Le verifiche acciaio non includono ancora torsione e proprieta efficaci per classe 4.
- I workflow RC non includono ancora duttilita e colonna modello.
- Le verifiche legno e XLAM sono solide per i casi coperti dai test, ma richiedono campagne piu ampie per usi fuori da quei domini.
- Ogni uso professionale richiede controllo, responsabilita e giudizio dell'ingegnere.

I limiti implementativi, le ipotesi normative e le scelte numeriche devono restare separati. Vedi [docs/implementation-boundaries.md](docs/implementation-boundaries.md).

## Roadmap

Direzioni naturali di crescita:

- consolidare i contratti pubblici dei risultati;
- ampliare le campagne di validazione indipendenti;
- ampliare le verifiche normative con fonti e limiti espliciti;
- migliorare prestazioni e robustezza numerica;
- evolvere i moduli FEM pubblici e generici;
- migliorare documentazione e stabilita delle API.

La progressione tecnica specifica dei moduli in calcestruzzo armato, con la
separazione tra micro-app, kernel riusabili e verificatori dipendenti dal FEM
globale, e mantenuta in
[docs/reinforced-concrete-module-progression.md](docs/reinforced-concrete-module-progression.md).

## Licenza

MIT. Vedi [LICENSE](LICENSE).

Il software e fornito "as is", senza garanzia. La trasparenza del codice non elimina la necessita di verifica tecnica, responsabilita professionale e controllo dei risultati.
