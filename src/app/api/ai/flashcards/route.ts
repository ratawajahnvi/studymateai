import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStudentSession } from "@/lib/auth/session";
import {
  ensureMaterialAndChunksForGeneration,
  listFlashcards,
  saveFlashcards,
  touchStudentLastActive,
} from "@/lib/db/repository";
import { generateIndependentFlashcards } from "@/lib/ai/services";
import { toApiErrorResponse } from "@/lib/http/errors";

const GenerateFlashcardsBodySchema = z.object({
  materialId: z.string().uuid("Please select a valid study material"),
  count: z.number().int().min(3).max(20).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    const materialId = request.nextUrl.searchParams.get("materialId") ?? undefined;
    const flashcards = await listFlashcards(session.sub, materialId);
    return NextResponse.json({ ok: true, kind: "flashcards", flashcards });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    await touchStudentLastActive(session.sub);

    const body = await request.json();
    const { materialId, count } = GenerateFlashcardsBodySchema.parse(body);

    const { material, chunks } = await ensureMaterialAndChunksForGeneration({
      studentProfileId: session.sub,
      materialId,
      clientMaterial: body.material ?? null,
      clientChunks: body.chunks ?? null,
    });

    const generated = await generateIndependentFlashcards({
      materialTitle: material.title,
      chunks,
      count,
    });

    const saved = await saveFlashcards({
      studentProfileId: session.sub,
      materialId,
      output: generated,
    });

    return NextResponse.json({ ok: true, kind: "flashcards", flashcards: saved }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
