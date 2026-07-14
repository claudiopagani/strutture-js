import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import {
  steelNotSupportedCheck,
  verifySteelBendingShearInteraction,
  verifySteelConcentratedWebLoad,
  verifySteelShearTorsionInteraction,
  verifySteelWebShearBuckling,
} from "./SteelAdvancedMemberChecks.js";

const round = (value, decimals = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

function inSegment(station, segment) {
  return (!Number.isFinite(segment.from) || station >= segment.from - 1e-9) &&
    (!Number.isFinite(segment.to) || station <= segment.to + 1e-9);
}

function maxSample(samples, selector, segment = null) {
  return samples.filter((sample) => !segment || inSegment(sample.station, segment))
    .reduce((selected, sample) =>
      !selected || Math.abs(selector(sample)) > Math.abs(selector(selected)) ? sample : selected, null);
}

function decorate(check, combination, station = null, segment = null, restraintAssumptions = {}) {
  return {
    ...check,
    metadata: {
      norm: "NTC 2018 / Circolare 2019",
      combinationId: combination?.id ?? null,
      limitState: combination?.limitState ?? null,
      station: station?.station ?? null,
      coordinates: station?.coordinates ? { ...station.coordinates } : null,
      governingSegment: segment?.id ?? null,
      restraintAssumptions: { ...restraintAssumptions },
      ...check.metadata,
    },
    warnings: [...(check.warnings ?? [])],
    assumptions: [...(check.assumptions ?? [])],
  };
}

export function steelUnsupportedFeatureCatalog() {
  return [
    steelNotSupportedCheck({ id: "steel-warping-torsion", description: "Warping torsion and bimoment verification", missingInputs: ["warping normal/shear stress distribution", "sectorial coordinates", "warping restraints and load eccentricities"], reference: "NTC 2018 §4.2.4.1.2.7; UNI EN 1993-1-1 §6.2.7" }),
    steelNotSupportedCheck({ id: "steel-torsional-flexural-torsional-buckling", description: "Torsional and flexural-torsional buckling of non-doubly-symmetric open sections", missingInputs: ["shear-centre coordinates", "warping constant", "torsional effective length", "end warping restraints", "elastic critical loads Ncr,T and Ncr,TF"], reference: "Circolare 2019 C4.2.4.1.3.1; UNI EN 1993-1-1 §6.3.1.4" }),
    steelNotSupportedCheck({ id: "steel-class-4-effective-properties", description: "Class 4 effective properties and stability", missingInputs: ["effective area Aeff", "effective section moduli Weff,y/Weff,z", "neutral-axis shift", "plate buckling reduction factors"], reference: "NTC 2018 §4.2.4.1.2.2; UNI EN 1993-1-5 §4" }),
    steelNotSupportedCheck({ id: "steel-fatigue", description: "Steel fatigue verification", missingInputs: ["stress-range spectrum", "detail category", "cycle counts", "partial factors and damage accumulation rule"], reference: "NTC 2018 §4.2.4.1.4; UNI EN 1993-1-9" }),
    steelNotSupportedCheck({ id: "steel-built-up-cold-formed", description: "Built-up members and cold-formed profiles", missingInputs: ["component spacing and connectors", "built-up shear stiffness", "local/distortional buckling data", "cold-forming corner properties"], reference: "NTC 2018 §4.2.4; UNI EN 1993-1-1 §6.4 and UNI EN 1993-1-3" }),
  ];
}

export function verifySteelFem3DAdvanced({ contract, section, material, resultToSectionUnits, sectionToResultUnits, serviceability = {}, resistance = {}, stability = {} } = {}) {
  const checks = [];
  const warnings = [];
  const assumptions = [];
  const activeNotSupported = [];
  const family = String(section?.family ?? "").toUpperCase();
  const fy = material?.fyk;
  const gammaM0 = material?.metadata?.gammaM0 ?? 1.05;
  const bendingCapacity = sectionToResultUnits.moment((section?.plasticSectionModulusY ?? section?.elasticSectionModulusY) * fy / gammaM0);
  const shearArea = section?.shearAreaY ?? section?.area;
  const shearCapacity = sectionToResultUnits.force((shearArea * fy) / (Math.sqrt(3) * gammaM0));
  const member = contract.member;
  const activateUnsupported = (check) => {
    if (!activeNotSupported.some((item) => item.id === check.id)) {
      activeNotSupported.push(check);
      checks.push(check);
      warnings.push(...(check.warnings ?? []));
    }
  };
  const restraintAssumptions = {
    sway: member.frameClassification.sway,
    nonSway: member.frameClassification.nonSway,
    effectiveLengths: { ...member.effectiveLengths },
    effectiveLengthFactors: { ...member.effectiveLengthFactors },
  };

  for (const combination of contract.combinations) {
    if (combination.limitState === "SLU") {
      for (const panel of member.webPanels) {
        const sample = maxSample(combination.stations, (item) => item.actions.Vy ?? 0, panel);
        if (!sample) continue;
        const result = verifySteelWebShearBuckling({ section, material, vEd: resultToSectionUnits.force(sample.actions.Vy ?? 0), panel: { ...panel, length: resultToSectionUnits.length(panel.length) } });
        const decorated = decorate(result.check, combination, sample, panel, restraintAssumptions);
        if (Number.isFinite(decorated.capacity)) decorated.capacity = round(sectionToResultUnits.force(decorated.capacity));
        decorated.demand = round(Math.abs(sample.actions.Vy ?? 0));
        checks.push(decorated);
        warnings.push(...decorated.warnings);
        if (decorated.status === RESULT_STATUS.NOT_SUPPORTED) activeNotSupported.push(decorated);
      }

      const bendingShearSample = resistance.class4Detected ? null : maxSample(combination.stations, (item) => {
        const m = Math.abs(item.actions.My ?? 0) / Math.max(bendingCapacity, 1e-12);
        const v = Math.abs(item.actions.Vy ?? 0) / Math.max(shearCapacity, 1e-12);
        return m + v;
      });
      if (bendingShearSample) {
        const result = verifySteelBendingShearInteraction({ section, material, mEd: resultToSectionUnits.moment(bendingShearSample.actions.My ?? 0), vEd: resultToSectionUnits.force(bendingShearSample.actions.Vy ?? 0), bendingCapacity: resultToSectionUnits.moment(bendingCapacity), shearCapacity: resultToSectionUnits.force(shearCapacity) });
        const decorated = decorate(result.check, combination, bendingShearSample, null, restraintAssumptions);
        if (Number.isFinite(decorated.capacity)) decorated.capacity = round(sectionToResultUnits.moment(decorated.capacity));
        decorated.demand = round(Math.abs(bendingShearSample.actions.My ?? 0));
        checks.push(decorated);
      }

      for (const load of member.concentratedLoads.filter((item) => !item.combinationId || item.combinationId === combination.id)) {
        const panel = member.webPanels.find((item) => inSegment(load.station, item));
        const loadForCheck = { ...load, force: resultToSectionUnits.force(load.force), bearingLength: resultToSectionUnits.length(load.bearingLength) };
        const panelForCheck = panel ? { ...panel, length: resultToSectionUnits.length(panel.length) } : {};
        const result = verifySteelConcentratedWebLoad({ section, material, load: loadForCheck, panel: panelForCheck });
        const station = combination.stations.find((item) => Math.abs(item.station - load.station) <= 1e-9) ?? null;
        const decorated = decorate(result.check, combination, station, panel, restraintAssumptions);
        if (Number.isFinite(decorated.capacity)) decorated.capacity = round(sectionToResultUnits.force(decorated.capacity));
        decorated.demand = Number.isFinite(load.force) ? round(Math.abs(load.force)) : null;
        checks.push(decorated);
        warnings.push(...decorated.warnings);
        if (decorated.status === RESULT_STATUS.NOT_SUPPORTED) activeNotSupported.push(decorated);
      }

      const torsionSample = maxSample(combination.stations, (item) => item.actions.T ?? 0);
      const bimomentSample = maxSample(combination.stations, (item) => item.actions.B ?? 0);
      if (bimomentSample && Math.abs(bimomentSample.actions.B ?? 0) > 1e-9) {
        const unsupported = decorate(steelUnsupportedFeatureCatalog()[0], combination, bimomentSample, null, restraintAssumptions);
        checks.push(unsupported);
        activeNotSupported.push(unsupported);
        warnings.push(...unsupported.warnings);
      } else if (torsionSample && Math.abs(torsionSample.actions.T ?? 0) > 1e-9) {
        const result = verifySteelShearTorsionInteraction({ section, material, vEd: resultToSectionUnits.force(torsionSample.actions.Vy ?? 0), tEd: resultToSectionUnits.moment(torsionSample.actions.T), shearCapacity: resultToSectionUnits.force(shearCapacity) });
        const decorated = decorate(result.check, combination, torsionSample, null, restraintAssumptions);
        if (Number.isFinite(decorated.capacity)) decorated.capacity = round(sectionToResultUnits.force(decorated.capacity));
        decorated.demand = round(Math.abs(torsionSample.actions.Vy ?? 0));
        checks.push(decorated);
        warnings.push(...decorated.warnings);
        if (decorated.status === RESULT_STATUS.NOT_SUPPORTED) activeNotSupported.push(decorated);
      }
    }
  }

  const hasCompressionDemand = contract.combinations.some(
    (combination) => combination.limitState === "SLU" && combination.stations.some(
      (sample) => Math.abs(sample.actions.N ?? 0) > 1e-9,
    ),
  );
  if (["L", "LU", "T", "UPN"].includes(family) && hasCompressionDemand) {
    activateUnsupported(steelUnsupportedFeatureCatalog()[1]);
  }
  const hw = Number.isFinite(section?.height) && Number.isFinite(section?.flangeThickness)
    ? section.height - 2 * section.flangeThickness - 2 * (section.rootRadius ?? 0)
    : null;
  const epsilon = Number.isFinite(fy) && fy > 0 ? Math.sqrt(235 / fy) : null;
  if (["IPE", "HEA", "HEB", "HEM"].includes(family) && member.webPanels.length === 0 &&
      Number.isFinite(hw) && Number.isFinite(section?.webThickness) && Number.isFinite(epsilon) &&
      hw / section.webThickness > (72 * epsilon) / (fy <= 460 ? 1.2 : 1)) {
    activateUnsupported(steelNotSupportedCheck({
      id: "steel-web-shear-buckling",
      description: "Web shear buckling",
      missingInputs: ["web panel boundaries", "transverse stiffener positions", "end-post classification"],
      reference: "NTC 2018 §4.2.4.1.2.6; UNI EN 1993-1-5 §5",
    }));
  }
  if (family === "COMPOUND" || resistance.coldFormed === true) {
    activateUnsupported(steelUnsupportedFeatureCatalog()[4]);
  }
  if (resistance.fatigue?.enabled === true) activateUnsupported(steelUnsupportedFeatureCatalog()[3]);

  const vibration = {
    status: "requires-input",
    automatic: false,
    requiredInputs: ["modal frequencies", "modal masses", "damping ratio", "occupancy/excitation model", "acceleration or response limits"],
    reference: "NTC 2018 §4.2.4.2.2 and §7.2.6; ISO 10137",
    availableFemFields: ["combinationId", "station", "u", "v", "w", "rotations"],
    metadata: { requested: serviceability.vibration?.enabled === true },
  };

  return {
    checks,
    warnings: [...new Set(warnings)],
    assumptions,
    activeNotSupported,
    unsupportedFeatures: steelUnsupportedFeatureCatalog(),
    vibration,
    status: activeNotSupported.length > 0
      ? RESULT_STATUS.NOT_SUPPORTED
      : checks.every((check) => check.ok !== false) ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
  };
}
