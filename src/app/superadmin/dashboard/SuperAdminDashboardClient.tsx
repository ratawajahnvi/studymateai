"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  CheckCircle2,
  Crown,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  HalloweenEmptyState,
  PumpkinSticker,
  SpookyMoonBadge,
} from "@/components/halloween/Stickers";
import { ModalDialog } from "@/components/ui/ModalDialog";
import type { AdminStudentOverviewItem, EmailNotificationRecord } from "@/lib/db/types";

export function SuperAdminDashboardClient({
  superAdminEmail,
  displayName,
}: {
  superAdminEmail: string;
  displayName: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminStudentOverviewItem[]>([]);
  const [notifications, setNotifications] = useState<EmailNotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestNotification, setLatestNotification] = useState<EmailNotificationRecord | null>(
    null
  );

  // Add / Promote Admin by Email state
  const [targetEmail, setTargetEmail] = useState("");
  const [targetName, setTargetName] = useState("");
  const [targetRole, setTargetRole] = useState<"admin" | "student">("admin");
  const [addingByEmail, setAddingByEmail] = useState(false);

  // Block user modal state
  const [blockingUser, setBlockingUser] = useState<AdminStudentOverviewItem | null>(null);
  const [blockReason, setBlockReason] = useState(
    "Administrative restriction by SuperAdmin (amrendrayadav03321@gmail.com)."
  );

  const loadSuperAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/users");
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to load SuperAdmin console.");
      } else {
        setUsers(data.users ?? []);
        setNotifications(data.notifications ?? []);
      }
    } catch {
      setError("Network error loading SuperAdmin console.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSuperAdminData();
  }, [loadSuperAdminData]);

  async function handleRoleChange(user: AdminStudentOverviewItem, newRole: "student" | "admin") {
    setActionBusyId(user.profileId);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_role",
          targetProfileId: user.profileId,
          newRole,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to update user role.");
        return;
      }
      if (data.notification) {
        setLatestNotification(data.notification);
      }
      await loadSuperAdminData();
    } catch {
      setError("Network error updating user role.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function confirmBlockOrUnblock(
    user: AdminStudentOverviewItem,
    isBlocked: boolean,
    reasonText?: string
  ) {
    setActionBusyId(user.profileId);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_blocked",
          targetProfileId: user.profileId,
          isBlocked,
          reason: reasonText,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to update account block status.");
        return;
      }
      if (data.notification) {
        setLatestNotification(data.notification);
      }
      setBlockingUser(null);
      await loadSuperAdminData();
    } catch {
      setError("Network error updating block status.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleGrantOrUpdateByEmail(e: React.FormEvent) {
    e.preventDefault();
    setAddingByEmail(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleEmail: targetEmail.trim().toLowerCase(),
          fullName: targetName.trim() || undefined,
          role: targetRole,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to update role by email.");
        return;
      }
      setTargetEmail("");
      setTargetName("");
      if (data.notification) {
        setLatestNotification(data.notification);
      }
      await loadSuperAdminData();
    } catch {
      setError("Network error updating role by email.");
    } finally {
      setAddingByEmail(false);
    }
  }

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
        {/* Supreme SuperAdmin Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border-2 border-[#ff7b29] bg-[#160b28] p-6 shadow-2xl">
          <div className="flex items-center gap-4">
            <PumpkinSticker className="h-12 w-12 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-[#ff944d]" aria-hidden="true" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#ff944d]">
                  Supreme SuperAdmin Command Center • Hidden from All Admins & Students
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-extrabold text-[#fff8ed]">
                {displayName} ({superAdminEmail})
              </h1>
              <p className="mt-0.5 text-xs text-[#c4b5fd]">
                Full authority: Grant or revoke Admin access, block/unblock any user, and dispatch
                instant email notifications.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/dashboard"
              className="flex items-center gap-2 rounded-xl border border-[#4ade80]/60 bg-[#4ade80]/15 px-4 py-2.5 text-sm font-bold text-[#4ade80] hover:bg-[#4ade80]/25"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>Admin Dashboard</span>
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-xl border border-[#c4b5fd]/50 bg-[#21113b] px-4 py-2.5 text-sm font-bold text-[#fff8ed] hover:border-[#ff7b29]"
            >
              <LayoutDashboard className="h-4 w-4 text-[#ff7b29]" aria-hidden="true" />
              <span>Study Platform (/dashboard)</span>
            </Link>
            <button
              type="button"
              onClick={loadSuperAdminData}
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
              <span>Sign Out</span>
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

        {/* Email Notification Confirmation Banner */}
        {latestNotification && (
          <div
            role="status"
            className="rounded-3xl border border-[#4ade80] bg-[#160b28] p-5 shadow-xl"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-extrabold text-[#4ade80]">
                  <MailCheck className="h-5 w-5" aria-hidden="true" />
                  <span>
                    Email Notification Dispatched & Logged for {latestNotification.recipient_email}
                  </span>
                </div>
                <p className="text-xs font-semibold text-[#fff8ed]">
                  Subject: {latestNotification.subject}
                </p>
                <p className="text-xs text-[#c4b5fd]">{latestNotification.provider_message}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={latestNotification.gmail_compose_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-[#4ade80] px-4 py-2 text-xs font-bold text-[#0c0617] hover:bg-[#86efac]"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Send Direct via Gmail (1-Click)</span>
                </a>
                <a
                  href={latestNotification.mailto_url}
                  className="flex items-center gap-1.5 rounded-xl border border-[#3e236b] bg-[#21113b] px-3 py-2 text-xs font-semibold text-[#fff8ed] hover:border-[#ff7b29]"
                >
                  <span>Open in Mail App</span>
                </a>
                <button
                  type="button"
                  onClick={() => setLatestNotification(null)}
                  className="rounded-lg px-2.5 py-1.5 text-xs text-[#c4b5fd] hover:text-[#fff8ed]"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Summary Metrics */}
        <section className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-[#c4b5fd]">Total Users</span>
              <Users className="h-4 w-4 text-[#ff7b29]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-3xl font-extrabold text-[#fff8ed]">{users.length}</p>
          </div>
          <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5">
            <span className="text-xs font-bold uppercase text-[#c4b5fd]">Active Admins</span>
            <p className="mt-2 text-3xl font-extrabold text-[#4ade80]">
              {users.filter((u) => u.roleName === "admin" || u.roleName === "superadmin").length}
            </p>
          </div>
          <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5">
            <span className="text-xs font-bold uppercase text-[#c4b5fd]">Blocked Accounts</span>
            <p className="mt-2 text-3xl font-extrabold text-[#ff6b6b]">
              {users.filter((u) => u.isBlocked).length}
            </p>
          </div>
          <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-[#c4b5fd]">
                Email Alerts Sent
              </span>
              <SpookyMoonBadge className="h-6 w-6" />
            </div>
            <p className="mt-2 text-3xl font-extrabold text-[#ff944d]">{notifications.length}</p>
          </div>
        </section>

        {/* Grant or Revoke Admin Access by Google Email */}
        <section className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-6 shadow-xl">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#fff8ed]">
            <UserPlus className="h-5 w-5 text-[#ff7b29]" aria-hidden="true" />
            <span>Grant or Revoke Admin Access by Google Account Email</span>
          </h2>
          <p className="mt-1 text-xs text-[#c4b5fd]">
            Enter any user&apos;s Google email to immediately make them an Admin or demote them to
            Student (even if they haven&apos;t signed in yet).
          </p>
          <form
            onSubmit={handleGrantOrUpdateByEmail}
            className="mt-4 grid gap-4 sm:grid-cols-12"
          >
            <div className="sm:col-span-5">
              <label
                htmlFor="superadmin-target-email"
                className="block text-xs font-bold uppercase text-[#c4b5fd]"
              >
                Google Account Email
              </label>
              <input
                id="superadmin-target-email"
                type="email"
                required
                value={targetEmail}
                onChange={(e) => setTargetEmail(e.target.value)}
                placeholder="user@gmail.com"
                className="mt-1 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-3.5 py-2.5 text-sm text-[#fff8ed]"
              />
            </div>
            <div className="sm:col-span-3">
              <label
                htmlFor="superadmin-target-name"
                className="block text-xs font-bold uppercase text-[#c4b5fd]"
              >
                Display Name (Optional)
              </label>
              <input
                id="superadmin-target-name"
                type="text"
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                placeholder="Full Name"
                className="mt-1 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-3.5 py-2.5 text-sm text-[#fff8ed]"
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="superadmin-target-role"
                className="block text-xs font-bold uppercase text-[#c4b5fd]"
              >
                Assign Role
              </label>
              <select
                id="superadmin-target-role"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as "admin" | "student")}
                className="mt-1 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-3.5 py-2.5 text-sm text-[#fff8ed]"
              >
                <option value="admin">Grant Admin</option>
                <option value="student">Set as Student</option>
              </select>
            </div>
            <div className="flex items-end sm:col-span-2">
              <button
                type="submit"
                disabled={addingByEmail}
                className="w-full rounded-xl bg-[#ff7b29] px-4 py-2.5 text-sm font-bold text-[#0c0617] hover:bg-[#ff944d] disabled:opacity-50"
              >
                {addingByEmail ? "Saving..." : "Apply Role"}
              </button>
            </div>
          </form>
        </section>

        {/* Complete User Role & Block Management Table */}
        <section aria-labelledby="superadmin-users-caption">
          {loading ? (
            <div className="h-48 animate-pulse rounded-3xl border border-[#3e236b] bg-[#160b28]" />
          ) : users.length === 0 ? (
            <HalloweenEmptyState
              variant="haunted"
              title="No Users Registered Yet"
              description="Use the form above to pre-authorize Admins or sign in via /auth."
            />
          ) : (
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="superadmin-users-caption"
              className="table-wrapper"
            >
              <table className="responsive-data-table text-left text-sm">
                <caption
                  id="superadmin-users-caption"
                  className="border-b border-[#3e236b] bg-[#160b28] p-4 text-left text-base font-bold text-[#fff8ed]"
                >
                  All Accounts — SuperAdmin Role & Block Controls ({users.length})
                </caption>
                <thead>
                  <tr className="border-b border-[#3e236b] text-xs uppercase text-[#c4b5fd]">
                    <th scope="col" className="px-4 py-3">
                      User & Role
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Google Email
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Student ID
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Account Status
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Study Activity
                    </th>
                    <th scope="col" className="px-4 py-3">
                      SuperAdmin Actions (Admin Access & Block)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3e236b]">
                  {users.map((u) => {
                    const isSelfSuperAdmin =
                      u.roleName === "superadmin" ||
                      u.googleEmail?.toLowerCase() === superAdminEmail.toLowerCase();
                    const busy = actionBusyId === u.profileId;

                    return (
                      <tr key={u.profileId}>
                        <th scope="row" className="px-4 py-3 font-bold text-[#fff8ed]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{u.fullName}</span>
                            {u.roleName === "superadmin" ? (
                              <span className="rounded-md border border-[#ff7b29] bg-[#ff7b29]/20 px-2 py-0.5 text-[10px] font-extrabold uppercase text-[#ff944d]">
                                SUPERADMIN
                              </span>
                            ) : u.roleName === "admin" ? (
                              <span className="rounded-md border border-[#4ade80]/50 bg-[#4ade80]/15 px-2 py-0.5 text-[10px] font-bold uppercase text-[#4ade80]">
                                ADMIN
                              </span>
                            ) : (
                              <span className="rounded-md border border-[#3e236b] bg-[#21113b] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#c4b5fd]">
                                STUDENT
                              </span>
                            )}
                          </div>
                        </th>
                        <td data-label="Google Email" className="px-4 py-3 text-xs text-[#c4b5fd]">
                          {u.googleEmail ?? "—"}
                        </td>
                        <td
                          data-label="Student ID"
                          className="px-4 py-3 font-mono text-xs text-[#ff944d]"
                        >
                          {u.studentId}
                        </td>
                        <td data-label="Account Status" className="px-4 py-3 text-xs">
                          {u.isBlocked ? (
                            <div>
                              <span className="inline-flex items-center gap-1 rounded-md border border-[#ff6b6b] bg-[#ff6b6b]/20 px-2 py-0.5 font-bold text-[#ff6b6b]">
                                <Ban className="h-3 w-3" aria-hidden="true" />
                                BLOCKED
                              </span>
                              {u.blockedReason && (
                                <p className="mt-1 text-[11px] text-[#d8cbe8]">
                                  {u.blockedReason}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md border border-[#4ade80]/40 bg-[#4ade80]/15 px-2 py-0.5 font-bold text-[#4ade80]">
                              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                              ACTIVE
                            </span>
                          )}
                        </td>
                        <td data-label="Activity" className="px-4 py-3 text-xs text-[#d8cbe8]">
                          {u.completedMaterialsCount}/{u.materialsCount} files •{" "}
                          {u.totalFocusMinutes}m focus • {u.totalReviewsCompleted} reviews
                        </td>
                        <td data-label="SuperAdmin Actions" className="px-4 py-3">
                          {isSelfSuperAdmin ? (
                            <span className="text-xs font-semibold text-[#ff944d]">
                              Protected Supreme SuperAdmin
                            </span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              {u.roleName === "admin" ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleRoleChange(u, "student")}
                                  className="flex items-center gap-1.5 rounded-lg border border-[#ff944d]/50 bg-[#21113b] px-3 py-1.5 text-xs font-bold text-[#ff944d] hover:bg-[#ff7b29]/20 disabled:opacity-50"
                                >
                                  <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>Remove Admin</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleRoleChange(u, "admin")}
                                  className="flex items-center gap-1.5 rounded-lg border border-[#4ade80]/50 bg-[#4ade80]/15 px-3 py-1.5 text-xs font-bold text-[#4ade80] hover:bg-[#4ade80]/25 disabled:opacity-50"
                                >
                                  <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>Make Admin</span>
                                </button>
                              )}

                              {u.isBlocked ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => confirmBlockOrUnblock(u, false)}
                                  className="flex items-center gap-1.5 rounded-lg bg-[#4ade80] px-3 py-1.5 text-xs font-bold text-[#0c0617] hover:bg-[#86efac] disabled:opacity-50"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>Unblock & Notify</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setBlockingUser(u);
                                    setBlockReason(
                                      "Your account has been restricted by the StudyMate AI SuperAdmin."
                                    );
                                  }}
                                  className="flex items-center gap-1.5 rounded-lg border border-[#ff6b6b] bg-[#ff6b6b]/20 px-3 py-1.5 text-xs font-bold text-[#ff6b6b] hover:bg-[#ff6b6b]/30 disabled:opacity-50"
                                >
                                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>Block & Send Email</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Email Notification History Log */}
        {notifications.length > 0 && (
          <section className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-6 shadow-xl">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-[#fff8ed]">
              <MailCheck className="h-5 w-5 text-[#4ade80]" aria-hidden="true" />
              <span>Sent Email Notifications Log ({notifications.length})</span>
            </h2>
            <div className="mt-4 space-y-3">
              {notifications.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#3e236b] bg-[#0c0617]/80 p-3.5 text-xs"
                >
                  <div>
                    <p className="font-bold text-[#fff8ed]">
                      To: <span className="text-[#ff944d]">{n.recipient_email}</span> — {n.subject}
                    </p>
                    <p className="mt-0.5 text-[#c4b5fd]">
                      {new Date(n.created_at).toLocaleString()} • {n.provider_message}
                    </p>
                  </div>
                  <a
                    href={n.gmail_compose_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-lg border border-[#4ade80]/50 bg-[#4ade80]/15 px-3 py-1.5 font-bold text-[#4ade80] hover:bg-[#4ade80]/25"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Send / Resend via Gmail</span>
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="pt-4 text-center text-xs text-[#c4b5fd]">
          StudyMate AI SuperAdmin Console •{" "}
          <strong className="font-bold text-[#ff944d]">Design and Build by Team Tricksters</strong>
        </div>
      </main>

      {/* Block User Confirmation & Email Notification Modal */}
      <ModalDialog
        open={Boolean(blockingUser)}
        onClose={() => setBlockingUser(null)}
        title={`Block Account & Notify ${blockingUser?.fullName ?? "User"}`}
      >
        {blockingUser && (
          <div className="space-y-4">
            <p className="text-sm text-[#d8cbe8]">
              Blocking{" "}
              <strong className="text-[#fff8ed]">
                {blockingUser.fullName} ({blockingUser.googleEmail ?? blockingUser.studentId})
              </strong>{" "}
              will immediately revoke their login and session access and dispatch an email
              notification to their Google Account.
            </p>

            <div>
              <label
                htmlFor="block-reason-input"
                className="block text-xs font-bold uppercase text-[#c4b5fd]"
              >
                Block Reason (Included in Email Notification)
              </label>
              <textarea
                id="block-reason-input"
                rows={3}
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] p-3 text-sm text-[#fff8ed]"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setBlockingUser(null)}
                className="rounded-xl border border-[#3e236b] bg-[#21113b] py-2.5 text-sm font-semibold text-[#fff8ed]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusyId === blockingUser.profileId}
                onClick={() => confirmBlockOrUnblock(blockingUser, true, blockReason)}
                className="rounded-xl bg-[#ff6b6b] py-2.5 text-sm font-bold text-[#0c0617] hover:bg-[#ff8787] disabled:opacity-50"
              >
                {actionBusyId === blockingUser.profileId
                  ? "Blocking & Sending Email..."
                  : "Confirm Block & Send Email"}
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
