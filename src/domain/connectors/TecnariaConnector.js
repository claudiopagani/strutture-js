import { ShearConnector } from "./ShearConnector.js";
import { getTecnariaConnectorData, TECNARIA_CONNECTOR_CATALOG } from "./tecnariaConnectorCatalog.js";
import { assertExplicitUnitSystem } from "../units/UnitSystem.js";

export class TecnariaConnector extends ShearConnector {
  constructor({
    type,
    boardThickness,
    id = null,
    name = null,
    units = null,
    metadata = {},
  }) {
    assertExplicitUnitSystem(units, "TecnariaConnector");
    const family = TECNARIA_CONNECTOR_CATALOG[type];
    const data = getTecnariaConnectorData(type, boardThickness);
    const catalogUnits = { force: "kN", length: "mm" };

    if (!family || !data) {
      throw new Error(
        `Unsupported Tecnaria connector configuration: ${type} / ${boardThickness} cm.`,
      );
    }

    super({
      id,
      name: name ?? `Tecnaria ${type} ${boardThickness} cm`,
      family: type,
      producer: family.producer,
      kser: data.kser,
      ku: data.ku,
      fvrk: data.fvrk,
      units: catalogUnits,
      metadata: {
        ...metadata,
        boardThickness,
        source: "tecnaria_catalog",
      },
    });

    this.type = type;
    this.boardThickness = Number(boardThickness);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      type: this.type,
      boardThickness: this.boardThickness,
    };
  }
}
