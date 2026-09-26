import type { Request, Response, NextFunction } from "express";
import {
  getUserNotifications,
  getUnreadCount,
  markOneRead,
  markAllRead,
} from "../services/notification.services.js";

/**
 * GET /api/v1/notifications
 * Paginated list of the authenticated user's notifications, newest first.
 */
export const listNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user!.userId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

    const result = await getUserNotifications(userId, page, limit);

    res.json({
      status: "success",
      data: result.notifications,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/notifications/unread-count
 * Lightweight endpoint powering the bell badge.
 * Should be polled every 30 seconds from the frontend.
 */
export const unreadCount = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const count = await getUnreadCount(req.user!.userId);
    res.json({ status: "success", data: { count } });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a single notification as read.
 * Only works for the authenticated user's own notifications (enforced in service).
 */
export const markRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await markOneRead(req.params.id, req.user!.userId);
    res.json({ status: "success", message: "Notification marked as read" });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/notifications/read-all
 * Mark all of the authenticated user's notifications as read.
 */
export const markAllAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await markAllRead(req.user!.userId);
    res.json({ status: "success", message: "All notifications marked as read" });
  } catch (err) {
    next(err);
  }
};
