import { RCUltimateSectionSolver } from "./RCUltimateSectionSolver.js";

export class RCBiaxialDomainBuilder {
  constructor({
    ultimateSolver = new RCUltimateSectionSolver(),
  } = {}) {
    this.ultimateSolver = ultimateSolver;
  }

  buildAtAxialLoad({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    nEd,
    angleCount = 32,
    referencePoint = null,
    compressedSide = "positive",
  } = {}) {
    if (!Number.isInteger(angleCount) || angleCount < 4) {
      throw new Error("RCBiaxialDomainBuilder angleCount must be an integer >= 4.");
    }

    const points = [];

    for (let index = 0; index < angleCount; index += 1) {
      const theta = (2 * Math.PI * index) / angleCount;
      const solved = this.ultimateSolver.solveAtAxialLoad({
        section,
        concreteFibers,
        concreteLaw,
        steelLaw,
        nEd,
        theta,
        compressedSide,
        referencePoint,
      });

      points.push({
        theta,
        MxRd: solved.MxRd,
        MyRd: solved.MyRd,
        neutralAxisDepth: solved.neutralAxisDepth,
        axialResidual: solved.axialResidual,
        failureMode: solved.failureMode,
        converged: solved.converged,
      });
    }

    return {
      nEd,
      angleCount,
      compressedSide,
      points,
    };
  }
}
