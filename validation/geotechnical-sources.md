# Geotechnical Validation Sources

## Fonti primarie

| Fonte | Uso nel modulo | Limite conservato |
| --- | --- | --- |
| [JRC, Assembling the Ground Model and the Derived Values](https://eurocodes.jrc.ec.europa.eu/publications/assembling-ground-model-and-derived-values) | Riferimento concettuale per separare modello interpretato del sito, rappresentazioni in sezione, valori derivati e successive scelte di progetto. | Il riferimento non prescrive gli schemi software e non rende i DTO una implementazione normativa completa dell'Eurocodice 7. |
| [USACE EM 1110-2-1902, Slope Stability (2003)](https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-1902.pdf) | Riferimento primario per il ruolo delle pressioni interstiziali nelle future analisi di stabilita; nella campagna corrente controlla la rappresentazione assegnata del campo, non implementa ancora il metodo delle strisce. | La stabilita del pendio non e ancora operativa. `PorePressureField2D` interpola un campo assegnato e non risolve filtrazione o consolidazione. |
| [USACE EM 1110-2-2502, Retaining and Flood Walls (1989)](https://www.publications.usace.army.mil/portals/76/publications/engineermanuals/em_1110-2-2502.pdf) | Pressioni attive, passive e a riposo; Coulomb con geometria planare; analisi non drenata con `phi_u=0` e `c=su`; separazione tra terreno e acqua; metodo generale a cunei e approssimazione stratificata a inclinazione costante del paragrafo 3-13c(4)(b). | La spinta passiva richiede movimenti compatibili. Coulomb passiva e limitata a `delta <= phi/3`; il cuneo stratificato implementato fornisce una risultante approssimata e non una distribuzione. La fessura di trazione riempita d'acqua non e dedotta automaticamente. |
| [USACE EM 1110-2-2502, Retaining and Flood Walls (2022), tabella 6.2](https://www.publications.usace.army.mil/Portals/76/Users/182/86/2486/EM%201110-2-2502.pdf) | Classi di superficie della parete e valori raccomandati di `delta` o `delta/phi` in funzione della classe di terreno a contatto. | I valori sono esposti come `indicative`, richiedono autorizzazione esplicita e sono limitati a `delta <= phi`; muratura, legno e superfici non tabellate richiedono valori di progetto. |
| [Caltrans Trenching and Shoring Manual (2025), capitolo 4](https://dot.ca.gov/-/media/dot-media/programs/engineering/documents/structureconstruction/ts/ts-chpt-4-a11y.pdf) | Equilibrio del cuneo attivo generale con parete inclinata e attrito di parete; controllo del segno delle componenti e massimizzazione rispetto al piano di scorrimento. | La combinazione con l'approssimazione stratificata USACE e una inferenza metodologica esplicitamente dichiarata; adesione di parete e superficie di rottura curva non sono incluse. |
| [USACE EM 1110-2-2100, Stability Analysis of Concrete Structures (2005), Appendix G](https://www.publications.usace.army.mil/portals/76/publications/engineermanuals/em_1110-2-2100.pdf) | Equazioni di Mononobe-Okabe, angolo d'inerzia e condizioni di applicabilita. | Mononobe-Okabe fornisce la risultante, non una distribuzione univoca; il modulo limita la formula chiusa a terreno omogeneo, asciutto e incoerente. |
| [FHWA-HRT-05-067, Seismic Retrofitting Manual for Highway Structures, Part 2 (2006)](https://rosap.ntl.bts.gov/view/dot/834/dot_834_DS1.pdf) | Poligono delle forze del cuneo pseudo-statico, inerzia orizzontale/verticale e ricerca del cuneo che massimizza la spinta attiva. | Il modulo combina questo equilibrio pseudo-statico con l'approssimazione stratificata USACE; la combinazione e dichiarata come inferenza metodologica e non come formula chiusa della fonte. |
| [FHWA IF-99-015, Ground Anchors and Anchored Systems (1999)](https://www.fhwa.dot.gov/engineering/geotech/pubs/if99015.pdf) | Controllo concettuale degli stati attivo, passivo e a riposo e della dipendenza dalla deformabilita/movimento della struttura. | Non si assume la piena resistenza passiva senza compatibilita cinematica. |
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
