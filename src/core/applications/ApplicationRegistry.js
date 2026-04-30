export class ApplicationRegistry {
  constructor(applications = []) {
    this.applications = new Map();

    for (const application of applications) {
      this.register(application);
    }
  }

  register(application) {
    if (!application?.id) {
      throw new Error("Cannot register an application without an id.");
    }

    if (this.applications.has(application.id)) {
      throw new Error(`Application ${application.id} is already registered.`);
    }

    this.applications.set(application.id, application);
    return this;
  }

  has(applicationId) {
    return this.applications.has(applicationId);
  }

  get(applicationId) {
    return this.applications.get(applicationId) ?? null;
  }

  list() {
    return [...this.applications.values()];
  }

  listManifests() {
    return this.list().map((application) => application.getManifest());
  }

  run(applicationId, input) {
    const application = this.get(applicationId);

    if (!application) {
      throw new Error(`Unknown application: ${applicationId}`);
    }

    return application.run(input);
  }
}
