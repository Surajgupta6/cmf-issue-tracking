import { Role } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/app-error.js";
import { getFileUrl } from "../utils/upload.middleware.js";
import fs from "fs";
import path from "path";

/**
 * Attachment Service
 *
 * Manages file attachment metadata in the DB.
 * Actual file bytes are stored on disk (local) or in object storage (production).
 *
 * Flow:
 *   1. Multer middleware handles multipart upload and writes file to disk
 *   2. Controller calls createAttachment() with file metadata
 *   3. Service stores metadata in DB and returns the attachment record
 *   4. Client stores the URL and can download the file directly
 *
 * Key design: The service does NOT know about disk/S3 — it only stores metadata.
 * The URL is computed by getFileUrl() which is the single point to change
 * when migrating to cloud storage.
 */

// ---------------------------------------------------------------------------
// CREATE ATTACHMENT
// ---------------------------------------------------------------------------

/**
 * Save attachment metadata after file has been uploaded by Multer.
 *
 * Guards:
 *  - Issue must exist in org
 *  - Issue must not be CLOSED
 *  - Max 10 attachments per issue (prevents storage abuse)
 */
export const createAttachment = async (
  issueId: string,
  organizationId: string,
  uploaderId: string,
  file: Express.Multer.File,
) => {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, organizationId },
    include: { _count: { select: { attachments: true } } },
  });

  if (!issue) {
    // Clean up the uploaded file if issue doesn't exist
    safeDeleteFile(file.path);
    throw new AppError("Issue not found", 404);
  }

  if (issue.status === "CLOSED") {
    safeDeleteFile(file.path);
    throw new AppError("Cannot add attachments to a closed issue", 400);
  }

  const MAX_ATTACHMENTS = 10;
  if (issue._count.attachments >= MAX_ATTACHMENTS) {
    safeDeleteFile(file.path);
    throw new AppError(
      `Maximum ${MAX_ATTACHMENTS} attachments per issue reached`,
      400,
    );
  }

  const url = getFileUrl(file.filename);

  return prisma.attachment.create({
    data: {
      filename: file.originalname,  // Original name for human display
      url,                           // URL to access the file
      mimeType: file.mimetype,
      size: file.size,
      issueId,
      uploadedById: uploaderId,
    },
    include: {
      uploadedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });
};

// ---------------------------------------------------------------------------
// LIST ATTACHMENTS
// ---------------------------------------------------------------------------

/**
 * List all attachments for an issue.
 *
 * Access control mirrors issue visibility:
 *  - CUSTOMER: only their own issues
 *  - Others: any org issue
 */
export const listAttachments = async (
  issueId: string,
  organizationId: string,
  requesterId: string,
  requesterRole: string,
) => {
  const where: Record<string, unknown> = { id: issueId, organizationId };
  if (requesterRole === Role.CUSTOMER) {
    where["createdById"] = requesterId;
  }

  const issue = await prisma.issue.findFirst({ where });
  if (!issue) {
    throw new AppError("Issue not found", 404);
  }

  return prisma.attachment.findMany({
    where: { issueId },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
};

// ---------------------------------------------------------------------------
// DELETE ATTACHMENT
// ---------------------------------------------------------------------------

/**
 * Delete an attachment record AND the associated file from disk.
 *
 * Allowed:
 *  - Uploader (the person who uploaded the file)
 *  - ADMIN (can remove any attachment for moderation)
 *
 * Atomicity consideration: DB record is deleted first, then the file.
 * If file deletion fails, the DB record is still gone — the file becomes
 * orphaned but inaccessible (no URL in the DB). A background cleanup job
 * should periodically remove orphaned files.
 *
 * Alternative: Delete file first, then DB — if DB deletion fails, the file
 * is lost permanently. DB-first is safer for data integrity.
 */
export const deleteAttachment = async (
  issueId: string,
  attachmentId: string,
  organizationId: string,
  requesterId: string,
  requesterRole: string,
) => {
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, issueId },
    include: { issue: true },
  });

  if (!attachment) {
    throw new AppError("Attachment not found", 404);
  }

  if (attachment.issue.organizationId !== organizationId) {
    throw new AppError("Attachment not found", 404);
  }

  const isUploader = attachment.uploadedById === requesterId;
  const isAdmin = requesterRole === Role.ADMIN;

  if (!isUploader && !isAdmin) {
    throw new AppError("You can only delete your own attachments", 403);
  }

  // Step 1: Remove from DB (source of truth)
  await prisma.attachment.delete({ where: { id: attachmentId } });

  // Step 2: Remove from disk (best-effort)
  // Extract filename from URL and delete the physical file
  const filename = path.basename(attachment.url);
  safeDeleteFile(path.resolve("uploads", filename));
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Delete a file safely — does not throw if the file doesn't exist.
 * Used for cleanup after validation failures and on attachment deletion.
 */
function safeDeleteFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    // Log but don't throw — file cleanup failure should not fail the request
    console.error(`[attachment] Failed to delete file: ${filePath}`, err);
  }
}
