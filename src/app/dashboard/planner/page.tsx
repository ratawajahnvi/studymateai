"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CalendarClock, Plus, CheckCircle2, Clock } from "lucide-react";
import {
  CuteGhostSticker,
  HalloweenEmptyState,
} from "@/components/halloween/Stickers";
import type { StudyPlanItemRecord, StudyPlanRecord } from "@/lib/db/types";
import type { StudyPlannerAnalytics } from "@/lib/features/deterministic";

export default function AiStudyPlannerPage() {
  const [plans, setPlans] = useState<StudyPlanRecord[]>([]);
  const [items, setItems] = useState<StudyPlanItemRecord[]>([]);
  const [analytics, setAnalytics] = useState<StudyPlannerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create Plan Form
  const [title, setTitle] = useState("");
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [dailyTargetHours, setDailyTargetHours] = useState("2.5");
  const [subjectInput, setSubjectInput] = useState("");
  const [topicInput, setTopicInput] = useState("");
  const [durationInput, setDurationInput] = useState("60");
  const [priorityInput, setPriorityInput] = useState<"low" | "medium" | "high">("medium");
  const [draftItems, setDraftItems] = useState<
    Array<{
      subject: string;
      topic: string;
      scheduledDate: string;
      durationMinutes: number;
      priority: "low" | "medium" | "high";
    }>
  >([]);

  const loadPlanner = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/planner");
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to load study planner.");
      } else {
        setPlans(data.plans ?? []);
        setItems(data.items ?? []);
        setAnalytics(data.analytics ?? null);
      }
    } catch {
      setError("Network error while loading planner.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlanner();
  }, [loadPlanner]);

  function addDraftTopic() {
    if (!subjectInput.trim() || !topicInput.trim()) return;
    const scheduledDate = examDate || new Date().toISOString().slice(0, 10);
    setDraftItems((prev) => [
      ...prev,
      {
        subject: subjectInput.trim(),
        topic: topicInput.trim(),
        scheduledDate,
        durationMinutes: Math.max(15, Number(durationInput) || 60),
        priority: priorityInput,
      },
    ]);
    setTopicInput("");
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          examName,
          examDate,
          dailyTargetHours: Number(dailyTargetHours) || 2,
          items: draftItems,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to save study plan.");
      } else {
        setTitle("");
        setExamName("");
        setDraftItems([]);
        await loadPlanner();
      }
    } catch {
      setError("Network error while creating study plan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateItemStatus(
    itemId: string,
    status: StudyPlanItemRecord["status"],
    scheduledDate?: string
  ) {
    try {
      const res = await fetch("/api/planner", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, status, scheduledDate }),
      });
      if (res.ok) {
        await loadPlanner();
      }
    } catch {
      setError("Failed to update schedule item.");
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
        <div className="flex items-center gap-4">
          <CuteGhostSticker className="h-12 w-12 shrink-0" />
          <div>
            <h1 className="text-2xl font-extrabold text-[#fff8ed]">
              Extra Feature 1: AI Study Planner
            </h1>
            <p className="mt-1 text-sm text-[#d8cbe8]">
              Daily and weekly study schedules, subject-wise goals, exam countdown, and
              reschedulable study tasks.
            </p>
          </div>
        </div>
      </header>

      {/* Analytics Summary */}
      {analytics && plans[0] && (
        <section className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-4">
            <span className="text-xs font-bold uppercase text-[#c4b5fd]">Exam Countdown</span>
            <p className="mt-2 text-3xl font-extrabold text-[#ff944d]">
              {analytics.daysUntilExam} Days
            </p>
            <p className="mt-1 text-xs text-[#d8cbe8]">{plans[0].exam_name}</p>
          </div>
          <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-4">
            <span className="text-xs font-bold uppercase text-[#c4b5fd]">Completion</span>
            <p className="mt-2 text-3xl font-extrabold text-[#4ade80]">
              {analytics.completionPercentage}%
            </p>
            <p className="mt-1 text-xs text-[#d8cbe8]">
              {analytics.completedTasks} / {analytics.totalTasks} tasks
            </p>
          </div>
          <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-4">
            <span className="text-xs font-bold uppercase text-[#c4b5fd]">Pending Topics</span>
            <p className="mt-2 text-3xl font-extrabold text-[#fff8ed]">{analytics.pendingTasks}</p>
            <p className="mt-1 text-xs text-[#d8cbe8]">
              {analytics.rescheduledTasks} rescheduled
            </p>
          </div>
          <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-4">
            <span className="text-xs font-bold uppercase text-[#c4b5fd]">Planned Study Time</span>
            <p className="mt-2 text-3xl font-extrabold text-[#fff8ed]">
              {Math.round(analytics.totalPlannedMinutes / 60)}h
            </p>
            <p className="mt-1 text-xs text-[#d8cbe8]">
              {analytics.completedMinutes} mins completed
            </p>
          </div>
        </section>
      )}

      {/* Create Plan Form */}
      <section className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
        <h2 className="text-lg font-bold text-[#fff8ed]">Create Exam Schedule & Subject Goals</h2>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-[#ff6b6b] bg-[#ff6b6b]/15 p-3.5 text-sm text-[#fff8ed]"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleCreatePlan} className="mt-4 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="plan-title" className="block text-xs font-semibold text-[#c4b5fd]">
                Plan Title
              </label>
              <input
                id="plan-title"
                type="text"
                required
                minLength={3}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Fall Midterm Sprint"
                className="mt-1 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-3.5 py-2.5 text-sm text-[#fff8ed]"
              />
            </div>

            <div>
              <label htmlFor="plan-exam-name" className="block text-xs font-semibold text-[#c4b5fd]">
                Target Exam Name
              </label>
              <input
                id="plan-exam-name"
                type="text"
                required
                minLength={2}
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                placeholder="Biochemistry Final"
                className="mt-1 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-3.5 py-2.5 text-sm text-[#fff8ed]"
              />
            </div>

            <div>
              <label htmlFor="plan-exam-date" className="block text-xs font-semibold text-[#c4b5fd]">
                Exam Date
              </label>
              <input
                id="plan-exam-date"
                type="date"
                required
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-3.5 py-2.5 text-sm text-[#fff8ed]"
              />
            </div>

            <div>
              <label htmlFor="plan-hours" className="block text-xs font-semibold text-[#c4b5fd]">
                Daily Target Hours
              </label>
              <input
                id="plan-hours"
                type="text"
                inputMode="decimal"
                required
                value={dailyTargetHours}
                onChange={(e) => setDailyTargetHours(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-3.5 py-2.5 text-sm text-[#fff8ed]"
              />
            </div>
          </div>

          {/* Add Topic Goal Builder */}
          <div className="rounded-2xl border border-[#3e236b] bg-[#21113b] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#ff944d]">
              Add Subject Topics to Schedule
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <label htmlFor="draft-subject" className="block text-xs text-[#d8cbe8]">
                  Subject
                </label>
                <input
                  id="draft-subject"
                  type="text"
                  value={subjectInput}
                  onChange={(e) => setSubjectInput(e.target.value)}
                  placeholder="Biology"
                  className="mt-1 w-full rounded-lg border border-[#3e236b] bg-[#0c0617] px-3 py-2 text-xs text-[#fff8ed]"
                />
              </div>
              <div className="sm:col-span-4">
                <label htmlFor="draft-topic" className="block text-xs text-[#d8cbe8]">
                  Topic
                </label>
                <input
                  id="draft-topic"
                  type="text"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  placeholder="Krebs Cycle & ATP Synthesis"
                  className="mt-1 w-full rounded-lg border border-[#3e236b] bg-[#0c0617] px-3 py-2 text-xs text-[#fff8ed]"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="draft-duration" className="block text-xs text-[#d8cbe8]">
                  Minutes
                </label>
                <input
                  id="draft-duration"
                  type="text"
                  inputMode="numeric"
                  value={durationInput}
                  onChange={(e) => setDurationInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#3e236b] bg-[#0c0617] px-3 py-2 text-xs text-[#fff8ed]"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="draft-priority" className="block text-xs text-[#d8cbe8]">
                  Priority
                </label>
                <select
                  id="draft-priority"
                  value={priorityInput}
                  onChange={(e) =>
                    setPriorityInput(e.target.value as "low" | "medium" | "high")
                  }
                  className="mt-1 w-full rounded-lg border border-[#3e236b] bg-[#0c0617] px-2 py-2 text-xs text-[#fff8ed]"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="flex items-end sm:col-span-1">
                <button
                  type="button"
                  onClick={addDraftTopic}
                  aria-label="Add topic to schedule list"
                  className="flex w-full items-center justify-center rounded-lg bg-[#c4b5fd] py-2 text-xs font-bold text-[#0c0617] hover:bg-[#ddd6fe]"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {draftItems.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2" role="list">
                {draftItems.map((di, idx) => (
                  <li
                    key={idx}
                    className="rounded-lg border border-[#3e236b] bg-[#0c0617] px-3 py-1 text-xs text-[#fff8ed]"
                  >
                    <strong>{di.subject}:</strong> {di.topic} ({di.durationMinutes}m • {di.priority})
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 rounded-xl bg-[#ff7b29] px-5 py-3 text-sm font-bold text-[#0c0617] hover:bg-[#ff944d] disabled:opacity-50"
          >
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            <span>{submitting ? "Saving Study Plan..." : "Save Study Plan"}</span>
          </button>
        </form>
      </section>

      {/* Responsive Container-Query Schedule Table */}
      <section aria-labelledby="schedule-table-caption" className="space-y-4">
        {loading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-[#160b28]" />
        ) : items.length === 0 ? (
          <HalloweenEmptyState
            variant="ghost"
            title="No Scheduled Study Tasks Yet"
            description="Create an exam plan above and add subject topics to track and reschedule your daily goals."
          />
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="schedule-table-caption"
            className="table-wrapper"
          >
            <table className="responsive-data-table text-left text-sm">
              <caption
                id="schedule-table-caption"
                className="border-b border-[#3e236b] bg-[#160b28] p-4 text-left text-base font-bold text-[#fff8ed]"
              >
                Scheduled Topics & Progress ({items.length})
              </caption>
              <thead>
                <tr className="border-b border-[#3e236b] text-xs uppercase text-[#c4b5fd]">
                  <th scope="col" className="px-4 py-3">
                    Topic
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Subject
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Date
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Duration
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3e236b]">
                {items.map((item) => (
                  <tr key={item.id}>
                    <th scope="row" className="px-4 py-3 font-semibold text-[#fff8ed]">
                      {item.topic}
                    </th>
                    <td data-label="Subject" className="px-4 py-3 text-[#d8cbe8]">
                      {item.subject}
                    </td>
                    <td data-label="Date" className="px-4 py-3 text-[#d8cbe8]">
                      <input
                        type="date"
                        aria-label={`Reschedule date for ${item.topic}`}
                        value={item.scheduled_date}
                        onChange={(e) =>
                          handleUpdateItemStatus(item.id, "rescheduled", e.target.value)
                        }
                        className="rounded border border-[#3e236b] bg-[#0c0617] px-2 py-1 text-xs text-[#fff8ed]"
                      />
                    </td>
                    <td data-label="Duration" className="px-4 py-3 text-[#d8cbe8]">
                      {item.duration_minutes} mins
                    </td>
                    <td data-label="Status" className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          item.status === "completed"
                            ? "bg-[#4ade80]/20 text-[#4ade80]"
                            : "bg-[#ff7b29]/20 text-[#ff944d]"
                        }`}
                      >
                        {item.status === "completed" ? (
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <Clock className="h-3 w-3" aria-hidden="true" />
                        )}
                        <span>{item.status}</span>
                      </span>
                    </td>
                    <td data-label="Actions" className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateItemStatus(
                            item.id,
                            item.status === "completed" ? "pending" : "completed"
                          )
                        }
                        aria-label={`Mark ${item.topic} as ${
                          item.status === "completed" ? "pending" : "completed"
                        }`}
                        className="rounded-lg bg-[#ff7b29] px-3 py-1.5 text-xs font-bold text-[#0c0617] hover:bg-[#ff944d]"
                      >
                        {item.status === "completed" ? "Reopen" : "Complete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
