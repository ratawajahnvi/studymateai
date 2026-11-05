"use client";

import type {
  AiNoteRecord,
  ExtractedChunkRecord,
  FlashcardRecord,
  ProcessingJobRecord,
  QuestionRecord,
  ShortNoteRecord,
  StudyMaterialRecord,
} from "@/lib/db/types";

const VAULT_STORAGE_KEY = "studymate_vault_v1";

export interface ClientPersistenceVault {
  study_materials: StudyMaterialRecord[];
  processing_jobs: ProcessingJobRecord[];
  extracted_document_contents: ExtractedChunkRecord[];
  ai_notes: AiNoteRecord[];
  short_notes: ShortNoteRecord[];
  flashcards: FlashcardRecord[];
  questions: QuestionRecord[];
}

const EMPTY_VAULT: ClientPersistenceVault = {
  study_materials: [],
  processing_jobs: [],
  extracted_document_contents: [],
  ai_notes: [],
  short_notes: [],
  flashcards: [],
  questions: [],
};

function mergeRecordsById<T extends { id: string; updated_at?: string; created_at?: string }>(
  primary: T[],
  secondary: T[]
): T[] {
  const map = new Map<string, T>();
  for (const item of secondary) {
    if (item && item.id) {
      map.set(item.id, item);
    }
  }
  for (const item of primary) {
    if (!item || !item.id) continue;
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else {
      const timeA = new Date(item.updated_at ?? item.created_at ?? 0).getTime();
      const timeB = new Date(existing.updated_at ?? existing.created_at ?? 0).getTime();
      map.set(item.id, timeA >= timeB ? item : existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.created_at ?? 0).getTime();
    const timeB = new Date(b.created_at ?? 0).getTime();
    return timeB - timeA;
  });
}

export function readClientVault(): ClientPersistenceVault {
  if (typeof window === "undefined") {
    return EMPTY_VAULT;
  }
  try {
    const raw = window.localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return EMPTY_VAULT;
    const parsed = JSON.parse(raw) as Partial<ClientPersistenceVault>;
    return {
      study_materials: parsed.study_materials ?? [],
      processing_jobs: parsed.processing_jobs ?? [],
      extracted_document_contents: parsed.extracted_document_contents ?? [],
      ai_notes: parsed.ai_notes ?? [],
      short_notes: parsed.short_notes ?? [],
      flashcards: parsed.flashcards ?? [],
      questions: parsed.questions ?? [],
    };
  } catch {
    return EMPTY_VAULT;
  }
}

export function writeClientVault(vault: ClientPersistenceVault): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveMaterialsToVault(
  materials: StudyMaterialRecord[],
  jobs?: ProcessingJobRecord[],
  extractedChunks?: ExtractedChunkRecord[]
): ClientPersistenceVault {
  const current = readClientVault();
  const next: ClientPersistenceVault = {
    ...current,
    study_materials: mergeRecordsById(materials, current.study_materials),
    processing_jobs: jobs ? mergeRecordsById(jobs, current.processing_jobs) : current.processing_jobs,
    extracted_document_contents: extractedChunks
      ? mergeRecordsById(extractedChunks, current.extracted_document_contents)
      : current.extracted_document_contents,
  };
  writeClientVault(next);
  return next;
}

export function saveAiNotesToVault(notes: AiNoteRecord[]): AiNoteRecord[] {
  const current = readClientVault();
  const merged = mergeRecordsById(notes, current.ai_notes);
  writeClientVault({ ...current, ai_notes: merged });
  return merged;
}

export function saveShortNotesToVault(notes: ShortNoteRecord[]): ShortNoteRecord[] {
  const current = readClientVault();
  const merged = mergeRecordsById(notes, current.short_notes);
  writeClientVault({ ...current, short_notes: merged });
  return merged;
}

export function saveFlashcardsToVault(flashcards: FlashcardRecord[]): FlashcardRecord[] {
  const current = readClientVault();
  const merged = mergeRecordsById(flashcards, current.flashcards);
  writeClientVault({ ...current, flashcards: merged });
  return merged;
}

export function saveQuestionsToVault(questions: QuestionRecord[]): QuestionRecord[] {
  const current = readClientVault();
  const merged = mergeRecordsById(questions, current.questions);
  writeClientVault({ ...current, questions: merged });
  return merged;
}

let inFlightVaultSync: Promise<ClientPersistenceVault> | null = null;

export async function syncClientVaultWithServer(): Promise<ClientPersistenceVault> {
  if (typeof window === "undefined") return EMPTY_VAULT;
  if (inFlightVaultSync) return inFlightVaultSync;

  const runSync = async (): Promise<ClientPersistenceVault> => {
    const localVault = readClientVault();
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(localVault),
      });
      if (!res.ok) return localVault;
      const json = (await res.json()) as Partial<ClientPersistenceVault> & { ok?: boolean };
      if (!json.ok) return localVault;

      const merged: ClientPersistenceVault = {
        study_materials: mergeRecordsById(
          json.study_materials ?? [],
          localVault.study_materials
        ),
        processing_jobs: mergeRecordsById(
          json.processing_jobs ?? [],
          localVault.processing_jobs
        ),
        extracted_document_contents: mergeRecordsById(
          json.extracted_document_contents ?? [],
          localVault.extracted_document_contents
        ),
        ai_notes: mergeRecordsById(json.ai_notes ?? [], localVault.ai_notes),
        short_notes: mergeRecordsById(json.short_notes ?? [], localVault.short_notes),
        flashcards: mergeRecordsById(json.flashcards ?? [], localVault.flashcards),
        questions: mergeRecordsById(json.questions ?? [], localVault.questions),
      };
      writeClientVault(merged);
      return merged;
    } catch {
      return localVault;
    } finally {
      inFlightVaultSync = null;
    }
  };

  inFlightVaultSync = runSync();
  return inFlightVaultSync;
}
