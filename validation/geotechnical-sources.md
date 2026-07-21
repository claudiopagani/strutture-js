# Geotechnical Validation Sources

## Fonti primarie

| Fonte | Uso nel modulo | Limite conservato |
| --- | --- | --- |
| [JRC, Assembling the Ground Model and the Derived Values](https://eurocodes.jrc.ec.europa.eu/publications/assembling-ground-model-and-derived-values) | Riferimento concettuale per separare modello interpretato del sito, rappresentazioni in sezione, valori derivati e successive scelte di progetto. | Il riferimento non prescrive gli schemi software e non rende i DTO una implementazione normativa completa dell'Eurocodice 7. |
| [USACE EM 1110-2-1902, Slope Stability (2003)](https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-1902.pdf) | Riferimento primario per metodo ordinario, Bishop semplificato, Spencer, discretizzazione, pressione interstiziale, ricerca e verifica dei risultati. | Il workflow resta circolare. Bishop non soddisfa l'equilibrio orizzontale e non è usato col sisma; non sono implementati acqua esterna, fessure di trazione, rapido svaso, superfici non circolari o filtrazione. |
| [USACE EM 1110-1-1905, Geotechnical Design of Shallow Foundations on Soils (2025)](https://publibrary.sec.usace.army.mil/api/download?filename=EM+1110-1-1905_Geotechincal+Design+of+Shallow+Foundations+on+Soils_2025+07+22+-+Final.pdf&id=54658636-77d2-48df-f26b-5295a01899a7&preview=true) | Dimensioni efficaci, capacità portante USACE/Meyerhof e FHWA/Vesic, correzione di falda, punch-through `2V:1H`, scorrimento, tensioni verticali approssimate e cedimento immediato Schmertmann; esempi B-3/B-4/C-7. | Il solver corrente è statico, con base e terreno orizzontali; il punch-through è limitato a strato forte sopra strato debole non drenato. Il ramo SLS non include il fattore temporale `C2`, consolidazione o creep. Il totale stampato dell'esempio C-7 è internamente incoerente con i contributi di riga e non è usato come target. |
| [FHWA GEC 6, Shallow Foundations, FHWA-IF-02-054 (2002)](https://www.fhwa.dot.gov/engineering/geotech/pubs/010943.pdf) | Fattori Vesic, correzioni di falda e politica di esclusione del fattore d'inclinazione quando sono usati i fattori di forma. | Il ramo FHWA resta un metodo di capacità ultima; non produce resistenza di progetto o verifica normativa senza adapter. |
| [USACE EM 1110-2-2906, Design of Pile Foundations (1991)](https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-2906.pdf) | Capacità assiale del palo singolo come somma di fusto e punta; metodo efficace `K sigma'_v tan(delta)`, metodo non drenato `alpha su`, punta `Nq sigma'_v` o `Nc su`, calcolo strato per strato e distinzione compressione/trazione. | Coefficienti, limiti e conversione a resistenza di progetto non sono dedotti dalla tecnologia del palo. Il kernel non risolve compatibilità dei picchi, strati deboli vicini alla punta, attrito negativo, cedimenti, gruppi o risposta ciclica. |
| [FHWA GEC 9, FHWA-HIF-18-031, Design and Analysis of Laterally Loaded Deep Foundations (2018)](https://www.fhwa.dot.gov/engineering/geotech/pubs/hif18031.pdf) | Metodo limite Broms, equazioni 6-8--6-17; modello `p-y` come trave su molle non lineari, equazioni 6-1--6-5; grandezze di risposta e cautele sulla base empirica delle curve. | Broms resta limitato a pali corti omogenei. Il solver `p-y` usa curve statiche monotone assegnate e `EI` costante: non genera correlazioni empiriche, non include carico assiale/geometrico, ciclico/sisma, gruppi, moto del terreno o verifica strutturale. |
| [NIST GCR 12-917-21, Soil-Structure Interaction for Building Structures (2012)](https://www.nist.gov/publications/soil-structure-interaction-building-structures) | Rigidezze statiche verticali e rocking di Pais-Kausel per fondazioni rettangolari rigide, inclusi i moltiplicatori di incasso delle tabelle 2-2a/2-2b. | Richiede un semispazio elastico omogeneo equivalente e rigidezza compatibile con il livello deformativo; non rappresenta contatto non lineare, stratigrafia generale o fondazioni flessibili. |
| [FEMA P-2091, A Practical Guide to Soil-Structure Interaction (2020)](https://www.fema.gov/sites/default/files/documents/fema_p-2091-soil-structure-interaction.pdf) | Controllo indipendente delle equazioni di rigidezza NIST/Pais-Kausel e delle cautele su variabilità e riduzione della rigidezza del terreno. | La guida è orientata all'interazione terreno-struttura; il kernel usa soltanto il ramo statico dichiarato e non implementa la risposta dinamica della fondazione. |
| [Spencer, A method of analysis of the stability of embankments assuming parallel inter-slice forces (1967)](https://doi.org/10.1680/geot.1967.17.1.11) | Formulazione originaria del metodo con risultanti interstriscia parallele e soluzione congiunta del fattore di sicurezza e della loro inclinazione. | L'implementazione corrente usa basi rettilinee di striscia e superfici circolari; la trazione normale non viene sostituita implicitamente con una fessura. |
| [USBR Design Standards No. 13, Chapter 4, Static Stability Analysis (2011)](https://www.usbr.gov/tsc/techreferences/designstandards-datacollectionguides/finalds-pdfs/DS13-4.pdf) | Equazioni di ricorrenza e procedura di soluzione di Spencer, incluse le forze esterne applicate alle strisce. | L'azione pseudostatica implementata è un carico statico equivalente; il solver non determina `kh`, `kv`, risposta dinamica o spostamenti permanenti. |
| [USACE EM 1110-2-2502, Retaining and Flood Walls (1989)](https://www.publications.usace.army.mil/portals/76/publications/engineermanuals/em_1110-2-2502.pdf) | Pressioni attive, passive e a riposo; Coulomb con geometria planare; analisi non drenata con `phi_u=0` e `c=su`; separazione tra terreno e acqua; metodo generale a cunei e approssimazione stratificata a inclinazione costante del paragrafo 3-13c(4)(b). | La spinta passiva richiede movimenti compatibili. Coulomb passiva e limitata a `delta <= phi/3`; il cuneo stratificato implementato fornisce una risultante approssimata e non una distribuzione. La fessura di trazione riempita d'acqua non e dedotta automaticamente. |
| [USACE EM 1110-2-2502, Retaining and Flood Walls (2022), tabella 6.2](https://www.publications.usace.army.mil/Portals/76/Users/182/86/2486/EM%201110-2-2502.pdf) | Classi di superficie della parete e valori raccomandati di `delta` o `delta/phi` in funzione della classe di terreno a contatto. | I valori sono esposti come `indicative`, richiedono autorizzazione esplicita e sono limitati a `delta <= phi`; muratura, legno e superfici non tabellate richiedono valori di progetto. |
| [Caltrans Trenching and Shoring Manual (2025), capitolo 4](https://dot.ca.gov/-/media/dot-media/programs/engineering/documents/structureconstruction/ts/ts-chpt-4-a11y.pdf) | Equilibrio del cuneo attivo generale con parete inclinata e attrito di parete; controllo del segno delle componenti e massimizzazione rispetto al piano di scorrimento. | La combinazione con l'approssimazione stratificata USACE e una inferenza metodologica esplicitamente dichiarata; adesione di parete e superficie di rottura curva non sono incluse. |
| [USACE EM 1110-2-2100, Stability Analysis of Concrete Structures (2005), Appendix G](https://www.publications.usace.army.mil/portals/76/publications/engineermanuals/em_1110-2-2100.pdf) | Equazioni di Mononobe-Okabe, angolo d'inerzia e condizioni di applicabilita. | Mononobe-Okabe fornisce la risultante, non una distribuzione univoca; il modulo limita la formula chiusa a terreno omogeneo, asciutto e incoerente. |
| [FHWA-HRT-05-067, Seismic Retrofitting Manual for Highway Structures, Part 2 (2006)](https://rosap.ntl.bts.gov/view/dot/834/dot_834_DS1.pdf) | Poligono delle forze del cuneo pseudo-statico, inerzia orizzontale/verticale e ricerca del cuneo che massimizza la spinta attiva. | Il modulo combina questo equilibrio pseudo-statico con l'approssimazione stratificata USACE; la combinazione e dichiarata come inferenza metodologica e non come formula chiusa della fonte. |
| [FHWA IF-99-015, Ground Anchors and Anchored Systems (1999)](https://www.fhwa.dot.gov/engineering/geotech/pubs/if99015.pdf) | Stati di spinta e comportamento delle paratie ancorate; progetto dei tiranti cementati; sezione 5.8.3.2 per superfici dietro ciascun ordine e forza intera o proporzionale quando la superficie passa davanti al bulbo o lo attraversa. | Curve pressione-spostamento e rigidezze restano input assegnati. Il progetto del tirante è separato dalla verifica strutturale di parete/correnti; il solver globale usa Spencer, tensione di aderenza uniforme e forza di progetto di una sorgente verificata. |
| [FHWA-HRT-10-077, Composite Behavior of Geosynthetic Reinforced Soil Mass, Chapter 6 (2013)](https://www.fhwa.dot.gov/publications/research/infrastructure/10077/006.cfm) | Riferimento istituzionale per il ruolo di molle/interfacce, tiranti o puntoni e costruzione per fasi nei modelli geotecnici agli elementi finiti. | Il modulo paratie usa una trave su molle indipendenti e una sequenza ridotta; non implementa il continuo geotecnico descritto dalla panoramica. |
| [Shi, Gong e Zhang, Earth pressure of layered soil on retaining structures, Soil Dynamics and Earthquake Engineering 83 (2016)](https://doi.org/10.1016/j.soildyn.2015.12.015) | Confronto indipendente sul problema stratificato statico e dinamico e sui limiti delle superfici piane, in particolare per la passiva con attrito di parete. | Il metodo numerico dell'articolo, basato su elementi sottili e superficie ottimizzata, non e riprodotto dal kernel a cuneo piano. |
| [D.M. 17 gennaio 2018, NTC 2018](https://www.gazzettaufficiale.it/eli/id/2018/02/20/18A00716/sg), sezione 7.11.6.2.1 | Adapter esplicito `kh=betaM*(amax/g)` e `kv=+/-0.5kh` per muri di sostegno. | `amax/g`, `betaM` e scelta del segno di `kv` non vengono inferiti dal modulo. |
| [ISO 14688-1:2017](https://www.iso.org/standard/66345.html) e [ISO 14688-2:2017](https://www.iso.org/standard/66346.html) | Tassonomia generale del catalogo di tipologie di terreno. | Il catalogo e solo classificatorio: non fornisce valori meccanici o correlazioni sito-specifiche. |

## Campagna automatica

`validation/geotechnicalValidationCampaign.js` esegue tredici casi:

1. Rankine attiva in sabbia omogenea, con coefficiente, risultante e quota di
   applicazione verificati mediante aritmetica indipendente;
2. profilo Rankine a due strati, con salto del coefficiente e integrazione
   indipendente triangolo/trapezio;
3. separazione tra spinta efficace e spinta idrostatica;
4. equazione Mononobe-Okabe di USACE Appendix G valutata con costanti
   indipendenti;
5. Coulomb attiva e passiva con superficie inclinata;
6. Rankine non drenata attiva e passiva in tensioni totali;
7. cuneo pseudo-statico omogeneo confrontato con Mononobe-Okabe;
8. cuneo pseudo-statico a due strati confrontato con una espressione
   indipendente dei pesi e delle forze dei due segmenti;
9. cuneo con parete inclinata e attritiva, a sisma nullo, confrontato con il
   valore chiuso indipendente di Coulomb e con le componenti della risultante;
10. interpolazione lineare della superficie e query indipendente della zona in
    `GroundSection2D`;
11. pressione sotto linea freatica e interpolazione bilineare indipendente di
    una griglia `PorePressureField2D`;
12. estrusione 1D-2D e risoluzione tracciata dei parametri mediante
    `GroundModel` e `GeotechnicalDesignSituation`;
13. coefficienti sismici NTC 2018 valutati con aritmetica indipendente.

Le tolleranze sono assolute e dichiarate per ciascun confronto. I valori
attesi sono costanti nel caso di validazione e non sono calcolati richiamando i
kernel sottoposti a verifica.

`validation/geotechnicalSlopeStabilityValidationCampaign.js` aggiunge sette
casi indipendenti:

1. equazioni USACE C-12, C-15 e C-16 su strisce assegnate;
2. area e peso di una massa confrontati con la formula esatta del segmento
   circolare;
3. identità fra Bishop e metodo ordinario nel limite in tensioni totali con
   `phi_u = 0` e geometria compatibile;
4. Spencer statico nel limite `phi = 0`, confrontato con la chiusura analitica
   dei momenti e con l'inclinazione interstriscia costruita;
5. lo stesso limite con inerzia orizzontale pseudostatica, verificando
   separatamente fattore, forza locale e momento globale;
6. intersezione linea-circonferenza e rapporti FHWA di forza piena,
   proporzionale nel bulbo e nulla dietro il bulbo;
7. chiusura analitica di Spencer con azione puntuale resistente, componenti
   firmate e momento applicato.

`validation/geotechnicalShallowFoundationValidationCampaign.js` aggiunge
quattro casi indipendenti:

1. esempio pubblicato USACE B-3 con rottura nello strato superficiale e
   punch-through nella argilla debole;
2. esempio pubblicato USACE B-4 in condizioni non drenate;
3. ricalcolo chiuso delle dimensioni efficaci di una fondazione circolare
   eccentrica;
4. equilibrio chiuso dello scorrimento drenato con attrito e adesione.

`validation/geotechnicalShallowFoundationServiceabilityValidationCampaign.js`
aggiunge quattro casi indipendenti:

1. fattore di influenza delle tensioni per il quadrato dell'esempio USACE
   C-7 confrontato con il valore tabellato;
2. percorso completo delle equazioni Schmertmann sui dati di strato C-7, con
   `C2=1` e target ricalcolato indipendentemente dai contributi pubblicati;
3. rigidezze verticali e rocking Pais-Kausel per un rettangolo 2 m x 4 m,
   confrontate con costanti indipendenti;
4. cedimento differenziale e distorsione angolare verificati con geometria
   chiusa.

`validation/geotechnicalRetainingWallValidationCampaign.js` aggiunge tre casi
indipendenti:

1. spinta Rankine, quota della risultante, pesi e attrito di base di un muro a
   mensola asciutto;
2. forza e baricentro di una distribuzione lineare di uplift con carichi
   idraulici diversi a punta e tallone;
3. inerzia pseudostatica orizzontale e verticale di un componente del muro,
   verificata direttamente da `kh W` e `kv W`.

`validation/geotechnicalDeepFoundationValidationCampaign.js` aggiunge tre casi
indipendenti:

1. integrazione del fusto a due strati con metodo `beta`, falda idrostatica e
   punta `Nq`;
2. fusto `alpha su` e punta `Nc su` in condizioni non drenate;
3. trazione non drenata con sola resistenza di fusto e punta nulla.

`validation/geotechnicalLateralPileValidationCampaign.js` aggiunge tre casi
indipendenti:

1. ramo Broms coesivo con ricalcolo delle equazioni 6-8--6-12 e della radice
   di capacita per l'infissione disponibile;
2. ramo Broms incoerente con `Kp`, momento massimo, capacita nominale e fattore
   di conversione assegnato;
3. ramo incoerente completamente sommerso con controllo indipendente di
   `gamma_sat - gamma_w` e della capacita risultante.

`validation/geotechnicalLateralPilePyValidationCampaign.js` aggiunge tre casi
indipendenti:

1. nucleo di trave confrontato con la soluzione chiusa di una mensola
   Euler-Bernoulli;
2. palo lungo con legge `p-y` lineare confrontato con la soluzione chiusa
   semi-infinita di Winkler, con tolleranze esplicite per lunghezza finita e
   discretizzazione;
3. equilibrio esatto di una molla `p-y` a plateau accoppiata a un elemento
   flessionale con rotazioni e punta vincolate.

`validation/geotechnicalEmbeddedRetainingWallValidationCampaign.js` aggiunge
tre casi indipendenti:

1. paratia a mensola con pressione uniforme confrontata con spostamento,
   rotazione e momento della soluzione chiusa Euler-Bernoulli;
2. paratia lunga tra due letti lineari uguali confrontata con la soluzione
   semi-infinita di Winkler usando la rigidezza combinata dei due lati;
3. singolo grado di liberta flessionale con sostegno elastico confrontato con
   la somma indipendente delle rigidezze della trave e del sostegno.

`validation/geotechnicalGroundAnchorValidationCampaign.js` aggiunge tre casi
indipendenti riferiti a FHWA GEC 4, FHWA-IF-99-015 (1999), sezioni 5.3, 6.4 e
7.4.5:

1. intersezione esatta del bulbo con due zone e somma delle capacita di
   trasferimento ammissibili;
2. conversione della reazione orizzontale per unita di parete nella forza del
   singolo tirante inclinato;
3. lunghezza libera apparente ricalcolata con l'equazione 49 e movimento di
   creep fra 1 e 10 minuti.
