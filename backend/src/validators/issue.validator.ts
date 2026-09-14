import { z } from "zod";
import { Priority, IssueStatus } from "../generated/prisma/client.js";

/**
 * Schema for creating a new issue.
 *
 * Design decisions:
 * - `categoryId` is required (UUID). We validate the UUID format here so
 *   malformed IDs fail at the boundary, not deep in the DB layer.
 * - `priority` defaults to MEDIUM if not provided (handled by Prisma schema).
 *   The client can override it.
 * - `assignedToId` is intentionally NOT accepted on creation — assignment
 *   is a separate privileged action (PATCH /issues/:id/assign).
 *   This keeps the creation flow clean and prevents customers from
 *   self-assigning.
 */
export const createIssueSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Title must be at least 5 characters")
    .max(200, "Title cannot exceed 200 characters"),
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(5000, "Description cannot exceed 5000 characters"),
  priority: z
    .enum([Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.CRITICAL])
    .default(Priority.MEDIUM),
  categoryId: z.string().uuid("categoryId must be a valid UUID"),
});

/**
 * Schema for updating issue fields.
 * All fields are optional — only provided fields will be updated (partial update).
 *
 * Note: status and assignedToId are NOT in this schema.
 * - Status changes are via PATCH /issues/:id/status (state machine enforced)
 * - Assignment is via PATCH /issues/:id/assign (role-guarded)
 * This keeps each operation clean and auditable.
 */
export const updateIssueSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Title must be at least 5 characters")
    .max(200, "Title cannot exceed 200 characters")
    .optional(),
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(5000, "Description cannot exceed 5000 characters")
    .optional(),
  priority: z
    .enum([Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.CRITICAL])
    .optional(),
  categoryId: z.string().uuid("categoryId must be a valid UUID").optional(),
});

/**
 * Schema for updating issue status via the state machine.
 */
export const updateStatusSchema = z.object({
  status: z.enum(
    [
      IssueStatus.OPEN,
      IssueStatus.ASSIGNED,
      IssueStatus.IN_PROGRESS,
      IssueStatus.RESOLVED,
      IssueStatus.CLOSED,
      IssueStatus.REOPENED,
    ],
    { error: "Invalid issue status" },
  ),
});

/**
 * Schema for assigning an issue to an agent.
 */
export const assignIssueSchema = z.object({
  agentId: z.string().uuid("agentId must be a valid UUID"),
});

/**
 * Schema for listing/filtering issues.
 * All filters are optional and combinable.
 *
 * Sorting: default is createdAt desc (newest first).
 * Pagination: offset-based (page + limit).
 */
export const listIssuesQuerySchema = z.object({
  status: z
    .enum([
      IssueStatus.OPEN,
      IssueStatus.ASSIGNED,
      IssueStatus.IN_PROGRESS,
      IssueStatus.RESOLVED,
      IssueStatus.CLOSED,
      IssueStatus.REOPENED,
    ])
    .optional(),
  priority: z
    .enum([Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.CRITICAL])
    .optional(),
  categoryId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  sortBy: z
    .enum(["createdAt", "updatedAt", "priority", "status"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z
    .string()
    .optional()
    .transform((v) => Math.max(1, parseInt(v ?? "1", 10))),
  limit: z
    .string()
    .optional()
    .transform((v) => Math.min(100, Math.max(1, parseInt(v ?? "20", 10)))),
});
