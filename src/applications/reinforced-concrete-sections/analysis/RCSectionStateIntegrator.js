function accumulateExtreme(current, candidate, comparator) {
  if (current == null) {
    return candidate;
  }

  return comparator(candidate.value, current.value) ? candidate : current;
}

export class RCSectionStateIntegrator {
  evaluate({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    strainField,
    referencePoint = null,
    includeConcreteTension = true,
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
    let minStrain = null;
    let maxStrain = null;

    const concreteResponse = concreteFibers.map((fiber) => {
      const strain = strainField.strainAt(fiber);
      let stress = concreteLaw.stress(strain);

      if (!includeConcreteTension && stress > 0) {
        stress = 0;
      }

      const force = stress * fiber.area;
      const leverY = fiber.y - resolvedReferencePoint.y;
      const leverZ = fiber.z - resolvedReferencePoint.z;
      const mx = force * leverY;
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
        force,
        mx,
        my,
      };
    });

    const steelResponse = section.getReinforcementBars().map((bar) => {
      const strain = strainField.strainAt(bar);
      const stress = steelLaw.stress(strain);
      const force = stress * bar.area;
      const leverY = bar.y - resolvedReferencePoint.y;
      const leverZ = bar.z - resolvedReferencePoint.z;
      const mx = force * leverY;
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

      return {
        id: bar.id,
        name: bar.name,
        area: bar.area,
        y: bar.y,
        z: bar.z,
        strain,
        stress,
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
      extremes: {
        minStrain,
        maxStrain,
        maxConcreteCompression: concreteCompression,
        maxConcreteTension: concreteTension,
        maxSteelCompression: steelCompression,
        maxSteelTension: steelTension,
      },
    };
  }
}
