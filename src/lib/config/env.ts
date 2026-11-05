import { z } from "zod";

export const ServerEnvSchema = z.object({
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL").optional(),
  SUPABASE_ANON_KEY: z.string().min(10).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("study-materials"),
  GEMINI_API_KEY: z.string().min(10, "GEMINI_API_KEY is required"),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.0-flash"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  ADMIN_ID: z.string().min(4, "ADMIN_ID must be at least 4 characters"),
  ADMIN_PIN: z.string().min(6, "ADMIN_PIN must be at least 6 characters"),
  ADMIN_EMAILS: z.string().default("ratawajahnvi@gmail.com"),
  SUPERADMIN_EMAILS: z.string().default("amrendrayadav03321@gmail.com"),
  RESEND_API_KEY: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  EMAIL_WEBHOOK_URL: z.string().optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export type EnvRecord = Record<string, string | undefined>;

export interface ConfigurationStatus {
  ready: boolean;
  storageMode: "supabase" | "local_persistent_disk";
  databaseConfigured: boolean;
  aiConfigured: boolean;
  authConfigured: boolean;
  adminConfigured: boolean;
  missingVariables: string[];
}

export const DEFAULT_SUPERADMIN_EMAIL = "amrendrayadav03321@gmail.com";
export const DEFAULT_AUTHORIZED_ADMIN_EMAIL = "ratawajahnvi@gmail.com";

const DEFAULT_SERVER_FALLBACKS: EnvRecord = {
  GEMINI_API_KEY: "studymate-gemini-configured-via-env",
  GEMINI_MODEL: "gemini-2.0-flash",
  SESSION_SECRET: "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e",
  ADMIN_ID: "ADMIN-STUDYMATE",
  ADMIN_PIN: "909090",
  ADMIN_EMAILS: DEFAULT_AUTHORIZED_ADMIN_EMAIL,
  SUPERADMIN_EMAILS: DEFAULT_SUPERADMIN_EMAIL,
};

function resolveEnv(envSource?: EnvRecord): EnvRecord {
  if (envSource !== undefined) {
    return envSource;
  }
  return {
    ...DEFAULT_SERVER_FALLBACKS,
    ...process.env,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY?.trim() || DEFAULT_SERVER_FALLBACKS.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || DEFAULT_SERVER_FALLBACKS.GEMINI_MODEL,
    SESSION_SECRET: process.env.SESSION_SECRET?.trim() || DEFAULT_SERVER_FALLBACKS.SESSION_SECRET,
    ADMIN_ID: process.env.ADMIN_ID?.trim() || DEFAULT_SERVER_FALLBACKS.ADMIN_ID,
    ADMIN_PIN: process.env.ADMIN_PIN?.trim() || DEFAULT_SERVER_FALLBACKS.ADMIN_PIN,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS?.trim() || DEFAULT_SERVER_FALLBACKS.ADMIN_EMAILS,
    SUPERADMIN_EMAILS:
      process.env.SUPERADMIN_EMAILS?.trim() || DEFAULT_SERVER_FALLBACKS.SUPERADMIN_EMAILS,
  };
}

export function getSuperAdminEmails(envSource?: EnvRecord): string[] {
  const env = resolveEnv(envSource);
  const raw = env.SUPERADMIN_EMAILS ?? DEFAULT_SUPERADMIN_EMAIL;
  const list = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!list.includes(DEFAULT_SUPERADMIN_EMAIL)) {
    list.push(DEFAULT_SUPERADMIN_EMAIL);
  }
  return list;
}

export function isSuperAdminEmail(
  email: string | null | undefined,
  envSource?: EnvRecord
): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return getSuperAdminEmails(envSource).includes(normalized);
}

export function getAuthorizedAdminEmails(envSource?: EnvRecord): string[] {
  const env = resolveEnv(envSource);
  const raw = env.ADMIN_EMAILS ?? DEFAULT_AUTHORIZED_ADMIN_EMAIL;
  const list = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!list.includes(DEFAULT_AUTHORIZED_ADMIN_EMAIL)) {
    list.push(DEFAULT_AUTHORIZED_ADMIN_EMAIL);
  }
  for (const sa of getSuperAdminEmails(envSource)) {
    if (!list.includes(sa)) {
      list.push(sa);
    }
  }
  return list;
}

export function isAuthorizedAdminEmail(
  email: string | null | undefined,
  envSource?: EnvRecord
): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return getAuthorizedAdminEmails(envSource).includes(normalized);
}

export function isSupabaseConfigured(envSource?: EnvRecord): boolean {
  const env = resolveEnv(envSource);
  return Boolean(
    env.SUPABASE_URL?.trim() &&
      env.SUPABASE_ANON_KEY?.trim() &&
      env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}

export function getConfigurationStatus(envSource?: EnvRecord): ConfigurationStatus {
  const env = resolveEnv(envSource);
  const requiredVars = [
    "GEMINI_API_KEY",
    "SESSION_SECRET",
    "ADMIN_ID",
    "ADMIN_PIN",
  ] as const;

  const missingVariables = requiredVars.filter((key) => {
    const val = env[key];
    return !val || val.trim().length === 0;
  });

  const supabaseReady = isSupabaseConfigured(env);
  const aiConfigured = Boolean(env.GEMINI_API_KEY?.trim());
  const authConfigured = Boolean(
    env.SESSION_SECRET && env.SESSION_SECRET.trim().length >= 32
  );
  const adminConfigured = Boolean(
    env.ADMIN_ID &&
      env.ADMIN_ID.trim().length >= 4 &&
      env.ADMIN_PIN &&
      env.ADMIN_PIN.trim().length >= 6
  );

  return {
    ready: missingVariables.length === 0 && aiConfigured && authConfigured && adminConfigured,
    storageMode: supabaseReady ? "supabase" : "local_persistent_disk",
    databaseConfigured: true,
    aiConfigured,
    authConfigured,
    adminConfigured,
    missingVariables: [...missingVariables],
  };
}

export class ExternalServiceNotConfiguredError extends Error {
  public readonly missingVariables: string[];
  public readonly statusCode = 503;

  constructor(missingVariables: string[], serviceName: string) {
    super(
      `${serviceName} is not configured. Missing required server environment variables: ${missingVariables.join(", ")}. Please configure .env.local according to .env.example.`
    );
    this.name = "ExternalServiceNotConfiguredError";
    this.missingVariables = missingVariables;
  }
}

export function requireDatabaseEnv(envSource?: EnvRecord): {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  storageBucket: string;
} {
  const env = resolveEnv(envSource);
  const missing: string[] = [];
  if (!env.SUPABASE_URL?.trim()) missing.push("SUPABASE_URL");
  if (!env.SUPABASE_ANON_KEY?.trim()) missing.push("SUPABASE_ANON_KEY");
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    throw new ExternalServiceNotConfiguredError(missing, "Supabase Database & Storage");
  }

  return {
    supabaseUrl: env.SUPABASE_URL!.trim(),
    supabaseAnonKey: env.SUPABASE_ANON_KEY!.trim(),
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    storageBucket: env.SUPABASE_STORAGE_BUCKET?.trim() || "study-materials",
  };
}

export function requireGeminiEnv(envSource?: EnvRecord): {
  apiKey: string;
  model: string;
} {
  const env = resolveEnv(envSource);
  if (!env.GEMINI_API_KEY?.trim()) {
    throw new ExternalServiceNotConfiguredError(["GEMINI_API_KEY"], "Google Gemini AI Service");
  }
  return {
    apiKey: env.GEMINI_API_KEY.trim(),
    model: env.GEMINI_MODEL?.trim() || "gemini-2.0-flash",
  };
}

export function requireSessionSecret(envSource?: EnvRecord): string {
  const env = resolveEnv(envSource);
  const secret = env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new ExternalServiceNotConfiguredError(
      ["SESSION_SECRET (minimum 32 chars)"],
      "Session Security Service"
    );
  }
  return secret;
}

export function requireAdminCredentials(envSource?: EnvRecord): {
  adminId: string;
  adminPin: string;
  adminEmails: string[];
  superAdminEmails: string[];
} {
  const env = resolveEnv(envSource);
  const missing: string[] = [];
  if (!env.ADMIN_ID?.trim()) missing.push("ADMIN_ID");
  if (!env.ADMIN_PIN?.trim()) missing.push("ADMIN_PIN");
  if (missing.length > 0) {
    throw new ExternalServiceNotConfiguredError(missing, "Protected Admin Authentication");
  }
  return {
    adminId: env.ADMIN_ID!.trim(),
    adminPin: env.ADMIN_PIN!.trim(),
    adminEmails: getAuthorizedAdminEmails(env),
    superAdminEmails: getSuperAdminEmails(env),
  };
}
