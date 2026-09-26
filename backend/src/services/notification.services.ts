import { NotificationType, Role } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";

/**
 * Notification Service
 *
 * Notifications are created atomically inside the same Prisma transaction
 * as the triggering event. This guarantees:
 *   - No orphan notifications (if issue creation fails, no notifications fire)
 *   - No missing notifications (if notification insert fails, the whole op rolls back)
 *
 * Fan-out strategy (current): synchronous DB insert per recipient.
 * Production upgrade: Replace with a message queue (BullMQ/SQS) to fan out
 * to thousands of org members without blocking the HTTP response.
 *
 * Recipient rules:
 *   ISSUE_CREATED       → all MANAGER/ADMIN in the org
 *   ISSUE_ASSIGNED      → the assigned agent
 *   ISSUE_STATUS_CHANGED → issue creator + assigned agent (exclude actor)
 *   COMMENT_ADDED       → issue creator + assigned agent (exclude commenter)
 *   SLA_BREACH_WARNING  → assigned agent + all MANAGER/ADMIN in the org
 */

// ---------------------------------------------------------------------------
// INTERNAL HELPERS
// ---------------------------------------------------------------------------

/**
 * Build createMany-compatible notification data rows.
 * Used inside transactions — takes a `tx` Prisma client, not `prisma` directly.
 */
export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  issueId?: string;
}

/**
 * Get all manager/admin user IDs in an organization.
 * Used for broadcasting ISSUE_CREATED and SLA_BREACH_WARNING.
 */
export async function getManagerIds(
  organizationId: string,
  tx = prisma,
): Promise<string[]> {
  const managers = await tx.user.findMany({
    where: {
      organizationId,
      role: { in: [Role.MANAGER, Role.ADMIN] },
      isActive: true,
    },
    select: { id: true },
  });
  return managers.map((m) => m.id);
}

/**
 * Create multiple notification rows in a single createMany call.
 * Deduplicates recipients and filters out the actor (e.g., don't notify
 * someone about their own action).
 *
 * @param payloads     - Array of notification data
 * @param excludeUserId - Don't notify this user (the person who triggered the event)
 * @param tx           - Prisma transaction client
 */
export async function createNotifications(
  payloads: NotificationPayload[],
  excludeUserId: string,
  tx = prisma,
): Promise<void> {
  if (payloads.length === 0) return;

  // Deduplicate by userId and exclude the actor
  const seen = new Set<string>();
  const unique = payloads.filter((p) => {
    if (p.userId === excludeUserId) return false;
    if (seen.has(p.userId)) return false;
    seen.add(p.userId);
    return true;
  });

  if (unique.length === 0) return;

  await tx.notification.createMany({ data: unique });
}

// ---------------------------------------------------------------------------
// EVENT EMITTERS (called from issue/comment services inside transactions)
// ---------------------------------------------------------------------------

/**
 * Notify on issue creation → all managers/admins in the org.
 */
export async function notifyIssueCreated(
  {
    issueId,
    issueTitle,
    priority,
    organizationId,
    creatorId,
    creatorName,
  }: {
    issueId: string;
    issueTitle: string;
    priority: string;
    organizationId: string;
    creatorId: string;
    creatorName: string;
  },
  tx = prisma,
): Promise<void> {
  const managerIds = await getManagerIds(organizationId, tx);

  const payloads: NotificationPayload[] = managerIds.map((id) => ({
    userId: id,
    type: NotificationType.ISSUE_CREATED,
    title: "New Issue Created",
    message: `${creatorName} opened: "${issueTitle}" [${priority}]`,
    issueId,
  }));

  await createNotifications(payloads, creatorId, tx);
}

/**
 * Notify on assignment → the newly assigned agent.
 */
export async function notifyIssueAssigned(
  {
    issueId,
    issueTitle,
    agentId,
    assignerName,
  }: {
    issueId: string;
    issueTitle: string;
    agentId: string;
    assignerName: string;
  },
  actorId: string,
  tx = prisma,
): Promise<void> {
  await createNotifications(
    [
      {
        userId: agentId,
        type: NotificationType.ISSUE_ASSIGNED,
        title: "Issue Assigned to You",
        message: `${assignerName} assigned you to: "${issueTitle}"`,
        issueId,
      },
    ],
    actorId,
    tx,
  );
}

/**
 * Notify on status change → issue creator + assigned agent (not the actor).
 */
export async function notifyStatusChanged(
  {
    issueId,
    issueTitle,
    newStatus,
    actorName,
    creatorId,
    assignedToId,
  }: {
    issueId: string;
    issueTitle: string;
    newStatus: string;
    actorName: string;
    creatorId: string;
    assignedToId: string | null;
  },
  actorId: string,
  tx = prisma,
): Promise<void> {
  const recipients = [creatorId, ...(assignedToId ? [assignedToId] : [])];

  const payloads: NotificationPayload[] = recipients.map((id) => ({
    userId: id,
    type: NotificationType.ISSUE_STATUS_CHANGED,
    title: "Issue Status Updated",
    message: `${actorName} changed status of "${issueTitle}" to ${newStatus.replace("_", " ")}`,
    issueId,
  }));

  await createNotifications(payloads, actorId, tx);
}

/**
 * Notify on comment added → issue creator + assigned agent (not the commenter).
 */
export async function notifyCommentAdded(
  {
    issueId,
    issueTitle,
    commenterName,
    creatorId,
    assignedToId,
  }: {
    issueId: string;
    issueTitle: string;
    commenterName: string;
    creatorId: string;
    assignedToId: string | null;
  },
  commenterId: string,
  tx = prisma,
): Promise<void> {
  const recipients = [creatorId, ...(assignedToId ? [assignedToId] : [])];

  const payloads: NotificationPayload[] = recipients.map((id) => ({
    userId: id,
    type: NotificationType.COMMENT_ADDED,
    title: "New Comment",
    message: `${commenterName} commented on: "${issueTitle}"`,
    issueId,
  }));

  await createNotifications(payloads, commenterId, tx);
}

// ---------------------------------------------------------------------------
// READ-SIDE QUERIES (used by notification controller)
// ---------------------------------------------------------------------------

/**
 * Paginated list of notifications for a user, newest first.
 */
export async function getUserNotifications(
  userId: string,
  page: number,
  limit: number,
) {
  const skip = (page - 1) * limit;

  const [notifications, total] = await prisma.$transaction([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        issue: { select: { id: true, title: true } },
      },
    }),
    prisma.notification.count({ where: { userId } }),
  ]);

  return {
    notifications,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Count of unread notifications for a user.
 * Lightweight — used to power the bell badge on the frontend.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, isRead: false },
  });
}

/**
 * Mark a single notification as read.
 * Verifies ownership — users can only mark their own notifications.
 */
export async function markOneRead(
  notificationId: string,
  userId: string,
): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true, readAt: new Date() },
  });
}

/**
 * Mark all of a user's notifications as read.
 */
export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}
