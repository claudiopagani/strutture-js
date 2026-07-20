# Implementation Boundaries

Questa pagina separa tre livelli che nei report devono restare distinti: limiti implementativi, ipotesi normative e scelte numeriche.

## Limiti Implementativi

Un limite implementativo descrive cio che la libreria non calcola ancora o non supporta ancora in modo generale.

Esempi attuali:

* la libreria non e un software normativo completo;
* il modello bilineare NTC 2018/Circolare 2019 del maschio copre la muratura
  ordinaria esistente in analisi statica non lineare allo SLC; non copre ancora
  muratura armata, confinata, fasce di piano o il profilo autonomo a tre
  meccanismi per costruzioni nuove;
* `masonry-ring-beams`, `masonry-out-of-plane` e `micropiles-broms` restano placeholder dichiarati;
* il modulo `geotechnical-earth-pressures` calcola Rankine stratificata in
  tensioni efficaci o totali, pressione a riposo, Coulomb attiva/passiva
  omogenea, Mononobe-Okabe attiva omogenea e il cuneo pseudo-statico
  stratificato a inclinazione costante con parete planare inclinata e
  attritiva nel campo documentato; restano fuori campo le superfici di rottura
  curve, la falda nel cuneo pseudo-statico e le verifiche di muri, paratie,
  pali e fondazioni;
* `geotechnical-slope-stability` risolve pendii statici e pseudostatici 2D su
  superfici circolari con Spencer; Bishop semplificato e metodo ordinario
  restano confronti statici. Sono inclusi terreni stratificati, falda
  assegnata e sovraccarichi verticali nel campo documentato. Non sono coperti
  risposta dinamica o spostamenti permanenti, inerzia dei sovraccarichi,
  superfici non circolari, acqua esterna, fessure di trazione, rinforzi,
  analisi 3D o verifiche normative automatiche;
* `geotechnical-shallow-foundations` copre capacita ULS statica e cedimento
  immediato SLS nel campo dei metodi documentati. Lo SLS separa CPT, modulo
  vincolato e semispazio elastico equivalente e fornisce movimenti/rigidezze
  solo quando giustificati dal metodo. Non copre consolidazione o creep,
  cedimenti sismici, fondazioni flessibili o interagenti, contatto non lineare,
  base o piano campagna inclinati, passiva di incasso, uplift o verifiche
  normative automatiche;
* `GroundModel`, `GroundSection2D`, `PorePressureField2D` e
  `GeotechnicalDesignSituation` sono contratti dati operativi e serializzabili:
  non costituiscono da soli un solutore di filtrazione, capacita portante,
  cedimento, interazione terreno-struttura o FEM continuo; la sezione e 2D con
  superficie monovaluata rispetto a `x`, zone poligonali senza fori e campo di
  pressione interstiziale assegnato;
* le verifiche acciaio non coprono ancora torsione e proprieta efficaci per classe 4;
* il workflow pilastri RC esegue lo screening della snellezza e richiede
  momenti totali espliciti per le aste snelle; non genera ancora gli effetti del
  secondo ordine e non include duttilita o dettaglio completo;
* la torsione RC copre il traliccio periferico e l'interazione taglio-torsione
  nel campo documentato, ma non il dettaglio completo o la torsione da
  ingobbamento;
* il workflow dei plinti isolati copre il contatto completo e rileva la perdita
  di contatto; le verifiche strutturali sono limitate a plinti rettangolari con
  pilastro centrato e le resistenze geotecniche restano input assegnati;
* il workflow delle travi di fondazione usa un letto di Winkler lineare
  bilaterale condensato in molle nodali tributarie; segnala le reazioni di
  trazione ma non risolve ancora il contatto monolatero, e non calcola modulo
  di sottofondo o cedimenti geotecnici;
* il workflow dei nodi trave-pilastro RC verifica localmente una direzione
  sismica assegnata secondo NTC 2018; non genera azioni o capacita dal telaio e
  non include ancora ancoraggi, trasferimento eccentrico o interazione 3D;
* il workflow tirante-puntone RC risolve e verifica una topologia 2D assegnata;
  non genera i percorsi di carico, non rimuove iterativamente aste con segno
  incompatibile e non verifica ancora ancoraggi o armature di splitting;
* le verifiche legno/XLAM sono validate sui casi coperti, ma richiedono campagne piu ampie per usi fuori da quei domini.

Nei risultati, questi casi dovrebbero emergere come `not-implemented` se il workflow non esiste ancora, oppure `not-supported` se il workflow esiste ma il caso richiesto esce dal campo coperto.

## Ipotesi Normative

Un'ipotesi normativa descrive il modo in cui una regola tecnica e stata interpretata o parametrizzata.

Esempi:

* scelta di NTC 2018 o Eurocodice come riferimento;
* coefficienti parziali, fattori di combinazione, classi di durata e classi di servizio;
* fattori di confidenza per materiali esistenti;
* mapping tra ambiente, combinazione e classe di fessurazione;
* scelta di curva di instabilita o fattore nazionale quando il riferimento lo richiede.

Queste ipotesi vanno dichiarate in `assumptions`, `notes`, report Markdown o documenti metodologici. Non vanno nascoste dentro costanti locali senza una traccia testabile.

## Scelte Numeriche

Una scelta numerica descrive come il problema viene discretizzato, risolto o confrontato.

Esempi:

* unita interne `N` + `mm` per le sezioni e `kN` + `m` per molti esempi FEM;
* modello FEM 2D lineare per `single-beam-design`;
* condensazione tributaria delle molle del sottofondo nelle travi di
  fondazione, da accompagnare con controllo di convergenza della mesh;
* discretizzazione delle stazioni e aggiunta di stazioni utente per le verifiche;
* formule chiuse usate come benchmark per travi semplici;
* bilinearizzazione delle curve di capacita con rigidezza secante al 70% e soglia post-picco al 20%;
* metodo gamma per sistemi legno-XLAM e legno-calcestruzzo collaboranti.

Le scelte numeriche vanno coperte da test o casi di validazione quando influenzano risultati pubblici.

## Regola Pratica

Quando si aggiunge o modifica un workflow:

* se manca una capacita del software, documentarla come limite implementativo;
* se si sceglie una lettura della norma, documentarla come ipotesi normativa;
* se si sceglie un algoritmo, una tolleranza o una discretizzazione, documentarla come scelta numerica;
* se il caso entra nella campagna di validazione, indicare fonte, ipotesi, tolleranza e grandezze confrontate.
