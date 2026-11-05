"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Layers, RotateCw, Sparkles } from "lucide-react";
import {
  CuteSkeletonSticker,
  HalloweenEmptyState,
} from "@/components/halloween/Stickers";
import {
  readClientVault,
  saveFlashcardsToVault,
  saveMaterialsToVault,
  syncClientVaultWithServer,
} from "@/lib/client/persistenceVault";
import type { FlashcardRecord, StudyMaterialRecord } from "@/lib/db/types";

export default function FlashcardsPage() {
  const [materials, setMaterials] = useState<StudyMaterialRecord[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [cards, setCards] = useState<FlashcardRecord[]>([]);
  const [flippedIds, setFlippedIds] = useState<Record<string, boolean>>({});
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
    if (localVault.flashcards.length > 0) {
      setCards(localVault.flashcards);
    }

    try {
      await syncClientVaultWithServer();
      const [matRes, fcRes] = await Promise.all([
        fetch("/api/materials", { cache: "no-store" }),
        fetch("/api/ai/flashcards", { cache: "no-store" }),
      ]);
      const matJson = await matRes.json();
      const fcJson = await fcRes.json();

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
      if (fcJson.ok) {
        const mergedCards = saveFlashcardsToVault(fcJson.flashcards ?? []);
        setCards(mergedCards);
      } else if (fcJson.error && localVault.flashcards.length === 0) {
        setError(fcJson.error);
      }
    } catch {
      if (localVault.flashcards.length === 0) {
        setError("Failed to load flashcards.");
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

      const res = await fetch("/api/ai/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: selectedMaterialId,
          count: 8,
          material: targetMat,
          chunks: targetChunks,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to generate flashcards.");
      } else {
        const merged = saveFlashcardsToVault(data.flashcards ?? []);
        setCards(merged);
      }
    } catch {
      setError("Network error while generating flashcards.");
    } finally {
      setGenerating(false);
    }
  }

  function toggleFlip(cardId: string) {
    setFlippedIds((prev) => ({ ...prev, [cardId]: !prev[cardId] }));
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
        <div className="flex items-center gap-4">
          <CuteSkeletonSticker className="h-12 w-12 shrink-0" />
          <div>
            <h1 className="text-2xl font-extrabold text-[#fff8ed]">
              Interactive Active-Recall Flashcards
            </h1>
            <p className="mt-1 text-sm text-[#d8cbe8]">
              Generate independent question-and-answer flip cards with difficulty ratings and topic
              tags.
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
        <form onSubmit={handleGenerate} className="flex flex-wrap items-end gap-4">
          <div className="min-w-[260px] flex-1">
            <label htmlFor="flashcards-material" className="block text-sm font-semibold text-[#fff8ed]">
              Select Processed Study Material
            </label>
            <select
              id="flashcards-material"
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
            <span>{generating ? "Creating Deck..." : "Generate Flashcards"}</span>
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

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-56 animate-pulse rounded-2xl border border-[#3e236b] bg-[#160b28]"
            />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <HalloweenEmptyState
          variant="skeleton"
          title="No Flashcards Generated Yet"
          description="Select an indexed study material and generate interactive flip cards to practice active recall."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const isFlipped = Boolean(flippedIds[card.id]);
            return (
              <div
                key={card.id}
                className="flex flex-col justify-between rounded-3xl border border-[#3e236b] bg-[#160b28] p-6 shadow-xl transition hover:border-[#ff7b29]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-xs font-bold text-[#c4b5fd]">
                      <Layers className="h-3.5 w-3.5 text-[#ff7b29]" aria-hidden="true" />
                      <span>{card.topic}</span>
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                        card.difficulty === "hard"
                          ? "bg-[#ff6b6b]/20 text-[#ff6b6b]"
                          : card.difficulty === "medium"
                            ? "bg-[#ff7b29]/20 text-[#ff944d]"
                            : "bg-[#4ade80]/20 text-[#4ade80]"
                      }`}
                    >
                      {card.difficulty}
                    </span>
                  </div>

                  <div className="mt-4 min-h-[120px] rounded-2xl border border-[#3e236b] bg-[#21113b] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#ff944d]">
                      {isFlipped ? "Back — Answer" : "Front — Question"}
                    </p>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-[#fff8ed]">
                      {isFlipped ? card.back_answer : card.front_question}
                    </p>
                    {!isFlipped && card.hint && (
                      <p className="mt-3 text-xs italic text-[#c4b5fd]">Hint: {card.hint}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between pt-2">
                  <span className="text-xs text-[#d8cbe8]">
                    {card.source_reference ? `Source: ${card.source_reference}` : "Grounded Card"}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleFlip(card.id)}
                    aria-pressed={isFlipped}
                    aria-label={`Flip flashcard for ${card.topic}`}
                    className="flex items-center gap-1.5 rounded-xl border border-[#ff7b29] bg-[#ff7b29]/15 px-3.5 py-2 text-xs font-bold text-[#ff944d] hover:bg-[#ff7b29] hover:text-[#0c0617]"
                  >
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isFlipped ? "Show Question" : "Flip for Answer"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
