import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "../auth/session";
import { ExternalServiceNotConfiguredError } from "../config/env";

export function toApiErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    return NextResponse.json(
      {
        ok: false,
        error: firstIssue?.message ?? "Validation failed",
        issues: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  if (error instanceof AuthError) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof ExternalServiceNotConfiguredError) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        missingVariables: error.missingVariables,
        configurationRequired: true,
      },
      { status: 503 }
    );
  }

  const safeMessage =
    error instanceof Error ? error.message : "An unexpected server error occurred.";

  return NextResponse.json(
    {
      ok: false,
      error: safeMessage,
    },
    { status: 500 }
  );
}
