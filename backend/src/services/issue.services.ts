import { Priority, IssueStatus, Role } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/app-error.js";
import { calculateSlaDeadlines } from "../utils/sla-policy.js";
import { validateTransition } from "../utils/issue-state-machine.js";
import {
  notifyIssueCreated,
  notifyStatusChanged,
  notifyIssueAssigned,
} from "./notification.services.js";

/**
 * Issue Service
 *
 * All operations are scoped to organizationId.
 * Every mutating operation creates an IssueHistory record atomically.
 *
 * Key design decisions:
 * 1. SLA is created atomically with the issue (single transaction).
 * 2. Status transitions go through the state machine — no direct status updates.
 * 3. Every field change is recorded in IssueHistory for full audit trail.
 * 4. Role-based visibility is enforced at the service layer (not just route level).
 * 5. passwordHash is never included in any response (explicit select).
 */

/** Safe user fields to include in issue responses */
const SAFE_USER = {
  select: { id: true, name: true, email: true, role: true },
};

/** Standard issue include for detail views */
const ISSUE_INCLUDE = {
  category: { select: { id: true, name: true } },
  createdBy: SAFE_USER,
  assignedTo: { select: { id: true, name: true, email: true, role: true } },
  sla: {
    select: {
      responseDeadline: true,
      resolutionDeadline: true,
      responseBreached: true,
      resolutionBreached: true,
    },
  },
} as const;

/** Minimal issue fields for list views (performance-optimized) */
const ISSUE_LIST_SELECT = {
  id: true,
  title: true,
  status: true,
  priority: true,
  organizationId: true,
  categoryId: true,
  createdById: true,
  assignedToId: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  createdBy: SAFE_USER,
  assignedTo: { select: { id: true, name: true, email: true, role: true } },
  sla: {
    select: {
      responseDeadline: true,
      resolutionDeadline: true,
      responseBreached: true,
      resolutionBreached: true,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// CREATE ISSUE
// ---------------------------------------------------------------------------

interface CreateIssueInput {
  title: string;
  description: string;
  priority: Priority;
  categoryId: string;
  organizationId: string;
  createdById: string;
}

/**
 * Create a new issue with automatically computed SLA deadlines.
 *
 * Transaction wraps:
 *   1. Category existence check (within org — IDOR prevention)
 *   2. Issue creation
 *   3. SLA record creation (derived from priority)
 *   4. IssueHistory record (initial creation event)
 *
 * Why transaction? If SLA creation fails after the issue is created, we'd have
 * an issue without an SLA record — the breach detection job would skip it.
 * Atomicity guarantees every issue always has a corresponding SLA record.
 */
export const createIssue = async (input: CreateIssueInput) => {
  const { title, description, priority, categoryId, organizationId, createdById } = input;

  // Validate category belongs to this org
  const category = await prisma.category.findFirst({
    where: { id: categoryId, organizationId },
  });

  if (!category) {
    throw new AppError("Category not found in your organization", 404);
  }

  const now = new Date();
  const { responseDeadline, resolutionDeadline } = calculateSlaDeadlines(priority, now);

  const issue = await prisma.$transaction(async (tx) => {
    // Step 1: Create the issue
    const newIssue = await tx.issue.create({
      data: {
        title,
        description,
        priority,
        status: IssueStatus.OPEN,
        organizationId,
        categoryId,
        createdById,
      },
      include: ISSUE_INCLUDE,
    });

    // Step 2: Create SLA record
    await tx.sLA.create({
      data: {
        issueId: newIssue.id,
        responseDeadline,
        resolutionDeadline,
      },
    });

    // Step 3: Record creation in history (start of audit trail)
    await tx.issueHistory.create({
      data: {
        issueId: newIssue.id,
        changedById: createdById,
        field: "status",
        oldValue: null,
        newValue: IssueStatus.OPEN,
      },
    });

    // Step 4: Notify all managers/admins in the org about the new issue
    const creator = await tx.user.findUnique({
      where: { id: createdById },
      select: { name: true },
    });
    await notifyIssueCreated(
      {
        issueId: newIssue.id,
        issueTitle: title,
        priority,
        organizationId,
        creatorId: createdById,
        creatorName: creator?.name ?? "Someone",
      },
      tx,
    );

    return newIssue;
  });

  // Fetch again with fresh SLA data included
  return prisma.issue.findUnique({
    where: { id: issue.id },
    include: ISSUE_INCLUDE,
  });
};

// ---------------------------------------------------------------------------
// LIST ISSUES
// ---------------------------------------------------------------------------

interface ListIssuesOptions {
  organizationId: string;
  requesterId: string;
  requesterRole: string;
  status: IssueStatus | undefined;
  priority: Priority | undefined;
  categoryId: string | undefined;
  assignedToId: string | undefined;
  search: string | undefined;
  sortBy: string;
  sortOrder: "asc" | "desc";
  page: number;
  limit: number;
}

/**
 * List issues with role-based visibility filtering.
 *
 * Visibility rules:
 *   CUSTOMER  → only their own issues (createdById = requesterId)
 *   AGENT     → all org issues (can be filtered by assignedToId)
 *   MANAGER   → all org issues
 *   ADMIN     → all org issues
 *
 * Additional filters are additive (AND conditions).
 *
 * Performance: Uses $transaction for atomic count + data query.
 * Indexes on (organizationId, status) and (organizationId, createdById)
 * will be added in Phase 10 (pagination and performance hardening).
 */
export const listIssues = async (options: ListIssuesOptions) => {
  const {
    organizationId, requesterId, requesterRole,
    status, priority, categoryId, assignedToId,
    search, sortBy, sortOrder, page, limit,
  } = options;

  const skip = (page - 1) * limit;

  // Base filter: always scoped to organization
  const where: Record<string, unknown> = { organizationId };

  // Role-based visibility
  if (requesterRole === Role.CUSTOMER) {
    // Customers can only see their own issues
    where["createdById"] = requesterId;
  }

  // Optional filters
  if (status) where["status"] = status;
  if (priority) where["priority"] = priority;
  if (categoryId) where["categoryId"] = categoryId;
  if (assignedToId) where["assignedToId"] = assignedToId;
  if (search) {
    where["OR"] = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy: Record<string, string> = { [sortBy]: sortOrder };

  const [issues, total] = await prisma.$transaction([
    prisma.issue.findMany({
      where,
      select: ISSUE_LIST_SELECT,
      orderBy,
      skip,
      take: limit,
    }),
    prisma.issue.count({ where }),
  ]);

  return {
    issues,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ---------------------------------------------------------------------------
// GET ISSUE BY ID
// ---------------------------------------------------------------------------

/**
 * Get a single issue by ID with full detail.
 *
 * Role-based access:
 *   CUSTOMER  → can only view their own issues
 *   AGENT/MANAGER/ADMIN → can view any org issue
 *
 * Returns null if not found (controller converts to 404).
 */
export const getIssueById = async (
  issueId: string,
  organizationId: string,
  requesterId: string,
  requesterRole: string,
) => {
  const where: Record<string, unknown> = { id: issueId, organizationId };

  // Customers can only access their own issues
  if (requesterRole === Role.CUSTOMER) {
    where["createdById"] = requesterId;
  }

  return prisma.issue.findFirst({
    where,
    include: {
      ...ISSUE_INCLUDE,
      history: {
        orderBy: { createdAt: "desc" },
        take: 10,  // Most recent 10 history entries for the detail view
        include: {
          changedBy: SAFE_USER,
        },
      },
    },
  });
};

// ---------------------------------------------------------------------------
// UPDATE ISSUE FIELDS
// ---------------------------------------------------------------------------

interface UpdateIssueInput {
  title: string | undefined;
  description: string | undefined;
  priority: Priority | undefined;
  categoryId: string | undefined;
}

/**
 * Update issue metadata (title, description, priority, category).
 *
 * Status and assignedTo are intentionally NOT updatable here.
 * Use updateIssueStatus() and assignIssue() for those.
 *
 * Every changed field is recorded in IssueHistory within the same transaction.
 * This provides a complete audit trail of what changed, when, and by whom.
 *
 * Priority change special case: if priority changes, we should ideally
 * recalculate SLA deadlines. For now we preserve existing SLA (original
 * commitment to customer). This is documented as a known limitation.
 */
export const updateIssue = async (
  issueId: string,
  organizationId: string,
  requesterId: string,
  requesterRole: string,
  updates: UpdateIssueInput,
) => {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, organizationId },
  });

  if (!issue) {
    throw new AppError("Issue not found", 404);
  }

  // Customers can only edit their own issues
  if (requesterRole === Role.CUSTOMER && issue.createdById !== requesterId) {
    throw new AppError("You can only edit issues you created", 403);
  }

  // Validate new categoryId if provided
  if (updates.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: updates.categoryId, organizationId },
    });
    if (!category) {
      throw new AppError("Category not found in your organization", 404);
    }
  }

  // Build history records for every changed field
  const historyRecords: Array<{
    issueId: string;
    changedById: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }> = [];

  const trackChange = (
    field: string,
    oldVal: string | null | undefined,
    newVal: string | null | undefined,
  ) => {
    if (newVal !== undefined && String(newVal) !== String(oldVal)) {
      historyRecords.push({
        issueId,
        changedById: requesterId,
        field,
        oldValue: oldVal ?? null,
        newValue: newVal ?? null,
      });
    }
  };

  trackChange("title", issue.title, updates.title);
  trackChange("description", issue.description, updates.description);
  trackChange("priority", issue.priority, updates.priority);
  trackChange("categoryId", issue.categoryId, updates.categoryId);

  if (historyRecords.length === 0) {
    // Nothing actually changed — return current issue without DB writes
    return prisma.issue.findUnique({
      where: { id: issueId },
      include: ISSUE_INCLUDE,
    });
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.issue.update({
      where: { id: issueId },
      data: {
        ...(updates.title && { title: updates.title }),
        ...(updates.description && { description: updates.description }),
        ...(updates.priority && { priority: updates.priority }),
        ...(updates.categoryId && { categoryId: updates.categoryId }),
      },
      include: ISSUE_INCLUDE,
    });

    // Create all history records in one createMany call (efficient)
    await tx.issueHistory.createMany({ data: historyRecords });

    return updated;
  });
};

// ---------------------------------------------------------------------------
// UPDATE STATUS (STATE MACHINE)
// ---------------------------------------------------------------------------

/**
 * Transition an issue's status through the state machine.
 *
 * Two-layer validation:
 *   1. validateTransition() — is this a valid transition for this role?
 *   2. AGENT guard — if AGENT, they must be the assigned agent
 *
 * Atomically:
 *   - Updates issue status
 *   - Creates IssueHistory record
 *   (Future: Creates Notification records — Phase 9)
 */
export const updateIssueStatus = async (
  issueId: string,
  organizationId: string,
  requesterId: string,
  requesterRole: string,
  newStatus: IssueStatus,
) => {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, organizationId },
  });

  if (!issue) {
    throw new AppError("Issue not found", 404);
  }

  // State machine validation
  validateTransition(issue.status, newStatus, requesterRole as Role);

  // AGENT guard: agents can only transition issues assigned to them
  if (requesterRole === Role.AGENT && issue.assignedToId !== requesterId) {
    throw new AppError(
      "As an agent, you can only update the status of issues assigned to you",
      403,
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.issue.update({
      where: { id: issueId },
      data: {
        status: newStatus,
        // Record when the issue was resolved — used for avg resolution time analytics
        ...(newStatus === IssueStatus.RESOLVED && { resolvedAt: new Date() }),
        // Clear resolvedAt if reopened (issue is no longer resolved)
        ...(newStatus === IssueStatus.REOPENED && { resolvedAt: null }),
      },
      include: ISSUE_INCLUDE,
    });

    await tx.issueHistory.create({
      data: {
        issueId,
        changedById: requesterId,
        field: "status",
        oldValue: issue.status,
        newValue: newStatus,
      },
    });

    // Notify issue creator + assigned agent about status change
    const actor = await tx.user.findUnique({
      where: { id: requesterId },
      select: { name: true },
    });
    await notifyStatusChanged(
      {
        issueId,
        issueTitle: issue.title,
        newStatus,
        actorName: actor?.name ?? "Someone",
        creatorId: issue.createdById,
        assignedToId: issue.assignedToId,
      },
      requesterId,
      tx,
    );

    return updated;
  });
};

// ---------------------------------------------------------------------------
// ASSIGN ISSUE
// ---------------------------------------------------------------------------

/**
 * Assign an issue to an agent.
 *
 * Guards:
 *   1. Issue must exist in the org
 *   2. Target agent must exist in the org and have role AGENT
 *   3. Issue must be in OPEN or ASSIGNED status (cannot assign a resolved issue)
 *
 * Atomically:
 *   - Updates assignedToId and status → ASSIGNED
 *   - Creates IssueHistory for the assignment
 *   (Future Phase 9: Creates Notification for the assigned agent)
 */
export const assignIssue = async (
  issueId: string,
  organizationId: string,
  requesterId: string,
  agentId: string,
) => {
  const [issue, agent] = await Promise.all([
    prisma.issue.findFirst({ where: { id: issueId, organizationId } }),
    prisma.user.findFirst({
      where: { id: agentId, organizationId, role: Role.AGENT },
    }),
  ]);

  if (!issue) {
    throw new AppError("Issue not found", 404);
  }

  if (!agent) {
    throw new AppError(
      "Agent not found. The user must exist in your organization and have role AGENT",
      404,
    );
  }

  // Guard: Don't assign a closed or resolved issue
  if (
    issue.status === IssueStatus.CLOSED ||
    issue.status === IssueStatus.RESOLVED
  ) {
    throw new AppError(
      `Cannot assign an issue that is ${issue.status}. Reopen it first.`,
      400,
    );
  }

  const previousAssignee = issue.assignedToId;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.issue.update({
      where: { id: issueId },
      data: {
        assignedToId: agentId,
        status: IssueStatus.ASSIGNED,
      },
      include: ISSUE_INCLUDE,
    });

    // Record assignment change
    await tx.issueHistory.createMany({
      data: [
        {
          issueId,
          changedById: requesterId,
          field: "assignedToId",
          oldValue: previousAssignee ?? null,
          newValue: agentId,
        },
        {
          issueId,
          changedById: requesterId,
          field: "status",
          oldValue: issue.status,
          newValue: IssueStatus.ASSIGNED,
        },
      ],
    });

    // Notify the assigned agent
    const assigner = await tx.user.findUnique({
      where: { id: requesterId },
      select: { name: true },
    });
    await notifyIssueAssigned(
      {
        issueId,
        issueTitle: issue.title,
        agentId,
        assignerName: assigner?.name ?? "Someone",
      },
      requesterId,
      tx,
    );

    return updated;
  });
};

// ---------------------------------------------------------------------------
// GET ISSUE HISTORY
// ---------------------------------------------------------------------------

/**
 * Get the full audit history for an issue.
 *
 * Returns all history records ordered oldest-first (chronological).
 * Limited to 200 records to prevent very large payloads for long-running issues.
 *
 * Role-based access: CUSTOMER can only see history of their own issues.
 */
export const getIssueHistory = async (
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

  return prisma.issueHistory.findMany({
    where: { issueId },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: {
      changedBy: SAFE_USER,
    },
  });
};
