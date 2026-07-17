import { SingleBeamModel } from "../beams/SingleBeamInput.js";
import { createUnitResolver } from "../units/UnitSystem.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });

function finite(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`FoundationBeamModel requires a finite ${label}.`);
  }

  return value;
}

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`FoundationBeamModel requires a positive ${label}.`);
  }

  return value;
}

function geometryLength(geometry = {}) {
  if (Number.isFinite(geometry.length)) {
    return geometry.length;
  }

  const start = geometry.start ?? { x: 0, y: 0 };
  const end = geometry.end;

  if (!end || !Number.isFinite(start.x) || !Number.isFinite(start.y) ||
      !Number.isFinite(end.x) || !Number.isFinite(end.y)) {
    throw new Error(
      "FoundationBeamModel geometry requires length or finite start/end coordinates.",
    );
  }

  if (Math.abs(end.y - start.y) > 1e-12) {
    throw new Error("The first FoundationBeamModel supports only horizontal beams.");
  }

  return Math.abs(end.x - start.x);
}

function normalizeSegments(foundation, span) {
  const rawSegments = foundation.segments ?? [{
    from: 0,
    to: span,
    subgradeModulus: foundation.subgradeModulus,
  }];

  if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
    throw new Error("FoundationBeamModel requires at least one foundation segment.");
  }

  const segments = rawSegments
    .map((segment, index) => ({
      id: segment.id ?? `foundation-segment-${index + 1}`,
      from: finite(Number(segment.from ?? 0), `foundation.segments[${index}].from`),
      to: finite(Number(segment.to ?? span), `foundation.segments[${index}].to`),
      subgradeModulus: positive(
        Number(segment.subgradeModulus),
        `foundation.segments[${index}].subgradeModulus`,
      ),
      metadata: { ...segment.metadata },
    }))
    .sort((left, right) => left.from - right.from);
  const tolerance = Math.max(span * 1e-10, 1e-12);

  if (Math.abs(segments[0].from) > tolerance ||
      Math.abs(segments.at(-1).to - span) > tolerance) {
    throw new Error("Foundation segments must cover the complete beam span.");
  }

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (segment.from < -tolerance || segment.to > span + tolerance ||
        segment.to <= segment.from + tolerance) {
      throw new Error("Each foundation segment must satisfy 0 <= from < to <= span.");
    }

    if (index > 0 && Math.abs(segment.from - segments[index - 1].to) > tolerance) {
      throw new Error("Foundation segments must be contiguous and non-overlapping.");
    }
  }

  return segments;
}

function settlementStations(loads, span) {
  return loads
    .filter((load) => load.type === "soil-settlement")
    .flatMap((load) => [load.from ?? 0, load.to ?? span])
    .filter(Number.isFinite);
}

export class FoundationBeamModel extends SingleBeamModel {
  constructor({ foundation = {}, ...beamInput } = {}) {
    const span = positive(geometryLength(beamInput.geometry), "geometry length");
    const contactWidth = positive(
      Number(foundation.contactWidth),
      "foundation.contactWidth",
    );
    const segments = normalizeSegments(foundation, span);
    const rawLoads = Array.isArray(beamInput.loads) ? beamInput.loads : [];
    const stations = [
      ...(beamInput.discretization?.stations ?? []),
      ...segments.flatMap((segment) => [segment.from, segment.to]),
      ...settlementStations(rawLoads, span),
    ];

    super({
      ...beamInput,
      loads: rawLoads,
      discretization: {
        ...beamInput.discretization,
        stations: [...new Set(stations)],
      },
    });

    const resolver = createUnitResolver(this.units, FEM_UNITS);

    this.foundation = {
      contactWidth,
      contactWidthFem: resolver.length(contactWidth),
      segments: segments.map((segment) => ({
        ...segment,
        fromFem: resolver.length(segment.from),
        toFem: resolver.length(segment.to),
        subgradeModulusFem: resolver.convert(segment.subgradeModulus, {
          forceExponent: 1,
          lengthExponent: -3,
        }),
      })),
      contactModel: foundation.contactModel ?? "bilateral",
      model: (foundation.contactModel ?? "bilateral") === "compression-only"
        ? "winkler-linear-compression-only-lumped"
        : "winkler-linear-bilateral-lumped",
      iteration: {
        tolerance: foundation.iteration?.tolerance ?? 1e-7,
        maxIterations: foundation.iteration?.maxIterations ?? 50,
        relaxationFactor: foundation.iteration?.relaxationFactor ?? 0.5,
      },
      metadata: { ...foundation.metadata },
    };
  }
}
