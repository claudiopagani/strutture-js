import {
  APPLICATION_CATALOG,
  createDefaultApplicationRegistry,
} from "../src/index.js";

const registry = createDefaultApplicationRegistry();

console.log("Catalog applications:", APPLICATION_CATALOG.length);
console.log(
  registry.listManifests().map((application) => ({
    id: application.id,
    domain: application.domain,
    name: application.name,
  })),
);

const sampleResult = registry.run("steel-frames", {
  model: { id: "frame-demo" },
  code: "NTC2018",
  loadCombinations: [{ id: "ULS1" }],
});

console.log(sampleResult.toJSON());
