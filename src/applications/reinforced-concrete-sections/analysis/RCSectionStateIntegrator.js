function accumulateExtreme(current, candidate, comparator) {
  if (current == null) {
    return candidate;
  }

  return comparator(candidate.value, current.value) ? candidate : current;
}

function resolveStrainLimit(law, strain) {
  const limits = law?.strainLimits?.() ?? {};
  const rawLimit = strain >= 0 ? limits.tension : limits.compression;

  return Number.isFinite(rawLimit) && rawLimit !== 0
    ? Math.abs(rawLimit)
    : null;
}

export function normalizePostUltimateFractureEnergyDensity(value) {
  if (value == null) {
    return {
      concrete: 0,
      steel: 0,
    };
  }

  if (Number.isFinite(value) && value >= 0) {
    return {
      concrete: value,
      steel: value,
    };
  }

  if (typeof value !== "object") {
    throw new Error(
      "RC post-ultimate fracture energy density must be a non-negative number or an object.",
    );
  }

  const normalized = {
    concrete: value.concrete ?? 0,
    steel: value.steel ?? 0,
  };

  for (const [material, energyDensity] of Object.entries(normalized)) {
    if (!Number.isFinite(energyDensity) || energyDensity < 0) {
      throw new Error(
        `RC post-ultimate ${material} fracture energy density must be non-negative.`,
      );
    }
  }

  return normalized;
}

function applyPostUltimateResponse({
  stress,
  strain,
  law,
  response,
  fractureEnergyDensity,
}) {
  const strainLimit = resolveStrainLimit(law, strain);
  const strainUtilization =
    strainLimit == null ? 0 : Math.abs(strain) / strainLimit;

  if (response === "retain" || strainLimit == null || strainUtilization <= 1) {
    return {
      stress,
      originalStress: stress,
      strainLimit,
      strainUtilization,
      postUltimate: false,
      stressReductionFactor: 1,
      fractureEnergyDensity,
      terminalStrain: null,
    };
  }

  if (response === "zero-stress" || fractureEnergyDensity <= 0) {
    return {
      stress: 0,
      originalStress: stress,
      strainLimit,
      strainUtilization,
      postUltimate: true,
      stressReductionFactor: 0,
      fractureEnergyDensity: 0,
      terminalStrain: strainLimit,
    };
  }

  const limitStrain = Math.sign(strain || 1) * strainLimit;
  const limitStress = Math.abs(law.stress(limitStrain));

  if (limitStress <= 0) {
    return {
      stress: 0,
      originalStress: stress,
      strainLimit,
      strainUtilization,
      postUltimate: true,
      stressReductionFactor: 0,
      fractureEnergyDensity,
      terminalStrain: strainLimit,
    };
  }

  const terminalStrain =
    strainLimit + (2 * fractureEnergyDensity) / limitStress;
  const stressReductionFactor = Math.max(
    0,
    (terminalStrain - Math.abs(strain)) /
      (terminalStrain - strainLimit),
  );

  return {
    stress: stress * stressReductionFactor,
    originalStress: stress,
    strainLimit,
    strainUtilization,
    postUltimate: true,
    stressReductionFactor,
    fractureEnergyDensity,
    terminalStrain,
  };
}

/**
 * Integrates N, Mx = Mzz = -sum(Fi * yi), and My = Myy = sum(Fi * zi).
 */
export class RCSectionStateIntegrator {
  evaluate({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    strainField,
    referencePoint = null,
    includeConcreteTension = true,
    includeResponseDetails = true,
    postUltimateResponse = "zero-stress",
    postUltimateFractureEnergyDensity = null,
  } = {}) {
    if (!section?.concreteSection) {
      throw new Error("RCSectionStateIntegrator requires a reinforced concrete section.");
    }

    if (!Array.isArray(concreteFibers)) {
      throw new Error("RCSectionStateIntegrator requires a concreteFibers array.");
    }

    if (!concreteLaw || typeof concreteLaw.stress !== "function") {
      throw new Error("RCSectionStateIntegrator requires a concreteLaw with a stress method.");
    }

    if (!steelLaw || typeof steelLaw.stress !== "function") {
      throw new Error("RCSectionStateIntegrator requires a steelLaw with a stress method.");
    }

    if (!strainField || typeof strainField.strainAt !== "function") {
      throw new Error("RCSectionStateIntegrator requires a strainField with a strainAt method.");
    }

    if (
      !["retain", "linear-softening", "zero-stress"].includes(
        postUltimateResponse,
      )
    ) {
      throw new Error(
        `Unsupported RC post-ultimate response: ${postUltimateResponse}.`,
      );
    }

    const fractureEnergyDensity =
      normalizePostUltimateFractureEnergyDensity(
      postUltimateFractureEnergyDensity,
    );

    if (
      postUltimateResponse === "linear-softening" &&
      fractureEnergyDensity.concrete <= 0 &&
      fractureEnergyDensity.steel <= 0
    ) {
      throw new Error(
        "RCSectionStateIntegrator linear softening requires a positive postUltimateFractureEnergyDensity.",
      );
    }

    const resolvedReferencePoint =
      referencePoint ?? section.getReferencePoint("concrete-centroid");

    if (
      !Number.isFinite(resolvedReferencePoint.y) ||
      !Number.isFinite(resolvedReferencePoint.z)
    ) {
      throw new Error("RCSectionStateIntegrator requires a finite reference point.");
    }

    let axialForce = 0;
    let momentX = 0;
    let momentY = 0;
    let concreteAxialForce = 0;
    let steelAxialForce = 0;
    let concreteCompression = null;
    let concreteTension = null;
    let steelCompression = null;
    let steelTension = null;
    let steelCompressionStrain = null;
    let steelTensionStrain = null;
    let minStrain = null;
    let maxStrain = null;
    let postUltimateConcreteFiberCount = 0;
    let postUltimateSteelBarCount = 0;
    const reinforcementBars = section.getReinforcementBars();

    if (!includeResponseDetails) {
      for (const fiber of concreteFibers) {
        const strain = strainField.strainAt(fiber);
        let stress = concreteLaw.stress(strain);
        const strainLimit = resolveStrainLimit(concreteLaw, strain);
        const strainUtilization =
          strainLimit == null ? 0 : Math.abs(strain) / strainLimit;
        const isPostUltimate =
          postUltimateResponse !== "retain" &&
          strainLimit != null &&
          strainUtilization > 1;

        if (isPostUltimate) {
          postUltimateConcreteFiberCount += 1;

          if (
            postUltimateResponse === "zero-stress" ||
            fractureEnergyDensity.concrete <= 0
          ) {
            stress = 0;
          } else {
            const limitStrain = Math.sign(strain || 1) * strainLimit;
            const limitStress = Math.abs(concreteLaw.stress(limitStrain));

            if (limitStress <= 0) {
              stress = 0;
            } else {
              const terminalStrain =
                strainLimit +
                (2 * fractureEnergyDensity.concrete) / limitStress;
              const stressReductionFactor = Math.max(
                0,
                (terminalStrain - Math.abs(strain)) /
                  (terminalStrain - strainLimit),
              );
              stress *= stressReductionFactor;
            }
          }
        }

        if (!includeConcreteTension && stress > 0) {
          stress = 0;
        }

        const force = stress * fiber.area;
        const leverY = fiber.y - resolvedReferencePoint.y;
        const leverZ = fiber.z - resolvedReferencePoint.z;
        const mx = -force * leverY;
        const my = force * leverZ;

        axialForce += force;
        momentX += mx;
        momentY += my;
        concreteAxialForce += force;
        minStrain = minStrain == null ? strain : Math.min(minStrain, strain);
        maxStrain = maxStrain == null ? strain : Math.max(maxStrain, strain);

        if (stress < 0) {
          concreteCompression = accumulateExtreme(
            concreteCompression,
            { value: stress, y: fiber.y, z: fiber.z, strain },
            (candidate, current) => candidate < current,
          );
        } else if (stress > 0) {
          concreteTension = accumulateExtreme(
            concreteTension,
            { value: stress, y: fiber.y, z: fiber.z, strain },
            (candidate, current) => candidate > current,
          );
        }
      }

      for (const bar of reinforcementBars) {
        const strain = strainField.strainAt(bar);
        let stress = steelLaw.stress(strain);
        const strainLimit = resolveStrainLimit(steelLaw, strain);
        const strainUtilization =
          strainLimit == null ? 0 : Math.abs(strain) / strainLimit;
        const isPostUltimate =
          postUltimateResponse !== "retain" &&
          strainLimit != null &&
          strainUtilization > 1;

        if (isPostUltimate) {
          postUltimateSteelBarCount += 1;

          if (
            postUltimateResponse === "zero-stress" ||
            fractureEnergyDensity.steel <= 0
          ) {
            stress = 0;
          } else {
            const limitStrain = Math.sign(strain || 1) * strainLimit;
            const limitStress = Math.abs(steelLaw.stress(limitStrain));

            if (limitStress <= 0) {
              stress = 0;
            } else {
              const terminalStrain =
                strainLimit +
                (2 * fractureEnergyDensity.steel) / limitStress;
              const stressReductionFactor = Math.max(
                0,
                (terminalStrain - Math.abs(strain)) /
                  (terminalStrain - strainLimit),
              );
              stress *= stressReductionFactor;
            }
          }
        }

        const force = stress * bar.area;
        const leverY = bar.y - resolvedReferencePoint.y;
        const leverZ = bar.z - resolvedReferencePoint.z;
        const mx = -force * leverY;
        const my = force * leverZ;

        axialForce += force;
        momentX += mx;
        momentY += my;
        steelAxialForce += force;
        minStrain = minStrain == null ? strain : Math.min(minStrain, strain);
        maxStrain = maxStrain == null ? strain : Math.max(maxStrain, strain);

        if (stress < 0) {
          steelCompression = accumulateExtreme(
            steelCompression,
            { value: stress, id: bar.id, y: bar.y, z: bar.z, strain },
            (candidate, current) => candidate < current,
          );
        } else if (stress > 0) {
          steelTension = accumulateExtreme(
            steelTension,
            { value: stress, id: bar.id, y: bar.y, z: bar.z, strain },
            (candidate, current) => candidate > current,
          );
        }

        if (strain < 0) {
          steelCompressionStrain = accumulateExtreme(
            steelCompressionStrain,
            { value: strain, stress, id: bar.id, y: bar.y, z: bar.z, strain },
            (candidate, current) => candidate < current,
          );
        } else if (strain > 0) {
          steelTensionStrain = accumulateExtreme(
            steelTensionStrain,
            { value: strain, stress, id: bar.id, y: bar.y, z: bar.z, strain },
            (candidate, current) => candidate > current,
          );
        }
      }

      return {
        N: axialForce,
        Mx: momentX,
        My: momentY,
        referencePoint: { ...resolvedReferencePoint },
        concrete: {
          axialForce: concreteAxialForce,
          fibers: [],
        },
        steel: {
          axialForce: steelAxialForce,
          bars: [],
        },
        postUltimate: {
          response: postUltimateResponse,
          fractureEnergyDensity:
            postUltimateResponse === "linear-softening"
              ? { ...fractureEnergyDensity }
              : {
                  concrete: 0,
                  steel: 0,
                },
          fractureEnergyDensityUnits: "N/mm2",
          fractureEnergyInterpretation: "energy-per-unit-volume",
          concreteFiberCount: postUltimateConcreteFiberCount,
          steelBarCount: postUltimateSteelBarCount,
          active:
            postUltimateConcreteFiberCount > 0 ||
            postUltimateSteelBarCount > 0,
        },
        extremes: {
          minStrain,
          maxStrain,
          maxConcreteCompression: concreteCompression,
          maxConcreteTension: concreteTension,
          maxSteelCompression: steelCompression,
          maxSteelTension: steelTension,
          maxSteelCompressionStrain: steelCompressionStrain,
          maxSteelTensionStrain: steelTensionStrain,
        },
      };
    }

    const concreteResponse = concreteFibers.map((fiber) => {
      const strain = strainField.strainAt(fiber);
      const materialResponse = applyPostUltimateResponse({
        stress: concreteLaw.stress(strain),
        strain,
        law: concreteLaw,
        response: postUltimateResponse,
        fractureEnergyDensity: fractureEnergyDensity.concrete,
      });
      let stress = materialResponse.stress;

      if (!includeConcreteTension && stress > 0) {
        stress = 0;
      }

      if (materialResponse.postUltimate) {
        postUltimateConcreteFiberCount += 1;
      }

      const force = stress * fiber.area;
      const leverY = fiber.y - resolvedReferencePoint.y;
      const leverZ = fiber.z - resolvedReferencePoint.z;
      const mx = -force * leverY;
      const my = force * leverZ;

      axialForce += force;
      momentX += mx;
      momentY += my;
      concreteAxialForce += force;
      minStrain = minStrain == null ? strain : Math.min(minStrain, strain);
      maxStrain = maxStrain == null ? strain : Math.max(maxStrain, strain);

      if (stress < 0) {
        concreteCompression = accumulateExtreme(
          concreteCompression,
          { value: stress, y: fiber.y, z: fiber.z, strain },
          (candidate, current) => candidate < current,
        );
      } else if (stress > 0) {
        concreteTension = accumulateExtreme(
          concreteTension,
          { value: stress, y: fiber.y, z: fiber.z, strain },
          (candidate, current) => candidate > current,
        );
      }

      return {
        ...fiber,
        strain,
        stress,
        originalStress: materialResponse.originalStress,
        strainLimit: materialResponse.strainLimit,
        strainUtilization: materialResponse.strainUtilization,
        postUltimate: materialResponse.postUltimate,
        stressReductionFactor: materialResponse.stressReductionFactor,
        fractureEnergyDensity:
          materialResponse.fractureEnergyDensity,
        terminalStrain: materialResponse.terminalStrain,
        force,
        mx,
        my,
      };
    });

    const steelResponse = reinforcementBars.map((bar) => {
      const strain = strainField.strainAt(bar);
      const materialResponse = applyPostUltimateResponse({
        stress: steelLaw.stress(strain),
        strain,
        law: steelLaw,
        response: postUltimateResponse,
        fractureEnergyDensity: fractureEnergyDensity.steel,
      });
      const stress = materialResponse.stress;

      if (materialResponse.postUltimate) {
        postUltimateSteelBarCount += 1;
      }

      const force = stress * bar.area;
      const leverY = bar.y - resolvedReferencePoint.y;
      const leverZ = bar.z - resolvedReferencePoint.z;
      const mx = -force * leverY;
      const my = force * leverZ;

      axialForce += force;
      momentX += mx;
      momentY += my;
      steelAxialForce += force;
      minStrain = minStrain == null ? strain : Math.min(minStrain, strain);
      maxStrain = maxStrain == null ? strain : Math.max(maxStrain, strain);

      if (stress < 0) {
        steelCompression = accumulateExtreme(
          steelCompression,
          { value: stress, id: bar.id, y: bar.y, z: bar.z, strain },
          (candidate, current) => candidate < current,
        );
      } else if (stress > 0) {
        steelTension = accumulateExtreme(
          steelTension,
          { value: stress, id: bar.id, y: bar.y, z: bar.z, strain },
          (candidate, current) => candidate > current,
        );
      }

      if (strain < 0) {
        steelCompressionStrain = accumulateExtreme(
          steelCompressionStrain,
          { value: strain, stress, id: bar.id, y: bar.y, z: bar.z, strain },
          (candidate, current) => candidate < current,
        );
      } else if (strain > 0) {
        steelTensionStrain = accumulateExtreme(
          steelTensionStrain,
          { value: strain, stress, id: bar.id, y: bar.y, z: bar.z, strain },
          (candidate, current) => candidate > current,
        );
      }

      return {
        id: bar.id,
        name: bar.name,
        area: bar.area,
        y: bar.y,
        z: bar.z,
        strain,
        stress,
        originalStress: materialResponse.originalStress,
        strainLimit: materialResponse.strainLimit,
        strainUtilization: materialResponse.strainUtilization,
        postUltimate: materialResponse.postUltimate,
        stressReductionFactor: materialResponse.stressReductionFactor,
        fractureEnergyDensity:
          materialResponse.fractureEnergyDensity,
        terminalStrain: materialResponse.terminalStrain,
        force,
        mx,
        my,
      };
    });

    return {
      N: axialForce,
      Mx: momentX,
      My: momentY,
      referencePoint: { ...resolvedReferencePoint },
      concrete: {
        axialForce: concreteAxialForce,
        fibers: concreteResponse,
      },
      steel: {
        axialForce: steelAxialForce,
        bars: steelResponse,
      },
      postUltimate: {
        response: postUltimateResponse,
        fractureEnergyDensity:
          postUltimateResponse === "linear-softening"
            ? { ...fractureEnergyDensity }
            : {
                concrete: 0,
                steel: 0,
              },
        fractureEnergyDensityUnits: "N/mm2",
        fractureEnergyInterpretation: "energy-per-unit-volume",
        concreteFiberCount: postUltimateConcreteFiberCount,
        steelBarCount: postUltimateSteelBarCount,
        active:
          postUltimateConcreteFiberCount > 0 ||
          postUltimateSteelBarCount > 0,
      },
      extremes: {
        minStrain,
        maxStrain,
        maxConcreteCompression: concreteCompression,
        maxConcreteTension: concreteTension,
        maxSteelCompression: steelCompression,
        maxSteelTension: steelTension,
        maxSteelCompressionStrain: steelCompressionStrain,
        maxSteelTensionStrain: steelTensionStrain,
      },
    };
  }
}
