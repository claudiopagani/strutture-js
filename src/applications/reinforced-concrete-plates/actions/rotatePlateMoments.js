const ZERO_TOLERANCE = 1e-12;

function finite(value, name) {
  if (!Number.isFinite(value)) {
    throw new Error(`rotatePlateMoments requires a finite ${name}.`);
  }

  return value;
}

function clean(value) {
  return Math.abs(value) <= ZERO_TOLERANCE ? 0 : value;
}

/**
 * Rotates the symmetric plate-moment tensor from the source axes to the
 * reinforcement axes through M' = R^T M R.
 *
 * `angle` is in degrees and is positive counterclockwise from source +X to
 * reinforcement +X when viewed from the positive plate normal.
 */
export function rotatePlateMoments({ mxx, myy, mxy, angle = 0 } = {}) {
  finite(mxx, "mxx");
  finite(myy, "myy");
  finite(mxy, "mxy");
  finite(angle, "angle");

  const angleRadians = (angle * Math.PI) / 180;
  const c = Math.cos(angleRadians);
  const s = Math.sin(angleRadians);
  const rotatedMxx = c ** 2 * mxx + 2 * c * s * mxy + s ** 2 * myy;
  const rotatedMyy = s ** 2 * mxx - 2 * c * s * mxy + c ** 2 * myy;
  const rotatedMxy = c * s * (myy - mxx) + (c ** 2 - s ** 2) * mxy;

  return {
    mxx: clean(rotatedMxx),
    myy: clean(rotatedMyy),
    mxy: clean(rotatedMxy),
    angle,
    angleRadians,
    invariants: {
      trace: clean(rotatedMxx + rotatedMyy),
      determinant: clean(rotatedMxx * rotatedMyy - rotatedMxy ** 2),
    },
  };
}
