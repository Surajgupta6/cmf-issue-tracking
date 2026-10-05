import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthPayload } from "../types/auth.types.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/app-error.js";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

if (!JWT_ACCESS_SECRET) {
  throw new Error("JWT_ACCESS_SECRET is not defined in environment variables");
}

/**
 * authenticate — JWT Authentication Middleware
 *
 * Verifies the Bearer token in the Authorization header and attaches the
 * decoded payload to req.user.
 *
 * Two-step verification:
 *
 * Step 1 — Cryptographic: Verify JWT signature and expiry.
 *   Fast (no DB), catches expired and tampered tokens.
 *
 * Step 2 — isActive check: Query DB to verify the account is still active.
 *   Slightly slower (1 DB read), but ensures deactivated users are rejected
 *   immediately — even if their access token hasn't expired yet.
 *
 * Trade-off: The isActive DB lookup makes authentication stateful.
 * This is a deliberate choice: the alternative (relying on JWT expiry alone)
 * would leave deactivated users with up to 15 minutes of residual access.
 * The 1 DB read per request is acceptable given the security benefit.
 *
 * Errors are passed to next() so the centralized error handler sends
 * a consistent JSON response.
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(new AppError("Authorization header is missing", 401));
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    return next(
      new AppError(
        "Invalid authorization format. Expected: Bearer <token>",
        401,
      ),
    );
  }

  const token = parts[1];

  let decoded: AuthPayload;
  try {
    decoded = jwt.verify(token, JWT_ACCESS_SECRET!) as AuthPayload;
  } catch {
    return next(new AppError("Invalid or expired access token", 401));
  }

  // Step 2: Check isActive — reject deactivated accounts immediately
  // This is the key mechanism that allows admins to revoke access without
  // waiting for the access token to expire naturally
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { isActive: true },
  });

  if (!user || !user.isActive) {
    return next(
      new AppError("Your account has been deactivated. Contact your admin.", 403),
    );
  }

  req.user = decoded;
  next();
};
