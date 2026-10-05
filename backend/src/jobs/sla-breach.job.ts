import { IssueStatus, NotificationType } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { getManagerIds } from "../services/notification.services.js";

/**
 * SLA Breach Detection Job
 *
 * Runs every 5 minutes. Scans all active (non-terminal) issues and marks
 * SLA response/resolution breaches, then fires notifications.
 *
 * ─── Design Properties ────────────────────────────────────────────────────
 *
 * IDEMPOTENT:
 *   Each breach check queries for issues where the flag is NOT yet set.
 *   Running this job 100 times produces the same result as running it once.
 *   No duplicate notifications, no double-counting.
 *
 * ATOMIC:
 *   For each breached issue, the SLA flag update + IssueHistory creation +
 *   Notification creation all happen inside a single Prisma transaction.
 *   If the notification insert fails, the SLA flag is NOT marked — the next
 *   run will retry the whole operation cleanly.
 *
 * EFFICIENT:
 *   1. One query to find ALL issues needing attention (not N queries).
 *   2. Processes breaches concurrently with Promise.allSettled — one slow
 *      issue doesn't block the rest.
 *   3. Promise.allSettled (not Promise.all) — a failure on one issue doesn't
 *      abort processing of the remaining 99.
 *
 * AUDITABLE:
 *   Every breach event is written to IssueHistory so it appears in the
 *   issue's timeline ("SLA resolution breached — 2026-09-26 12:00").
 *
 * OBSERVABLE:
 *   Structured console logs with emoji markers for easy log grepping:
 *     🔍  job started
 *     ✅  clean run (no breaches)
 *     🚨  breach detected
 *     ❌  per-issue error
 *     💥  job-level error
 *
 * ─── Production Upgrade Path ──────────────────────────────────────────────
 *
 * Current:  In-process node-cron (single instance)
 * Upgrade:  BullMQ scheduled job with Redis lock (multi-instance safe)
 *           → Ensures only ONE instance processes breaches at a time
 *           → Adds retry queue, dead-letter queue, job history dashboard
 */

const TERMINAL_STATUSES = [IssueStatus.RESOLVED, IssueStatus.CLOSED];

/**
 * Main job function — exported so it can be called on-demand in tests
 * or triggered manually via an internal admin API endpoint.
 */
export async function runSlaBreachDetection(): Promise<void> {
  const startedAt = Date.now();
  console.log(`🔍 [SLA Job] Starting breach detection at ${new Date().toISOString()}`);

  try {
    const now = new Date();

    // One query: find all active issues where EITHER deadline has passed
    // and is NOT already marked breached.
    const issuesToCheck = await prisma.issue.findMany({
      where: {
        status: { notIn: TERMINAL_STATUSES },
        sla: {
          isNot: null,
        },
      },
      include: {
        sla: true,
        assignedTo: { select: { id: true } },
        organization: { select: { id: true } },
      },
    });

    // Filter in JS (avoids the complex Prisma OR type issue)
    const breachable = issuesToCheck.filter((issue) => {
      if (!issue.sla) return false;
      const responseNeedsAction  = !issue.sla.responseBreached  && issue.sla.responseDeadline  < now;
      const resolutionNeedsAction = !issue.sla.resolutionBreached && issue.sla.resolutionDeadline < now;
      return responseNeedsAction || resolutionNeedsAction;
    });

    if (breachable.length === 0) {
      console.log(`✅ [SLA Job] No breaches found. Completed in ${Date.now() - startedAt}ms`);
      return;
    }

    console.log(`🚨 [SLA Job] Found ${breachable.length} issue(s) with SLA breaches`);

    // Process each breached issue atomically — failures are isolated
    const results = await Promise.allSettled(
      breachable.map((issue) => {
        // At this point we know sla is not null (filtered above)
        const sla = issue.sla!;
        return processBreach(
          {
            id: issue.id,
            title: issue.title,
            organizationId: issue.organizationId,
            createdById: issue.createdById,
            assignedToId: issue.assignedToId,
          },
          sla,
          now,
        );
      }),
    );

    results.forEach((result, i) => {
      if (result.status === "rejected") {
        const issueId = breachable[i]?.id ?? "unknown";
        console.error(
          `❌ [SLA Job] Failed to process breach for issue ${issueId}:`,
          result.reason,
        );
      }
    });

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    console.log(
      `🔍 [SLA Job] Completed: ${succeeded}/${breachable.length} processed in ${Date.now() - startedAt}ms`,
    );
  } catch (err) {
    console.error("💥 [SLA Job] Job-level error:", err);
  }
}

// ── Plain-object types to avoid Prisma inference complexity ─────────────────

interface IssueInfo {
  id: string;
  title: string;
  organizationId: string;
  createdById: string;
  assignedToId: string | null;
}

interface SlaInfo {
  responseDeadline: Date;
  resolutionDeadline: Date;
  responseBreached: boolean;
  resolutionBreached: boolean;
}

async function processBreach(
  issue: IssueInfo,
  sla: SlaInfo,
  now: Date,
): Promise<void> {
  const responseBreached   = !sla.responseBreached   && sla.responseDeadline   < now;
  const resolutionBreached = !sla.resolutionBreached && sla.resolutionDeadline < now;

  if (!responseBreached && !resolutionBreached) return;

  // Collect recipients: org managers/admins + assigned agent
  const managerIds = await getManagerIds(issue.organizationId);
  const recipientSet = new Set<string>(managerIds);
  if (issue.assignedToId) recipientSet.add(issue.assignedToId);

  await prisma.$transaction(async (tx) => {
    // 1. Update SLA flags
    const slaUpdate: { responseBreached?: boolean; resolutionBreached?: boolean } = {};
    if (responseBreached)   slaUpdate.responseBreached   = true;
    if (resolutionBreached) slaUpdate.resolutionBreached = true;

    await tx.sLA.update({ where: { issueId: issue.id }, data: slaUpdate });

    // 2. Audit history entries
    const historyRecords: Array<{
      issueId: string;
      changedById: string;
      field: string;
      oldValue: string;
      newValue: string;
    }> = [];

    if (responseBreached) {
      console.log(`🚨 [SLA Job] Response breach: "${issue.title}" (${issue.id})`);
      historyRecords.push({
        issueId: issue.id,
        changedById: issue.createdById,
        field: "sla.responseBreached",
        oldValue: "false",
        newValue: "true",
      });
    }
    if (resolutionBreached) {
      console.log(`🚨 [SLA Job] Resolution breach: "${issue.title}" (${issue.id})`);
      historyRecords.push({
        issueId: issue.id,
        changedById: issue.createdById,
        field: "sla.resolutionBreached",
        oldValue: "false",
        newValue: "true",
      });
    }

    if (historyRecords.length > 0) {
      await tx.issueHistory.createMany({ data: historyRecords });
    }

    // 3. Fan-out SLA_BREACH_WARNING notifications
    const breachType = resolutionBreached ? "resolution" : "response";
    const recipients = Array.from(recipientSet);

    if (recipients.length > 0) {
      await tx.notification.createMany({
        data: recipients.map((userId) => ({
          userId,
          type: NotificationType.SLA_BREACH_WARNING,
          title: "⚠️ SLA Breach Alert",
          message: `"${issue.title}" has breached its ${breachType} SLA deadline`,
          issueId: issue.id,
        })),
      });
    }
  });
}
