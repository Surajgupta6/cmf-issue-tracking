import { Router } from "express";
import {
  listUsersController,
  getUserByIdController,
  updateUserRoleController,
  updateUserStatusController,
} from "../controllers/user.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { Role } from "../generated/prisma/client.js";

const router = Router();

/**
 * User Management Routes
 *
 * All routes require authentication (valid JWT).
 *
 * Role-based access:
 *  - GET /           : ADMIN, MANAGER only (managers need to list agents for assignment)
 *  - GET /:id        : Any authenticated user (look up teammates, own profile)
 *  - PATCH /:id/role : ADMIN only (privilege-sensitive operation)
 *  - PATCH /:id/status: ADMIN only (account deactivation is destructive)
 */

// List users in the organization (with optional filters + pagination)
router.get(
  "/",
  authenticate,
  authorize(Role.ADMIN, Role.MANAGER),
  listUsersController,
);

// Get a single user by ID
router.get("/:id", authenticate, getUserByIdController);

// Update user role — ADMIN only
router.patch(
  "/:id/role",
  authenticate,
  authorize(Role.ADMIN),
  updateUserRoleController,
);

// Activate / deactivate user account — ADMIN only
router.patch(
  "/:id/status",
  authenticate,
  authorize(Role.ADMIN),
  updateUserStatusController,
);

export default router;
