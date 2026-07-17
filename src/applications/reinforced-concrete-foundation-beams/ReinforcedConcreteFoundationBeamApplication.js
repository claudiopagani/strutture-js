import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import { VerificationResult } from "../../core/results/VerificationResult.js";
import { FoundationBeamAnalysis } from "../../domain/foundations/FoundationBeamAnalysis.js";
import { ReinforcedConcreteBeamVerification } from "../reinforced-concrete-sections/checks/ReinforcedConcreteBeamVerification.js";
import { SectionMomentCurvatureCurve } from "../rc-cracked-deflection/analysis/SectionMomentCurvatureCurve.js";
import { createUnitResolver } from "../../domain/units/UnitSystem.js";
import { ReinforcedConcreteFoundationBeamModel } from "./ReinforcedConcreteFoundationBeamModel.js";

function json(value) {
  return typeof value?.toJSON === "function" ? value.toJSON() : value;
}

const SECTION_UNITS = Object.freeze({ force: "N", length: "mm" });
const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });

function transformedGross(section, modularRatio) {
  const concrete = section.concreteSection;
  const bars = section.getReinforcementBars();
  const transformedArea = concrete.area + bars.reduce(
    (sum, bar) => sum + modularRatio * bar.area,
    0,
  );
  const centroid = (
    concrete.area * concrete.centroidY +
    bars.reduce((sum, bar) => sum + modularRatio * bar.area * bar.y, 0)
  ) / transformedArea;
  const inertia = concrete.inertiaY +
    concrete.area * (concrete.centroidY - centroid) ** 2 +
    bars.reduce(
      (sum, bar) => sum + modularRatio * bar.area * (bar.y - centroid) ** 2,
      0,
    );

  return { centroid, inertia };
}

function createCrackedStiffnessResolver(model) {
  const settings = model.verification.crackedStiffness;
  if (!settings?.enabled) return null;

  const toSection = createUnitResolver(FEM_UNITS, SECTION_UNITS);
  const toFem = createUnitResolver(SECTION_UNITS, FEM_UNITS);
  const cache = new Map();

  return ({ moment, axialForce, context }) => {
    const quasiPermanent = String(
      context.combinationType ?? context.serviceCombination ?? "",
    ).toUpperCase().includes("QUASI");
    const creep = quasiPermanent ? settings.creepCoefficient : 0;
    const modularRatio = settings.modularRatio * (1 + creep);
    const effectiveConcreteModulus =
      model.reinforcementMaterial.elasticModulus / modularRatio;
    const gross = transformedGross(model.section, modularRatio);
    const bounds = model.section.getBoundingBox();
    const distanceBottom = gross.centroid - bounds.minY;
    const distanceTop = bounds.maxY - gross.centroid;
    const fctm = model.concreteMaterial.fctm;
    const mcrPositive = fctm * gross.inertia / distanceBottom;
    const mcrNegative = fctm * gross.inertia / distanceTop;
    const sectionMoment = toSection.moment(moment);
    const sectionAxialForce = toSection.force(axialForce);
    const quantizedAxial = Math.round(
      sectionAxialForce / settings.axialForceTolerance,
    ) * settings.axialForceTolerance;
    const key = [
      modularRatio.toPrecision(10),
      quantizedAxial.toPrecision(10),
    ].join("|");
    let curve = cache.get(key);

    if (!curve || Math.abs(sectionMoment) > curve.maxAbsMoment) {
      curve = new SectionMomentCurvatureCurve({
        section: model.section,
        reinforcementMaterial: model.reinforcementMaterial,
        effectiveModularRatio: modularRatio,
        mesh: model.verification.mesh,
        solver: model.verification.solver,
        mcr: mcrPositive,
        mcrPositive,
        mcrNegative,
        grossInertia: gross.inertia,
        concreteModulus: effectiveConcreteModulus,
        beta: creep > 0
          ? settings.betaLongTerm
          : settings.betaShortTerm,
        momentSamples: settings.momentSamples,
        initialMaxMoment: Math.max(
          Math.abs(sectionMoment),
          Math.min(mcrPositive, mcrNegative),
        ),
        axialForce: quantizedAxial,
        units: SECTION_UNITS,
      });
      cache.set(key, curve);
    }

    return toFem.convert(curve.lookupEI(sectionMoment), {
      forceExponent: 1,
      lengthExponent: 2,
    });
  };
}

export class ReinforcedConcreteFoundationBeamApplication extends StructuralApplication {
  constructor({ analysis = new FoundationBeamAnalysis() } = {}) {
    super({
      id: "reinforced-concrete-foundation-beams",
      name: "RC Foundation Beams",
      description:
        "Iterative compression-only Winkler analysis with cracked RC stiffness and local verification of horizontal foundation beams.",
      domain: "reinforced-concrete",
      supportedCodes: ["NTC2018"],
      tags: ["rc", "beam", "foundation", "winkler", "soil-springs"],
      metadata: {
        maturity: "implemented-local",
        limitations: [
          "horizontal prismatic beam only",
          "independent tributary-lumped Winkler springs",
          "subgrade modulus and imposed settlements are assigned inputs",
          "no soil plasticity, hysteresis or pressure-dependent subgrade modulus",
        ],
      },
    });

    this.analysis = analysis;
  }

  run(input = {}) {
    if (!input.model) {
      throw new Error("ReinforcedConcreteFoundationBeamApplication requires a model.");
    }

    const model = input.model instanceof ReinforcedConcreteFoundationBeamModel
      ? input.model
      : new ReinforcedConcreteFoundationBeamModel(input.model);
    const flexuralRigidityResolver = createCrackedStiffnessResolver(model);
    const analysis = this.analysis.analyze(model, {
      flexuralRigidityResolver,
    });
    const settings = model.verification;
    const verification = new ReinforcedConcreteBeamVerification({
      code: settings.code,
      mesh: settings.mesh,
      solver: settings.solver,
      shear: settings.shear,
      torsion: settings.torsion,
      serviceability: settings.serviceability,
      verificationStations: settings.verificationStations,
      metadata: {
        elementType: "foundation-beam",
      },
    }).verify({
      beamId: model.id,
      section: model.section,
      concreteMaterial: model.concreteMaterial,
      reinforcementMaterial: model.reinforcementMaterial,
      analysisResult: analysis,
      beamModel: model,
    });
    const verificationJson = json(verification);
    const analyzedResults = [
      ...Object.values(analysis.loadCases),
      ...Object.values(analysis.combinations),
    ];
    const contactViolation = analyzedResults.some(
      (result) => result.foundation.contactAssumptionViolated,
    );
    const iterationFailure = analyzedResults.some(
      (result) => result.foundationIteration?.converged === false,
    );
    const status = contactViolation || iterationFailure
      ? RESULT_STATUS.NOT_SUPPORTED
      : verification.status;

    return new VerificationResult({
      applicationId: this.id,
      status,
      summary: contactViolation || iterationFailure
        ? "Foundation-beam contact or cracked-stiffness iteration did not produce a verified converged state."
        : "Foundation-beam analysis and supported local RC checks completed.",
      outputs: {
        modelId: model.id,
        analysis,
        verification: verificationJson,
      },
      demand: verificationJson.demand ?? null,
      capacity: verificationJson.capacity ?? null,
      utilizationRatio: verificationJson.utilizationRatio ?? null,
      checks: verificationJson.checks ?? [],
      warnings: [
        ...analysis.warnings,
        ...(verificationJson.warnings ?? []),
        ...(flexuralRigidityResolver
          ? []
          : ["Cracked stiffness iteration was explicitly disabled; reported displacements use the assigned elastic section stiffness."]),
      ],
      assumptions: [
        ...analysis.assumptions,
        ...(verificationJson.assumptions ?? []),
      ],
      metadata: {
        code: settings.code,
        foundationModel: analysis.foundationModel,
        contactViolation,
        iterationFailure,
        crackedStiffnessIteration: Boolean(flexuralRigidityResolver),
      },
    });
  }
}
