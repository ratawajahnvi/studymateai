import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getSessionFromCookies } from "@/lib/auth/session";
import {
  isAuthorizedAdminEmail,
  isSuperAdminEmail,
  requireAdminCredentials,
} from "@/lib/config/env";
import { AdminDashboardClient } from "./AdminDashboardClient";

export default async function AdminDashboardPage() {
  const session = await getSessionFromCookies();

  if (!session) {
    redirect("/admin/login");
  }

  // Allow both authorized Admins AND the Supreme SuperAdmin to access /admin/dashboard
  if (session.role === "superadmin" && isSuperAdminEmail(session.email)) {
    return (
      <AdminDashboardClient
        adminId={session.email ?? session.identifier}
        displayName={session.displayName}
        isSuperAdmin={true}
      />
    );
  }

  if (session.role === "admin") {
    try {
      const { adminId } = requireAdminCredentials();
      const isAllowed =
        session.identifier === adminId ||
        isAuthorizedAdminEmail(session.email) ||
        isAuthorizedAdminEmail(session.identifier) ||
        session.role === "admin";

      if (isAllowed) {
        return (
          <AdminDashboardClient
            adminId={session.email ?? session.identifier}
            displayName={session.displayName}
            isSuperAdmin={false}
          />
        );
      }
    } catch {
      redirect("/admin/login");
    }
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh items-center justify-center px-4 py-12"
    >
      <div className="max-w-md rounded-3xl border border-[#ff6b6b] bg-[#160b28] p-8 text-center shadow-2xl">
        <ShieldAlert className="mx-auto h-12 w-12 text-[#ff6b6b]" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-extrabold text-[#fff8ed]">
          403 Forbidden — Admin Dashboard Strictly Restricted
        </h1>
        <p className="mt-2 text-sm text-[#d8cbe8]">
          Only authorized Admin accounts are allowed to view the Admin Dashboard. Student accounts
          cannot access admin routes or other students&apos; records.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-xl bg-[#ff7b29] px-5 py-2.5 text-sm font-bold text-[#0c0617] hover:bg-[#ff944d]"
        >
          Return to Student Dashboard
        </Link>
      </div>
    </main>
  );
}
