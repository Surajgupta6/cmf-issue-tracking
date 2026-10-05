import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format } from "date-fns";
import type { IssueStatus, Priority } from "@/types";

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format date as relative time ("3 hours ago") */
export function timeAgo(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

/** Format date as readable string */
export function formatDate(dateStr: string): string {
  return format(new Date(dateStr), "MMM d, yyyy HH:mm");
}

/** Status badge color mapping */
export const STATUS_COLORS: Record<IssueStatus, string> = {
  OPEN:        "bg-amber-500/15 text-amber-400 border-amber-500/30",
  ASSIGNED:    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  IN_PROGRESS: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  RESOLVED:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  CLOSED:      "bg-slate-500/15 text-slate-400 border-slate-500/30",
  REOPENED:    "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

/** Priority badge color mapping */
export const PRIORITY_COLORS: Record<Priority, string> = {
  CRITICAL: "bg-red-500/15 text-red-400 border-red-500/30",
  HIGH:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  MEDIUM:   "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  LOW:      "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

/** Priority sort order for UI display */
export const PRIORITY_ORDER: Record<Priority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/** Format file size in human-readable form */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Get user initials for avatar */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
