import { MohrCoulombModel } from "./MohrCoulombModel.js";
import { SlidingStrengthModel } from "./SlidingStrengthModel.js";
import { TurnsekSheppardModel } from "./TurnsekSheppardModel.js";

export function createMasonryShearStrengthModel(model, { role = "diagonal" } = {}) {
  if (model && typeof model.evaluate === "function") {
    return typeof model.clone === "function" ? model.clone() : model;
  }

  const type = String(model?.type ?? "").trim().toLowerCase();

  if (["turnsek-sheppard", "turnseksheppard"].includes(type)) {
    return new TurnsekSheppardModel(model);
  }

  if (["mohr-coulomb", "mohrcoulomb"].includes(type)) {
    return new MohrCoulombModel(model);
  }

  if (["bed-joint-sliding", "sliding"].includes(type)) {
    return new SlidingStrengthModel(model);
  }

  if (type === "user-defined") {
    throw new Error(
      `A ${role} user-defined masonry shear model must provide an evaluate(context) function; a serializable type tag alone is not executable.`,
    );
  }

  throw new Error(
    `Unsupported ${role} masonry shear strength model type: ${model?.type ?? "<missing>"}.`,
  );
}
