export const PRESSURE_DIAGRAM_2D_SCHEMA_VERSION =
  "geotechnical-pressure-diagram-2d/v1";

const PRESSURE_COMPONENTS = Object.freeze([
  "soilNormal",
  "soilTangent",
  "effectiveSoilNormal",
  "effectiveSoilTangent",
  "totalStressSoilNormal",
  "totalStressSoilTangent",
  "waterNormal",
  "totalNormal",
  "totalTangent",
]);

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function integrateLinearPressure({
  topElevation,
  bottomElevation,
  topPressure,
  bottomPressure,
  referenceElevation,
}) {
  const height = topElevation - bottomElevation;
  const force = height * (topPressure + bottomPressure) / 2;
  const firstMomentFromBottom = height ** 2 *
    (bottomPressure + 2 * topPressure) / 6;
  const moment = force * (bottomElevation - referenceElevation) +
    firstMomentFromBottom;

  return { force, moment };
}

export function integratePressureSegments(
  segments,
  { referenceElevation = null } = {},
) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return Object.fromEntries(PRESSURE_COMPONENTS.map((component) => [
      component,
      {
        forcePerUnitWidth: 0,
        momentPerUnitWidth: 0,
        applicationElevation: null,
      },
    ]));
  }

  const reference = referenceElevation ?? Math.min(
    ...segments.map((segment) => segment.bottomElevation),
  );
  const totals = Object.fromEntries(PRESSURE_COMPONENTS.map((component) => [
    component,
    {
      forcePerUnitWidth: 0,
      momentPerUnitWidth: 0,
      integratedSegmentCount: 0,
      unavailableSegmentCount: 0,
    },
  ]));

  for (const segment of segments) {
    for (const component of PRESSURE_COMPONENTS) {
      if (
        !Number.isFinite(segment.top[component]) ||
        !Number.isFinite(segment.bottom[component])
      ) {
        totals[component].unavailableSegmentCount += 1;
        continue;
      }
      const integrated = integrateLinearPressure({
        topElevation: segment.topElevation,
        bottomElevation: segment.bottomElevation,
        topPressure: segment.top[component],
        bottomPressure: segment.bottom[component],
        referenceElevation: reference,
      });
      totals[component].forcePerUnitWidth += integrated.force;
      totals[component].momentPerUnitWidth += integrated.moment;
      totals[component].integratedSegmentCount += 1;
    }
  }

  return Object.fromEntries(Object.entries(totals).map(([component, value]) => [
    component,
    {
      ...value,
      applicationElevation: Math.abs(value.forcePerUnitWidth) > 1e-14
        ? reference + value.momentPerUnitWidth / value.forcePerUnitWidth
        : null,
      coverage: value.unavailableSegmentCount === 0
        ? "complete"
        : value.integratedSegmentCount === 0
          ? "not-applicable"
          : "partial",
    },
  ]));
}

export class PressureDiagram2D {
  constructor({
    profileId,
    state,
    method,
    topElevation,
    bottomElevation,
    segments,
    metadata = {},
  } = {}) {
    if (!profileId) throw new Error("PressureDiagram2D profileId is required.");
    if (!state) throw new Error("PressureDiagram2D state is required.");
    if (!method?.id) throw new Error("PressureDiagram2D method.id is required.");
    if (!Array.isArray(segments) || segments.length === 0) {
      throw new Error("PressureDiagram2D requires at least one segment.");
    }

    this.schemaVersion = PRESSURE_DIAGRAM_2D_SCHEMA_VERSION;
    this.profileId = profileId;
    this.state = state;
    this.method = structuredClone(method);
    this.referenceLine = {
      topElevation: finite(Number(topElevation), "topElevation"),
      bottomElevation: finite(Number(bottomElevation), "bottomElevation"),
      localCoordinateSystem: {
        normalPositive: "from-retained-ground-into-structure",
        tangentPositive: "downward-along-wall",
      },
    };
    this.segments = structuredClone(segments);
    this.resultants = integratePressureSegments(this.segments, {
      referenceElevation: this.referenceLine.bottomElevation,
    });
    this.units = {
      elevation: "m",
      pressure: "kN/m2",
      forcePerUnitWidth: "kN/m",
      momentPerUnitWidth: "kN*m/m",
    };
    this.metadata = structuredClone(metadata ?? {});
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      profileId: this.profileId,
      state: this.state,
      method: structuredClone(this.method),
      referenceLine: structuredClone(this.referenceLine),
      segments: structuredClone(this.segments),
      resultants: structuredClone(this.resultants),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
