import api from "@/lib/api";
import type {
  Issue,
  Comment,
  Attachment,
  PaginatedResponse,
  ApiResponse,
  IssueStatus,
  Priority,
} from "@/types";

// ---- Issues ----

export const issuesApi = {
  list: async (params?: {
    status?: IssueStatus;
    priority?: Priority;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }): Promise<PaginatedResponse<Issue>> => {
    const { data } = await api.get("/issues", { params });
    return data;
  },

  getById: async (id: string): Promise<ApiResponse<{ issue: Issue }>> => {
    const { data } = await api.get(`/issues/${id}`);
    return data;
  },

  create: async (payload: {
    title: string;
    description: string;
    priority: Priority;
    categoryId: string;
  }): Promise<ApiResponse<{ issue: Issue }>> => {
    const { data } = await api.post("/issues", payload);
    return data;
  },

  update: async (
    id: string,
    payload: Partial<{
      title: string;
      description: string;
      priority: Priority;
      categoryId: string;
    }>,
  ): Promise<ApiResponse<{ issue: Issue }>> => {
    const { data } = await api.patch(`/issues/${id}`, payload);
    return data;
  },

  updateStatus: async (
    id: string,
    status: IssueStatus,
  ): Promise<ApiResponse<{ issue: Issue }>> => {
    const { data } = await api.patch(`/issues/${id}/status`, { status });
    return data;
  },

  assign: async (
    id: string,
    agentId: string,
  ): Promise<ApiResponse<{ issue: Issue }>> => {
    const { data } = await api.patch(`/issues/${id}/assign`, { agentId });
    return data;
  },

  getHistory: async (id: string) => {
    const { data } = await api.get(`/issues/${id}/history`);
    return data;
  },
};

// ---- Comments ----

export const commentsApi = {
  list: async (
    issueId: string,
    params?: { page?: number; limit?: number },
  ): Promise<PaginatedResponse<Comment>> => {
    const { data } = await api.get(`/issues/${issueId}/comments`, { params });
    return data;
  },

  create: async (
    issueId: string,
    content: string,
  ): Promise<ApiResponse<{ comment: Comment }>> => {
    const { data } = await api.post(`/issues/${issueId}/comments`, { content });
    return data;
  },

  update: async (
    issueId: string,
    commentId: string,
    content: string,
  ): Promise<ApiResponse<{ comment: Comment }>> => {
    const { data } = await api.patch(
      `/issues/${issueId}/comments/${commentId}`,
      { content },
    );
    return data;
  },

  delete: async (issueId: string, commentId: string): Promise<void> => {
    await api.delete(`/issues/${issueId}/comments/${commentId}`);
  },
};

// ---- Attachments ----

export const attachmentsApi = {
  list: async (issueId: string): Promise<ApiResponse<{ attachments: Attachment[] }>> => {
    const { data } = await api.get(`/issues/${issueId}/attachments`);
    return data;
  },

  upload: async (
    issueId: string,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<ApiResponse<{ attachment: Attachment }>> => {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post(`/issues/${issueId}/attachments`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    });
    return data;
  },

  delete: async (issueId: string, attachmentId: string): Promise<void> => {
    await api.delete(`/issues/${issueId}/attachments/${attachmentId}`);
  },
};
