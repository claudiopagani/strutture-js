import {
  MasonryPierApplication,
  NTC2018MasonryPierModel,
} from "strutture-js/applications/masonry-piers";

const model = new NTC2018MasonryPierModel({
  id: "ntc2018-pier-example",
  units: { force: "kN", length: "m" },
  geometry: { height: 3, length: 1.5, thickness: 0.3 },
  material: {
    units: { force: "kN", length: "m" },
    fm: 4000,
    tau0: 80,
    fv0: 120,
    E: 1.8e6,
    G: 0.6e6,
  },
  actions: {
    axialForce: 300,
    axialForceConvention: "compression-positive",
    lateralDisplacement: 0.02,
  },
  design: { confidenceFactor: 1.2 },
  normative: {
    scope: "existing",
    masonryTexture: "irregular",
    blockCompressiveStrength: 12000,
    boundaryCondition: "cantilever",
  },
});

const result = new MasonryPierApplication().run({
  analysisType: "ntc2018-bilinear",
  model,
});

console.log(JSON.stringify(result.toJSON(), null, 2));

if (result.status !== "ok") {
  process.exitCode = 1;
}
