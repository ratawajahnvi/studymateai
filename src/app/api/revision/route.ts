import { NextRequest, NextResponse } from "next/server";
import { requireStudentSession } from "@/lib/auth/session";
import {
  applyRevisionReviewUpdate,
  createRevisionItem,
  getOwnedRevisionItem,
  listStudentRevisionData,
  touchStudentLastActive,
} from "@/lib/db/repository";
import {
  calculateSm2NextReview,
  partitionRevisionQueue,
} from "@/lib/features/deterministic";
import { toApiErrorResponse } from "@/lib/http/errors";
import {
  CreateRevisionItemSchema,
  SubmitRevisionReviewSchema,
} from "@/lib/validation/schemas";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    const { items, history } = await listStudentRevisionData(session.sub);
    const queues = partitionRevisionQueue(items);

    return NextResponse.json({
      ok: true,
      items,
      history,
      dueQueue: queues.dueQueue,
      upcomingQueue: queues.upcomingQueue,
      weakTopics: queues.weakTopics,
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    await touchStudentLastActive(session.sub);

    const body = await request.json();
    const parsed = CreateRevisionItemSchema.parse(body);

    const created = await createRevisionItem({
      studentProfileId: session.sub,
      materialId: parsed.materialId,
      subject: parsed.subject,
      topic: parsed.topic,
      summaryPrompt: parsed.summaryPrompt,
      keyPoints: parsed.keyPoints,
    });

    return NextResponse.json({ ok: true, item: created }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    await touchStudentLastActive(session.sub);

    const body = await request.json();
    const parsed = SubmitRevisionReviewSchema.parse(body);

    const existing = await getOwnedRevisionItem(session.sub, parsed.revisionItemId);
    const now = new Date();
    const sm2 = calculateSm2NextReview({
      qualityRating: parsed.qualityRating,
      currentIntervalDays: existing.interval_days,
      currentEaseFactor: Number(existing.ease_factor),
      currentRepetitions: existing.repetitions,
      currentWeakScore: existing.weak_score,
      now,
    });

    const result = await applyRevisionReviewUpdate({
      studentProfileId: session.sub,
      revisionItemId: existing.id,
      qualityRating: parsed.qualityRating,
      previousIntervalDays: existing.interval_days,
      newIntervalDays: sm2.newIntervalDays,
      previousEaseFactor: Number(existing.ease_factor),
      newEaseFactor: sm2.newEaseFactor,
      newRepetitions: sm2.newRepetitions,
      newWeakScore: sm2.newWeakScore,
      isWeakTopic: sm2.isWeakTopic,
      reviewedAt: now.toISOString(),
      nextReviewAt: sm2.nextReviewAt,
    });

    return NextResponse.json({
      ok: true,
      item: result.updatedItem,
      historyEntry: result.historyEntry,
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
