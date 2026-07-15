const ZERO_TOLERANCE = 1e-12;

function clean(value) {
  return Math.abs(value) <= ZERO_TOLERANCE ? 0 : value;
}

/** Rotates Q through Q' = R^T Q using a counterclockwise angle in degrees. */
export function rotatePlateShear({ qx, qy, angle = 0 } = {}) {
  if (!Number.isFinite(qx) || !Number.isFinite(qy) || !Number.isFinite(angle)) {
    throw new Error("rotatePlateShear requires finite qx, qy and angle values.");
  }

  const angleRadians = (angle * Math.PI) / 180;
  const c = Math.cos(angleRadians);
  const s = Math.sin(angleRadians);
  const rotatedQx = c * qx + s * qy;
  const rotatedQy = -s * qx + c * qy;

  return {
    qx: clean(rotatedQx),
    qy: clean(rotatedQy),
    angle,
    angleRadians,
    resultant: Math.hypot(rotatedQx, rotatedQy),
    resultantAngle: Math.atan2(rotatedQy, rotatedQx) * 180 / Math.PI,
  };
}
