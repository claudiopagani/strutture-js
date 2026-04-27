export const RESULT_STATUS_OK = "ok";
export const RESULT_STATUS_NOT_VERIFIED = "not-verified";
export const RESULT_STATUS_NOT_SUPPORTED = "not-supported";
export const RESULT_STATUS_NOT_ANALYZED = "not-analyzed";
export const RESULT_STATUS_NOT_IMPLEMENTED = "not-implemented";
export const RESULT_STATUS_FAILED = "failed";

export const RESULT_STATUS = Object.freeze({
  OK: RESULT_STATUS_OK,
  NOT_VERIFIED: RESULT_STATUS_NOT_VERIFIED,
  NOT_SUPPORTED: RESULT_STATUS_NOT_SUPPORTED,
  NOT_ANALYZED: RESULT_STATUS_NOT_ANALYZED,
  NOT_IMPLEMENTED: RESULT_STATUS_NOT_IMPLEMENTED,
  FAILED: RESULT_STATUS_FAILED,
});

export const RESULT_STATUS_VALUES = Object.freeze(Object.values(RESULT_STATUS));

export function isResultStatus(status) {
  return RESULT_STATUS_VALUES.includes(status);
}
