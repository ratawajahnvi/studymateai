"use client";

import React, { useCallback, useEffect, useState } from "react";
import { BrainCircuit, Plus, AlertTriangle, CheckCircle } from "lucide-react";
import {
  CuteSkeletonSticker,
  HalloweenEmptyState,
} from "@/components/halloween/Stickers";
import type { RevisionHistoryRecord, RevisionItemRecord } from "@/lib/db/types";

export default function SmartRevisionPage() {
  const [dueQueue, setDueQueue] = useState<RevisionItemRecord[]>([]);
  const [upcomingQueue, setUpcomingQueue] = useState<RevisionItemRecord[]>([]);
  const [weakTopics, setWeakTopics] = useState<RevisionItemRecord[]>([]);
  const [history, setHistory] = useState<RevisionHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Revision Item Form
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [summaryPrompt, setSummaryPrompt] = useState("");
  const [keyPointsText, setKeyPointsText] = useState("");
  const [creating, setCreating] = useState(false);

  const loadRevision = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/revision");
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to load revision system.");
      } else {
        setDueQueue(data.dueQueue ?? []);
        setUpcomingQueue(data.upcomingQueue ?? []);
        setWeakTopics(data.weakTopics ?? []);
        setHistory(data.history ?? []);
      }
    } catch {
      setError("Network error loading revision queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRevision();
  }, [loadRevision]);

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    const keyPoints = keyPointsText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);

    try {
      const res = await fetch("/api/revision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          topic,
          summaryPrompt,
          keyPoints: keyPoints.length > 0 ? keyPoints : [summaryPrompt],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to create revision item.");
      } else {
        setSubject("");
        setTopic("");
        setSummaryPrompt("");
        setKeyPointsText("");
        await loadRevision();
      }
    } catch {
      setError("Network error creating revision topic.");
    } finally {
      setCreating(false);
    }
  }

  async function handleReviewRating(revisionItemId: string, qualityRating: number) {
    setError(null);
    try {
      const res = await fetch("/api/revision", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionItemId, qualityRating }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to record review rating.");
      } else {
        await loadRevision();
      }
    } catch {
      setError("Network error recording review.");
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
        <div className="flex items-center gap-4">
          <CuteSkeletonSticker className="h-12 w-12 shrink-0" />
          <div>
            <h1 className="text-2xl font-extrabold text-[#fff8ed]">
              Extra Feature 3: Smart Revision System (SM-2)
            </h1>
            <p className="mt-1 text-sm text-[#d8cbe8]">
              Deterministic SuperMemo-2 spaced repetition queue, weak-topic tracking, and persistent
              review history.
            </p>
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5">
          <span className="text-xs font-bold uppercase text-[#c4b5fd]">Due Today Queue</span>
          <p className="mt-2 text-3xl font-extrabold text-[#ff944d]">{dueQueue.length}</p>
        </div>
        <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5">
          <span className="text-xs font-bold uppercase text-[#c4b5fd]">Upcoming Scheduled</span>
          <p className="mt-2 text-3xl font-extrabold text-[#4ade80]">{upcomingQueue.length}</p>
        </div>
        <div className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5">
          <span className="text-xs font-bold uppercase text-[#c4b5fd]">Weak Topics Tracked</span>
          <p className="mt-2 text-3xl font-extrabold text-[#ff6b6b]">{weakTopics.length}</p>
        </div>
      </section>

      {/* Add Topic Form */}
      <section className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
        <h2 className="text-lg font-bold text-[#fff8ed]">Add Topic to Spaced Repetition Queue</h2>
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-[#ff6b6b] bg-[#ff6b6b]/15 p-3.5 text-sm text-[#fff8ed]"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleCreateItem} className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="rev-subject" className="block text-xs font-semibold text-[#c4b5fd]">
              Subject
            </label>
            <input
              id="rev-subject"
              type="text"
              required
              minLength={2}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Neurobiology"
              className="mt-1 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-3.5 py-2.5 text-sm text-[#fff8ed]"
            />
          </div>

          <div>
            <label htmlFor="rev-topic" className="block text-xs font-semibold text-[#c4b5fd]">
              Topic Name
            </label>
            <input
              id="rev-topic"
              type="text"
              required
              minLength={2}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Synaptic Transmission & Action Potentials"
              className="mt-1 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-3.5 py-2.5 text-sm text-[#fff8ed]"
            />
          </div>

          <div>
            <label htmlFor="rev-prompt" className="block text-xs font-semibold text-[#c4b5fd]">
              Recall Prompt / Core Summary
            </label>
            <textarea
              id="rev-prompt"
              rows={2}
              required
              minLength={5}
              value={summaryPrompt}
              onChange={(e) => setSummaryPrompt(e.target.value)}
              placeholder="Explain voltage-gated Na+ and K+ channel phases during depolarization."
              className="mt-1 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-3.5 py-2.5 text-sm text-[#fff8ed]"
            />
          </div>

          <div>
            <label htmlFor="rev-keypoints" className="block text-xs font-semibold text-[#c4b5fd]">
              Key Checkpoints (One per line)
            </label>
            <textarea
              id="rev-keypoints"
              rows={2}
              value={keyPointsText}
              onChange={(e) => setKeyPointsText(e.target.value)}
              placeholder={"Resting potential -70mV\nThreshold -55mV\nRefractory period"}
              className="mt-1 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-3.5 py-2.5 text-sm text-[#fff8ed]"
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 rounded-xl bg-[#ff7b29] px-5 py-3 text-sm font-bold text-[#0c0617] hover:bg-[#ff944d] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{creating ? "Adding Topic..." : "Add to Revision Queue"}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Due Queue with SM-2 Quality Buttons */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-[#fff8ed]">
          <BrainCircuit className="h-5 w-5 text-[#ff7b29]" aria-hidden="true" />
          <span>Daily Due Revision Queue ({dueQueue.length})</span>
        </h2>

        {loading ? (
          <div className="h-36 animate-pulse rounded-2xl bg-[#160b28]" />
        ) : dueQueue.length === 0 ? (
          <HalloweenEmptyState
            variant="skeleton"
            title="Zero Due Revisions Right Now"
            description="Add a topic above or check your upcoming scheduled topics below."
          />
        ) : (
          <div className="space-y-4">
            {dueQueue.map((item) => (
              <article
                key={item.id}
                className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-6 shadow-xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold uppercase text-[#c4b5fd]">
                      {item.subject}
                    </span>
                    <h3 className="text-lg font-extrabold text-[#fff8ed]">{item.topic}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.is_weak_topic && (
                      <span className="flex items-center gap-1 rounded-full bg-[#ff6b6b]/20 px-3 py-1 text-xs font-bold text-[#ff6b6b]">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Weak Topic</span>
                      </span>
                    )}
                    <span className="rounded-lg bg-[#21113b] px-2.5 py-1 font-mono text-xs text-[#d8cbe8]">
                      Interval: {item.interval_days}d • EF: {item.ease_factor}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-sm text-[#fff8ed]">{item.summary_prompt}</p>
                {item.key_points.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#d8cbe8]">
                    {item.key_points.map((kp, i) => (
                      <li key={i}>{kp}</li>
                    ))}
                  </ul>
                )}

                <div className="mt-5 border-t border-[#3e236b] pt-4">
                  <p className="mb-2 text-xs font-bold text-[#c4b5fd]">
                    Rate Your Recall Quality (SM-2 Spaced Repetition):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { q: 1, label: "1 — Forgot (Reset 1d)" },
                      { q: 2, label: "2 — Hard Struggle" },
                      { q: 3, label: "3 — Good Recall" },
                      { q: 4, label: "4 — Strong Recall" },
                      { q: 5, label: "5 — Perfect Mastery" },
                    ].map((btn) => (
                      <button
                        key={btn.q}
                        type="button"
                        onClick={() => handleReviewRating(item.id, btn.q)}
                        aria-label={`Rate ${item.topic} recall quality ${btn.label}`}
                        className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                          btn.q < 3
                            ? "border border-[#ff6b6b] bg-[#ff6b6b]/15 text-[#ff6b6b] hover:bg-[#ff6b6b] hover:text-[#0c0617]"
                            : "border border-[#4ade80] bg-[#4ade80]/15 text-[#4ade80] hover:bg-[#4ade80] hover:text-[#0c0617]"
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming & Review History */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
          <h2 className="text-base font-bold text-[#fff8ed]">
            Upcoming Scheduled Topics ({upcomingQueue.length})
          </h2>
          {upcomingQueue.length === 0 ? (
            <p className="mt-3 text-xs text-[#d8cbe8]">No upcoming reviews scheduled yet.</p>
          ) : (
            <ul className="mt-3 space-y-2" role="list">
              {upcomingQueue.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between rounded-xl border border-[#3e236b] bg-[#21113b] px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <p className="font-bold text-[#fff8ed]">{u.topic}</p>
                    <p className="text-[#c4b5fd]">{u.subject}</p>
                  </div>
                  <span className="font-mono text-[#ff944d]">
                    Next: {new Date(u.next_review_at).toLocaleDateString()} ({u.interval_days}d)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
          <h2 className="text-base font-bold text-[#fff8ed]">
            Recent Review History ({history.length})
          </h2>
          {history.length === 0 ? (
            <p className="mt-3 text-xs text-[#d8cbe8]">No completed reviews recorded yet.</p>
          ) : (
            <ul className="mt-3 space-y-2" role="list">
              {history.slice(0, 8).map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between rounded-xl border border-[#3e236b] bg-[#0c0617] px-3.5 py-2.5 text-xs"
                >
                  <span className="flex items-center gap-1.5 text-[#fff8ed]">
                    <CheckCircle className="h-3.5 w-3.5 text-[#4ade80]" aria-hidden="true" />
                    <span>Quality Rating: {h.quality_rating}/5</span>
                  </span>
                  <span className="font-mono text-[#c4b5fd]">
                    {h.previous_interval_days}d → {h.new_interval_days}d (EF {h.new_ease_factor})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
