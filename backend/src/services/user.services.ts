import { Role } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/app-error.js";

/**
 * User Service
 *
 * All operations are scoped to organizationId — preventing cross-org access.
 *
 * Safe select: The passwordHash is NEVER included in any response from this
 * service. We use explicit `select` to ensure this is enforced at the query
 * level, not just at the serialization layer.
 */

/** Columns returned safely for any user-facing response */
const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface ListUsersOptions {
  organizationId: string;
  role: Role | undefined;
  isActive: boolean | undefined;
  search: string | undefined;
  page: number;
  limit: number;
}

/**
 * List users in the organization with optional filtering and pagination.
 *
 * Filtering:
 *  - role: filter by specific role
 *  - isActive: filter by active/inactive status
 *  - search: case-insensitive partial match on name or email
 *
 * Pagination: offset-based (page, limit).
 * Returns both data and total count for frontend to calculate page count.
 *
 * Performance: Two queries — one for count, one for data.
 * This is the standard pattern for offset pagination.
 * In the future, a single query using SQL window functions could replace this.
 */
export const listUsers = async (options: ListUsersOptions) => {
  const { organizationId, role, isActive, search, page, limit } = options;
  const skip = (page - 1) * limit;

  const where = {
    organizationId,
    ...(role !== undefined && { role }),
    ...(isActive !== undefined && { isActive }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: SAFE_USER_SELECT,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get a single user by ID, scoped to the organization.
 *
 * Returns null if the user does not exist OR belongs to a different org.
 * Controller converts null to 404.
 */
export const getUserById = async (userId: string, organizationId: string) => {
  return prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: SAFE_USER_SELECT,
  });
};

/**
 * Update a user's role.
 *
 * Guard: Admin cannot demote themselves — this prevents accidental lockout
 * where the last admin removes their own admin privileges.
 *
 * Guard: Cannot change role of a user in a different organization (IDOR).
 */
export const updateUserRole = async (
  requesterId: string,
  targetUserId: string,
  organizationId: string,
  newRole: Role,
) => {
  // Prevent self-role-change — accidental self-demotion from ADMIN causes lockout
  if (requesterId === targetUserId) {
    throw new AppError(
      "You cannot change your own role. Ask another admin to make this change.",
      403,
    );
  }

  const targetUser = await prisma.user.findFirst({
    where: { id: targetUserId, organizationId },
  });

  if (!targetUser) {
    throw new AppError("User not found", 404);
  }

  return prisma.user.update({
    where: { id: targetUserId },
    data: { role: newRole },
    select: SAFE_USER_SELECT,
  });
};

/**
 * Activate or deactivate a user account.
 *
 * Design: Soft disable — the user record is preserved with all its history,
 * comments, and issue assignments. Only login/API access is revoked.
 * When isActive = false, the authenticate middleware rejects their tokens.
 *
 * Guard: Admin cannot deactivate themselves — prevents lockout.
 * Guard: Org isolation — target user must belong to same org.
 *
 * Side effect (planned): All existing refresh tokens for the user should also
 * be revoked when isActive = false to immediately terminate all active sessions.
 */
export const updateUserStatus = async (
  requesterId: string,
  targetUserId: string,
  organizationId: string,
  isActive: boolean,
) => {
  if (requesterId === targetUserId) {
    throw new AppError("You cannot deactivate your own account.", 403);
  }

  const targetUser = await prisma.user.findFirst({
    where: { id: targetUserId, organizationId },
  });

  if (!targetUser) {
    throw new AppError("User not found", 404);
  }

  // Atomically: update user status AND revoke all existing refresh tokens
  // This ensures the user is immediately logged out on all devices
  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id: targetUserId },
      data: { isActive },
      select: SAFE_USER_SELECT,
    }),
    // Revoke all active refresh tokens when deactivating
    // (no-op when re-activating: tokens are already expired or revoked)
    ...(isActive === false
      ? [
          prisma.refreshToken.updateMany({
            where: {
              userId: targetUserId,
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          }),
        ]
      : []),
  ]);

  return updatedUser;
};
