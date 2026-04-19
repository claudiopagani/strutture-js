import { CompositeSection } from "../../../domain/composite/CompositeSection.js";
import { CompositeSectionComponent } from "../../../domain/composite/CompositeSectionComponent.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../../../domain/units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });

export class TimberConcreteCompositeBeamModel {
  constructor({
    id,
    span,
    slabSection,
    timberSection,
    timberConcreteGap = 0,
    reinforcement = null,
    reinforcementSpacing,
    timberMaterial,
    concreteMaterial,
    reinforcementMaterial,
    connector,
    connectorSpacing,
    serviceClass = 1,
    kdef = 0.6,
    kmod = 0.8,
    confidenceFactor = 1,
    gammaConcrete = 1.5,
    gammaSteel = 1.15,
    gammaTimber = 1.5,
    gammaConnector = 1.5,
    alphaCc = 0.85,
    loads = {},
    deflectionLimitDenominator = 250,
    units = null,
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A timber-concrete composite beam model id is required.");
    }

    assertExplicitUnitSystem(units, "TimberConcreteCompositeBeamModel");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    this.id = id;
    this.span = unitResolver.length(span);
    this.slabSection = slabSection;
    this.timberSection = timberSection;
    this.timberConcreteGap = unitResolver.length(timberConcreteGap);
    this.reinforcement = reinforcement;
    this.reinforcementSpacing = unitResolver.length(reinforcementSpacing);
    this.timberMaterial = timberMaterial;
    this.concreteMaterial = concreteMaterial;
    this.reinforcementMaterial = reinforcementMaterial;
    this.connector = connector;
    this.connectorSpacing = unitResolver.length(connectorSpacing);
    this.serviceClass = serviceClass;
    this.kdef = kdef;
    this.kmod = kmod;
    this.confidenceFactor = confidenceFactor;
    this.gammaConcrete = gammaConcrete;
    this.gammaSteel = gammaSteel;
    this.gammaTimber = gammaTimber;
    this.gammaConnector = gammaConnector;
    this.alphaCc = alphaCc;
    this.loads = {
      ...loads,
      ulsLineLoad: unitResolver.lineLoad(loads.ulsLineLoad),
      sleRareLineLoad: unitResolver.lineLoad(loads.sleRareLineLoad),
      sleFrequentLineLoad: unitResolver.lineLoad(loads.sleFrequentLineLoad),
      sleQuasiPermanentLineLoad: unitResolver.lineLoad(loads.sleQuasiPermanentLineLoad),
    };
    this.deflectionLimitDenominator = deflectionLimitDenominator;
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  slabCentroidY() {
    return this.timberSection.height + this.timberConcreteGap + this.slabSection.height / 2;
  }

  timberCentroidY() {
    return this.timberSection.height / 2;
  }

  createIdealCompositeSection() {
    const modularRatio =
      this.concreteMaterial.elasticModulus / this.timberMaterial.elasticModulus;

    return new CompositeSection({
      name: `${this.id}-ideal-composite`,
      components: [
        new CompositeSectionComponent({
          name: "Timber beam",
          section: this.timberSection,
          material: this.timberMaterial,
          centroidY: this.timberCentroidY(),
          modularRatio: 1,
          role: "timber",
          units: INTERNAL_UNITS,
        }),
        new CompositeSectionComponent({
          name: "Concrete slab",
          section: this.slabSection,
          material: this.concreteMaterial,
          centroidY: this.slabCentroidY(),
          modularRatio,
          role: "slab",
          units: INTERNAL_UNITS,
        }),
      ],
      units: INTERNAL_UNITS,
      metadata: {
        ...this.metadata,
        modularRatio,
      },
    });
  }
}
