import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStudentSession } from "@/lib/auth/session";
import {
  ensureMaterialAndChunksForGeneration,
  listShortNotes,
  saveShortNote,
  touchStudentLastActive,
} from "@/lib/db/repository";
import { generateIndependentShortNotes } from "@/lib/ai/services";
import { toApiErrorResponse } from "@/lib/http/errors";

const GenerateShortNotesBodySchema = z.object({
  materialId: z.string().uuid("Please select a valid study material"),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    const materialId = request.nextUrl.searchParams.get("materialId") ?? undefined;
    const shortNotes = await listShortNotes(session.sub, materialId);
    return NextResponse.json({ ok: true, kind: "short_notes", shortNotes });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    await touchStudentLastActive(session.sub);

    const body = await request.json();
    const { materialId } = GenerateShortNotesBodySchema.parse(body);

    const { material, chunks } = await ensureMaterialAndChunksForGeneration({
      studentProfileId: session.sub,
      materialId,
      clientMaterial: body.material ?? null,
      clientChunks: body.chunks ?? null,
    });

    const generated = await generateIndependentShortNotes({
      materialTitle: material.title,
      chunks,
    });

    const saved = await saveShortNote({
      studentProfileId: session.sub,
      materialId,
      output: generated,
    });

    return NextResponse.json({ ok: true, kind: "short_notes", shortNote: saved }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
