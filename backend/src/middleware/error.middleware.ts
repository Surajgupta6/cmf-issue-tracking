import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/app-error.js";

/**
 * Centralized Error Handler Middleware
 *
 * This is the SINGLE place that converts errors into HTTP responses.
 * All controllers/services should throw errors rather than catching and
 * formatting them locally.
 *
 * Handled error types:
 *  - AppError            → operational error, return its statusCode + message
 *  - ZodError            → validation failure, return 422 with field details
 *  - Prisma P2002        → unique constraint violation → 409 Conflict
 *  - Prisma P2025        → record not found → 404
 *  - Unknown errors      → 500 Internal Server Error (never leaks details)
 *
 * Security: stack traces and internal error details are NEVER sent to clients.
 * They are only logged server-side.
 */
export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) => {
  // 1. Operational AppError — safe to expose message to client
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: "error",
      message: err.message,
    });
  }

  // 2. Zod validation error — expose field-level errors to client
  if (err instanceof ZodError) {
    return res.status(422).json({
      status: "error",
      message: "Validation failed",
      errors: err.issues.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
  }

  // 3. Prisma known error codes
  if (isPrismaError(err)) {
    if (err.code === "P2002") {
      // Unique constraint violation
      return res.status(409).json({
        status: "error",
        message: "A record with this value already exists",
      });
    }

    if (err.code === "P2025") {
      // Record not found (e.g. on update/delete of non-existent record)
      return res.status(404).json({
        status: "error",
        message: "Record not found",
      });
    }
  }

  // 4. Unknown / programmer error — log fully, return generic message
  console.error("[UNHANDLED ERROR]", err);
  return res.status(500).json({
    status: "error",
    message: "Internal Server Error",
  });
};

/**
 * Type guard for Prisma client errors.
 * Prisma errors have a `code` property starting with "P".
 */
function isPrismaError(err: unknown): err is { code: string; message: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as Record<string, unknown>)["code"] === "string"
  );
}