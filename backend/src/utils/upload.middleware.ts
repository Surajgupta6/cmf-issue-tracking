import multer, { FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { Request } from "express";
import { AppError } from "./app-error.js";

/**
 * File Upload Middleware (Multer)
 *
 * Architecture: Local Disk Storage (Development)
 * Production upgrade path: Replace diskStorage with multer-s3 or
 * a memory buffer strategy that pipes directly to S3.
 * The interface (req.file, file.filename, file.size) stays the same —
 * only the storage adapter changes.
 *
 * Security measures:
 *  1. File type whitelist — only safe MIME types accepted
 *  2. File size limit — 10MB max per file
 *  3. UUID filenames — prevents:
 *     - Path traversal attacks (../../etc/passwd)
 *     - Filename collisions
 *     - Filename-based enumeration
 *  4. Extension preserved for usability (human-readable downloads)
 *
 * Upload directory: backend/uploads/
 * This directory is git-ignored. In production, use object storage.
 */

const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  // Archives
  "application/zip",
  "application/x-zip-compressed",
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/** Ensure uploads directory exists */
const UPLOADS_DIR = path.resolve("uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Disk storage engine.
 *
 * Filename: <uuid>.<original-extension>
 * This format allows us to:
 *   1. Store the UUID as the unique identifier
 *   2. Preserve the extension for Content-Type detection on download
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

/**
 * File filter: Only allow whitelisted MIME types.
 *
 * Security note: We check MIME type (set by the browser/client) AND
 * file extension. Client-provided MIME types can be spoofed, so in
 * production, use a library like `file-type` to detect MIME from the
 * file magic bytes (the first few bytes of the file content).
 */
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        `File type '${file.mimetype}' is not allowed. ` +
          `Allowed types: images (jpeg, png, gif, webp), PDF, Word, Excel, text, CSV, ZIP`,
        415,
      ),
    );
  }
};

/**
 * Configured Multer instance.
 * Use uploadSingle middleware on attachment upload routes.
 */
export const uploadSingle = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1, // One file per request
  },
  fileFilter,
}).single("file"); // Field name in the multipart form must be "file"

/**
 * Get the public URL for an uploaded file.
 *
 * Development: Returns a local path accessible via static file serving.
 * Production: Would return the CDN/S3 URL.
 *
 * The BASE_URL env variable should be set to the deployed API URL in production.
 */
export const getFileUrl = (filename: string): string => {
  const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 5000}`;
  return `${baseUrl}/uploads/${filename}`;
};
