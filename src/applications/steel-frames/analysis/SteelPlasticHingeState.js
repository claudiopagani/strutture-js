function normalizeSign(value) {
  if (value == null) {
    return null;
  }

  if (value === "positive" || value === 1 || value === "+") {
    return "positive";
  }

  if (value === "negative" || value === -1 || value === "-") {
    return "negative";
  }

  throw new Error(`Unsupported plastic hinge sign: ${value}.`);
}

export class SteelPlasticHingeState {
  constructor({
    start = null,
    end = null,
    history = [],
  } = {}) {
    this.start = normalizeSign(start);
    this.end = normalizeSign(end);
    this.history = [...history];
  }

  clone() {
    return new SteelPlasticHingeState(this.toJSON());
  }

  isActiveAt(position) {
    return this.signAt(position) != null;
  }

  signAt(position) {
    return position === "start" ? this.start : this.end;
  }

  activeCount() {
    return Number(this.start != null) + Number(this.end != null);
  }

  withActivation(position, sign, metadata = {}) {
    const normalizedPosition = position === "start" ? "start" : "end";
    const normalizedSign = normalizeSign(sign);

    if (this[normalizedPosition] != null) {
      return this.clone();
    }

    return new SteelPlasticHingeState({
      start: normalizedPosition === "start" ? normalizedSign : this.start,
      end: normalizedPosition === "end" ? normalizedSign : this.end,
      history: [
        ...this.history,
        {
          type: "plastic-hinge-activation",
          position: normalizedPosition,
          sign: normalizedSign,
          ...metadata,
        },
      ],
    });
  }

  activationDelta(nextState) {
    const events = [];

    if (this.start == null && nextState?.start != null) {
      events.push({ position: "start", sign: nextState.start });
    }

    if (this.end == null && nextState?.end != null) {
      events.push({ position: "end", sign: nextState.end });
    }

    return events;
  }

  toJSON() {
    return {
      start: this.start,
      end: this.end,
      history: [...this.history],
    };
  }
}
