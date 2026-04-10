import { assertExplicitUnitSystem, createUnitResolver } from "../../../domain/units/UnitSystem.js";

export class TimberXlamCompositeBeamModel {
  constructor({
    id,
    span,
    xlamSection,
    timberSection,
    xlamMaterial,
    timberMaterial,
    connector,
    kmod = 0.9,
    gammaXlam = 1.45,
    gammaTimber = 1.45,
    gammaConnection = 1.5,
    serviceClass = 2,
    psi2 = 0,
    loads = {},
    deflectionLimitShortDenominator = 300,
    deflectionLimitLongDenominator = 200,
    units = null,
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A timber-xlam composite beam model id is required.");
    }

    assertExplicitUnitSystem(units, "TimberXlamCompositeBeamModel");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    this.id = id;
    this.span = unitResolver.length(span);
    this.xlamSection = xlamSection;
    this.timberSection = timberSection;
    this.xlamMaterial = xlamMaterial;
    this.timberMaterial = timberMaterial;
    this.connector = connector;
    this.kmod = kmod;
    this.gammaXlam = gammaXlam;
    this.gammaTimber = gammaTimber;
    this.gammaConnection = gammaConnection;
    this.serviceClass = serviceClass;
    this.psi2 = psi2;
    this.loads = {
      ...loads,
      ulsLineLoad: unitResolver.lineLoad(loads.ulsLineLoad),
      slePermanentLineLoad: unitResolver.lineLoad(loads.slePermanentLineLoad),
      sleVariableLineLoad: unitResolver.lineLoad(loads.sleVariableLineLoad),
    };
    this.deflectionLimitShortDenominator = deflectionLimitShortDenominator;
    this.deflectionLimitLongDenominator = deflectionLimitLongDenominator;
    this.metadata = {
      ...metadata,
      unitSystem: units ? unitResolver.unitSystem : metadata.unitSystem,
    };
  }

  kdef() {
    if (this.serviceClass === 1) {
      return 0.6;
    }

    if (this.serviceClass === 2) {
      return 0.8;
    }

    return 2;
  }

  relativeCentroidDistance() {
    const layers = this.xlamSection.layerThicknesses;
    const [t1 = 0, t2 = 0, t3 = 0, t4 = 0, t5 = 0] = layers;
    void t1;

    return this.timberSection.height / 2 + t5 + t4 + t3 / 2;
  }

  xlamBendingLeverArm() {
    const [, t2 = 0, t3 = 0, t4 = 0] = this.xlamSection.layerThicknesses;

    return (t2 + t3 + t4) / 2;
  }

  workbookEquivalentXlamInertia() {
    const [, t2 = 0, t3 = 0, t4 = 0] = this.xlamSection.layerThicknesses;
    const b = this.xlamSection.effectiveWidth;

    return (
      b *
      (
        t2 ** 3 / 12 +
        t4 ** 3 / 12 +
        t2 * (((t3 + t2) / 2) ** 2) +
        t4 * (((t3 + t4) / 2) ** 2)
      )
    );
  }
}
