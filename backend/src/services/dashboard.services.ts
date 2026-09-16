import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";

/**
 * Dashboard Service — Analytics & Reporting
 *
 * All queries are scoped to organizationId (multi-tenancy isolation).
 *
 * Query strategy:
 *   - Simple counts/groups: Prisma ORM groupBy + aggregate
 *   - Time-based calculations (avg resolution time): Prisma $queryRaw with
 *     parameterized SQL — safe from injection, expressive, performant
 *
 * Performance notes:
 *   - All dashboard queries run independently (no nested queries)
 *   - For high-traffic production use, add Redis caching with a 5-minute TTL
 *     (dashboard data doesn't need real-time freshness)
 *   - Indexes on (organizationId, status), (organizationId, createdAt) are
 *     planned for Phase 10 performance hardening
 */

// ---------------------------------------------------------------------------
// SUMMARY STATS
// ---------------------------------------------------------------------------

/**
 * Overall summary for the organization dashboard.
 *
 * Returns:
 *   - Total issues count
 *   - Counts broken down by status
 *   - Average resolution time (hours) for RESOLVED issues
 *   - SLA breach rate (% of issues where resolution deadline was missed)
 *   - Open issues older than 7 days (stale issues alert)
 */
export const getDashboardSummary = async (organizationId: string) => {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Run all queries in parallel for performance
  const [
    statusGroups,
    avgResolutionResult,
    slaBreachResult,
    staleCount,
    totalCount,
  ] = await Promise.all([
    // Issues grouped by status
    prisma.issue.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { id: true },
    }),

    // Average resolution time in hours (only for resolved issues)
    prisma.$queryRaw<Array<{ avg_hours: number | null }>>`
      SELECT AVG(
        EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600
      ) AS avg_hours
      FROM "Issue"
      WHERE "organizationId" = ${organizationId}
        AND "resolvedAt" IS NOT NULL
        AND status = 'RESOLVED'
    `,

    // SLA breach rate: resolved issues where resolution took longer than SLA deadline
    prisma.$queryRaw<Array<{ total: bigint; breached: bigint }>>`
      SELECT
        COUNT(i.id) AS total,
        COUNT(CASE WHEN i."resolvedAt" > s."resolutionDeadline" THEN 1 END) AS breached
      FROM "Issue" i
      JOIN "SLA" s ON s."issueId" = i.id
      WHERE i."organizationId" = ${organizationId}
        AND i."resolvedAt" IS NOT NULL
    `,

    // Stale open issues (OPEN or IN_PROGRESS, older than 7 days)
    prisma.issue.count({
      where: {
        organizationId,
        status: { in: ["OPEN", "IN_PROGRESS", "ASSIGNED", "REOPENED"] },
        createdAt: { lt: sevenDaysAgo },
      },
    }),

    // Total issues
    prisma.issue.count({ where: { organizationId } }),
  ]);

  // Build status breakdown map
  const byStatus = Object.fromEntries(
    statusGroups.map((g) => [g.status, g._count.id]),
  );

  // Parse avg resolution time
  const avgResolutionHours =
    avgResolutionResult[0]?.avg_hours != null
      ? Math.round(Number(avgResolutionResult[0].avg_hours) * 10) / 10
      : null;

  // Parse SLA breach rate
  const slaData = slaBreachResult[0];
  const slaTotal = slaData ? Number(slaData.total) : 0;
  const slaBreached = slaData ? Number(slaData.breached) : 0;
  const slaBreachRate =
    slaTotal > 0 ? Math.round((slaBreached / slaTotal) * 1000) / 10 : 0;

  return {
    total: totalCount,
    byStatus: {
      OPEN:        byStatus["OPEN"]        ?? 0,
      ASSIGNED:    byStatus["ASSIGNED"]    ?? 0,
      IN_PROGRESS: byStatus["IN_PROGRESS"] ?? 0,
      RESOLVED:    byStatus["RESOLVED"]    ?? 0,
      CLOSED:      byStatus["CLOSED"]      ?? 0,
      REOPENED:    byStatus["REOPENED"]    ?? 0,
    },
    avgResolutionHours,   // null if no resolved issues yet
    sla: {
      totalResolved: slaTotal,
      breached: slaBreached,
      breachRatePercent: slaBreachRate,  // e.g. 16.7 = 16.7%
    },
    staleOpenIssues: staleCount,  // Issues needing attention
  };
};

// ---------------------------------------------------------------------------
// ISSUES BY CATEGORY
// ---------------------------------------------------------------------------

/**
 * Issue count distribution across categories.
 * Useful for identifying which areas generate the most support volume.
 *
 * Ordered by count DESC — most active categories first.
 */
export const getIssuesByCategory = async (organizationId: string) => {
  const groups = await prisma.issue.groupBy({
    by: ["categoryId"],
    where: { organizationId },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  if (groups.length === 0) return [];

  // Fetch category names for the IDs we got
  const categoryIds = groups.map((g) => g.categoryId);
  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true },
  });

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  return groups.map((g) => ({
    categoryId: g.categoryId,
    categoryName: categoryMap[g.categoryId] ?? "Unknown",
    count: g._count.id,
  }));
};

// ---------------------------------------------------------------------------
// ISSUES BY PRIORITY
// ---------------------------------------------------------------------------

/**
 * Issue count distribution across priority levels.
 * Helps identify if the team is overwhelmed with high-priority issues.
 */
export const getIssuesByPriority = async (organizationId: string) => {
  const groups = await prisma.issue.groupBy({
    by: ["priority"],
    where: { organizationId },
    _count: { id: true },
  });

  const byPriority = Object.fromEntries(
    groups.map((g) => [g.priority, g._count.id]),
  );

  // Always return all four priority levels (even if count is 0)
  return {
    CRITICAL: byPriority["CRITICAL"] ?? 0,
    HIGH:     byPriority["HIGH"]     ?? 0,
    MEDIUM:   byPriority["MEDIUM"]   ?? 0,
    LOW:      byPriority["LOW"]      ?? 0,
  };
};

// ---------------------------------------------------------------------------
// AGENT PERFORMANCE
// ---------------------------------------------------------------------------

/**
 * Per-agent performance metrics.
 *
 * Returns for each agent:
 *   - Total issues assigned
 *   - Total issues resolved
 *   - Average resolution time in hours
 *   - Currently open/in-progress issues (workload indicator)
 *
 * Used by managers to identify top performers and agents who need support.
 *
 * Scoped to the org — agents from other orgs are never included.
 */
export const getAgentPerformance = async (organizationId: string) => {
  type AgentRow = {
    agent_id: string;
    agent_name: string;
    agent_email: string;
    total_assigned: bigint;
    total_resolved: bigint;
    avg_resolution_hours: number | null;
    active_issues: bigint;
  };

  const rows = await prisma.$queryRaw<AgentRow[]>`
    SELECT
      u.id          AS agent_id,
      u.name        AS agent_name,
      u.email       AS agent_email,
      COUNT(i.id)   AS total_assigned,
      COUNT(CASE WHEN i.status = 'RESOLVED' OR i.status = 'CLOSED' THEN 1 END) AS total_resolved,
      AVG(
        CASE
          WHEN i."resolvedAt" IS NOT NULL
          THEN EXTRACT(EPOCH FROM (i."resolvedAt" - i."createdAt")) / 3600
        END
      ) AS avg_resolution_hours,
      COUNT(
        CASE WHEN i.status IN ('ASSIGNED', 'IN_PROGRESS') THEN 1 END
      ) AS active_issues
    FROM "User" u
    LEFT JOIN "Issue" i
      ON i."assignedToId" = u.id
      AND i."organizationId" = ${organizationId}
    WHERE u."organizationId" = ${organizationId}
      AND u.role = 'AGENT'
      AND u."isActive" = true
    GROUP BY u.id, u.name, u.email
    ORDER BY total_resolved DESC, total_assigned DESC
  `;

  return rows.map((r) => ({
    agentId:             r.agent_id,
    agentName:           r.agent_name,
    agentEmail:          r.agent_email,
    totalAssigned:       Number(r.total_assigned),
    totalResolved:       Number(r.total_resolved),
    avgResolutionHours:
      r.avg_resolution_hours != null
        ? Math.round(Number(r.avg_resolution_hours) * 10) / 10
        : null,
    activeIssues:        Number(r.active_issues),
  }));
};

// ---------------------------------------------------------------------------
// SLA STATUS
// ---------------------------------------------------------------------------

/**
 * SLA health snapshot for the organization.
 *
 * Returns:
 *   - Currently breached issues (resolution deadline passed, issue still open)
 *   - Issues approaching deadline (due within next 4 hours)
 *   - Summary counts
 *
 * This data is critical for managers to prioritize escalations.
 */
export const getSlaStatus = async (organizationId: string) => {
  const now = new Date();
  const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  const [breached, approaching] = await Promise.all([
    // Currently breached: open issues past their resolution deadline
    prisma.issue.findMany({
      where: {
        organizationId,
        status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"] },
        sla: {
          resolutionDeadline: { lt: now },
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        sla: {
          select: {
            resolutionDeadline: true,
            responseDeadline: true,
          },
        },
      },
      orderBy: { createdAt: "asc" }, // Oldest breached first (most urgent)
      take: 20,
    }),

    // Approaching breach: open issues with resolution deadline in next 4 hours
    prisma.issue.findMany({
      where: {
        organizationId,
        status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"] },
        sla: {
          resolutionDeadline: {
            gt: now,
            lt: fourHoursFromNow,
          },
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        sla: {
          select: {
            resolutionDeadline: true,
            responseDeadline: true,
          },
        },
      },
      orderBy: { sla: { resolutionDeadline: "asc" } }, // Closest deadline first
      take: 20,
    }),
  ]);

  return {
    summary: {
      breachedCount:    breached.length,
      approachingCount: approaching.length,
      checkedAt:        now.toISOString(),
    },
    breached,
    approaching,
  };
};

// ---------------------------------------------------------------------------
// ISSUES OVER TIME (TREND)
// ---------------------------------------------------------------------------

/**
 * Daily issue creation and resolution counts for the last N days.
 * Used to render a time-series chart on the frontend dashboard.
 *
 * @param organizationId - Org to scope the query
 * @param days           - Number of days to look back (default: 30)
 */
export const getIssuesTrend = async (
  organizationId: string,
  days: number = 30,
) => {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  type TrendRow = { day: Date; created: bigint; resolved: bigint };

  const rows = await prisma.$queryRaw<TrendRow[]>`
    SELECT
      DATE_TRUNC('day', gs.day) AS day,
      COUNT(DISTINCT CASE WHEN i."createdAt" >= gs.day AND i."createdAt" < gs.day + INTERVAL '1 day'
            AND i."organizationId" = ${organizationId} THEN i.id END) AS created,
      COUNT(DISTINCT CASE WHEN i."resolvedAt" >= gs.day AND i."resolvedAt" < gs.day + INTERVAL '1 day'
            AND i."organizationId" = ${organizationId} THEN i.id END) AS resolved
    FROM generate_series(
      ${Prisma.raw(`'${since.toISOString()}'::timestamptz`)},
      NOW(),
      INTERVAL '1 day'
    ) AS gs(day)
    LEFT JOIN "Issue" i ON true
    GROUP BY gs.day
    ORDER BY gs.day ASC
  `;

  return rows.map((r) => ({
    date:     (r.day as Date).toISOString().substring(0, 10),
    created:  Number(r.created),
    resolved: Number(r.resolved),
  }));
};
