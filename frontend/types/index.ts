// Shared TypeScript types — mirror the backend API response shapes exactly.

export type Role = "ADMIN" | "MANAGER" | "AGENT" | "CUSTOMER";
export type IssueStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "REOPENED";
export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  userId: string;
  role: Role;
  organizationId: string;
  iat: number;
  exp: number;
}

export interface Organization {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface SLA {
  responseDeadline: string;
  resolutionDeadline: string;
  responseBreached: boolean;
  resolutionBreached: boolean;
}

export interface Comment {
  id: string;
  content: string;
  issueId: string;
  userId: string;
  user: Pick<User, "id" | "name" | "email" | "role">;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  issueId: string;
  uploadedById: string;
  uploadedBy: Pick<User, "id" | "name" | "email">;
  createdAt: string;
}

export interface IssueHistoryEntry {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: Pick<User, "id" | "name" | "email" | "role">;
  createdAt: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: Priority;
  organizationId: string;
  categoryId: string;
  createdById: string;
  assignedToId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: Pick<Category, "id" | "name">;
  createdBy: Pick<User, "id" | "name" | "email" | "role">;
  assignedTo: Pick<User, "id" | "name" | "email" | "role"> | null;
  sla: SLA | null;
  history?: IssueHistoryEntry[];
  comments?: Comment[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Dashboard types
export interface DashboardSummary {
  total: number;
  byStatus: Record<IssueStatus, number>;
  avgResolutionHours: number | null;
  sla: {
    totalResolved: number;
    breached: number;
    breachRatePercent: number;
  };
  staleOpenIssues: number;
}

export interface CategoryStat {
  categoryId: string;
  categoryName: string;
  count: number;
}

export interface PriorityStat {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
}

export interface AgentPerformance {
  agentId: string;
  agentName: string;
  agentEmail: string;
  totalAssigned: number;
  totalResolved: number;
  avgResolutionHours: number | null;
  activeIssues: number;
}

export interface SlaBreachedIssue {
  id: string;
  title: string;
  status: IssueStatus;
  priority: Priority;
  createdAt: string;
  assignedTo: Pick<User, "id" | "name" | "email"> | null;
  sla: { resolutionDeadline: string; responseDeadline: string } | null;
}

export interface SlaStatus {
  summary: { breachedCount: number; approachingCount: number; checkedAt: string };
  breached: SlaBreachedIssue[];
  approaching: SlaBreachedIssue[];
}

export interface TrendPoint {
  date: string;
  created: number;
  resolved: number;
}

// API response wrappers
export interface ApiResponse<T> {
  status: "success" | "error";
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  status: "success";
  data: T[];
  pagination: Pagination;
}
