export class CrackedSectionBeamModel {
  constructor({
    id,
    span = null,
    section = {},
    reinforcement = {},
    material = {},
    loading = {},
    analysisResult = null,
    concreteMaterial = material.concreteMaterial ??
      material.concrete ??
      section?.concreteMaterial ??
      null,
    reinforcementMaterial = material.reinforcementMaterial ??
      material.reinforcement ??
      section?.reinforcementMaterial ??
      null,
    serviceability = {},
    mesh = { targetFiberCount: 100 },
    solver = { tolerance: 1e-2, maxIterations: 50 },
    beamModel = null,
    beamInput = null,
    hyperstatic = null,
    performanceProfile = null,
    sampling = {},
    output = {},
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A cracked section beam model id is required.");
    }

    this.id = id;
    this.span = span;
    this.section = section;
    this.reinforcement = { ...reinforcement };
    this.material = { ...material };
    this.loading = { ...loading };
    this.analysisResult = analysisResult;
    this.concreteMaterial = concreteMaterial;
    this.reinforcementMaterial = reinforcementMaterial;
    this.serviceability = { ...serviceability };
    this.mesh = { ...mesh };
    this.solver = { ...solver };
    this.beamModel = beamModel ?? beamInput;
    this.beamInput = beamInput ?? beamModel;
    this.hyperstatic = hyperstatic;
    this.performanceProfile = performanceProfile;
    this.sampling = { ...sampling };
    this.output = { ...output };
    this.metadata = { ...metadata };
  }
}
