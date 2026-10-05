"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Users,
  LogOut,
  Zap,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import NotificationBell from "@/components/layout/NotificationBell";

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: ["ADMIN", "MANAGER", "AGENT"] },
  { href: "/issues",    icon: FileText,         label: "Issues",    roles: ["ADMIN", "MANAGER", "AGENT", "CUSTOMER"] },
  { href: "/users",     icon: Users,            label: "Users",     roles: ["ADMIN", "MANAGER"] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, role, logout } = useAuth();

  const items = NAV_ITEMS.filter((n) => !role || n.roles.includes(role));

  return (
    <aside
      style={{
        width: 240,
        minHeight: "100vh",
        background: "#0f172a",
        borderRight: "1px solid #1e293b",
        display: "flex",
        flexDirection: "column",
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 40,
      }}
    >
      {/* Logo + notification bell */}
      <div className="flex items-center gap-2 px-4 py-5" style={{ borderBottom: "1px solid #1e293b" }}>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg,#8b5cf6,#3b82f6)" }}
        >
          <Zap size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-slate-100 font-semibold text-sm leading-tight">CMF Tracker</div>
          <div className="text-slate-500 text-xs">{role ?? "Loading…"}</div>
        </div>
        <NotificationBell />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                active
                  ? "bg-violet-500/15 text-violet-300"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60",
              )}
            >
              <Icon size={17} className={active ? "text-violet-400" : "text-slate-500 group-hover:text-slate-300"} />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight size={14} className="text-violet-400 opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      {user && (
        <div style={{ borderTop: "1px solid #1e293b" }} className="p-3">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
            <Avatar name={user.name} size={34} />
            <div className="flex-1 min-w-0">
              <div className="text-slate-200 text-sm font-medium truncate">{user.name}</div>
              <div className="text-slate-500 text-xs truncate">{user.email}</div>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="btn-ghost p-1.5"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
