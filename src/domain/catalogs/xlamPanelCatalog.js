const XLAM_PANEL_PRODUCTS = new Map();

export function registerXlamPanelProduct(product) {
  if (!product?.id) {
    throw new Error("XLAM panel product requires an id.");
  }

  XLAM_PANEL_PRODUCTS.set(product.id, {
    ...product,
    layerThicknesses: [...(product.layerThicknesses ?? [])],
    metadata: { ...(product.metadata ?? {}) },
  });
}

export function getXlamPanelProduct(productId) {
  const product = XLAM_PANEL_PRODUCTS.get(productId);

  return product
    ? {
        ...product,
        layerThicknesses: [...product.layerThicknesses],
        metadata: { ...product.metadata },
      }
    : null;
}

export function listXlamPanelProducts() {
  return [...XLAM_PANEL_PRODUCTS.values()].map((product) => ({
    ...product,
    layerThicknesses: [...product.layerThicknesses],
    metadata: { ...product.metadata },
  }));
}

registerXlamPanelProduct({
  id: "generic-5s-30-30-30",
  producer: "generic",
  name: "Generic 5-layer CLT 30/30/30",
  layerThicknesses: [0, 0, 30, 30, 30],
  metadata: {
    note: "Placeholder generic product. Replace or extend with producer catalogs.",
  },
});
