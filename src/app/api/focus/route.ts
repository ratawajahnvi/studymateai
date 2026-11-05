import { NextRequest, NextResponse } from "next/server";
import { requireStudentSession } from "@/lib/auth/session";
import {
  listStudentFocusSessions,
  recordFocusSession,
  touchStudentLastActive,
} from "@/lib/db/repository";
import { computeFocusStatistics } from "@/lib/features/deterministic";
import { toApiErrorResponse } from "@/lib/http/errors";
import { RecordFocusSessionSchema } from "@/lib/validation/schemas";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    const sessions = await listStudentFocusSessions(session.sub);
    const statistics = computeFocusStatistics(sessions);

    return NextResponse.json({
      ok: true,
      sessions,
      statistics,
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
    const parsed = RecordFocusSessionSchema.parse(body);

    const saved = await recordFocusSession({
      studentProfileId: session.sub,
      sessionMode: parsed.sessionMode,
      plannedDurationMinutes: parsed.plannedDurationMinutes,
      actualDurationSeconds: parsed.actualDurationSeconds,
      completed: parsed.completed,
      topicLabel: parsed.topicLabel,
      startedAt: parsed.startedAt,
      endedAt: parsed.endedAt,
    });

    const allSessions = await listStudentFocusSessions(session.sub);
    const statistics = computeFocusStatistics(allSessions);

    return NextResponse.json(
      {
        ok: true,
        session: saved,
        statistics,
      },
      { status: 201 }
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
