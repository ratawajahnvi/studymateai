"use client";

import React, { useCallback, useEffect, useState } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import {
  CuteGhostSticker,
  HalloweenEmptyState,
} from "@/components/halloween/Stickers";
import {
  readClientVault,
  saveAiNotesToVault,
  saveMaterialsToVault,
  syncClientVaultWithServer,
} from "@/lib/client/persistenceVault";
import type { AiNoteRecord, StudyMaterialRecord } from "@/lib/db/types";

export default function AiNotesPage() {
  const [materials, setMaterials] = useState<StudyMaterialRecord[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [notes, setNotes] = useState<AiNoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (matId?: string) => {
    setLoading(true);
    const localVault = readClientVault();
    if (localVault.study_materials.length > 0) {
      const localCompleted = localVault.study_materials.filter(
        (m) => m.processing_status === "completed"
      );
      setMaterials(localCompleted);
      if (!matId && localCompleted[0]) {
        const firstId = localCompleted[0].id;
        setSelectedMaterialId((prev) => prev || firstId);
      }
    }
    if (localVault.ai_notes.length > 0) {
      setNotes(
        matId
          ? localVault.ai_notes.filter((n) => n.material_id === matId)
          : localVault.ai_notes
      );
    }

    try {
      await syncClientVaultWithServer();
      const [matRes, notesRes] = await Promise.all([
        fetch("/api/materials", { cache: "no-store" }),
        fetch(`/api/ai/notes${matId ? `?materialId=${matId}` : ""}`, { cache: "no-store" }),
      ]);
      const matJson = await matRes.json();
      const notesJson = await notesRes.json();

      if (matJson.ok) {
        const mergedMats = saveMaterialsToVault(matJson.materials ?? [], matJson.jobs ?? []);
        const completed = mergedMats.study_materials.filter(
          (m: StudyMaterialRecord) => m.processing_status === "completed"
        );
        setMaterials(completed);
        if (!matId && completed[0]) {
          const firstId = completed[0].id;
          setSelectedMaterialId((prev) => prev || firstId);
        }
      }
      if (notesJson.ok) {
        const mergedNotes = saveAiNotesToVault(notesJson.notes ?? []);
        setNotes(
          matId ? mergedNotes.filter((n) => n.material_id === matId) : mergedNotes
        );
      } else if (notesJson.error && localVault.ai_notes.length === 0) {
        setError(notesJson.error);
      }
    } catch {
      if (localVault.ai_notes.length === 0) {
        setError("Failed to load AI Notes.");
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
    if (!selectedMaterialId) {
      setError("Please select a processed study material first.");
      return;
    }
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

      const res = await fetch("/api/ai/notes", {
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
        setError(data.error ?? "Failed to generate AI Notes.");
      } else {
        const merged = saveAiNotesToVault([data.note]);
        setNotes(merged);
      }
    } catch {
      setError("Network error while generating AI Notes.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
        <div className="flex items-center gap-4">
          <CuteGhostSticker className="h-12 w-12 shrink-0" />
          <div>
            <h1 className="text-2xl font-extrabold text-[#fff8ed]">
              AI Detailed Study Notes
            </h1>
            <p className="mt-1 text-sm text-[#d8cbe8]">
              Generate comprehensive multi-section academic study notes with headings, subheadings,
              key concepts, and source references.
            </p>
          </div>
        </div>
      </header>

      {/* Generation Controls */}
      <section className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
        <form onSubmit={handleGenerate} className="flex flex-wrap items-end gap-4">
          <div className="min-w-[260px] flex-1">
            <label htmlFor="ai-notes-material" className="block text-sm font-semibold text-[#fff8ed]">
              Select Processed Study Material
            </label>
            <select
              id="ai-notes-material"
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
            <span>{generating ? "Synthesizing Detailed Notes..." : "Generate AI Notes"}</span>
          </button>
        </form>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-[#ff6b6b] bg-[#ff6b6b]/15 p-3.5 text-sm text-[#fff8ed]"
          >
            {error}
          </div>
        )}
      </section>

      {/* Rendered Structured AI Notes */}
      {loading ? (
        <div className="h-48 animate-pulse rounded-3xl border border-[#3e236b] bg-[#160b28]" />
      ) : notes.length === 0 ? (
        <HalloweenEmptyState
          variant="ghost"
          title="No Detailed AI Notes Generated Yet"
          description="Select an indexed study material above and click 'Generate AI Notes' to create structured study sections and concept definitions."
        />
      ) : (
        <div className="space-y-6">
          {notes.map((note) => (
            <article
              key={note.id}
              className="space-y-6 rounded-3xl border border-[#3e236b] bg-[#160b28] p-6 shadow-xl"
            >
              <div className="border-b border-[#3e236b] pb-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#ff944d]">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  <span>Comprehensive Study Note</span>
                </div>
                <h2 className="mt-1 text-xl font-extrabold text-[#fff8ed]">{note.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#d8cbe8]">{note.overview}</p>
              </div>

              {/* Sections */}
              <div className="space-y-5">
                {note.sections.map((sec, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-[#3e236b] bg-[#21113b] p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-lg font-bold text-[#fff8ed]">{sec.heading}</h3>
                      {sec.sourcePageOrUnit && (
                        <span className="rounded-md border border-[#ff7b29]/40 bg-[#ff7b29]/15 px-2.5 py-0.5 text-xs font-semibold text-[#ff944d]">
                          Ref: {sec.sourcePageOrUnit}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 space-y-4">
                      {sec.subheadings.map((sub, sIdx) => (
                        <div key={sIdx} className="border-l-2 border-[#c4b5fd] pl-4">
                          <h4 className="font-semibold text-[#c4b5fd]">{sub.title}</h4>
                          <p className="mt-1 text-sm text-[#fff8ed]">{sub.explanation}</p>
                          {sub.examples && sub.examples.length > 0 && (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#d8cbe8]">
                              {sub.examples.map((ex, eIdx) => (
                                <li key={eIdx}>{ex}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Key Concepts */}
              {note.key_concepts.length > 0 && (
                <div>
                  <h3 className="mb-3 text-base font-bold text-[#fff8ed]">Key Concepts Glossary</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {note.key_concepts.map((kc, kIdx) => (
                      <div
                        key={kIdx}
                        className="rounded-xl border border-[#3e236b] bg-[#0c0617] p-4"
                      >
                        <p className="font-bold text-[#ff944d]">{kc.term}</p>
                        <p className="mt-1 text-sm text-[#fff8ed]">{kc.definition}</p>
                        <p className="mt-1.5 text-xs text-[#c4b5fd]">
                          Why it matters: {kc.importance}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Source References */}
              {note.source_references.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-[#3e236b] pt-4 text-xs text-[#c4b5fd]">
                  <span className="font-semibold">Grounded Sources:</span>
                  {note.source_references.map((ref, rIdx) => (
                    <span
                      key={rIdx}
                      className="rounded-md bg-[#21113b] px-2 py-0.5 text-[#fff8ed]"
                    >
                      {ref}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
