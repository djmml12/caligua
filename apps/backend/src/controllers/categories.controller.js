import {
  getCategoriesService,
  createCategoryService,
  updateCategoryService,
  deactivateCategoryService,
  activateCategoryService,
  deleteCategoryService,
  reorderCategoriesService,
  bulkUpdatePrinterTargetsService,
} from "../services/category.service.js";

export const getCategories = async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const categories = await getCategoriesService(includeInactive);
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo categorías" });
  }
};

export const createCategory = async (req, res) => {
  try {
    const category = await createCategoryService(req.body);
    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const category = await updateCategoryService(req.params.id, req.body);
    res.json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deactivateCategory = async (req, res) => {
  try {
    const category = await deactivateCategoryService(req.params.id);
    res.json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const category = await deleteCategoryService(req.params.id);
    res.json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const activateCategory = async (req, res) => {
  try {
    const category = await activateCategoryService(req.params.id);
    res.json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updatePrinterTargets = async (req, res) => {
  try {
    const { targets } = req.body ?? {};
    if (!Array.isArray(targets) || targets.length === 0) {
      return res.status(400).json({ message: "Lista de targets requerida" });
    }
    await bulkUpdatePrinterTargetsService(targets);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message || "Error actualizando destinos de impresora" });
  }
};

export const reorderCategories = async (req, res) => {
  try {
    const { categories, orderedIds, ids, order } = req.body;

    const list = Array.isArray(categories)
      ? categories
      : Array.isArray(orderedIds)
      ? orderedIds
      : Array.isArray(ids)
      ? ids
      : Array.isArray(order)
      ? order
      : null;

    if (!list || list.length === 0) {
      return res.status(400).json({ message: "Lista de categorías requerida" });
    }

    await reorderCategoriesService(list);
    res.json({ success: true, message: "Orden actualizado" });
  } catch (error) {
    res.status(500).json({ message: error.message || "Error reordenando categorías" });
  }
};
