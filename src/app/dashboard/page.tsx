"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  BrainCircuit,
  CalendarClock,
  FileText,
  FolderKanban,
  HelpCircle,
  Layers,
  MessageSquareText,
  RefreshCw,
  Timer,
} from "lucide-react";
import {
  CuteGhostSticker,
  HalloweenEmptyState,
  PumpkinSticker,
} from "@/components/halloween/Stickers";
import { syncClientVaultWithServer } from "@/lib/client/persistenceVault";

interface DashboardResponse {
  ok: boolean;
  error?: string;
  student: {
    profileId: string;
    studentId: string;
    fullName: string;
  };
  counts: {
    materials: number;
    completedMaterials: number;
    aiNotes: number;
    shortNotes: number;
    flashcards: number;
    questions: number;
  };
  recentMaterials: Array<{
    id: string;
    title: string;
    file_extension: string;
    processing_status: string;
    created_at: string;
  }>;
  plannerAnalytics: {
    daysUntilExam: number;
    completionPercentage: number;
    pendingTasks: number;
  } | null;
  activePlan: {
    title: string;
    exam_name: string;
    exam_date: string;
  } | null;
  focusStats: {
    todayFocusMinutes: number;
    weeklyFocusMinutes: number;
    totalCompletedFocusSessions: number;
  };
  revisionSummary: {
    totalItems: number;
    dueCount: number;
    weakCount: number;
    dueItems: Array<{
      id: string;
      subject: string;
      topic: string;
      next_review_at: string;
    }>;
  };
}

export default function StudentDashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await syncClientVaultWithServer();
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to load student dashboard.");
      } else {
        setData(json);
      }
    } catch {
      setError("Network error while loading dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#3e236b] bg-[#160b28] p-6 shadow-xl">
        <div className="flex items-center gap-4">
          <CuteGhostSticker className="h-14 w-14 shrink-0" />
          <div>
            <h1 className="text-2xl font-extrabold text-[#fff8ed]">
              {data ? `Welcome back, ${data.student.fullName}` : "Student Study Sanctuary"}
            </h1>
            <p className="mt-1 text-sm text-[#d8cbe8]">
              Upload materials, generate independent AI study guides, track exams, and master your
              revision queue.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadDashboard}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-[#3e236b] bg-[#21113b] px-4 py-2.5 text-sm font-semibold text-[#fff8ed] hover:border-[#ff7b29] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          <span>Refresh Stats</span>
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-[#ff6b6b] bg-[#ff6b6b]/15 p-4 text-sm text-[#fff8ed]"
        >
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-32 animate-pulse rounded-2xl border border-[#3e236b] bg-[#160b28]"
            />
          ))}
        </div>
      ) : data ? (
        <>
          {/* Core Metrics Grid */}
          <section aria-label="Study Metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#c4b5fd]">
                  Study Materials
                </span>
                <FolderKanban className="h-5 w-5 text-[#ff7b29]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-3xl font-extrabold text-[#fff8ed]">
                {data.counts.completedMaterials}{" "}
                <span className="text-sm font-normal text-[#d8cbe8]">
                  / {data.counts.materials} indexed
                </span>
              </p>
              <Link
                href="/dashboard/materials"
                className="mt-3 inline-block text-xs font-semibold text-[#ff944d] hover:underline"
              >
                Manage study files →
              </Link>
            </div>

            <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#c4b5fd]">
                  Exam Countdown
                </span>
                <CalendarClock className="h-5 w-5 text-[#ff7b29]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-3xl font-extrabold text-[#fff8ed]">
                {data.plannerAnalytics ? `${data.plannerAnalytics.daysUntilExam}d` : "—"}
              </p>
              <p className="mt-1 text-xs text-[#d8cbe8]">
                {data.activePlan
                  ? `${data.activePlan.exam_name} (${data.plannerAnalytics?.completionPercentage ?? 0}% done)`
                  : "No active exam plan yet"}
              </p>
            </div>

            <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#c4b5fd]">
                  Focus Timer
                </span>
                <Timer className="h-5 w-5 text-[#ff7b29]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-3xl font-extrabold text-[#fff8ed]">
                {data.focusStats.todayFocusMinutes}m{" "}
                <span className="text-sm font-normal text-[#d8cbe8]">today</span>
              </p>
              <p className="mt-1 text-xs text-[#d8cbe8]">
                {data.focusStats.weeklyFocusMinutes}m this week •{" "}
                {data.focusStats.totalCompletedFocusSessions} sessions
              </p>
            </div>

            <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#c4b5fd]">
                  Revision Queue
                </span>
                <BrainCircuit className="h-5 w-5 text-[#ff7b29]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-3xl font-extrabold text-[#fff8ed]">
                {data.revisionSummary.dueCount}{" "}
                <span className="text-sm font-normal text-[#d8cbe8]">due today</span>
              </p>
              <p className="mt-1 text-xs text-[#d8cbe8]">
                {data.revisionSummary.weakCount} weak topics flagged
              </p>
            </div>
          </section>

          {/* Independent AI Study Generators Overview */}
          <section aria-labelledby="ai-tools-heading" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="ai-tools-heading" className="text-lg font-bold text-[#fff8ed]">
                Independent AI Study Services
              </h2>
              <PumpkinSticker className="h-7 w-7" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Link
                href="/dashboard/ai-notes"
                className="group rounded-2xl border border-[#3e236b] bg-[#21113b] p-4 transition hover:border-[#ff7b29]"
              >
                <BookOpen className="h-6 w-6 text-[#ff7b29]" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-[#fff8ed] group-hover:text-[#ff944d]">
                  AI Notes
                </h3>
                <p className="mt-1 text-xs text-[#d8cbe8]">
                  {data.counts.aiNotes} detailed structured notes
                </p>
              </Link>

              <Link
                href="/dashboard/short-notes"
                className="group rounded-2xl border border-[#3e236b] bg-[#21113b] p-4 transition hover:border-[#ff7b29]"
              >
                <FileText className="h-6 w-6 text-[#c4b5fd]" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-[#fff8ed] group-hover:text-[#ff944d]">
                  Short Notes
                </h3>
                <p className="mt-1 text-xs text-[#d8cbe8]">
                  {data.counts.shortNotes} rapid revision sheets
                </p>
              </Link>

              <Link
                href="/dashboard/chat"
                className="group rounded-2xl border border-[#3e236b] bg-[#21113b] p-4 transition hover:border-[#ff7b29]"
              >
                <MessageSquareText className="h-6 w-6 text-[#ff7b29]" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-[#fff8ed] group-hover:text-[#ff944d]">
                  AI Chatbot
                </h3>
                <p className="mt-1 text-xs text-[#d8cbe8]">Source-cited study Q&A</p>
              </Link>

              <Link
                href="/dashboard/flashcards"
                className="group rounded-2xl border border-[#3e236b] bg-[#21113b] p-4 transition hover:border-[#ff7b29]"
              >
                <Layers className="h-6 w-6 text-[#c4b5fd]" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-[#fff8ed] group-hover:text-[#ff944d]">
                  Flashcards
                </h3>
                <p className="mt-1 text-xs text-[#d8cbe8]">
                  {data.counts.flashcards} interactive flip cards
                </p>
              </Link>

              <Link
                href="/dashboard/questions"
                className="group rounded-2xl border border-[#3e236b] bg-[#21113b] p-4 transition hover:border-[#ff7b29]"
              >
                <HelpCircle className="h-6 w-6 text-[#ff7b29]" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-[#fff8ed] group-hover:text-[#ff944d]">
                  Questions
                </h3>
                <p className="mt-1 text-xs text-[#d8cbe8]">
                  {data.counts.questions} practice exam questions
                </p>
              </Link>
            </div>
          </section>

          {/* Recent Study Materials & Due Revisions */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section
              aria-labelledby="recent-materials-heading"
              className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 id="recent-materials-heading" className="text-lg font-bold text-[#fff8ed]">
                  Recent Study Materials
                </h2>
                <Link
                  href="/dashboard/materials"
                  className="text-xs font-semibold text-[#ff944d] hover:underline"
                >
                  Upload New →
                </Link>
              </div>

              {data.recentMaterials.length === 0 ? (
                <HalloweenEmptyState
                  variant="ghost"
                  title="No Study Materials Uploaded Yet"
                  description="Upload a PDF, DOCX, PPTX, spreadsheet, or image to unlock AI study tools."
                  action={
                    <Link
                      href="/dashboard/materials"
                      className="rounded-xl bg-[#ff7b29] px-4 py-2 text-xs font-bold text-[#0c0617] hover:bg-[#ff944d]"
                    >
                      Upload First Material
                    </Link>
                  }
                />
              ) : (
                <ul className="space-y-2.5" role="list">
                  {data.recentMaterials.map((mat) => (
                    <li
                      key={mat.id}
                      className="flex items-center justify-between rounded-xl border border-[#3e236b] bg-[#21113b] px-4 py-3"
                    >
                      <div>
                        <p className="font-semibold text-[#fff8ed]">{mat.title}</p>
                        <p className="text-xs uppercase text-[#c4b5fd]">
                          .{mat.file_extension} • {new Date(mat.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          mat.processing_status === "completed"
                            ? "bg-[#4ade80]/20 text-[#4ade80]"
                            : mat.processing_status === "failed"
                              ? "bg-[#ff6b6b]/20 text-[#ff6b6b]"
                              : "bg-[#ff7b29]/20 text-[#ff944d]"
                        }`}
                      >
                        {mat.processing_status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              aria-labelledby="due-revisions-heading"
              className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 id="due-revisions-heading" className="text-lg font-bold text-[#fff8ed]">
                  Due Spaced-Repetition Queue
                </h2>
                <Link
                  href="/dashboard/revision"
                  className="text-xs font-semibold text-[#ff944d] hover:underline"
                >
                  Open Revision System →
                </Link>
              </div>

              {data.revisionSummary.dueItems.length === 0 ? (
                <HalloweenEmptyState
                  variant="pumpkin"
                  title="All Caught Up on Revisions!"
                  description="Add revision cards in the Smart Revision System to schedule automatic SM-2 spaced repetition intervals."
                  action={
                    <Link
                      href="/dashboard/revision"
                      className="rounded-xl bg-[#ff7b29] px-4 py-2 text-xs font-bold text-[#0c0617] hover:bg-[#ff944d]"
                    >
                      Manage Revision Queue
                    </Link>
                  }
                />
              ) : (
                <ul className="space-y-2.5" role="list">
                  {data.revisionSummary.dueItems.map((rev) => (
                    <li
                      key={rev.id}
                      className="flex items-center justify-between rounded-xl border border-[#3e236b] bg-[#21113b] px-4 py-3"
                    >
                      <div>
                        <p className="font-semibold text-[#fff8ed]">{rev.topic}</p>
                        <p className="text-xs text-[#c4b5fd]">{rev.subject}</p>
                      </div>
                      <Link
                        href="/dashboard/revision"
                        className="rounded-lg bg-[#ff7b29] px-3 py-1.5 text-xs font-bold text-[#0c0617] hover:bg-[#ff944d]"
                      >
                        Review Now
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
