import { AreaLoad } from "../loads/AreaLoad.js";

export class FloorSlab {
  constructor({
    description,
    loads = [],
  }) {
    if (typeof description !== "string" || description.trim().length === 0) {
      throw new Error("A floor slab description is required.");
    }

    if (!Array.isArray(loads) || !loads.every((load) => load instanceof AreaLoad)) {
      throw new Error("FloorSlab loads must be an array of AreaLoad instances.");
    }

    this.description = description;
    this.loads = [...loads];
  }

  withDescription(description) {
    return new FloorSlab({
      description,
      loads: this.loads,
    });
  }

  addLoad(load) {
    if (!(load instanceof AreaLoad)) {
      throw new Error("Only AreaLoad instances can be added to a floor slab.");
    }

    return new FloorSlab({
      description: this.description,
      loads: [...this.loads, load],
    });
  }

  removeLoad(loadId) {
    if (!Number.isInteger(loadId)) {
      throw new Error("The slab load id to remove must be an integer.");
    }

    return new FloorSlab({
      description: this.description,
      loads: this.loads.filter((load) => load.id !== loadId),
    });
  }

  getLoadTotal(loadGroup, effect) {
    return this.loads
      .filter((load) => load.loadGroup === loadGroup && load.effect === effect)
      .reduce((sum, load) => sum + load.value, 0);
  }

  get g1UnfavourableTotal() {
    return this.getLoadTotal("G1", "unfavourable");
  }

  get g1FavourableTotal() {
    return this.getLoadTotal("G1", "favourable");
  }

  get g2UnfavourableTotal() {
    return this.getLoadTotal("G2", "unfavourable");
  }

  get g2FavourableTotal() {
    return this.getLoadTotal("G2", "favourable");
  }

  get variableLoads() {
    return this.loads.filter((load) => load.loadGroup === "Qk");
  }

  get variableTotal() {
    return this.variableLoads.reduce((sum, load) => sum + load.value, 0);
  }

  get servicePermanentTotal() {
    return this.g1UnfavourableTotal
      + this.g1FavourableTotal
      + this.g2UnfavourableTotal
      + this.g2FavourableTotal;
  }
}
