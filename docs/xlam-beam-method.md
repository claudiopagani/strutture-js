# XLAM Beam Method

Questo documento descrive il primo workflow per usare una striscia di pannello XLAM come trave semplice nel motore `SingleBeamAnalysis`.

## Dominio

* modello monodimensionale di striscia XLAM;
* analisi FEM Timoshenko;
* sezioni costanti lungo la trave;
* verifiche ULS da azioni FEM per flessione e rolling shear;
* verifica SLE di freccia verticale da combinazioni FEM;
* vibrazioni e incendio dichiarati fuori dominio.

## Provider

`XlamBeamSectionProvider` espone:

* `axialRigidity = E0 * Aactive`;
* `flexuralRigidity = EJ` calcolata da `XlamPanelSection.calculateBendingStiffness`;
* `shearRigidity = GA` per il modello Timoshenko;
* `shearCorrectionFactor = 1`, perche `GA` e gia passato come rigidezza efficace;
* metadata di layer, larghezza efficace, spessore attivo, `kdef`, rigidezza finale e sorgente della rigidezza a taglio.

Nota sulla rigidezza a taglio:

* il valore `shearStiffness` prodotto dal metodo piastra 1D esistente puo essere troppo piccolo per essere usato direttamente come `GA` del frame Timoshenko;
* il provider usa quindi un fallback da rolling shear degli strati trasversali quando necessario;
* la sorgente scelta e riportata in `metadata.beamShearRigiditySource`.

## Verificatore

`XlamBeamVerification` usa `BeamSectionActionVerifier` e quindi funziona sia:

* come modulo standalone, con `analysisResult` passato esplicitamente;
* dentro `SingleBeamDesignApplication`, con `verificationStations` propagate dal `beamInput`.

Check attuali:

* `xlam-beam-bending`: tensione di bordo da `MEd`;
* `xlam-beam-rolling-shear`: tensione tangenziale semplificata negli strati trasversali da `VEd`;
* `xlam-beam-deflection`: freccia verticale da combinazioni SLE.

Warning permanenti:

* vibrazioni non implementate;
* incendio non implementato.

## Esempio

`createXlamStripBeamReportModel()` genera il report `xlam-strip-report` con:

* pannello 5 strati;
* striscia larga 1000 mm;
* trave appoggio-appoggio;
* combinazioni SLU, SLE rara e SLE quasi permanente;
* stazioni di verifica controllate con griglia e mezzeria utente.
