import { NextRequest, NextResponse } from "next/server";
import { AdminLoginSchema } from "@/lib/validation/schemas";
import {
  checkRateLimit,
  generateStudentId,
  hashPin,
  safeCompareStrings,
  verifyPin,
} from "@/lib/auth/crypto";
import { attachSessionCookie, AuthError } from "@/lib/auth/session";
import {
  DEFAULT_AUTHORIZED_ADMIN_EMAIL,
  isAuthorizedAdminEmail,
  isSuperAdminEmail,
  requireAdminCredentials,
} from "@/lib/config/env";
import {
  createStudentProfile,
  findProfileByGoogleEmail,
  touchStudentLastActive,
} from "@/lib/db/repository";
import type { UserRole } from "@/lib/db/types";
import { toApiErrorResponse } from "@/lib/http/errors";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const clientIp = request.headers.get("x-forwarded-for") ?? "local";
    const rate = checkRateLimit(`admin-login:${clientIp}`, 5, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: `Too many admin authentication attempts. Please wait ${rate.retryAfterSeconds}s.`,
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = AdminLoginSchema.parse(body);
    const { adminId, adminPin } = requireAdminCredentials();
    const normalizedInput = parsed.adminId.trim().toLowerCase();

    // Case 1: Login via Google Email (SuperAdmin amrendrayadav03321@gmail.com or any Admin email)
    const existingByEmail = await findProfileByGoogleEmail(normalizedInput);
    const isSuper = isSuperAdminEmail(normalizedInput);
    const isEnvAdmin = isAuthorizedAdminEmail(normalizedInput);

    if (isSuper || isEnvAdmin || existingByEmail?.role_name === "admin") {
      if (existingByEmail) {
        if (existingByEmail.is_blocked && !isSuper) {
          throw new AuthError(
            `This account (${normalizedInput}) has been blocked by the SuperAdmin.`,
            403
          );
        }
        if (!isSuper && existingByEmail.role_name === "student") {
          throw new AuthError(
            "Admin access for this account has been revoked by the SuperAdmin.",
            403
          );
        }

        const validProfilePin = verifyPin(
          parsed.pin,
          existingByEmail.pin_hash,
          existingByEmail.pin_salt
        );
        const validMasterPin = safeCompareStrings(parsed.pin, adminPin);

        if (!validProfilePin && !validMasterPin) {
          throw new AuthError("Invalid PIN for Admin Google Account.", 401);
        }

        await touchStudentLastActive(existingByEmail.id);
        const effectiveRole: UserRole = isSuper ? "superadmin" : "admin";

        const response = NextResponse.json({
          ok: true,
          admin: {
            adminId: existingByEmail.student_id,
            googleEmail: normalizedInput,
            displayName: existingByEmail.full_name,
            role: effectiveRole,
          },
        });

        return attachSessionCookie(response, {
          sub: existingByEmail.id,
          identifier: existingByEmail.student_id,
          email: normalizedInput,
          displayName: existingByEmail.full_name,
          role: effectiveRole,
        });
      }

      // If no profile exists yet for this SuperAdmin or authorized Admin email, create it
      const { hash, salt } = hashPin(parsed.pin);
      const effectiveRole: UserRole = isSuper ? "superadmin" : "admin";
      const createdAdmin = await createStudentProfile({
        studentId: generateStudentId(),
        googleEmail: normalizedInput,
        fullName: isSuper ? "Amrendra Yadav (SuperAdmin)" : "Jahnvi Ratawa (Admin)",
        pinHash: hash,
        pinSalt: salt,
        roleOverride: effectiveRole,
      });

      const response = NextResponse.json({
        ok: true,
        admin: {
          adminId: createdAdmin.student_id,
          googleEmail: normalizedInput,
          displayName: createdAdmin.full_name,
          role: effectiveRole,
        },
      });

      return attachSessionCookie(response, {
        sub: createdAdmin.id,
        identifier: createdAdmin.student_id,
        email: normalizedInput,
        displayName: createdAdmin.full_name,
        role: effectiveRole,
      });
    }

    // Case 2: Login via server-configured ADMIN_ID + ADMIN_PIN
    const idMatches = safeCompareStrings(parsed.adminId, adminId);
    const pinMatches = safeCompareStrings(parsed.pin, adminPin);

    if (!idMatches || !pinMatches) {
      throw new AuthError(
        "Unauthorized: Only authorized Admin or SuperAdmin accounts can access this portal.",
        403
      );
    }

    let adminProfile = await findProfileByGoogleEmail(DEFAULT_AUTHORIZED_ADMIN_EMAIL);
    if (!adminProfile) {
      const { hash, salt } = hashPin(adminPin);
      adminProfile = await createStudentProfile({
        studentId: generateStudentId(),
        googleEmail: DEFAULT_AUTHORIZED_ADMIN_EMAIL,
        fullName: "StudyMate Administrator",
        pinHash: hash,
        pinSalt: salt,
      });
    }

    const response = NextResponse.json({
      ok: true,
      admin: {
        adminId,
        googleEmail: adminProfile.google_email ?? DEFAULT_AUTHORIZED_ADMIN_EMAIL,
        displayName: adminProfile.full_name,
        role: "admin" as const,
      },
    });

    return attachSessionCookie(response, {
      sub: adminProfile.id,
      identifier: adminId,
      email: adminProfile.google_email ?? DEFAULT_AUTHORIZED_ADMIN_EMAIL,
      displayName: adminProfile.full_name,
      role: "admin",
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
