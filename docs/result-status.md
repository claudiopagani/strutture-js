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
