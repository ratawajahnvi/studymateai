import { NextRequest, NextResponse } from "next/server";
import { StudentLoginSchema } from "@/lib/validation/schemas";
import { checkRateLimit, verifyPin } from "@/lib/auth/crypto";
import { attachSessionCookie, AuthError } from "@/lib/auth/session";
import { isSuperAdminEmail } from "@/lib/config/env";
import { findStudentByStudentId, touchStudentLastActive } from "@/lib/db/repository";
import type { UserRole } from "@/lib/db/types";
import { toApiErrorResponse } from "@/lib/http/errors";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const clientIp = request.headers.get("x-forwarded-for") ?? "local";
    const rate = checkRateLimit(`student-login:${clientIp}`, 6, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: `Too many login attempts. Please wait ${rate.retryAfterSeconds}s before trying again.`,
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = StudentLoginSchema.parse(body);

    const profile = await findStudentByStudentId(parsed.studentId);
    if (!profile || !verifyPin(parsed.pin, profile.pin_hash, profile.pin_salt)) {
      throw new AuthError("Invalid Student ID or PIN.", 401);
    }

    if (profile.is_blocked && !isSuperAdminEmail(profile.google_email)) {
      throw new AuthError(
        `Your account (${profile.student_id}) has been blocked by the SuperAdmin. ${
          profile.blocked_reason ? `Reason: ${profile.blocked_reason}` : ""
        }`.trim(),
        403
      );
    }

    await touchStudentLastActive(profile.id);
    const effectiveRole: UserRole = isSuperAdminEmail(profile.google_email)
      ? "superadmin"
      : profile.role_name;

    const response = NextResponse.json({
      ok: true,
      student: {
        profileId: profile.id,
        studentId: profile.student_id,
        googleEmail: profile.google_email,
        fullName: profile.full_name,
        role: effectiveRole,
      },
    });

    return attachSessionCookie(response, {
      sub: profile.id,
      identifier: profile.student_id,
      email: profile.google_email ?? undefined,
      displayName: profile.full_name,
      role: effectiveRole,
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
