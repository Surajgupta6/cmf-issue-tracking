import { z } from "zod";

/**
 * Validation schema for creating a category.
 * Name is trimmed to avoid whitespace-only names and leading/trailing spaces.
 */
export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Category name must be at least 2 characters")
    .max(50, "Category name cannot exceed 50 characters"),
});

/**
 * Validation schema for updating a category.
 * Same rules as create — we reuse the shape.
 */
export const updateCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Category name must be at least 2 characters")
    .max(50, "Category name cannot exceed 50 characters"),
});