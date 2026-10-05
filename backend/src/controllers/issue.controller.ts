import { Request, Response } from "express";
import {
  createIssue,
  listIssues,
  getIssueById,
  updateIssue,
  updateIssueStatus,
  assignIssue,
  getIssueHistory,
} from "../services/issue.services.js";
import {
  createIssueSchema,
  listIssuesQuerySchema,
  updateIssueSchema,
  updateStatusSchema,
  assignIssueSchema,
} from "../validators/issue.validator.js";
import { AppError } from "../utils/app-error.js";
import { IssueStatus, Priority } from "../generated/prisma/client.js";

/**
 * Issue Controller
 *
 * Responsibilities (ONLY):
 *  - Parse and validate request body/params/query
 *  - Extract req.user fields and pass to service
 *  - Return the HTTP response
 *
 * All business logic is in issue.services.ts.
 * All error handling is centralized in error.middleware.ts.
 */

function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value || Array.isArray(value)) {
    throw new AppError(`Missing or invalid URL parameter: ${name}`, 400);
  }
  return value;
}

/**
 * POST /api/v1/issues
 * Create a new issue. Any authenticated user (all roles).
 */
export const createIssueController = async (req: Request, res: Response) => {
  const body = createIssueSchema.parse(req.body);

  const issue = await createIssue({
    title: body.title,
    description: body.description,
    priority: body.priority,
    categoryId: body.categoryId,
    organizationId: req.user!.organizationId,
    createdById: req.user!.userId,
  });

  return res.status(201).json({
    status: "success",
    message: "Issue created successfully",
    data: { issue },
  });
};

/**
 * GET /api/v1/issues
 * List issues with filtering, sorting, and pagination.
 * Role-based visibility enforced in service.
 */
export const listIssuesController = async (req: Request, res: Response) => {
  const query = listIssuesQuerySchema.parse(req.query);

  const result = await listIssues({
    organizationId: req.user!.organizationId,
    requesterId: req.user!.userId,
    requesterRole: req.user!.role,
    status: query.status as IssueStatus | undefined,
    priority: query.priority as Priority | undefined,
    categoryId: query.categoryId,
    assignedToId: query.assignedToId,
    search: query.search,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    page: query.page,
    limit: query.limit,
  });

  return res.status(200).json({
    status: "success",
    data: result.issues,
    pagination: result.pagination,
  });
};

/**
 * GET /api/v1/issues/:id
 * Get a single issue with full detail including recent history.
 */
export const getIssueByIdController = async (req: Request, res: Response) => {
  const id = getParam(req, "id");

  const issue = await getIssueById(
    id,
    req.user!.organizationId,
    req.user!.userId,
    req.user!.role,
  );

  if (!issue) {
    throw new AppError("Issue not found", 404);
  }

  return res.status(200).json({
    status: "success",
    data: { issue },
  });
};

/**
 * PATCH /api/v1/issues/:id
 * Update issue metadata (title, description, priority, category).
 */
export const updateIssueController = async (req: Request, res: Response) => {
  const id = getParam(req, "id");
  const body = updateIssueSchema.parse(req.body);

  const issue = await updateIssue(
    id,
    req.user!.organizationId,
    req.user!.userId,
    req.user!.role,
    {
      title: body.title,
      description: body.description,
      priority: body.priority,
      categoryId: body.categoryId,
    },
  );

  return res.status(200).json({
    status: "success",
    data: { issue },
  });
};

/**
 * PATCH /api/v1/issues/:id/status
 * Transition issue status through the state machine.
 */
export const updateIssueStatusController = async (
  req: Request,
  res: Response,
) => {
  const id = getParam(req, "id");
  const { status } = updateStatusSchema.parse(req.body);

  const issue = await updateIssueStatus(
    id,
    req.user!.organizationId,
    req.user!.userId,
    req.user!.role,
    status,
  );

  return res.status(200).json({
    status: "success",
    message: `Issue status updated to ${status}`,
    data: { issue },
  });
};

/**
 * PATCH /api/v1/issues/:id/assign
 * Assign an issue to an agent. MANAGER/ADMIN only.
 */
export const assignIssueController = async (req: Request, res: Response) => {
  const id = getParam(req, "id");
  const { agentId } = assignIssueSchema.parse(req.body);

  const issue = await assignIssue(
    id,
    req.user!.organizationId,
    req.user!.userId,
    agentId,
  );

  return res.status(200).json({
    status: "success",
    message: "Issue assigned successfully",
    data: { issue },
  });
};

/**
 * GET /api/v1/issues/:id/history
 * Get the full chronological audit trail for an issue.
 */
export const getIssueHistoryController = async (
  req: Request,
  res: Response,
) => {
  const id = getParam(req, "id");

  const history = await getIssueHistory(
    id,
    req.user!.organizationId,
    req.user!.userId,
    req.user!.role,
  );

  return res.status(200).json({
    status: "success",
    data: { history },
  });
};
