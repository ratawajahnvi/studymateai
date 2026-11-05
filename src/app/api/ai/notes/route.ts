import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStudentSession } from "@/lib/auth/session";
import {
  ensureMaterialAndChunksForGeneration,
  listAiNotes,
  saveAiNote,
  touchStudentLastActive,
} from "@/lib/db/repository";
import { generateIndependentAiNotes } from "@/lib/ai/services";
import { toApiErrorResponse } from "@/lib/http/errors";

const GenerateNotesBodySchema = z.object({
  materialId: z.string().uuid("Please select a valid study material"),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    const materialId = request.nextUrl.searchParams.get("materialId") ?? undefined;
    const notes = await listAiNotes(session.sub, materialId);
    return NextResponse.json({ ok: true, kind: "ai_notes", notes });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    await touchStudentLastActive(session.sub);

    const body = await request.json();
    const { materialId } = GenerateNotesBodySchema.parse(body);

    const { material, chunks } = await ensureMaterialAndChunksForGeneration({
      studentProfileId: session.sub,
      materialId,
      clientMaterial: body.material ?? null,
      clientChunks: body.chunks ?? null,
    });

    const generated = await generateIndependentAiNotes({
      materialTitle: material.title,
      chunks,
    });

    const saved = await saveAiNote({
      studentProfileId: session.sub,
      materialId,
      output: generated,
    });

    return NextResponse.json({ ok: true, kind: "ai_notes", note: saved }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
