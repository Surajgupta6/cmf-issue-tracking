import { Router } from "express";
import {
  createCategoryController,
  getCategoriesController,
  getCategoryByIdController,
  updateCategoryController,
  deleteCategoryController,
} from "../controllers/category.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { Role } from "../generated/prisma/client.js";

const router = Router();

/**
 * All category routes require authentication.
 * The authenticate middleware verifies the JWT and attaches req.user.
 *
 * Role-based access:
 *  - GET endpoints: any authenticated user (CUSTOMER, AGENT, MANAGER, ADMIN)
 *  - POST/PATCH/DELETE: MANAGER and ADMIN only
 */

// Create category — ADMIN and MANAGER only
router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN, Role.MANAGER),
  createCategoryController,
);

// List all categories for the authenticated user's organization
router.get("/", authenticate, getCategoriesController);

// Get a single category by ID
router.get("/:id", authenticate, getCategoryByIdController);

// Update category name — ADMIN and MANAGER only
router.patch(
  "/:id",
  authenticate,
  authorize(Role.ADMIN, Role.MANAGER),
  updateCategoryController,
);

// Delete category — ADMIN only (destructive operation)
router.delete(
  "/:id",
  authenticate,
  authorize(Role.ADMIN),
  deleteCategoryController,
);

export default router;
