const units = Object.freeze({
  length: "m",
  force: "kN",
  mass: "t",
  time: "s",
  angle: "rad",
  moment: "kN*m",
  stress: "kN/m^2",
  strain: "1",
  acceleration: "m/s^2",
  frequency: "Hz",
  lineForce: "kN/m",
  lineMoment: "kN*m/m",
});

const globalAxes = Object.freeze({
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
});
const columnAxes = Object.freeze({
  x: { x: 0, y: 0, z: 1 },
  y: { x: 1, y: 0, z: 0 },
  z: { x: 0, y: 1, z: 0 },
});
const beamXAxes = Object.freeze({
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 0, z: 1 },
  z: { x: 0, y: -1, z: 0 },
});
const beamYAxes = Object.freeze({
  x: { x: 0, y: 1, z: 0 },
  y: { x: 0, y: 0, z: 1 },
  z: { x: 1, y: 0, z: 0 },
});
const wallAxes = Object.freeze({
  x: { x: 0, y: 1, z: 0 },
  y: { x: 0, y: 0, z: 1 },
  z: { x: 1, y: 0, z: 0 },
});

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function node(id, x, y, z) {
  return { id, coordinates: { x, y, z }, metadata: {} };
}

function lineElement(id, start, end, sectionId, localAxes) {
  return {
    id,
    nodeIds: [start, end],
    sectionId,
    materialId: "MAT-CONCRETE",
    localAxes: copy(localAxes),
    offsets: {
      start: { referenceSystem: "local", vector: { x: 0, y: 0, z: 0 } },
      end: { referenceSystem: "local", vector: { x: 0, y: 0, z: 0 } },
    },
    metadata: {},
  };
}

function shellElement(id, nodeIds, sectionId, localAxes) {
  return {
    id,
    nodeIds,
    sectionId,
    materialId: "MAT-CONCRETE",
    localAxes: copy(localAxes),
    faceConvention: "positive-local-z",
    metadata: {},
  };
}

function elementLength(element, nodeIndex) {
  const start = nodeIndex.get(element.nodeIds[0]).coordinates;
  const end = nodeIndex.get(element.nodeIds[1]).coordinates;
  return Math.sqrt(
    (end.x - start.x) ** 2 +
    (end.y - start.y) ** 2 +
    (end.z - start.z) ** 2,
  );
}

function staticReference(combinationId) {
  return { procedureId: "PROC-STATIC", combinationId };
}

export function createGlobalFemBuildingFixture() {
  const nodes = [
    node("A0", 0, 0, 0), node("B0", 4, 0, 0),
    node("C0", 4, 4, 0), node("D0", 0, 4, 0),
    node("A1", 0, 0, 3), node("B1", 4, 0, 3),
    node("C1", 4, 4, 3), node("D1", 0, 4, 3),
    node("A2", 0, 0, 6), node("B2", 4, 0, 6),
    node("C2", 4, 4, 6), node("D2", 0, 4, 6),
  ];
  const columnDefinitions = [
    ["COL-A-1", "A0", "A1"], ["COL-B-1", "B0", "B1"],
    ["COL-C-1", "C0", "C1"], ["COL-D-1", "D0", "D1"],
    ["COL-A-2", "A1", "A2"], ["COL-B-2", "B1", "B2"],
    ["COL-C-2", "C1", "C2"], ["COL-D-2", "D1", "D2"],
  ];
  const beamDefinitions = [
    ["BEAM-AB-1", "A1", "B1", beamXAxes],
    ["BEAM-BC-1", "B1", "C1", beamYAxes],
    ["BEAM-DC-1", "D1", "C1", beamXAxes],
    ["BEAM-AD-1", "A1", "D1", beamYAxes],
    ["BEAM-AB-2", "A2", "B2", beamXAxes],
    ["BEAM-BC-2", "B2", "C2", beamYAxes],
    ["BEAM-DC-2", "D2", "C2", beamXAxes],
    ["BEAM-AD-2", "A2", "D2", beamYAxes],
  ];
  const lineElements = [
    ...columnDefinitions.map(([id, start, end]) =>
      lineElement(id, start, end, "SEC-COLUMN", columnAxes)),
    ...beamDefinitions.map(([id, start, end, axes]) =>
      lineElement(id, start, end, "SEC-BEAM", axes)),
  ];
  const shellElements = [
    shellElement("SLAB-S1", ["A1", "B1", "C1", "D1"], "SEC-SLAB", globalAxes),
    shellElement("SLAB-S2", ["A2", "B2", "C2", "D2"], "SEC-SLAB", globalAxes),
    shellElement("WALL-S1", ["A0", "D0", "D1", "A1"], "SEC-WALL", wallAxes),
    shellElement("WALL-S2", ["A1", "D1", "D2", "A2"], "SEC-WALL", wallAxes),
  ];

  const capabilities = {
    schema: "strutture-js/fem-capabilities",
    version: 0,
    id: "SYNTHETIC-SOLVER-CAPABILITIES",
    solver: {
      id: "synthetic-contract-fixture",
      name: "Synthetic contract fixture",
      version: "0",
    },
    analyses: {
      linearStatic: true,
      secondOrder: false,
      modal: true,
      responseSpectrum: false,
      nonlinearStatic: false,
      timeHistory: false,
    },
    elements: { line: true, shell: true, solid: false, link: false },
    results: {
      nodalDisplacements: true,
      reactions: true,
      lineElementActions: true,
      shellResultants: true,
      stresses: false,
      strains: false,
      modes: true,
      sectionCuts: true,
      storeyResults: true,
      equilibriumResiduals: true,
    },
    metadata: { purpose: "contract-coherence-only" },
  };

  const model = {
    schema: "strutture-js/global-fem-model",
    version: 0,
    id: "RC-BUILDING-2S",
    hash: "sha256:synthetic-model-v0",
    units: copy(units),
    globalCoordinateSystem: {
      id: "GLOBAL",
      type: "cartesian",
      handedness: "right",
      verticalAxis: "Z",
      rotationConvention: "right-hand-rule",
      origin: { x: 0, y: 0, z: 0 },
      axes: copy(globalAxes),
      gravityDirection: { x: 0, y: 0, z: -1 },
    },
    nodes,
    materials: [{
      id: "MAT-CONCRETE",
      type: "isotropic-linear-elastic",
      properties: { elasticModulus: 30000000, poissonRatio: 0.2, density: 2.5 },
      metadata: { fixtureValueOnly: true },
    }],
    sections: [
      {
        id: "SEC-COLUMN",
        type: "line",
        materialId: "MAT-CONCRETE",
        properties: { area: 0.16, inertiaY: 0.002133, inertiaZ: 0.002133 },
      },
      {
        id: "SEC-BEAM",
        type: "line",
        materialId: "MAT-CONCRETE",
        properties: { area: 0.15, inertiaY: 0.003125, inertiaZ: 0.001125 },
      },
      {
        id: "SEC-SLAB",
        type: "shell",
        materialId: "MAT-CONCRETE",
        properties: { thickness: 0.2 },
      },
      {
        id: "SEC-WALL",
        type: "shell",
        materialId: "MAT-CONCRETE",
        properties: { thickness: 0.25 },
      },
    ],
    lineElements,
    shellElements,
    supports: ["A0", "B0", "C0", "D0"].map((nodeId) => ({
      id: `SUP-${nodeId}`,
      nodeId,
      restraints: { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true },
    })),
    links: [],
    constraints: [],
    diaphragms: [1, 2].map((level) => ({
      id: `DIA-${level}`,
      type: "rigid",
      nodeIds: [`A${level}`, `B${level}`, `C${level}`, `D${level}`],
      plane: {
        origin: { x: 0, y: 0, z: level * 3 },
        localAxes: copy(globalAxes),
      },
    })),
    storeys: [1, 2].map((level) => ({
      id: `L${level}`,
      name: `Storey ${level}`,
      elevation: level * 3,
      levelIndex: level,
      diaphragmIds: [`DIA-${level}`],
    })),
    groups: [
      {
        id: "GROUP-COLUMNS",
        entityType: "line-elements",
        entityIds: columnDefinitions.map(([id]) => id),
      },
      {
        id: "GROUP-BEAMS",
        entityType: "line-elements",
        entityIds: beamDefinitions.map(([id]) => id),
      },
      {
        id: "GROUP-WALL",
        entityType: "shell-elements",
        entityIds: ["WALL-S1", "WALL-S2"],
      },
      {
        id: "GROUP-SLABS",
        entityType: "shell-elements",
        entityIds: ["SLAB-S1", "SLAB-S2"],
      },
    ],
    sectionCuts: [
      {
        id: "CUT-WALL-BASE",
        plane: {
          origin: { x: 0, y: 0, z: 0 },
          localAxes: copy(wallAxes),
        },
        lineElementIds: [],
        shellElementIds: ["WALL-S1"],
      },
      {
        id: "CUT-WALL-L1",
        plane: {
          origin: { x: 0, y: 0, z: 3 },
          localAxes: copy(wallAxes),
        },
        lineElementIds: [],
        shellElementIds: ["WALL-S1", "WALL-S2"],
      },
    ],
    metadata: { fixture: true, numericalValidation: false },
  };

  const analysis = {
    schema: "strutture-js/global-fem-analysis",
    version: 0,
    id: "ANALYSIS-RC-BUILDING-2S",
    hash: "sha256:synthetic-analysis-v0",
    modelId: model.id,
    modelHash: model.hash,
    units: copy(units),
    loadPatterns: [
      { id: "LP-G", nature: "gravity", metadata: { fixture: true } },
      { id: "LP-Q", nature: "imposed", metadata: { fixture: true } },
      { id: "LP-EX", nature: "lateral-X", metadata: { fixture: true } },
    ],
    loadCases: [
      { id: "G", nature: "permanent", loadPatternIds: ["LP-G"], selfWeightFactor: 1 },
      { id: "Q", nature: "imposed", loadPatternIds: ["LP-Q"], selfWeightFactor: 0 },
      { id: "EX", nature: "seismic-X", loadPatternIds: ["LP-EX"], selfWeightFactor: 0 },
    ],
    combinations: [
      {
        id: "ULS-1",
        limitState: "ultimate",
        nature: "fundamental",
        terms: [
          { loadCaseId: "G", factor: 1.3 },
          { loadCaseId: "Q", factor: 1.5 },
          { loadCaseId: "EX", factor: 1 },
        ],
      },
      {
        id: "SLS-1",
        limitState: "serviceability",
        nature: "characteristic",
        terms: [
          { loadCaseId: "G", factor: 1 },
          { loadCaseId: "Q", factor: 1 },
        ],
      },
    ],
    massSources: [{
      id: "MASS-1",
      directions: ["X", "Y"],
      contributions: [
        { loadCaseId: "G", factor: 1 },
        { loadCaseId: "Q", factor: 0.3 },
      ],
    }],
    spectra: [],
    timeSeries: [],
    procedures: [
      {
        id: "PROC-STATIC",
        type: "linear-static",
        loadCaseIds: ["G", "Q", "EX"],
        combinationIds: ["ULS-1", "SLS-1"],
        secondOrder: { enabled: false, method: null },
        stiffnessAssumptions: [{
          id: "STIFF-RC-FIXTURE",
          scope: "all-elements",
          property: "effective-stiffness",
          factor: 0.7,
          description: "Synthetic fixture assumption; not a design recommendation.",
        }],
        accidentalEccentricities: [
          { id: "ECC-X-L1", direction: "X", offset: 0.2, storeyId: "L1" },
          { id: "ECC-X-L2", direction: "X", offset: 0.2, storeyId: "L2" },
        ],
        requestedOutputs: [
          "nodalDisplacements",
          "reactions",
          "lineElementActions",
          "shellResultants",
          "sectionCuts",
          "storeyResults",
          "equilibriumResiduals",
        ],
      },
      {
        id: "PROC-MODAL",
        type: "modal",
        massSourceId: "MASS-1",
        requestedModes: 2,
        directions: ["X", "Y"],
        requestedOutputs: ["modes"],
      },
    ],
    metadata: { fixture: true },
  };

  const members = lineElements.map((element) => ({
    id: `MEMBER-${element.id}`,
    role: element.id.startsWith("COL-") ? "column" : "beam",
    lineElementIds: [element.id],
    metadata: {},
  }));
  const mapping = {
    schema: "strutture-js/fem-entity-mapping",
    version: 0,
    id: "MAPPING-RC-BUILDING-2S",
    modelId: model.id,
    modelHash: model.hash,
    members,
    walls: [{
      id: "WALL-W1",
      shellElementIds: ["WALL-S1", "WALL-S2"],
      sectionCutIds: ["CUT-WALL-BASE", "CUT-WALL-L1"],
      storeyIds: ["L1", "L2"],
      metadata: {},
    }],
    slabs: [1, 2].map((level) => ({
      id: `SLAB-${level}`,
      shellElementIds: [`SLAB-S${level}`],
      storeyId: `L${level}`,
      metadata: {},
    })),
    storeys: [1, 2].map((level) => ({
      id: `STOREY-MAP-${level}`,
      storeyId: `L${level}`,
      nodeIds: [`A${level}`, `B${level}`, `C${level}`, `D${level}`],
      diaphragmIds: [`DIA-${level}`],
      lineElementIds: lineElements
        .filter((element) => element.id.endsWith(`-${level}`))
        .map((element) => element.id),
      shellElementIds: [`SLAB-S${level}`, `WALL-S${level}`],
    })),
    joints: [
      {
        id: "JOINT-A1",
        nodeId: "A1",
        lineElementEnds: [
          { lineElementId: "COL-A-1", end: "end" },
          { lineElementId: "COL-A-2", end: "start" },
          { lineElementId: "BEAM-AB-1", end: "start" },
          { lineElementId: "BEAM-AD-1", end: "start" },
        ],
      },
      {
        id: "JOINT-B1",
        nodeId: "B1",
        lineElementEnds: [
          { lineElementId: "COL-B-1", end: "end" },
          { lineElementId: "COL-B-2", end: "start" },
          { lineElementId: "BEAM-AB-1", end: "end" },
          { lineElementId: "BEAM-BC-1", end: "start" },
        ],
      },
    ],
    metadata: {
      providerEntityIds: { sourceModel: "synthetic-fixture-only" },
    },
  };

  const nodeIndex = new Map(nodes.map((item) => [item.id, item]));
  const combinationScales = new Map([["ULS-1", 1], ["SLS-1", 0.6]]);
  const nodalDisplacements = [...combinationScales].flatMap(([combinationId, scale]) =>
    nodes.map((item) => ({
      ...staticReference(combinationId),
      nodeId: item.id,
      coordinateSystem: "global",
      translations: {
        x: scale * item.coordinates.z * 0.0005,
        y: scale * item.coordinates.z * 0.0002,
        z: -scale * item.coordinates.z * 0.00005,
      },
      rotations: {
        x: scale * item.coordinates.z * 0.00001,
        y: scale * item.coordinates.z * 0.00002,
        z: scale * item.coordinates.z * 0.000005,
      },
    })));
  const reactions = [...combinationScales].flatMap(([combinationId, scale]) =>
    ["A0", "B0", "C0", "D0"].map((nodeId) => ({
      ...staticReference(combinationId),
      nodeId,
      coordinateSystem: "global",
      forces: { x: -25 * scale, y: -8 * scale, z: 250 * scale },
      moments: { x: 12 * scale, y: 35 * scale, z: 3 * scale },
    })));
  const lineElementActions = [...combinationScales].flatMap(([combinationId, scale]) =>
    lineElements.map((element, elementIndex) => {
      const length = elementLength(element, nodeIndex);
      const actions = {
        N: -120 * scale - elementIndex,
        Vy: 15 * scale,
        Vz: 8 * scale,
        T: 2 * scale,
        My: 25 * scale,
        Mz: 40 * scale,
      };
      return {
        ...staticReference(combinationId),
        lineElementId: element.id,
        coordinateSystem: "element-local",
        stations: [
          { xi: 0, position: 0, side: "single", actions },
          {
            xi: 1,
            position: length,
            side: "single",
            actions: { ...actions, Vy: -actions.Vy, Vz: -actions.Vz },
          },
        ],
      };
    }));
  const shellResultants = [...combinationScales].flatMap(([combinationId, scale]) =>
    shellElements.map((element) => {
      const coordinates = element.nodeIds.map((nodeId) => nodeIndex.get(nodeId).coordinates);
      const position = coordinates.reduce(
        (sum, coordinate) => ({
          x: sum.x + coordinate.x / coordinates.length,
          y: sum.y + coordinate.y / coordinates.length,
          z: sum.z + coordinate.z / coordinates.length,
        }),
        { x: 0, y: 0, z: 0 },
      );
      return {
        ...staticReference(combinationId),
        shellElementId: element.id,
        coordinateSystem: "element-local",
        face: "mid-surface",
        location: { kind: "centroid", position },
        components: {
          Nx: 120 * scale,
          Ny: 80 * scale,
          Nxy: 10 * scale,
          Mx: 22 * scale,
          My: 18 * scale,
          Mxy: 4 * scale,
          Vx: 12 * scale,
          Vy: 9 * scale,
        },
      };
    }));
  const sectionCuts = [...combinationScales].flatMap(([combinationId, scale]) =>
    model.sectionCuts.map((sectionCut) => ({
      ...staticReference(combinationId),
      sectionCutId: sectionCut.id,
      coordinateSystem: "section-cut-local",
      position: copy(sectionCut.plane.origin),
      resultants: {
        Fx: 180 * scale,
        Fy: 35 * scale,
        Fz: 620 * scale,
        Mx: 90 * scale,
        My: 140 * scale,
        Mz: 25 * scale,
      },
    })));
  const modeDefinitions = [
    { modeNumber: 1, period: 0.6, direction: "X", massX: 120, massY: 12, ratioX: 0.62, ratioY: 0.06 },
    { modeNumber: 2, period: 0.4, direction: "Y", massX: 10, massY: 115, ratioX: 0.05, ratioY: 0.59 },
  ];
  const modes = modeDefinitions.map((definition) => {
    const frequency = 1 / definition.period;
    return {
      procedureId: "PROC-MODAL",
      modeNumber: definition.modeNumber,
      period: definition.period,
      frequency,
      eigenvalue: (2 * Math.PI * frequency) ** 2,
      modalShape: nodes.map((item) => ({
        nodeId: item.id,
        translations: {
          x: definition.direction === "X" ? item.coordinates.z / 6 : 0.05 * item.coordinates.z / 6,
          y: definition.direction === "Y" ? item.coordinates.z / 6 : 0.05 * item.coordinates.z / 6,
          z: 0,
        },
        rotations: { x: 0, y: 0, z: item.coordinates.z * 0.001 },
      })),
      participationFactors: {
        X: definition.direction === "X" ? 1.2 : 0.15,
        Y: definition.direction === "Y" ? 1.15 : 0.12,
      },
      participatingMasses: { X: definition.massX, Y: definition.massY },
      participatingMassRatios: { X: definition.ratioX, Y: definition.ratioY },
    };
  });
  const storeyResults = [...combinationScales].flatMap(([combinationId, scale]) =>
    [1, 2].map((level) => ({
      ...staticReference(combinationId),
      storeyId: `L${level}`,
      diaphragmId: `DIA-${level}`,
      centerOfMass: { x: 2, y: 2, z: level * 3 },
      centerOfRigidity: { x: 1.8, y: 2.1, z: level * 3 },
      translations: { x: level * 0.003 * scale, y: level * 0.0015 * scale, z: 0 },
      rotations: { x: 0, y: 0, z: level * 0.0002 * scale },
      driftRatios: { X: 0.001 * scale, Y: 0.0005 * scale },
      resultants: {
        Fx: 100 * scale,
        Fy: 40 * scale,
        Fz: 500 * scale,
        Mx: 80 * scale,
        My: 130 * scale,
        Mz: 25 * scale,
      },
      torsionalMetrics: { edgeDisplacementRatio: 1.12, eccentricityRatio: 0.05 },
    })));
  const equilibriumResiduals = [...combinationScales].map(([combinationId]) => ({
    ...staticReference(combinationId),
    forces: { x: 0.000001, y: -0.000001, z: 0.000002 },
    moments: { x: 0.000003, y: -0.000002, z: 0.000001 },
    normalizedResidual: 1e-9,
  }));

  const result = {
    schema: "strutture-js/global-fem-result",
    version: 0,
    id: "RESULT-RC-BUILDING-2S",
    modelId: model.id,
    modelHash: model.hash,
    analysisId: analysis.id,
    analysisHash: analysis.hash,
    capabilitiesId: capabilities.id,
    status: "completed",
    units: copy(units),
    signConventions: {
      translations: "positive-along-referenced-coordinate-axes",
      rotations: "right-hand-rule-about-positive-axis",
      reactions: "support-action-on-structure",
      lineActions: "cut-action-on-positive-local-face",
      shellResultants: "tensor-components-in-element-local-axes-on-declared-face",
      sectionCuts: "resultant-on-positive-section-cut-face",
    },
    provenance: {
      solver: copy(capabilities.solver),
      model: { id: model.id, hash: model.hash },
      analysis: { id: analysis.id, hash: analysis.hash },
    },
    convergence: [
      {
        procedureId: "PROC-STATIC",
        converged: true,
        iterations: 1,
        residualNorm: 1e-9,
        tolerance: 1e-6,
        diagnostics: ["Synthetic equilibrium fixture; not a solver benchmark."],
      },
      {
        procedureId: "PROC-MODAL",
        converged: true,
        iterations: 12,
        residualNorm: 1e-10,
        tolerance: 1e-8,
        diagnostics: ["Synthetic modal fixture; not a solver benchmark."],
      },
    ],
    results: {
      nodalDisplacements,
      reactions,
      lineElementActions,
      shellResultants,
      stresses: [],
      strains: [],
      modes,
      sectionCuts,
      storeyResults,
      equilibriumResiduals,
      envelopes: [{
        id: "ENV-COL-A-N",
        quantity: "N",
        target: { entityType: "line-element", entityId: "COL-A-1" },
        governing: [
          { combinationId: "ULS-1", value: -120 },
          { combinationId: "SLS-1", value: -72 },
        ],
      }],
    },
    qualityIndicators: {
      maximumNormalizedEquilibriumResidual: 1e-9,
      missingRequestedResultCount: 0,
    },
    metadata: { fixture: true, numericalValidation: false },
  };

  return { capabilities, model, analysis, mapping, result };
}
