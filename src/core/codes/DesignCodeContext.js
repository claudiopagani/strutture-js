export class DesignCodeContext {
  constructor({
    id,
    name,
    jurisdiction = null,
    version = null,
    referenceDocuments = [],
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A design code id is required.");
    }

    this.id = id;
    this.name = name ?? id;
    this.jurisdiction = jurisdiction;
    this.version = version;
    this.referenceDocuments = [...referenceDocuments];
    this.metadata = { ...metadata };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      jurisdiction: this.jurisdiction,
      version: this.version,
      referenceDocuments: [...this.referenceDocuments],
      metadata: { ...this.metadata },
    };
  }
}
