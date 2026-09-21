"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/lib/dashboard-api";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/layout/Sidebar";
import { Avatar, StatusBadge, Spinner } from "@/components/ui";
import { ShieldCheck, UserX, UserCheck } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import type { User } from "@/types";

export default function UsersPage() {
  const { role, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    if (!authLoading && role !== "ADMIN" && role !== "MANAGER") {
      router.replace("/issues");
    }
  }, [role, authLoading, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi.list({ limit: 50 }),
    enabled: role === "ADMIN" || role === "MANAGER",
  });

  const statusMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      usersApi.updateStatus(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const users: User[] = data?.data ?? [];

  const canEdit = role === "ADMIN";

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, background: "#0f172a" }}>
        <div className="p-6 max-w-7xl mx-auto animate-fade-in space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Users</h1>
            <p className="text-slate-400 text-sm mt-0.5">{users.length} members in your organization</p>
          </div>

          <div className="glass-card overflow-hidden">
            {isLoading ? (
              <div className="flex justify-center py-12"><Spinner size={28} /></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                    {canEdit && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} size={34} />
                          <div>
                            <div className="text-slate-200 font-medium text-sm">{u.name}</div>
                            <div className="text-slate-500 text-xs">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck size={13} className="text-violet-400" />
                          <span className="text-slate-300 text-sm">{u.role}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${u.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-slate-500/15 text-slate-400 border-slate-500/30"}`}>
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td><span className="text-slate-400 text-sm">{timeAgo(u.createdAt)}</span></td>
                      {canEdit && (
                        <td>
                          <button
                            onClick={() => statusMut.mutate({ id: u.id, isActive: !u.isActive })}
                            disabled={statusMut.isPending}
                            className="btn-ghost text-xs"
                          >
                            {u.isActive ? (
                              <><UserX size={13} className="text-red-400" /> Deactivate</>
                            ) : (
                              <><UserCheck size={13} className="text-emerald-400" /> Activate</>
                            )}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
