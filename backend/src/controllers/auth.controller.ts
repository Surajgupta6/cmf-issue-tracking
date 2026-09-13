import { Request, Response } from "express";
import { registerSchema, loginSchema } from "../validators/auth.validator.js";
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
} from "../services/auth.services.js";
import { AppError } from "../utils/app-error.js";

/**
 * Auth Controller
 *
 * Responsibilities (ONLY):
 *  - Parse and validate request body/params
 *  - Call the appropriate auth service function
 *  - Return the HTTP response
 *
 * Error handling: All errors (AppError, ZodError, Prisma errors) are thrown
 * and caught by the centralized errorHandler middleware in error.middleware.ts.
 * Express 5 automatically propagates async errors to the error handler.
 *
 * We do NOT format errors here. The error handler is the single source of truth
 * for error response formatting.
 */

export const register = async (req: Request, res: Response) => {
  // Zod throws ZodError on validation failure → caught by error handler → 422
  const validatedData = registerSchema.parse(req.body);
  const result = await registerUser(validatedData);

  res.status(201).json({
    status: "success",
    message: "Registration successful. Please log in.",
    data: result,
  });
};

export const login = async (req: Request, res: Response) => {
  const validatedData = loginSchema.parse(req.body);
  const result = await loginUser(validatedData.email, validatedData.password);

  res.status(200).json({
    status: "success",
    message: "Login successful",
    data: result,
  });
};

export const getMe = (req: Request, res: Response) => {
  // req.user is guaranteed by authenticate middleware before this runs
  res.status(200).json({
    status: "success",
    data: { user: req.user },
  });
};

export const refresh = async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken || typeof refreshToken !== "string") {
    throw new AppError("Refresh token is required", 400);
  }

  const result = await refreshAccessToken(refreshToken);

  res.status(200).json({
    status: "success",
    data: result, // { accessToken, refreshToken } — client MUST store new refreshToken
  });
};

export const logout = async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken || typeof refreshToken !== "string") {
    throw new AppError("Refresh token is required", 400);
  }

  await logoutUser(refreshToken);

  res.status(200).json({
    status: "success",
    message: "Logged out successfully",
  });
};

/**
 * Admin-only test endpoint — kept for development/debugging.
 * Should be removed before production.
 */
export const adminTest = (req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    message: "Welcome Admin",
    data: { user: req.user },
  });
};