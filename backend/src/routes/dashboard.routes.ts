import { Router } from "express";
import {
  summaryController,
  byCategoryController,
  byPriorityController,
  agentPerformanceController,
  slaStatusController,
  trendController,
} from "../controllers/dashboard.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { Role } from "../generated/prisma/client.js";

const router = Router();

/**
 * Dashboard Routes — /api/v1/dashboard
 *
 * Route-level access policy:
 *   /summary            → AGENT, MANAGER, ADMIN (agents see their org summary)
 *   /by-category        → MANAGER, ADMIN
 *   /by-priority        → MANAGER, ADMIN
 *   /agent-performance  → MANAGER, ADMIN
 *   /sla-status         → MANAGER, ADMIN
 *   /trend              → MANAGER, ADMIN
 *
 * CUSTOMER is excluded from all dashboard endpoints — they have no business
 * need for org-wide analytics.
 */

// Summary: AGENT can also see this (their overall org context)
router.get(
  "/summary",
  authenticate,
  authorize(Role.AGENT, Role.MANAGER, Role.ADMIN),
  summaryController,
);

// All other endpoints: management-only
router.get(
  "/by-category",
  authenticate,
  authorize(Role.MANAGER, Role.ADMIN),
  byCategoryController,
);

router.get(
  "/by-priority",
  authenticate,
  authorize(Role.MANAGER, Role.ADMIN),
  byPriorityController,
);

router.get(
  "/agent-performance",
  authenticate,
  authorize(Role.MANAGER, Role.ADMIN),
  agentPerformanceController,
);

router.get(
  "/sla-status",
  authenticate,
  authorize(Role.MANAGER, Role.ADMIN),
  slaStatusController,
);

router.get(
  "/trend",
  authenticate,
  authorize(Role.MANAGER, Role.ADMIN),
  trendController,
);

export default router;
