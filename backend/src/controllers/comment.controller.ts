import { Request, Response } from "express";
import {
  createComment,
  listComments,
  updateComment,
  deleteComment,
} from "../services/comment.services.js";
import {
  createCommentSchema,
  updateCommentSchema,
} from "../validators/comment.validator.js";
import { AppError } from "../utils/app-error.js";

function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value || Array.isArray(value)) {
    throw new AppError(`Missing or invalid URL parameter: ${name}`, 400);
  }
  return value;
}

/**
 * POST /api/v1/issues/:issueId/comments
 */
export const createCommentController = async (req: Request, res: Response) => {
  const issueId = getParam(req, "issueId");
  const { content } = createCommentSchema.parse(req.body);

  const comment = await createComment(
    issueId,
    req.user!.organizationId,
    req.user!.userId,
    req.user!.role,
    content,
  );

  return res.status(201).json({
    status: "success",
    data: { comment },
  });
};

/**
 * GET /api/v1/issues/:issueId/comments
 * Paginated: ?page=1&limit=20
 */
export const listCommentsController = async (req: Request, res: Response) => {
  const issueId = getParam(req, "issueId");
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(req.query["limit"] ?? "20"), 10)),
  );

  const result = await listComments(
    issueId,
    req.user!.organizationId,
    req.user!.userId,
    req.user!.role,
    page,
    limit,
  );

  return res.status(200).json({
    status: "success",
    data: result.comments,
    pagination: result.pagination,
  });
};

/**
 * PATCH /api/v1/issues/:issueId/comments/:commentId
 */
export const updateCommentController = async (req: Request, res: Response) => {
  const issueId = getParam(req, "issueId");
  const commentId = getParam(req, "commentId");
  const { content } = updateCommentSchema.parse(req.body);

  const comment = await updateComment(
    issueId,
    commentId,
    req.user!.organizationId,
    req.user!.userId,
    content,
  );

  return res.status(200).json({
    status: "success",
    data: { comment },
  });
};

/**
 * DELETE /api/v1/issues/:issueId/comments/:commentId
 */
export const deleteCommentController = async (req: Request, res: Response) => {
  const issueId = getParam(req, "issueId");
  const commentId = getParam(req, "commentId");

  await deleteComment(
    issueId,
    commentId,
    req.user!.organizationId,
    req.user!.userId,
    req.user!.role,
  );

  return res.status(200).json({
    status: "success",
    message: "Comment deleted successfully",
  });
};
