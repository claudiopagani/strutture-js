# Project Boundaries

`strutture-js` e una libreria pubblica e open source per il calcolo
strutturale. Fornisce primitive matematiche, modelli di dominio, verifiche,
workflow riusabili, risultati serializzabili, report data model generici, FEM
generico, test, benchmark e campagne di validazione.

La libreria deve poter essere usata da applicazioni indipendenti tra loro. Non
conosce i repository consumer e non contiene logica necessaria soltanto a un
prodotto specifico.

## Responsabilita

Appartengono alla libreria:

- algoritmi matematici e solutori numerici generici;
- materiali, sezioni, azioni, carichi e modelli strutturali di dominio;
- trasformazioni di sollecitazioni e componenti FEM riusabili;
- verifiche normative con fonti, ipotesi, unita e campo di applicazione
  dichiarati;
- workflow applicativi deterministici e indipendenti dal solver, oppure con il
  solver ricevuto tramite un contratto esplicito;
- risultati, warning, assunzioni e report DTO serializzabili;
- test, benchmark e casi di validazione proporzionati alla criticita tecnica.

## Non-obiettivi

`strutture-js` non e un prodotto finale e non ospita:

- pagine, componenti o stato di interfaccia utente;
- autenticazione, utenti, progetti persistenti o database applicativi;
- chiamate di rete, gestione di job o orchestrazione server;
- analytics, telemetria, pricing o logiche commerciali;
- CAD, preprocessori o post-processori specifici di prodotto;
- adapter verso un programma o un repository consumer determinato;
- credenziali, configurazioni di deployment o strategie non tecniche.

Un report data model o un renderer testuale generico appartengono alla
libreria; la schermata che li visualizza, il download HTTP e la persistenza del
documento appartengono al consumer.

## Criteri di inclusione

Una nuova funzionalita puo entrare quando tutte le condizioni applicabili sono
soddisfatte:

1. e riutilizzabile da piu applicazioni e non replica una formula per una sola
   schermata;
2. e deterministica oppure rende esplicite e iniettabili le proprie dipendenze;
3. non dipende da UI, rete, database, storage applicativo o software
   proprietario;
4. dichiara unita, convenzioni, ipotesi, campo di validita e limiti;
5. restituisce dati serializzabili e non richiede al consumer di ricostruire
   la formula;
6. dispone di test automatici;
7. cita fonti e include validazione adeguata al rischio tecnico;
8. rispetta la direzione delle dipendenze e le API pubbliche esistenti.

Una funzionalita non entra quando adatta payload di un programma specifico,
gestisce credenziali o logiche commerciali, amministra utenti o progetti,
orchestra infrastruttura, implementa una UI o esiste soltanto per una singola
vista. In questi casi il consumer deve mantenere un proprio adapter o facade.

Uno scaffold puo descrivere un limite con status `not-implemented`, ma non va
presentato come capacita di calcolo e non sostituisce test, fonti o validazione.

## Esempi

Codice coerente con il repository:

- un solutore di radici con tolleranze esplicite e casi numerici di confronto;
- una verifica di resistenza che restituisce `demand`, `capacity`,
  `utilizationRatio`, `checks`, `warnings` e riferimenti al metodo;
- un contratto generico per importare sollecitazioni FEM serializzabili;
- un builder di report JSON indipendente dal mezzo con cui il report verra
  mostrato o salvato.

Codice da mantenere fuori dal repository:

- un hook o componente che trasforma lo stato di una pagina in input di
  calcolo;
- un client HTTP per inviare un calcolo a una coda;
- un mapper verso il formato di un solver commerciale determinato;
- il salvataggio di un progetto nel browser o in un database;
- un controllo duplicato e semplificato usato da una sola schermata.

## Confini interni ed esterni

Internamente la direzione ammessa resta `applications -> norms -> domain`:
`domain` non importa `norms` o `applications`, e `norms` non importa
`applications`. Il controllo e eseguito da `npm run check:architecture`.

Esternamente, i consumer importano soltanto il package root o i subpath
dichiarati in `package.json#exports`. La libreria non importa i consumer e non
assume il loro framework, ambiente di persistenza o modello di deployment.

Vedi anche [Public API Policy](public-api-policy.md) e
[Consumer Integration](consumer-integration.md).
