import { Router } from "express";
import {
  uploadAttachmentController,
  listAttachmentsController,
  deleteAttachmentController,
} from "../controllers/attachment.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

/**
 * Attachment Routes
 * Nested under issues: /api/v1/issues/:issueId/attachments
 *
 * All routes require authentication.
 * Fine-grained access control is enforced in attachment.services.ts.
 *
 * Note: POST uses multipart/form-data (handled by Multer in the controller).
 * The client must send the file with field name "file".
 */
const router = Router({ mergeParams: true });

// Upload a file — Multer middleware is included in the controller array
router.post("/", authenticate, ...uploadAttachmentController);

// List attachments for an issue
router.get("/", authenticate, listAttachmentsController);

// Delete a specific attachment
router.delete("/:attachmentId", authenticate, deleteAttachmentController);

export default router;
