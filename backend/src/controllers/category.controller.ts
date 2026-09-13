import { Request, Response } from "express";
import {
  createCategory,
  getCategories,
  getCategoryById,
} from "../services/category.services.js";
import { createCategorySchema } from "../validators/category.validator.js";

export const createCategoryController = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    const validatedData = createCategorySchema.parse(req.body);

    const category = await createCategory(
      validatedData.name,
      req.user.organizationId,
    );

    return res.status(201).json({
      status: "success",
      data: {
        category,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({
        status: "error",
        message: error.message,
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Something went wrong",
    });
  }
};

export const getCategoriesController = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    const categories = await getCategories(req.user.organizationId);

    return res.status(200).json({
      status: "success",
      data: {
        categories,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      status: "error",
      message: "Failed to fetch categories",
    });
  }
};

export const getCategoryByIdController = async (
  req: Request,
  res: Response,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    const { id } = req.params;

    if (!id || Array.isArray(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid category ID",
      });
    }

    const category = await getCategoryById(id, req.user.organizationId);

    if (!category) {
      return res.status(404).json({
        status: "error",
        message: "Category not found",
      });
    }

    return res.status(200).json({
      status: "success",
      data: {
        category,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      status: "error",
      message: "Failed to fetch category",
    });
  }
};