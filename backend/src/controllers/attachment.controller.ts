import { Request, Response, NextFunction } from "express";
import {
  createAttachment,
  listAttachments,
  deleteAttachment,
} from "../services/attachment.services.js";
import { uploadSingle } from "../utils/upload.middleware.js";
import { AppError } from "../utils/app-error.js";

function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value || Array.isArray(value)) {
    throw new AppError(`Missing or invalid URL parameter: ${name}`, 400);
  }
  return value;
}

/**
 * Upload middleware wrapper.
 *
 * Multer can throw errors synchronously (file filter rejection, size limit)
 * before the async handler runs. We wrap it in a Promise so Express 5 can
 * catch these errors and route them to the centralized error handler.
 *
 * Without this wrapper, Multer errors would not reach the error handler.
 */
const handleUpload = (req: Request, res: Response, next: NextFunction) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      return next(err instanceof AppError ? err : new AppError(String(err), 400));
    }
    next();
  });
};

/**
 * POST /api/v1/issues/:issueId/attachments
 * Upload a file attachment. Uses multipart/form-data.
 * Form field name: "file"
 *
 * Response includes the URL to access the uploaded file.
 */
export const uploadAttachmentController = [
  handleUpload,
  async (req: Request, res: Response) => {
    const issueId = getParam(req, "issueId");

    if (!req.file) {
      throw new AppError(
        "No file provided. Include a file with field name 'file' in the multipart form.",
        400,
      );
    }

    const attachment = await createAttachment(
      issueId,
      req.user!.organizationId,
      req.user!.userId,
      req.file,
    );

    return res.status(201).json({
      status: "success",
      message: "File uploaded successfully",
      data: { attachment },
    });
  },
];

/**
 * GET /api/v1/issues/:issueId/attachments
 * List all attachments for an issue.
 */
export const listAttachmentsController = async (
  req: Request,
  res: Response,
) => {
  const issueId = getParam(req, "issueId");

  const attachments = await listAttachments(
    issueId,
    req.user!.organizationId,
    req.user!.userId,
    req.user!.role,
  );

  return res.status(200).json({
    status: "success",
    data: { attachments },
  });
};

/**
 * DELETE /api/v1/issues/:issueId/attachments/:attachmentId
 * Delete an attachment file and its DB record.
 */
export const deleteAttachmentController = async (
  req: Request,
  res: Response,
) => {
  const issueId = getParam(req, "issueId");
  const attachmentId = getParam(req, "attachmentId");

  await deleteAttachment(
    issueId,
    attachmentId,
    req.user!.organizationId,
    req.user!.userId,
    req.user!.role,
  );

  return res.status(200).json({
    status: "success",
    message: "Attachment deleted successfully",
  });
};
