const DEFAULT_ULS_COEFFICIENTS = {
  g1Unfavourable: 1.3,
  g1Favourable: 1.0,
  g2Unfavourable: 1.5,
  g2Favourable: 0.9,
  qUnfavourable: 1.5,
};

export class NTC2018SlabLoadAnalysis {
  constructor(floorSlab) {
    this.floorSlab = floorSlab;
  }

  calculateULS(coefficients = {}) {
    const factors = {
      ...DEFAULT_ULS_COEFFICIENTS,
      ...coefficients,
    };

    const permanentBase = (factors.g1Unfavourable * this.floorSlab.g1UnfavourableTotal)
      + (factors.g1Favourable * this.floorSlab.g1FavourableTotal)
      + (factors.g2Unfavourable * this.floorSlab.g2UnfavourableTotal)
      + (factors.g2Favourable * this.floorSlab.g2FavourableTotal);

    const variableLoads = this.floorSlab.variableLoads;

    if (variableLoads.length === 0) {
      return {
        combination: "ULS",
        noVariableLoad: true,
        values: [],
        maximum: {
          value: permanentBase,
          note: "No variable loads are present.",
          dominantVariableLoadId: null,
        },
      };
    }

    const values = variableLoads.map((leadingLoad, index) => {
      const accompanyingValue = variableLoads
        .filter((_, loadIndex) => loadIndex !== index)
        .reduce(
          (sum, load) => sum + (factors.qUnfavourable * load.psi0 * load.value),
          0,
        );

      return {
        value: permanentBase + (factors.qUnfavourable * leadingLoad.value) + accompanyingValue,
        note: `with ${leadingLoad.description} as leading variable action`,
        dominantVariableLoadId: variableLoads.length > 1 ? leadingLoad.variableLoadId : null,
      };
    });

    return {
      combination: "ULS",
      noVariableLoad: false,
      values,
      maximum: values.reduce((max, current) => (current.value > max.value ? current : max), values[0]),
    };
  }

  calculateSLE() {
    const variableLoads = this.floorSlab.variableLoads;
    const permanentTotal = this.floorSlab.servicePermanentTotal;

    if (variableLoads.length === 0) {
      const maximum = {
        value: permanentTotal,
        note: "No variable loads are present.",
        dominantVariableLoadId: null,
      };

      return {
        rare: {
          combination: "SLE_RARE",
          noVariableLoad: true,
          values: [],
          maximum,
        },
        frequent: {
          combination: "SLE_FREQUENT",
          noVariableLoad: true,
          values: [],
          maximum,
        },
        quasiPermanent: {
          combination: "SLE_QUASI_PERMANENT",
          noVariableLoad: true,
          value: permanentTotal,
        },
      };
    }

    const rareValues = variableLoads.map((leadingLoad, index) => {
      const accompanyingValue = variableLoads
        .filter((_, loadIndex) => loadIndex !== index)
        .reduce((sum, load) => sum + (load.psi0 * load.value), 0);

      return {
        value: permanentTotal + leadingLoad.value + accompanyingValue,
        note: `with ${leadingLoad.description} as leading variable action`,
        dominantVariableLoadId: variableLoads.length > 1 ? leadingLoad.variableLoadId : null,
      };
    });

    const frequentValues = variableLoads.map((leadingLoad, index) => {
      const accompanyingValue = variableLoads
        .filter((_, loadIndex) => loadIndex !== index)
        .reduce((sum, load) => sum + (load.psi2 * load.value), 0);

      return {
        value: permanentTotal + (leadingLoad.psi1 * leadingLoad.value) + accompanyingValue,
        note: `with ${leadingLoad.description} as main variable action`,
        dominantVariableLoadId: variableLoads.length > 1 ? leadingLoad.variableLoadId : null,
      };
    });

    const quasiPermanentVariableValue = variableLoads.reduce(
      (sum, load) => sum + (load.psi2 * load.value),
      0,
    );

    return {
      rare: {
        combination: "SLE_RARE",
        values: rareValues,
        maximum: rareValues.reduce((max, current) => (current.value > max.value ? current : max), rareValues[0]),
      },
      frequent: {
        combination: "SLE_FREQUENT",
        values: frequentValues,
        maximum: frequentValues.reduce((max, current) => (current.value > max.value ? current : max), frequentValues[0]),
      },
      quasiPermanent: {
        combination: "SLE_QUASI_PERMANENT",
        value: permanentTotal + quasiPermanentVariableValue,
      },
    };
  }
}
