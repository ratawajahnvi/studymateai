import { NextRequest, NextResponse } from "next/server";
import { requireStudentSession } from "@/lib/auth/session";
import { getOwnedStudyMaterial, touchStudentLastActive } from "@/lib/db/repository";
import { processStudyMaterialJob } from "@/lib/documents/processor";
import { toApiErrorResponse } from "@/lib/http/errors";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireStudentSession();
    await touchStudentLastActive(session.sub);
    const { id } = await context.params;

    await getOwnedStudyMaterial(session.sub, id);

    const result = await processStudyMaterialJob({
      studentProfileId: session.sub,
      materialId: id,
    });

    return NextResponse.json({
      ok: result.status === "completed",
      result,
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
