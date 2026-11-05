"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Send, AlertCircle, BookMarked } from "lucide-react";
import {
  CuteGhostSticker,
  HalloweenEmptyState,
} from "@/components/halloween/Stickers";
import {
  readClientVault,
  saveMaterialsToVault,
  syncClientVaultWithServer,
} from "@/lib/client/persistenceVault";
import type { ChatMessageRecord, StudyMaterialRecord } from "@/lib/db/types";

export default function AiChatbotPage() {
  const [materials, setMaterials] = useState<StudyMaterialRecord[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const loadChat = useCallback(async (matId?: string) => {
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

    try {
      await syncClientVaultWithServer();
      const [matRes, chatRes] = await Promise.all([
        fetch("/api/materials", { cache: "no-store" }),
        fetch(`/api/ai/chat${matId ? `?materialId=${matId}` : ""}`, { cache: "no-store" }),
      ]);
      const matJson = await matRes.json();
      const chatJson = await chatRes.json();

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
      if (chatJson.ok) {
        setMessages(chatJson.messages ?? []);
      }
    } catch {
      setError("Failed to load chat history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChat();
  }, [loadChat]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedMaterialId || !question.trim() || sending) return;

    setSending(true);
    setError(null);
    const currentQuestion = question.trim();
    setQuestion("");

    try {
      await syncClientVaultWithServer();
      const vault = readClientVault();
      const targetMat =
        materials.find((m) => m.id === selectedMaterialId) ??
        vault.study_materials.find((m) => m.id === selectedMaterialId);
      const targetChunks = vault.extracted_document_contents.filter(
        (c) => c.material_id === selectedMaterialId
      );

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: selectedMaterialId,
          question: currentQuestion,
          material: targetMat,
          chunks: targetChunks,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to get AI Chatbot answer.");
        setQuestion(currentQuestion);
      } else {
        setMessages((prev) => [...prev, data.userMessage, data.assistantMessage]);
      }
    } catch {
      setError("Network error while communicating with AI Tutor.");
      setQuestion(currentQuestion);
    } finally {
      setSending(false);
    }
  }

  /**
   * Modern Web Guidance (`ime-safe-enter-submit`):
   * Checks `event.isComposing` and `event.keyCode === 229` so users composing text
   * with an IME (e.g., Japanese, Chinese, Korean) do not trigger premature submission.
   */
  function handleTextareaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
        return;
      }
      formRef.current?.requestSubmit();
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#3e236b] bg-[#160b28] p-6">
        <div className="flex items-center gap-4">
          <CuteGhostSticker className="h-12 w-12 shrink-0" />
          <div>
            <h1 className="text-2xl font-extrabold text-[#fff8ed]">
              Source-Grounded AI Study Chatbot
            </h1>
            <p className="mt-1 text-sm text-[#d8cbe8]">
              Ask questions about your uploaded materials with exact page/slide citations and clear
              unavailability notices when outside the source.
            </p>
          </div>
        </div>

        <div className="min-w-[240px]">
          <label htmlFor="chat-material-select" className="block text-xs font-semibold text-[#c4b5fd]">
            Active Source Material
          </label>
          <select
            id="chat-material-select"
            value={selectedMaterialId}
            onChange={(e) => setSelectedMaterialId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-3 py-2 text-sm text-[#fff8ed]"
          >
            <option value="">-- Select Study Material --</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} (.{m.file_extension})
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#ff6b6b] bg-[#ff6b6b]/15 p-3.5 text-sm text-[#fff8ed]"
        >
          {error}
        </div>
      )}

      {/* Conversation Area */}
      <div className="flex h-[520px] flex-col justify-between rounded-3xl border border-[#3e236b] bg-[#160b28] p-6 shadow-xl">
        <div className="flex-1 space-y-4 overflow-y-auto pr-2">
          {loading ? (
            <div className="h-32 animate-pulse rounded-2xl bg-[#21113b]" />
          ) : messages.length === 0 ? (
            <HalloweenEmptyState
              variant="ghost"
              title="Ask a Question About Your Study Material"
              description="Select a processed file above and ask for explanations, comparisons, or page-referenced clarifications."
            />
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender_role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-2xl rounded-2xl p-4 text-sm leading-relaxed ${
                    msg.sender_role === "user"
                      ? "bg-[#ff7b29] font-medium text-[#0c0617]"
                      : "border border-[#3e236b] bg-[#21113b] text-[#fff8ed]"
                  }`}
                >
                  {!msg.found_in_source && msg.sender_role === "assistant" && (
                    <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-[#ff7b29]/40 bg-[#ff7b29]/15 px-2.5 py-1 text-xs font-bold text-[#ff944d]">
                      <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Not directly found in uploaded source material</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{msg.message_text}</p>

                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-[#3e236b] pt-2.5">
                      <p className="flex items-center gap-1 text-xs font-bold text-[#c4b5fd]">
                        <BookMarked className="h-3.5 w-3.5 text-[#ff7b29]" aria-hidden="true" />
                        <span>Source References:</span>
                      </p>
                      {msg.citations.map((cit, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg bg-[#0c0617] px-2.5 py-1.5 text-xs text-[#d8cbe8]"
                        >
                          <strong className="text-[#ff944d]">[{cit.sourceLabel}]</strong>:{" "}
                          {cit.excerpt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* IME-Safe Chat Input Form */}
        <form ref={formRef} onSubmit={handleSubmit} className="mt-4 border-t border-[#3e236b] pt-4">
          <label htmlFor="chat-question-input" className="visually-hidden">
            Ask a study question
          </label>
          <div className="flex gap-3">
            <textarea
              id="chat-question-input"
              name="question"
              rows={2}
              required
              disabled={!selectedMaterialId || sending}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder={
                selectedMaterialId
                  ? "Ask a question grounded in your selected material (Press Enter to send, Shift+Enter for newline)..."
                  : "Upload and select a study material first..."
              }
              className="flex-1 rounded-2xl border border-[#3e236b] bg-[#0c0617] px-4 py-3 text-sm text-[#fff8ed] placeholder:text-[#d8cbe8]/45 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!selectedMaterialId || sending || !question.trim()}
              className="flex items-center gap-2 rounded-2xl bg-[#ff7b29] px-5 py-3 text-sm font-bold text-[#0c0617] hover:bg-[#ff944d] disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              <span>{sending ? "Thinking..." : "Ask AI"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
