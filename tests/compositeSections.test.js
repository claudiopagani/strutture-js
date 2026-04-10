import test from "node:test";
import assert from "node:assert/strict";

import {
  CompositeSection,
  CompositeSectionComponent,
  ReinforcedConcreteSection,
  ReinforcementBar,
  RectangularSection,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("composite section computes transformed area and inertia from components", () => {
  const timber = new RectangularSection({ width: 200, height: 300, units });
  const slab = new RectangularSection({ width: 1000, height: 60, units });

  const composite = new CompositeSection({
    name: "timber-concrete-demo",
    units,
    components: [
      new CompositeSectionComponent({
        name: "Timber",
        section: timber,
        centroidY: 150,
        modularRatio: 1,
        role: "timber",
        units,
      }),
      new CompositeSectionComponent({
        name: "Slab",
        section: slab,
        centroidY: 430,
        modularRatio: 3,
        role: "slab",
        units,
      }),
    ],
  });

  approx(composite.area, 240000);
  assert.ok(composite.inertiaY > timber.inertiaY);
  assert.equal(composite.getComponent("slab").name, "Slab");
});

test("reinforced concrete section aggregates concrete and positioned bars", () => {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC beam section",
    concreteSection: new RectangularSection({ width: 300, height: 500, units }),
    reinforcementBars: [
      new ReinforcementBar({
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 50,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 450,
        z: 240,
        units,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  approx(section.area, 150000);
  assert.equal(section.reinforcementBars.length, 2);
  assert.ok(section.totalReinforcementArea() > 0);
  assert.ok(section.transformedSection.inertiaY > 0);
});
