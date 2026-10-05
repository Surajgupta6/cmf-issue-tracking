import api from "@/lib/api";
import type { ApiResponse, PaginatedResponse } from "@/types";

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  issueId: string | null;
  issue: { id: string; title: string } | null;
  createdAt: string;
}

export const notificationsApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Notification>> => {
    const { data } = await api.get("/notifications", { params });
    return data;
  },

  unreadCount: async (): Promise<ApiResponse<{ count: number }>> => {
    const { data } = await api.get("/notifications/unread-count");
    return data;
  },

  markRead: async (id: string): Promise<void> => {
    await api.patch(`/notifications/${id}/read`);
  },

  markAllRead: async (): Promise<void> => {
    await api.patch("/notifications/read-all");
  },
};
