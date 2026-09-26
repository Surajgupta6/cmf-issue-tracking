import { Router } from "express";
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllAsRead,
} from "../controllers/notification.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// All notification routes require authentication
router.use(authenticate);

// GET  /notifications              — paginated list
// GET  /notifications/unread-count — badge count (lightweight poll)
// PATCH /notifications/read-all   — mark all read
// PATCH /notifications/:id/read   — mark one read

// NOTE: /read-all must be declared BEFORE /:id/read to avoid Express
//       treating "read-all" as the :id param.
router.get("/", listNotifications);
router.get("/unread-count", unreadCount);
router.patch("/read-all", markAllAsRead);
router.patch("/:id/read", markRead);

export default router;
