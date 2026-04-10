import { AreaLoad } from "../loads/AreaLoad.js";

export class SlabLoad extends AreaLoad {
  static nextId = 1;

  constructor({
    description,
    loadGroup,
    effect = "unfavourable",
    units = null,
  }) {
    if (typeof description !== "string" || description.trim().length === 0) {
      throw new Error("A slab load description is required.");
    }

    if (!["G1", "G2", "Qk"].includes(loadGroup)) {
      throw new Error(`Unsupported slab load group: ${loadGroup}.`);
    }

    if (!["favourable", "unfavourable"].includes(effect)) {
      throw new Error(`Unsupported slab load effect: ${effect}.`);
    }

    const normalizedEffect = loadGroup === "Qk" ? "unfavourable" : effect;

    super({
      id: `SLAB-${SlabLoad.nextId++}`,
      name: description,
      type: "slab",
      intensity: 0,
      units,
      metadata: {
        loadGroup,
        effect: normalizedEffect,
      },
    });

    this.description = description;
    this.loadGroup = loadGroup;
    this.effect = normalizedEffect;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      description: this.description,
      loadGroup: this.loadGroup,
      effect: this.effect,
      value: this.value,
    };
  }
}
