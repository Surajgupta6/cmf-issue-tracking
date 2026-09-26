"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { notificationsApi, type Notification } from "@/lib/notifications-api";
import { Bell, Check, CheckCheck, X } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { Spinner } from "@/components/ui";

const TYPE_ICONS: Record<string, string> = {
  ISSUE_CREATED:        "🆕",
  ISSUE_ASSIGNED:       "👤",
  ISSUE_STATUS_CHANGED: "🔄",
  COMMENT_ADDED:        "💬",
  SLA_BREACH_WARNING:   "⚠️",
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const qc = useQueryClient();

  // Unread count — polled every 30 seconds
  const { data: countData } = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 30 * 1000,
    staleTime: 20 * 1000,
  });

  // Notification list — only fetched when dropdown is open
  const { data: listData, isLoading } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => notificationsApi.list({ limit: 15 }),
    enabled: open,
    staleTime: 10 * 1000,
  });

  const markReadMut = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllMut = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = countData?.data?.count ?? 0;
  const notifications: Notification[] = listData?.data ?? [];

  const handleClick = (n: Notification) => {
    if (!n.isRead) markReadMut.mutate(n.id);
    if (n.issueId) {
      setOpen(false);
      router.push(`/issues/${n.issueId}`);
    }
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "relative",
          padding: "8px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          borderRadius: "8px",
          color: "#94a3b8",
          transition: "color 0.15s, background 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#f1f5f9";
          e.currentTarget.style.background = "#1e293b";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#94a3b8";
          e.currentTarget.style.background = "transparent";
        }}
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#8b5cf6,#6d28d9)",
              color: "white",
              fontSize: 9,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #0f172a",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="animate-fade-in"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 360,
            maxHeight: 480,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 12,
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: "1px solid #334155",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Bell size={15} style={{ color: "#8b5cf6" }} />
              <span style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 14 }}>
                Notifications
              </span>
              {unread > 0 && (
                <span
                  style={{
                    padding: "1px 7px",
                    background: "rgba(139,92,246,0.15)",
                    color: "#a78bfa",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    border: "1px solid rgba(139,92,246,0.3)",
                  }}
                >
                  {unread} unread
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {unread > 0 && (
                <button
                  onClick={() => markAllMut.mutate()}
                  disabled={markAllMut.isPending}
                  title="Mark all as read"
                  style={{
                    padding: "4px 8px",
                    background: "transparent",
                    border: "1px solid #334155",
                    borderRadius: 6,
                    color: "#64748b",
                    cursor: "pointer",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#94a3b8";
                    e.currentTarget.style.borderColor = "#475569";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#64748b";
                    e.currentTarget.style.borderColor = "#334155";
                  }}
                >
                  <CheckCheck size={12} /> All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: 4,
                  background: "transparent",
                  border: "none",
                  borderRadius: 6,
                  color: "#64748b",
                  cursor: "pointer",
                }}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {isLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                <Spinner size={24} />
              </div>
            ) : notifications.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "40px 16px",
                  color: "#475569",
                  gap: 8,
                }}
              >
                <Bell size={28} style={{ opacity: 0.4 }} />
                <p style={{ fontSize: 13 }}>All caught up!</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "12px 16px",
                    cursor: n.issueId ? "pointer" : "default",
                    borderBottom: "1px solid #1e293b",
                    background: n.isRead ? "transparent" : "rgba(139,92,246,0.05)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(51,65,85,0.5)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = n.isRead
                      ? "transparent"
                      : "rgba(139,92,246,0.05)";
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: "rgba(51,65,85,0.8)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 15,
                      flexShrink: 0,
                    }}
                  >
                    {TYPE_ICONS[n.type] ?? "🔔"}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: n.isRead ? 400 : 600,
                        color: n.isRead ? "#94a3b8" : "#e2e8f0",
                        marginBottom: 2,
                        lineHeight: 1.4,
                      }}
                    >
                      {n.title}
                    </p>
                    <p
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        lineHeight: 1.4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n.message}
                    </p>
                    <p style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>

                  {/* Unread dot / mark-read button */}
                  {!n.isRead && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markReadMut.mutate(n.id);
                      }}
                      title="Mark as read"
                      style={{
                        flexShrink: 0,
                        padding: 4,
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "#8b5cf6",
                        borderRadius: 6,
                        alignSelf: "flex-start",
                        marginTop: 2,
                      }}
                    >
                      <Check size={13} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
