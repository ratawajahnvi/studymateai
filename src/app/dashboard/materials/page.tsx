"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileUp, RefreshCw, RotateCcw, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import {
  HalloweenEmptyState,
  PumpkinSticker,
} from "@/components/halloween/Stickers";
import { SUPPORTED_EXTENSIONS } from "@/lib/validation/schemas";
import {
  readClientVault,
  saveMaterialsToVault,
  syncClientVaultWithServer,
} from "@/lib/client/persistenceVault";
import type { ProcessingJobRecord, StudyMaterialRecord } from "@/lib/db/types";

export default function StudyMaterialsPage() {
  const [materials, setMaterials] = useState<StudyMaterialRecord[]>([]);
  const [jobs, setJobs] = useState<ProcessingJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadMaterials = useCallback(async () => {
    setLoading(true);
    const localVault = readClientVault();
    if (localVault.study_materials.length > 0) {
      setMaterials(localVault.study_materials);
      setJobs(localVault.processing_jobs);
    }
    try {
      await syncClientVaultWithServer();
      const res = await fetch("/api/materials", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (localVault.study_materials.length === 0) {
          setError(data.error ?? "Failed to load study materials.");
        }
      } else {
        const merged = saveMaterialsToVault(data.materials ?? [], data.jobs ?? []);
        setMaterials(merged.study_materials);
        setJobs(merged.processing_jobs);
      }
    } catch {
      if (localVault.study_materials.length === 0) {
        setError("Network error while loading study materials.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedFile) {
      setError("Please select a supported document or image file to upload.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append(
        "title",
        title.trim() || selectedFile.name.replace(/\.[^.]+$/, "")
      );

      const res = await fetch("/api/materials", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(
          data.error ??
            data.processing?.errorMessage ??
            "Material upload or extraction failed."
        );
      } else {
        const merged = saveMaterialsToVault(
          data.material ? [data.material] : [],
          data.job ? [data.job] : undefined,
          Array.isArray(data.extractedChunks) ? data.extractedChunks : undefined
        );
        setMaterials(merged.study_materials);
        setJobs(merged.processing_jobs);
        setSuccessMsg(
          `Successfully uploaded and indexed "${data.material.title}" (${data.processing.chunkCount} chunks extracted).`
        );
        setTitle("");
        setSelectedFile(null);
      }
      await loadMaterials();
    } catch {
      setError("Network error while uploading study material.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRetry(materialId: string) {
    setRetryingId(materialId);
    setError(null);
    try {
      const res = await fetch(`/api/materials/${materialId}/process`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.result?.errorMessage ?? data.error ?? "Retry processing failed.");
      } else {
        setSuccessMsg(
          `Re-processed material successfully (${data.result.chunkCount} chunks indexed).`
        );
      }
      await loadMaterials();
    } catch {
      setError("Network error during retry.");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
        <div className="flex items-center gap-4">
          <PumpkinSticker className="h-12 w-12 shrink-0" />
          <div>
            <h1 className="text-2xl font-extrabold text-[#fff8ed]">
              Study Materials & Extraction Pipeline
            </h1>
            <p className="mt-1 text-sm text-[#d8cbe8]">
              Upload documents, spreadsheets, slides, or images for AI-powered study notes and indexing.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadMaterials}
          className="flex items-center gap-2 rounded-xl border border-[#3e236b] bg-[#21113b] px-4 py-2 text-sm font-semibold text-[#fff8ed] hover:border-[#ff7b29]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </header>

      {/* Upload Form */}
      <section
        aria-labelledby="upload-heading"
        className="rounded-3xl border border-[#3e236b] bg-[#160b28] p-6 shadow-lg"
      >
        <h2 id="upload-heading" className="text-lg font-bold text-[#fff8ed]">
          Upload New Study Material
        </h2>
        <p className="mt-1 text-xs text-[#c4b5fd]">
          Supported formats: {SUPPORTED_EXTENSIONS.map((e) => e.toUpperCase()).join(", ")} •
          Enforced processing limit: 50 MB documents / 20 MB images.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-[#ff6b6b] bg-[#ff6b6b]/15 p-3.5 text-sm text-[#fff8ed]"
          >
            {error}
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 rounded-xl border border-[#4ade80] bg-[#4ade80]/15 p-3.5 text-sm text-[#fff8ed]"
          >
            {successMsg}
          </div>
        )}

        <form onSubmit={handleUpload} className="mt-5 grid gap-4 md:grid-cols-12">
          <div className="md:col-span-5">
            <label htmlFor="material-title" className="block text-sm font-semibold text-[#fff8ed]">
              Material Title
            </label>
            <span id="material-title-hint" className="field-hint">
              Descriptive name for your notes and citations.
            </span>
            <input
              id="material-title"
              name="title"
              type="text"
              maxLength={140}
              aria-describedby="material-title-hint"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Cellular Respiration Lecture"
              className="w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-4 py-2.5 text-sm text-[#fff8ed]"
            />
          </div>

          <div className="md:col-span-5">
            <label htmlFor="material-file" className="block text-sm font-semibold text-[#fff8ed]">
              Select File
            </label>
            <span id="material-file-hint" className="field-hint">
              Choose a supported file up to 50 MB.
            </span>
            <input
              id="material-file"
              name="file"
              type="file"
              required
              aria-describedby="material-file-hint"
              accept={SUPPORTED_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-3 py-2 text-sm text-[#d8cbe8] file:mr-3 file:rounded-lg file:border-0 file:bg-[#ff7b29] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#0c0617]"
            />
          </div>

          <div className="flex items-end md:col-span-2">
            <button
              type="submit"
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff7b29] px-4 py-3 text-sm font-bold text-[#0c0617] transition hover:bg-[#ff944d] disabled:opacity-50"
            >
              <FileUp className="h-4 w-4" aria-hidden="true" />
              <span>{uploading ? "Processing..." : "Upload & Index"}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Materials & Processing Jobs List */}
      <section aria-labelledby="materials-list-heading" className="space-y-4">
        <h2 id="materials-list-heading" className="text-lg font-bold text-[#fff8ed]">
          Your Indexed Study Materials ({materials.length})
        </h2>

        {loading ? (
          <div className="h-40 animate-pulse rounded-2xl border border-[#3e236b] bg-[#160b28]" />
        ) : materials.length === 0 ? (
          <HalloweenEmptyState
            variant="haunted"
            title="No Study Files in Your Library"
            description="Upload your first PDF, DOCX, PPTX, spreadsheet, image, or recording above to generate AI Notes, Flashcards, and Practice Questions."
          />
        ) : (
          <ul className="space-y-3" role="list">
            {materials.map((mat) => {
              const job = jobs.find((j) => j.material_id === mat.id);
              return (
                <li
                  key={mat.id}
                  className="rounded-2xl border border-[#3e236b] bg-[#160b28] p-5 shadow-md"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="rounded-md bg-[#21113b] px-2 py-0.5 font-mono text-xs font-bold uppercase text-[#c4b5fd]">
                          .{mat.file_extension}
                        </span>
                        <h3 className="text-base font-bold text-[#fff8ed]">{mat.title}</h3>
                      </div>
                      <p className="mt-1 text-xs text-[#d8cbe8]">
                        File: {mat.original_filename} •{" "}
                        {(mat.file_size_bytes / 1024).toFixed(1)} KB •{" "}
                        {mat.page_or_unit_count} extracted units •{" "}
                        {job ? `${job.processed_chunks}/${job.total_chunks} chunks` : "Indexed"}
                      </p>
                      {mat.error_message && (
                        <p className="mt-2 text-xs text-[#ff6b6b]">Error: {mat.error_message}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {mat.processing_status === "completed" && (
                        <>
                          <span className="flex items-center gap-1.5 rounded-full bg-[#4ade80]/15 px-3 py-1 text-xs font-bold text-[#4ade80]">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Indexed (100%)</span>
                          </span>
                          <Link
                            href="/dashboard/ai-notes"
                            className="rounded-lg border border-[#3e236b] bg-[#21113b] px-2.5 py-1 text-xs font-semibold text-[#fff8ed] hover:border-[#ff7b29]"
                          >
                            AI Notes
                          </Link>
                          <Link
                            href="/dashboard/short-notes"
                            className="rounded-lg border border-[#3e236b] bg-[#21113b] px-2.5 py-1 text-xs font-semibold text-[#fff8ed] hover:border-[#ff7b29]"
                          >
                            Short Notes
                          </Link>
                          <Link
                            href="/dashboard/flashcards"
                            className="rounded-lg border border-[#3e236b] bg-[#21113b] px-2.5 py-1 text-xs font-semibold text-[#fff8ed] hover:border-[#ff7b29]"
                          >
                            Flashcards
                          </Link>
                          <Link
                            href="/dashboard/questions"
                            className="rounded-lg border border-[#3e236b] bg-[#21113b] px-2.5 py-1 text-xs font-semibold text-[#fff8ed] hover:border-[#ff7b29]"
                          >
                            Questions
                          </Link>
                        </>
                      )}

                      {mat.processing_status === "failed" && (
                        <>
                          <span className="flex items-center gap-1.5 rounded-full bg-[#ff6b6b]/15 px-3 py-1 text-xs font-bold text-[#ff6b6b]">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Failed</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRetry(mat.id)}
                            disabled={retryingId === mat.id}
                            className="flex items-center gap-1.5 rounded-xl bg-[#ff7b29] px-3 py-1.5 text-xs font-bold text-[#0c0617] hover:bg-[#ff944d] disabled:opacity-50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>
                              {retryingId === mat.id ? "Retrying..." : "Retry Extraction"}
                            </span>
                          </button>
                        </>
                      )}

                      {mat.processing_status !== "completed" &&
                        mat.processing_status !== "failed" && (
                          <span className="flex items-center gap-1.5 rounded-full bg-[#ff7b29]/20 px-3 py-1 text-xs font-bold text-[#ff944d]">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>
                              {mat.processing_status} ({job?.progress_percent ?? 0}%)
                            </span>
                          </span>
                        )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
