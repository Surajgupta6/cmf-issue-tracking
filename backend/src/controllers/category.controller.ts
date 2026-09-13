import { Request, Response } from "express";
import {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from "../services/category.services.js";
import {
  createCategorySchema,
  updateCategorySchema,
} from "../validators/category.validator.js";
import { AppError } from "../utils/app-error.js";

/**
 * Category Controller
 *
 * Controllers only handle HTTP concerns:
 *  - Parse req.body / req.params / req.user
 *  - Call the service
 *  - Return the HTTP response
 *
 * All error handling (AppError, ZodError, Prisma) is delegated to the
 * centralized errorHandler middleware. No try/catch needed here because
 * Express 5 automatically propagates async errors to the error handler.
 */

/**
 * Extract and validate a route parameter as a string.
 * Required because TypeScript types req.params values as string | string[]
 * under strict noUncheckedIndexedAccess settings.
 */
function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value || Array.isArray(value)) {
    throw new AppError(`Missing or invalid URL parameter: ${name}`, 400);
  }
  return value;
}

export const createCategoryController = async (req: Request, res: Response) => {
  const validatedData = createCategorySchema.parse(req.body);

  // req.user is guaranteed by authenticate middleware
  const category = await createCategory(
    validatedData.name,
    req.user!.organizationId,
  );

  return res.status(201).json({
    status: "success",
    data: { category },
  });
};

export const getCategoriesController = async (req: Request, res: Response) => {
  const categories = await getCategories(req.user!.organizationId);

  return res.status(200).json({
    status: "success",
    data: { categories },
  });
};

export const getCategoryByIdController = async (
  req: Request,
  res: Response,
) => {
  const id = getParam(req, "id");
  const category = await getCategoryById(id, req.user!.organizationId);

  if (!category) {
    throw new AppError("Category not found", 404);
  }

  return res.status(200).json({
    status: "success",
    data: { category },
  });
};

export const updateCategoryController = async (req: Request, res: Response) => {
  const id = getParam(req, "id");
  const validatedData = updateCategorySchema.parse(req.body);

  const category = await updateCategory(
    id,
    req.user!.organizationId,
    validatedData.name,
  );

  return res.status(200).json({
    status: "success",
    data: { category },
  });
};

export const deleteCategoryController = async (req: Request, res: Response) => {
  const id = getParam(req, "id");

  await deleteCategory(id, req.user!.organizationId);

  return res.status(200).json({
    status: "success",
    message: "Category deleted successfully",
  });
};