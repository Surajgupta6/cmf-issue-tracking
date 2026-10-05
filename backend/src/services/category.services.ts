import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/app-error.js";

/**
 * Category Service
 *
 * All operations are scoped to organizationId — this is the primary
 * mechanism that prevents one organization from accessing another's categories
 * (IDOR / multi-tenancy isolation).
 */

/**
 * Create a category for the given organization.
 *
 * Uniqueness is enforced at the application level (findFirst check) rather
 * than a DB unique constraint because we want a clear, human-readable error
 * message. A future migration will add a composite unique index on
 * (name, organizationId) as defense-in-depth.
 */
export const createCategory = async (name: string, organizationId: string) => {
  const existingCategory = await prisma.category.findFirst({
    where: { name, organizationId },
  });

  if (existingCategory) {
    throw new AppError("A category with this name already exists", 409);
  }

  return prisma.category.create({
    data: { name, organizationId },
  });
};

/**
 * List all categories for the given organization, ordered by creation date.
 */
export const getCategories = async (organizationId: string) => {
  return prisma.category.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
};

/**
 * Get a single category by ID, scoped to the organization.
 *
 * Returns null if the category does not exist OR belongs to a different org.
 * The controller converts null to a 404 response.
 */
export const getCategoryById = async (
  categoryId: string,
  organizationId: string,
) => {
  return prisma.category.findFirst({
    where: { id: categoryId, organizationId },
  });
};

/**
 * Update a category's name within the organization.
 *
 * Checks:
 * 1. Category exists in this org (IDOR prevention)
 * 2. New name is not already taken by another category in this org
 */
export const updateCategory = async (
  categoryId: string,
  organizationId: string,
  name: string,
) => {
  // Verify category exists and belongs to this org
  const existing = await prisma.category.findFirst({
    where: { id: categoryId, organizationId },
  });

  if (!existing) {
    throw new AppError("Category not found", 404);
  }

  // Check for name conflict with other categories in this org
  const nameConflict = await prisma.category.findFirst({
    where: {
      name,
      organizationId,
      id: { not: categoryId }, // Exclude the current category from conflict check
    },
  });

  if (nameConflict) {
    throw new AppError("A category with this name already exists", 409);
  }

  return prisma.category.update({
    where: { id: categoryId },
    data: { name },
  });
};

/**
 * Delete a category by ID, scoped to the organization.
 *
 * Guard: Prevents deletion if the category has associated issues.
 * Issues must be reassigned or resolved before the category can be deleted.
 *
 * This prevents orphaned issues with null categoryId, which would break
 * the NOT NULL constraint on Issue.categoryId.
 */
export const deleteCategory = async (
  categoryId: string,
  organizationId: string,
) => {
  const existing = await prisma.category.findFirst({
    where: { id: categoryId, organizationId },
    include: { _count: { select: { issues: true } } },
  });

  if (!existing) {
    throw new AppError("Category not found", 404);
  }

  if (existing._count.issues > 0) {
    throw new AppError(
      `Cannot delete category with ${existing._count.issues} associated issue(s). Reassign or resolve them first.`,
      409,
    );
  }

  await prisma.category.delete({ where: { id: categoryId } });
};