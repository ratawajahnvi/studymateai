"use client";

import React, { useCallback, useEffect, useState } from "react";
import { HelpCircle, Eye, EyeOff, Sparkles } from "lucide-react";
import {
  HalloweenEmptyState,
  PumpkinSticker,
} from "@/components/halloween/Stickers";
import {
  readClientVault,
  saveMaterialsToVault,
  saveQuestionsToVault,
  syncClientVaultWithServer,
} from "@/lib/client/persistenceVault";
import type { QuestionRecord, StudyMaterialRecord } from "@/lib/db/types";

export default function QuestionsPage() {
  const [materials, setMaterials] = useState<StudyMaterialRecord[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [filterType, setFilterType] = useState<"all" | "mcq" | "short_answer" | "descriptive">(
    "all"
  );
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const localVault = readClientVault();
    if (localVault.study_materials.length > 0) {
      const localCompleted = localVault.study_materials.filter(
        (m) => m.processing_status === "completed"
      );
      setMaterials(localCompleted);
      if (localCompleted[0]) {
        const firstId = localCompleted[0].id;
        setSelectedMaterialId((prev) => prev || firstId);
      }
    }
    if (localVault.questions.length > 0) {
      setQuestions(localVault.questions);
    }

    try {
      await syncClientVaultWithServer();
      const [matRes, qRes] = await Promise.all([
        fetch("/api/materials", { cache: "no-store" }),
        fetch("/api/ai/questions", { cache: "no-store" }),
      ]);
      const matJson = await matRes.json();
      const qJson = await qRes.json();

      if (matJson.ok) {
        const mergedMats = saveMaterialsToVault(matJson.materials ?? [], matJson.jobs ?? []);
        const completed = mergedMats.study_materials.filter(
          (m: StudyMaterialRecord) => m.processing_status === "completed"
        );
        setMaterials(completed);
        if (completed[0]) {
          const firstId = completed[0].id;
          setSelectedMaterialId((prev) => prev || firstId);
        }
      }
      if (qJson.ok) {
        const mergedQs = saveQuestionsToVault(qJson.questions ?? []);
        setQuestions(mergedQs);
      } else if (qJson.error && localVault.questions.length === 0) {
        setError(qJson.error);
      }
    } catch {
      if (localVault.questions.length === 0) {
        setError("Failed to load practice questions.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMaterialId) return;
    setGenerating(true);
    setError(null);
    try {
      await syncClientVaultWithServer();
      const vault = readClientVault();
      const targetMat =
        materials.find((m) => m.id === selectedMaterialId) ??
        vault.study_materials.find((m) => m.id === selectedMaterialId);
      const targetChunks = vault.extracted_document_contents.filter(
        (c) => c.material_id === selectedMaterialId
      );

      const res = await fetch("/api/ai/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: selectedMaterialId,
          material: targetMat,
          chunks: targetChunks,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to generate practice questions.");
      } else {
        const merged = saveQuestionsToVault(data.questions ?? []);
        setQuestions(merged);
      }
    } catch {
      setError("Network error while generating practice questions.");
    } finally {
      setGenerating(false);
    }
  }

  const filteredQuestions =
    filterType === "all"
      ? questions
      : questions.filter((q) => q.question_type === filterType);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
        <div className="flex items-center gap-4">
          <PumpkinSticker className="h-12 w-12 shrink-0" />
          <div>
            <h1 className="text-2xl font-extrabold text-[#fff8ed]">
              Practice Questions & Answer Keys
            </h1>
            <p className="mt-1 text-sm text-[#d8cbe8]">
              Generate independent MCQ, Short-Answer, and Descriptive exam questions with verified
              answer keys and explanations.
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
        <form onSubmit={handleGenerate} className="flex flex-wrap items-end gap-4">
          <div className="min-w-[260px] flex-1">
            <label htmlFor="questions-material" className="block text-sm font-semibold text-[#fff8ed]">
              Select Processed Study Material
            </label>
            <select
              id="questions-material"
              value={selectedMaterialId}
              onChange={(e) => setSelectedMaterialId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-4 py-3 text-sm text-[#fff8ed]"
            >
              <option value="">-- Choose a study material --</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} (.{m.file_extension})
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={generating || !selectedMaterialId}
            className="flex items-center gap-2 rounded-xl bg-[#ff7b29] px-5 py-3 text-sm font-bold text-[#0c0617] hover:bg-[#ff944d] disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>{generating ? "Generating Exam Set..." : "Generate Questions"}</span>
          </button>
        </form>

        {/* Question Type Filter */}
        <div className="mt-5 flex flex-wrap gap-2">
          {(["all", "mcq", "short_answer", "descriptive"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterType(t)}
              aria-pressed={filterType === t}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold uppercase transition ${
                filterType === t
                  ? "bg-[#ff7b29] text-[#0c0617]"
                  : "border border-[#3e236b] bg-[#21113b] text-[#d8cbe8] hover:text-[#fff8ed]"
              }`}
            >
              {t.replace("_", " ")}
            </button>
          ))}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-[#ff6b6b] bg-[#ff6b6b]/15 p-3.5 text-sm text-[#fff8ed]"
          >
            {error}
          </div>
        )}
      </section>

      {loading ? (
        <div className="h-48 animate-pulse rounded-3xl border border-[#3e236b] bg-[#160b28]" />
      ) : filteredQuestions.length === 0 ? (
        <HalloweenEmptyState
          variant="pumpkin"
          title="No Practice Questions Found"
          description="Select an indexed study material above and click 'Generate Questions' to create MCQs, short-answer, and descriptive questions."
        />
      ) : (
        <div className="space-y-5">
          {filteredQuestions.map((q, index) => {
            const revealed = Boolean(revealedKeys[q.id]);
            const chosenOption = selectedOptions[q.id];

            return (
              <article
                key={q.id}
                className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-6 shadow-xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-[#ff7b29]/20 px-2.5 py-1 text-xs font-bold uppercase text-[#ff944d]">
                      {q.question_type.replace("_", " ")}
                    </span>
                    <span className="text-xs font-semibold text-[#c4b5fd]">{q.topic}</span>
                  </div>
                  <span className="text-xs uppercase text-[#d8cbe8]">
                    Difficulty: <strong>{q.difficulty}</strong>
                    {q.source_reference ? ` • ${q.source_reference}` : ""}
                  </span>
                </div>

                <h2 className="mt-3 flex items-start gap-2 text-base font-bold text-[#fff8ed]">
                  <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#ff7b29]" aria-hidden="true" />
                  <span>
                    Q{index + 1}. {q.prompt}
                  </span>
                </h2>

                {q.question_type === "mcq" && Array.isArray(q.options) && (
                  <fieldset className="mt-4 space-y-2">
                    <legend className="visually-hidden">Answer choices for question {index + 1}</legend>
                    {q.options.map((opt, oIdx) => {
                      const isChosen = chosenOption === opt;
                      return (
                        <label
                          key={oIdx}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition ${
                            isChosen
                              ? "border-[#ff7b29] bg-[#ff7b29]/15 text-[#fff8ed]"
                              : "border-[#3e236b] bg-[#21113b] text-[#d8cbe8] hover:border-[#c4b5fd]"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`question-${q.id}`}
                            value={opt}
                            checked={isChosen}
                            onChange={() =>
                              setSelectedOptions((prev) => ({ ...prev, [q.id]: opt }))
                            }
                            className="accent-[#ff7b29]"
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setRevealedKeys((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                    }
                    aria-expanded={revealed}
                    aria-label={`${revealed ? "Hide" : "Reveal"} answer key for question ${index + 1}`}
                    className="flex items-center gap-1.5 rounded-xl border border-[#3e236b] bg-[#21113b] px-4 py-2 text-xs font-bold text-[#fff8ed] hover:border-[#ff7b29]"
                  >
                    {revealed ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5 text-[#c4b5fd]" aria-hidden="true" />
                        <span>Hide Answer Key</span>
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5 text-[#ff7b29]" aria-hidden="true" />
                        <span>Show Answer Key & Explanation</span>
                      </>
                    )}
                  </button>
                </div>

                {revealed && (
                  <div className="mt-4 rounded-2xl border border-[#4ade80]/40 bg-[#0c0617] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#4ade80]">
                      Verified Answer Key
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#fff8ed]">{q.correct_answer}</p>
                    <p className="mt-2 text-xs leading-relaxed text-[#d8cbe8]">
                      <strong className="text-[#c4b5fd]">Explanation:</strong> {q.explanation}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
