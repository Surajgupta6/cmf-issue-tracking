import { Request, Response } from "express";
import {
  getDashboardSummary,
  getIssuesByCategory,
  getIssuesByPriority,
  getAgentPerformance,
  getSlaStatus,
  getIssuesTrend,
} from "../services/dashboard.services.js";
import { AppError } from "../utils/app-error.js";
import { Role } from "../generated/prisma/client.js";

/**
 * Dashboard Controller
 *
 * Access policy:
 *   ADMIN, MANAGER  → full access to all endpoints
 *   AGENT           → summary only (own workload context)
 *   CUSTOMER        → no access (handled by authorize middleware at route level)
 *
 * All endpoints are scoped to req.user.organizationId automatically.
 */

/**
 * GET /api/v1/dashboard/summary
 * Overall organization issue stats and KPIs.
 */
export const summaryController = async (req: Request, res: Response) => {
  const data = await getDashboardSummary(req.user!.organizationId);
  return res.status(200).json({ status: "success", data });
};

/**
 * GET /api/v1/dashboard/by-category
 * Issue volume distribution across categories.
 * MANAGER/ADMIN only.
 */
export const byCategoryController = async (req: Request, res: Response) => {
  const data = await getIssuesByCategory(req.user!.organizationId);
  return res.status(200).json({ status: "success", data });
};

/**
 * GET /api/v1/dashboard/by-priority
 * Issue volume distribution across priority levels.
 * MANAGER/ADMIN only.
 */
export const byPriorityController = async (req: Request, res: Response) => {
  const data = await getIssuesByPriority(req.user!.organizationId);
  return res.status(200).json({ status: "success", data });
};

/**
 * GET /api/v1/dashboard/agent-performance
 * Per-agent productivity and workload metrics.
 * MANAGER/ADMIN only — agents should not see each other's metrics.
 */
export const agentPerformanceController = async (
  req: Request,
  res: Response,
) => {
  const data = await getAgentPerformance(req.user!.organizationId);
  return res.status(200).json({ status: "success", data });
};

/**
 * GET /api/v1/dashboard/sla-status
 * Active SLA breaches and issues approaching deadline.
 * MANAGER/ADMIN only — operational escalation data.
 */
export const slaStatusController = async (req: Request, res: Response) => {
  const data = await getSlaStatus(req.user!.organizationId);
  return res.status(200).json({ status: "success", data });
};

/**
 * GET /api/v1/dashboard/trend?days=30
 * Daily issue creation and resolution trend.
 * MANAGER/ADMIN only.
 */
export const trendController = async (req: Request, res: Response) => {
  const rawDays = req.query["days"];
  const days = Math.min(
    90,
    Math.max(7, parseInt(String(rawDays ?? "30"), 10)),
  );

  if (isNaN(days)) {
    throw new AppError("'days' query parameter must be a number between 7 and 90", 400);
  }

  const data = await getIssuesTrend(req.user!.organizationId, days);
  return res.status(200).json({ status: "success", data });
};
