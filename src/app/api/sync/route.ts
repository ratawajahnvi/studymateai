import { NextRequest, NextResponse } from "next/server";
import { requireStudentSession } from "@/lib/auth/session";
import { mergeClientVaultIntoDatabase, type LocalDatabaseState } from "@/lib/db/localStore";
import { ensureSessionProfileExists } from "@/lib/db/repository";
import { toApiErrorResponse } from "@/lib/http/errors";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    await ensureSessionProfileExists(session).catch(() => null);

    const body = (await request.json().catch(() => ({}))) as Partial<LocalDatabaseState>;
    const merged = await mergeClientVaultIntoDatabase(session.sub, body);

    return NextResponse.json({
      ok: true,
      studentProfileId: session.sub,
      study_materials: merged.study_materials.filter(
        (m) => m.student_profile_id === session.sub
      ),
      processing_jobs: merged.processing_jobs.filter(
        (j) => j.student_profile_id === session.sub
      ),
      extracted_document_contents: merged.extracted_document_contents.filter(
        (c) => c.student_profile_id === session.sub
      ),
      ai_notes: merged.ai_notes.filter((n) => n.student_profile_id === session.sub),
      short_notes: merged.short_notes.filter((n) => n.student_profile_id === session.sub),
      flashcards: merged.flashcards.filter((f) => f.student_profile_id === session.sub),
      questions: merged.questions.filter((q) => q.student_profile_id === session.sub),
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
