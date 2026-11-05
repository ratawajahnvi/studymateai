import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { getAdminStudentsOverview } from "@/lib/db/repository";
import { toApiErrorResponse } from "@/lib/http/errors";

export async function GET(): Promise<NextResponse> {
  try {
    // Strictly enforces server-side Admin authorization; returns 401/403 for students/anonymous
    await requireAdminSession();
    const students = await getAdminStudentsOverview();

    return NextResponse.json({
      ok: true,
      students,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
