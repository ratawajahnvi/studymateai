"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Lock } from "lucide-react";
import { SpookyMoonBadge } from "@/components/halloween/Stickers";

export default function AdminLoginPage() {
  const router = useRouter();
  const [adminId, setAdminId] = useState("ratawajahnvi@gmail.com");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId: adminId.trim(), pin }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Admin authentication failed.");
        return;
      }

      if (data.admin?.role === "superadmin") {
        router.push("/superadmin/dashboard");
      } else {
        router.push("/admin/dashboard");
      }
      router.refresh();
    } catch {
      setError("Network error communicating with Admin Auth service.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <main
        id="main-content"
        tabIndex={-1}
        className="w-full max-w-md rounded-3xl border border-[#3e236b] bg-[#160b28] p-8 shadow-2xl"
      >
        <div className="mb-6 flex items-center justify-between border-b border-[#3e236b] pb-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-[#ff7b29]" aria-hidden="true" />
            <div>
              <h1 className="text-lg font-extrabold text-[#fff8ed]">Protected Admin Portal</h1>
              <p className="text-xs text-[#c4b5fd]">Authorized System Administrators Only</p>
            </div>
          </div>
          <SpookyMoonBadge className="h-10 w-10" />
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-[#ff6b6b] bg-[#ff6b6b]/15 p-3.5 text-sm text-[#fff8ed]"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} method="POST" className="space-y-4">
          <div>
            <label htmlFor="admin-id" className="block text-sm font-semibold text-[#fff8ed]">
              Authorized Admin Google Email or Admin ID
            </label>
            <span id="admin-id-hint" className="field-hint">
              Enter your authorized Admin Google email (ratawajahnvi@gmail.com) or ADMIN_ID.
            </span>
            <input
              id="admin-id"
              name="adminId"
              type="text"
              required
              minLength={4}
              autoComplete="username"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-describedby="admin-id-hint"
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              placeholder="ratawajahnvi@gmail.com"
              className="w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-4 py-3 text-sm text-[#fff8ed]"
            />
          </div>

          <div>
            <label htmlFor="admin-pin" className="block text-sm font-semibold text-[#fff8ed]">
              Administrator Security PIN
            </label>
            <span id="admin-pin-hint" className="field-hint">
              Enter your 4 to 8 digit Admin PIN.
            </span>
            <input
              id="admin-pin"
              name="pin"
              type="password"
              required
              minLength={4}
              autoComplete="current-password"
              aria-describedby="admin-pin-hint"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter Admin PIN"
              className="w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-4 py-3 text-sm text-[#fff8ed]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff7b29] py-3.5 text-sm font-bold text-[#0c0617] hover:bg-[#ff944d] disabled:opacity-50"
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            <span>{submitting ? "Verifying Admin Identity..." : "Authenticate Admin"}</span>
          </button>
        </form>
      </main>
    </div>
  );
}
