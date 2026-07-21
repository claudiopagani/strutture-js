import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { CircularSlipSurface2D } from "./CircularSlipSurface2D.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const GROUND_ANCHOR_STABILITY_ACTION_2D_SCHEMA_VERSION =
  "ground-anchor-stability-action-2d/v1";

export const GROUND_ANCHOR_STABILITY_FORCE_MODELS = Object.freeze([
  "fhwa-uniform-bond-proportional",
]);

export const GROUND_ANCHOR_STABILITY_REFERENCE = Object.freeze({
  title: "FHWA GEC 4, Ground Anchors and Anchored Systems",
  publication: "FHWA-IF-99-015",
  year: 1999,
  section: "5.8.3.2",
  url: "https://www.fhwa.dot.gov/engineering/geotech/pubs/if99015.pdf",
});

const RESULT_STATUSES = Object.freeze([
  "ok",
  "not-verified",
  "not-supported",
  "not-analyzed",
  "not-implemented",
  "failed",
]);

const TOLERANCE = 1e-9;

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) throw new Error(`${label} must be positive.`);
  return number;
}

function point(value, resolver, label) {
  return {
    x: resolver.length(finite(value?.x, `${label}.x`)),
    z: resolver.length(finite(value?.z, `${label}.z`)),
  };
}

function provenance(value) {
  const normalized = structuredClone(value ?? {});
  if (typeof normalized.source !== "string" || !normalized.source.trim()) {
    throw new Error("Ground-anchor stability action provenance.source is required.");
  }
  normalized.source = normalized.source.trim();
  return normalized;
}

function normalizedResult(value) {
  return typeof value?.toJSON === "function" ? value.toJSON() : value;
}

function pointDistance(first, second) {
  return Math.hypot(second.x - first.x, second.z - first.z);
}

function projectionAlongAxis(pointValue, head, unitVector) {
  return (pointValue.x - head.x) * unitVector.x +
    (pointValue.z - head.z) * unitVector.z;
}

function bounded(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function isOnMovingSideOfSurface(pointValue, slipSurface, tolerance) {
  if (
    slipSurface.entryX != null &&
    (pointValue.x < slipSurface.entryX - tolerance ||
      pointValue.x > slipSurface.exitX + tolerance)
  ) {
    return false;
  }
  try {
    return pointValue.z >= slipSurface.lowerElevationAt(pointValue.x) - tolerance;
  } catch {
    return false;
  }
}

export class GroundAnchorStabilityAction2D {
  constructor({
    id,
    head,
    bondStart,
    bondEnd,
    designTendonForce,
    horizontalSpacing,
    sourceVerificationStatus = "not-analyzed",
    forceModel = "fhwa-uniform-bond-proportional",
    units = null,
    provenance: provenanceInput = null,
    metadata = {},
  } = {}) {
    if (!id) throw new Error("A GroundAnchorStabilityAction2D id is required.");
    assertExplicitUnitSystem(units, "GroundAnchorStabilityAction2D");
    if (!RESULT_STATUSES.includes(sourceVerificationStatus)) {
      throw new Error(
        `Unsupported ground-anchor source verification status: ${sourceVerificationStatus}.`,
      );
    }
    if (!GROUND_ANCHOR_STABILITY_FORCE_MODELS.includes(forceModel)) {
      throw new Error(`Unsupported ground-anchor stability force model: ${forceModel}.`);
    }
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const normalizedHead = point(head, resolver, "head");
    const normalizedBondStart = point(bondStart, resolver, "bondStart");
    const normalizedBondEnd = point(bondEnd, resolver, "bondEnd");
    const totalLength = pointDistance(normalizedHead, normalizedBondEnd);
    const freeLength = pointDistance(normalizedHead, normalizedBondStart);
    const bondLength = pointDistance(normalizedBondStart, normalizedBondEnd);
    if (totalLength <= TOLERANCE || freeLength <= TOLERANCE || bondLength <= TOLERANCE) {
      throw new Error("Ground-anchor stability geometry requires positive free and bond lengths.");
    }
    const unitVector = {
      x: (normalizedBondEnd.x - normalizedHead.x) / totalLength,
      z: (normalizedBondEnd.z - normalizedHead.z) / totalLength,
    };
    const bondStartProjection = projectionAlongAxis(
      normalizedBondStart,
      normalizedHead,
      unitVector,
    );
    const bondStartOffset = Math.hypot(
      normalizedBondStart.x - normalizedHead.x -
        bondStartProjection * unitVector.x,
      normalizedBondStart.z - normalizedHead.z -
        bondStartProjection * unitVector.z,
    );
    const scale = Math.max(1, totalLength);
    if (
      bondStartOffset > TOLERANCE * scale ||
      bondStartProjection <= TOLERANCE ||
      bondStartProjection >= totalLength - TOLERANCE
    ) {
      throw new Error(
        "head, bondStart and bondEnd must lie in this order on one straight anchor axis.",
      );
    }

    this.schemaVersion = GROUND_ANCHOR_STABILITY_ACTION_2D_SCHEMA_VERSION;
    this.id = String(id);
    this.head = normalizedHead;
    this.bondStart = normalizedBondStart;
    this.bondEnd = normalizedBondEnd;
    this.freeLength = bondStartProjection;
    this.bondLength = totalLength - bondStartProjection;
    this.totalLength = totalLength;
    this.axisUnitVector = unitVector;
    this.designTendonForce = positive(
      resolver.force(finite(designTendonForce, "designTendonForce")),
      "designTendonForce",
    );
    this.horizontalSpacing = positive(
      resolver.length(finite(horizontalSpacing, "horizontalSpacing")),
      "horizontalSpacing",
    );
    this.designTendonForcePerUnitWidth =
      this.designTendonForce / this.horizontalSpacing;
    this.sourceVerificationStatus = sourceVerificationStatus;
    this.forceModel = forceModel;
    this.provenance = provenance(provenanceInput);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      forceSelection: "design-tendon-force",
      outOfPlaneConversion: "one-anchor-force-divided-by-horizontal-spacing",
    };
  }

  static fromGroundAnchorResult(resultInput, { id = null, metadata = {} } = {}) {
    const result = normalizedResult(resultInput);
    const outputs = result?.outputs;
    const anchor = outputs?.anchor;
    const coupling = outputs?.couplings?.globalStability;
    if (!anchor || !coupling?.anchorAxis || !coupling?.actions) {
      throw new Error(
        "GroundAnchorStabilityAction2D.fromGroundAnchorResult requires a ground-anchor design result with globalStability coupling data.",
      );
    }
    return new GroundAnchorStabilityAction2D({
      id: id ?? anchor.id,
      head: coupling.anchorAxis.head,
      bondStart: coupling.anchorAxis.bondStart,
      bondEnd: coupling.anchorAxis.bondEnd,
      designTendonForce: coupling.actions.designTendonForce,
      horizontalSpacing: anchor.horizontalSpacing,
      sourceVerificationStatus: result.status,
      forceModel: "fhwa-uniform-bond-proportional",
      units: anchor.units ?? GEOTECHNICAL_INTERNAL_UNITS,
      provenance: {
        source: "ground-anchor-design-result",
        applicationId: result.applicationId ?? null,
        resultSchemaVersion: outputs.schemaVersion ?? null,
        groundModelId: outputs.groundModelId ?? null,
        designSituationId: outputs.designSituationId ?? null,
      },
      metadata: {
        ...structuredClone(metadata ?? {}),
        sourceWarnings: structuredClone(result.warnings ?? []),
      },
    });
  }

  evaluateForSlipSurface(slipSurface) {
    if (!(slipSurface instanceof CircularSlipSurface2D)) {
      throw new Error(
        "GroundAnchorStabilityAction2D requires a CircularSlipSurface2D.",
      );
    }
    const tolerance = TOLERANCE * Math.max(
      1,
      this.totalLength,
      slipSurface.radius,
    );
    const intersections = slipSurface.intersectionsWithSegment(
      this.head,
      this.bondEnd,
    ).filter(({ x }) =>
      (slipSurface.entryX == null || x >= slipSurface.entryX - tolerance) &&
      (slipSurface.exitX == null || x <= slipSurface.exitX + tolerance));
    if (intersections.length > 1) {
      throw new Error(
        `Ground anchor ${this.id} intersects slip surface ${slipSurface.id} more than once; the FHWA single-crossing model is not applicable.`,
      );
    }
    if (intersections.length === 0) {
      const anchorEnclosedByMovingMass = [
        this.head,
        this.bondStart,
        this.bondEnd,
      ].every((pointValue) =>
        isOnMovingSideOfSurface(pointValue, slipSurface, tolerance));
      return {
        anchorId: this.id,
        status: "not-mobilized",
        relation: anchorEnclosedByMovingMass
          ? "behind-bond-zone"
          : "no-axis-crossing",
        intersection: null,
        intersectionDistance: null,
        remainingBondLength: 0,
        mobilizationRatio: 0,
        mobilizedTendonForce: 0,
        mobilizedForcePerUnitWidth: 0,
        globalForcePerUnitWidth: { x: 0, z: 0 },
        horizontalForceInMovementDirection: 0,
        verticalDownwardForce: 0,
        drivingMoment: 0,
        forceModel: this.forceModel,
      };
    }

    const intersection = intersections[0];
    const intersectionDistance = bounded(
      projectionAlongAxis(intersection, this.head, this.axisUnitVector),
      0,
      this.totalLength,
    );
    let relation;
    let remainingBondLength;
    let mobilizationRatio;
    if (intersectionDistance <= this.freeLength + tolerance) {
      relation = "in-front-of-bond-zone";
      remainingBondLength = this.bondLength;
      mobilizationRatio = 1;
    } else if (intersectionDistance < this.totalLength - tolerance) {
      relation = "through-bond-zone";
      remainingBondLength = this.totalLength - intersectionDistance;
      mobilizationRatio = bounded(
        remainingBondLength / this.bondLength,
        0,
        1,
      );
    } else {
      relation = "at-or-behind-bond-end";
      remainingBondLength = 0;
      mobilizationRatio = 0;
    }
    const mobilizedTendonForce = this.designTendonForce * mobilizationRatio;
    const mobilizedForcePerUnitWidth =
      this.designTendonForcePerUnitWidth * mobilizationRatio;
    const globalForcePerUnitWidth = {
      x: mobilizedForcePerUnitWidth * this.axisUnitVector.x,
      z: mobilizedForcePerUnitWidth * this.axisUnitVector.z,
    };
    const movementSign = slipSurface.movementDirection === "left-to-right"
      ? 1
      : -1;
    const horizontalForceInMovementDirection =
      movementSign * globalForcePerUnitWidth.x;
    if (
      mobilizationRatio > 0 &&
      horizontalForceInMovementDirection >= -tolerance
    ) {
      throw new Error(
        `Ground anchor ${this.id} does not oppose the selected ${slipSurface.movementDirection} movement direction.`,
      );
    }
    const verticalDownwardForce = -globalForcePerUnitWidth.z;
    const drivingMoment =
      movementSign * (slipSurface.center.x - intersection.x) *
        verticalDownwardForce +
      (slipSurface.center.z - intersection.z) *
        horizontalForceInMovementDirection;

    return {
      anchorId: this.id,
      status: mobilizationRatio > 0 ? "mobilized" : "not-mobilized",
      relation,
      intersection: { x: intersection.x, z: intersection.z },
      intersectionDistance,
      remainingBondLength,
      mobilizationRatio,
      mobilizedTendonForce,
      mobilizedForcePerUnitWidth,
      globalForcePerUnitWidth,
      horizontalForceInMovementDirection,
      verticalDownwardForce,
      drivingMoment,
      forceModel: this.forceModel,
    };
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      head: { ...this.head },
      bondStart: { ...this.bondStart },
      bondEnd: { ...this.bondEnd },
      freeLength: this.freeLength,
      bondLength: this.bondLength,
      totalLength: this.totalLength,
      axisUnitVector: { ...this.axisUnitVector },
      designTendonForce: this.designTendonForce,
      horizontalSpacing: this.horizontalSpacing,
      designTendonForcePerUnitWidth: this.designTendonForcePerUnitWidth,
      sourceVerificationStatus: this.sourceVerificationStatus,
      forceModel: this.forceModel,
      provenance: structuredClone(this.provenance),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
