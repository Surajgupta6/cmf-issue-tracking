"use client";

import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/dashboard-api";
import { useAuth } from "@/lib/auth-context";
import { StatCard, StatusBadge, PriorityBadge, Spinner, EmptyState } from "@/components/ui";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  TrendingUp,
  Users,
} from "lucide-react";
import { timeAgo, formatDate } from "@/lib/utils";
import type { IssueStatus } from "@/types";

const STATUS_ORDER: IssueStatus[] = ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED"];
const CHART_COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-slate-100 font-semibold text-base">{title}</h2>
      {sub && <p className="text-slate-400 text-sm">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { role } = useAuth();

  const { data: summaryRes, isLoading: loadingSummary } = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: dashboardApi.summary,
  });

  const { data: trendRes } = useQuery({
    queryKey: ["dashboard", "trend"],
    queryFn: () => dashboardApi.trend(30),
    enabled: role === "ADMIN" || role === "MANAGER",
  });

  const { data: categoryRes } = useQuery({
    queryKey: ["dashboard", "by-category"],
    queryFn: dashboardApi.byCategory,
    enabled: role === "ADMIN" || role === "MANAGER",
  });

  const { data: slaRes } = useQuery({
    queryKey: ["dashboard", "sla-status"],
    queryFn: dashboardApi.slaStatus,
    enabled: role === "ADMIN" || role === "MANAGER",
    refetchInterval: 5 * 60 * 1000, // Re-check SLA status every 5 min
  });

  const { data: agentRes } = useQuery({
    queryKey: ["dashboard", "agent-performance"],
    queryFn: dashboardApi.agentPerformance,
    enabled: role === "ADMIN" || role === "MANAGER",
  });

  const summary = summaryRes?.data;
  const trend = trendRes?.data ?? [];
  const categories = categoryRes?.data ?? [];
  const sla = slaRes?.data;
  const agents = agentRes?.data ?? [];

  if (loadingSummary) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={32} />
      </div>
    );
  }

  const statusItems = STATUS_ORDER.map((s) => ({
    name: s.replace("_", " "),
    value: summary?.byStatus?.[s] ?? 0,
  })).filter((x) => x.value > 0);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Organization-wide issue health and performance metrics
        </p>
      </div>

      {/* SLA Alert Banner */}
      {sla && sla.summary.breachedCount > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
          }}
        >
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
          <span className="text-red-300 font-medium">
            {sla.summary.breachedCount} issue{sla.summary.breachedCount > 1 ? "s" : ""} have breached their SLA resolution deadline
          </span>
          {sla.summary.approachingCount > 0 && (
            <span className="text-slate-400 ml-auto">
              +{sla.summary.approachingCount} approaching
            </span>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Issues"
          value={summary?.total ?? 0}
          icon={<FileText size={20} />}
          color="#8b5cf6"
        />
        <StatCard
          label="Open + In Progress"
          value={(summary?.byStatus?.OPEN ?? 0) + (summary?.byStatus?.IN_PROGRESS ?? 0) + (summary?.byStatus?.ASSIGNED ?? 0)}
          icon={<Clock size={20} />}
          color="#f59e0b"
          sub="Needs attention"
        />
        <StatCard
          label="Resolved"
          value={summary?.byStatus?.RESOLVED ?? 0}
          icon={<CheckCircle2 size={20} />}
          color="#10b981"
          sub={summary?.avgResolutionHours != null ? `Avg ${summary.avgResolutionHours}h resolution` : undefined}
        />
        <StatCard
          label="SLA Breach Rate"
          value={`${summary?.sla?.breachRatePercent ?? 0}%`}
          icon={<TrendingUp size={20} />}
          color={summary?.sla?.breachRatePercent && summary.sla.breachRatePercent > 15 ? "#ef4444" : "#10b981"}
          sub={`${summary?.sla?.breached ?? 0} of ${summary?.sla?.totalResolved ?? 0} resolved`}
        />
      </div>

      {/* Charts row */}
      {(role === "ADMIN" || role === "MANAGER") && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trend chart */}
          <div className="lg:col-span-2 glass-card p-5">
            <SectionHeader title="Issue Trend" sub="Created vs Resolved (last 30 days)" />
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="created" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="resolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#94a3b8" }}
                />
                <Area type="monotone" dataKey="created" stroke="#8b5cf6" fill="url(#created)" strokeWidth={2} name="Created" />
                <Area type="monotone" dataKey="resolved" stroke="#10b981" fill="url(#resolved)" strokeWidth={2} name="Resolved" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Status pie */}
          <div className="glass-card p-5">
            <SectionHeader title="By Status" />
            {statusItems.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={statusItems}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusItems.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-slate-500 text-sm">No data yet</div>
            )}
          </div>
        </div>
      )}

      {/* Bottom row: Categories + Agent Perf + SLA Breaches */}
      {(role === "ADMIN" || role === "MANAGER") && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Categories */}
          {categories.length > 0 && (
            <div className="glass-card p-5">
              <SectionHeader title="Issues by Category" />
              <div className="space-y-3">
                {categories.map((cat) => {
                  const pct = summary?.total ? Math.round((cat.count / summary.total) * 100) : 0;
                  return (
                    <div key={cat.categoryId}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-300">{cat.categoryName}</span>
                        <span className="text-slate-400">{cat.count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: "linear-gradient(90deg,#8b5cf6,#3b82f6)" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Agent performance */}
          <div className="glass-card p-5">
            <SectionHeader title="Agent Performance" />
            {agents.length === 0 ? (
              <div className="text-slate-500 text-sm py-8 text-center">No agents in organization yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Resolved</th>
                      <th>Active</th>
                      <th>Avg (h)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a) => (
                      <tr key={a.agentId}>
                        <td>
                          <span className="text-slate-200 font-medium">{a.agentName}</span>
                        </td>
                        <td><span className="text-emerald-400 font-medium">{a.totalResolved}</span></td>
                        <td><span className="text-amber-400">{a.activeIssues}</span></td>
                        <td><span className="text-slate-400">{a.avgResolutionHours ?? "—"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SLA Breached Issues */}
      {sla && sla.breached.length > 0 && (
        <div className="glass-card p-5">
          <SectionHeader
            title="SLA Breaches"
            sub="Issues that have exceeded their resolution deadline"
          />
          <div className="space-y-3">
            {sla.breached.map((issue) => (
              <div
                key={issue.id}
                className="flex items-center gap-4 p-3 rounded-lg"
                style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}
              >
                <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 text-sm font-medium truncate">{issue.title}</p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Deadline: {formatDate(issue.sla?.resolutionDeadline ?? "")} · {timeAgo(issue.createdAt)}
                  </p>
                </div>
                <PriorityBadge priority={issue.priority} />
                <StatusBadge status={issue.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
