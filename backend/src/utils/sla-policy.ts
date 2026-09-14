import { Priority } from "../generated/prisma/client.js";

/**
 * SLA Policy Definitions
 *
 * SLA (Service Level Agreement) defines the maximum time allowed to:
 *   1. Respond to an issue (first agent activity: status change from OPEN)
 *   2. Resolve an issue (status reaching RESOLVED or CLOSED)
 *
 * Why a dedicated module?
 *   SLA rules are business policy that can change. Centralizing them here
 *   means a single edit applies everywhere. If SLA rules were scattered
 *   across controllers or inlined in the service, changing them would
 *   require hunting through the codebase.
 *
 * Time unit: hours (converted to milliseconds for Date arithmetic).
 */

interface SlaPolicyEntry {
  responseHours: number;    // Max hours to first agent response
  resolutionHours: number;  // Max hours to full resolution
}

/**
 * SLA policy table keyed by Priority enum value.
 *
 * |  Priority  | Response  | Resolution |
 * |------------|-----------|------------|
 * | CRITICAL   |  2 hours  |   8 hours  |
 * | HIGH       |  8 hours  |  24 hours  |
 * | MEDIUM     | 24 hours  |  72 hours  |
 * | LOW        | 72 hours  | 168 hours  |
 *
 * These are industry-standard SLA tiers. Adjusting these for a specific
 * customer requires creating a per-customer SLA tier — a planned future
 * improvement (see docs/PROJECT_PIPELINE.md §28).
 */
const SLA_POLICIES: Record<Priority, SlaPolicyEntry> = {
  [Priority.CRITICAL]: { responseHours: 2,  resolutionHours: 8   },
  [Priority.HIGH]:     { responseHours: 8,  resolutionHours: 24  },
  [Priority.MEDIUM]:   { responseHours: 24, resolutionHours: 72  },
  [Priority.LOW]:      { responseHours: 72, resolutionHours: 168 },
};

const HOURS_TO_MS = 60 * 60 * 1000;

/**
 * Calculate SLA deadlines for a new issue.
 *
 * Called at issue creation time. The deadlines are persisted in the SLA table
 * so they can be queried without recalculation.
 *
 * @param priority - The issue priority enum value
 * @param createdAt - The issue creation timestamp (defaults to now)
 * @returns { responseDeadline, resolutionDeadline }
 */
export const calculateSlaDeadlines = (
  priority: Priority,
  createdAt: Date = new Date(),
): { responseDeadline: Date; resolutionDeadline: Date } => {
  const policy = SLA_POLICIES[priority];

  return {
    responseDeadline: new Date(
      createdAt.getTime() + policy.responseHours * HOURS_TO_MS,
    ),
    resolutionDeadline: new Date(
      createdAt.getTime() + policy.resolutionHours * HOURS_TO_MS,
    ),
  };
};

/**
 * Get SLA policy for a given priority.
 * Used for display/informational purposes.
 */
export const getSlaPolicy = (priority: Priority): SlaPolicyEntry => {
  return SLA_POLICIES[priority];
};
