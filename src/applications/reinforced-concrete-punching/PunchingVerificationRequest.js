import {
  PunchingActionState,
  PunchingConnectionModel,
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

export class PunchingVerificationRequest {
  constructor({
    id,
    connection,
    actionStates = [],
    code = null,
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

    this.id = id;
    this.schemaVersion = PUNCHING_VERIFICATION_REQUEST_SCHEMA_VERSION;
    this.connection = normalizedConnection;
    this.actionStates = actionStates.map((state) =>
      normalizeActionState(state, normalizedConnection));
    this.code = normalizeCodeSelection(code);
    this.metadata = { ...metadata };
  }

  toJSON() {
    return {
      id: this.id,
      schemaVersion: this.schemaVersion,
      connection: this.connection.toJSON(),
      actionStates: this.actionStates.map((state) => state.toJSON()),
      code: structuredClone(this.code),
      metadata: { ...this.metadata },
    };
  }
}
