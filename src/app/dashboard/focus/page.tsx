"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, CheckCircle2, Timer } from "lucide-react";
import {
  HalloweenEmptyState,
  SpookyMoonBadge,
} from "@/components/halloween/Stickers";
import type { FocusSessionRecord } from "@/lib/db/types";
import type { FocusStatisticsSummary } from "@/lib/features/deterministic";

export default function FocusPomodoroPage() {
  const [mode, setMode] = useState<"focus" | "short_break" | "long_break">("focus");
  const [customMinutes, setCustomMinutes] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [topicLabel, setTopicLabel] = useState("");
  const startedAtRef = useRef<string | null>(null);

  const [sessions, setSessions] = useState<FocusSessionRecord[]>([]);
  const [stats, setStats] = useState<FocusStatisticsSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFocusData = useCallback(async () => {
    try {
      const res = await fetch("/api/focus");
      const data = await res.json();
      if (res.ok && data.ok) {
        setSessions(data.sessions ?? []);
        setStats(data.statistics ?? null);
      }
    } catch {
      // Ignore initial fetch failure
    }
  }, []);

  useEffect(() => {
    void loadFocusData();
  }, [loadFocusData]);

  const persistSession = useCallback(
    async (completed: boolean, elapsedSeconds: number) => {
      if (elapsedSeconds < 5) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/focus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionMode: mode,
            plannedDurationMinutes: customMinutes,
            actualDurationSeconds: elapsedSeconds,
            completed,
            topicLabel: topicLabel.trim() || undefined,
            startedAt: startedAtRef.current ?? new Date().toISOString(),
            endedAt: new Date().toISOString(),
          }),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          setStats(data.statistics);
          setSessions((prev) => [data.session, ...prev]);
        } else {
          setError(data.error ?? "Could not save focus session.");
        }
      } catch {
        setError("Network error saving focus session.");
      } finally {
        setSaving(false);
        startedAtRef.current = null;
      }
    },
    [customMinutes, mode, topicLabel]
  );

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setRunning(false);
          void persistSession(true, customMinutes * 60);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running, customMinutes, persistSession]);

  function selectPreset(newMode: "focus" | "short_break" | "long_break", mins: number) {
    setRunning(false);
    setMode(newMode);
    setCustomMinutes(mins);
    setSecondsLeft(mins * 60);
    startedAtRef.current = null;
  }

  function handleStartPause() {
    if (!running && !startedAtRef.current) {
      startedAtRef.current = new Date().toISOString();
    }
    setRunning((r) => !r);
  }

  function handleReset() {
    setRunning(false);
    setSecondsLeft(customMinutes * 60);
    startedAtRef.current = null;
  }

  async function handleFinishAndLogNow() {
    const elapsed = Math.max(60, customMinutes * 60 - secondsLeft);
    setRunning(false);
    await persistSession(true, elapsed);
    setSecondsLeft(customMinutes * 60);
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
        <div className="flex items-center gap-4">
          <SpookyMoonBadge className="h-12 w-12 shrink-0" />
          <div>
            <h1 className="text-2xl font-extrabold text-[#fff8ed]">
              Extra Feature 2: Focus Mode + Pomodoro Timer
            </h1>
            <p className="mt-1 text-sm text-[#d8cbe8]">
              Default 25-minute focus and 5-minute break cycles, custom durations, and persisted
              daily/weekly focus statistics.
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#ff6b6b] bg-[#ff6b6b]/15 p-3.5 text-sm text-[#fff8ed]"
        >
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Timer Card */}
        <section className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-8 text-center shadow-xl lg:col-span-7">
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => selectPreset("focus", 25)}
              aria-pressed={mode === "focus" && customMinutes === 25}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                mode === "focus"
                  ? "bg-[#ff7b29] text-[#0c0617]"
                  : "border border-[#3e236b] bg-[#21113b] text-[#d8cbe8]"
              }`}
            >
              Focus (25 min)
            </button>
            <button
              type="button"
              onClick={() => selectPreset("short_break", 5)}
              aria-pressed={mode === "short_break"}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                mode === "short_break"
                  ? "bg-[#ff7b29] text-[#0c0617]"
                  : "border border-[#3e236b] bg-[#21113b] text-[#d8cbe8]"
              }`}
            >
              Short Break (5 min)
            </button>
            <button
              type="button"
              onClick={() => selectPreset("long_break", 15)}
              aria-pressed={mode === "long_break"}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                mode === "long_break"
                  ? "bg-[#ff7b29] text-[#0c0617]"
                  : "border border-[#3e236b] bg-[#21113b] text-[#d8cbe8]"
              }`}
            >
              Long Break (15 min)
            </button>
          </div>

          <div className="my-8">
            <p className="font-mono text-7xl font-black tracking-tight text-[#fff8ed]">
              {mm}:{ss}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-[#c4b5fd]">
              {mode.replace("_", " ")} session
            </p>
          </div>

          <div className="mx-auto max-w-md space-y-3 text-left">
            <div>
              <label htmlFor="focus-topic" className="block text-xs font-semibold text-[#c4b5fd]">
                Focus Topic Label
              </label>
              <input
                id="focus-topic"
                type="text"
                value={topicLabel}
                onChange={(e) => setTopicLabel(e.target.value)}
                placeholder="e.g., Organic Chemistry Mechanisms"
                className="mt-1 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-3.5 py-2 text-sm text-[#fff8ed]"
              />
            </div>

            <div>
              <label htmlFor="custom-minutes" className="block text-xs font-semibold text-[#c4b5fd]">
                Custom Duration (Minutes: 1–180)
              </label>
              <input
                id="custom-minutes"
                type="text"
                inputMode="numeric"
                value={customMinutes}
                onChange={(e) => {
                  const val = Math.min(180, Math.max(1, Number(e.target.value) || 25));
                  setCustomMinutes(val);
                  if (!running) setSecondsLeft(val * 60);
                }}
                className="mt-1 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-3.5 py-2 text-sm text-[#fff8ed]"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={handleStartPause}
              className="flex items-center gap-2 rounded-xl bg-[#ff7b29] px-6 py-3 text-sm font-bold text-[#0c0617] hover:bg-[#ff944d]"
            >
              {running ? (
                <>
                  <Pause className="h-4 w-4" aria-hidden="true" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" aria-hidden="true" />
                  <span>{secondsLeft < customMinutes * 60 ? "Resume" : "Start Timer"}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-2 rounded-xl border border-[#3e236b] bg-[#21113b] px-5 py-3 text-sm font-bold text-[#fff8ed] hover:border-[#ff7b29]"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Reset</span>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={handleFinishAndLogNow}
              className="flex items-center gap-2 rounded-xl border border-[#4ade80] bg-[#4ade80]/15 px-5 py-3 text-sm font-bold text-[#4ade80] hover:bg-[#4ade80] hover:text-[#0c0617] disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>{saving ? "Saving..." : "Complete & Save Session"}</span>
            </button>
          </div>
        </section>

        {/* Statistics & History */}
        <section className="space-y-4 rounded-3xl border border-[#3e236b] bg-[#160b28] p-6 lg:col-span-5">
          <h2 className=" flex items-center gap-2 text-lg font-bold text-[#fff8ed]">
            <Timer className="h-5 w-5 text-[#ff7b29]" aria-hidden="true" />
            <span>Daily & Weekly Focus Statistics</span>
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[#3e236b] bg-[#21113b] p-4">
              <span className="text-xs text-[#c4b5fd]">Today Focus</span>
              <p className="mt-1 text-2xl font-extrabold text-[#ff944d]">
                {stats?.todayFocusMinutes ?? 0} mins
              </p>
              <p className="text-xs text-[#d8cbe8]">
                {stats?.todayCompletedSessions ?? 0} sessions
              </p>
            </div>
            <div className="rounded-2xl border border-[#3e236b] bg-[#21113b] p-4">
              <span className="text-xs text-[#c4b5fd]">Last 7 Days</span>
              <p className="mt-1 text-2xl font-extrabold text-[#4ade80]">
                {stats?.weeklyFocusMinutes ?? 0} mins
              </p>
              <p className="text-xs text-[#d8cbe8]">
                {stats?.weeklyCompletedSessions ?? 0} sessions
              </p>
            </div>
          </div>

          <h3 className="pt-2 text-sm font-bold text-[#fff8ed]">Saved Focus History</h3>
          {sessions.length === 0 ? (
            <HalloweenEmptyState
              variant="ghost"
              title="No Saved Sessions Yet"
              description="Start a Pomodoro session and complete it to build your focus history."
            />
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1" role="list">
              {sessions.slice(0, 10).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-[#3e236b] bg-[#0c0617] px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <p className="font-bold text-[#fff8ed]">
                      {s.topic_label || s.session_mode.replace("_", " ").toUpperCase()}
                    </p>
                    <p className="text-[#c4b5fd]">
                      {new Date(s.started_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-[#4ade80]">
                    {Math.round(s.actual_duration_seconds / 60)}m
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
