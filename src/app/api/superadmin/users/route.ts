import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStudentId, hashPin } from "@/lib/auth/crypto";
import { requireSuperAdminSession } from "@/lib/auth/session";
import { DEFAULT_SUPERADMIN_EMAIL } from "@/lib/config/env";
import {
  createStudentProfile,
  findProfileByGoogleEmail,
  getAdminStudentsOverview,
  listEmailNotifications,
  setUserBlockedStatusBySuperAdmin,
  updateUserRoleBySuperAdmin,
} from "@/lib/db/repository";
import { toApiErrorResponse } from "@/lib/http/errors";
import { sendAccountStatusEmailNotification } from "@/lib/notifications/email";
import { GoogleEmailSchema } from "@/lib/validation/schemas";

const SuperAdminPatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_role"),
    targetProfileId: z.string().uuid(),
    newRole: z.enum(["student", "admin"]),
  }),
  z.object({
    action: z.literal("set_blocked"),
    targetProfileId: z.string().uuid(),
    isBlocked: z.boolean(),
    reason: z.string().trim().max(300).optional(),
  }),
]);

const SuperAdminCreateOrPromoteByEmailSchema = z.object({
  googleEmail: GoogleEmailSchema,
  fullName: z.string().trim().min(2).max(80).optional(),
  pin: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "PIN must be 4 to 8 numeric digits")
    .default("123456"),
  role: z.enum(["student", "admin"]).default("admin"),
});

export async function GET(): Promise<NextResponse> {
  try {
    const superAdmin = await requireSuperAdminSession();
    const [users, notifications] = await Promise.all([
      getAdminStudentsOverview(),
      listEmailNotifications(40),
    ]);

    return NextResponse.json({
      ok: true,
      superAdmin: {
        email: superAdmin.email ?? DEFAULT_SUPERADMIN_EMAIL,
        displayName: superAdmin.displayName,
      },
      users,
      notifications,
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const superAdmin = await requireSuperAdminSession();
    const body = await request.json();
    const parsed = SuperAdminPatchSchema.parse(body);
    const triggeredByEmail = superAdmin.email ?? DEFAULT_SUPERADMIN_EMAIL;

    if (parsed.action === "set_role") {
      const updated = await updateUserRoleBySuperAdmin({
        targetProfileId: parsed.targetProfileId,
        newRole: parsed.newRole,
      });

      const notification = updated.google_email
        ? await sendAccountStatusEmailNotification({
            recipientEmail: updated.google_email,
            recipientName: updated.full_name,
            studentId: updated.student_id,
            notificationType: "role_updated",
            newRole: parsed.newRole,
            triggeredByEmail,
          })
        : null;

      return NextResponse.json({
        ok: true,
        profile: updated,
        notification,
      });
    }

    const updated = await setUserBlockedStatusBySuperAdmin({
      targetProfileId: parsed.targetProfileId,
      isBlocked: parsed.isBlocked,
      reason: parsed.reason ?? null,
    });

    const notification = updated.google_email
      ? await sendAccountStatusEmailNotification({
          recipientEmail: updated.google_email,
          recipientName: updated.full_name,
          studentId: updated.student_id,
          notificationType: parsed.isBlocked ? "account_blocked" : "account_unblocked",
          reason: updated.blocked_reason,
          triggeredByEmail,
        })
      : null;

    return NextResponse.json({
      ok: true,
      profile: updated,
      notification,
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const superAdmin = await requireSuperAdminSession();
    const body = await request.json();
    const parsed = SuperAdminCreateOrPromoteByEmailSchema.parse(body);
    const triggeredByEmail = superAdmin.email ?? DEFAULT_SUPERADMIN_EMAIL;

    const existing = await findProfileByGoogleEmail(parsed.googleEmail);
    if (existing) {
      const updated = await updateUserRoleBySuperAdmin({
        targetProfileId: existing.id,
        newRole: parsed.role,
      });

      const notification = await sendAccountStatusEmailNotification({
        recipientEmail: parsed.googleEmail,
        recipientName: updated.full_name,
        studentId: updated.student_id,
        notificationType: "role_updated",
        newRole: parsed.role,
        triggeredByEmail,
      });

      return NextResponse.json({
        ok: true,
        profile: updated,
        notification,
      });
    }

    const defaultName =
      parsed.fullName?.trim() ||
      (parsed.googleEmail.split("@")[0] ?? "User")
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());

    const { hash, salt } = hashPin(parsed.pin);
    const created = await createStudentProfile({
      studentId: generateStudentId(),
      googleEmail: parsed.googleEmail,
      fullName: defaultName.length >= 2 ? defaultName : "Authorized User",
      pinHash: hash,
      pinSalt: salt,
      roleOverride: parsed.role,
    });

    const notification = await sendAccountStatusEmailNotification({
      recipientEmail: parsed.googleEmail,
      recipientName: created.full_name,
      studentId: created.student_id,
      notificationType: "role_updated",
      newRole: parsed.role,
      triggeredByEmail,
    });

    return NextResponse.json(
      {
        ok: true,
        profile: created,
        notification,
      },
      { status: 201 }
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
