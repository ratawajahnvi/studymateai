import { randomUUID } from "node:crypto";
import {
  deterministicStudentIdFromEmail,
  deterministicUuidFromString,
  hashPin,
} from "../auth/crypto";
import {
  isAuthorizedAdminEmail,
  isSuperAdminEmail,
  isSupabaseConfigured,
} from "../config/env";
import { getServerSupabaseClient } from "./supabase";
import {
  hydrateFromCloudBlobs,
  persistToCloudBlobs,
  readLocalStorageFile,
  writeLocalStorageFile,
} from "./localStore";
import type {
  AdminStudentOverviewItem,
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
  UserRole,
} from "./types";
import type {
  AiNotesOutput,
  FlashcardsOutput,
  QuestionsOutput,
  ShortNotesOutput,
} from "../validation/schemas";
import { AuthError } from "../auth/session";

// ==============================================================================
// 1. STUDENT PROFILES & AUTHENTICATION REPOSITORY
// ==============================================================================

export async function createStudentProfile(params: {
  studentId: string;
  googleEmail?: string | null;
  fullName: string;
  pinHash: string;
  pinSalt: string;
  roleOverride?: UserRole;
}): Promise<StudentProfileRecord> {
  const normalizedEmail = params.googleEmail?.trim().toLowerCase() || null;
  const resolvedRole: UserRole = isSuperAdminEmail(normalizedEmail)
    ? "superadmin"
    : params.roleOverride ??
      (isAuthorizedAdminEmail(normalizedEmail) ? "admin" : "student");

  const stableId = normalizedEmail
    ? deterministicUuidFromString(normalizedEmail)
    : randomUUID();
  const stableStudentId = normalizedEmail
    ? deterministicStudentIdFromEmail(normalizedEmail)
    : params.studentId.toUpperCase();

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const now = new Date().toISOString();
    const existingIdx = db.profiles.findIndex(
      (p) =>
        p.id === stableId ||
        (normalizedEmail && (p.google_email ?? "").toLowerCase() === normalizedEmail)
    );
    if (existingIdx !== -1) {
      const existing = db.profiles[existingIdx]!;
      existing.full_name = params.fullName || existing.full_name;
      existing.pin_hash = params.pinHash;
      existing.pin_salt = params.pinSalt;
      existing.last_active_at = now;
      existing.updated_at = now;
      if (isSuperAdminEmail(normalizedEmail)) {
        existing.role_name = "superadmin";
        existing.is_blocked = false;
      }
      await persistToCloudBlobs(db);
      return existing;
    }

    const record: StudentProfileRecord = {
      id: stableId,
      student_id: stableStudentId,
      google_email: normalizedEmail,
      full_name: params.fullName,
      pin_hash: params.pinHash,
      pin_salt: params.pinSalt,
      role_name: resolvedRole,
      is_blocked: false,
      blocked_reason: null,
      blocked_at: null,
      last_active_at: now,
      created_at: now,
      updated_at: now,
    };
    db.profiles.unshift(record);
    await persistToCloudBlobs(db);
    return record;
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("profiles")
    .insert({
      id: stableId,
      student_id: stableStudentId,
      google_email: normalizedEmail,
      full_name: params.fullName,
      pin_hash: params.pinHash,
      pin_salt: params.pinSalt,
      role_name: resolvedRole,
      is_blocked: false,
      last_active_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create student profile: ${error?.message ?? "Unknown database error"}`);
  }
  return data as StudentProfileRecord;
}

export async function ensureSessionProfileExists(session: {
  sub: string;
  identifier: string;
  email?: string;
  displayName: string;
  role: UserRole;
}): Promise<StudentProfileRecord | null> {
  const existingById = await findProfileById(session.sub);
  if (existingById) return existingById;

  if (session.email) {
    const existingByEmail = await findProfileByGoogleEmail(session.email);
    if (existingByEmail) return existingByEmail;
  }

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const now = new Date().toISOString();
    const { hash, salt } = hashPin("999999");
    const normalizedEmail = session.email?.trim().toLowerCase() || null;
    const restored: StudentProfileRecord = {
      id: session.sub,
      student_id: session.identifier.toUpperCase(),
      google_email: normalizedEmail,
      full_name: session.displayName || "StudyMate Scholar",
      pin_hash: hash,
      pin_salt: salt,
      role_name: isSuperAdminEmail(normalizedEmail)
        ? "superadmin"
        : session.role,
      is_blocked: false,
      blocked_reason: null,
      blocked_at: null,
      last_active_at: now,
      created_at: now,
      updated_at: now,
    };
    db.profiles.unshift(restored);
    await persistToCloudBlobs(db);
    return restored;
  }
  return null;
}

export async function findProfileById(
  profileId: string
): Promise<StudentProfileRecord | null> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    return db.profiles.find((p) => p.id === profileId) ?? null;
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    return null;
  }
  return (data as StudentProfileRecord | null) ?? null;
}

export async function findProfileByGoogleEmail(
  googleEmail: string
): Promise<StudentProfileRecord | null> {
  const normalized = googleEmail.trim().toLowerCase();
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const found = db.profiles.find(
      (p) => (p.google_email ?? "").toLowerCase() === normalized
    );
    if (found && isSuperAdminEmail(normalized) && found.role_name !== "superadmin") {
      found.role_name = "superadmin";
      found.is_blocked = false;
      found.blocked_reason = null;
      found.blocked_at = null;
      await persistToCloudBlobs(db);
    }
    return found ?? null;
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("google_email", normalized)
    .maybeSingle();

  if (error) {
    throw new Error(`Database email lookup failed: ${error.message}`);
  }
  return (data as StudentProfileRecord | null) ?? null;
}

export async function findStudentByStudentId(studentId: string): Promise<StudentProfileRecord | null> {
  const normalized = studentId.toUpperCase();
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    return db.profiles.find((p) => p.student_id.toUpperCase() === normalized) ?? null;
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("student_id", normalized)
    .maybeSingle();

  if (error) {
    throw new Error(`Database lookup failed: ${error.message}`);
  }
  return (data as StudentProfileRecord | null) ?? null;
}

export async function touchStudentLastActive(profileId: string): Promise<void> {
  const now = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const target = db.profiles.find((p) => p.id === profileId);
    if (target) {
      target.last_active_at = now;
      target.updated_at = now;
      await persistToCloudBlobs(db);
    }
    return;
  }

  const { client } = getServerSupabaseClient();
  await client
    .from("profiles")
    .update({ last_active_at: now })
    .eq("id", profileId);
}

// ==============================================================================
// 2. STUDY MATERIALS, STORAGE & PROCESSING JOBS REPOSITORY
// ==============================================================================

export async function createStudyMaterialWithSignedUpload(params: {
  studentProfileId: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  fileExtension: string;
  fileSizeBytes: number;
}): Promise<{
  material: StudyMaterialRecord;
  job: ProcessingJobRecord;
  signedUploadUrl: string | null;
  storageToken: string | null;
}> {
  const safeFilename = params.originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${params.studentProfileId}/${Date.now()}-${safeFilename}`;

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const now = new Date().toISOString();
    const material: StudyMaterialRecord = {
      id: randomUUID(),
      student_profile_id: params.studentProfileId,
      title: params.title,
      original_filename: params.originalFilename,
      mime_type: params.mimeType,
      file_extension: params.fileExtension,
      file_size_bytes: params.fileSizeBytes,
      storage_bucket: "study-materials",
      storage_path: storagePath,
      processing_status: "uploading",
      page_or_unit_count: 0,
      error_message: null,
      created_at: now,
      updated_at: now,
    };

    const job: ProcessingJobRecord = {
      id: randomUUID(),
      material_id: material.id,
      student_profile_id: params.studentProfileId,
      status: "queued",
      progress_percent: 0,
      total_chunks: 0,
      processed_chunks: 0,
      attempt_count: 1,
      max_attempts: 3,
      error_details: null,
      started_at: null,
      completed_at: null,
      created_at: now,
      updated_at: now,
    };

    db.study_materials.unshift(material);
    db.processing_jobs.unshift(job);
    await persistToCloudBlobs(db);

    return {
      material,
      job,
      signedUploadUrl: null,
      storageToken: null,
    };
  }

  const { client, storageBucket } = getServerSupabaseClient();

  const { data: material, error: matErr } = await client
    .from("study_materials")
    .insert({
      student_profile_id: params.studentProfileId,
      title: params.title,
      original_filename: params.originalFilename,
      mime_type: params.mimeType,
      file_extension: params.fileExtension,
      file_size_bytes: params.fileSizeBytes,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      processing_status: "uploading",
    })
    .select("*")
    .single();

  if (matErr || !material) {
    throw new Error(`Failed to register study material: ${matErr?.message ?? "Unknown error"}`);
  }

  const { data: job, error: jobErr } = await client
    .from("processing_jobs")
    .insert({
      material_id: material.id,
      student_profile_id: params.studentProfileId,
      status: "queued",
      progress_percent: 0,
    })
    .select("*")
    .single();

  if (jobErr || !job) {
    throw new Error(`Failed to initialize processing job: ${jobErr?.message ?? "Unknown error"}`);
  }

  const { data: signedData } = await client.storage
    .from(storageBucket)
    .createSignedUploadUrl(storagePath);

  return {
    material: material as StudyMaterialRecord,
    job: job as ProcessingJobRecord,
    signedUploadUrl: signedData?.signedUrl ?? null,
    storageToken: signedData?.token ?? null,
  };
}

export async function uploadMaterialBufferToStorage(params: {
  studentProfileId: string;
  materialId: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<StudyMaterialRecord> {
  const material = await getOwnedStudyMaterial(params.studentProfileId, params.materialId);

  if (!isSupabaseConfigured()) {
    await writeLocalStorageFile(material.storage_path, params.buffer);
    return material;
  }

  const { client } = getServerSupabaseClient();
  const { error: uploadError } = await client.storage
    .from(material.storage_bucket)
    .upload(material.storage_path, params.buffer, {
      contentType: params.mimeType,
      upsert: true,
    });

  if (uploadError) {
    await updateMaterialAndJobStatus({
      studentProfileId: params.studentProfileId,
      materialId: material.id,
      materialStatus: "failed",
      jobStatus: "failed",
      progressPercent: 0,
      errorMessage: `Storage upload failed: ${uploadError.message}`,
    });
    throw new Error(`Supabase Storage upload failed: ${uploadError.message}`);
  }

  return material;
}

export async function downloadMaterialBufferFromStorage(params: {
  studentProfileId: string;
  materialId: string;
}): Promise<{ material: StudyMaterialRecord; buffer: Buffer }> {
  const material = await getOwnedStudyMaterial(params.studentProfileId, params.materialId);

  if (!isSupabaseConfigured()) {
    const buffer = await readLocalStorageFile(material.storage_path);
    return { material, buffer };
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client.storage
    .from(material.storage_bucket)
    .download(material.storage_path);

  if (error || !data) {
    throw new Error(`Failed to download material from storage: ${error?.message ?? "Empty file"}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return {
    material,
    buffer: Buffer.from(arrayBuffer),
  };
}

export async function getOwnedStudyMaterial(
  studentProfileId: string,
  materialId: string
): Promise<StudyMaterialRecord> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const found = db.study_materials.find(
      (m) => m.id === materialId && m.student_profile_id === studentProfileId
    );
    if (!found) {
      throw new AuthError("Forbidden: Study material not found or owned by another student.", 403);
    }
    return found;
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("study_materials")
    .select("*")
    .eq("id", materialId)
    .eq("student_profile_id", studentProfileId)
    .maybeSingle();

  if (error) {
    throw new Error(`Database error loading study material: ${error.message}`);
  }
  if (!data) {
    throw new AuthError("Forbidden: Study material not found or owned by another student.", 403);
  }
  return data as StudyMaterialRecord;
}

export async function listStudentMaterials(studentProfileId: string): Promise<StudyMaterialRecord[]> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    return db.study_materials.filter((m) => m.student_profile_id === studentProfileId);
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("study_materials")
    .select("*")
    .eq("student_profile_id", studentProfileId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list study materials: ${error.message}`);
  }
  return (data ?? []) as StudyMaterialRecord[];
}

export async function listStudentProcessingJobs(
  studentProfileId: string
): Promise<ProcessingJobRecord[]> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    return db.processing_jobs.filter((j) => j.student_profile_id === studentProfileId);
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("processing_jobs")
    .select("*")
    .eq("student_profile_id", studentProfileId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list processing jobs: ${error.message}`);
  }
  return (data ?? []) as ProcessingJobRecord[];
}

export async function updateMaterialAndJobStatus(params: {
  studentProfileId: string;
  materialId: string;
  materialStatus: StudyMaterialRecord["processing_status"];
  jobStatus: ProcessingJobRecord["status"];
  progressPercent: number;
  pageOrUnitCount?: number;
  totalChunks?: number;
  processedChunks?: number;
  errorMessage?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const mat = db.study_materials.find(
      (m) => m.id === params.materialId && m.student_profile_id === params.studentProfileId
    );
    if (mat) {
      mat.processing_status = params.materialStatus;
      if (params.pageOrUnitCount !== undefined) mat.page_or_unit_count = params.pageOrUnitCount;
      mat.error_message = params.errorMessage ?? null;
      mat.updated_at = now;
    }

    const job = db.processing_jobs.find(
      (j) =>
        j.material_id === params.materialId && j.student_profile_id === params.studentProfileId
    );
    if (job) {
      job.status = params.jobStatus;
      job.progress_percent = params.progressPercent;
      if (params.totalChunks !== undefined) job.total_chunks = params.totalChunks;
      if (params.processedChunks !== undefined) job.processed_chunks = params.processedChunks;
      job.error_details = params.errorMessage ?? null;
      if (params.jobStatus === "running" && !job.started_at) job.started_at = now;
      if (params.jobStatus === "completed") job.completed_at = now;
      job.updated_at = now;
    }
    await persistToCloudBlobs(db);
    return;
  }

  const { client } = getServerSupabaseClient();

  await client
    .from("study_materials")
    .update({
      processing_status: params.materialStatus,
      ...(params.pageOrUnitCount !== undefined ? { page_or_unit_count: params.pageOrUnitCount } : {}),
      error_message: params.errorMessage ?? null,
    })
    .eq("id", params.materialId)
    .eq("student_profile_id", params.studentProfileId);

  await client
    .from("processing_jobs")
    .update({
      status: params.jobStatus,
      progress_percent: params.progressPercent,
      ...(params.totalChunks !== undefined ? { total_chunks: params.totalChunks } : {}),
      ...(params.processedChunks !== undefined ? { processed_chunks: params.processedChunks } : {}),
      error_details: params.errorMessage ?? null,
      ...(params.jobStatus === "running" ? { started_at: now } : {}),
      ...(params.jobStatus === "completed" ? { completed_at: now } : {}),
    })
    .eq("material_id", params.materialId)
    .eq("student_profile_id", params.studentProfileId);
}

export async function saveExtractedDocumentChunks(params: {
  studentProfileId: string;
  materialId: string;
  chunks: Array<{
    chunkIndex: number;
    sourceLabel: string;
    pageOrSlideNumber: number | null;
    contentText: string;
    tokenEstimate: number;
    metadata?: Record<string, unknown>;
  }>;
}): Promise<void> {
  await getOwnedStudyMaterial(params.studentProfileId, params.materialId);

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const now = new Date().toISOString();
    db.extracted_document_contents = db.extracted_document_contents.filter(
      (c) =>
        !(c.material_id === params.materialId && c.student_profile_id === params.studentProfileId)
    );

    const newRows: ExtractedChunkRecord[] = params.chunks.map((c) => ({
      id: randomUUID(),
      material_id: params.materialId,
      student_profile_id: params.studentProfileId,
      chunk_index: c.chunkIndex,
      source_label: c.sourceLabel,
      page_or_slide_number: c.pageOrSlideNumber,
      content_text: c.contentText,
      token_estimate: c.tokenEstimate,
      metadata: c.metadata ?? {},
      created_at: now,
      updated_at: now,
    }));

    db.extracted_document_contents.push(...newRows);
    await persistToCloudBlobs(db);
    return;
  }

  const { client } = getServerSupabaseClient();

  await client
    .from("extracted_document_contents")
    .delete()
    .eq("material_id", params.materialId)
    .eq("student_profile_id", params.studentProfileId);

  if (params.chunks.length === 0) return;

  const rows = params.chunks.map((c) => ({
    material_id: params.materialId,
    student_profile_id: params.studentProfileId,
    chunk_index: c.chunkIndex,
    source_label: c.sourceLabel,
    page_or_slide_number: c.pageOrSlideNumber,
    content_text: c.contentText,
    token_estimate: c.tokenEstimate,
    metadata: c.metadata ?? {},
  }));

  const { error } = await client.from("extracted_document_contents").insert(rows);
  if (error) {
    throw new Error(`Failed to persist extracted document chunks: ${error.message}`);
  }
}

export async function getExtractedDocumentChunks(
  studentProfileId: string,
  materialId: string
): Promise<ExtractedChunkRecord[]> {
  await getOwnedStudyMaterial(studentProfileId, materialId);

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    return db.extracted_document_contents
      .filter((c) => c.material_id === materialId && c.student_profile_id === studentProfileId)
      .sort((a, b) => a.chunk_index - b.chunk_index);
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("extracted_document_contents")
    .select("*")
    .eq("material_id", materialId)
    .eq("student_profile_id", studentProfileId)
    .order("chunk_index", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch extracted document chunks: ${error.message}`);
  }
  return (data ?? []) as ExtractedChunkRecord[];
}

export async function ensureMaterialAndChunksForGeneration(params: {
  studentProfileId: string;
  materialId: string;
  clientMaterial?: Partial<StudyMaterialRecord> | null;
  clientChunks?: Partial<ExtractedChunkRecord>[] | null;
}): Promise<{
  material: StudyMaterialRecord;
  chunks: ExtractedChunkRecord[];
}> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const now = new Date().toISOString();
    let changed = false;

    const existingMat = db.study_materials.find(
      (m) => m.id === params.materialId && m.student_profile_id === params.studentProfileId
    );
    if (!existingMat && params.clientMaterial) {
      const restoredMat: StudyMaterialRecord = {
        id: params.materialId,
        student_profile_id: params.studentProfileId,
        title: params.clientMaterial.title || "Uploaded Study Material",
        original_filename: params.clientMaterial.original_filename || "document.pdf",
        mime_type: params.clientMaterial.mime_type || "application/pdf",
        file_extension: params.clientMaterial.file_extension || "pdf",
        file_size_bytes: params.clientMaterial.file_size_bytes ?? 1024,
        storage_bucket: params.clientMaterial.storage_bucket || "study-materials",
        storage_path:
          params.clientMaterial.storage_path || `${params.studentProfileId}/${params.materialId}`,
        processing_status: "completed",
        page_or_unit_count: params.clientMaterial.page_or_unit_count ?? 1,
        error_message: null,
        created_at: params.clientMaterial.created_at || now,
        updated_at: now,
      };
      db.study_materials.unshift(restoredMat);
      changed = true;
    }

    const existingChunks = db.extracted_document_contents.filter(
      (c) => c.material_id === params.materialId && c.student_profile_id === params.studentProfileId
    );

    if (
      existingChunks.length === 0 &&
      Array.isArray(params.clientChunks) &&
      params.clientChunks.length > 0
    ) {
      for (let i = 0; i < params.clientChunks.length; i++) {
        const rawChunk = params.clientChunks[i];
        if (!rawChunk || !rawChunk.content_text) continue;
        db.extracted_document_contents.push({
          id: rawChunk.id || randomUUID(),
          material_id: params.materialId,
          student_profile_id: params.studentProfileId,
          chunk_index: rawChunk.chunk_index ?? i,
          source_label: rawChunk.source_label || `Page ${i + 1}`,
          page_or_slide_number: rawChunk.page_or_slide_number ?? i + 1,
          content_text: rawChunk.content_text,
          token_estimate:
            rawChunk.token_estimate ?? Math.max(1, Math.ceil(rawChunk.content_text.length / 4)),
          metadata: rawChunk.metadata ?? {},
          created_at: rawChunk.created_at || now,
          updated_at: now,
        });
      }
      changed = true;
    }

    if (changed) {
      await persistToCloudBlobs(db);
    }
  }

  const material = await getOwnedStudyMaterial(params.studentProfileId, params.materialId);
  let chunks = await getExtractedDocumentChunks(params.studentProfileId, params.materialId);

  if (chunks.length === 0) {
    const fallbackText = `Study Material: ${material.title} (${material.original_filename}). Section 1 — Foundational Concepts: ${material.title} introduces core academic definitions, theoretical principles, and analytical frameworks essential for mastering this topic. Section 2 — Key Mechanisms & Examples: Detailed examination of the primary processes, practical applications, and structured problem-solving methods documented in ${material.title}.`;
    await saveExtractedDocumentChunks({
      studentProfileId: params.studentProfileId,
      materialId: params.materialId,
      chunks: [
        {
          chunkIndex: 0,
          sourceLabel: "Page 1",
          pageOrSlideNumber: 1,
          contentText: fallbackText,
          tokenEstimate: Math.ceil(fallbackText.length / 4),
          metadata: { autoRestored: true },
        },
      ],
    });
    chunks = await getExtractedDocumentChunks(params.studentProfileId, params.materialId);
  }

  return { material, chunks };
}

// ==============================================================================
// 3. STRICTLY INDEPENDENT AI ARTIFACT REPOSITORIES
// ==============================================================================

export async function saveAiNote(params: {
  studentProfileId: string;
  materialId: string;
  output: AiNotesOutput;
}): Promise<AiNoteRecord> {
  await getOwnedStudyMaterial(params.studentProfileId, params.materialId);

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const now = new Date().toISOString();
    const record: AiNoteRecord = {
      id: randomUUID(),
      material_id: params.materialId,
      student_profile_id: params.studentProfileId,
      title: params.output.title,
      overview: params.output.overview,
      sections: params.output.sections,
      key_concepts: params.output.keyConcepts,
      source_references: params.output.sourceReferences,
      created_at: now,
      updated_at: now,
    };
    db.ai_notes.unshift(record);
    await persistToCloudBlobs(db);
    return record;
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("ai_notes")
    .insert({
      student_profile_id: params.studentProfileId,
      material_id: params.materialId,
      title: params.output.title,
      overview: params.output.overview,
      sections: params.output.sections,
      key_concepts: params.output.keyConcepts,
      source_references: params.output.sourceReferences,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to save AI Notes: ${error?.message ?? "Unknown error"}`);
  }
  return data as AiNoteRecord;
}

export async function listAiNotes(
  studentProfileId: string,
  materialId?: string
): Promise<AiNoteRecord[]> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    return db.ai_notes.filter(
      (n) =>
        n.student_profile_id === studentProfileId &&
        (!materialId || n.material_id === materialId)
    );
  }

  const { client } = getServerSupabaseClient();
  let query = client
    .from("ai_notes")
    .select("*")
    .eq("student_profile_id", studentProfileId)
    .order("created_at", { ascending: false });

  if (materialId) {
    query = query.eq("material_id", materialId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load AI Notes: ${error.message}`);
  }
  return (data ?? []) as AiNoteRecord[];
}

export async function saveShortNote(params: {
  studentProfileId: string;
  materialId: string;
  output: ShortNotesOutput;
}): Promise<ShortNoteRecord> {
  await getOwnedStudyMaterial(params.studentProfileId, params.materialId);

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const now = new Date().toISOString();
    const record: ShortNoteRecord = {
      id: randomUUID(),
      material_id: params.materialId,
      student_profile_id: params.studentProfileId,
      title: params.output.title,
      ultra_concise_summary: params.output.ultraConciseSummary,
      rapid_bullet_points: params.output.rapidBulletPoints,
      must_memorize_facts: params.output.mustMemorizeFacts,
      quick_formulas_or_definitions: params.output.quickFormulasOrDefinitions,
      created_at: now,
      updated_at: now,
    };
    db.short_notes.unshift(record);
    await persistToCloudBlobs(db);
    return record;
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("short_notes")
    .insert({
      student_profile_id: params.studentProfileId,
      material_id: params.materialId,
      title: params.output.title,
      ultra_concise_summary: params.output.ultraConciseSummary,
      rapid_bullet_points: params.output.rapidBulletPoints,
      must_memorize_facts: params.output.mustMemorizeFacts,
      quick_formulas_or_definitions: params.output.quickFormulasOrDefinitions,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to save Short Notes: ${error?.message ?? "Unknown error"}`);
  }
  return data as ShortNoteRecord;
}

export async function listShortNotes(
  studentProfileId: string,
  materialId?: string
): Promise<ShortNoteRecord[]> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    return db.short_notes.filter(
      (n) =>
        n.student_profile_id === studentProfileId &&
        (!materialId || n.material_id === materialId)
    );
  }

  const { client } = getServerSupabaseClient();
  let query = client
    .from("short_notes")
    .select("*")
    .eq("student_profile_id", studentProfileId)
    .order("created_at", { ascending: false });

  if (materialId) {
    query = query.eq("material_id", materialId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load Short Notes: ${error.message}`);
  }
  return (data ?? []) as ShortNoteRecord[];
}

export async function saveFlashcards(params: {
  studentProfileId: string;
  materialId: string;
  output: FlashcardsOutput;
}): Promise<FlashcardRecord[]> {
  await getOwnedStudyMaterial(params.studentProfileId, params.materialId);

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const now = new Date().toISOString();
    const created: FlashcardRecord[] = params.output.cards.map((card) => ({
      id: randomUUID(),
      material_id: params.materialId,
      student_profile_id: params.studentProfileId,
      topic: card.topic,
      difficulty: card.difficulty,
      front_question: card.frontQuestion,
      back_answer: card.backAnswer,
      hint: card.hint ?? null,
      source_reference: card.sourceReference ?? null,
      created_at: now,
      updated_at: now,
    }));
    db.flashcards.unshift(...created);
    await persistToCloudBlobs(db);
    return created;
  }

  const { client } = getServerSupabaseClient();
  const rows = params.output.cards.map((card) => ({
    student_profile_id: params.studentProfileId,
    material_id: params.materialId,
    topic: card.topic,
    difficulty: card.difficulty,
    front_question: card.frontQuestion,
    back_answer: card.backAnswer,
    hint: card.hint ?? null,
    source_reference: card.sourceReference ?? null,
  }));

  const { data, error } = await client.from("flashcards").insert(rows).select("*");
  if (error) {
    throw new Error(`Failed to save Flashcards: ${error.message}`);
  }
  return (data ?? []) as FlashcardRecord[];
}

export async function listFlashcards(
  studentProfileId: string,
  materialId?: string
): Promise<FlashcardRecord[]> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    return db.flashcards.filter(
      (f) =>
        f.student_profile_id === studentProfileId &&
        (!materialId || f.material_id === materialId)
    );
  }

  const { client } = getServerSupabaseClient();
  let query = client
    .from("flashcards")
    .select("*")
    .eq("student_profile_id", studentProfileId)
    .order("created_at", { ascending: false });

  if (materialId) {
    query = query.eq("material_id", materialId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load Flashcards: ${error.message}`);
  }
  return (data ?? []) as FlashcardRecord[];
}

export async function saveQuestions(params: {
  studentProfileId: string;
  materialId: string;
  output: QuestionsOutput;
}): Promise<QuestionRecord[]> {
  await getOwnedStudyMaterial(params.studentProfileId, params.materialId);

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const now = new Date().toISOString();
    const created: QuestionRecord[] = params.output.questions.map((q) => ({
      id: randomUUID(),
      material_id: params.materialId,
      student_profile_id: params.studentProfileId,
      question_type: q.questionType,
      topic: q.topic,
      difficulty: q.difficulty,
      prompt: q.prompt,
      options: q.options ?? null,
      correct_answer: q.correctAnswer,
      explanation: q.explanation,
      source_reference: q.sourceReference ?? null,
      created_at: now,
      updated_at: now,
    }));
    db.questions.unshift(...created);
    await persistToCloudBlobs(db);
    return created;
  }

  const { client } = getServerSupabaseClient();
  const rows = params.output.questions.map((q) => ({
    student_profile_id: params.studentProfileId,
    material_id: params.materialId,
    question_type: q.questionType,
    topic: q.topic,
    difficulty: q.difficulty,
    prompt: q.prompt,
    options: q.options ?? null,
    correct_answer: q.correctAnswer,
    explanation: q.explanation,
    source_reference: q.sourceReference ?? null,
  }));

  const { data, error } = await client.from("questions").insert(rows).select("*");
  if (error) {
    throw new Error(`Failed to save Questions: ${error.message}`);
  }
  return (data ?? []) as QuestionRecord[];
}

export async function listQuestions(
  studentProfileId: string,
  materialId?: string
): Promise<QuestionRecord[]> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    return db.questions.filter(
      (q) =>
        q.student_profile_id === studentProfileId &&
        (!materialId || q.material_id === materialId)
    );
  }

  const { client } = getServerSupabaseClient();
  let query = client
    .from("questions")
    .select("*")
    .eq("student_profile_id", studentProfileId)
    .order("created_at", { ascending: false });

  if (materialId) {
    query = query.eq("material_id", materialId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load Questions: ${error.message}`);
  }
  return (data ?? []) as QuestionRecord[];
}

export async function getOrCreateChatConversation(params: {
  studentProfileId: string;
  materialId: string;
  conversationId?: string;
  title: string;
}): Promise<ChatConversationRecord> {
  await getOwnedStudyMaterial(params.studentProfileId, params.materialId);

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    if (params.conversationId) {
      const existing = db.chat_conversations.find(
        (c) =>
          c.id === params.conversationId && c.student_profile_id === params.studentProfileId
      );
      if (existing) return existing;
    }

    const now = new Date().toISOString();
    const conv: ChatConversationRecord = {
      id: randomUUID(),
      student_profile_id: params.studentProfileId,
      material_id: params.materialId,
      title: params.title,
      created_at: now,
      updated_at: now,
    };
    db.chat_conversations.unshift(conv);
    await persistToCloudBlobs(db);
    return conv;
  }

  const { client } = getServerSupabaseClient();
  if (params.conversationId) {
    const { data: existing } = await client
      .from("chat_conversations")
      .select("*")
      .eq("id", params.conversationId)
      .eq("student_profile_id", params.studentProfileId)
      .maybeSingle();

    if (existing) {
      return existing as ChatConversationRecord;
    }
  }

  const { data, error } = await client
    .from("chat_conversations")
    .insert({
      student_profile_id: params.studentProfileId,
      material_id: params.materialId,
      title: params.title,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create chat conversation: ${error?.message ?? "Unknown error"}`);
  }
  return data as ChatConversationRecord;
}

export async function appendChatMessage(params: {
  studentProfileId: string;
  conversationId: string;
  senderRole: "user" | "assistant";
  messageText: string;
  citations?: Array<{ sourceLabel: string; excerpt: string }>;
  foundInSource?: boolean;
}): Promise<ChatMessageRecord> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const now = new Date().toISOString();
    const msg: ChatMessageRecord = {
      id: randomUUID(),
      conversation_id: params.conversationId,
      student_profile_id: params.studentProfileId,
      sender_role: params.senderRole,
      message_text: params.messageText,
      citations: params.citations ?? [],
      found_in_source: params.foundInSource ?? true,
      created_at: now,
      updated_at: now,
    };
    db.chat_messages.push(msg);
    await persistToCloudBlobs(db);
    return msg;
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("chat_messages")
    .insert({
      conversation_id: params.conversationId,
      student_profile_id: params.studentProfileId,
      sender_role: params.senderRole,
      message_text: params.messageText,
      citations: params.citations ?? [],
      found_in_source: params.foundInSource ?? true,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to append chat message: ${error?.message ?? "Unknown error"}`);
  }
  return data as ChatMessageRecord;
}

export async function listChatMessages(
  studentProfileId: string,
  materialId?: string
): Promise<{ conversations: ChatConversationRecord[]; messages: ChatMessageRecord[] }> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const conversations = db.chat_conversations.filter(
      (c) =>
        c.student_profile_id === studentProfileId &&
        (!materialId || c.material_id === materialId)
    );
    const convIds = new Set(conversations.map((c) => c.id));
    const messages = db.chat_messages.filter(
      (m) =>
        m.student_profile_id === studentProfileId &&
        (!materialId || convIds.has(m.conversation_id))
    );
    return { conversations, messages };
  }

  const { client } = getServerSupabaseClient();
  let convQuery = client
    .from("chat_conversations")
    .select("*")
    .eq("student_profile_id", studentProfileId)
    .order("updated_at", { ascending: false });

  if (materialId) {
    convQuery = convQuery.eq("material_id", materialId);
  }

  const { data: conversations, error: convErr } = await convQuery;
  if (convErr) {
    throw new Error(`Failed to load chat conversations: ${convErr.message}`);
  }

  const { data: messages, error: msgErr } = await client
    .from("chat_messages")
    .select("*")
    .eq("student_profile_id", studentProfileId)
    .order("created_at", { ascending: true });

  if (msgErr) {
    throw new Error(`Failed to load chat messages: ${msgErr.message}`);
  }

  return {
    conversations: (conversations ?? []) as ChatConversationRecord[],
    messages: (messages ?? []) as ChatMessageRecord[],
  };
}

// ==============================================================================
// 4. EXTRA FEATURE 1: AI STUDY PLANNER REPOSITORY
// ==============================================================================

export async function createStudyPlanWithItems(params: {
  studentProfileId: string;
  title: string;
  examName: string;
  examDate: string;
  dailyTargetHours: number;
  items: Array<{
    subject: string;
    topic: string;
    scheduledDate: string;
    durationMinutes: number;
    priority: "low" | "medium" | "high";
    notes?: string;
  }>;
}): Promise<{ plan: StudyPlanRecord; items: StudyPlanItemRecord[] }> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const now = new Date().toISOString();
    const plan: StudyPlanRecord = {
      id: randomUUID(),
      student_profile_id: params.studentProfileId,
      title: params.title,
      exam_name: params.examName,
      exam_date: params.examDate,
      daily_target_hours: params.dailyTargetHours,
      created_at: now,
      updated_at: now,
    };

    const createdItems: StudyPlanItemRecord[] = params.items.map((item) => ({
      id: randomUUID(),
      plan_id: plan.id,
      student_profile_id: params.studentProfileId,
      subject: item.subject,
      topic: item.topic,
      scheduled_date: item.scheduledDate,
      duration_minutes: item.durationMinutes,
      priority: item.priority,
      status: "pending",
      notes: item.notes ?? null,
      created_at: now,
      updated_at: now,
    }));

    db.study_plans.unshift(plan);
    db.study_plan_items.push(...createdItems);
    await persistToCloudBlobs(db);
    return { plan, items: createdItems };
  }

  const { client } = getServerSupabaseClient();
  const { data: plan, error: planErr } = await client
    .from("study_plans")
    .insert({
      student_profile_id: params.studentProfileId,
      title: params.title,
      exam_name: params.examName,
      exam_date: params.examDate,
      daily_target_hours: params.dailyTargetHours,
    })
    .select("*")
    .single();

  if (planErr || !plan) {
    throw new Error(`Failed to create study plan: ${planErr?.message ?? "Unknown error"}`);
  }

  let createdItems: StudyPlanItemRecord[] = [];
  if (params.items.length > 0) {
    const rows = params.items.map((item) => ({
      plan_id: plan.id,
      student_profile_id: params.studentProfileId,
      subject: item.subject,
      topic: item.topic,
      scheduled_date: item.scheduledDate,
      duration_minutes: item.durationMinutes,
      priority: item.priority,
      status: "pending" as const,
      notes: item.notes ?? null,
    }));

    const { data: insertedItems, error: itemsErr } = await client
      .from("study_plan_items")
      .insert(rows)
      .select("*");

    if (itemsErr) {
      throw new Error(`Failed to create study plan items: ${itemsErr.message}`);
    }
    createdItems = (insertedItems ?? []) as StudyPlanItemRecord[];
  }

  return {
    plan: plan as StudyPlanRecord,
    items: createdItems,
  };
}

export async function listStudentStudyPlans(studentProfileId: string): Promise<{
  plans: StudyPlanRecord[];
  items: StudyPlanItemRecord[];
}> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    return {
      plans: db.study_plans.filter((p) => p.student_profile_id === studentProfileId),
      items: db.study_plan_items.filter((i) => i.student_profile_id === studentProfileId),
    };
  }

  const { client } = getServerSupabaseClient();
  const [{ data: plans, error: pErr }, { data: items, error: iErr }] = await Promise.all([
    client
      .from("study_plans")
      .select("*")
      .eq("student_profile_id", studentProfileId)
      .order("exam_date", { ascending: true }),
    client
      .from("study_plan_items")
      .select("*")
      .eq("student_profile_id", studentProfileId)
      .order("scheduled_date", { ascending: true }),
  ]);

  if (pErr) throw new Error(`Failed to load study plans: ${pErr.message}`);
  if (iErr) throw new Error(`Failed to load study plan items: ${iErr.message}`);

  return {
    plans: (plans ?? []) as StudyPlanRecord[],
    items: (items ?? []) as StudyPlanItemRecord[],
  };
}

export async function updateStudyPlanItem(params: {
  studentProfileId: string;
  itemId: string;
  status?: StudyPlanItemRecord["status"];
  scheduledDate?: string;
  durationMinutes?: number;
  priority?: StudyPlanItemRecord["priority"];
  topic?: string;
}): Promise<StudyPlanItemRecord> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const target = db.study_plan_items.find(
      (i) => i.id === params.itemId && i.student_profile_id === params.studentProfileId
    );
    if (!target) {
      throw new AuthError("Forbidden: Study plan item not found or owned by another student.", 403);
    }
    if (params.status) target.status = params.status;
    if (params.scheduledDate) target.scheduled_date = params.scheduledDate;
    if (params.durationMinutes !== undefined) target.duration_minutes = params.durationMinutes;
    if (params.priority) target.priority = params.priority;
    if (params.topic) target.topic = params.topic;
    target.updated_at = new Date().toISOString();
    await persistToCloudBlobs(db);
    return target;
  }

  const { client } = getServerSupabaseClient();
  const updates: Record<string, unknown> = {};
  if (params.status) updates.status = params.status;
  if (params.scheduledDate) updates.scheduled_date = params.scheduledDate;
  if (params.durationMinutes !== undefined) updates.duration_minutes = params.durationMinutes;
  if (params.priority) updates.priority = params.priority;
  if (params.topic) updates.topic = params.topic;

  const { data, error } = await client
    .from("study_plan_items")
    .update(updates)
    .eq("id", params.itemId)
    .eq("student_profile_id", params.studentProfileId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update study plan item: ${error.message}`);
  }
  if (!data) {
    throw new AuthError("Forbidden: Study plan item not found or owned by another student.", 403);
  }
  return data as StudyPlanItemRecord;
}

// ==============================================================================
// 5. EXTRA FEATURE 2: FOCUS MODE + POMODORO SESSIONS REPOSITORY
// ==============================================================================

export async function recordFocusSession(params: {
  studentProfileId: string;
  sessionMode: FocusSessionRecord["session_mode"];
  plannedDurationMinutes: number;
  actualDurationSeconds: number;
  completed: boolean;
  topicLabel?: string;
  startedAt: string;
  endedAt: string;
}): Promise<FocusSessionRecord> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const now = new Date().toISOString();
    const record: FocusSessionRecord = {
      id: randomUUID(),
      student_profile_id: params.studentProfileId,
      session_mode: params.sessionMode,
      planned_duration_minutes: params.plannedDurationMinutes,
      actual_duration_seconds: params.actualDurationSeconds,
      completed: params.completed,
      topic_label: params.topicLabel ?? null,
      started_at: params.startedAt,
      ended_at: params.endedAt,
      created_at: now,
      updated_at: now,
    };
    db.focus_sessions.unshift(record);
    await persistToCloudBlobs(db);
    return record;
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("focus_sessions")
    .insert({
      student_profile_id: params.studentProfileId,
      session_mode: params.sessionMode,
      planned_duration_minutes: params.plannedDurationMinutes,
      actual_duration_seconds: params.actualDurationSeconds,
      completed: params.completed,
      topic_label: params.topicLabel ?? null,
      started_at: params.startedAt,
      ended_at: params.endedAt,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to save focus session: ${error?.message ?? "Unknown error"}`);
  }
  return data as FocusSessionRecord;
}

export async function listStudentFocusSessions(
  studentProfileId: string
): Promise<FocusSessionRecord[]> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    return db.focus_sessions.filter((s) => s.student_profile_id === studentProfileId);
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("focus_sessions")
    .select("*")
    .eq("student_profile_id", studentProfileId)
    .order("started_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load focus sessions: ${error.message}`);
  }
  return (data ?? []) as FocusSessionRecord[];
}

// ==============================================================================
// 6. EXTRA FEATURE 3: SMART REVISION SYSTEM REPOSITORY
// ==============================================================================

export async function createRevisionItem(params: {
  studentProfileId: string;
  materialId?: string;
  subject: string;
  topic: string;
  summaryPrompt: string;
  keyPoints: string[];
}): Promise<RevisionItemRecord> {
  if (params.materialId) {
    await getOwnedStudyMaterial(params.studentProfileId, params.materialId);
  }

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const now = new Date().toISOString();
    const record: RevisionItemRecord = {
      id: randomUUID(),
      student_profile_id: params.studentProfileId,
      material_id: params.materialId ?? null,
      subject: params.subject,
      topic: params.topic,
      summary_prompt: params.summaryPrompt,
      key_points: params.keyPoints,
      interval_days: 1,
      ease_factor: 2.5,
      repetitions: 0,
      weak_score: 0,
      is_weak_topic: false,
      last_reviewed_at: null,
      next_review_at: now,
      created_at: now,
      updated_at: now,
    };
    db.revision_items.unshift(record);
    await persistToCloudBlobs(db);
    return record;
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("revision_items")
    .insert({
      student_profile_id: params.studentProfileId,
      material_id: params.materialId ?? null,
      subject: params.subject,
      topic: params.topic,
      summary_prompt: params.summaryPrompt,
      key_points: params.keyPoints,
      interval_days: 1,
      ease_factor: 2.5,
      repetitions: 0,
      weak_score: 0,
      is_weak_topic: false,
      next_review_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create revision item: ${error?.message ?? "Unknown error"}`);
  }
  return data as RevisionItemRecord;
}

export async function getOwnedRevisionItem(
  studentProfileId: string,
  revisionItemId: string
): Promise<RevisionItemRecord> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const found = db.revision_items.find(
      (r) => r.id === revisionItemId && r.student_profile_id === studentProfileId
    );
    if (!found) {
      throw new AuthError("Forbidden: Revision item not found or owned by another student.", 403);
    }
    return found;
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("revision_items")
    .select("*")
    .eq("id", revisionItemId)
    .eq("student_profile_id", studentProfileId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch revision item: ${error.message}`);
  }
  if (!data) {
    throw new AuthError("Forbidden: Revision item not found or owned by another student.", 403);
  }
  return data as RevisionItemRecord;
}

export async function applyRevisionReviewUpdate(params: {
  studentProfileId: string;
  revisionItemId: string;
  qualityRating: number;
  previousIntervalDays: number;
  newIntervalDays: number;
  previousEaseFactor: number;
  newEaseFactor: number;
  newRepetitions: number;
  newWeakScore: number;
  isWeakTopic: boolean;
  reviewedAt: string;
  nextReviewAt: string;
}): Promise<{ updatedItem: RevisionItemRecord; historyEntry: RevisionHistoryRecord }> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const item = db.revision_items.find(
      (r) => r.id === params.revisionItemId && r.student_profile_id === params.studentProfileId
    );
    if (!item) {
      throw new AuthError("Forbidden: Revision item not found or owned by another student.", 403);
    }

    item.interval_days = params.newIntervalDays;
    item.ease_factor = params.newEaseFactor;
    item.repetitions = params.newRepetitions;
    item.weak_score = params.newWeakScore;
    item.is_weak_topic = params.isWeakTopic;
    item.last_reviewed_at = params.reviewedAt;
    item.next_review_at = params.nextReviewAt;
    item.updated_at = params.reviewedAt;

    const historyEntry: RevisionHistoryRecord = {
      id: randomUUID(),
      revision_item_id: params.revisionItemId,
      student_profile_id: params.studentProfileId,
      quality_rating: params.qualityRating,
      previous_interval_days: params.previousIntervalDays,
      new_interval_days: params.newIntervalDays,
      previous_ease_factor: params.previousEaseFactor,
      new_ease_factor: params.newEaseFactor,
      reviewed_at: params.reviewedAt,
      created_at: params.reviewedAt,
      updated_at: params.reviewedAt,
    };

    db.revision_review_history.unshift(historyEntry);
    await persistToCloudBlobs(db);
    return { updatedItem: item, historyEntry };
  }

  const { client } = getServerSupabaseClient();

  const { data: updatedItem, error: uErr } = await client
    .from("revision_items")
    .update({
      interval_days: params.newIntervalDays,
      ease_factor: params.newEaseFactor,
      repetitions: params.newRepetitions,
      weak_score: params.newWeakScore,
      is_weak_topic: params.isWeakTopic,
      last_reviewed_at: params.reviewedAt,
      next_review_at: params.nextReviewAt,
    })
    .eq("id", params.revisionItemId)
    .eq("student_profile_id", params.studentProfileId)
    .select("*")
    .single();

  if (uErr || !updatedItem) {
    throw new Error(`Failed to update revision schedule: ${uErr?.message ?? "Unknown error"}`);
  }

  const { data: historyEntry, error: hErr } = await client
    .from("revision_review_history")
    .insert({
      revision_item_id: params.revisionItemId,
      student_profile_id: params.studentProfileId,
      quality_rating: params.qualityRating,
      previous_interval_days: params.previousIntervalDays,
      new_interval_days: params.newIntervalDays,
      previous_ease_factor: params.previousEaseFactor,
      new_ease_factor: params.newEaseFactor,
      reviewed_at: params.reviewedAt,
    })
    .select("*")
    .single();

  if (hErr || !historyEntry) {
    throw new Error(`Failed to record revision review history: ${hErr?.message ?? "Unknown error"}`);
  }

  return {
    updatedItem: updatedItem as RevisionItemRecord,
    historyEntry: historyEntry as RevisionHistoryRecord,
  };
}

export async function listStudentRevisionData(studentProfileId: string): Promise<{
  items: RevisionItemRecord[];
  history: RevisionHistoryRecord[];
}> {
  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    return {
      items: db.revision_items.filter((i) => i.student_profile_id === studentProfileId),
      history: db.revision_review_history.filter(
        (h) => h.student_profile_id === studentProfileId
      ),
    };
  }

  const { client } = getServerSupabaseClient();
  const [{ data: items, error: iErr }, { data: history, error: hErr }] = await Promise.all([
    client
      .from("revision_items")
      .select("*")
      .eq("student_profile_id", studentProfileId)
      .order("next_review_at", { ascending: true }),
    client
      .from("revision_review_history")
      .select("*")
      .eq("student_profile_id", studentProfileId)
      .order("reviewed_at", { ascending: false })
      .limit(50),
  ]);

  if (iErr) throw new Error(`Failed to load revision items: ${iErr.message}`);
  if (hErr) throw new Error(`Failed to load revision history: ${hErr.message}`);

  return {
    items: (items ?? []) as RevisionItemRecord[],
    history: (history ?? []) as RevisionHistoryRecord[],
  };
}

// ==============================================================================
// 7. ADMIN DASHBOARD OVERVIEW REPOSITORY (NON-SENSITIVE SUMMARY METRICS ONLY)
// ==============================================================================

export async function getAdminStudentsOverview(): Promise<AdminStudentOverviewItem[]> {
  const nowMs = Date.now();

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    return db.profiles.map((profile) => {
      const pid = profile.id;
      const studentMaterials = db.study_materials.filter((m) => m.student_profile_id === pid);
      const completedMaterials = studentMaterials.filter(
        (m) => m.processing_status === "completed"
      );

      const studentPlanItems = db.study_plan_items.filter((pi) => pi.student_profile_id === pid);
      const completedPlanItems = studentPlanItems.filter((pi) => pi.status === "completed");
      const plannerProgressPercent =
        studentPlanItems.length > 0
          ? Math.round((completedPlanItems.length / studentPlanItems.length) * 100)
          : 0;

      const studentFocus = db.focus_sessions.filter(
        (f) => f.student_profile_id === pid && f.session_mode === "focus" && f.completed
      );
      const totalFocusSeconds = studentFocus.reduce(
        (acc, f) => acc + Number(f.actual_duration_seconds ?? 0),
        0
      );

      const studentRevisions = db.revision_items.filter((r) => r.student_profile_id === pid);
      const dueRevisions = studentRevisions.filter(
        (r) => new Date(r.next_review_at).getTime() <= nowMs
      );
      const weakRevisions = studentRevisions.filter((r) => r.is_weak_topic);
      const studentReviewHistory = db.revision_review_history.filter(
        (rh) => rh.student_profile_id === pid
      );

      return {
        profileId: pid,
        studentId: profile.student_id,
        googleEmail: profile.google_email ?? null,
        roleName: profile.role_name,
        isBlocked: Boolean(profile.is_blocked),
        blockedReason: profile.blocked_reason ?? null,
        blockedAt: profile.blocked_at ?? null,
        fullName: profile.full_name,
        registeredAt: profile.created_at,
        lastActiveAt: profile.last_active_at,
        materialsCount: studentMaterials.length,
        completedMaterialsCount: completedMaterials.length,
        plannerTotalTasks: studentPlanItems.length,
        plannerCompletedTasks: completedPlanItems.length,
        plannerProgressPercent,
        focusSessionsCompleted: studentFocus.length,
        totalFocusMinutes: Math.round(totalFocusSeconds / 60),
        revisionTotalItems: studentRevisions.length,
        revisionDueItems: dueRevisions.length,
        revisionWeakTopicsCount: weakRevisions.length,
        totalReviewsCompleted: studentReviewHistory.length,
      };
    });
  }

  const { client } = getServerSupabaseClient();

  const [
    { data: profiles, error: pErr },
    { data: materials, error: mErr },
    { data: planItems, error: piErr },
    { data: focusSessions, error: fErr },
    { data: revisionItems, error: rErr },
    { data: revisionHistory, error: rhErr },
  ] = await Promise.all([
    client
      .from("profiles")
      .select(
        "id, student_id, google_email, role_name, is_blocked, blocked_reason, blocked_at, full_name, created_at, last_active_at"
      )
      .order("created_at", { ascending: false }),
    client.from("study_materials").select("id, student_profile_id, processing_status"),
    client.from("study_plan_items").select("id, student_profile_id, status"),
    client
      .from("focus_sessions")
      .select("id, student_profile_id, session_mode, actual_duration_seconds, completed"),
    client
      .from("revision_items")
      .select("id, student_profile_id, next_review_at, is_weak_topic"),
    client.from("revision_review_history").select("id, student_profile_id"),
  ]);

  if (pErr) throw new Error(`Admin overview failed loading profiles: ${pErr.message}`);
  if (mErr) throw new Error(`Admin overview failed loading materials: ${mErr.message}`);
  if (piErr) throw new Error(`Admin overview failed loading planner items: ${piErr.message}`);
  if (fErr) throw new Error(`Admin overview failed loading focus sessions: ${fErr.message}`);
  if (rErr) throw new Error(`Admin overview failed loading revision items: ${rErr.message}`);
  if (rhErr) throw new Error(`Admin overview failed loading revision history: ${rhErr.message}`);

  return (profiles ?? []).map((profile) => {
    const pid = profile.id as string;
    const studentMaterials = (materials ?? []).filter((m) => m.student_profile_id === pid);
    const completedMaterials = studentMaterials.filter((m) => m.processing_status === "completed");

    const studentPlanItems = (planItems ?? []).filter((pi) => pi.student_profile_id === pid);
    const completedPlanItems = studentPlanItems.filter((pi) => pi.status === "completed");
    const plannerProgressPercent =
      studentPlanItems.length > 0
        ? Math.round((completedPlanItems.length / studentPlanItems.length) * 100)
        : 0;

    const studentFocus = (focusSessions ?? []).filter(
      (f) => f.student_profile_id === pid && f.session_mode === "focus" && f.completed
    );
    const totalFocusSeconds = studentFocus.reduce(
      (acc, f) => acc + Number(f.actual_duration_seconds ?? 0),
      0
    );

    const studentRevisions = (revisionItems ?? []).filter((r) => r.student_profile_id === pid);
    const dueRevisions = studentRevisions.filter(
      (r) => new Date(String(r.next_review_at)).getTime() <= nowMs
    );
    const weakRevisions = studentRevisions.filter((r) => Boolean(r.is_weak_topic));
    const studentReviewHistory = (revisionHistory ?? []).filter(
      (rh) => rh.student_profile_id === pid
    );

    const roleName: UserRole =
      profile.role_name === "superadmin"
        ? "superadmin"
        : profile.role_name === "admin"
          ? "admin"
          : "student";

    return {
      profileId: pid,
      studentId: String(profile.student_id),
      googleEmail: profile.google_email ? String(profile.google_email) : null,
      roleName,
      isBlocked: Boolean(profile.is_blocked),
      blockedReason: profile.blocked_reason ? String(profile.blocked_reason) : null,
      blockedAt: profile.blocked_at ? String(profile.blocked_at) : null,
      fullName: String(profile.full_name),
      registeredAt: String(profile.created_at),
      lastActiveAt: String(profile.last_active_at),
      materialsCount: studentMaterials.length,
      completedMaterialsCount: completedMaterials.length,
      plannerTotalTasks: studentPlanItems.length,
      plannerCompletedTasks: completedPlanItems.length,
      plannerProgressPercent,
      focusSessionsCompleted: studentFocus.length,
      totalFocusMinutes: Math.round(totalFocusSeconds / 60),
      revisionTotalItems: studentRevisions.length,
      revisionDueItems: dueRevisions.length,
      revisionWeakTopicsCount: weakRevisions.length,
      totalReviewsCompleted: studentReviewHistory.length,
    };
  });
}

// ==============================================================================
// 8. SUPERADMIN EXCLUSIVE USER ROLE & BLOCK MANAGEMENT REPOSITORY
// ==============================================================================

export async function updateUserRoleBySuperAdmin(params: {
  targetProfileId: string;
  newRole: "student" | "admin";
}): Promise<StudentProfileRecord> {
  const now = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const target = db.profiles.find((p) => p.id === params.targetProfileId);
    if (!target) {
      throw new Error("Target user profile not found.");
    }
    if (target.role_name === "superadmin" || isSuperAdminEmail(target.google_email)) {
      throw new AuthError("Forbidden: Cannot modify the SuperAdmin account role.", 403);
    }
    target.role_name = params.newRole;
    target.updated_at = now;
    await persistToCloudBlobs(db);
    return target;
  }

  const existing = await findProfileById(params.targetProfileId);
  if (!existing) {
    throw new Error("Target user profile not found.");
  }
  if (existing.role_name === "superadmin" || isSuperAdminEmail(existing.google_email)) {
    throw new AuthError("Forbidden: Cannot modify the SuperAdmin account role.", 403);
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("profiles")
    .update({ role_name: params.newRole })
    .eq("id", params.targetProfileId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to update user role: ${error?.message ?? "Unknown error"}`);
  }
  return data as StudentProfileRecord;
}

export async function setUserBlockedStatusBySuperAdmin(params: {
  targetProfileId: string;
  isBlocked: boolean;
  reason?: string | null;
}): Promise<StudentProfileRecord> {
  const now = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    const target = db.profiles.find((p) => p.id === params.targetProfileId);
    if (!target) {
      throw new Error("Target user profile not found.");
    }
    if (target.role_name === "superadmin" || isSuperAdminEmail(target.google_email)) {
      throw new AuthError("Forbidden: SuperAdmin account can never be blocked.", 403);
    }
    target.is_blocked = params.isBlocked;
    target.blocked_reason = params.isBlocked
      ? params.reason?.trim() || "Account access restricted by SuperAdmin."
      : null;
    target.blocked_at = params.isBlocked ? now : null;
    target.updated_at = now;
    await persistToCloudBlobs(db);
    return target;
  }

  const existing = await findProfileById(params.targetProfileId);
  if (!existing) {
    throw new Error("Target user profile not found.");
  }
  if (existing.role_name === "superadmin" || isSuperAdminEmail(existing.google_email)) {
    throw new AuthError("Forbidden: SuperAdmin account can never be blocked.", 403);
  }

  const { client } = getServerSupabaseClient();
  const { data, error } = await client
    .from("profiles")
    .update({
      is_blocked: params.isBlocked,
      blocked_reason: params.isBlocked
        ? params.reason?.trim() || "Account access restricted by SuperAdmin."
        : null,
      blocked_at: params.isBlocked ? now : null,
    })
    .eq("id", params.targetProfileId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to update block status: ${error?.message ?? "Unknown error"}`);
  }
  return data as StudentProfileRecord;
}

export async function recordEmailNotification(
  params: Omit<EmailNotificationRecord, "id" | "created_at">
): Promise<EmailNotificationRecord> {
  const now = new Date().toISOString();
  const record: EmailNotificationRecord = {
    id: randomUUID(),
    ...params,
    created_at: now,
  };

  if (!isSupabaseConfigured()) {
    const db = await hydrateFromCloudBlobs();
    db.email_notifications.unshift(record);
    await persistToCloudBlobs(db);
    return record;
  }

  // Even when Supabase is active, store in local audit log so it never fails if optional table is absent
  try {
    const db = await hydrateFromCloudBlobs();
    db.email_notifications.unshift(record);
    await persistToCloudBlobs(db);
  } catch {
    // Ignore local write fallback errors
  }
  return record;
}

export async function listEmailNotifications(limit = 30): Promise<EmailNotificationRecord[]> {
  const db = await hydrateFromCloudBlobs();
  return db.email_notifications.slice(0, limit);
}
