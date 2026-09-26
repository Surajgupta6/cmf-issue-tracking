import { Role } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/app-error.js";
import { notifyCommentAdded } from "./notification.services.js";

/**
 * Comment Service
 *
 * Comments are threaded under issues.
 * Organization isolation: all operations verify issueId → organizationId chain.
 *
 * Ownership rules:
 *  - Any authenticated org member can ADD a comment to any issue they can see
 *  - Only the AUTHOR can EDIT their comment
 *  - The AUTHOR or an ADMIN can DELETE a comment (admins moderate)
 *
 * Visibility: Comments inherit the visibility of their parent issue.
 * Customers can comment on their own issues; agents/managers on any org issue.
 */

const SAFE_USER = {
  select: { id: true, name: true, email: true, role: true },
};

// ---------------------------------------------------------------------------
// CREATE COMMENT
// ---------------------------------------------------------------------------

/**
 * Add a comment to an issue.
 *
 * Guards:
 *  1. Issue must exist in the org
 *  2. CUSTOMER can only comment on their own issues
 *  3. Issue must not be CLOSED (no comments on closed issues)
 *
 * Side effect (planned Phase 9): Notify the issue creator and assigned agent.
 */
export const createComment = async (
  issueId: string,
  organizationId: string,
  authorId: string,
  authorRole: string,
  content: string,
) => {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, organizationId },
  });

  if (!issue) {
    throw new AppError("Issue not found", 404);
  }

  // Customers can only comment on their own issues
  if (authorRole === Role.CUSTOMER && issue.createdById !== authorId) {
    throw new AppError(
      "You can only comment on issues you created",
      403,
    );
  }

  // Prevent commenting on closed issues
  if (issue.status === "CLOSED") {
    throw new AppError(
      "Cannot add comments to a closed issue. Reopen the issue first.",
      400,
    );
  }

  return prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: { content, issueId, userId: authorId },
      include: { user: SAFE_USER },
    });

    // Notify issue creator + assigned agent about the new comment
    await notifyCommentAdded(
      {
        issueId,
        issueTitle: issue.title,
        commenterName: comment.user.name,
        creatorId: issue.createdById,
        assignedToId: issue.assignedToId,
      },
      authorId,
      tx,
    );

    return comment;
  });
};

// ---------------------------------------------------------------------------
// LIST COMMENTS
// ---------------------------------------------------------------------------

/**
 * Get all comments for an issue, ordered chronologically (oldest first).
 *
 * Guards:
 *  - Issue must exist in org
 *  - CUSTOMER can only see comments on their own issues
 *
 * Pagination: offset-based (page, limit). Comments are paginated to handle
 * issues with very large comment threads.
 */
export const listComments = async (
  issueId: string,
  organizationId: string,
  requesterId: string,
  requesterRole: string,
  page: number,
  limit: number,
) => {
  const where: Record<string, unknown> = { id: issueId, organizationId };
  if (requesterRole === Role.CUSTOMER) {
    where["createdById"] = requesterId;
  }

  const issue = await prisma.issue.findFirst({ where });
  if (!issue) {
    throw new AppError("Issue not found", 404);
  }

  const skip = (page - 1) * limit;

  const [comments, total] = await prisma.$transaction([
    prisma.comment.findMany({
      where: { issueId },
      include: { user: SAFE_USER },
      orderBy: { createdAt: "asc" }, // Oldest first — chronological thread
      skip,
      take: limit,
    }),
    prisma.comment.count({ where: { issueId } }),
  ]);

  return {
    comments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ---------------------------------------------------------------------------
// UPDATE COMMENT
// ---------------------------------------------------------------------------

/**
 * Edit a comment's content. Author-only.
 *
 * Design: We preserve the original content by storing both.
 * Currently we overwrite — a future enhancement is to add an `editedAt`
 * timestamp to indicate the comment was modified (transparency for users).
 *
 * Guard: Cannot edit a comment on a closed issue.
 */
export const updateComment = async (
  issueId: string,
  commentId: string,
  organizationId: string,
  requesterId: string,
  content: string,
) => {
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, issueId },
    include: { issue: true },
  });

  if (!comment) {
    throw new AppError("Comment not found", 404);
  }

  // Verify issue belongs to org (IDOR prevention)
  if (comment.issue.organizationId !== organizationId) {
    throw new AppError("Comment not found", 404);
  }

  // Ownership check — only author can edit
  if (comment.userId !== requesterId) {
    throw new AppError("You can only edit your own comments", 403);
  }

  // No edits on closed issues
  if (comment.issue.status === "CLOSED") {
    throw new AppError("Cannot edit comments on a closed issue", 400);
  }

  return prisma.comment.update({
    where: { id: commentId },
    data: { content },
    include: { user: SAFE_USER },
  });
};

// ---------------------------------------------------------------------------
// DELETE COMMENT
// ---------------------------------------------------------------------------

/**
 * Delete a comment.
 *
 * Allowed:
 *  - Comment author (own comment)
 *  - ADMIN (moderation — can delete any comment in the org)
 *
 * Hard delete: Comment is permanently removed.
 * For an audit trail on deleted comments, a soft-delete (deletedAt timestamp)
 * could be used in a stricter compliance scenario.
 */
export const deleteComment = async (
  issueId: string,
  commentId: string,
  organizationId: string,
  requesterId: string,
  requesterRole: string,
) => {
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, issueId },
    include: { issue: true },
  });

  if (!comment) {
    throw new AppError("Comment not found", 404);
  }

  if (comment.issue.organizationId !== organizationId) {
    throw new AppError("Comment not found", 404);
  }

  const isAuthor = comment.userId === requesterId;
  const isAdmin = requesterRole === Role.ADMIN;

  if (!isAuthor && !isAdmin) {
    throw new AppError(
      "You can only delete your own comments (or be an admin)",
      403,
    );
  }

  await prisma.comment.delete({ where: { id: commentId } });
};
