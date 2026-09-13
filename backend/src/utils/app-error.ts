/**
 * AppError — Operational Error
 *
 * Used to represent expected, operational errors (wrong password, not found,
 * forbidden, etc.) as opposed to programmer errors (null dereference, etc.).
 *
 * isOperational = true  → safe to return message to client
 * isOperational = false → internal bug, return generic 500 message only
 *
 * Usage in a service:
 *   throw new AppError("Category not found", 404);
 *
 * The centralized error handler in error.middleware.ts catches this and
 * returns the appropriate HTTP response without logging the full stack trace
 * for expected operational errors.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Restore prototype chain (required when extending built-ins in TypeScript)
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture stack trace excluding the constructor call itself
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
