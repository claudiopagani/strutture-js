import { createSteelProfileSection } from "../../../domain/geometry/createSteelProfileSection.js";
import { SteelMaterial } from "../../../domain/materials/SteelMaterial.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../../../domain/units/UnitSystem.js";
import { createNTC2018StructuralSteelMaterial } from "../../../norms/ntc2018/materials/createNTC2018Material.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });
const DEFAULT_REFERENCE_FORCE = 1;
const DEFAULT_CONTROL_INCREMENT = 1;
const DEFAULT_MAX_CONTROL_DISPLACEMENT = 120;
const DEFAULT_MAX_STEPS = 200;
const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_TOLERANCE = 1e-2;
const DEFAULT_YIELD_TOLERANCE = 1e-9;
const DEFAULT_BASE_CONDITION = "pinned-base-with-bottom-beam";

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`SteelRingFramePushoverModel requires a positive ${label}.`);
  }
}

function assertFinite(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`SteelRingFramePushoverModel requires a finite ${label}.`);
  }
}

function normalizeBaseCondition(value = DEFAULT_BASE_CONDITION) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  const aliases = new Map([
    ["fixed", "fixed-base"],
    ["fixed-base", "fixed-base"],
    ["incastrato", "fixed-base"],
    ["incastrati", "fixed-base"],
    ["columns-fixed", "fixed-base"],
    ["pinned-with-bottom-beam", "pinned-base-with-bottom-beam"],
    ["pinned-base-with-bottom-beam", "pinned-base-with-bottom-beam"],
    ["hinged-with-bottom-beam", "pinned-base-with-bottom-beam"],
    ["incernierato-con-traverso", "pinned-base-with-bottom-beam"],
    ["incernierati-con-traverso", "pinned-base-with-bottom-beam"],
    ["pinned-without-bottom-beam", "pinned-base-without-bottom-beam"],
    ["pinned-base-without-bottom-beam", "pinned-base-without-bottom-beam"],
    ["hinged-without-bottom-beam", "pinned-base-without-bottom-beam"],
    ["incernierato-senza-traverso", "pinned-base-without-bottom-beam"],
    ["incernierati-senza-traverso", "pinned-base-without-bottom-beam"],
  ]);

  const resolved = aliases.get(normalized);

  if (!resolved) {
    throw new Error(
      `Unsupported steel ring frame baseCondition: ${value}.`,
    );
  }

  return resolved;
}

function normalizeControlNode(value = "top-left") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  const aliases = new Map([
    ["top-left", "top-left"],
    ["left-top", "top-left"],
    ["architrave-left", "top-left"],
    ["top-right", "top-right"],
    ["right-top", "top-right"],
    ["architrave-right", "top-right"],
  ]);

  const resolved = aliases.get(normalized);

  if (!resolved) {
    throw new Error(
      `Unsupported steel ring frame control node: ${value}.`,
    );
  }

  return resolved;
}

function normalizeSectionInput(sectionLike, units, fallbackProfileName) {
  if (sectionLike?.profileName) {
    return sectionLike;
  }

  if (typeof sectionLike === "string") {
    return createSteelProfileSection({
      profileName: sectionLike,
      units,
    });
  }

  if (sectionLike?.profileName == null && sectionLike?.name == null && fallbackProfileName) {
    return createSteelProfileSection({
      profileName: fallbackProfileName,
      units,
    });
  }

  if (sectionLike?.profileName == null && sectionLike?.profileName !== "") {
    if (sectionLike?.profileName === undefined && sectionLike?.catalogProperties == null) {
      throw new Error(
        "Steel ring frame sections must be section instances or profile-name strings.",
      );
    }
  }

  return sectionLike;
}

function normalizeSteelMaterial(materialLike, units, defaultGrade = "S275") {
  if (materialLike instanceof SteelMaterial) {
    return materialLike;
  }

  if (materialLike?.category === "steel" || materialLike?.fyd != null || materialLike?.fyk != null) {
    return new SteelMaterial({
      ...materialLike,
      units: materialLike.units ?? INTERNAL_UNITS,
    });
  }

  if (typeof materialLike === "string" || materialLike == null) {
    return createNTC2018StructuralSteelMaterial({
      grade: materialLike ?? defaultGrade,
      units,
    });
  }

  return createNTC2018StructuralSteelMaterial({
    grade: materialLike.grade ?? defaultGrade,
    gammaM0: materialLike.gammaM0 ?? 1.05,
    elasticModulus: materialLike.elasticModulus ?? null,
    density: materialLike.density ?? 7850,
    units,
    metadata: materialLike.metadata ?? {},
  });
}

function normalizeProfiles({ memberSections = {}, units }) {
  const leftColumn = normalizeSectionInput(
    memberSections.leftColumn ?? memberSections.columns ?? memberSections.column ?? "IPE100",
    units,
    "IPE100",
  );
  const rightColumn = normalizeSectionInput(
    memberSections.rightColumn ?? memberSections.columns ?? memberSections.column ?? leftColumn,
    units,
    leftColumn?.profileName ?? "IPE100",
  );
  const topBeam = normalizeSectionInput(
    memberSections.topBeam ?? memberSections.architrave ?? "IPE100",
    units,
    "IPE100",
  );
  const bottomBeam = normalizeSectionInput(
    memberSections.bottomBeam ?? memberSections.bottomChord ?? topBeam,
    units,
    topBeam?.profileName ?? "IPE100",
  );

  return {
    leftColumn,
    rightColumn,
    topBeam,
    bottomBeam,
  };
}

function profileFamily(section) {
  return String(section?.family ?? section?.profileName ?? "")
    .trim()
    .toUpperCase();
}

function normalizeOrientationAlias(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (
    [
      "weak",
      "minor",
      "z",
      "inertiaz",
      "weak-axis",
      "weak-axis-in-plane",
      "asse-debole",
      "asse-debole-nel-piano",
      "rotated-90",
      "rotate-90",
      "90",
      "upn-open-side-up",
      "open-side-up",
      "web-up",
      "lato-senza-labbri-up",
      "lato-senza-labbri-verso-alto",
    ].includes(normalized)
  ) {
    return "z";
  }

  return "y";
}

function normalizeMemberOrientationInput(input, fallback = {}) {
  if (input == null) {
    return fallback;
  }

  if (typeof input === "string") {
    const axis = normalizeOrientationAlias(input);

    return {
      ...fallback,
      axis,
      label: axis === "z" ? "weak-axis-in-plane" : "strong-axis-in-plane",
      rotationDegrees: axis === "z" ? 90 : 0,
      mounting:
        input.toLowerCase().includes("open-side-up") ||
        input.toLowerCase().includes("web-up") ||
        input.toLowerCase().includes("labbri")
          ? "open-side-up"
          : fallback.mounting ?? null,
      source: "explicit",
    };
  }

  const explicitAxis =
    input.axis ??
    input.inPlaneAxis ??
    input.bendingAxis ??
    input.bendingInertiaAxis ??
    null;
  const rotation =
    input.rotationDegrees ??
    input.rotation ??
    input.localAxisRotation ??
    null;
  const axis =
    explicitAxis != null
      ? normalizeOrientationAlias(explicitAxis)
      : Number.isFinite(Number(rotation)) &&
          Math.abs(Number(rotation) % 180) === 90
        ? "z"
        : fallback.axis ?? "y";

  return {
    ...fallback,
    axis,
    label:
      input.label ??
      input.orientation ??
      (axis === "z" ? "weak-axis-in-plane" : "strong-axis-in-plane"),
    rotationDegrees:
      Number.isFinite(Number(rotation))
        ? Number(rotation)
        : input.rotate90
          ? 90
          : axis === "z"
            ? 90
            : 0,
    mounting:
      input.mounting ??
      input.openSide ??
      input.webSide ??
      fallback.mounting ??
      null,
    source: "explicit",
  };
}

function defaultMemberOrientation(memberKey, section) {
  const family = profileFamily(section);

  if (memberKey === "bottomBeam" && family.startsWith("UPN")) {
    return {
      axis: "z",
      label: "upn-open-side-up",
      rotationDegrees: 90,
      mounting: "open-side-up",
      source: "default-upn-bottom-beam",
    };
  }

  return {
    axis: "y",
    label: "strong-axis-in-plane",
    rotationDegrees: 0,
    mounting: null,
    source: "default-strong-axis",
  };
}

function normalizeMemberOrientations({ memberOrientations = {}, memberSections }) {
  const input = memberOrientations ?? {};
  const columnInput = input.columns ?? input.column ?? input.piers ?? null;

  return {
    leftColumn: normalizeMemberOrientationInput(
      input.leftColumn ?? columnInput,
      defaultMemberOrientation("leftColumn", memberSections.leftColumn),
    ),
    rightColumn: normalizeMemberOrientationInput(
      input.rightColumn ?? columnInput,
      defaultMemberOrientation("rightColumn", memberSections.rightColumn),
    ),
    topBeam: normalizeMemberOrientationInput(
      input.topBeam ?? input.architrave,
      defaultMemberOrientation("topBeam", memberSections.topBeam),
    ),
    bottomBeam: normalizeMemberOrientationInput(
      input.bottomBeam ?? input.bottomChord,
      defaultMemberOrientation("bottomBeam", memberSections.bottomBeam),
    ),
  };
}

export class SteelRingFramePushoverModel {
  constructor({
    id,
    units = null,
    geometry = {},
    memberSections = {},
    memberOrientations = {},
    material = null,
    baseCondition = DEFAULT_BASE_CONDITION,
    includeBottomBeam = null,
    loading = {},
    solver = {},
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A steel ring frame pushover model id is required.");
    }

    assertExplicitUnitSystem(units, "SteelRingFramePushoverModel");
    const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
    const resolvedBaseCondition = normalizeBaseCondition(baseCondition);
    const resolvedIncludeBottomBeam =
      includeBottomBeam == null
        ? resolvedBaseCondition !== "pinned-base-without-bottom-beam" &&
          resolvedBaseCondition !== "fixed-base"
        : Boolean(includeBottomBeam);
    const width = unitResolver.length(
      geometry.clearWidth ?? geometry.width ?? geometry.b,
    );
    const height = unitResolver.length(
      geometry.clearHeight ?? geometry.height ?? geometry.h,
    );

    assertPositive(width, "geometry.clearWidth");
    assertPositive(height, "geometry.clearHeight");

    this.id = id;
    this.units = INTERNAL_UNITS;
    this.geometry = {
      clearWidth: width,
      clearHeight: height,
      originX: unitResolver.length(geometry.originX ?? geometry.x ?? 0),
      originY: unitResolver.length(geometry.originY ?? geometry.y ?? 0),
    };
    this.baseCondition = resolvedBaseCondition;
    this.includeBottomBeam = resolvedIncludeBottomBeam;
    this.material = normalizeSteelMaterial(material, units);
    this.memberSections = normalizeProfiles({
      memberSections,
      units,
    });
    this.memberOrientations = normalizeMemberOrientations({
      memberOrientations,
      memberSections: this.memberSections,
    });
    this.loading = {
      referenceHorizontalForce: unitResolver.force(
        loading.referenceHorizontalForce ??
          loading.horizontalForce ??
          loading.Fh ??
          DEFAULT_REFERENCE_FORCE,
      ),
      controlNode: normalizeControlNode(loading.controlNode),
      controlDof: "ux",
    };
    this.solver = {
      controlDisplacementIncrement: unitResolver.length(
        solver.controlDisplacementIncrement ??
          solver.controlIncrement ??
          solver.cost ??
          DEFAULT_CONTROL_INCREMENT,
      ),
      maxControlDisplacement: unitResolver.length(
        solver.maxControlDisplacement ??
          solver.maxDisplacement ??
          DEFAULT_MAX_CONTROL_DISPLACEMENT,
      ),
      tolerance: solver.tolerance ?? solver.toll ?? DEFAULT_TOLERANCE,
      maxIterations:
        solver.maxIterations ?? solver.itemax ?? DEFAULT_MAX_ITERATIONS,
      maxSteps: solver.maxSteps ?? DEFAULT_MAX_STEPS,
      yieldTolerance:
        solver.yieldTolerance ?? DEFAULT_YIELD_TOLERANCE,
    };
    this.metadata = {
      ...metadata,
      analysisType: "steel-ring-frame-pushover",
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: unitResolver.sourceUnitSystem,
    };

    assertPositive(
      this.loading.referenceHorizontalForce,
      "loading.referenceHorizontalForce",
    );
    assertPositive(
      this.solver.controlDisplacementIncrement,
      "solver.controlDisplacementIncrement",
    );
    assertPositive(
      this.solver.maxControlDisplacement,
      "solver.maxControlDisplacement",
    );
    assertFinite(this.solver.tolerance, "solver.tolerance");
    assertPositive(this.solver.maxIterations, "solver.maxIterations");
    assertPositive(this.solver.maxSteps, "solver.maxSteps");
    assertPositive(this.solver.yieldTolerance, "solver.yieldTolerance");
  }

  topNodeId() {
    return this.loading.controlNode === "top-right"
      ? `${this.id}-tr`
      : `${this.id}-tl`;
  }

  sourceUnits() {
    return this.metadata.sourceUnitSystem ?? null;
  }

  toJSON() {
    return {
      id: this.id,
      units: { ...this.units },
      geometry: { ...this.geometry },
      baseCondition: this.baseCondition,
      includeBottomBeam: this.includeBottomBeam,
      material: this.material?.toJSON?.() ?? this.material,
      memberSections: Object.fromEntries(
        Object.entries(this.memberSections).map(([key, section]) => [
          key,
          section?.toJSON?.() ?? section,
        ]),
      ),
      memberOrientations: Object.fromEntries(
        Object.entries(this.memberOrientations).map(([key, orientation]) => [
          key,
          { ...orientation },
        ]),
      ),
      loading: { ...this.loading },
      solver: { ...this.solver },
      metadata: { ...this.metadata },
    };
  }
}
