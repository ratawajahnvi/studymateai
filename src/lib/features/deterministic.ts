import type {
  FocusSessionRecord,
  RevisionItemRecord,
  StudyPlanItemRecord,
} from "../db/types";

// ==============================================================================
// DETERMINISTIC LOGIC 1: AI STUDY PLANNER (Countdown, Daily/Weekly Schedule, Progress)
// No AI API calls wasted on date arithmetic, capacity allocation, or completion stats.
// ==============================================================================

export interface StudyPlannerAnalytics {
  daysUntilExam: number;
  examPassed: boolean;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  rescheduledTasks: number;
  completionPercentage: number;
  totalPlannedMinutes: number;
  completedMinutes: number;
  subjectBreakdown: Array<{
    subject: string;
    total: number;
    completed: number;
    pendingMinutes: number;
  }>;
}

export function computeExamCountdownDays(examDateStr: string, now: Date = new Date()): number {
  const examTime = new Date(`${examDateStr}T23:59:59.999Z`).getTime();
  const diffMs = examTime - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export function computeStudyPlannerAnalytics(
  examDateStr: string,
  items: StudyPlanItemRecord[],
  now: Date = new Date()
): StudyPlannerAnalytics {
  const daysUntilExam = computeExamCountdownDays(examDateStr, now);
  const examPassed = daysUntilExam === 0 && new Date(`${examDateStr}T23:59:59.999Z`) < now;

  let completedTasks = 0;
  let pendingTasks = 0;
  let inProgressTasks = 0;
  let rescheduledTasks = 0;
  let totalPlannedMinutes = 0;
  let completedMinutes = 0;

  const subjectMap = new Map<
    string,
    { subject: string; total: number; completed: number; pendingMinutes: number }
  >();

  for (const item of items) {
    totalPlannedMinutes += item.duration_minutes;
    if (item.status === "completed") {
      completedTasks += 1;
      completedMinutes += item.duration_minutes;
    } else if (item.status === "in_progress") {
      inProgressTasks += 1;
    } else if (item.status === "rescheduled") {
      rescheduledTasks += 1;
    } else {
      pendingTasks += 1;
    }

    const existing = subjectMap.get(item.subject) ?? {
      subject: item.subject,
      total: 0,
      completed: 0,
      pendingMinutes: 0,
    };
    existing.total += 1;
    if (item.status === "completed") {
      existing.completed += 1;
    } else {
      existing.pendingMinutes += item.duration_minutes;
    }
    subjectMap.set(item.subject, existing);
  }

  const totalTasks = items.length;
  const completionPercentage =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    daysUntilExam,
    examPassed,
    totalTasks,
    completedTasks,
    pendingTasks,
    inProgressTasks,
    rescheduledTasks,
    completionPercentage,
    totalPlannedMinutes,
    completedMinutes,
    subjectBreakdown: Array.from(subjectMap.values()),
  };
}

/**
 * Deterministically distributes a list of subjects and topics across available days
 * leading up to the exam date according to the student's daily target hours.
 */
export function generateDeterministicScheduleItems(params: {
  startDate: string; // YYYY-MM-DD
  examDate: string; // YYYY-MM-DD
  dailyTargetHours: number;
  topics: Array<{
    subject: string;
    topic: string;
    durationMinutes?: number;
    priority?: "low" | "medium" | "high";
  }>;
}): Array<{
  subject: string;
  topic: string;
  scheduledDate: string;
  durationMinutes: number;
  priority: "low" | "medium" | "high";
}> {
  if (params.topics.length === 0) return [];

  const dailyCapacityMinutes = Math.max(30, Math.round(params.dailyTargetHours * 60));
  const startMs = new Date(`${params.startDate}T00:00:00.000Z`).getTime();
  const endMs = new Date(`${params.examDate}T00:00:00.000Z`).getTime();
  const maxDays = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)));

  // Sort high-priority topics first
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sortedTopics = [...params.topics].sort(
    (a, b) => priorityOrder[a.priority ?? "medium"] - priorityOrder[b.priority ?? "medium"]
  );

  let dayOffset = 0;
  let usedMinutesToday = 0;

  return sortedTopics.map((t) => {
    const duration = Math.min(240, Math.max(15, t.durationMinutes ?? 60));
    if (usedMinutesToday + duration > dailyCapacityMinutes && usedMinutesToday > 0) {
      dayOffset = (dayOffset + 1) % maxDays;
      usedMinutesToday = 0;
    }

    const scheduledMs = startMs + dayOffset * 24 * 60 * 60 * 1000;
    const scheduledDate = new Date(scheduledMs).toISOString().slice(0, 10);
    usedMinutesToday += duration;

    return {
      subject: t.subject,
      topic: t.topic,
      scheduledDate,
      durationMinutes: duration,
      priority: t.priority ?? "medium",
    };
  });
}

// ==============================================================================
// DETERMINISTIC LOGIC 2: FOCUS MODE + POMODORO STATISTICS
// ==============================================================================

export interface FocusStatisticsSummary {
  todayFocusMinutes: number;
  todayCompletedSessions: number;
  weeklyFocusMinutes: number;
  weeklyCompletedSessions: number;
  totalFocusMinutes: number;
  totalCompletedFocusSessions: number;
  dailyBreakdown: Array<{
    date: string;
    focusMinutes: number;
    sessionsCount: number;
  }>;
}

export function computeFocusStatistics(
  sessions: FocusSessionRecord[],
  now: Date = new Date()
): FocusStatisticsSummary {
  const todayIso = now.toISOString().slice(0, 10);
  const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  let todayFocusSeconds = 0;
  let todayCompletedSessions = 0;
  let weeklyFocusSeconds = 0;
  let weeklyCompletedSessions = 0;
  let totalFocusSeconds = 0;
  let totalCompletedFocusSessions = 0;

  const dailyMap = new Map<string, { focusSeconds: number; sessionsCount: number }>();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dailyMap.set(d, { focusSeconds: 0, sessionsCount: 0 });
  }

  for (const s of sessions) {
    if (s.session_mode !== "focus" || !s.completed) continue;
    const dateKey = s.started_at.slice(0, 10);
    const startedMs = new Date(s.started_at).getTime();

    totalFocusSeconds += s.actual_duration_seconds;
    totalCompletedFocusSessions += 1;

    if (dateKey === todayIso) {
      todayFocusSeconds += s.actual_duration_seconds;
      todayCompletedSessions += 1;
    }

    if (startedMs >= sevenDaysAgoMs) {
      weeklyFocusSeconds += s.actual_duration_seconds;
      weeklyCompletedSessions += 1;
    }

    const bucket = dailyMap.get(dateKey);
    if (bucket) {
      bucket.focusSeconds += s.actual_duration_seconds;
      bucket.sessionsCount += 1;
    }
  }

  const dailyBreakdown = Array.from(dailyMap.entries()).map(([date, val]) => ({
    date,
    focusMinutes: Math.round(val.focusSeconds / 60),
    sessionsCount: val.sessionsCount,
  }));

  return {
    todayFocusMinutes: Math.round(todayFocusSeconds / 60),
    todayCompletedSessions,
    weeklyFocusMinutes: Math.round(weeklyFocusSeconds / 60),
    weeklyCompletedSessions,
    totalFocusMinutes: Math.round(totalFocusSeconds / 60),
    totalCompletedFocusSessions,
    dailyBreakdown,
  };
}

// ==============================================================================
// DETERMINISTIC LOGIC 3: SMART REVISION SYSTEM (SM-2 Spaced Repetition Algorithm)
// ==============================================================================

export interface Sm2ReviewCalculation {
  newIntervalDays: number;
  newEaseFactor: number;
  newRepetitions: number;
  newWeakScore: number;
  isWeakTopic: boolean;
  nextReviewAt: string;
}

/**
 * Deterministic SuperMemo-2 (SM-2) spaced repetition calculation with weak-topic tracking.
 * Quality rating: 0 (complete blackout) to 5 (perfect immediate recall).
 */
export function calculateSm2NextReview(params: {
  qualityRating: number; // 0..5
  currentIntervalDays: number;
  currentEaseFactor: number;
  currentRepetitions: number;
  currentWeakScore: number;
  now?: Date;
}): Sm2ReviewCalculation {
  const q = Math.max(0, Math.min(5, Math.round(params.qualityRating)));
  const now = params.now ?? new Date();

  let newRepetitions = params.currentRepetitions;
  let newIntervalDays = params.currentIntervalDays;
  let newWeakScore = params.currentWeakScore;

  if (q < 3) {
    // Forgot or struggled heavily: reset interval to 1 day and increment weak score
    newRepetitions = 0;
    newIntervalDays = 1;
    newWeakScore = params.currentWeakScore + (q === 0 ? 3 : 2);
  } else {
    if (params.currentRepetitions === 0) {
      newIntervalDays = 1;
    } else if (params.currentRepetitions === 1) {
      newIntervalDays = 3;
    } else {
      newIntervalDays = Math.max(
        1,
        Math.round(params.currentIntervalDays * params.currentEaseFactor)
      );
    }
    newRepetitions = params.currentRepetitions + 1;
    if (q >= 4 && newWeakScore > 0) {
      newWeakScore = Math.max(0, newWeakScore - 1);
    }
  }

  // SM-2 Ease Factor adjustment formula: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const efDelta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  const rawEaseFactor = Number(params.currentEaseFactor) + efDelta;
  const newEaseFactor = Number(Math.max(1.3, Math.min(3.5, rawEaseFactor)).toFixed(2));

  const isWeakTopic = newWeakScore >= 2 || newEaseFactor <= 1.75;
  const nextReviewMs = now.getTime() + newIntervalDays * 24 * 60 * 60 * 1000;

  return {
    newIntervalDays,
    newEaseFactor,
    newRepetitions,
    newWeakScore,
    isWeakTopic,
    nextReviewAt: new Date(nextReviewMs).toISOString(),
  };
}

export function partitionRevisionQueue(
  items: RevisionItemRecord[],
  now: Date = new Date()
): {
  dueQueue: RevisionItemRecord[];
  upcomingQueue: RevisionItemRecord[];
  weakTopics: RevisionItemRecord[];
} {
  const nowMs = now.getTime();
  const dueQueue: RevisionItemRecord[] = [];
  const upcomingQueue: RevisionItemRecord[] = [];
  const weakTopics: RevisionItemRecord[] = [];

  for (const item of items) {
    const dueMs = new Date(item.next_review_at).getTime();
    if (dueMs <= nowMs) {
      dueQueue.push(item);
    } else {
      upcomingQueue.push(item);
    }
    if (item.is_weak_topic) {
      weakTopics.push(item);
    }
  }

  return {
    dueQueue,
    upcomingQueue,
    weakTopics,
  };
}
