import { NextResponse } from "next/server";
import { getConfigurationStatus } from "@/lib/config/env";

export async function GET(): Promise<NextResponse> {
  const status = getConfigurationStatus();
  return NextResponse.json({
    ok: status.ready,
    status,
  });
}
