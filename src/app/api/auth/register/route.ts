import { NextRequest, NextResponse } from "next/server";
import { StudentRegistrationSchema } from "@/lib/validation/schemas";
import { checkRateLimit, generateStudentId, hashPin } from "@/lib/auth/crypto";
import { attachSessionCookie, AuthError } from "@/lib/auth/session";
import {
  createStudentProfile,
  findProfileByGoogleEmail,
  findStudentByStudentId,
} from "@/lib/db/repository";
import { toApiErrorResponse } from "@/lib/http/errors";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const clientIp = request.headers.get("x-forwarded-for") ?? "local";
    const rate = checkRateLimit(`register:${clientIp}`, 5, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: `Too many registration attempts. Please wait ${rate.retryAfterSeconds}s.`,
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = StudentRegistrationSchema.parse(body);

    if (parsed.googleEmail) {
      const existingByEmail = await findProfileByGoogleEmail(parsed.googleEmail);
      if (existingByEmail) {
        throw new AuthError(
          "An account with this Google email already exists. Please sign in with your PIN.",
          409
        );
      }
    }

    // Ensure unique non-guessable Student ID
    let studentId = generateStudentId();
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await findStudentByStudentId(studentId);
      if (!existing) break;
      studentId = generateStudentId();
    }

    const { hash, salt } = hashPin(parsed.pin);
    const profile = await createStudentProfile({
      studentId,
      googleEmail: parsed.googleEmail ?? null,
      fullName: parsed.fullName,
      pinHash: hash,
      pinSalt: salt,
    });

    const response = NextResponse.json(
      {
        ok: true,
        student: {
          profileId: profile.id,
          studentId: profile.student_id,
          googleEmail: profile.google_email,
          fullName: profile.full_name,
          role: profile.role_name,
        },
      },
      { status: 201 }
    );

    return attachSessionCookie(response, {
      sub: profile.id,
      identifier: profile.student_id,
      email: profile.google_email ?? undefined,
      displayName: profile.full_name,
      role: profile.role_name,
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
