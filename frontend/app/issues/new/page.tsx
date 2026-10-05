"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "@/lib/issues-api";
import { categoriesApi } from "@/lib/dashboard-api";
import { AlertCircle, ArrowLeft, FilePlus } from "lucide-react";
import Link from "next/link";
import type { AxiosError } from "axios";

const schema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(200),
  description: z.string().min(10, "Description must be at least 10 characters"),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  categoryId: z.string().uuid("Please select a valid category"),
});
type FormData = z.infer<typeof schema>;

export default function NewIssuePage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: catData } = useQuery({
    queryKey: ["categories"],
    queryFn: categoriesApi.list,
  });
  const categories = catData?.data ?? [];

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { priority: "MEDIUM" },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => issuesApi.create(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["issues"] });
      router.push(`/issues/${res.data.issue.id}`);
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setError("root", { message: err.response?.data?.message ?? "Failed to create issue" });
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/issues" className="btn-ghost p-2">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <FilePlus size={20} className="text-violet-400" /> Create New Issue
          </h1>
          <p className="text-slate-400 text-sm">SLA deadline is auto-calculated from priority</p>
        </div>
      </div>

      {/* Form */}
      <div className="glass-card p-6">
        {errors.root && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 mb-5 text-sm">
            <AlertCircle size={16} />
            {errors.root.message}
          </div>
        )}

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Title *</label>
            <input
              {...register("title")}
              placeholder="Brief, descriptive title for the issue"
              className="input-base"
            />
            {errors.title && <p className="text-red-400 text-xs mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Description *</label>
            <textarea
              {...register("description")}
              placeholder="Describe the issue in detail — steps to reproduce, expected vs actual behavior, environment…"
              rows={5}
              className="input-base resize-none"
            />
            {errors.description && <p className="text-red-400 text-xs mt-1">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Priority *</label>
              <select {...register("priority")} className="input-base">
                <option value="CRITICAL">🔴 Critical — 2h SLA</option>
                <option value="HIGH">🟠 High — 8h SLA</option>
                <option value="MEDIUM">🟡 Medium — 24h SLA</option>
                <option value="LOW">⚪ Low — 72h SLA</option>
              </select>
              {errors.priority && <p className="text-red-400 text-xs mt-1">{errors.priority.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Category *</label>
              <select {...register("categoryId")} className="input-base">
                <option value="">Select category…</option>
                {categories.map((c: { id: string; name: string }) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {errors.categoryId && <p className="text-red-400 text-xs mt-1">{errors.categoryId.message}</p>}
            </div>
          </div>

          <div
            className="text-xs text-slate-500 px-3 py-2 rounded-lg"
            style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.15)" }}
          >
            💡 SLA deadlines are auto-calculated from priority on creation and cannot be changed manually.
            Changing priority later does not recalculate the original SLA commitment.
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary"
            >
              {mutation.isPending ? (
                <><div className="spinner" style={{ width: 15, height: 15 }} /> Creating…</>
              ) : (
                <><FilePlus size={15} /> Create Issue</>
              )}
            </button>
            <Link href="/issues" className="btn-secondary">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
