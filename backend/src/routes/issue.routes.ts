import { Router } from "express";
import {
  createIssueController,
  listIssuesController,
  getIssueByIdController,
  updateIssueController,
  updateIssueStatusController,
  assignIssueController,
  getIssueHistoryController,
} from "../controllers/issue.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { Role } from "../generated/prisma/client.js";

const router = Router();

/**
 * Issue Routes
 *
 * All routes require authentication.
 *
 * Role-based access summary:
 *   POST   /               : All roles (any user can create an issue)
 *   GET    /               : All roles (visibility enforced in service by role)
 *   GET    /:id            : All roles (visibility enforced in service by role)
 *   PATCH  /:id            : All roles (ownership check in service for CUSTOMER)
 *   PATCH  /:id/status     : All roles (state machine + role check in service)
 *   PATCH  /:id/assign     : MANAGER, ADMIN only (privileged operation)
 *   GET    /:id/history    : All roles (visibility enforced in service by role)
 */

router.post("/", authenticate, createIssueController);

router.get("/", authenticate, listIssuesController);

router.get("/:id", authenticate, getIssueByIdController);

router.patch("/:id", authenticate, updateIssueController);

router.patch("/:id/status", authenticate, updateIssueStatusController);

router.patch(
  "/:id/assign",
  authenticate,
  authorize(Role.MANAGER, Role.ADMIN),
  assignIssueController,
);

router.get("/:id/history", authenticate, getIssueHistoryController);

export default router;
