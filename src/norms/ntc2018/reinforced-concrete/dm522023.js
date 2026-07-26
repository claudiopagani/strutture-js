/**
 * Scope of D.M. 9 March 2023, no. 52.
 *
 * This decree does not amend reinforced-concrete material properties,
 * partial factors or detailing rules. It only changes the transitional
 * provisions of article 2 of D.M. 17 January 2018 and temporarily suspends
 * the application of two product-qualification clauses in chapter 11.
 *
 * Official source:
 * https://www.gazzettaufficiale.it/eli/id/2023/03/22/23A01847/sg
 */

export const DM522023_REFERENCES = Object.freeze([
  Object.freeze({
    source: "D.M. 9 marzo 2023, n. 52",
    publication: "G.U. Serie Generale n. 69 del 22 marzo 2023",
    url: "https://www.gazzettaufficiale.it/eli/id/2023/03/22/23A01847/sg",
  }),
  Object.freeze({
    source: "D.M. 17 gennaio 2018",
    provision: "articolo 2, come modificato dal D.M. 52/2023",
    url: "https://www.gazzettaufficiale.it/eli/id/2018/02/20/18A00716/sg",
  }),
]);

export const DM522023_AMENDMENTS = Object.freeze({
  decreeDate: "2023-03-09",
  publicationDate: "2023-03-22",
  effectiveDate: "2023-03-23",
  transitionalDeliveryDeadlineYears: 7,
  temporarySuspensions: Object.freeze([
    Object.freeze({
      ntc2018Clause: "11.4.2",
      scope: "entire-clause",
      suspendedUntil: "2025-03-22",
    }),
    Object.freeze({
      ntc2018Clause: "11.5.2",
      scope: "passive-geotechnical-anchors-only",
      suspendedUntil: "2025-03-22",
    }),
  ]),
  reinforcedConcreteChapter4Overrides: Object.freeze([]),
  reinforcedConcreteChapter7Overrides: Object.freeze([]),
});

/**
 * Report whether D.M. 52/2023 changes a requested NTC 2018 clause.
 *
 * The function is intentionally descriptive: it must not be used to alter
 * chapter 4 or chapter 7 reinforced-concrete calculations.
 *
 * @param {string} ntc2018Clause
 * @returns {{
 *   amended: boolean,
 *   amendment: Object|null,
 *   references: readonly Object[]
 * }}
 */
export function describeDM522023Amendment(ntc2018Clause) {
  const clause = String(ntc2018Clause ?? "").trim();
  if (clause.length === 0) {
    throw new Error("ntc2018Clause is required.");
  }

  const amendment = DM522023_AMENDMENTS.temporarySuspensions.find(
    (entry) => entry.ntc2018Clause === clause,
  ) ?? null;

  return {
    amended: amendment != null,
    amendment,
    references: DM522023_REFERENCES,
  };
}
