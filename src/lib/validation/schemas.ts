import { z } from "zod";

// ==============================================================================
// 1. AUTHENTICATION VALIDATION SCHEMAS (NO EMAIL / NO PHONE / NO OTP)
// ==============================================================================

export const GoogleEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid Google Account email address")
  .refine(
    (email) =>
      email.endsWith("@gmail.com") ||
      email.endsWith("@googlemail.com") ||
      email.includes("@"),
    "Must be a valid Google Account email"
  );

export const GoogleAccountAuthSchema = z.object({
  googleEmail: GoogleEmailSchema,
  fullName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name cannot exceed 80 characters")
    .optional(),
  pin: z
    .string()
    .trim()
    .regex(/^\d{6,8}$/, "PIN must be 6 to 8 numeric digits"),
  idToken: z.string().min(10).optional(),
});

export const StudentRegistrationSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name cannot exceed 80 characters")
    .regex(/^[\p{L}\p{M}\s.'-]+$/u, "Name contains invalid characters"),
  googleEmail: GoogleEmailSchema.optional(),
  pin: z
    .string()
    .trim()
    .regex(/^\d{6,8}$/, "PIN must be 6 to 8 numeric digits"),
});

export const StudentLoginSchema = z.object({
  studentId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^SM-[A-Z0-9]{4}-[A-Z0-9]{4}$/, "Student ID must match format SM-XXXX-XXXX"),
  pin: z
    .string()
    .trim()
    .regex(/^\d{6,8}$/, "PIN must be 6 to 8 numeric digits"),
});

export const AdminLoginSchema = z.object({
  adminId: z.string().trim().min(4, "Admin ID or Google Email is required").max(120),
  pin: z.string().trim().min(6, "Admin PIN is required").max(64),
});

// ==============================================================================
// 2. DOCUMENT UPLOAD & PROCESSING VALIDATION SCHEMAS
// ==============================================================================

export const SUPPORTED_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "txt",
  "md",
  "csv",
  "jpg",
  "jpeg",
  "png",
  "webp",
] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

// Realistic infrastructure limits documented and enforced:
// Direct Supabase Storage signed upload supports up to 50 MB on standard plans;
// synchronous serverless extraction supports up to 25 MB, while chunked background
// job processing handles larger multi-page documents safely within memory limits.
export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB realistic enforced ceiling

export const CreateMaterialUploadSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(140),
  originalFilename: z.string().trim().min(3).max(255),
  mimeType: z.string().trim().min(3).max(120),
  fileSizeBytes: z
    .number()
    .int()
    .positive("File cannot be empty")
    .max(MAX_UPLOAD_SIZE_BYTES, "File exceeds maximum supported processing limit of 50 MB"),
});

// ==============================================================================
// 3. INDEPENDENT AI OUTPUT VALIDATION SCHEMAS
// Strictly distinct schemas prevent cross-section data contamination.
// ==============================================================================

// A. AI Notes Schema (Detailed structured notes)
export const AiNoteSectionSchema = z.object({
  heading: z.string().min(2),
  subheadings: z.array(
    z.object({
      title: z.string().min(2),
      explanation: z.string().min(10),
      examples: z.array(z.string()).default([]),
    })
  ),
  sourcePageOrUnit: z.string().optional(),
});

export const AiNotesOutputSchema = z.object({
  kind: z.literal("ai_notes"),
  title: z.string().min(3),
  overview: z.string().min(15),
  sections: z.array(AiNoteSectionSchema).min(1),
  keyConcepts: z
    .array(
      z.object({
        term: z.string().min(1),
        definition: z.string().min(5),
        importance: z.string().min(5),
      })
    )
    .min(1),
  sourceReferences: z.array(z.string()).default([]),
});

export type AiNotesOutput = z.infer<typeof AiNotesOutputSchema>;

// B. Short Notes Schema (Concise revision-ready sheet)
export const ShortNotesOutputSchema = z.object({
  kind: z.literal("short_notes"),
  title: z.string().min(3),
  ultraConciseSummary: z.string().min(10).max(600),
  rapidBulletPoints: z.array(z.string().min(5)).min(3),
  mustMemorizeFacts: z.array(z.string().min(5)).min(2),
  quickFormulasOrDefinitions: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.string().min(2),
      })
    )
    .default([]),
});

export type ShortNotesOutput = z.infer<typeof ShortNotesOutputSchema>;

// C. AI Chatbot Output Schema (Context-aware with source citations)
export const AiChatResponseSchema = z.object({
  kind: z.literal("ai_chat"),
  answer: z.string().min(2),
  foundInSource: z.boolean(),
  unavailabilityNotice: z.string().nullable().default(null),
  citations: z
    .array(
      z.object({
        sourceLabel: z.string().min(1),
        excerpt: z.string().min(3),
      })
    )
    .default([]),
});

export type AiChatResponse = z.infer<typeof AiChatResponseSchema>;

export const ChatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  materialId: z.string().uuid("Please select a valid study material"),
  question: z.string().trim().min(2, "Question cannot be empty").max(1500),
});

// D. Flashcards Schema (Interactive flip cards)
export const FlashcardItemSchema = z.object({
  topic: z.string().min(2),
  difficulty: z.enum(["easy", "medium", "hard"]),
  frontQuestion: z.string().min(5),
  backAnswer: z.string().min(5),
  hint: z.string().optional(),
  sourceReference: z.string().optional(),
});

export const FlashcardsOutputSchema = z.object({
  kind: z.literal("flashcards"),
  cards: z.array(FlashcardItemSchema).min(3).max(25),
});

export type FlashcardsOutput = z.infer<typeof FlashcardsOutputSchema>;

// E. Questions Schema (MCQ, Short Answer, Descriptive with Answer Keys)
export const QuestionItemSchema = z
  .object({
    questionType: z.enum(["mcq", "short_answer", "descriptive"]),
    topic: z.string().min(2),
    difficulty: z.enum(["easy", "medium", "hard"]),
    prompt: z.string().min(8),
    options: z.array(z.string().min(1)).length(4).nullable().default(null),
    correctAnswer: z.string().min(1),
    explanation: z.string().min(8),
    sourceReference: z.string().optional(),
  })
  .refine(
    (item) => (item.questionType === "mcq" ? Array.isArray(item.options) && item.options.length === 4 : true),
    { message: "MCQ questions must provide exactly 4 options" }
  );

export const QuestionsOutputSchema = z.object({
  kind: z.literal("questions"),
  questions: z.array(QuestionItemSchema).min(3).max(25),
});

export type QuestionsOutput = z.infer<typeof QuestionsOutputSchema>;

// ==============================================================================
// 4. THREE EXTRA FEATURES VALIDATION SCHEMAS
// ==============================================================================

// Extra 1: AI Study Planner
export const CreateStudyPlanSchema = z.object({
  title: z.string().trim().min(3).max(120),
  examName: z.string().trim().min(2).max(120),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Exam date must be YYYY-MM-DD"),
  dailyTargetHours: z.number().min(0.5).max(16),
  items: z
    .array(
      z.object({
        subject: z.string().trim().min(2).max(80),
        topic: z.string().trim().min(2).max(140),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        durationMinutes: z.number().int().min(10).max(480),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        notes: z.string().max(400).optional(),
      })
    )
    .default([]),
});

export const UpdateStudyPlanItemSchema = z.object({
  itemId: z.string().uuid(),
  status: z.enum(["pending", "in_progress", "completed", "rescheduled"]).optional(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  durationMinutes: z.number().int().min(10).max(480).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  topic: z.string().trim().min(2).max(140).optional(),
});

// Extra 2: Focus Mode + Pomodoro Timer
export const RecordFocusSessionSchema = z.object({
  sessionMode: z.enum(["focus", "short_break", "long_break"]),
  plannedDurationMinutes: z.number().int().min(1).max(180),
  actualDurationSeconds: z.number().int().min(1).max(10800),
  completed: z.boolean(),
  topicLabel: z.string().trim().max(120).optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
});

// Extra 3: Smart Revision System (SM-2 Spaced Repetition)
export const CreateRevisionItemSchema = z.object({
  materialId: z.string().uuid().optional(),
  subject: z.string().trim().min(2).max(80),
  topic: z.string().trim().min(2).max(140),
  summaryPrompt: z.string().trim().min(5).max(1000),
  keyPoints: z.array(z.string().trim().min(2)).min(1).max(10),
});

export const SubmitRevisionReviewSchema = z.object({
  revisionItemId: z.string().uuid(),
  qualityRating: z.number().int().min(0).max(5),
});
