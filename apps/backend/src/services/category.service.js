import {
  getCategories,
  createCategory,
  updateCategory,
  deactivateCategory,
  deleteCategory,
  activateCategory,
  reorderCategories,
  bulkUpdatePrinterTargets,
} from "../models/category.model.js";

export const activateCategoryService = async (id) => activateCategory(id);
export const getCategoriesService = async (includeInactive = false) => getCategories(includeInactive);

export const createCategoryService = async (data) => {
  if (!data.name) {
    throw new Error("Nombre requerido");
  }

  return createCategory({
    name: String(data.name).trim(),
    parent_id: data.parent_id === undefined || data.parent_id === null || data.parent_id === ""
      ? null
      : Number(data.parent_id),
    printer_target: data.printer_target === 'bar' ? 'bar' : 'kitchen',
  });
};

export const updateCategoryService = async (id, data) => updateCategory(id, data);
export const deactivateCategoryService = async (id) => deactivateCategory(id);
export const deleteCategoryService = async (id) => deleteCategory(id);
export const reorderCategoriesService = async (categories) => reorderCategories(categories);
export const bulkUpdatePrinterTargetsService = async (targets) => bulkUpdatePrinterTargets(targets);
