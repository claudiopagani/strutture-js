import { assertExplicitUnitSystem, createUnitResolver } from "../../../domain/units/UnitSystem.js";

export class XlamOutOfPlanePanelModel {
  constructor({
    id,
    span,
    section,
    material,
    serviceClass = 1,
    kmod = 0.8,
    gammaM = 1.45,
    systemBoardCount = 1,
    loads = {},
    deflectionLimitDenominator = 300,
    longTermDeflectionLimitDenominator = 200,
    units = null,
    metadata = {},
  }) {
    if (!id) {
      throw new Error("An XLAM out-of-plane panel model id is required.");
    }

    assertExplicitUnitSystem(units, "XlamOutOfPlanePanelModel");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    this.id = id;
    this.span = unitResolver.length(span);
    this.section = section;
    this.material = material;
    this.serviceClass = serviceClass;
    this.kmod = kmod;
    this.gammaM = gammaM;
    this.systemBoardCount = systemBoardCount;
    this.loads = {
      ...loads,
      ulsLineLoad: unitResolver.lineLoad(loads.ulsLineLoad),
      sleLineLoad: unitResolver.lineLoad(loads.sleLineLoad),
      slePermanentLineLoad: unitResolver.lineLoad(loads.slePermanentLineLoad),
      sleVariableLineLoad: unitResolver.lineLoad(loads.sleVariableLineLoad),
    };
    this.deflectionLimitDenominator = deflectionLimitDenominator;
    this.longTermDeflectionLimitDenominator = longTermDeflectionLimitDenominator;
    this.metadata = {
      ...metadata,
      unitSystem: units ? unitResolver.unitSystem : metadata.unitSystem,
    };
  }

  kdef() {
    if (this.serviceClass === 1) {
      return 0.85;
    }

    if (this.serviceClass === 2) {
      return 1.1;
    }

    return 2;
  }
}
