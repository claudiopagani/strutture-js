import { CalculationResult } from "../results/CalculationResult.js";

export class StructuralApplication {
  constructor({
    id,
    name,
    description,
    domain,
    supportedCodes = [],
    tags = [],
    metadata = {},
  }) {
    if (!id) {
      throw new Error("An application id is required.");
    }

    if (!name) {
      throw new Error("An application name is required.");
    }

    this.id = id;
    this.name = name;
    this.description = description ?? "";
    this.domain = domain ?? "general";
    this.supportedCodes = [...supportedCodes];
    this.tags = [...tags];
    this.metadata = { ...metadata };
  }

  createPlaceholderResult({
    summary,
    assumptions = [],
    warnings = [],
    outputs = {},
    metadata = {},
  } = {}) {
    return new CalculationResult({
      applicationId: this.id,
      status: "not-implemented",
      summary:
        summary ??
        `${this.name} is scaffolded and ready for domain-specific integration.`,
      assumptions,
      warnings,
      outputs,
      metadata: {
        domain: this.domain,
        ...metadata,
      },
    });
  }

  run() {
    return this.createPlaceholderResult();
  }

  getManifest() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      domain: this.domain,
      supportedCodes: [...this.supportedCodes],
      tags: [...this.tags],
      metadata: { ...this.metadata },
    };
  }
}
