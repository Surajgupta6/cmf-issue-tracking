import { z } from "zod";
import { Role } from "../generated/prisma/client.js";

/**
 * Validation schema for updating a user's role.
 *
 * Security note: Role assignment is ADMIN-only.
 * The allowed values are all roles EXCEPT ADMIN itself — an Admin should
 * not be able to self-promote via this endpoint.
 * Promoting to ADMIN requires a separate deliberate action
 * (or direct DB manipulation in an emergency) to prevent accidental
 * privilege escalation via the API.
 *
 * Design decision: We DO allow assigning ADMIN here for maximum flexibility
 * since this endpoint is already restricted to ADMIN role. If stricter
 * governance is needed, ADMIN can be removed from this enum.
 */
export const updateRoleSchema = z.object({
  role: z.enum(
    [Role.ADMIN, Role.MANAGER, Role.AGENT, Role.CUSTOMER],
    { error: "Role must be one of: ADMIN, MANAGER, AGENT, CUSTOMER" },
  ),
});

/**
 * Validation schema for updating a user's active status.
 */
export const updateStatusSchema = z.object({
  isActive: z.boolean({
    error: "isActive must be a boolean (true or false)",
  }),
});

/**
 * Validation schema for listing users.
 * Query parameters for filtering and pagination.
 */
export const listUsersQuerySchema = z.object({
  role: z
    .enum([Role.ADMIN, Role.MANAGER, Role.AGENT, Role.CUSTOMER])
    .optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? Math.max(1, parseInt(v, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => Math.min(100, Math.max(1, parseInt(v ?? "20", 10)))),
  search: z.string().trim().optional(),
});
