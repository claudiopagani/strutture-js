import { RCUltimateSectionSolver } from "./RCUltimateSectionSolver.js";

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
    referencePoint = null,
  } = {}) {
    if (!Array.isArray(nValues) || nValues.length < 2) {
      throw new Error("RCUniaxialDomainBuilder requires at least two axial-force values.");
    }

    const points = nValues.map((nEd) => {
      const solved = this.ultimateSolver.solveUniaxialAtAxialLoad({
        section,
        concreteFibers,
        concreteLaw,
        steelLaw,
        nEd,
        compressedEdge,
        referencePoint,
      });

      return {
        nEd,
        MxRd: solved.MxRd,
        MyRd: solved.MyRd,
        neutralAxisDepth: solved.neutralAxisDepth,
        axialResidual: solved.axialResidual,
        converged: solved.converged,
      };
    });

    return {
      compressedEdge,
      points,
    };
  }
}
