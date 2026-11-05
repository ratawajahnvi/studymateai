import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getSessionFromCookies } from "@/lib/auth/session";
import { isSuperAdminEmail } from "@/lib/config/env";
import { SuperAdminDashboardClient } from "./SuperAdminDashboardClient";

export default async function SuperAdminDashboardPage() {
  const session = await getSessionFromCookies();

  if (!session) {
    redirect("/auth");
  }

  // Strictly isolated to SuperAdmin (amrendrayadav03321@gmail.com) ONLY.
  // Regular Admins (role === "admin") and Students (role === "student") are strictly blocked.
  if (session.role === "superadmin" && isSuperAdminEmail(session.email)) {
    return (
      <SuperAdminDashboardClient
        superAdminEmail={session.email ?? "amrendrayadav03321@gmail.com"}
        displayName={session.displayName}
      />
    );
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
          403 Forbidden — SuperAdmin Only
        </h1>
        <p className="mt-2 text-sm text-[#d8cbe8]">
          This command center is strictly invisible and inaccessible to both Students and regular
          Administrators. Only the Supreme SuperAdmin account is authorized.
        </p>
        <Link
          href={session.role === "admin" ? "/admin/dashboard" : "/dashboard"}
          className="mt-6 inline-block rounded-xl bg-[#ff7b29] px-5 py-2.5 text-sm font-bold text-[#0c0617] hover:bg-[#ff944d]"
        >
          Return to Authorized Workspace
        </Link>
      </div>
    </main>
  );
}
