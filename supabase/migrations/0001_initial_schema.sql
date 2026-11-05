-- ==============================================================================
-- STUDYMATE AI — COMPLETE POSTGRESQL & ROW LEVEL SECURITY SCHEMA
-- Migration: 0001_initial_schema.sql
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Automatic updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper functions for custom session context inside RLS
CREATE OR REPLACE FUNCTION public.current_student_profile_id()
RETURNS UUID AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_profile_id', true), '')::UUID;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(NULLIF(current_setting('app.current_role', true), ''), 'anonymous');
END;
$$ LANGUAGE plpgsql STABLE;

-- 1. ROLES TABLE
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (name IN ('student', 'admin', 'superadmin')),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.roles (name, description)
VALUES
  ('student', 'Authenticated student with isolated access to own study materials and progress'),
  ('admin', 'System administrator with read-only overview of student progress and activity'),
  ('superadmin', 'Supreme system administrator with exclusive user role & block management powers')
ON CONFLICT (name) DO NOTHING;

-- 2. PROFILES TABLE (Google Account + Student ID + PIN Authentication)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL UNIQUE,
  google_email TEXT UNIQUE,
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2),
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  role_name TEXT NOT NULL DEFAULT 'student' REFERENCES public.roles(name) ON UPDATE CASCADE,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  blocked_reason TEXT,
  blocked_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profiles_role_check CHECK (role_name IN ('student', 'admin', 'superadmin'))
);

CREATE INDEX IF NOT EXISTS idx_profiles_student_id ON public.profiles(student_id);
CREATE INDEX IF NOT EXISTS idx_profiles_google_email ON public.profiles(google_email);
CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at ON public.profiles(last_active_at DESC);

-- 3. STUDY MATERIALS TABLE
CREATE TABLE IF NOT EXISTS public.study_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_extension TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
  storage_bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'uploading', 'processing', 'completed', 'failed')),
  page_or_unit_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_materials_student ON public.study_materials(student_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_materials_status ON public.study_materials(processing_status);

-- 4. EXTRACTED DOCUMENT CONTENT TABLE (Chunked & Indexed)
CREATE TABLE IF NOT EXISTS public.extracted_document_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.study_materials(id) ON DELETE CASCADE,
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL CHECK (chunk_index >= 0),
  source_label TEXT NOT NULL,
  page_or_slide_number INT,
  content_text TEXT NOT NULL,
  token_estimate INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (material_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_extracted_contents_material ON public.extracted_document_contents(material_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_extracted_contents_student ON public.extracted_document_contents(student_profile_id);

-- 5. PROCESSING JOBS TABLE (Background Job Tracking & Retry Recovery)
CREATE TABLE IF NOT EXISTS public.processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.study_materials(id) ON DELETE CASCADE,
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'retrying')),
  progress_percent INT NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  total_chunks INT NOT NULL DEFAULT 0,
  processed_chunks INT NOT NULL DEFAULT 0,
  attempt_count INT NOT NULL DEFAULT 1,
  max_attempts INT NOT NULL DEFAULT 3,
  error_details TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_material ON public.processing_jobs(material_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_student ON public.processing_jobs(student_profile_id, status);

-- 6. AI-GENERATED DETAILED NOTES TABLE (Strictly Independent from Short Notes)
CREATE TABLE IF NOT EXISTS public.ai_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.study_materials(id) ON DELETE CASCADE,
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  overview TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  key_concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_notes_student_material ON public.ai_notes(student_profile_id, material_id, created_at DESC);

-- 7. AI-GENERATED SHORT NOTES TABLE (Strictly Independent from AI Notes)
CREATE TABLE IF NOT EXISTS public.short_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.study_materials(id) ON DELETE CASCADE,
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  ultra_concise_summary TEXT NOT NULL,
  rapid_bullet_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  must_memorize_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  quick_formulas_or_definitions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_short_notes_student_material ON public.short_notes(student_profile_id, material_id, created_at DESC);

-- 8. FLASHCARDS TABLE (Strictly Independent)
CREATE TABLE IF NOT EXISTS public.flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.study_materials(id) ON DELETE CASCADE,
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  front_question TEXT NOT NULL,
  back_answer TEXT NOT NULL,
  hint TEXT,
  source_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_student_material ON public.flashcards(student_profile_id, material_id, created_at DESC);

-- 9. QUESTIONS TABLE (Strictly Independent: MCQ, Short Answer, Descriptive)
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.study_materials(id) ON DELETE CASCADE,
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL CHECK (question_type IN ('mcq', 'short_answer', 'descriptive')),
  topic TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  prompt TEXT NOT NULL,
  options JSONB,
  correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  source_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_student_material ON public.questions(student_profile_id, material_id, question_type);

-- 10. CHAT CONVERSATIONS & MESSAGES TABLES
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  material_id UUID REFERENCES public.study_materials(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_student ON public.chat_conversations(student_profile_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user', 'assistant')),
  message_text TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  found_in_source BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON public.chat_messages(conversation_id, created_at ASC);

-- 11. STUDY PLANS & SCHEDULE ITEMS TABLES (Extra Feature 1: AI Study Planner)
CREATE TABLE IF NOT EXISTS public.study_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  exam_name TEXT NOT NULL,
  exam_date DATE NOT NULL,
  daily_target_hours NUMERIC(4,1) NOT NULL DEFAULT 2.0 CHECK (daily_target_hours > 0 AND daily_target_hours <= 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_plans_student ON public.study_plans(student_profile_id, exam_date ASC);

CREATE TABLE IF NOT EXISTS public.study_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.study_plans(id) ON DELETE CASCADE,
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  duration_minutes INT NOT NULL CHECK (duration_minutes >= 10 AND duration_minutes <= 480),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rescheduled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_plan_items_student_date ON public.study_plan_items(student_profile_id, scheduled_date ASC);

-- 12. FOCUS SESSIONS TABLE (Extra Feature 2: Focus Mode + Pomodoro Timer)
CREATE TABLE IF NOT EXISTS public.focus_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_mode TEXT NOT NULL CHECK (session_mode IN ('focus', 'short_break', 'long_break')),
  planned_duration_minutes INT NOT NULL CHECK (planned_duration_minutes BETWEEN 1 AND 180),
  actual_duration_seconds INT NOT NULL CHECK (actual_duration_seconds >= 0),
  completed BOOLEAN NOT NULL DEFAULT false,
  topic_label TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_student_started ON public.focus_sessions(student_profile_id, started_at DESC);

-- 13. REVISION ITEMS & REVIEW HISTORY TABLES (Extra Feature 3: Smart Revision System)
CREATE TABLE IF NOT EXISTS public.revision_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  material_id UUID REFERENCES public.study_materials(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  summary_prompt TEXT NOT NULL,
  key_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  interval_days INT NOT NULL DEFAULT 1 CHECK (interval_days >= 1),
  ease_factor NUMERIC(4,2) NOT NULL DEFAULT 2.50 CHECK (ease_factor >= 1.30),
  repetitions INT NOT NULL DEFAULT 0 CHECK (repetitions >= 0),
  weak_score INT NOT NULL DEFAULT 0 CHECK (weak_score >= 0),
  is_weak_topic BOOLEAN NOT NULL DEFAULT false,
  last_reviewed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revision_items_student_due ON public.revision_items(student_profile_id, next_review_at ASC);
CREATE INDEX IF NOT EXISTS idx_revision_items_weak ON public.revision_items(student_profile_id, is_weak_topic);

CREATE TABLE IF NOT EXISTS public.revision_review_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_item_id UUID NOT NULL REFERENCES public.revision_items(id) ON DELETE CASCADE,
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quality_rating INT NOT NULL CHECK (quality_rating BETWEEN 0 AND 5),
  previous_interval_days INT NOT NULL,
  new_interval_days INT NOT NULL,
  previous_ease_factor NUMERIC(4,2) NOT NULL,
  new_ease_factor NUMERIC(4,2) NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revision_history_student ON public.revision_review_history(student_profile_id, reviewed_at DESC);

-- Attach updated_at triggers to all tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'roles', 'profiles', 'study_materials', 'extracted_document_contents',
    'processing_jobs', 'ai_notes', 'short_notes', 'flashcards', 'questions',
    'chat_conversations', 'chat_messages', 'study_plans', 'study_plan_items',
    'focus_sessions', 'revision_items', 'revision_review_history'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Enforces strict student data isolation at the database layer.
-- ==============================================================================

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_document_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revision_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revision_review_history ENABLE ROW LEVEL SECURITY;

-- Roles readable by authenticated users
CREATE POLICY roles_read_policy ON public.roles
  FOR SELECT USING (true);

-- Profiles: student can only access their own profile; admin can read profiles for overview
CREATE POLICY profiles_isolation_policy ON public.profiles
  FOR ALL
  USING (id = public.current_student_profile_id() OR public.current_app_role() = 'admin')
  WITH CHECK (id = public.current_student_profile_id() AND role_name = 'student');

-- Student-owned tables: strict ownership enforcement (student_profile_id = current_student_profile_id())
DO $$
DECLARE
  owned_tbl TEXT;
BEGIN
  FOREACH owned_tbl IN ARRAY ARRAY[
    'study_materials', 'extracted_document_contents', 'processing_jobs',
    'ai_notes', 'short_notes', 'flashcards', 'questions',
    'chat_conversations', 'chat_messages', 'study_plans', 'study_plan_items',
    'focus_sessions', 'revision_items', 'revision_review_history'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_student_isolation ON public.%I;', owned_tbl, owned_tbl);
    EXECUTE format(
      'CREATE POLICY %I_student_isolation ON public.%I FOR ALL USING (student_profile_id = public.current_student_profile_id()) WITH CHECK (student_profile_id = public.current_student_profile_id());',
      owned_tbl, owned_tbl
    );
  END LOOP;
END $$;

-- Admin read-only policies for non-sensitive activity progress tables
CREATE POLICY study_materials_admin_read ON public.study_materials
  FOR SELECT USING (public.current_app_role() = 'admin');
CREATE POLICY study_plans_admin_read ON public.study_plans
  FOR SELECT USING (public.current_app_role() = 'admin');
CREATE POLICY study_plan_items_admin_read ON public.study_plan_items
  FOR SELECT USING (public.current_app_role() = 'admin');
CREATE POLICY focus_sessions_admin_read ON public.focus_sessions
  FOR SELECT USING (public.current_app_role() = 'admin');
CREATE POLICY revision_items_admin_read ON public.revision_items
  FOR SELECT USING (public.current_app_role() = 'admin');
CREATE POLICY revision_history_admin_read ON public.revision_review_history
  FOR SELECT USING (public.current_app_role() = 'admin');
