"use client";

import React, { useCallback, useEffect, useState } from "react";
import { FileText, Zap } from "lucide-react";
import {
  HalloweenEmptyState,
  PumpkinSticker,
} from "@/components/halloween/Stickers";
import {
  readClientVault,
  saveMaterialsToVault,
  saveShortNotesToVault,
  syncClientVaultWithServer,
} from "@/lib/client/persistenceVault";
import type { ShortNoteRecord, StudyMaterialRecord } from "@/lib/db/types";

export default function ShortNotesPage() {
  const [materials, setMaterials] = useState<StudyMaterialRecord[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [shortNotes, setShortNotes] = useState<ShortNoteRecord[]>([]);
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
    if (localVault.short_notes.length > 0) {
      setShortNotes(localVault.short_notes);
    }

    try {
      await syncClientVaultWithServer();
      const [matRes, snRes] = await Promise.all([
        fetch("/api/materials", { cache: "no-store" }),
        fetch("/api/ai/short-notes", { cache: "no-store" }),
      ]);
      const matJson = await matRes.json();
      const snJson = await snRes.json();

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
      if (snJson.ok) {
        const mergedSn = saveShortNotesToVault(snJson.shortNotes ?? []);
        setShortNotes(mergedSn);
      } else if (snJson.error && localVault.short_notes.length === 0) {
        setError(snJson.error);
      }
    } catch {
      if (localVault.short_notes.length === 0) {
        setError("Failed to load Short Notes.");
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

      const res = await fetch("/api/ai/short-notes", {
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
        setError(data.error ?? "Failed to generate Short Notes.");
      } else {
        const merged = saveShortNotesToVault([data.shortNote]);
        setShortNotes(merged);
      }
    } catch {
      setError("Network error while generating Short Notes.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
        <div className="flex items-center gap-4">
          <PumpkinSticker className="h-12 w-12 shrink-0" />
          <div>
            <h1 className="text-2xl font-extrabold text-[#fff8ed]">
              Rapid Revision Short Notes
            </h1>
            <p className="mt-1 text-sm text-[#d8cbe8]">
              Concise, high-yield summaries, bullet points, and must-memorize exam formulas.
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
        <form onSubmit={handleGenerate} className="flex flex-wrap items-end gap-4">
          <div className="min-w-[260px] flex-1">
            <label htmlFor="short-notes-material" className="block text-sm font-semibold text-[#fff8ed]">
              Select Processed Study Material
            </label>
            <select
              id="short-notes-material"
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
            <Zap className="h-4 w-4" aria-hidden="true" />
            <span>{generating ? "Distilling Short Notes..." : "Generate Short Notes"}</span>
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
        <div className="h-48 animate-pulse rounded-3xl border border-[#3e236b] bg-[#160b28]" />
      ) : shortNotes.length === 0 ? (
        <HalloweenEmptyState
          variant="pumpkin"
          title="No Rapid Short Notes Yet"
          description="Generate a concise revision sheet from any processed study material for quick pre-exam review."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {shortNotes.map((sn) => (
            <article
              key={sn.id}
              className="space-y-5 rounded-3xl border border-[#3e236b] bg-[#160b28] p-6 shadow-xl"
            >
              <div className="border-b border-[#3e236b] pb-3">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#c4b5fd]">
                  <FileText className="h-4 w-4 text-[#ff7b29]" aria-hidden="true" />
                  <span>Rapid Revision Sheet</span>
                </div>
                <h2 className="mt-1 text-lg font-extrabold text-[#fff8ed]">{sn.title}</h2>
                <p className="mt-2 rounded-xl border border-[#3e236b] bg-[#21113b] p-3 text-sm text-[#fff8ed]">
                  {sn.ultra_concise_summary}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#ff944d]">
                  High-Yield Bullet Points
                </h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-[#d8cbe8]">
                  {sn.rapid_bullet_points.map((pt, i) => (
                    <li key={i}>{pt}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#4ade80]">
                  Must-Memorize Exam Facts
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-[#fff8ed]">
                  {sn.must_memorize_facts.map((fact, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-[#3e236b] bg-[#0c0617] px-3 py-2"
                    >
                      ★ {fact}
                    </li>
                  ))}
                </ul>
              </div>

              {sn.quick_formulas_or_definitions.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#c4b5fd]">
                    Quick Formulas & Definitions
                  </h3>
                  <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                    {sn.quick_formulas_or_definitions.map((fd, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-[#3e236b] bg-[#21113b] p-2.5"
                      >
                        <dt className="text-xs font-bold text-[#ff944d]">{fd.label}</dt>
                        <dd className="mt-0.5 text-xs text-[#fff8ed]">{fd.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
