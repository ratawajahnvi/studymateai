import { NextResponse } from "next/server";
import { requireStudentSession } from "@/lib/auth/session";
import {
  listAiNotes,
  listFlashcards,
  listQuestions,
  listShortNotes,
  listStudentFocusSessions,
  listStudentMaterials,
  listStudentRevisionData,
  listStudentStudyPlans,
  touchStudentLastActive,
} from "@/lib/db/repository";
import {
  computeFocusStatistics,
  computeStudyPlannerAnalytics,
  partitionRevisionQueue,
} from "@/lib/features/deterministic";
import { toApiErrorResponse } from "@/lib/http/errors";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    await touchStudentLastActive(session.sub);

    const [
      materials,
      aiNotes,
      shortNotes,
      flashcards,
      questions,
      plannerData,
      focusSessions,
      revisionData,
    ] = await Promise.all([
      listStudentMaterials(session.sub),
      listAiNotes(session.sub),
      listShortNotes(session.sub),
      listFlashcards(session.sub),
      listQuestions(session.sub),
      listStudentStudyPlans(session.sub),
      listStudentFocusSessions(session.sub),
      listStudentRevisionData(session.sub),
    ]);

    const activePlan = plannerData.plans[0] ?? null;
    const plannerAnalytics = activePlan
      ? computeStudyPlannerAnalytics(
          activePlan.exam_date,
          plannerData.items.filter((i) => i.plan_id === activePlan.id)
        )
      : null;

    const focusStats = computeFocusStatistics(focusSessions);
    const revisionQueues = partitionRevisionQueue(revisionData.items);

    return NextResponse.json({
      ok: true,
      student: {
        profileId: session.sub,
        studentId: session.identifier,
        fullName: session.displayName,
      },
      counts: {
        materials: materials.length,
        completedMaterials: materials.filter((m) => m.processing_status === "completed").length,
        aiNotes: aiNotes.length,
        shortNotes: shortNotes.length,
        flashcards: flashcards.length,
        questions: questions.length,
      },
      recentMaterials: materials.slice(0, 5),
      plannerAnalytics,
      activePlan,
      focusStats,
      revisionSummary: {
        totalItems: revisionData.items.length,
        dueCount: revisionQueues.dueQueue.length,
        upcomingCount: revisionQueues.upcomingQueue.length,
        weakCount: revisionQueues.weakTopics.length,
        dueItems: revisionQueues.dueQueue.slice(0, 4),
      },
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
