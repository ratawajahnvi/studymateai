import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  return clearSessionCookie(response);
}
