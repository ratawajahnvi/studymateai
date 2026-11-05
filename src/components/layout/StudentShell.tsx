"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  BrainCircuit,
  CalendarClock,
  Crown,
  FileText,
  FolderKanban,
  HelpCircle,
  Layers,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import {
  BatClusterSticker,
  CuteGhostSticker,
  PumpkinSticker,
  SpookyMoonBadge,
} from "../halloween/Stickers";
import { syncClientVaultWithServer } from "@/lib/client/persistenceVault";

interface StudentShellProps {
  studentId: string;
  fullName: string;
  googleEmail?: string;
  role?: "student" | "admin" | "superadmin";
  children: React.ReactNode;
}

const STUDENT_NAV_ITEMS = [
  { href: "/dashboard", label: "Student Dashboard", icon: LayoutDashboard, group: "Core" },
  { href: "/dashboard/materials", label: "Study Materials", icon: FolderKanban, group: "Core" },
  { href: "/dashboard/ai-notes", label: "AI Notes", icon: BookOpen, group: "AI Study Tools" },
  { href: "/dashboard/short-notes", label: "Short Notes", icon: FileText, group: "AI Study Tools" },
  { href: "/dashboard/chat", label: "AI Chatbot", icon: MessageSquareText, group: "AI Study Tools" },
  { href: "/dashboard/flashcards", label: "Flashcards", icon: Layers, group: "AI Study Tools" },
  { href: "/dashboard/questions", label: "Questions", icon: HelpCircle, group: "AI Study Tools" },
  {
    href: "/dashboard/planner",
    label: "AI Study Planner",
    icon: CalendarClock,
    group: "Extra Features",
  },
  {
    href: "/dashboard/focus",
    label: "Focus + Pomodoro",
    icon: Timer,
    group: "Extra Features",
  },
  {
    href: "/dashboard/revision",
    label: "Smart Revision",
    icon: BrainCircuit,
    group: "Extra Features",
  },
] as const;

export function StudentShell({
  studentId,
  fullName,
  googleEmail,
  role = "student",
  children,
}: StudentShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    void syncClientVaultWithServer();
  }, [pathname]);

  // Modern Web Guidance: Synchronize aria-invalid with CSS :user-invalid on blur/input
  useEffect(() => {
    const syncAria = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        try {
          if (target.matches(":user-invalid")) {
            target.setAttribute("aria-invalid", "true");
          } else {
            target.removeAttribute("aria-invalid");
          }
        } catch {
          // Ignore if browser does not support :user-invalid
        }
      }
    };

    const onBlur = (e: Event) => syncAria(e.target);
    const onInput = (e: Event) => {
      if (e.target instanceof HTMLElement && e.target.hasAttribute("aria-invalid")) {
        syncAria(e.target);
      }
    };

    document.addEventListener("blur", onBlur, true);
    document.addEventListener("input", onInput);
    return () => {
      document.removeEventListener("blur", onBlur, true);
      document.removeEventListener("input", onInput);
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      try {
        window.localStorage.removeItem("studymate_saved_login");
      } catch {
        // Ignore storage error
      }
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/auth");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Sidebar Navigation — Admin Dashboard link rendered ONLY when role === "admin" */}
      <aside className="w-full shrink-0 border-b border-[#3e236b] bg-[#160b28]/95 lg:w-72 lg:border-r lg:border-b-0">
        <div className="flex h-full flex-col justify-between p-5">
          <div>
            {/* Brand Header */}
            <div className="mb-6 flex items-center justify-between rounded-2xl border border-[#3e236b] bg-[#21113b] p-3.5 shadow-md">
              <div className="flex items-center gap-3">
                <PumpkinSticker className="h-9 w-9 shrink-0" />
                <div>
                  <span className="flex items-center gap-1.5 text-base font-bold tracking-tight text-[#fff8ed]">
                    StudyMate AI
                    <Sparkles className="h-3.5 w-3.5 text-[#ff7b29]" aria-hidden="true" />
                  </span>
                  <span className="block text-xs text-[#c4b5fd]">Haunted Study Hall</span>
                </div>
              </div>
              <CuteGhostSticker className="h-8 w-8 shrink-0" />
            </div>

            {/* User Identity Badge */}
            <div className="mb-6 rounded-xl border border-[#3e236b] bg-[#0c0617]/80 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-[#c4b5fd]">
                    {role === "superadmin"
                      ? "Supreme SuperAdmin"
                      : role === "admin"
                        ? "Authorized Administrator"
                        : "Authenticated Student"}
                  </p>
                  <p className="mt-0.5 truncate font-semibold text-[#fff8ed]">{fullName}</p>
                  {googleEmail && (
                    <p className="truncate text-xs text-[#c4b5fd]" title={googleEmail}>
                      {googleEmail}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-block rounded-md border border-[#ff7b29]/40 bg-[#ff7b29]/15 px-2 py-0.5 font-mono text-xs font-bold text-[#ff944d]">
                      {studentId}
                    </span>
                    {role === "superadmin" && (
                      <span className="inline-block rounded-md border border-[#ff7b29] bg-[#ff7b29]/25 px-2 py-0.5 text-[10px] font-extrabold uppercase text-[#ff944d]">
                        SUPERADMIN
                      </span>
                    )}
                    {role === "admin" && (
                      <span className="inline-block rounded-md border border-[#4ade80]/40 bg-[#4ade80]/15 px-2 py-0.5 text-[10px] font-bold uppercase text-[#4ade80]">
                        FULL ACCESS ADMIN
                      </span>
                    )}
                  </div>
                </div>
                <SpookyMoonBadge className="h-10 w-10 shrink-0" />
              </div>
            </div>

            {/* Primary Navigation */}
            <nav aria-label="Student Platform">
              <ul className="space-y-1.5" role="list">
                {role === "superadmin" && (
                  <li className="mb-2">
                    <Link
                      href="/superadmin/dashboard"
                      className="flex items-center gap-3 rounded-xl border-2 border-[#ff7b29] bg-[#ff7b29]/20 px-3.5 py-2.5 text-sm font-extrabold text-[#ff944d] shadow-sm transition hover:bg-[#ff7b29]/30"
                    >
                      <Crown className="h-4 w-4 shrink-0 text-[#ff944d]" aria-hidden="true" />
                      <span>SuperAdmin Console (Only You)</span>
                    </Link>
                  </li>
                )}
                {(role === "admin" || role === "superadmin") && (
                  <li className="mb-3 pb-2 border-b border-[#3e236b]">
                    <Link
                      href="/admin/dashboard"
                      className="flex items-center gap-3 rounded-xl border border-[#4ade80]/60 bg-[#4ade80]/15 px-3.5 py-2.5 text-sm font-bold text-[#4ade80] shadow-sm transition hover:bg-[#4ade80]/25"
                    >
                      <ShieldCheck className="h-4 w-4 shrink-0 text-[#4ade80]" aria-hidden="true" />
                      <span>Admin Dashboard</span>
                    </Link>
                  </li>
                )}
                {STUDENT_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(item.href);

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                          active
                            ? "border border-[#ff7b29] bg-[#ff7b29]/20 text-[#fff8ed] shadow-sm"
                            : "border border-transparent text-[#d8cbe8] hover:border-[#3e236b] hover:bg-[#21113b] hover:text-[#fff8ed]"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            active ? "text-[#ff7b29]" : "text-[#c4b5fd]"
                          }`}
                          aria-hidden="true"
                        />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>

          {/* Footer & Logout */}
          <div className="mt-8 border-t border-[#3e236b] pt-4">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <span className="block text-xs text-[#c4b5fd]">Spooky-Smart Edition</span>
                <span className="block text-[11px] font-semibold text-[#ff944d]">
                  Design and Build by Team Tricksters
                </span>
              </div>
              <BatClusterSticker className="h-6 w-10 shrink-0" />
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#3e236b] bg-[#21113b] px-4 py-2.5 text-sm font-semibold text-[#fff8ed] transition hover:border-[#ff7b29] hover:bg-[#2c184d] disabled:opacity-50"
            >
              <LogOut className="h-4 w-4 text-[#ff7b29]" aria-hidden="true" />
              <span>{loggingOut ? "Signing Out..." : "Sign Out"}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6 lg:p-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
