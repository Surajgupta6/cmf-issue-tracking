import { IssueStatus, Role } from "../generated/prisma/client.js";
import { AppError } from "./app-error.js";

/**
 * Issue State Machine
 *
 * Models the issue lifecycle as a finite state machine (FSM).
 *
 * Why a state machine?
 *   Without enforced transitions, any status value could be set to any other
 *   value. For example, a CLOSED issue could be set back to OPEN directly,
 *   bypassing the REOPENED review step. The FSM ensures only valid business
 *   transitions occur and every transition is role-appropriate.
 *
 * Design: A lookup table (not if/else chains) — O(1) lookup, easily auditable,
 * easy to extend. Each entry defines:
 *   - `to`: allowed target statuses from this state
 *   - `roles`: which roles can make THIS transition
 *
 * State diagram:
 *   OPEN → ASSIGNED (MANAGER, ADMIN)
 *   ASSIGNED → IN_PROGRESS (AGENT[assigned], MANAGER, ADMIN)
 *   IN_PROGRESS → RESOLVED (AGENT[assigned], MANAGER, ADMIN)
 *   RESOLVED → CLOSED (CUSTOMER, MANAGER, ADMIN)
 *   RESOLVED → REOPENED (CUSTOMER)
 *   REOPENED → IN_PROGRESS (AGENT[assigned], MANAGER, ADMIN)
 *   CLOSED → (terminal — no transitions)
 */

interface TransitionRule {
  to: IssueStatus[];
  roles: Role[];
}

const VALID_TRANSITIONS: Record<IssueStatus, TransitionRule> = {
  [IssueStatus.OPEN]: {
    to: [IssueStatus.ASSIGNED],
    roles: [Role.MANAGER, Role.ADMIN],
  },
  [IssueStatus.ASSIGNED]: {
    to: [IssueStatus.IN_PROGRESS],
    roles: [Role.AGENT, Role.MANAGER, Role.ADMIN],
  },
  [IssueStatus.IN_PROGRESS]: {
    to: [IssueStatus.RESOLVED],
    roles: [Role.AGENT, Role.MANAGER, Role.ADMIN],
  },
  [IssueStatus.RESOLVED]: {
    to: [IssueStatus.CLOSED, IssueStatus.REOPENED],
    roles: [Role.CUSTOMER, Role.MANAGER, Role.ADMIN],
  },
  [IssueStatus.CLOSED]: {
    to: [],   // Terminal state — no valid transitions
    roles: [],
  },
  [IssueStatus.REOPENED]: {
    to: [IssueStatus.IN_PROGRESS],
    roles: [Role.AGENT, Role.MANAGER, Role.ADMIN],
  },
};

/**
 * Validate a status transition request.
 *
 * Two layers of validation:
 *  1. Is `toStatus` a valid next state from `fromStatus`?
 *  2. Is the requester's role allowed to make this transition?
 *     For AGENT: additional check — only the assigned agent can transition
 *     (enforced in the service, not here, since we don't have issue context).
 *
 * Throws AppError with a descriptive message if invalid.
 * Returns void if the transition is valid.
 *
 * @param fromStatus - Current issue status
 * @param toStatus   - Requested next status
 * @param role       - The requesting user's role
 */
export const validateTransition = (
  fromStatus: IssueStatus,
  toStatus: IssueStatus,
  role: Role,
): void => {
  if (fromStatus === toStatus) {
    throw new AppError(
      `Issue is already in status ${toStatus}`,
      400,
    );
  }

  const rule = VALID_TRANSITIONS[fromStatus];

  if (!rule.to.includes(toStatus)) {
    throw new AppError(
      `Invalid transition: cannot move issue from ${fromStatus} to ${toStatus}. ` +
        `Allowed next statuses: [${rule.to.join(", ") || "none — this is a terminal state"}]`,
      400,
    );
  }

  if (!rule.roles.includes(role)) {
    throw new AppError(
      `Your role (${role}) is not allowed to move an issue from ${fromStatus} to ${toStatus}. ` +
        `Allowed roles: [${rule.roles.join(", ")}]`,
      403,
    );
  }
};

/**
 * Get all valid next statuses from the current state.
 * Used to return helpful information in API responses.
 */
export const getValidNextStatuses = (fromStatus: IssueStatus): IssueStatus[] => {
  return VALID_TRANSITIONS[fromStatus]?.to ?? [];
};
