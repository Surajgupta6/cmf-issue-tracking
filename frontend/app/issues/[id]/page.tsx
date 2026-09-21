"use client";

import { useState, use } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi, commentsApi, attachmentsApi } from "@/lib/issues-api";
import { useAuth } from "@/lib/auth-context";
import {
  StatusBadge, PriorityBadge, Avatar, Spinner, EmptyState,
} from "@/components/ui";
import {
  ArrowLeft, Clock, User, Tag, Paperclip,
  MessageSquare, Send, Trash2, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { timeAgo, formatDate } from "@/lib/utils";
import type { IssueStatus, Comment } from "@/types";
import type { AxiosError } from "axios";

const TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  OPEN:        ["ASSIGNED", "IN_PROGRESS"],
  ASSIGNED:    ["IN_PROGRESS", "OPEN"],
  IN_PROGRESS: ["RESOLVED", "OPEN"],
  RESOLVED:    ["CLOSED", "REOPENED"],
  CLOSED:      ["REOPENED"],
  REOPENED:    ["ASSIGNED", "IN_PROGRESS"],
};

export default function IssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, role } = useAuth();
  const qc = useQueryClient();

  const [commentText, setCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [activeTab, setActiveTab] = useState<"comments" | "history" | "attachments">("comments");

  // Queries
  const { data: issueRes, isLoading } = useQuery({
    queryKey: ["issue", id],
    queryFn: () => issuesApi.getById(id),
  });

  const { data: commentsRes, isLoading: loadingComments } = useQuery({
    queryKey: ["issue", id, "comments"],
    queryFn: () => commentsApi.list(id),
  });

  const { data: attachmentsRes } = useQuery({
    queryKey: ["issue", id, "attachments"],
    queryFn: () => attachmentsApi.list(id),
    enabled: activeTab === "attachments",
  });

  const issue = issueRes?.data?.issue;
  const comments = commentsRes?.data ?? [];
  const attachments = attachmentsRes?.data?.attachments ?? [];

  // Mutations
  const statusMut = useMutation({
    mutationFn: (s: IssueStatus) => issuesApi.updateStatus(id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issue", id] }),
  });

  const addCommentMut = useMutation({
    mutationFn: (content: string) => commentsApi.create(id, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue", id, "comments"] });
      setCommentText("");
    },
  });

  const editCommentMut = useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      commentsApi.update(id, commentId, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue", id, "comments"] });
      setEditingCommentId(null);
    },
  });

  const deleteCommentMut = useMutation({
    mutationFn: (commentId: string) => commentsApi.delete(id, commentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issue", id, "comments"] }),
  });

  const deleteAttachmentMut = useMutation({
    mutationFn: (attachmentId: string) => attachmentsApi.delete(id, attachmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issue", id, "attachments"] }),
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await attachmentsApi.upload(id, file);
    qc.invalidateQueries({ queryKey: ["issue", id, "attachments"] });
    e.target.value = "";
  };

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;
  if (!issue) return <EmptyState title="Issue not found" description="This issue may have been deleted or you don't have access." />;

  const availableTransitions = TRANSITIONS[issue.status] ?? [];
  const canTransition = role !== "CUSTOMER";
  const slaBreached = issue.sla?.resolutionBreached;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/issues" className="btn-ghost py-1.5">
          <ArrowLeft size={15} /> Issues
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-slate-400 text-sm truncate">{issue.title}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Header */}
          <div className="glass-card p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold text-slate-100 mb-2">{issue.title}</h1>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={issue.status} />
                  <PriorityBadge priority={issue.priority} />
                  {slaBreached && (
                    <span className="badge bg-red-500/15 text-red-400 border-red-500/30">
                      <AlertTriangle size={11} className="mr-1" /> SLA Breached
                    </span>
                  )}
                  {issue.resolvedAt && (
                    <span className="badge bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                      <CheckCircle2 size={11} className="mr-1" /> Resolved {timeAgo(issue.resolvedAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
              {issue.description}
            </div>
          </div>

          {/* Status Transitions */}
          {canTransition && availableTransitions.length > 0 && (
            <div className="glass-card p-4">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">Update Status</p>
              <div className="flex flex-wrap gap-2">
                {availableTransitions.map((s) => (
                  <button
                    key={s}
                    onClick={() => statusMut.mutate(s)}
                    disabled={statusMut.isPending}
                    className="btn-secondary py-1.5 px-3 text-xs"
                  >
                    {statusMut.isPending ? <Spinner size={12} /> : null}
                    {s.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div>
            <div className="flex gap-1 mb-4" style={{ borderBottom: "1px solid #1e293b" }}>
              {(["comments", "history", "attachments"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? "text-violet-300 border-b-2 border-violet-500"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                  style={{ marginBottom: -1 }}
                >
                  {tab === "comments" && comments.length > 0 ? `Comments (${comments.length})` : tab}
                </button>
              ))}
            </div>

            {/* Comments Tab */}
            {activeTab === "comments" && (
              <div className="space-y-4">
                {loadingComments ? (
                  <div className="flex justify-center py-8"><Spinner /></div>
                ) : comments.length === 0 ? (
                  <div className="text-slate-500 text-sm text-center py-8">No comments yet. Be the first.</div>
                ) : (
                  comments.map((c: Comment) => (
                    <div key={c.id} className="glass-card p-4">
                      <div className="flex items-start gap-3">
                        <Avatar name={c.user.name} size={32} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-slate-200 text-sm font-medium">{c.user.name}</span>
                            <span className="text-slate-500 text-xs">{timeAgo(c.createdAt)}</span>
                          </div>
                          {editingCommentId === c.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="input-base text-sm resize-none"
                                rows={3}
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => editCommentMut.mutate({ commentId: c.id, content: editText })}
                                  className="btn-primary py-1.5 px-3 text-xs"
                                >Save</button>
                                <button onClick={() => setEditingCommentId(null)} className="btn-secondary py-1.5 px-3 text-xs">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-slate-300 text-sm">{c.content}</p>
                          )}
                        </div>
                        {(c.userId === user?.id || role === "ADMIN") && editingCommentId !== c.id && (
                          <div className="flex gap-1">
                            {c.userId === user?.id && (
                              <button
                                onClick={() => { setEditingCommentId(c.id); setEditText(c.content); }}
                                className="btn-ghost p-1.5 text-xs"
                              >Edit</button>
                            )}
                            <button
                              onClick={() => deleteCommentMut.mutate(c.id)}
                              className="btn-ghost p-1.5"
                            >
                              <Trash2 size={13} className="text-red-400" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {/* Add comment */}
                <div className="glass-card p-4">
                  <div className="flex items-start gap-3">
                    {user && <Avatar name={user.name} size={32} />}
                    <div className="flex-1">
                      <textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Add a comment…"
                        rows={3}
                        className="input-base text-sm resize-none mb-2"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && commentText.trim()) {
                            addCommentMut.mutate(commentText.trim());
                          }
                        }}
                      />
                      <button
                        onClick={() => commentText.trim() && addCommentMut.mutate(commentText.trim())}
                        disabled={!commentText.trim() || addCommentMut.isPending}
                        className="btn-primary py-1.5 px-4 text-sm"
                      >
                        {addCommentMut.isPending ? <Spinner size={14} /> : <Send size={13} />}
                        Comment
                      </button>
                      <span className="text-slate-600 text-xs ml-2">Ctrl+Enter to submit</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* History Tab */}
            {activeTab === "history" && (
              <div className="glass-card overflow-hidden">
                {!issue.history || issue.history.length === 0 ? (
                  <div className="text-slate-500 text-sm text-center py-8">No history available</div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Changed By</th>
                        <th>When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issue.history.map((h) => (
                        <tr key={h.id}>
                          <td><span className="text-violet-400 font-mono text-xs">{h.field}</span></td>
                          <td><span className="text-slate-500 text-xs">{h.oldValue ?? "—"}</span></td>
                          <td><span className="text-slate-200 text-xs font-medium">{h.newValue ?? "—"}</span></td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <Avatar name={h.changedBy.name} size={20} />
                              <span className="text-slate-300 text-xs">{h.changedBy.name}</span>
                            </div>
                          </td>
                          <td><span className="text-slate-400 text-xs">{timeAgo(h.createdAt)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Attachments Tab */}
            {activeTab === "attachments" && (
              <div className="space-y-3">
                <div className="glass-card p-4">
                  <label className="btn-secondary cursor-pointer inline-flex items-center gap-2">
                    <Paperclip size={15} />
                    Upload File
                    <input type="file" className="hidden" onChange={handleFileUpload} />
                  </label>
                  <span className="text-slate-500 text-xs ml-2">Max 10MB · Images, PDF, Word, Excel, ZIP</span>
                </div>
                {attachments.length === 0 ? (
                  <div className="text-slate-500 text-sm text-center py-8">No attachments yet</div>
                ) : (
                  attachments.map((att) => (
                    <div key={att.id} className="glass-card p-3 flex items-center gap-3">
                      <Paperclip size={15} className="text-slate-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 text-sm font-medium truncate block">
                          {att.filename}
                        </a>
                        <span className="text-slate-500 text-xs">
                          {(att.size / 1024).toFixed(1)} KB · {att.mimeType} · {timeAgo(att.createdAt)}
                        </span>
                      </div>
                      {(att.uploadedById === user?.id || role === "ADMIN") && (
                        <button onClick={() => deleteAttachmentMut.mutate(att.id)} className="btn-ghost p-1.5">
                          <Trash2 size={13} className="text-red-400" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar metadata */}
        <div className="space-y-4">
          <div className="glass-card p-5 space-y-4">
            <h3 className="text-slate-300 font-medium text-sm">Details</h3>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <User size={14} className="text-slate-500" />
                <span>Created by</span>
                <div className="flex items-center gap-1.5 ml-auto">
                  <Avatar name={issue.createdBy.name} size={20} />
                  <span className="text-slate-300">{issue.createdBy.name}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-400">
                <User size={14} className="text-slate-500" />
                <span>Assigned to</span>
                <div className="ml-auto">
                  {issue.assignedTo ? (
                    <div className="flex items-center gap-1.5">
                      <Avatar name={issue.assignedTo.name} size={20} />
                      <span className="text-slate-300">{issue.assignedTo.name}</span>
                    </div>
                  ) : (
                    <span className="text-slate-500">Unassigned</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-400">
                <Tag size={14} className="text-slate-500" />
                <span>Category</span>
                <span className="text-slate-300 ml-auto">{issue.category.name}</span>
              </div>

              <div className="flex items-center gap-2 text-slate-400">
                <Clock size={14} className="text-slate-500" />
                <span>Created</span>
                <span className="text-slate-300 ml-auto">{timeAgo(issue.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* SLA Card */}
          {issue.sla && (
            <div
              className="glass-card p-5"
              style={slaBreached ? { borderColor: "rgba(239,68,68,0.3)" } : {}}
            >
              <h3 className="text-slate-300 font-medium text-sm mb-3 flex items-center gap-2">
                <Clock size={14} />
                SLA Status
                {slaBreached && (
                  <span className="badge bg-red-500/15 text-red-400 border-red-500/30 ml-auto text-xs">
                    Breached
                  </span>
                )}
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Response</span>
                  <span className={issue.sla.responseBreached ? "text-red-400" : "text-slate-300"}>
                    {formatDate(issue.sla.responseDeadline)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Resolution</span>
                  <span className={issue.sla.resolutionBreached ? "text-red-400" : "text-slate-300"}>
                    {formatDate(issue.sla.resolutionDeadline)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
