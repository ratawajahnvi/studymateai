import React from "react";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth/session";
import { StudentShell } from "@/components/layout/StudentShell";

export default async function StudentDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionFromCookies();

  if (!session) {
    redirect("/auth");
  }

  return (
    <StudentShell
      studentId={session.identifier}
      fullName={session.displayName}
      googleEmail={session.email}
      role={session.role}
    >
      {children}
    </StudentShell>
  );
}
