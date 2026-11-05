import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";

export async function GET(): Promise<NextResponse> {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ ok: false, authenticated: false, session: null }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    authenticated: true,
    session: {
      profileId: session.sub,
      identifier: session.identifier,
      email: session.email ?? null,
      displayName: session.displayName,
      role: session.role,
    },
  });
}
