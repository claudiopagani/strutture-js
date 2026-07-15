const ZERO_TOLERANCE = 1e-12;

function clean(value) {
  return Math.abs(value) <= ZERO_TOLERANCE ? 0 : value;
}

/**
 * Conservative orthogonal Wood-Armer face envelope.
 *
 * Positive moments tension the bottom face. Negative moments tension the top
 * face. The twisting resultant is assigned with both signs so that pure twist
 * generates reinforcement demand in X and Y on both faces.
 */
export function woodArmer({ mxx, myy, mxy } = {}) {
  if (![mxx, myy, mxy].every(Number.isFinite)) {
    throw new Error("woodArmer requires finite mxx, myy and mxy values.");
  }

  const torsion = Math.abs(mxy);
  const values = {
    "bottom-x": clean(Math.max(0, mxx + torsion)),
    "bottom-y": clean(Math.max(0, myy + torsion)),
    "top-x": clean(Math.min(0, mxx - torsion)),
    "top-y": clean(Math.min(0, myy - torsion)),
  };

  return {
    ...values,
    moments: [
      { id: "bottom-x", face: "bottom", direction: "x", value: values["bottom-x"] },
      { id: "bottom-y", face: "bottom", direction: "y", value: values["bottom-y"] },
      { id: "top-x", face: "top", direction: "x", value: values["top-x"] },
      { id: "top-y", face: "top", direction: "y", value: values["top-y"] },
    ],
    torsionAbsolute: torsion,
    method: "wood-armer-conservative-orthogonal-face-envelope",
  };
}
