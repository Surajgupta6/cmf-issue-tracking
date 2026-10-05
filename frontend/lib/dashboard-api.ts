import api from "@/lib/api";
import type {
  DashboardSummary,
  CategoryStat,
  PriorityStat,
  AgentPerformance,
  SlaStatus,
  TrendPoint,
  ApiResponse,
} from "@/types";

export const dashboardApi = {
  summary: async (): Promise<ApiResponse<DashboardSummary>> => {
    const { data } = await api.get("/dashboard/summary");
    return data;
  },

  byCategory: async (): Promise<ApiResponse<CategoryStat[]>> => {
    const { data } = await api.get("/dashboard/by-category");
    return data;
  },

  byPriority: async (): Promise<ApiResponse<PriorityStat>> => {
    const { data } = await api.get("/dashboard/by-priority");
    return data;
  },

  agentPerformance: async (): Promise<ApiResponse<AgentPerformance[]>> => {
    const { data } = await api.get("/dashboard/agent-performance");
    return data;
  },

  slaStatus: async (): Promise<ApiResponse<SlaStatus>> => {
    const { data } = await api.get("/dashboard/sla-status");
    return data;
  },

  trend: async (days = 30): Promise<ApiResponse<TrendPoint[]>> => {
    const { data } = await api.get("/dashboard/trend", { params: { days } });
    return data;
  },
};

export const categoriesApi = {
  list: async () => {
    const { data } = await api.get("/categories");
    return data;
  },
};

export const usersApi = {
  list: async (params?: { role?: string; page?: number; limit?: number }) => {
    const { data } = await api.get("/users", { params });
    return data;
  },

  getById: async (id: string) => {
    const { data } = await api.get(`/users/${id}`);
    return data;
  },

  updateRole: async (id: string, role: string) => {
    const { data } = await api.patch(`/users/${id}/role`, { role });
    return data;
  },

  updateStatus: async (id: string, isActive: boolean) => {
    const { data } = await api.patch(`/users/${id}/status`, { isActive });
    return data;
  },
};
