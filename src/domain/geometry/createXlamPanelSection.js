import { XlamPanelSection } from "./XlamPanelSection.js";
import { getXlamPanelProduct } from "../catalogs/xlamPanelCatalog.js";

export function createXlamPanelSection({
  productId = null,
  effectiveWidth = null,
  layerThicknesses = null,
  activeLayerIndexes = null,
  ...options
} = {}) {
  const product = productId ? getXlamPanelProduct(productId) : null;

  return new XlamPanelSection({
    effectiveWidth: effectiveWidth ?? product?.effectiveWidth ?? 1000,
    layerThicknesses: layerThicknesses ?? product?.layerThicknesses,
    activeLayerIndexes: activeLayerIndexes ?? product?.activeLayerIndexes ?? [0, 2, 4],
    metadata: {
      ...(product?.metadata ?? {}),
      ...(options.metadata ?? {}),
      productId: product?.id ?? productId ?? null,
      producer: product?.producer ?? null,
    },
    ...options,
  });
}
