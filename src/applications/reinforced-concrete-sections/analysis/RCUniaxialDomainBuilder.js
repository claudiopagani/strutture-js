import { RCUltimateSectionSolver } from "./RCUltimateSectionSolver.js";

function estimateAxialCapacity({ section, concreteLaw, steelLaw } = {}) {
  if (!section?.concreteSection) {
    throw new Error("RCUniaxialDomainBuilder requires a reinforced concrete section.");
  }

  const concreteArea = section.concreteSection.area;
  const reinforcementArea = section.totalReinforcementArea();
  const fcd = concreteLaw?.fcd ?? section.concreteMaterial?.fcd;
  const fyd = steelLaw?.fyd ?? section.reinforcementMaterial?.fyd;

  if (!Number.isFinite(concreteArea) || concreteArea <= 0) {
    throw new Error("RCUniaxialDomainBuilder requires a positive concrete area.");
  }

  if (!Number.isFinite(reinforcementArea) || reinforcementArea <= 0) {
    throw new Error("RCUniaxialDomainBuilder requires a positive reinforcement area.");
  }

  if (!Number.isFinite(fcd) || fcd <= 0) {
    throw new Error("RCUniaxialDomainBuilder requires a positive concrete fcd.");
  }

  if (!Number.isFinite(fyd) || fyd <= 0) {
    throw new Error("RCUniaxialDomainBuilder requires a positive reinforcement fyd.");
  }

  const steelCapacity = reinforcementArea * fyd;
  const compressionCapacity = 0.8 * concreteArea * fcd + steelCapacity;

  return {
    concreteArea,
    reinforcementArea,
    fcd,
    fyd,
    maximumTension: steelCapacity,
    maximumCompression: -compressionCapacity,
  };
}

function createAxialForceValues({ minimum, maximum, pointCount }) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) {
    throw new Error("RCUniaxialDomainBuilder requires a valid axial-force interval.");
  }

  if (!Number.isInteger(pointCount) || pointCount < 2) {
    throw new Error("RCUniaxialDomainBuilder requires at least two axial-force points.");
  }

  const step = (maximum - minimum) / (pointCount - 1);

  return Array.from({ length: pointCount }, (_, index) => minimum + step * index);
}

function uniqueSorted(values) {
  return [...new Set(values)]
    .filter((value) => Number.isFinite(value))
    .sort((first, second) => first - second);
}

function uniqueValues(values) {
  return [...new Set(values)];
}

export class RCUniaxialDomainBuilder {
  constructor({
    ultimateSolver = new RCUltimateSectionSolver(),
  } = {}) {
    this.ultimateSolver = ultimateSolver;
  }

  build({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    nValues,
    compressedEdge = "top",
    includeOppositeCurvature = true,
    pointCount = 15,
    referencePoint = null,
  } = {}) {
    const axialCapacity = estimateAxialCapacity({ section, concreteLaw, steelLaw });
    const resolvedNValues = Array.isArray(nValues) && nValues.length >= 2
      ? uniqueSorted(nValues)
      : createAxialForceValues({
          minimum: axialCapacity.maximumCompression,
          maximum: axialCapacity.maximumTension,
          pointCount,
        });

    if (resolvedNValues.length < 2) {
      throw new Error("RCUniaxialDomainBuilder requires at least two axial-force values.");
    }

    const compressedEdges = includeOppositeCurvature
      ? uniqueValues([compressedEdge, compressedEdge === "top" ? "bottom" : "top"])
      : [compressedEdge];

    const points = compressedEdges.flatMap((edge) =>
      resolvedNValues.map((nEd) => {
        const solved = this.ultimateSolver.solveUniaxialAtAxialLoad({
          section,
          concreteFibers,
          concreteLaw,
          steelLaw,
          nEd,
          compressedEdge: edge,
          referencePoint,
        });

        return {
          nEd,
          compressedEdge: edge,
          curvatureSign: edge === "top" ? "positive" : "negative",
          MxRd: solved.MxRd,
          MyRd: solved.MyRd,
          neutralAxisDepth: solved.neutralAxisDepth,
          axialResidual: solved.axialResidual,
          failureMode: solved.failureMode,
          concreteCompressionEdge:
            solved.concreteStrainExtremes?.compression ?? null,
          converged: solved.converged,
        };
      }),
    );

    return {
      compressedEdge,
      compressedEdges,
      nValues: resolvedNValues,
      axialCapacity,
      points,
    };
  }
}
