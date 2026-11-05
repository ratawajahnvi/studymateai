import { NextRequest, NextResponse } from "next/server";
import { GoogleAccountAuthSchema } from "@/lib/validation/schemas";
import { checkRateLimit, generateStudentId, hashPin, verifyPin } from "@/lib/auth/crypto";
import { attachSessionCookie, AuthError } from "@/lib/auth/session";
import { isSuperAdminEmail } from "@/lib/config/env";
import {
  createStudentProfile,
  findProfileByGoogleEmail,
  findStudentByStudentId,
  touchStudentLastActive,
} from "@/lib/db/repository";
import type { UserRole } from "@/lib/db/types";
import { toApiErrorResponse } from "@/lib/http/errors";

function deriveDisplayNameFromEmail(email: string, providedName?: string): string {
  if (providedName && providedName.trim().length >= 2) {
    return providedName.trim();
  }
  const prefix = email.split("@")[0] ?? "Student";
  const cleaned = prefix.replace(/[._-]+/g, " ").trim();
  if (cleaned.length < 2) return "StudyMate Scholar";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function verifyOptionalGoogleIdToken(idToken: string, expectedEmail: string): Promise<void> {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!response.ok) {
    throw new AuthError("Invalid Google OAuth token.", 401);
  }
  const payload = (await response.json()) as { email?: string; email_verified?: string };
  if (
    !payload.email ||
    payload.email.trim().toLowerCase() !== expectedEmail.trim().toLowerCase() ||
    payload.email_verified !== "true"
  ) {
    throw new AuthError("Google OAuth email verification failed.", 401);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const clientIp = request.headers.get("x-forwarded-for") ?? "local";
    const rate = checkRateLimit(`google-auth:${clientIp}`, 8, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: `Too many authentication attempts. Please wait ${rate.retryAfterSeconds}s.`,
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = GoogleAccountAuthSchema.parse(body);

    if (parsed.idToken) {
      await verifyOptionalGoogleIdToken(parsed.idToken, parsed.googleEmail);
    }

    const existing = await findProfileByGoogleEmail(parsed.googleEmail);
    if (existing) {
      if (existing.is_blocked && !isSuperAdminEmail(parsed.googleEmail)) {
        throw new AuthError(
          `Your account (${parsed.googleEmail}) has been blocked by the SuperAdmin. ${
            existing.blocked_reason ? `Reason: ${existing.blocked_reason}` : ""
          }`.trim(),
          403
        );
      }

      if (!verifyPin(parsed.pin, existing.pin_hash, existing.pin_salt)) {
        throw new AuthError("Incorrect PIN for this Google account.", 401);
      }

      await touchStudentLastActive(existing.id);
      const effectiveRole: UserRole = isSuperAdminEmail(parsed.googleEmail)
        ? "superadmin"
        : existing.role_name;

      const response = NextResponse.json({
        ok: true,
        isNewAccount: false,
        user: {
          profileId: existing.id,
          studentId: existing.student_id,
          googleEmail: existing.google_email ?? parsed.googleEmail,
          fullName: existing.full_name,
          role: effectiveRole,
        },
      });

      return attachSessionCookie(response, {
        sub: existing.id,
        identifier: existing.student_id,
        email: existing.google_email ?? parsed.googleEmail,
        displayName: existing.full_name,
        role: effectiveRole,
      });
    }

    let studentId = generateStudentId();
    for (let attempt = 0; attempt < 5; attempt++) {
      const idTaken = await findStudentByStudentId(studentId);
      if (!idTaken) break;
      studentId = generateStudentId();
    }

    const fullName = deriveDisplayNameFromEmail(parsed.googleEmail, parsed.fullName);
    const { hash, salt } = hashPin(parsed.pin);
    const created = await createStudentProfile({
      studentId,
      googleEmail: parsed.googleEmail,
      fullName,
      pinHash: hash,
      pinSalt: salt,
    });

    const response = NextResponse.json(
      {
        ok: true,
        isNewAccount: true,
        user: {
          profileId: created.id,
          studentId: created.student_id,
          googleEmail: created.google_email ?? parsed.googleEmail,
          fullName: created.full_name,
          role: created.role_name,
        },
      },
      { status: 201 }
    );

    return attachSessionCookie(response, {
      sub: created.id,
      identifier: created.student_id,
      email: created.google_email ?? parsed.googleEmail,
      displayName: created.full_name,
      role: created.role_name,
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
