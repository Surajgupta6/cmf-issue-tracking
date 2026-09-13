import bcrypt from "bcrypt";
import { prisma } from "../config/prisma.js";
import { generateAccessToken } from "../utils/jwt.js";
import {
  generateRefreshToken,
  hashRefreshToken,
} from "../utils/refresh-token.js";
import { AppError } from "../utils/app-error.js";

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  organizationName: string;
}

/**
 * Register a new user and their organization.
 *
 * Design decisions:
 * - The role is HARDCODED to CUSTOMER here. The client cannot supply a role.
 *   Admin/Manager roles must be granted by an existing Admin after registration.
 *   This prevents privilege escalation through the public registration endpoint.
 * - Organization + User are created in a single transaction. If either fails,
 *   both are rolled back — no orphaned organizations.
 * - No tokens are returned on registration. The client must explicitly call
 *   /login afterward. This keeps the registration flow simple and auditable.
 */
export const registerUser = async (input: RegisterInput) => {
  const { name, email, password, organizationName } = input;

  // Check email uniqueness BEFORE hashing (saves bcrypt cost on duplicate)
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    // Use a generic message to avoid confirming whether an email is registered
    throw new AppError("User with this email already exists", 409);
  }

  // bcrypt cost factor 12 = 2^12 = 4096 iterations
  const passwordHash = await bcrypt.hash(password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: organizationName },
    });

    const user = await tx.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: "CUSTOMER", // Never accept role from client
        organizationId: organization.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organizationId: true,
        createdAt: true,
      },
    });

    return { user, organization };
  });

  return result;
};

/**
 * Authenticate a user with email + password.
 *
 * Security: Both "user not found" and "wrong password" return the same error
 * message ("Invalid email or password"). This prevents user enumeration —
 * an attacker cannot determine whether an email address is registered.
 */
export const loginUser = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email } });

  // Generic error for both "not found" and "wrong password"
  const INVALID_CREDENTIALS = new AppError("Invalid email or password", 401);

  if (!user) {
    throw INVALID_CREDENTIALS;
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    throw INVALID_CREDENTIALS;
  }

  const accessToken = generateAccessToken({
    userId: user.id,
    role: user.role,
    organizationId: user.organizationId,
  });

  // Opaque refresh token: 64 random bytes (512 bits of entropy)
  // Only the SHA-256 hash is stored — the raw token is given to the client
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);

  await prisma.refreshToken.create({
    data: {
      tokenHash: refreshTokenHash,
      userId: user.id,
      // 7-day expiry
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    },
    accessToken,
    refreshToken, // Raw token sent to client; hash stored in DB
  };
};

/**
 * Rotate a refresh token.
 *
 * Rotation pattern:
 * 1. Hash the incoming token
 * 2. Find and validate the stored record
 * 3. Revoke the OLD token (set revokedAt)
 * 4. Issue a NEW refresh token + new access token
 *
 * Why this matters: If a token is stolen and used by an attacker, the
 * legitimate user's next refresh will see the token already revoked,
 * signaling a possible theft. We can then revoke all tokens for the user.
 *
 * The new refresh token is returned so the client can update its storage.
 */
export const refreshAccessToken = async (refreshToken: string) => {
  const tokenHash = hashRefreshToken(refreshToken);

  const storedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!storedToken) {
    throw new AppError("Invalid refresh token", 401);
  }

  if (storedToken.revokedAt) {
    // Token was already used or explicitly revoked — potential theft signal
    // In a production system, we might revoke ALL tokens for this user here
    throw new AppError("Refresh token has been revoked", 401);
  }

  if (storedToken.expiresAt < new Date()) {
    throw new AppError("Refresh token has expired", 401);
  }

  // ROTATION: Revoke the old token before issuing the new one
  // Using a transaction ensures atomicity: if new token creation fails,
  // the revocation is rolled back so the user is not locked out
  const { newAccessToken, newRefreshToken } = await prisma.$transaction(
    async (tx) => {
      // Step 1: Revoke old token
      await tx.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });

      // Step 2: Issue new refresh token
      const freshRefreshToken = generateRefreshToken();
      const freshRefreshTokenHash = hashRefreshToken(freshRefreshToken);

      await tx.refreshToken.create({
        data: {
          tokenHash: freshRefreshTokenHash,
          userId: storedToken.user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Step 3: Issue new access token
      const freshAccessToken = generateAccessToken({
        userId: storedToken.user.id,
        role: storedToken.user.role,
        organizationId: storedToken.user.organizationId,
      });

      return {
        newAccessToken: freshAccessToken,
        newRefreshToken: freshRefreshToken,
      };
    },
  );

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken, // Client MUST replace the old token with this
  };
};

/**
 * Revoke a refresh token on logout.
 *
 * Idempotent: if the token is not found (already revoked or never existed),
 * we still return success. This prevents information leakage about whether
 * a particular token exists.
 */
export const logoutUser = async (refreshToken: string) => {
  const tokenHash = hashRefreshToken(refreshToken);

  const storedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!storedToken) {
    // Already revoked or never existed — idempotent, no error
    return;
  }

  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revokedAt: new Date() },
  });
};