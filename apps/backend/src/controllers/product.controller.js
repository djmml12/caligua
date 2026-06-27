import {
  getProductsService,
  getProductByIdService,
  createProductService,
  updateProductService,
  deactivateProductService,
  activateProductService,
  deleteProductService,
  reorderProductsService,
} from "../services/product.service.js";

const parseBoolean = (value) => value === true || value === "true" || value === "1" || value === 1;

export const addStock = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const qty = Number(req.body?.quantity);

    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ message: "Cantidad inválida" });
    }

    const product = await getProductByIdService(id);

    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const updated = await updateProductService(id, {
      ...product,
      stock: Number(product.stock) + qty,
    });

    res.json(updated);
  } catch (error) {
    console.error("ADD STOCK ERROR:", error);
    res.status(500).json({ message: error.message || "Error agregando stock" });
  }
};

export const getProducts = async (req, res) => {
  try {
    const { category_id, includeInactive } = req.query;
    const products = await getProductsService({ category_id, includeInactive: parseBoolean(includeInactive) });
    res.json(products);
  } catch (error) {
    console.error("GET PRODUCTS ERROR:", error);
    res.status(500).json({ message: "Error obteniendo productos" });
  }
};

export const getProductById = async (req, res) => {
  try {
    const product = await getProductByIdService(Number(req.params.id));

    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    res.json(product);
  } catch (error) {
    console.error("GET PRODUCT BY ID ERROR:", error);
    res.status(500).json({ message: "Error obteniendo producto" });
  }
};

export const createProduct = async (req, res) => {
  try {
    const created = await createProductService(req.body);
    res.status(201).json(created);
  } catch (error) {
    console.error("CREATE PRODUCT ERROR:", error);
    res.status(400).json({ message: error.message || "Error creando producto" });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const updated = await updateProductService(Number(req.params.id), req.body);
    res.json(updated);
  } catch (error) {
    console.error("UPDATE PRODUCT ERROR:", error);
    res.status(400).json({ message: error.message || "Error actualizando producto" });
  }
};

export const deactivateProduct = async (req, res) => {
  try {
    const updated = await deactivateProductService(Number(req.params.id));
    res.json(updated);
  } catch (error) {
    console.error("DEACTIVATE PRODUCT ERROR:", error);
    res.status(400).json({ message: error.message || "Error desactivando producto" });
  }
};

export const activateProduct = async (req, res) => {
  try {
    const updated = await activateProductService(Number(req.params.id));
    res.json(updated);
  } catch (error) {
    console.error("ACTIVATE PRODUCT ERROR:", error);
    res.status(400).json({ message: error.message || "Error activando producto" });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    await deleteProductService(Number(req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error("DELETE PRODUCT ERROR:", error);
    res.status(400).json({ message: error.message || "Error eliminando producto" });
  }
};

export const reorderProducts = async (req, res) => {
  try {
    const { products, orderedIds, ids, order } = req.body;

    const list = Array.isArray(products)
      ? products
      : Array.isArray(orderedIds)
      ? orderedIds
      : Array.isArray(ids)
      ? ids
      : Array.isArray(order)
      ? order
      : null;

    if (!list || list.length === 0) {
      return res.status(400).json({ message: "Lista de productos requerida" });
    }

    await reorderProductsService(list);

    res.json({ success: true, message: "Orden actualizado" });
  } catch (error) {
    console.error("REORDER PRODUCTS ERROR:", error);
    res.status(500).json({ message: error.message || "Error reordenando productos" });
  }
};
