const EPS = 1e-9;

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }

  return value;
}

function finite(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }

  return value;
}

function cornerPressures({ widthX, widthY, meanPressure, gradientX, gradientY }) {
  return [
    { id: "x-minus-y-minus", x: -widthX / 2, y: -widthY / 2 },
    { id: "x-plus-y-minus", x: widthX / 2, y: -widthY / 2 },
    { id: "x-plus-y-plus", x: widthX / 2, y: widthY / 2 },
    { id: "x-minus-y-plus", x: -widthX / 2, y: widthY / 2 },
  ].map((corner) => ({
    ...corner,
    pressure: meanPressure + gradientX * corner.x + gradientY * corner.y,
  }));
}

function partialContact({ axis, dimension, transverseDimension, eccentricity, nEd }) {
  const side = Math.sign(eccentricity) || 1;
  const contactLength = 3 * (dimension / 2 - Math.abs(eccentricity));

  if (contactLength <= EPS) {
    return null;
  }

  const compressedEdge = side * dimension / 2;
  const zeroPressureEdge = compressedEdge - side * contactLength;
  const maximumPressure = 2 * nEd / (contactLength * transverseDimension);
  const slope = side * maximumPressure / contactLength;
  const intercept = maximumPressure - slope * compressedEdge;

  return {
    axis,
    side: side > 0 ? "positive" : "negative",
    contactLength,
    contactArea: contactLength * transverseDimension,
    compressedEdge,
    zeroPressureEdge,
    maximumPressure,
    pressurePolynomial: {
      intercept,
      gradientX: axis === "x" ? slope : 0,
      gradientY: axis === "y" ? slope : 0,
    },
    activeInterval: {
      min: Math.min(compressedEdge, zeroPressureEdge),
      max: Math.max(compressedEdge, zeroPressureEdge),
    },
  };
}

export class RectangularFootingContactAnalysis {
  analyze({ widthX, widthY, nEd, mxEd = 0, myEd = 0 } = {}) {
    const bx = positive(widthX, "widthX");
    const by = positive(widthY, "widthY");
    const compression = finite(nEd, "nEd");
    const mx = finite(mxEd, "mxEd");
    const my = finite(myEd, "myEd");
    const area = bx * by;
    const inertiaX = bx * by ** 3 / 12;
    const inertiaY = by * bx ** 3 / 12;

    if (compression <= EPS) {
      return {
        status: "no-compressive-equilibrium",
        contactType: "none",
        widthX: bx,
        widthY: by,
        area,
        nEd: compression,
        mxEd: mx,
        myEd: my,
        eccentricityX: null,
        eccentricityY: null,
        minimumPressure: null,
        maximumPressure: null,
        corners: [],
        pressurePolynomial: null,
        partialContact: null,
      };
    }

    const eccentricityX = my / compression;
    const eccentricityY = mx / compression;
    const meanPressure = compression / area;
    const gradientX = my / inertiaY;
    const gradientY = mx / inertiaX;
    const corners = cornerPressures({
      widthX: bx,
      widthY: by,
      meanPressure,
      gradientX,
      gradientY,
    });
    const elasticMinimum = Math.min(...corners.map((corner) => corner.pressure));
    const elasticMaximum = Math.max(...corners.map((corner) => corner.pressure));
    const tolerance = Math.max(meanPressure, 1) * 1e-10;

    if (elasticMinimum >= -tolerance) {
      return {
        status: "ok",
        contactType: "full",
        widthX: bx,
        widthY: by,
        area,
        contactArea: area,
        nEd: compression,
        mxEd: mx,
        myEd: my,
        eccentricityX,
        eccentricityY,
        kernUtilizationX: 6 * Math.abs(eccentricityX) / bx,
        kernUtilizationY: 6 * Math.abs(eccentricityY) / by,
        equilibriumUtilization: Math.max(
          2 * Math.abs(eccentricityX) / bx,
          2 * Math.abs(eccentricityY) / by,
        ),
        minimumPressure: Math.max(0, elasticMinimum),
        maximumPressure: elasticMaximum,
        elasticMinimumPressure: elasticMinimum,
        elasticMaximumPressure: elasticMaximum,
        corners,
        pressurePolynomial: {
          intercept: meanPressure,
          gradientX,
          gradientY,
        },
        partialContact: null,
      };
    }

    const resultantOutside =
      Math.abs(eccentricityX) >= bx / 2 - EPS ||
      Math.abs(eccentricityY) >= by / 2 - EPS;

    if (resultantOutside) {
      return {
        status: "no-compressive-equilibrium",
        contactType: "none",
        widthX: bx,
        widthY: by,
        area,
        nEd: compression,
        mxEd: mx,
        myEd: my,
        eccentricityX,
        eccentricityY,
        equilibriumUtilization: Math.max(
          2 * Math.abs(eccentricityX) / bx,
          2 * Math.abs(eccentricityY) / by,
        ),
        minimumPressure: null,
        maximumPressure: null,
        elasticMinimumPressure: elasticMinimum,
        elasticMaximumPressure: elasticMaximum,
        corners,
        pressurePolynomial: null,
        partialContact: null,
      };
    }

    const momentTolerance = Math.max(Math.abs(mx), Math.abs(my), 1) * 1e-10;
    const xOnly = Math.abs(mx) <= momentTolerance;
    const yOnly = Math.abs(my) <= momentTolerance;

    if (xOnly !== yOnly) {
      const axis = xOnly ? "x" : "y";
      const partial = partialContact({
        axis,
        dimension: axis === "x" ? bx : by,
        transverseDimension: axis === "x" ? by : bx,
        eccentricity: axis === "x" ? eccentricityX : eccentricityY,
        nEd: compression,
      });

      return {
        status: partial ? "ok" : "no-compressive-equilibrium",
        contactType: partial ? "partial-uniaxial" : "none",
        widthX: bx,
        widthY: by,
        area,
        contactArea: partial?.contactArea ?? null,
        nEd: compression,
        mxEd: mx,
        myEd: my,
        eccentricityX,
        eccentricityY,
        kernUtilizationX: 6 * Math.abs(eccentricityX) / bx,
        kernUtilizationY: 6 * Math.abs(eccentricityY) / by,
        equilibriumUtilization: Math.max(
          2 * Math.abs(eccentricityX) / bx,
          2 * Math.abs(eccentricityY) / by,
        ),
        minimumPressure: partial ? 0 : null,
        maximumPressure: partial?.maximumPressure ?? null,
        elasticMinimumPressure: elasticMinimum,
        elasticMaximumPressure: elasticMaximum,
        corners,
        pressurePolynomial: partial?.pressurePolynomial ?? null,
        partialContact: partial,
      };
    }

    return {
      status: "not-supported",
      contactType: "partial-biaxial",
      widthX: bx,
      widthY: by,
      area,
      nEd: compression,
      mxEd: mx,
      myEd: my,
      eccentricityX,
      eccentricityY,
      kernUtilizationX: 6 * Math.abs(eccentricityX) / bx,
      kernUtilizationY: 6 * Math.abs(eccentricityY) / by,
      equilibriumUtilization: Math.max(
        2 * Math.abs(eccentricityX) / bx,
        2 * Math.abs(eccentricityY) / by,
      ),
      minimumPressure: null,
      maximumPressure: null,
      elasticMinimumPressure: elasticMinimum,
      elasticMaximumPressure: elasticMaximum,
      corners,
      pressurePolynomial: null,
      partialContact: null,
    };
  }
}

export function integrateFootingPressureStrip({
  contact,
  axis,
  from,
  to,
  fixedCoordinate = 0,
  momentOrigin = null,
  uniformDownwardPressure = 0,
} = {}) {
  if (!contact || !["full", "partial-uniaxial"].includes(contact.contactType)) {
    throw new Error("A supported rectangular footing contact state is required.");
  }

  if (!["x", "y"].includes(axis)) {
    throw new Error("axis must be x or y.");
  }

  const start = Math.min(finite(from, "from"), finite(to, "to"));
  const end = Math.max(from, to);
  const fixed = finite(fixedCoordinate, "fixedCoordinate");
  const downward = finite(uniformDownwardPressure, "uniformDownwardPressure");
  let activeStart = start;
  let activeEnd = end;
  let intercept = contact.pressurePolynomial.intercept;
  let slope = axis === "x"
    ? contact.pressurePolynomial.gradientX
    : contact.pressurePolynomial.gradientY;

  if (axis === "x") {
    intercept += contact.pressurePolynomial.gradientY * fixed;
  } else {
    intercept += contact.pressurePolynomial.gradientX * fixed;
  }

  if (contact.contactType === "partial-uniaxial") {
    const partial = contact.partialContact;

    if (partial.axis === axis) {
      activeStart = Math.max(activeStart, partial.activeInterval.min);
      activeEnd = Math.min(activeEnd, partial.activeInterval.max);
    } else if (
      fixed < partial.activeInterval.min - EPS ||
      fixed > partial.activeInterval.max + EPS
    ) {
      activeEnd = activeStart;
    }
  }

  const primitiveForce = (coordinate) =>
    intercept * coordinate + slope * coordinate ** 2 / 2;
  const soilForce = activeEnd > activeStart
    ? primitiveForce(activeEnd) - primitiveForce(activeStart)
    : 0;
  const downwardForce = downward * (end - start);
  const netForce = soilForce - downwardForce;

  if (momentOrigin == null) {
    return { soilForce, downwardForce, netForce, netMoment: null };
  }

  const origin = finite(momentOrigin, "momentOrigin");
  const primitiveMoment = (coordinate) =>
    intercept * (coordinate ** 2 / 2 - origin * coordinate) +
    slope * (coordinate ** 3 / 3 - origin * coordinate ** 2 / 2);
  const soilMoment = activeEnd > activeStart
    ? primitiveMoment(activeEnd) - primitiveMoment(activeStart)
    : 0;
  const downwardMoment = downward * (
    (end ** 2 - start ** 2) / 2 - origin * (end - start)
  );

  return {
    soilForce,
    downwardForce,
    netForce,
    soilMoment,
    downwardMoment,
    netMoment: soilMoment - downwardMoment,
  };
}
