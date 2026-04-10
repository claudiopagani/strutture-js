export class CrackedSectionBeamModel {
  constructor({
    id,
    span = null,
    section = {},
    reinforcement = {},
    material = {},
    loading = {},
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A cracked section beam model id is required.");
    }

    this.id = id;
    this.span = span;
    this.section = { ...section };
    this.reinforcement = { ...reinforcement };
    this.material = { ...material };
    this.loading = { ...loading };
    this.metadata = { ...metadata };
  }
}
