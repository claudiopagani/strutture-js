# Frecce iperstatiche in c.a. - stato MVP

## Obiettivo

Estendere il calcolo delle inflessioni delle sezioni in c.a. da travi isostatiche
a travi iperstatiche, per esempio incastro-incastro e travi continue a piu
campate, con carichi uniformemente distribuiti e sezione/armatura costanti.

## Ipotesi MVP

- Solo carichi uniformemente distribuiti nel flusso `SingleBeamAnalysis`.
- Sezione e armatura costanti lungo la trave.
- Calcestruzzo non reagente a trazione e acciaio lineare elastico in SLE.
- Non linearita geometrica esclusa.
- Tension stiffening con modello zeta esistente.
- Sforzo normale rappresentativo pari a zero nel workflow automatico di trave.

## Stato implementazione

### Fase 1 - Curva M-kappa / EI secante

- [x] Creata `SectionMomentCurvatureCurve`.
- [x] Campionamento della curva fino al massimo momento SLE elastico iniziale,
      con fattore di sicurezza interno.
- [x] Riutilizzo del solver sezionale SLE esistente.
- [x] Calcolo di `EI_sec = |M| / |kappa|` con guardia vicino a `M = 0`.
- [x] Applicazione del tension stiffening.
- [x] Lookup `lookupEI(M)`, `lookupKappa(M)` e `lookupState(M)`.
- [x] Rami positivo e negativo separati, con opzione `symmetric` esplicita.
- [x] Unita esplicite della curva e conversioni verso/dalla FEM.

### Fase 2 - Ciclo iterativo secante

- [x] Creata `HyperstaticDeflectionIteration`.
- [x] Accetta sia `SingleBeamModel` sia input normale da `SingleBeamAnalysis`.
- [x] Inizializzazione da EI elastico trasformato.
- [x] Aggiornamento iterativo degli EI elemento per elemento.
- [x] Rilassamento configurabile.
- [x] Criterio di convergenza sui momenti e sulla variazione di EI.
- [x] Campionamento compatibile della deformata FEM finale.

### Fase 3 - Deformata iperstatica

- [x] Caso a due appoggi mantenuto con correzione lineare globale.
- [x] Caso multi-appoggio corretto con correzione globale liscia, non campata
      per campata.
- [x] Nel caso iperstatico iterato, la freccia finale usa la deformata FEM
      compatibile della trave unica.
- [x] Curvature finali lette dalla curva precalcolata.

### Fase 4 - Integrazione nel flusso principale

- [x] Riconoscimento automatico dell'iperstaticita flessionale tramite vincoli
      `uy/rz`.
- [x] Flusso isostatico storico invariato.
- [x] Flusso iperstatico: curva M-kappa, iterazione secante, momenti finali,
      curvature e frecce.
- [x] Warning in caso di mancata convergenza.
- [x] Output UI-ready per combinazione: `hyperstatic`, `crackedPointCount`,
      `maxZeta`.

### Fase 5 - Integrazione API/UI

- [x] `RCrackedDeflectionApplication` passa `beamModel`/`beamInput`.
- [x] `ReinforcedConcreteBeamVerification` accetta `beamModel`.
- [x] `SingleBeamDesignApplication` inoltra il modello di trave al verifier.
- [x] Esempi report RC passano `beamModel`.
- [x] Export pubblici di `SectionMomentCurvatureCurve` e
      `HyperstaticDeflectionIteration`.
- [x] Adapter SCA espone alias UI `hyperstatic`, `crackedPointCount`, `maxZeta`.

### Fase 6 - Test

- [x] Regressioni isostatiche esistenti confermate.
- [x] Test fixed-fixed con carichi fessuranti e ridistribuzione iperstatica.
- [x] Test trave continua a due campate con appoggio intermedio compatibile.
- [x] Test export package root e applications subpath.
- [x] `npm run check` verde: test, validation e worker bundle.

## Aperto

- [ ] Validazione esterna contro SAP2000/Robot/Strand7 o equivalente:
  - trave incastro-incastro con UDL;
  - trave continua a due campate con UDL.
- [ ] Test numerico su due campate diseguali 1:1.5.
- [ ] Test mirato su oscillazione vicino a Mcr e taratura del rilassamento.
- [ ] Estensione futura per sforzo normale variabile lungo la trave.
- [ ] Eventuale solver lineare banded/sparse se la mesh cresce molto.

## Note per UI

La UI puo leggere direttamente:

- `outputs.combinations[].hyperstatic.active`
- `outputs.combinations[].hyperstatic.converged`
- `outputs.combinations[].hyperstatic.iterations`
- `outputs.combinations[].crackedPointCount`
- `outputs.combinations[].maxZeta`
- `outputs.combinations[].points[]` per diagrammi di momento, curvatura,
  rotazione e freccia.

Nel DTO SCA sintetico gli stessi campi principali sono copiati anche in
`outputs.hyperstatic`, `outputs.crackedPointCount` e `outputs.maxZeta`.
