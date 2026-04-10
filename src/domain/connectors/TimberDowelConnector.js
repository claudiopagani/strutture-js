import { ShearConnector } from "./ShearConnector.js";
import { createUnitResolver } from "../units/UnitSystem.js";

export class TimberDowelConnector extends ShearConnector {
  constructor({
    id = null,
    name = "Timber dowel connector",
    diameter,
    timberDensityMean,
    timberDensityCharacteristicSection1,
    timberDensityCharacteristicSection2,
    ultimateTensileStrength,
    penetrationLength,
    spacing,
    gammaConnection = 1.5,
    kmod = 0.9,
    units = null,
    metadata = {},
  }) {
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });
    const resolvedDiameter = unitResolver.length(diameter);
    const resolvedUltimateTensileStrength = unitResolver.stress(ultimateTensileStrength);
    const resolvedPenetrationLength = unitResolver.length(penetrationLength);
    const resolvedSpacing = unitResolver.length(spacing);
    const kser = (timberDensityMean ** 1.5 * resolvedDiameter) / 20;
    const ku = (2 / 3) * kser;

    super({
      id,
      name,
      family: "timber-dowel",
      producer: null,
      kser,
      ku,
      fvrk: 1,
      units: { force: "N", length: "mm" },
      metadata,
    });

    this.diameter = resolvedDiameter;
    this.timberDensityMean = timberDensityMean;
    this.timberDensityCharacteristicSection1 = timberDensityCharacteristicSection1;
    this.timberDensityCharacteristicSection2 = timberDensityCharacteristicSection2;
    this.ultimateTensileStrength = resolvedUltimateTensileStrength;
    this.penetrationLength = resolvedPenetrationLength;
    this.spacing = resolvedSpacing;
    this.gammaConnection = gammaConnection;
    this.kmod = kmod;
  }

  embedmentStrength(rhoK) {
    return 0.082 * (1 - 0.01 * this.diameter) * rhoK;
  }

  yieldMoment() {
    return 0.1 * this.ultimateTensileStrength * this.diameter ** 3;
  }

  timberTimberCharacteristicResistance(section1Thickness) {
    const fhk1 = this.embedmentStrength(this.timberDensityCharacteristicSection1);
    const fhk2 = this.embedmentStrength(this.timberDensityCharacteristicSection2);
    const beta = fhk2 / fhk1;
    const my = this.yieldMoment();
    const t1 = section1Thickness;
    const t2 = this.penetrationLength;
    const d = this.diameter;

    const rk1a = (fhk1 * t1 * d) / 1000;
    const rk1b = (fhk2 * t2 * d) / 1000;
    const rk1c =
      (fhk1 *
        d *
        t1 /
        (1 + beta) *
        (Math.sqrt(
          beta +
            2 * beta ** 2 * (1 + t2 / t1 + (t2 / t1) ** 2) +
            beta ** 3 * (t2 / t1) ** 2,
        ) -
          beta * (1 + t2 / t1))) /
      1000;
    const rk2a =
      (1.1 *
        fhk1 *
        d *
        t1 /
        (2 + beta) *
        (Math.sqrt(
          2 * beta * (1 + beta) +
            (4 * beta * (2 + beta) * my) / (fhk1 * d * t1 ** 2),
        ) -
          beta)) /
      1000;
    const rk2b =
      (1.1 *
        fhk1 *
        d *
        t2 /
        (1 + 2 * beta) *
        (Math.sqrt(
          2 * beta ** 2 * (1 + beta) +
            (4 * beta * (2 + beta) * my) / (fhk1 * d * t2 ** 2),
        ) -
          beta)) /
      1000;
    const rk3 =
      (1.15 *
        Math.sqrt((2 * beta) / (1 + beta)) *
        Math.sqrt(2 * my * fhk1 * d)) /
      1000;

    const modes = { rk1a, rk1b, rk1c, rk2a, rk2b, rk3, fhk1, fhk2, beta, my };
    const governing = Math.min(rk1a, rk1b, rk1c, rk2a, rk2b, rk3);

    return {
      ...modes,
      governing,
      designResistance: (this.kmod * governing) / this.gammaConnection,
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      diameter: this.diameter,
      timberDensityMean: this.timberDensityMean,
      timberDensityCharacteristicSection1: this.timberDensityCharacteristicSection1,
      timberDensityCharacteristicSection2: this.timberDensityCharacteristicSection2,
      ultimateTensileStrength: this.ultimateTensileStrength,
      penetrationLength: this.penetrationLength,
      spacing: this.spacing,
      gammaConnection: this.gammaConnection,
      kmod: this.kmod,
    };
  }
}
