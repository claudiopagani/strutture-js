import {
  PunchingActionState,
  PunchingConnectionModel,
  PunchingControlPerimeter,
} from "../../domain/slabs/punching/index.js";
import { getRcPunchingDesignCodeManifest } from "./punchingDesignCodes.js";

export const PUNCHING_VERIFICATION_REQUEST_SCHEMA_VERSION =
  "rc-punching-verification-request/v0";

function normalizeCodeSelection(code) {
  const selection = typeof code === "string" ? { id: code } : code;

  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    throw new Error("PunchingVerificationRequest requires code as an id or selection object.");
  }

  if (!selection.id) {
    throw new Error("Punching verification code.id is required.");
  }

  const manifest = getRcPunchingDesignCodeManifest(selection.id);

  if (
    selection.nationalAnnex != null
    && (typeof selection.nationalAnnex !== "object"
      || Array.isArray(selection.nationalAnnex))
  ) {
    throw new Error("Punching verification code.nationalAnnex must be an object or null.");
  }

  if (
    selection.parameters != null
    && (typeof selection.parameters !== "object" || Array.isArray(selection.parameters))
  ) {
    throw new Error("Punching verification code.parameters must be an object.");
  }

  return {
    ...manifest,
    nationalAnnex: selection.nationalAnnex == null
      ? null
      : structuredClone(selection.nationalAnnex),
    parameterProfile: selection.parameterProfile ?? null,
    parameters: structuredClone(selection.parameters ?? {}),
  };
}

function normalizeActionState(input, connection) {
  const state = input instanceof PunchingActionState
    ? input
    : new PunchingActionState(input);

  if (state.connectionId !== connection.id) {
    throw new Error(
      `Punching action state ${state.id} targets connection ${state.connectionId}, expected ${connection.id}.`,
    );
  }

  if (state.localFrameId != null && state.localFrameId !== connection.localFrame.id) {
    throw new Error(
      `Punching action state ${state.id} uses local frame ${state.localFrameId}, expected ${connection.localFrame.id}.`,
    );
  }

  return state;
}

function normalizePerimeterDefinition(input, connection, code) {
  const source = input ?? { method: "generated" };

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Punching perimeterDefinition must be an object.");
  }

  if (source.method === "generated") {
    return { method: "generated", perimeters: [] };
  }

  if (source.method !== "explicit") {
    throw new Error("Punching perimeterDefinition.method must be generated or explicit.");
  }

  if (!Array.isArray(source.perimeters) || source.perimeters.length === 0) {
    throw new Error("Explicit punching perimeterDefinition requires perimeters.");
  }

  const perimeters = source.perimeters.map((perimeter) =>
    perimeter instanceof PunchingControlPerimeter
      ? perimeter
      : new PunchingControlPerimeter(perimeter));

  for (const perimeter of perimeters) {
    if (perimeter.codeId !== code.id) {
      throw new Error(`Explicit perimeter ${perimeter.id} targets ${perimeter.codeId}, expected ${code.id}.`);
    }

    if (perimeter.position !== connection.support.position) {
      throw new Error(`Explicit perimeter ${perimeter.id} position does not match the connection support position.`);
    }
  }

  return { method: "explicit", perimeters };
}

export class PunchingVerificationRequest {
  constructor({
    id,
    connection,
    actionStates = [],
    code = null,
    perimeterDefinition = { method: "generated" },
    metadata = {},
  } = {}) {
    if (!id) {
      throw new Error("A punching verification request id is required.");
    }

    const normalizedConnection = connection instanceof PunchingConnectionModel
      ? connection
      : new PunchingConnectionModel(connection);

    if (!Array.isArray(actionStates) || actionStates.length === 0) {
      throw new Error("PunchingVerificationRequest requires at least one action state.");
    }

    const normalizedActionStates = actionStates.map((state) =>
      normalizeActionState(state, normalizedConnection));
    const normalizedCode = normalizeCodeSelection(code);

    this.id = id;
    this.schemaVersion = PUNCHING_VERIFICATION_REQUEST_SCHEMA_VERSION;
    this.connection = normalizedConnection;
    this.actionStates = normalizedActionStates;
    this.code = normalizedCode;
    this.perimeterDefinition = normalizePerimeterDefinition(
      perimeterDefinition,
      normalizedConnection,
      normalizedCode,
    );
    this.metadata = { ...metadata };
  }

  toJSON() {
    return {
      id: this.id,
      schemaVersion: this.schemaVersion,
      connection: this.connection.toJSON(),
      actionStates: this.actionStates.map((state) => state.toJSON()),
      code: structuredClone(this.code),
      perimeterDefinition: {
        method: this.perimeterDefinition.method,
        perimeters: this.perimeterDefinition.perimeters.map((perimeter) =>
          perimeter.toJSON()),
      },
      metadata: { ...this.metadata },
    };
  }
}
