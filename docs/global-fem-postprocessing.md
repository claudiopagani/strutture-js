# Postprocessing FEM globale

## Scopo e stato

`GlobalFemPostProcessingApplication` è il primo collegamento operativo fra i
contratti FEM globali candidati v0 e le future applicazioni di verifica. Valida
i dati, estrae domande senza perdere assi o convenzioni e comunica quali
elaborazioni sono eseguibili. Non applica formule NTC 2018 e non restituisce
esiti di resistenza.

L'applicazione è `partial`: classificazione, estrazione e readiness sono
implementate; l'orchestrazione delle verifiche in calcestruzzo armato è
intenzionalmente `not-implemented` finché non saranno definiti i relativi
input applicativi e riferimenti normativi.

```text
capabilities + model + analysis + result
                  │
                  ▼
         validatori domain/fem
                  │
          ┌───────┴────────┐
          ▼                ▼
  domande FEM generiche   classificazione proposta
                           oppure mapping confermato
          └───────┬────────┘
                  ▼
       rapporto di readiness
                  │
                  ▼
 future applications ──► future norms/ntc2018 checks
```

Il codice non contiene rete, job, autenticazione o formati di solver. Un
adapter consumer-side e un solver nativo devono produrre gli stessi contratti;
da quel punto in poi percorrono lo stesso flusso.

## Un solo postprocessore, tre profili

| Profilo | Mapping | Risultato utilizzabile | Limite |
| --- | --- | --- | --- |
| `demand-only` | non richiesto | domande per singolo elemento e risposte globali | nessuna semantica strutturale viene prodotta |
| `assisted` | assente o incompleto ma privo di conflitti | proposte per membri, superfici, piani, diaframmi e giunti; domande raggruppate ma marcate | `requiresConfirmation: true`; nessuna verifica normativa finale |
| `confirmed` | `FemEntityMappingContract` completo e valido | semantica esplicita e domande collegate alle entità mappate | un mapping invalido blocca il processing richiesto |

Il profilo predefinito è `confirmed`. Il consumer deve chiedere esplicitamente
un comportamento più permissivo. Non esistono tre solutori diversi: profili,
validazione ed esito cambiano, mentre i contratti FEM e l'estrattore restano
gli stessi.

## Classificazione assistita

`classifyGlobalFemStructuralEntities` restituisce lo schema sperimentale
`strutture-js/fem-structural-classification-proposal`, `version: 0`. Non crea
un `FemEntityMappingContract` e non modifica il modello.

Le regole geometriche usano la direzione di gravità dichiarata, mai la lettera
`Z` come default:

- asta quasi parallela alla gravità → candidato `column`;
- asta quasi ortogonale alla gravità → candidato `beam`;
- asta inclinata entro una soglia configurata → candidato `beam` con fonte
  `configured-geometric-inference`;
- altra inclinazione → `other`, stato `ambiguous`;
- shell con normale quasi parallela alla gravità → candidato `slab`;
- shell con normale quasi ortogonale alla gravità → candidato `wall`;
- altra shell → `generic-shell`, destinata a elaborazione generica;
- shell con sezione e materiale comuni sono raggruppate soltanto se condividono
  un bordo, hanno normali coerenti e sono complanari;
- piani non dichiarati possono essere proposti raggruppando le quote di
  superfici orizzontali o diaframmi;
- un giunto trave-pilastro può essere proposto in un nodo comune alle estremità
  di candidati trave e pilastro.

Le tolleranze predefinite di orientamento sono 10°. Sono parametri tecnici
euristici, non limiti normativi e non costituiscono una raccomandazione di
progetto. La soglia per le travi inclinate è disabilitata finché il consumer
non la assegna. Ogni proposta contiene fonte, evidenze, confidenza e
`requiresConfirmation: true`.

Un errore, un riferimento inesistente o una doppia assegnazione nel mapping
non viene degradato a warning. Il profilo assistito ammette soltanto
l'incompletezza di copertura; gli errori strutturali del mapping bloccano
l'elaborazione semantica.

### Significato di giunto

Un giunto è una regione di collegamento strutturale rappresentata, in questo
incremento, da:

- un `nodeId` comune;
- l'elenco ordinato delle estremità incidenti
  `{ lineElementId, end: "start" | "end" }`.

Questo consente di estrarre le azioni alle estremità corrette delle aste. Non
descrive ancora automaticamente la geometria tridimensionale del pannello di
nodo, le facce delle membrature, gli offset rigidi, le armature o il
confinamento: questi dati devono essere assegnati esplicitamente dal modello
applicativo prima di una verifica.

## Domande estratte

`extractGlobalFemDemands` restituisce
`strutture-js/global-fem-demand-set`, `version: 0`, con:

- azioni delle aste per elemento, combinazione/caso e stazione;
- minimo e massimo di ogni componente con riferimento e posizione governanti;
- risultanti shell per elemento, faccia e posizione;
- raggruppamenti per membro e superficie che conservano i dati elementari;
- azioni alle estremità dei giunti, raggruppate per stato di risultato;
- spostamenti nodali, reazioni, modi, section cut, risultati per piano,
  residui, inviluppi e indicatori di qualità.

L'estrattore non aggrega componenti di elementi diversi come se avessero la
stessa base. Ogni record conserva `localAxes`, sistema di coordinate, faccia,
posizione, unità e convenzioni dei segni. Le componenti di più elementi
potranno essere trasformate o combinate soltanto da un'operazione successiva
che dichiari la base comune.

## Readiness e significato degli status

`evaluateGlobalFemVerificationReadiness` separa due domande:

1. gli input richiesti sono disponibili e confermati?
2. l'elaborazione richiesta è già implementata?

Ogni assessment contiene quindi `inputStatus`, `implementationStatus`,
`status` e `missingInputs`. Gli status locali sono:

- `ready`: dati sufficienti e operazione disponibile;
- `provisional`: operazione disponibile, ma la semantica assistita deve essere
  confermata;
- `blocked`: mancano dati o esistono errori/ambiguità;
- `not-implemented`: dati sufficienti, ma l'operazione normativa non è ancora
  disponibile.

La mancanza di armature, classe di duttilità, comportamento dissipativo,
destinazione d'uso, vita nominale, classe d'uso, parametri sismici o
combinazioni richieste è riportata con codice e percorso. Non viene generato
un risultato di verifica parziale fingendo una capacità completa.

Uno status tecnico FEM `partial` non blocca automaticamente le famiglie
dichiarate disponibili e realmente presenti: genera un warning e ogni
assessment controlla i propri dati. `failed` e `not-supported` bloccano invece
il processing. In questo modo un solver parziale non inventa risultati e può
essere usato per il sottoinsieme che espone correttamente.

Gli assessment implementati riguardano estrazione generica/semantica e
disponibilità dei dati di spostamento, modali e del secondo ordine. Gli
assessment per membri in c.a., setti, nodi, gerarchia delle resistenze e
verifica completa dell'edificio descrivono i prerequisiti, ma dichiarano
`implementationStatus: "not-implemented"`.

La matrice dettagliata “verifica futura → dati FEM necessari” è in
[Contratti FEM globali](global-fem-contracts.md#matrice-dati-per-verifiche-future).

## Esempio

```js
import {
  GLOBAL_FEM_POSTPROCESSING_PROFILES,
  GlobalFemPostProcessingApplication,
} from "strutture-js/applications/global-fem-postprocessing";

const calculation = new GlobalFemPostProcessingApplication().run({
  profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.ASSISTED,
  capabilities,
  model,
  analysis,
  result,
});

const payload = calculation.toJSON();

if (payload.status === "ok") {
  // Le domande sono utilizzabili. Le classificazioni "proposed"
  // devono ancora essere confermate dal consumer.
  console.log(payload.outputs.demands);
  console.log(payload.outputs.classification);
}
```

Per il flusso avanzato il consumer passa `profile: "confirmed"` e un mapping
completo. Per interrogare i prerequisiti futuri può aggiungere, per esempio,
`requestedAssessments: ["complete-ntc2018-building-verification"]`: l'esito
rimarrà `not-analyzed` finché input o implementazioni risultano mancanti.

## Passaggio da proposta a mapping

La conferma è un'azione esplicita del consumer:

1. mostrare proposta, evidenze e warning a un tecnico o applicare una regola
   progettuale esplicitamente autorizzata;
2. assegnare identificativi strutturali stabili;
3. risolvere tutti gli elementi `ambiguous`;
4. completare membri, setti, impalcati, piani e giunti richiesti;
5. creare e validare un `FemEntityMappingContract`;
6. rieseguire il profilo `confirmed`.

Gli identificativi originali del provider restano soltanto in metadata
generica. Sostituire il solver non cambia mapping, estrattore o verificatori se
il nuovo producer mantiene id stabili, unità, assi, segni e hash coerenti.

## Limiti intenzionali del primo incremento

- nessuna formula NTC 2018 per setti, regolarità o gerarchia;
- nessuna generazione di armature, sezioni resistenti o dettagli costruttivi;
- nessuna scelta automatica di duttilità o comportamento dissipativo;
- nessuna deduzione di parametri d'uso o sismici;
- nessuna trasformazione silenziosa delle azioni locali;
- nessuna pretesa che una classificazione geometrica equivalga a una decisione
  progettuale.

Prima di stabilizzare questi schemi v0 occorrono confronti con payload reali
su suddivisione delle aste, offset e facce di nodo, mesh shell non complanari,
diaframmi modellati con constraint multipunto, stazioni duplicate ai salti,
inviluppi, convenzioni locali e risultati modali normalizzati.
