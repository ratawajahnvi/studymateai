"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, LayoutDashboard, LogOut, RefreshCw, ShieldCheck, Users } from "lucide-react";
import {
  HalloweenEmptyState,
  PumpkinSticker,
  SpookyMoonBadge,
} from "@/components/halloween/Stickers";
import type { AdminStudentOverviewItem } from "@/lib/db/types";

export function AdminDashboardClient({
  adminId,
  displayName,
  isSuperAdmin = false,
}: {
  adminId: string;
  displayName?: string;
  isSuperAdmin?: boolean;
}) {
  const router = useRouter();
  const [students, setStudents] = useState<AdminStudentOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/overview");
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to load Admin overview.");
      } else {
        setStudents(data.students ?? []);
      }
    } catch {
      setError("Network error loading Admin overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  async function handleLogout() {
    try {
      window.localStorage.removeItem("studymate_saved_login");
    } catch {
      // Ignore storage error
    }
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/auth");
    router.refresh();
  }

  return (
    <div className="min-h-dvh p-6 lg:p-10">
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#3e236b] bg-[#160b28] p-6 shadow-xl">
          <div className="flex items-center gap-4">
            <PumpkinSticker className="h-12 w-12 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#4ade80]" aria-hidden="true" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#4ade80]">
                  Exclusive Admin Control Center • {displayName ? `${displayName} (${adminId})` : adminId}
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-extrabold text-[#fff8ed]">
                StudyMate AI — Complete Platform & Student Activity Overview
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isSuperAdmin && (
              <Link
                href="/superadmin/dashboard"
                className="flex items-center gap-2 rounded-xl border-2 border-[#ff7b29] bg-[#ff7b29]/20 px-4 py-2.5 text-sm font-extrabold text-[#ff944d] hover:bg-[#ff7b29]/30"
              >
                <Crown className="h-4 w-4" aria-hidden="true" />
                <span>SuperAdmin Console (Only You)</span>
              </Link>
            )}
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-xl border border-[#4ade80]/60 bg-[#4ade80]/15 px-4 py-2.5 text-sm font-bold text-[#4ade80] hover:bg-[#4ade80]/25"
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              <span>Open All Study Features (/dashboard)</span>
            </Link>
            <button
              type="button"
              onClick={loadOverview}
              className="flex items-center gap-2 rounded-xl border border-[#3e236b] bg-[#21113b] px-4 py-2.5 text-sm font-semibold text-[#fff8ed] hover:border-[#ff7b29]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-xl bg-[#ff7b29] px-4 py-2.5 text-sm font-bold text-[#0c0617] hover:bg-[#ff944d]"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>Sign Out Admin</span>
            </button>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-[#ff6b6b] bg-[#ff6b6b]/15 p-4 text-sm text-[#fff8ed]"
          >
            {error}
          </div>
        )}

        {/* High-level Aggregate Metrics */}
        <section className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-[#c4b5fd]">Total Accounts</span>
              <Users className="h-4 w-4 text-[#ff7b29]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-3xl font-extrabold text-[#fff8ed]">{students.length}</p>
          </div>
          <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5">
            <span className="text-xs font-bold uppercase text-[#c4b5fd]">Indexed Materials</span>
            <p className="mt-2 text-3xl font-extrabold text-[#ff944d]">
              {students.reduce((sum, s) => sum + s.completedMaterialsCount, 0)}
            </p>
          </div>
          <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5">
            <span className="text-xs font-bold uppercase text-[#c4b5fd]">Total Focus Minutes</span>
            <p className="mt-2 text-3xl font-extrabold text-[#4ade80]">
              {students.reduce((sum, s) => sum + s.totalFocusMinutes, 0)}m
            </p>
          </div>
          <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-[#c4b5fd]">Reviews Completed</span>
              <SpookyMoonBadge className="h-6 w-6" />
            </div>
            <p className="mt-2 text-3xl font-extrabold text-[#fff8ed]">
              {students.reduce((sum, s) => sum + s.totalReviewsCompleted, 0)}
            </p>
          </div>
        </section>

        {/* Responsive Container-Query Data Table */}
        <section aria-labelledby="admin-students-table-caption">
          {loading ? (
            <div className="h-48 animate-pulse rounded-3xl border border-[#3e236b] bg-[#160b28]" />
          ) : students.length === 0 ? (
            <HalloweenEmptyState
              variant="haunted"
              title="No Registered Accounts Found"
              description="Users who sign in with their Google Account via /auth will appear here with their progress metrics."
            />
          ) : (
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="admin-students-table-caption"
              className="table-wrapper"
            >
              <table className="responsive-data-table text-left text-sm">
                <caption
                  id="admin-students-table-caption"
                  className="border-b border-[#3e236b] bg-[#160b28] p-4 text-left text-base font-bold text-[#fff8ed]"
                >
                  Registered Google Accounts & Student Activity Overview ({students.length})
                </caption>
                <thead>
                  <tr className="border-b border-[#3e236b] text-xs uppercase text-[#c4b5fd]">
                    <th scope="col" className="px-4 py-3">
                      Name & Role
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Google Account
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Unique ID
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Registered
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Last Active
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Study Activity
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Planner Progress
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Focus Sessions
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Revision Progress
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3e236b]">
                  {students.map((st) => (
                    <tr key={st.profileId}>
                      <th scope="row" className="px-4 py-3 font-bold text-[#fff8ed]">
                        <div className="flex items-center gap-2">
                          <span>{st.fullName}</span>
                          {st.roleName === "superadmin" && (
                            <span className="rounded-md border border-[#ff7b29] bg-[#ff7b29]/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-[#ff944d]">
                              SUPERADMIN
                            </span>
                          )}
                          {st.roleName === "admin" && (
                            <span className="rounded-md border border-[#4ade80]/50 bg-[#4ade80]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#4ade80]">
                              ADMIN
                            </span>
                          )}
                        </div>
                      </th>
                      <td data-label="Google Account" className="px-4 py-3 text-xs text-[#c4b5fd]">
                        {st.googleEmail ?? "—"}
                      </td>
                      <td data-label="Student ID" className="px-4 py-3 font-mono text-[#ff944d]">
                        {st.studentId}
                      </td>
                      <td data-label="Registered" className="px-4 py-3 text-xs text-[#d8cbe8]">
                        {new Date(st.registeredAt).toLocaleDateString()}
                      </td>
                      <td data-label="Last Active" className="px-4 py-3 text-xs text-[#d8cbe8]">
                        {new Date(st.lastActiveAt).toLocaleString()}
                      </td>
                      <td data-label="Study Activity" className="px-4 py-3 text-xs text-[#fff8ed]">
                        {st.completedMaterialsCount}/{st.materialsCount} materials processed
                      </td>
                      <td data-label="Planner Progress" className="px-4 py-3 text-xs text-[#fff8ed]">
                        {st.plannerProgressPercent}% ({st.plannerCompletedTasks}/
                        {st.plannerTotalTasks} tasks)
                      </td>
                      <td data-label="Focus Sessions" className="px-4 py-3 text-xs text-[#4ade80]">
                        {st.focusSessionsCompleted} sessions ({st.totalFocusMinutes}m)
                      </td>
                      <td
                        data-label="Revision Progress"
                        className="px-4 py-3 text-xs text-[#c4b5fd]"
                      >
                        {st.totalReviewsCompleted} reviews • {st.revisionDueItems} due •{" "}
                        {st.revisionWeakTopicsCount} weak
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="pt-4 text-center text-xs text-[#c4b5fd]">
          StudyMate AI Admin Control Center •{" "}
          <strong className="font-bold text-[#ff944d]">Design and Build by Team Tricksters</strong>
        </div>
      </main>
    </div>
  );
}
