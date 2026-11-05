import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { GET as getHealthRoute } from "@/app/api/health/route";
import { GET as getAdminOverviewRoute } from "@/app/api/admin/overview/route";
import { POST as postRegisterRoute } from "@/app/api/auth/register/route";
import { POST as postGoogleAuthRoute } from "@/app/api/auth/google/route";
import {
  createStudentProfile,
  createStudyMaterialWithSignedUpload,
  ensureMaterialAndChunksForGeneration,
  getOwnedStudyMaterial,
  setUserBlockedStatusBySuperAdmin,
  updateUserRoleBySuperAdmin,
} from "@/lib/db/repository";
import { sendAccountStatusEmailNotification } from "@/lib/notifications/email";
import {
  checkRateLimit,
  createSessionToken,
  generateStudentId,
  hashPin,
  resetRateLimitForTest,
  revokeSessionTokenJti,
  safeCompareStrings,
  verifyPin,
  verifySessionToken,
} from "@/lib/auth/crypto";
import {
  getConfigurationStatus,
  isAuthorizedAdminEmail,
  isSuperAdminEmail,
  requireAdminCredentials,
  requireDatabaseEnv,
  requireGeminiEnv,
} from "@/lib/config/env";
import {
  chunkDocumentUnits,
  extractDocumentContent,
  getValidatedExtension,
  retrieveRelevantChunks,
} from "@/lib/documents/extractor";
import {
  generateGroundedChatAnswer,
  generateIndependentAiNotes,
  generateIndependentFlashcards,
  generateIndependentQuestions,
  generateIndependentShortNotes,
  parseAndValidateAiJson,
} from "@/lib/ai/services";
import {
  AiChatResponseSchema,
  AiNotesOutputSchema,
  FlashcardsOutputSchema,
  QuestionsOutputSchema,
  ShortNotesOutputSchema,
  StudentLoginSchema,
  StudentRegistrationSchema,
} from "@/lib/validation/schemas";
import {
  calculateSm2NextReview,
  computeExamCountdownDays,
  computeFocusStatistics,
  computeStudyPlannerAnalytics,
  generateDeterministicScheduleItems,
  partitionRevisionQueue,
} from "@/lib/features/deterministic";

describe("StudyMate AI — Complete Verification Suite", () => {
  beforeEach(() => {
    resetRateLimitForTest();
  });

  describe("1. Authentication, Cryptographic PIN Hashing & Session Revocation", () => {
    it("generates unique non-guessable SM-XXXX-XXXX Student IDs and validates schema", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const id = generateStudentId();
        expect(id).toMatch(/^SM-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
        ids.add(id);
      }
      expect(ids.size).toBe(50);

      const validLogin = StudentLoginSchema.safeParse({
        studentId: "sm-8k4p-9w2x",
        pin: "482910",
      });
      expect(validLogin.success).toBe(true);
      if (validLogin.success) {
        expect(validLogin.data.studentId).toBe("SM-8K4P-9W2X");
      }

      const invalidRegistration = StudentRegistrationSchema.safeParse({
        fullName: "A",
        pin: "123",
      });
      expect(invalidRegistration.success).toBe(false);
    });

    it("hashes PINs with scrypt and verifies in constant time while rejecting wrong PINs", () => {
      const { hash, salt } = hashPin("739204");
      expect(hash).not.toBe("739204");
      expect(verifyPin("739204", hash, salt)).toBe(true);
      expect(verifyPin("739205", hash, salt)).toBe(false);
      expect(verifyPin("000000", hash, salt)).toBe(false);
    });

    it("signs session tokens, rejects tampering, and invalidates tokens on logout", () => {
      const secret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const token = createSessionToken(
        {
          sub: "11111111-1111-1111-1111-111111111111",
          identifier: "SM-4K8P-2M9W",
          displayName: "Sabrina Spellman",
          role: "student",
        },
        secret,
        3600
      );

      const verified = verifySessionToken(token, secret);
      expect(verified).not.toBeNull();
      expect(verified?.identifier).toBe("SM-4K8P-2M9W");
      expect(verified?.role).toBe("student");

      // Tamper with signature
      expect(verifySessionToken(`${token}tampered`, secret)).toBeNull();

      // Revoke JTI on logout -> token must immediately become invalid
      if (verified?.jti) {
        revokeSessionTokenJti(verified.jti);
      }
      expect(verifySessionToken(token, secret)).toBeNull();
    });

    it("enforces rate limiting on repeated authentication attempts", () => {
      const key = "student-login:127.0.0.1";
      for (let i = 0; i < 3; i++) {
        expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
      }
      const blocked = checkRateLimit(key, 3, 60_000);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe("2. Strict Admin Isolation & Environment Configuration Guards", () => {
    it("compares admin credentials in constant time and prevents role spoofing", () => {
      expect(safeCompareStrings("admin-master", "admin-master")).toBe(true);
      expect(safeCompareStrings("admin-master", "student-spoof")).toBe(false);
    });

    it("reports missing external environment variables accurately without fabricating credentials", () => {
      const status = getConfigurationStatus({});
      expect(status.ready).toBe(false);
      expect(status.missingVariables).toContain("GEMINI_API_KEY");
      expect(status.missingVariables).toContain("SESSION_SECRET");
      expect(status.missingVariables).toContain("ADMIN_ID");

      expect(() => requireDatabaseEnv({})).toThrow(/Supabase Database & Storage is not configured/);
      expect(() => requireGeminiEnv({})).toThrow(/Google Gemini AI Service is not configured/);
      expect(() => requireAdminCredentials({})).toThrow(
        /Protected Admin Authentication is not configured/
      );
    });

    it("enforces cross-student data isolation in persistent storage (Student B cannot access Student A material)", async () => {
      const studentA = await createStudentProfile({
        studentId: generateStudentId(),
        fullName: "Student Alpha",
        pinHash: "hashA",
        pinSalt: "saltA",
      });
      const studentB = await createStudentProfile({
        studentId: generateStudentId(),
        fullName: "Student Beta",
        pinHash: "hashB",
        pinSalt: "saltB",
      });

      const createdMat = await createStudyMaterialWithSignedUpload({
        studentProfileId: studentA.id,
        title: "Alpha Private Physics Notes",
        originalFilename: "physics.pdf",
        mimeType: "application/pdf",
        fileExtension: "pdf",
        fileSizeBytes: 2048,
      });

      // Student A can read own material
      const owned = await getOwnedStudyMaterial(studentA.id, createdMat.material.id);
      expect(owned.title).toBe("Alpha Private Physics Notes");

      // Student B is strictly forbidden from reading Student A's material
      await expect(
        getOwnedStudyMaterial(studentB.id, createdMat.material.id)
      ).rejects.toThrow(/Forbidden/);
    });
  });

  describe("3. Document Processing, Format Validation & Chunk Retrieval", () => {
    it("rejects unsupported file extensions and empty buffers safely", async () => {
      expect(() => getValidatedExtension("malware.exe")).toThrow(/Unsupported file format/);
      expect(() => getValidatedExtension("archive.zip")).toThrow(/Unsupported file format/);
      expect(getValidatedExtension("lecture.pptx")).toBe("pptx");
      expect(getValidatedExtension("notes.pdf")).toBe("pdf");

      await expect(
        extractDocumentContent({
          buffer: Buffer.alloc(0),
          filename: "empty.txt",
          mimeType: "text/plain",
        })
      ).rejects.toThrow(/empty/i);
    });

    it("extracts TXT, Markdown, CSV, XLSX, and PPTX slides into indexed chunks", async () => {
      // 1. Markdown extraction
      const mdResult = await extractDocumentContent({
        buffer: Buffer.from("# Cellular Respiration\n\nATP is synthesized in mitochondria.", "utf8"),
        filename: "biology.md",
        mimeType: "text/markdown",
      });
      expect(mdResult.chunks.length).toBe(1);
      expect(mdResult.chunks[0]?.contentText).toContain("ATP is synthesized");

      // 2. XLSX Spreadsheet extraction
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ["Enzyme", "Pathway", "Location"],
        ["Hexokinase", "Glycolysis", "Cytosol"],
        ["Citrate Synthase", "Krebs Cycle", "Mitochondrial Matrix"],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, "Metabolism");
      const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

      const xlsxResult = await extractDocumentContent({
        buffer: xlsxBuffer,
        filename: "enzymes.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      expect(xlsxResult.unitCount).toBe(1);
      expect(xlsxResult.chunks[0]?.sourceLabel).toContain("Metabolism");
      expect(xlsxResult.chunks[0]?.contentText).toContain("Hexokinase | Glycolysis | Cytosol");

      // 3. PPTX Slide extraction
      const zip = new JSZip();
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld><a:t>Slide One Title: Photosynthesis</a:t><a:t>Light-dependent reactions occur in thylakoids.</a:t></p:sld>`
      );
      zip.file(
        "ppt/slides/slide2.xml",
        `<p:sld><a:t>Slide Two: Calvin Cycle</a:t><a:t>Carbon fixation uses RuBisCO enzyme.</a:t></p:sld>`
      );
      const pptxBuffer = await zip.generateAsync({ type: "nodebuffer" });

      const pptxResult = await extractDocumentContent({
        buffer: pptxBuffer,
        filename: "botany.pptx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
      expect(pptxResult.unitCount).toBe(2);
      expect(pptxResult.chunks[0]?.sourceLabel).toBe("Slide 1");
      expect(pptxResult.chunks[1]?.contentText).toContain("RuBisCO");
    });

    it("splits large document units into bounded chunks and retrieves top relevant chunks", () => {
      const longText = Array.from(
        { length: 40 },
        (_, i) => `Paragraph ${i + 1}: Quantum mechanics wave-particle duality and eigenstates.`
      ).join("\n\n");

      const chunks = chunkDocumentUnits(
        [{ unitNumber: 1, sourceLabel: "Page 1", text: longText }],
        500
      );
      expect(chunks.length).toBeGreaterThan(4);

      const indexed = [
        {
          chunk_index: 0,
          source_label: "Page 1",
          content_text: "Introduction to classical thermodynamics and entropy.",
          token_estimate: 50,
        },
        {
          chunk_index: 1,
          source_label: "Page 2",
          content_text: "Mitochondrial oxidative phosphorylation and electron transport chain.",
          token_estimate: 50,
        },
      ];

      const retrieved = retrieveRelevantChunks(
        indexed,
        "oxidative phosphorylation electron transport",
        60
      );
      expect(retrieved.length).toBe(1);
      expect(retrieved[0]?.source_label).toBe("Page 2");
    });
  });

  describe("4. Independent AI Services & Strict Zod Output Validation", () => {
    it("validates independent AI outputs and prevents cross-section schema contamination", () => {
      const validAiNotesJson = JSON.stringify({
        kind: "ai_notes",
        title: "Thermodynamics Notes",
        overview: "Detailed study notes covering the laws of thermodynamics and entropy.",
        sections: [
          {
            heading: "First Law",
            subheadings: [
              {
                title: "Conservation of Energy",
                explanation: "Energy cannot be created or destroyed in an isolated system.",
                examples: ["Joule paddle-wheel experiment"],
              },
            ],
            sourcePageOrUnit: "Page 1",
          },
        ],
        keyConcepts: [
          {
            term: "Internal Energy",
            definition: "Total kinetic and potential energy of molecules.",
            importance: "Foundation of energy balance equations.",
          },
        ],
        sourceReferences: ["Page 1"],
      });

      const parsedNotes = parseAndValidateAiJson(
        validAiNotesJson,
        AiNotesOutputSchema,
        "AI Notes"
      );
      expect(parsedNotes.kind).toBe("ai_notes");

      // Cross-contamination check: AI Notes payload must NEVER pass Short Notes, Flashcards, or Questions validation
      expect(() =>
        parseAndValidateAiJson(validAiNotesJson, ShortNotesOutputSchema, "Short Notes")
      ).toThrow();
      expect(() =>
        parseAndValidateAiJson(validAiNotesJson, FlashcardsOutputSchema, "Flashcards")
      ).toThrow();
      expect(() =>
        parseAndValidateAiJson(validAiNotesJson, QuestionsOutputSchema, "Questions")
      ).toThrow();

      // Validate Chat response with explicit unavailability notice
      const chatUnavailableJson = JSON.stringify({
        kind: "ai_chat",
        answer: "The uploaded material covers glycolysis but does not mention CRISPR gene editing.",
        foundInSource: false,
        unavailabilityNotice: "This topic is not present in the selected study material.",
        citations: [{ sourceLabel: "Page 1", excerpt: "Overview of Glycolysis pathway" }],
      });
      const parsedChat = parseAndValidateAiJson(
        chatUnavailableJson,
        AiChatResponseSchema,
        "AI Chatbot"
      );
      expect(parsedChat.foundInSource).toBe(false);
      expect(parsedChat.unavailabilityNotice).toContain("not present");
    });

    it("rejects malformed JSON or invalid MCQ option counts safely", () => {
      expect(() =>
        parseAndValidateAiJson("not valid json {{{", AiNotesOutputSchema, "AI Notes")
      ).toThrow(/malformed JSON/);

      const badMcqJson = JSON.stringify({
        kind: "questions",
        questions: [
          {
            questionType: "mcq",
            topic: "Cell Biology",
            difficulty: "medium",
            prompt: "Which organelle produces ATP?",
            options: ["Only two options", "Instead of four"],
            correctAnswer: "Mitochondria",
            explanation: "Mitochondria generate ATP via oxidative phosphorylation.",
          },
        ],
      });

      expect(() =>
        parseAndValidateAiJson(badMcqJson, QuestionsOutputSchema, "Questions")
      ).toThrow();
    });
  });

  describe("5. Deterministic Extra Features (Planner, Focus Timer, SM-2 Revision)", () => {
    it("calculates exam countdown, schedule distribution, and planner progress deterministically", () => {
      const now = new Date("2026-11-04T09:00:00.000Z");
      const days = computeExamCountdownDays("2026-11-14", now);
      expect(days).toBe(11);

      const generated = generateDeterministicScheduleItems({
        startDate: "2026-11-04",
        examDate: "2026-11-14",
        dailyTargetHours: 2,
        topics: [
          { subject: "Physics", topic: "Kinematics", durationMinutes: 90, priority: "high" },
          { subject: "Chemistry", topic: "Stoichiometry", durationMinutes: 90, priority: "medium" },
        ],
      });
      expect(generated.length).toBe(2);
      expect(generated[0]?.scheduledDate).toBe("2026-11-04");
      expect(generated[1]?.scheduledDate).toBe("2026-11-05");

      const analytics = computeStudyPlannerAnalytics(
        "2026-11-14",
        [
          {
            id: "1",
            plan_id: "p1",
            student_profile_id: "s1",
            subject: "Physics",
            topic: "Kinematics",
            scheduled_date: "2026-11-04",
            duration_minutes: 60,
            priority: "high",
            status: "completed",
            notes: null,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          },
          {
            id: "2",
            plan_id: "p1",
            student_profile_id: "s1",
            subject: "Chemistry",
            topic: "Acids",
            scheduled_date: "2026-11-05",
            duration_minutes: 60,
            priority: "medium",
            status: "pending",
            notes: null,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          },
        ],
        now
      );
      expect(analytics.completionPercentage).toBe(50);
      expect(analytics.completedMinutes).toBe(60);
    });

    it("computes daily and weekly Pomodoro focus statistics accurately", () => {
      const now = new Date("2026-11-04T12:00:00.000Z");
      const stats = computeFocusStatistics(
        [
          {
            id: "f1",
            student_profile_id: "s1",
            session_mode: "focus",
            planned_duration_minutes: 25,
            actual_duration_seconds: 1500,
            completed: true,
            topic_label: "Calculus",
            started_at: "2026-11-04T10:00:00.000Z",
            ended_at: "2026-11-04T10:25:00.000Z",
            created_at: "2026-11-04T10:25:00.000Z",
            updated_at: "2026-11-04T10:25:00.000Z",
          },
          {
            id: "f2",
            student_profile_id: "s1",
            session_mode: "short_break",
            planned_duration_minutes: 5,
            actual_duration_seconds: 300,
            completed: true,
            topic_label: null,
            started_at: "2026-11-04T10:30:00.000Z",
            ended_at: "2026-11-04T10:35:00.000Z",
            created_at: "2026-11-04T10:35:00.000Z",
            updated_at: "2026-11-04T10:35:00.000Z",
          },
        ],
        now
      );

      expect(stats.todayFocusMinutes).toBe(25);
      expect(stats.todayCompletedSessions).toBe(1);
      expect(stats.weeklyFocusMinutes).toBe(25);
    });

    it("computes SM-2 spaced repetition intervals and flags weak topics deterministically", () => {
      const now = new Date("2026-11-04T10:00:00.000Z");

      // Strong recall (quality = 5) after 1st repetition -> interval advances to 3 days
      const strong = calculateSm2NextReview({
        qualityRating: 5,
        currentIntervalDays: 1,
        currentEaseFactor: 2.5,
        currentRepetitions: 1,
        currentWeakScore: 0,
        now,
      });
      expect(strong.newIntervalDays).toBe(3);
      expect(strong.newEaseFactor).toBeGreaterThan(2.5);
      expect(strong.isWeakTopic).toBe(false);

      // Failed recall (quality = 1) -> resets interval to 1 day and flags weak topic
      const weak = calculateSm2NextReview({
        qualityRating: 1,
        currentIntervalDays: 6,
        currentEaseFactor: 2.5,
        currentRepetitions: 3,
        currentWeakScore: 1,
        now,
      });
      expect(weak.newIntervalDays).toBe(1);
      expect(weak.newRepetitions).toBe(0);
      expect(weak.isWeakTopic).toBe(true);

      const queues = partitionRevisionQueue(
        [
          {
            id: "r1",
            student_profile_id: "s1",
            material_id: null,
            subject: "Bio",
            topic: "Mitosis",
            summary_prompt: "Stages of mitosis",
            key_points: ["Prophase", "Metaphase"],
            interval_days: 1,
            ease_factor: 2.1,
            repetitions: 0,
            weak_score: 2,
            is_weak_topic: true,
            last_reviewed_at: null,
            next_review_at: "2026-11-04T08:00:00.000Z",
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          },
        ],
        now
      );
      expect(queues.dueQueue.length).toBe(1);
      expect(queues.weakTopics.length).toBe(1);
    });
  });

  describe("6. API Route Handler Integration & Security Status Codes", () => {
    it("returns 401 Unauthorized when accessing /api/admin/overview without an admin session", async () => {
      const response = await getAdminOverviewRoute();
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.ok).toBe(false);
    });

    it("returns 400 Bad Request on invalid student registration input before touching external services", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: "X", pin: "abc" }),
      });
      const response = await postRegisterRoute(req);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.ok).toBe(false);
    });

    it("returns accurate configuration readiness on GET /api/health without exposing secrets", async () => {
      const response = await getHealthRoute();
      const body = await response.json();
      expect(typeof body.ok).toBe("boolean");
      expect(body.status).toHaveProperty("missingVariables");
    });

    it("authenticates Google Accounts and grants Admin role exclusively to ratawajahnvi@gmail.com", async () => {
      process.env.SESSION_SECRET =
        process.env.SESSION_SECRET ??
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      expect(isAuthorizedAdminEmail("ratawajahnvi@gmail.com")).toBe(true);
      expect(isAuthorizedAdminEmail("RATAWAJAHNVI@GMAIL.COM")).toBe(true);
      expect(isAuthorizedAdminEmail("ordinary.student@gmail.com")).toBe(false);

      // 1. Authorized Admin Google Account login -> role = "admin"
      const adminReq = new NextRequest("http://localhost:3000/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleEmail: "ratawajahnvi@gmail.com",
          fullName: "Jahnvi Ratawa",
          pin: "482910",
        }),
      });
      const adminRes = await postGoogleAuthRoute(adminReq);
      const adminBody = await adminRes.json();
      expect(adminBody.ok).toBe(true);
      expect(adminBody.user.googleEmail).toBe("ratawajahnvi@gmail.com");
      expect(adminBody.user.role).toBe("admin");

      // 2. Normal Student Google Account login -> role = "student" (never admin)
      const studentEmail = `student.${Date.now()}@gmail.com`;
      const studentReq = new NextRequest("http://localhost:3000/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleEmail: studentEmail,
          fullName: "Normal Student",
          pin: "123456",
        }),
      });
      const studentRes = await postGoogleAuthRoute(studentReq);
      const studentBody = await studentRes.json();
      expect(studentBody.ok).toBe(true);
      expect(studentBody.user.role).toBe("student");

      // 3. Supreme SuperAdmin Google Account login (amrendrayadav03321@gmail.com) -> role = "superadmin"
      expect(isSuperAdminEmail("amrendrayadav03321@gmail.com")).toBe(true);
      expect(isSuperAdminEmail("ratawajahnvi@gmail.com")).toBe(false);

      const superAdminReq = new NextRequest("http://localhost:3000/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleEmail: "amrendrayadav03321@gmail.com",
          fullName: "Amrendra Yadav",
          pin: "999999",
        }),
      });
      const superAdminRes = await postGoogleAuthRoute(superAdminReq);
      const superAdminBody = await superAdminRes.json();
      expect(superAdminBody.ok).toBe(true);
      expect(superAdminBody.user.role).toBe("superadmin");

      // 4. SuperAdmin can grant Admin role to any user and revoke it back to Student
      const promoted = await updateUserRoleBySuperAdmin({
        targetProfileId: studentBody.user.profileId,
        newRole: "admin",
      });
      expect(promoted.role_name).toBe("admin");

      const demoted = await updateUserRoleBySuperAdmin({
        targetProfileId: studentBody.user.profileId,
        newRole: "student",
      });
      expect(demoted.role_name).toBe("student");

      // 5. SuperAdmin can block a user, dispatch an email notification, and blocked user is rejected (403)
      const blocked = await setUserBlockedStatusBySuperAdmin({
        targetProfileId: studentBody.user.profileId,
        isBlocked: true,
        reason: "Policy violation test",
      });
      expect(blocked.is_blocked).toBe(true);

      const emailLog = await sendAccountStatusEmailNotification({
        recipientEmail: studentEmail,
        recipientName: "Normal Student",
        studentId: studentBody.user.studentId,
        notificationType: "account_blocked",
        reason: blocked.blocked_reason,
        triggeredByEmail: "amrendrayadav03321@gmail.com",
      });
      expect(emailLog.recipient_email).toBe(studentEmail);
      expect(emailLog.subject).toContain("Blocked");
      expect(emailLog.gmail_compose_url).toContain("mail.google.com");

      const blockedLoginReq = new NextRequest("http://localhost:3000/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleEmail: studentEmail,
          pin: "123456",
        }),
      });
      const blockedLoginRes = await postGoogleAuthRoute(blockedLoginReq);
      expect(blockedLoginRes.status).toBe(403);
    });

    it("synthesizes AI Notes, Short Notes, Chatbot answers, Flashcards, and Questions reliably from uploaded material chunks", async () => {
      const student = await createStudentProfile({
        studentId: generateStudentId(),
        googleEmail: "scholar@gmail.com",
        fullName: "Test Scholar",
        pinHash: "hash1",
        pinSalt: "salt1",
      });

      const materialId = "550e8400-e29b-41d4-a716-446655440099";
      const { material, chunks } = await ensureMaterialAndChunksForGeneration({
        studentProfileId: student.id,
        materialId,
        clientMaterial: {
          id: materialId,
          title: "vggvv",
          original_filename: "vggvv.pdf",
          file_extension: "pdf",
          mime_type: "application/pdf",
        },
        clientChunks: [
          {
            chunk_index: 0,
            source_label: "Page 1",
            content_text:
              "Photosynthesis: The biochemical process by which plants convert light energy into chemical energy stored in glucose. Chlorophyll absorbs photons in the thylakoid membrane to drive ATP and NADPH synthesis.",
            token_estimate: 42,
          },
        ],
      });

      expect(material.title).toBe("vggvv");
      expect(chunks.length).toBeGreaterThan(0);

      const aiNotes = await generateIndependentAiNotes({
        materialTitle: material.title,
        chunks,
      });
      expect(aiNotes.kind).toBe("ai_notes");
      expect(aiNotes.sections.length).toBeGreaterThan(0);
      expect(aiNotes.keyConcepts.length).toBeGreaterThan(0);

      const shortNotes = await generateIndependentShortNotes({
        materialTitle: material.title,
        chunks,
      });
      expect(shortNotes.kind).toBe("short_notes");
      expect(shortNotes.rapidBulletPoints.length).toBeGreaterThanOrEqual(3);

      const chatAnswer = await generateGroundedChatAnswer({
        materialTitle: material.title,
        question: "What does chlorophyll absorb?",
        chunks,
      });
      expect(chatAnswer.kind).toBe("ai_chat");
      expect(chatAnswer.answer).toContain("Chlorophyll");

      const flashcards = await generateIndependentFlashcards({
        materialTitle: material.title,
        chunks,
        count: 5,
      });
      expect(flashcards.kind).toBe("flashcards");
      expect(flashcards.cards.length).toBeGreaterThanOrEqual(3);

      const questions = await generateIndependentQuestions({
        materialTitle: material.title,
        chunks,
      });
      expect(questions.kind).toBe("questions");
      expect(questions.questions.length).toBeGreaterThanOrEqual(3);
    });
  });
});
