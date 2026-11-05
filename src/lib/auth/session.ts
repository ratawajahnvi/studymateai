import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createSessionToken,
  deterministicStudentIdFromEmail,
  deterministicUuidFromString,
  revokeSessionTokenJti,
  SessionPayload,
  verifySessionToken,
} from "./crypto";
import {
  isAuthorizedAdminEmail,
  isSuperAdminEmail,
  requireAdminCredentials,
  requireSessionSecret,
} from "../config/env";
import { readLocalDb } from "../db/localStore";
import { findProfileById } from "../db/repository";

export const SESSION_COOKIE_NAME = "studymate_session";

export class AuthError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: 401 | 403 | 409 = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    const secret = requireSessionSecret();
    const verified = verifySessionToken(token, secret);
    if (!verified) return null;

    const normalizedSub = verified.email
      ? deterministicUuidFromString(verified.email)
      : verified.sub;
    const normalizedIdentifier = verified.email
      ? deterministicStudentIdFromEmail(verified.email)
      : verified.identifier;

    const localDb = readLocalDb();
    const liveProfile = localDb.profiles.find(
      (p) =>
        p.id === normalizedSub ||
        (verified.email && (p.google_email ?? "").toLowerCase() === verified.email.toLowerCase())
    );

    if (liveProfile) {
      if (liveProfile.is_blocked && !isSuperAdminEmail(liveProfile.google_email)) {
        return null;
      }
      const liveRole = isSuperAdminEmail(liveProfile.google_email)
        ? "superadmin"
        : liveProfile.role_name;
      return {
        ...verified,
        sub: liveProfile.id,
        identifier: liveProfile.student_id,
        email: liveProfile.google_email ?? verified.email,
        displayName: liveProfile.full_name || verified.displayName,
        role: liveRole,
      };
    }

    if (isSuperAdminEmail(verified.email)) {
      return {
        ...verified,
        sub: normalizedSub,
        identifier: normalizedIdentifier,
        role: "superadmin",
      };
    }

    return {
      ...verified,
      sub: normalizedSub,
      identifier: normalizedIdentifier,
    };
  } catch {
    return null;
  }
}

/**
 * Allows authenticated Students, Admins, and SuperAdmins (since Admin & SuperAdmin have access to all study features).
 * Rejects blocked users immediately.
 */
export async function requireStudentSession(): Promise<SessionPayload> {
  const session = await getSessionFromCookies();
  if (!session) {
    throw new AuthError("Authentication required. Please sign in with your Google Account.", 401);
  }
  if (
    session.role !== "student" &&
    session.role !== "admin" &&
    session.role !== "superadmin"
  ) {
    throw new AuthError("Forbidden: Invalid account role.", 403);
  }
  return session;
}

/**
 * Allows authorized Admins AND SuperAdmins to access the Admin Dashboard & Admin APIs.
 * Any regular student (or user whose Admin role was revoked by SuperAdmin) receives 403 Forbidden.
 */
export async function requireAdminSession(): Promise<SessionPayload> {
  const session = await getSessionFromCookies();
  if (!session) {
    throw new AuthError("Admin authentication required.", 401);
  }
  if (session.role === "superadmin" && isSuperAdminEmail(session.email)) {
    return session;
  }
  if (session.role !== "admin") {
    throw new AuthError(
      "Forbidden: Only authorized Administrators or the SuperAdmin can access Admin resources.",
      403
    );
  }
  const { adminId } = requireAdminCredentials();
  const liveProfile = await findProfileById(session.sub);
  const isDbApprovedAdmin =
    liveProfile?.role_name === "admin" || liveProfile?.role_name === "superadmin";
  const isEnvApproved =
    isAuthorizedAdminEmail(session.email) ||
    isAuthorizedAdminEmail(session.identifier) ||
    session.identifier === adminId;

  if (!isDbApprovedAdmin && !isEnvApproved) {
    throw new AuthError("Forbidden: Identity is not an authorized Administrator.", 403);
  }
  return session;
}

/**
 * Strictly restricts the SuperAdmin Dashboard & SuperAdmin APIs to amrendrayadav03321@gmail.com ONLY.
 * Even regular Admins (role === "admin") are strictly forbidden (403) from viewing or calling SuperAdmin endpoints.
 */
export async function requireSuperAdminSession(): Promise<SessionPayload> {
  const session = await getSessionFromCookies();
  if (!session) {
    throw new AuthError("SuperAdmin authentication required.", 401);
  }
  if (session.role !== "superadmin" || !isSuperAdminEmail(session.email)) {
    throw new AuthError(
      "403 Forbidden: The SuperAdmin Control Center is strictly restricted to the SuperAdmin (amrendrayadav03321@gmail.com). Regular Admins and Students cannot access this area.",
      403
    );
  }
  return session;
}

export function attachSessionCookie(
  response: NextResponse,
  payload: Omit<SessionPayload, "iat" | "exp" | "jti">
): NextResponse {
  const secret = requireSessionSecret();
  const maxAge = 60 * 60 * 24 * 365; // 365 days (1 year persistent login)
  const token = createSessionToken(payload, secret, maxAge);

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  return response;
}

export async function clearSessionCookie(response: NextResponse): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      const secret = requireSessionSecret();
      const payload = verifySessionToken(token, secret);
      if (payload?.jti) {
        revokeSessionTokenJti(payload.jti);
      }
    }
  } catch {
    // Proceed to expire cookie even if secret is missing
  }

  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
