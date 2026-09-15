import { Router } from "express";
import {
  createCommentController,
  listCommentsController,
  updateCommentController,
  deleteCommentController,
} from "../controllers/comment.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

/**
 * Comment Routes
 * Nested under issues: /api/v1/issues/:issueId/comments
 *
 * All routes require authentication.
 * Fine-grained access control (ownership, closed-issue guard, CUSTOMER
 * visibility) is enforced in comment.services.ts.
 */
const router = Router({ mergeParams: true });

router.post("/", authenticate, createCommentController);
router.get("/", authenticate, listCommentsController);
router.patch("/:commentId", authenticate, updateCommentController);
router.delete("/:commentId", authenticate, deleteCommentController);

export default router;
