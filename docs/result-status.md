# Result Status

Gli status pubblici sono definiti in `src/core/results/resultStatus.js` e vanno usati tramite `RESULT_STATUS` invece che come stringhe libere.

## Valori

| Status | Significato applicativo | Uso tipico |
| --- | --- | --- |
| `ok` | Il calcolo o la verifica e stato eseguito e le condizioni richieste risultano soddisfatte. | Verifica con `utilizationRatio <= 1`, dominio convergente, analisi completata. |
| `not-verified` | Il calcolo e stato eseguito, ma almeno una condizione richiesta non e soddisfatta o non e dimostrabile con i dati disponibili. | Rapporto di utilizzo maggiore di 1, gruppi di armatura mancanti per fessurazione, curva non bilinearizzabile. |
| `not-supported` | Il caso richiesto e riconosciuto, ma esce dal dominio supportato dal metodo implementato. | Profilo acciaio o verifica fuori dalle regole coperte, torsione non gestita, classe 4 senza proprieta efficaci. |
| `not-analyzed` | La parte di workflow e stata saltata intenzionalmente per mancanza di input o perche non richiesta. | Verifica architrave non richiesta, analisi opzionale disattivata, contributo non presente. |
| `not-implemented` | Il workflow o il metodo e un placeholder dichiarato. | Applicazioni scaffolded non ancora operative. |
| `failed` | Errore operativo o fallimento del processo di calcolo, non una normale verifica non soddisfatta. | Eccezioni intercettate, input incoerente non recuperabile, errore numerico bloccante. |

## Regole d'Uso

`CalculationResult.isSuccessful()` restituisce `true` solo per `ok`.

`VerificationResult.isVerified()` restituisce `false` per qualunque status diverso da `ok`. Se sono presenti `checks`, richiede che tutti abbiano `ok === true`; se non ci sono checks, usa `utilizationRatio <= 1` quando il rapporto e disponibile.

Per un risultato tecnico negativo ma calcolato correttamente si usa `not-verified`, non `failed`.

Per una funzione volutamente non eseguita si usa `not-analyzed`, non `not-implemented`.

Per un metodo fuori campo si usa `not-supported`, accompagnandolo con una nota o warning che spieghi quale assunzione manca.

`failed` va riservato ai casi in cui il workflow non riesce a produrre un risultato affidabile.

## Warnings e Assumptions

Quando lo status non basta a descrivere il risultato:

* usare `warnings` per avvisi operativi o limiti che l'utente deve leggere;
* usare `assumptions` per ipotesi dichiarate dal modello o applicate dal workflow;
* usare `metadata` per dettagli leggibili da UI, report o test senza alterare il contratto principale.

Questa separazione evita di codificare significati nascosti dentro lo status.

## Contratto e serializzazione

`CalculationResult.toJSON()` restituisce un oggetto con `applicationId`,
`status`, `summary`, `outputs`, `warnings`, `assumptions` e `metadata`.
`VerificationResult.toJSON()` aggiunge `utilizationRatio`, `demand`,
`capacity` e `checks`.

Il consumer deve serializzare il risultato completo con `toJSON()` e
`JSON.stringify`, conservandolo in un envelope che registri almeno versione
risolta di `strutture-js`, applicazione/metodo e versione dell'eventuale schema
di report. La versione della libreria viene fornita dal build o dal lockfile
del consumer: non e dedotta dal risultato.

`demand`, `capacity` e `utilizationRatio` possono essere `null` quando il
metodo non produce una capacita valida. Un valore mancante non equivale a zero
e non autorizza il consumer a dichiarare la verifica soddisfatta.

## Uso da parte di UI e report

UI e renderer devono mostrare gli esiti gia presenti nel risultato:

- usare `status` per distinguere completamento, esito negativo, fuori campo,
  placeholder ed errore;
- usare `checks` per il dettaglio e `metadata.governingCheckId`, quando
  presente, per la verifica governante;
- mostrare `demand`, `capacity` e `utilizationRatio` con le unita dichiarate;
- riportare `warnings` e `assumptions` senza sopprimerli;
- usare `outputs` per diagrammi, inviluppi e dati di report.

Il consumer puo formattare i valori ma non deve ricalcolare una formula per
ricavare un nuovo status. In particolare:

- `not-supported` richiede di cambiare metodo o campo di applicazione;
- `not-implemented` indica che non esiste ancora una funzionalita operativa;
- `failed` indica che l'esecuzione non ha prodotto un risultato affidabile.

Un report puo aggiungere testo esplicativo, ma non deve trasformare nessuno di
questi tre status in `ok` o `not-verified`.

Per un esempio di envelope vedere
[Consumer Integration](consumer-integration.md).
