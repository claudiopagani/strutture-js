# Steel beams module

Questo documento chiude il perimetro pubblico del modulo travi in acciaio di
`strutture-js`. Il modulo resta generico: non contiene view model, label UI,
dropdown, form schema o logiche specifiche del sito.

Per il metodo di calcolo dettagliato vedi anche
[`steel-beam-method.md`](./steel-beam-method.md).

## API pubbliche principali

Profilario:

* `STEEL_PROFILE_FAMILIES`
* `STEEL_PROFILE_SECTION_NAMES`
* `getSteelProfileSectionData(profileName)`
* `listSteelProfileSectionsByFamily(family)`
* `createSteelProfileSection(options)`

Sezioni composte:

* `createSteelCompoundProfileSection(options)`
* `createDoubleUPNBackToBackSection(options)`
* `createDoubleAngleOpposedSection(options)`
* `SteelCompoundProfileSection`

Verifiche:

* `createSteelBeamSectionProvider(options)`
* `SteelMemberVerification`
* `classifySteelSection(options)`
* `verifySteelCompressionBuckling(options)`
* `verifySteelLateralTorsionalBuckling(options)`
* `verifySteelBeamColumnInteractionMy(options)`
* `verifySteelBeamColumnInteractionMyMz(options)`
* `getSteelVerificationCapabilities(options)`

## Profilario

Il catalogo integrato comprende:

* I/H e canali: `IPE`, `HEA`, `HEB`, `HEM`, `UPN`
* tubolari: `CHS`, `SHS`, `RHS`
* angolari: `L`, `LU`
* altri profili: `T`, `FLAT`, `ROUND`

Le proprieta geometriche del catalogo sono espresse nella unita del catalogo
`{ force: "N", length: "m" }` e vengono convertite internamente in
`{ force: "N", length: "mm" }` quando si crea una `SteelProfileSection`.

### Convenzione assi del profilario

Per i profili in acciaio si usa la convenzione del profilario europeo: l'asse
`y-y` e orizzontale, parallelo alle ali e forte; l'asse `z-z` e verticale,
parallelo all'anima e debole; l'asse `x-x` e l'asse longitudinale dell'asta.
Per un IPE/HE ordinario `Iy`, `Wel_y` e `Wpl_y` sono quindi le proprieta
forti, mentre `Iz`, `Wel_z` e `Wpl_z` sono le proprieta deboli.

Le righe generate per le famiglie estese includono metadati di fonte e modello:

* `catalog_source`
* `catalog_source_url`
* `producer`
* `property_standard`
* `property_model`

## Capabilities

`getSteelVerificationCapabilities({ section, profileName, units })` restituisce
una mappa tecnica dei controlli disponibili. Gli stati possibili sono:

* `supported`
* `automatic`
* `requires-input`
* `requires-override`
* `not-required`
* `not-supported`

Questa API serve alla repo consumer per decidere se chiedere input aggiuntivi
come `Mcr`, lunghezze libere, oppure un override esplicito. Non e una API di UI:
non produce label, ordinamenti o messaggi localizzati.

## Supporto attuale

Classificazione locale:

* supportata per `IPE`, `HEA`, `HEB`, `HEM`, `UPN`
* supportata per `CHS`, `SHS`, `RHS`, `ROUND`, `FLAT`
* supportata in modo conservativo per `L`, `LU`, `T`
* non supportata per `COMPOUND`

Instabilita di compressione:

* automatica per `IPE`, `HEA`, `HEB`, `HEM`, `UPN`
* automatica per `CHS`, `SHS`, `RHS`, `ROUND`, `FLAT`
* `L`, `LU`, `T` richiedono override esplicito per il solo controllo
  flessionale y/z; torsionale e flesso-torsionale restano fuori
* `COMPOUND` richiede un verificatore dedicato

Instabilita flesso-torsionale:

* `IPE`, `HEA`, `HEB`, `HEM`, `RHS`: `Mcr` automatico semplificato
* `CHS`, `SHS`, `ROUND`: controllo classico trattato come non richiesto
* `UPN`, `L`, `LU`, `T`, `FLAT`: richiedono `Mcr` utente o vincolo fisico
  che consenta di disabilitare il controllo
* `COMPOUND`: richiede classificazione e `Mcr` da modello dedicato

Interazioni `N+M`:

* automatiche per famiglie doppiamente simmetriche supportate:
  `IPE`, `HEA`, `HEB`, `HEM`, `CHS`, `SHS`, `RHS`, `ROUND`, `FLAT`
* `UPN` richiede override o estensione dedicata per profili semplicemente
  simmetrici
* `L`, `LU`, `T` richiedono un modello dedicato per profili aperti non
  doppiamente simmetrici
* `COMPOUND` richiede un verificatore dedicato di membro composto

SLE:

* la verifica di freccia verticale e disponibile per qualunque sezione che
  esponga rigidezza flessionale e una combinazione SLE.

## Sezioni composte

Le sezioni composte espongono proprieta geometriche elastiche:

* area
* baricentro
* `Iy`, `Iz`, `Iyz`
* moduli elastici `Wel_y`, `Wel_z`
* ingombri
* massa lineare
* aree di taglio sommate
* costante torsionale come somma delle componenti

Helper disponibili:

```js
createDoubleUPNBackToBackSection({
  profileName: "UPN200",
  gap: 0.02,
  units: { force: "kN", length: "m" },
});

createDoubleAngleOpposedSection({
  profileName: "L60X60X6",
  separationY: 0,
  separationZ: 0,
  units: { force: "kN", length: "m" },
});
```

Le sezioni composte sono pronte per rigidezze elastiche e proprieta
geometriche. Non sono ancora un profilo normativo completo: classificazione
locale, instabilita globale, instabilita locale dei componenti, calastrelli,
saldature, bulloni e collegamenti richiedono un verificatore specifico.

## Confine con i consumer

Ogni applicazione consumer dovrebbe costruire un proprio adapter sopra queste API:

* recupero e filtraggio del catalogo
* ordinamento e label dei profili
* maschere per input di trave, vincoli, carichi e combinazioni
* richiesta di input aggiuntivi in base alle capabilities
* presentazione dei risultati, warning e limiti

`strutture-js` deve invece restare responsabile di:

* proprieta geometriche
* normalizzazione unita
* verifiche
* stati tecnici dei risultati
* serializzazione neutra tramite `toJSON()` e result object.
