import { NextRequest, NextResponse } from "next/server";
import { requireStudentSession } from "@/lib/auth/session";
import {
  appendChatMessage,
  ensureMaterialAndChunksForGeneration,
  getOrCreateChatConversation,
  listChatMessages,
  touchStudentLastActive,
} from "@/lib/db/repository";
import { generateGroundedChatAnswer } from "@/lib/ai/services";
import { toApiErrorResponse } from "@/lib/http/errors";
import { ChatRequestSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    const materialId = request.nextUrl.searchParams.get("materialId") ?? undefined;
    const data = await listChatMessages(session.sub, materialId);
    return NextResponse.json({ ok: true, kind: "ai_chat", ...data });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    await touchStudentLastActive(session.sub);

    const body = await request.json();
    const parsed = ChatRequestSchema.parse(body);

    const { material, chunks } = await ensureMaterialAndChunksForGeneration({
      studentProfileId: session.sub,
      materialId: parsed.materialId,
      clientMaterial: body.material ?? null,
      clientChunks: body.chunks ?? null,
    });

    const conversation = await getOrCreateChatConversation({
      studentProfileId: session.sub,
      materialId: parsed.materialId,
      conversationId: parsed.conversationId,
      title: `${material.title} — Study Chat`,
    });

    const userMsg = await appendChatMessage({
      studentProfileId: session.sub,
      conversationId: conversation.id,
      senderRole: "user",
      messageText: parsed.question,
    });

    const aiResult = await generateGroundedChatAnswer({
      materialTitle: material.title,
      question: parsed.question,
      chunks,
    });

    const combinedText =
      !aiResult.foundInSource && aiResult.unavailabilityNotice
        ? `${aiResult.unavailabilityNotice}\n\n${aiResult.answer}`
        : aiResult.answer;

    const assistantMsg = await appendChatMessage({
      studentProfileId: session.sub,
      conversationId: conversation.id,
      senderRole: "assistant",
      messageText: combinedText,
      citations: aiResult.citations,
      foundInSource: aiResult.foundInSource,
    });

    return NextResponse.json(
      {
        ok: true,
        kind: "ai_chat",
        conversation,
        userMessage: userMsg,
        assistantMessage: assistantMsg,
      },
      { status: 201 }
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
