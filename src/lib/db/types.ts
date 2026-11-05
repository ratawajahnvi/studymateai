import type {
  AiNoteSectionSchema,
  AiNotesOutput,
  ShortNotesOutput,
} from "../validation/schemas";
import type { z } from "zod";

export type AiNoteSection = z.infer<typeof AiNoteSectionSchema>;

export type UserRole = "student" | "admin" | "superadmin";

export interface StudentProfileRecord {
  id: string;
  student_id: string;
  google_email?: string | null;
  full_name: string;
  pin_hash: string;
  pin_salt: string;
  role_name: UserRole;
  is_blocked?: boolean;
  blocked_reason?: string | null;
  blocked_at?: string | null;
  last_active_at: string;
  created_at: string;
  updated_at: string;
}

export interface StudyMaterialRecord {
  id: string;
  student_profile_id: string;
  title: string;
  original_filename: string;
  mime_type: string;
  file_extension: string;
  file_size_bytes: number;
  storage_bucket: string;
  storage_path: string;
  processing_status: "pending" | "uploading" | "processing" | "completed" | "failed";
  page_or_unit_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExtractedChunkRecord {
  id: string;
  material_id: string;
  student_profile_id: string;
  chunk_index: number;
  source_label: string;
  page_or_slide_number: number | null;
  content_text: string;
  token_estimate: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProcessingJobRecord {
  id: string;
  material_id: string;
  student_profile_id: string;
  status: "queued" | "running" | "completed" | "failed" | "retrying";
  progress_percent: number;
  total_chunks: number;
  processed_chunks: number;
  attempt_count: number;
  max_attempts: number;
  error_details: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiNoteRecord {
  id: string;
  material_id: string;
  student_profile_id: string;
  title: string;
  overview: string;
  sections: AiNotesOutput["sections"];
  key_concepts: AiNotesOutput["keyConcepts"];
  source_references: string[];
  created_at: string;
  updated_at: string;
}

export interface ShortNoteRecord {
  id: string;
  material_id: string;
  student_profile_id: string;
  title: string;
  ultra_concise_summary: string;
  rapid_bullet_points: string[];
  must_memorize_facts: string[];
  quick_formulas_or_definitions: ShortNotesOutput["quickFormulasOrDefinitions"];
  created_at: string;
  updated_at: string;
}

export interface FlashcardRecord {
  id: string;
  material_id: string;
  student_profile_id: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  front_question: string;
  back_answer: string;
  hint: string | null;
  source_reference: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionRecord {
  id: string;
  material_id: string;
  student_profile_id: string;
  question_type: "mcq" | "short_answer" | "descriptive";
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string;
  source_reference: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatConversationRecord {
  id: string;
  student_profile_id: string;
  material_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRecord {
  id: string;
  conversation_id: string;
  student_profile_id: string;
  sender_role: "user" | "assistant";
  message_text: string;
  citations: Array<{ sourceLabel: string; excerpt: string }>;
  found_in_source: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudyPlanRecord {
  id: string;
  student_profile_id: string;
  title: string;
  exam_name: string;
  exam_date: string;
  daily_target_hours: number;
  created_at: string;
  updated_at: string;
}

export interface StudyPlanItemRecord {
  id: string;
  plan_id: string;
  student_profile_id: string;
  subject: string;
  topic: string;
  scheduled_date: string;
  duration_minutes: number;
  priority: "low" | "medium" | "high";
  status: "pending" | "in_progress" | "completed" | "rescheduled";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FocusSessionRecord {
  id: string;
  student_profile_id: string;
  session_mode: "focus" | "short_break" | "long_break";
  planned_duration_minutes: number;
  actual_duration_seconds: number;
  completed: boolean;
  topic_label: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RevisionItemRecord {
  id: string;
  student_profile_id: string;
  material_id: string | null;
  subject: string;
  topic: string;
  summary_prompt: string;
  key_points: string[];
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  weak_score: number;
  is_weak_topic: boolean;
  last_reviewed_at: string | null;
  next_review_at: string;
  created_at: string;
  updated_at: string;
}

export interface RevisionHistoryRecord {
  id: string;
  revision_item_id: string;
  student_profile_id: string;
  quality_rating: number;
  previous_interval_days: number;
  new_interval_days: number;
  previous_ease_factor: number;
  new_ease_factor: number;
  reviewed_at: string;
  created_at: string;
  updated_at: string;
}

export interface AdminStudentOverviewItem {
  profileId: string;
  studentId: string;
  googleEmail: string | null;
  roleName: UserRole;
  isBlocked: boolean;
  blockedReason: string | null;
  blockedAt: string | null;
  fullName: string;
  registeredAt: string;
  lastActiveAt: string;
  materialsCount: number;
  completedMaterialsCount: number;
  plannerTotalTasks: number;
  plannerCompletedTasks: number;
  plannerProgressPercent: number;
  focusSessionsCompleted: number;
  totalFocusMinutes: number;
  revisionTotalItems: number;
  revisionDueItems: number;
  revisionWeakTopicsCount: number;
  totalReviewsCompleted: number;
}

export interface EmailNotificationRecord {
  id: string;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  body_text: string;
  notification_type: "account_blocked" | "account_unblocked" | "role_updated";
  delivery_status: "sent_via_provider" | "queued_for_mailto_and_logged";
  provider_message: string;
  mailto_url: string;
  gmail_compose_url: string;
  triggered_by_email: string;
  created_at: string;
}
