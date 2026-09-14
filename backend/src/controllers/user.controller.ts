import { Request, Response } from "express";
import {
  listUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
} from "../services/user.services.js";
import {
  listUsersQuerySchema,
  updateRoleSchema,
  updateStatusSchema,
} from "../validators/user.validator.js";
import { AppError } from "../utils/app-error.js";

/**
 * User Controller
 *
 * Responsibilities (ONLY):
 *  - Parse and validate request body/params/query
 *  - Call the appropriate user service function
 *  - Return the HTTP response
 *
 * All errors propagate to the centralized errorHandler middleware.
 * Express 5 handles async error propagation automatically.
 */

/**
 * Helper to safely extract a string route parameter.
 * Prevents TypeScript strict-mode type errors on req.params access.
 */
function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value || Array.isArray(value)) {
    throw new AppError(`Missing or invalid URL parameter: ${name}`, 400);
  }
  return value;
}

/**
 * GET /api/v1/users
 * List all users in the authenticated user's organization.
 * Supports filtering by role, isActive status, and free-text search.
 * Restricted to ADMIN and MANAGER.
 */
export const listUsersController = async (req: Request, res: Response) => {
  const query = listUsersQuerySchema.parse(req.query);

  const result = await listUsers({
    organizationId: req.user!.organizationId,
    role: query.role,
    isActive: query.isActive,
    search: query.search,
    page: query.page,
    limit: query.limit,
  });

  return res.status(200).json({
    status: "success",
    data: result.users,
    pagination: result.pagination,
  });
};

/**
 * GET /api/v1/users/:id
 * Get a single user by ID within the authenticated user's organization.
 * Available to all authenticated users (any role can look up teammates).
 */
export const getUserByIdController = async (req: Request, res: Response) => {
  const id = getParam(req, "id");
  const user = await getUserById(id, req.user!.organizationId);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return res.status(200).json({
    status: "success",
    data: { user },
  });
};

/**
 * PATCH /api/v1/users/:id/role
 * Update a user's role. ADMIN only.
 *
 * Security: The requester's own ID is passed to the service so it can enforce
 * the "no self-role-change" rule.
 */
export const updateUserRoleController = async (req: Request, res: Response) => {
  const id = getParam(req, "id");
  const { role } = updateRoleSchema.parse(req.body);

  const user = await updateUserRole(
    req.user!.userId,    // requester ID — for self-change guard
    id,                  // target user ID
    req.user!.organizationId,
    role,
  );

  return res.status(200).json({
    status: "success",
    message: `User role updated to ${role}`,
    data: { user },
  });
};

/**
 * PATCH /api/v1/users/:id/status
 * Activate or deactivate a user account. ADMIN only.
 *
 * Deactivating: sets isActive = false AND revokes all existing refresh tokens.
 * The user cannot log in or use any existing tokens after this.
 *
 * Security: The requester's own ID is passed to enforce "no self-deactivation".
 */
export const updateUserStatusController = async (
  req: Request,
  res: Response,
) => {
  const id = getParam(req, "id");
  const { isActive } = updateStatusSchema.parse(req.body);

  const user = await updateUserStatus(
    req.user!.userId,
    id,
    req.user!.organizationId,
    isActive,
  );

  return res.status(200).json({
    status: "success",
    message: isActive ? "User account activated" : "User account deactivated",
    data: { user },
  });
};
