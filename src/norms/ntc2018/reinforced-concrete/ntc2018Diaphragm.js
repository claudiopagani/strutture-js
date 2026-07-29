/**
 * NTC 2018 chapter-7 rule for horizontal diaphragms.
 *
 * Section 7.4.4.4.1 prescribes one demand transformation: forces obtained
 * from the analysis must be increased by 30%. It does not introduce
 * diaphragm-specific stress, chord or connection resistance equations.
 * Resistance checks remain chapter-4 section checks.
 */

import { withNormativeReferences } from "../../normativeReference.js";
import { NTC2018_RC_CHAPTER_7_4_REFERENCES } from "../normativeReferences.js";

export const NTC2018_DIAPHRAGM_FORCE_FACTOR = 1.30;

export const NTC2018_DIAPHRAGM_REFERENCES = Object.freeze([
  Object.freeze({
    source: "NTC 2018",
    citation: "§ 7.4.4.4.1 (Verifiche di resistenza dei diaframmi orizzontali)",
  }),
]);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be finite; got ${value}.`);
  }
  return number;
}

/**
 * Increase every supplied diaphragm force/moment component by 30%.
 *
 * `analysisActions` is intentionally a flat serializable component map,
 * leaving coordinate systems and units to the surrounding FEM contract.
 */
export function amplifyNTC2018DiaphragmActions({ analysisActions } = {}) {
  if (
    analysisActions == null ||
    typeof analysisActions !== "object" ||
    Array.isArray(analysisActions)
  ) {
    throw new Error("analysisActions must be a component object.");
  }
  const entries = Object.entries(analysisActions);
  if (entries.length === 0) {
    throw new Error("analysisActions must contain at least one component.");
  }

  // @see https://strutture-normative-viewer.claudiopagani19.chatgpt.site/?unit=urn%3Astructural-codes%3Ait%3Aunit%3Antc2018%3A7.4.4.4.1
  const designActions = Object.fromEntries(
    entries.map(([component, value]) => [
      component,
      NTC2018_DIAPHRAGM_FORCE_FACTOR *
        finite(value, `analysisActions.${component}`),
    ]),
  );
  return {
    analysisActions: { ...analysisActions },
    designActions,
    amplificationFactor: NTC2018_DIAPHRAGM_FORCE_FACTOR,
    reference: "NTC 2018 § 7.4.4.4.1",
    metadata: withNormativeReferences(
      {},
      [NTC2018_RC_CHAPTER_7_4_REFERENCES.diaphragm],
    ),
  };
}

/**
 * Combine the chapter-7 amplified action state with chapter-4 checks
 * calculated by an appropriate local membrane/section verifier.
 */
export function createDiaphragmAssessment({
  diaphragmId,
  analysisActions,
  capacityChecks = [],
} = {}) {
  const demand = amplifyNTC2018DiaphragmActions({ analysisActions });
  if (!Array.isArray(capacityChecks)) {
    throw new Error("capacityChecks must be an array.");
  }
  const checks = capacityChecks.map((check, index) => {
    if (check == null || typeof check !== "object") {
      throw new Error(`capacityChecks[${index}] must be an object.`);
    }
    if (typeof check.ok !== "boolean") {
      throw new Error(`capacityChecks[${index}].ok must be boolean.`);
    }
    return { ...check };
  });
  const complete = checks.length > 0;
  const allChecksOk = complete && checks.every((check) => check.ok);

  return {
    diaphragmId,
    ...demand,
    complete,
    status: complete
      ? allChecksOk
        ? "ok"
        : "not-verified"
      : "not-implemented",
    allChecksOk,
    checks,
    warnings: complete
      ? []
      : [
          "No chapter-4 in-plane resistance checks were supplied; only the § 7.4.4.4.1 demand amplification was performed.",
        ],
    references: NTC2018_DIAPHRAGM_REFERENCES,
    metadata: withNormativeReferences(
      demand.metadata,
      [NTC2018_RC_CHAPTER_7_4_REFERENCES.diaphragm],
    ),
  };
}
