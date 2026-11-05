import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  AiNoteRecord,
  ChatConversationRecord,
  ChatMessageRecord,
  EmailNotificationRecord,
  ExtractedChunkRecord,
  FlashcardRecord,
  FocusSessionRecord,
  ProcessingJobRecord,
  QuestionRecord,
  RevisionHistoryRecord,
  RevisionItemRecord,
  ShortNoteRecord,
  StudentProfileRecord,
  StudyMaterialRecord,
  StudyPlanItemRecord,
  StudyPlanRecord,
} from "./types";

export interface LocalDatabaseState {
  profiles: StudentProfileRecord[];
  study_materials: StudyMaterialRecord[];
  extracted_document_contents: ExtractedChunkRecord[];
  processing_jobs: ProcessingJobRecord[];
  ai_notes: AiNoteRecord[];
  short_notes: ShortNoteRecord[];
  flashcards: FlashcardRecord[];
  questions: QuestionRecord[];
  chat_conversations: ChatConversationRecord[];
  chat_messages: ChatMessageRecord[];
  study_plans: StudyPlanRecord[];
  study_plan_items: StudyPlanItemRecord[];
  focus_sessions: FocusSessionRecord[];
  revision_items: RevisionItemRecord[];
  revision_review_history: RevisionHistoryRecord[];
  email_notifications: EmailNotificationRecord[];
}

const EMPTY_STATE: LocalDatabaseState = {
  profiles: [],
  study_materials: [],
  extracted_document_contents: [],
  processing_jobs: [],
  ai_notes: [],
  short_notes: [],
  flashcards: [],
  questions: [],
  chat_conversations: [],
  chat_messages: [],
  study_plans: [],
  study_plan_items: [],
  focus_sessions: [],
  revision_items: [],
  revision_review_history: [],
  email_notifications: [],
};

let memoryCache: LocalDatabaseState | null = null;

function getDataDir(): string {
  if (process.env.STUDYMATE_DATA_DIR) {
    if (!fs.existsSync(process.env.STUDYMATE_DATA_DIR)) {
      fs.mkdirSync(process.env.STUDYMATE_DATA_DIR, { recursive: true });
    }
    return process.env.STUDYMATE_DATA_DIR;
  }

  const isServerlessRuntime = Boolean(
    process.env.NETLIFY ||
      process.env.NETLIFY_BLOBS_CONTEXT ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.VERCEL ||
      process.env.LAMBDA_TASK_ROOT
  );

  const preferredDir = isServerlessRuntime
    ? path.join(os.tmpdir(), "studymate-ai-data")
    : path.join(process.cwd(), ".data");

  try {
    if (!fs.existsSync(preferredDir)) {
      fs.mkdirSync(preferredDir, { recursive: true });
    }
    return preferredDir;
  } catch {
    const fallbackTmp = path.join(os.tmpdir(), "studymate-ai-data");
    if (!fs.existsSync(fallbackTmp)) {
      fs.mkdirSync(fallbackTmp, { recursive: true });
    }
    return fallbackTmp;
  }
}

function getDbFilePath(): string {
  return path.join(getDataDir(), "studymate-db.json");
}

function getStorageDir(): string {
  const storageDir = path.join(getDataDir(), "storage");
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  return storageDir;
}

function normalizeParsedState(parsed: Partial<LocalDatabaseState>): LocalDatabaseState {
  return {
    profiles: parsed.profiles ?? [],
    study_materials: parsed.study_materials ?? [],
    extracted_document_contents: parsed.extracted_document_contents ?? [],
    processing_jobs: parsed.processing_jobs ?? [],
    ai_notes: parsed.ai_notes ?? [],
    short_notes: parsed.short_notes ?? [],
    flashcards: parsed.flashcards ?? [],
    questions: parsed.questions ?? [],
    chat_conversations: parsed.chat_conversations ?? [],
    chat_messages: parsed.chat_messages ?? [],
    study_plans: parsed.study_plans ?? [],
    study_plan_items: parsed.study_plan_items ?? [],
    focus_sessions: parsed.focus_sessions ?? [],
    revision_items: parsed.revision_items ?? [],
    revision_review_history: parsed.revision_review_history ?? [],
    email_notifications: parsed.email_notifications ?? [],
  };
}

function mergeById<T extends { id: string; updated_at?: string; created_at?: string }>(
  primary: T[],
  secondary: T[]
): T[] {
  const map = new Map<string, T>();
  for (const item of secondary) {
    map.set(item.id, item);
  }
  for (const item of primary) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else {
      const timeA = new Date(item.updated_at ?? item.created_at ?? 0).getTime();
      const timeB = new Date(existing.updated_at ?? existing.created_at ?? 0).getTime();
      map.set(item.id, timeA >= timeB ? item : existing);
    }
  }
  return Array.from(map.values());
}

function mergeDatabaseStates(
  localState: LocalDatabaseState,
  cloudState: LocalDatabaseState
): LocalDatabaseState {
  return {
    profiles: mergeById(localState.profiles, cloudState.profiles),
    study_materials: mergeById(localState.study_materials, cloudState.study_materials),
    extracted_document_contents: mergeById(
      localState.extracted_document_contents,
      cloudState.extracted_document_contents
    ),
    processing_jobs: mergeById(localState.processing_jobs, cloudState.processing_jobs),
    ai_notes: mergeById(localState.ai_notes, cloudState.ai_notes),
    short_notes: mergeById(localState.short_notes, cloudState.short_notes),
    flashcards: mergeById(localState.flashcards, cloudState.flashcards),
    questions: mergeById(localState.questions, cloudState.questions),
    chat_conversations: mergeById(localState.chat_conversations, cloudState.chat_conversations),
    chat_messages: mergeById(localState.chat_messages, cloudState.chat_messages),
    study_plans: mergeById(localState.study_plans, cloudState.study_plans),
    study_plan_items: mergeById(localState.study_plan_items, cloudState.study_plan_items),
    focus_sessions: mergeById(localState.focus_sessions, cloudState.focus_sessions),
    revision_items: mergeById(localState.revision_items, cloudState.revision_items),
    revision_review_history: mergeById(
      localState.revision_review_history,
      cloudState.revision_review_history
    ),
    email_notifications: mergeById(
      localState.email_notifications,
      cloudState.email_notifications
    ),
  };
}

/**
 * Returns the current database state from fast in-memory/disk storage.
 */
export async function hydrateFromCloudBlobs(): Promise<LocalDatabaseState> {
  return readLocalDb();
}

/**
 * Persists the current database state to in-memory cache and local disk.
 */
export async function persistToCloudBlobs(state: LocalDatabaseState): Promise<void> {
  const mergedState = memoryCache ? mergeDatabaseStates(state, memoryCache) : state;
  memoryCache = mergedState;
  writeLocalDb(mergedState);
}

export async function mergeClientVaultIntoDatabase(
  studentProfileId: string,
  vaultPayload: Partial<LocalDatabaseState>
): Promise<LocalDatabaseState> {
  const current = await hydrateFromCloudBlobs();
  const scopedVault: LocalDatabaseState = {
    profiles: (vaultPayload.profiles ?? []).filter((p) => p.id === studentProfileId),
    study_materials: (vaultPayload.study_materials ?? []).filter(
      (m) => m.student_profile_id === studentProfileId
    ),
    extracted_document_contents: (vaultPayload.extracted_document_contents ?? []).filter(
      (c) => c.student_profile_id === studentProfileId
    ),
    processing_jobs: (vaultPayload.processing_jobs ?? []).filter(
      (j) => j.student_profile_id === studentProfileId
    ),
    ai_notes: (vaultPayload.ai_notes ?? []).filter(
      (n) => n.student_profile_id === studentProfileId
    ),
    short_notes: (vaultPayload.short_notes ?? []).filter(
      (n) => n.student_profile_id === studentProfileId
    ),
    flashcards: (vaultPayload.flashcards ?? []).filter(
      (f) => f.student_profile_id === studentProfileId
    ),
    questions: (vaultPayload.questions ?? []).filter(
      (q) => q.student_profile_id === studentProfileId
    ),
    chat_conversations: (vaultPayload.chat_conversations ?? []).filter(
      (c) => c.student_profile_id === studentProfileId
    ),
    chat_messages: (vaultPayload.chat_messages ?? []).filter(
      (m) => m.student_profile_id === studentProfileId
    ),
    study_plans: (vaultPayload.study_plans ?? []).filter(
      (p) => p.student_profile_id === studentProfileId
    ),
    study_plan_items: (vaultPayload.study_plan_items ?? []).filter(
      (i) => i.student_profile_id === studentProfileId
    ),
    focus_sessions: (vaultPayload.focus_sessions ?? []).filter(
      (f) => f.student_profile_id === studentProfileId
    ),
    revision_items: (vaultPayload.revision_items ?? []).filter(
      (r) => r.student_profile_id === studentProfileId
    ),
    revision_review_history: (vaultPayload.revision_review_history ?? []).filter(
      (h) => h.student_profile_id === studentProfileId
    ),
    email_notifications: [],
  };

  const merged = mergeDatabaseStates(current, scopedVault);
  await persistToCloudBlobs(merged);
  return merged;
}

export function readLocalDb(): LocalDatabaseState {
  if (memoryCache && !process.env.VITEST) {
    return memoryCache;
  }
  const filePath = getDbFilePath();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(EMPTY_STATE, null, 2), "utf8");
    const cloned = structuredClone(EMPTY_STATE);
    if (!process.env.VITEST) memoryCache = cloned;
    return cloned;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalDatabaseState>;
    const normalized = normalizeParsedState(parsed);
    if (!process.env.VITEST) memoryCache = normalized;
    return normalized;
  } catch {
    const cloned = structuredClone(EMPTY_STATE);
    if (!process.env.VITEST) memoryCache = cloned;
    return cloned;
  }
}

export function writeLocalDb(state: LocalDatabaseState): void {
  if (!process.env.VITEST) {
    memoryCache = state;
  }
  const filePath = getDbFilePath();
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
  } catch {
    try {
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
    } catch {
      // Ignore write error if read-only fs
    }
  }
}

export async function writeLocalStorageFile(
  storagePath: string,
  buffer: Buffer
): Promise<void> {
  const fullPath = path.join(getStorageDir(), storagePath);
  const parent = path.dirname(fullPath);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
  fs.writeFileSync(fullPath, buffer);
}

export async function readLocalStorageFile(storagePath: string): Promise<Buffer> {
  const fullPath = path.join(getStorageDir(), storagePath);
  if (fs.existsSync(fullPath)) {
    return fs.readFileSync(fullPath);
  }

  throw new Error(`Stored file not found at ${storagePath}`);
}
