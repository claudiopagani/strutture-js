# Tracciabilità normativa

`strutture-js` implementa algoritmi e verifiche, mentre
[`strutture-normative`](https://github.com/claudiopagani/strutture-normative)
conserva il corpus canonico strutturato. Il corpus non è una dipendenza runtime
e non viene incluso nei bundle della libreria.

## Identità e link

L'identità stabile è l'URN canonico. Il permalink del viewer è un resolver per
la consultazione umana e non sostituisce l'URN.

Una formula distingue sempre:

- `unitId`, relativo al paragrafo;
- `assetIds`, relativi a formule, tabelle o figure;
- `relation`, per esempio `implements` o `clarifies`;
- revisione e stato editoriale del corpus;
- `resolutionStatus`, che vale `outside-corpus` quando il riferimento non è
  ancora disponibile nel perimetro trascritto.

I riferimenti runtime del calcestruzzo armato sono definiti in
`src/norms/ntc2018/normativeReferences.js`. Nei risultati vanno conservati in
`metadata.normativeReferences`; i campi testuali preesistenti restano
temporaneamente disponibili per compatibilità.

La disponibilità di un algoritmo e la sua tracciabilità sono due assi
indipendenti:

- `status: available` descrive l'implementazione software;
- `resolved-current-corpus` indica un riferimento canonico disponibile;
- `partial-current-corpus` indica un insieme misto di riferimenti risolti e
  fuori corpus;
- `outside-current-corpus` indica che la fonte necessaria non è ancora nel
  corpus;
- `computational-contract` identifica trasformazioni e contratti software che
  non sono, da soli, una regola normativa.

Lo stato editoriale `extracted` non equivale ad approvazione tecnica. Per
questo i risultati espongono `normativeConformityClaimed: false`.

## Audit delle scelte progettuali

`auditNTC2018RcDesignBasis` controlla, prima del post-processing FEM:

- comportamento strutturale e tipologia;
- fattore di comportamento calcolato e, se fornito, quello dichiarato;
- ammissibilità del metodo di analisi rispetto ai dati forniti;
- disponibilità delle famiglie implementative richieste;
- limiti attuali della tracciabilità.

L'audit è solver-neutral. Il flusso previsto è:

```text
solutore esterno
  -> adapter del consumer
  -> GlobalFemModel/Analysis/ResultContract
  -> audit delle scelte e post-processing strutture-js
  -> verifiche locali e aggregazione dell'edificio
```

L'adapter del solutore resta nel consumer; non è una dipendenza di
`strutture-js`.

## Procedura per modifiche normative

Prima di modificare una formula, un coefficiente, un limite o un ramo
decisionale:

1. individuare l'unità e gli asset nella revisione bloccata di
   `strutture-normative`;
2. verificare lo stato editoriale e le issue aperte, senza promuovere
   automaticamente un record `extracted`;
3. distinguere testo normativo, chiarimento della Circolare, metodo esterno e
   interpretazione implementativa;
4. aggiungere il riferimento strutturato al codice e al risultato;
5. aggiungere o aggiornare test numerici e validazione indipendente;
6. eseguire il controllo coordinato.

Il controllo locale usa per default la repository sorella
`../strutture-normative`:

```bash
npm run check:normative-references
```

Un percorso diverso può essere fornito con:

```bash
npm run check:normative-references -- --corpus <percorso>
```

La revisione del corpus è intenzionalmente bloccata. Un aggiornamento richiede
impact analysis, aggiornamento dei riferimenti e riesecuzione delle campagne
pertinenti.

## Metodi esterni

EN 1992, metodi scientifici e benchmark esterni mantengono la propria identità.
Un rinvio NTC a un'altra norma non autorizza a presentare qualunque edizione o
metodo esterno come prescrizione NTC 2018. La relazione va dichiarata e il
campo di validità deve restare esplicito.

I metodi EN 1992 attualmente usati per aderenza, ancoraggio, pressione locale,
deformabilità, punzonamento e modelli tirante-puntone sono registrati come
fonti esterne e non vengono ri-etichettati come formule NTC. In particolare:

- NTC 2018 § 4.1.2.3.5.4 identifica la verifica a punzonamento e rinvia a
  metodi affidabili; le edizioni EN 1992 implementate restano riferimenti
  esterni distinti;
- NTC 2018 § 4.1.2.3.7 ammette i modelli tirante-puntone; le resistenze di
  puntoni, tiranti e nodi implementate provengono da EN 1992-1-1:2004;
- NTC 2018 § 4.1.2.2.2 definisce l'obiettivo prestazionale della
  deformabilità, la tabella C4.1.I della Circolare chiarisce lo screening
  semplificato e il metodo di integrazione delle curvature è identificato
  separatamente.

I riferimenti ai capitoli non ancora presenti nel corpus non vengono
ricostruiti per plausibilità: sono registrati come `outside-corpus` fino alla
relativa trascrizione e review. Questo vale attualmente, tra gli altri, per le
fondazioni del § 6.4 e per regolarità e analisi globali dei §§ 7.2-7.3.
