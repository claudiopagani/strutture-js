# Public API Policy

L'API pubblica di `strutture-js` e l'insieme degli entry point dichiarati nel
campo `exports` di `package.json`. Un file presente in `src` non e pubblico per
il solo fatto di essere leggibile nel repository.

## Entry point supportati

Sono supportati il package root e i subpath ufficiali correnti:

- `strutture-js`;
- `strutture-js/applications`;
- `strutture-js/applications/<application-id>`;
- `strutture-js/domain/fem`;
- `strutture-js/domain/geotechnics`;
- `strutture-js/domain/math`;
- `strutture-js/domain/strut-and-tie`;
- `strutture-js/catalogs/soil-types`;
- `strutture-js/catalogs/wall-interface-types`;
- `strutture-js/catalogs/steel-profiles`;
- `strutture-js/norms/italian-historical`;
- `strutture-js/norms/ntc2018`;
- `strutture-js/norms/en1992`.

I consumer non devono usare deep import come
`strutture-js/src/...`, percorsi relativi dentro `node_modules` o file di
implementazione non esportati. Questi percorsi possono cambiare senza essere
considerati API.

## Compatibilita e modifiche breaking

Una modifica e breaking quando richiede al consumer di cambiare import,
input, unita, significato di un campo, status, identificativi stabili o forma
serializzata, oppure quando modifica risultati numerici senza correggere un bug
documentato.

Il progetto segue il versionamento semantico. Durante la serie `0.x`, una
modifica breaking richiede almeno una nuova versione minor, note di migrazione
e test aggiornati; una patch non deve introdurre rotture intenzionali. Da
`1.0.0`, le modifiche breaking richiedono una major. Le aggiunte compatibili
possono entrare in una minor e le correzioni compatibili in una patch.

Quando possibile, un simbolo da rimuovere viene prima marcato deprecato,
documentato con il sostituto e mantenuto per almeno un ciclo minor. Le
deprecazioni non devono cambiare silenziosamente la semantica del calcolo.

## Contratti dei risultati

I workflow usano `CalculationResult` e, per le verifiche,
`VerificationResult`. I campi comuni sono `status`, `outputs`, `warnings`,
`assumptions` e `metadata`; una verifica aggiunge `checks`,
`utilizationRatio`, `demand` e `capacity`.

- `outputs` contiene i dati calcolati e serializzabili;
- `checks` contiene gli esiti atomici da mostrare o riportare;
- `warnings` segnala limiti e condizioni operative da non nascondere;
- `assumptions` registra le ipotesi applicate;
- `metadata` conserva metodo, riferimenti, unita e tracciabilita senza
  sostituire i campi principali.

Il significato degli status e definito in [Result Status](result-status.md).
Un consumer deve conservare warning e assunzioni insieme al risultato e non
trasformare un `not-supported`, `not-implemented` o `failed` in un esito
positivo.

## Unita e identificativi

Gli input numerici dichiarano il sistema `{ force, length }`; le grandezze
derivate seguono quel sistema o le unita interne documentate dal modello. Il
consumer deve leggere `units` e `metadata.sourceUnitSystem`, senza dedurre
unita dal nome della schermata o dal formato del numero. Le regole dettagliate
sono in [Unit Normalization](unit-normalization.md).

Identificativi di applicazioni, status, schema, check e metodi sono parte del
contratto quando documentati o restituiti per correlare risultati. Non vanno
riutilizzati con un significato diverso. Una rinomina richiede migrazione o un
alias deprecato.

## Ambienti supportati

Il codice pubblico condiviso deve restare ESM utilizzabile in Node.js, browser
moderni e Web Worker. Non deve dipendere da DOM, storage del browser, API di
rete o built-in Node per eseguire il calcolo. Operazioni di file system e CLI
restano negli script. `npm run check:worker-bundle` verifica un bundle browser
e un calcolo smoke in Web Worker.

Una nuova API che non puo funzionare in tutti questi ambienti deve essere
isolata in un entry point esplicito e non deve contaminare gli entry point
portabili.

Il macroelemento murario ciclico, i relativi materiali, l'interfaccia a fibre
e il protocollo isolato sono esportati dal package root; elemento e protocollo
sono esportati anche da `strutture-js/domain/fem`. Il metodo e i limiti sono
descritti in [Macroelemento ciclico 2D per maschi murari](cyclic-masonry-pier.md).
I contratti FEM globali candidati v0, i relativi factory e i validatori sono
esportati sia dal package root sia da `strutture-js/domain/fem`; forma,
convenzioni e strategia di evoluzione sono descritte in
[Contratti FEM globali candidati v0](global-fem-contracts.md).
Il distinto inviluppo bilineare NTC 2018/Circolare 2019 è esportato dagli entry
point `strutture-js/norms/ntc2018` e
`strutture-js/applications/masonry-piers`; campo, formule e differenze rispetto
al macroelemento fisico sono descritti in
[Modello normativo NTC 2018 del maschio murario](ntc2018-masonry-pier.md).

## Tracciabilita della versione

Il risultato non deduce autonomamente la versione installata. Il consumer deve
leggere la versione risolta dal proprio lockfile o iniettarla nel build e
salvarla con ogni calcolo, insieme a:

- nome e versione della libreria;
- identificativo del metodo o workflow;
- eventuale versione dello schema del report;
- input normalizzato o suo riferimento immutabile;
- risultato serializzato completo.

Il formato di envelope consigliato e mostrato in
[Consumer Integration](consumer-integration.md). Non usare il solo numero di
versione dell'applicazione consumer come sostituto della versione della
libreria.
