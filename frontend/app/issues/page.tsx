"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { issuesApi } from "@/lib/issues-api";
import { StatusBadge, PriorityBadge, Avatar, EmptyState, Spinner } from "@/components/ui";
import { Plus, Search, SlidersHorizontal, RefreshCw } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import type { IssueStatus, Priority } from "@/types";

const STATUSES: IssueStatus[] = ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED"];
const PRIORITIES: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export default function IssuesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<IssueStatus | "">("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["issues", { search, status, priority, page }],
    queryFn: () =>
      issuesApi.list({
        search: search || undefined,
        status: status || undefined,
        priority: priority || undefined,
        page,
        limit: 20,
      }),
    placeholderData: (prev) => prev,
  });

  const issues = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Issues</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {pagination ? `${pagination.total} total` : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn-ghost" title="Refresh">
            <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />
          </button>
          <Link href="/issues/new" className="btn-primary">
            <Plus size={16} /> New Issue
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search issues…"
              className="input-base pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-slate-500" />
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value as IssueStatus | ""); setPage(1); }}
              className="input-base w-auto"
              style={{ paddingRight: "2rem" }}
            >
              <option value="">All Statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
            <select
              value={priority}
              onChange={(e) => { setPriority(e.target.value as Priority | ""); setPage(1); }}
              className="input-base w-auto"
            >
              <option value="">All Priorities</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Spinner size={28} /></div>
        ) : issues.length === 0 ? (
          <EmptyState
            title="No issues found"
            description={search || status || priority ? "Try adjusting your filters." : "Create your first issue to get started."}
            action={
              <Link href="/issues/new" className="btn-primary">
                <Plus size={15} /> New Issue
              </Link>
            }
          />
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Category</th>
                  <th>Assignee</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id} style={{ cursor: "pointer" }}>
                    <td>
                      <Link
                        href={`/issues/${issue.id}`}
                        className="block hover:text-violet-300 transition-colors"
                      >
                        <span className="text-slate-200 font-medium text-sm line-clamp-1">
                          {issue.title}
                        </span>
                        <span className="text-slate-500 text-xs">
                          {issue.category.name}
                        </span>
                      </Link>
                    </td>
                    <td><StatusBadge status={issue.status} /></td>
                    <td><PriorityBadge priority={issue.priority} /></td>
                    <td>
                      <span className="text-slate-400 text-sm">{issue.category.name}</span>
                    </td>
                    <td>
                      {issue.assignedTo ? (
                        <div className="flex items-center gap-2">
                          <Avatar name={issue.assignedTo.name} size={24} />
                          <span className="text-slate-300 text-sm">{issue.assignedTo.name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-sm">Unassigned</span>
                      )}
                    </td>
                    <td>
                      <span className="text-slate-400 text-sm">{timeAgo(issue.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
                <span className="text-slate-400 text-sm">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-secondary py-1.5 px-3 text-xs"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={page === pagination.totalPages}
                    className="btn-secondary py-1.5 px-3 text-xs"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
