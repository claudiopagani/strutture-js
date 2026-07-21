# Licensing

## Licenza del progetto

`strutture-js` versione 0.8.0 e successive e distribuito con licenza GNU Lesser
General Public License versione 2.1 o, a scelta del destinatario, qualsiasi
versione successiva (`LGPL-2.1-or-later`). Il testo applicabile e in
[LICENSE](../LICENSE); la fonte ufficiale della licenza e la
[GNU LGPL 2.1](https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html).

La migrazione riguarda tutto il codice corrente e le release future. Non
riscrive tag o release storiche e non revoca i diritti sulle copie delle
versioni precedenti gia ottenute sotto MIT.

Questa guida riassume il modello di distribuzione del progetto, ma non
sostituisce il testo della licenza ne una consulenza legale. In caso di
conflitto prevale `LICENSE`.

## Scenari d'uso

### Uso non modificato

L'esecuzione della libreria non e limitata dalla LGPL. Se si redistribuisce una
copia della libreria, anche gratuitamente o come parte di un altro prodotto,
occorre conservare gli avvisi di copyright, licenza e assenza di garanzia,
fornire una copia della LGPL e rendere disponibile ai destinatari il sorgente
corrispondente coperto dalla licenza.

### Modifica e distribuzione della libreria

Chi distribuisce una versione modificata deve identificare le modifiche e le
relative date, mantenere l'opera basata sulla libreria alle condizioni della
LGPL e fornire ai destinatari il sorgente completo corrispondente, inclusi gli
script necessari a compilarla. La LGPL non impone di inviare una pull request,
contribuire le modifiche upstream o usare GitHub: gli obblighi sono verso i
destinatari della distribuzione.

### Applicazione proprietaria

Un'applicazione indipendente, proprietaria o commerciale puo usare
`strutture-js` senza diventare automaticamente open source. Se viene distribuita
insieme alla libreria, devono pero essere rispettate le condizioni applicabili
della LGPL 2.1, in particolare gli avvisi, la copia della licenza, il sorgente
della libreria coperto e la possibilita effettiva per il destinatario di
sostituire la libreria con una versione modificata compatibile o di effettuare
il relinking. Le condizioni del prodotto non devono vietare le modifiche per
uso proprio o il reverse engineering necessario a eseguire il debug di tali
modifiche.

### Uso interno

Il solo uso o la modifica interna, senza distribuzione di copie fuori dal
soggetto che li compie, non attivano gli obblighi di distribuzione del sorgente.
Se una copia viene trasferita a un'altra persona o entita, occorre valutare il
trasferimento come distribuzione secondo la licenza.

### Server-only e SaaS

La LGPL 2.1 non contiene una clausola di rete: eseguire la libreria su un server
e offrire soltanto un servizio non equivale, da solo, a distribuire la libreria.
La consegna al client di JavaScript, bundle browser o codice per Web Worker che
contiene `strutture-js` e invece una distribuzione di quella copia e va trattata
come tale.

### Distribuzione tramite npm

Pubblicare o ridistribuire il package npm e una distribuzione. Il tarball
ufficiale include `LICENSE`, gli avvisi, `docs/licensing.md`, il sorgente della
libreria, lo script di build e il bundle. Una variante pubblicata deve
conservare questi materiali, dichiarare le modifiche e rendere disponibile il
sorgente corrispondente della versione effettivamente distribuita.

### Bundle browser e Web Worker

Un bundle consegnato agli utenti puo incorporare il codice della libreria. Il
banner LGPL non deve essere rimosso e il prodotto deve accompagnare la copia
con la licenza e con un modo chiaro per ottenere il sorgente corrispondente.
Quando la libreria viene combinata in un bundle proprietario, occorre anche
fornire un meccanismo e i materiali necessari per sostituirla o ripetere il
linking con una versione modificata compatibile, quando richiesto dalla LGPL.
Separare `strutture-js` come modulo sostituibile e documentare la procedura di
build e una soluzione normalmente piu semplice; un bundle minificato da solo
non sostituisce il sorgente corrispondente.

## Checklist per chi distribuisce

- conservare copyright, avvisi LGPL e dichiarazione di assenza di garanzia;
- accompagnare la copia con il testo di `LICENSE`;
- rendere disponibile ai destinatari il sorgente coperto corrispondente alla
  copia distribuita, incluse le modifiche e gli script di build necessari;
- segnalare in modo evidente i file modificati e la data delle modifiche;
- non imporre restrizioni ulteriori sui diritti concessi dalla LGPL;
- per opere combinate, consentire la sostituzione o il relinking della libreria
  quando applicabile.
