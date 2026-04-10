# TODO
* trasformare ReinforcedConcreteSection in base del modulo pressoflessione in c.a.;
* creare una SteelConcreteCompositeSection per profili metallici collaboranti con soletta, usando le stesse primitive composite.
* aggiungere vibrazioni e incendio al modulo XLAM standalone;
* creare il modulo “pannello XLAM + profilo metallico” riusando l'infrastruttura già presente.

## Strategia generale per il solutore FEM

Obiettivo: creare un piccolo core FEM riutilizzabile dalle diverse applicazioni della suite, inizialmente dedicato a strutture 2D composte da poche travi e telai con gradi di liberta dell'ordine delle decine. Il core non deve nascere come dettaglio interno del modulo delle frecce in c.a., ma come infrastruttura comune per travi in c.a., legno, acciaio, sistemi misti, telai semplici e futuri workflow non lineari.

Principi architetturali:

* tenere separati algebra lineare, gestione dei gradi di liberta, assemblaggio FEM, applicazione dei vincoli, strategie di soluzione, elementi finiti e post-processing dei risultati;
* evitare che il FEM dipenda direttamente da una libreria numerica specifica come `math.js` o `ml-matrix`;
* introdurre invece una piccola interfaccia sostituibile `LinearSolver.solve(A, b)`, con un primo solver dense interno e possibili adapter futuri;
* usare come default iniziale un solver denso generale con eliminazione di Gauss/LU e pivot parziale, piu robusto di Cholesky nei casi con matrici indefinite, sistemi aumentati o vincoli avanzati;
* lasciare aperta la possibilita di aggiungere un solver Cholesky/LDL^T per casi simmetrici definiti positivi, ma senza renderlo il requisito implicito del core;
* mantenere il FEM interno in un sistema coerente di unita, preferibilmente `N` e `mm` quando dialoga con le sezioni in c.a., centralizzando le conversioni dai modelli utente;
* produrre errori diagnostici chiari su meccanismi, vincoli insufficienti, matrici singolari e gradi di liberta problematici.

Struttura desiderata a lungo termine:

* `src/domain/math/`: solver lineari densi, utility matriciali minime, interfacce sostituibili;
* `src/domain/fem/`: registro dei DOF, modello FEM, assemblatore, gestione vincoli, solver statico lineare, recupero risultati;
* `src/domain/fem/elements/`: libreria di elementi 2D con interfaccia comune;
* applicazioni specifiche, come `rc-cracked-deflection`, `timber-beams` o `steel-frames`, devono configurare e usare il core FEM senza duplicarne la logica.

Gradi di liberta di base:

* adottare fin dall'inizio un elemento frame 2D con DOF nodali `ux`, `uy`, `rz`;
* anche quando una singola applicazione usa solo la flessione verticale, mantenere la formulazione da telaio piano per facilitare riuso, aste inclinate, telai, carichi assiali, eccentricita e vincoli avanzati;
* applicare i vincoli semplici per partizione/eliminazione dei DOF vincolati, evitando inizialmente moltiplicatori di Lagrange;
* gestire le molle elastiche come contributi diretti alla matrice di rigidezza globale;
* predisporre i multipoint constraints tramite trasformazione cinematica `u = T q + u0`, lasciando i moltiplicatori di Lagrange come opzione futura per vincoli piu generali.

Elementi finiti previsti:

* primo elemento operativo: frame 2D Euler-Bernoulli con DOF locali `[u1, v1, theta1, u2, v2, theta2]`;
* carichi equivalenti iniziali: carico distribuito uniforme trasversale, carico concentrato in posizione generica, momento concentrato;
* post-processing iniziale: reazioni, spostamenti nodali, forze di estremita, campionamento di taglio e momento lungo l'elemento;
* secondo elemento: frame 2D Timoshenko, mantenendo la stessa interfaccia dell'elemento Euler-Bernoulli;
* estremi rigidi: preferire una trasformazione cinematica degli offset rispetto a un elemento separato duplicato;
* rilasci di estremita: predisporre una gestione tramite condensazione statica dei DOF rilasciati;
* in futuro: elementi biella/truss 2D, aste con molle concentrate, cerniere plastiche o leggi momento-rotazione.

Strategia per evoluzioni non lineari:

* il solver algebrico interno resta accettabile anche per Newton-Raphson, controllo di spostamento e sistemi aumentati, purche sia un solver generale con pivot e non un Cholesky rigido;
* la non linearita deve stare in strategie dedicate, non dentro il solver lineare;
* prevedere in futuro classi separate per load stepping, Newton-Raphson, line search, controllo indiretto di spostamento, eventuale arc-length, criteri di convergenza e gestione dello stato degli elementi;
* gli elementi non lineari dovranno poter calcolare forze interne, matrice tangente, commit/rollback dello stato e variabili interne;
* il primo core FEM deve essere progettato in modo sostituibile: se in futuro servono `ml-matrix`, `math.js`, solver sparsi o backend WASM, il cambio deve avvenire nel layer algebrico senza riscrivere elementi e assemblatore.

Fasi di sviluppo suggerite:

1. creare il layer matematico minimo con solver denso LU/Gauss con pivot parziale e test su sistemi piccoli, singolari e quasi singolari;
2. creare il registro DOF, l'assemblatore globale e il solver statico lineare 2D;
3. implementare l'elemento frame 2D Euler-Bernoulli, vincoli nodali semplici e reazioni;
4. implementare carichi equivalenti per carichi distribuiti e concentrati, con recupero dei diagrammi `N`, `V`, `M`;
5. validare il FEM su casi classici di trave: appoggio-appoggio, mensola, incastro-incastro, carico uniforme e carico concentrato;
6. integrare il core nel modulo `rc-cracked-deflection`;
7. aggiungere Timoshenko, offset rigidi, release, molle e spostamenti imposti;
8. introdurre multipoint constraints tramite trasformazione cinematica;
9. progettare solo dopo la base lineare le strategie non lineari Newton/displacement-control.

## Piano per deflessione di travi in c.a. fessurate

Il modulo `rc-cracked-deflection` deve riusare la costruzione della sezione gia presente nel modulo `reinforced-concrete-sections`, quindi `ReinforcedConcreteSection`, materiali NTC/EC2, armature discrete, discretizzazione a fibre e `RCServiceStressSolver`.

Workflow di calcolo:

1. costruire il modello trave con sezione in c.a., materiali, luce/geometria, vincoli e carichi SLE;
2. creare un modello FEM lineare elastico usando una rigidezza iniziale non fessurata, con opzione tra sezione lorda in calcestruzzo e sezione trasformata interamente reagente;
3. risolvere il modello elastico una sola volta e ottenere reazioni, spostamenti elastici, tagli e momenti `M(x)`;
4. non aggiornare la rigidezza globale in funzione della fessurazione, quindi nessuna ridistribuzione iterativa dei momenti;
5. campionare la trave in punti regolari e in corrispondenza di discontinuita di carico, estremi elemento e carichi concentrati;
6. calcolare per ogni punto il momento di fessurazione positivo/negativo `Mcr`, considerando il lembo teso coerente con il segno del momento;
7. se `|M(x)| <= Mcr`, usare la curvatura non fessurata `kappa = M / EI_uncracked`;
8. se `|M(x)| > Mcr`, usare il solver SLE di sezione con calcestruzzo teso escluso per ottenere la curvatura fessurata compatibile con `N(x)` e `M(x)`;
9. predisporre una seconda modalita con curvatura media o tension stiffening, interpolando tra curvatura non fessurata e fessurata;
10. integrare numericamente la curvatura lungo la trave per ottenere rotazioni e frecce, imponendo le condizioni cinematiche coerenti con i vincoli;
11. restituire diagrammi, zone fessurate, massimi, freccia elastica non fessurata di confronto e freccia fessurata finale.

MVP consigliato:

* trave prismatica monodimensionale con sezione costante;
* vincoli iniziali: appoggio-appoggio e mensola;
* carichi iniziali: distribuito uniforme e forza concentrata;
* elemento FEM iniziale: Euler-Bernoulli 2D;
* analisi globale elastica con rigidezza non fessurata;
* calcolo locale della curvatura fessurata tramite `RCServiceStressSolver`;
* doppia integrazione numerica della curvatura senza rianalisi FEM;
* test contro formule elastiche note quando la sezione non fessura;
* test qualitativi/quantitativi dove la freccia fessurata risulta maggiore della freccia elastica non fessurata.

Output attesi del modulo:

* reazioni vincolari;
* diagrammi campionati `x`, `N`, `V`, `M`, `kappa`, rotazione e freccia;
* valori massimi di momento, curvatura e freccia;
* `Mcr` positivo e negativo;
* elenco delle zone fessurate;
* riepilogo dei punti in cui il solver di sezione non converge;
* assunzioni usate: rigidezza elastica globale non aggiornata, cls teso escluso nella sezione fessurata, eventuale modello di tension stiffening.
