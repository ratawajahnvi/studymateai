"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  BatClusterSticker,
  CuteGhostSticker,
  CuteSkeletonSticker,
  HauntedHouseIllustration,
  PumpkinSticker,
  SpookyMoonBadge,
} from "@/components/halloween/Stickers";
import { ModalDialog } from "@/components/ui/ModalDialog";

const SAVED_LOGIN_KEY = "studymate_saved_login";

interface SavedLoginRecord {
  mode: "google" | "studentId";
  googleEmail?: string;
  fullName?: string;
  studentId?: string;
  pin: string;
}

export default function StudentAuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"google" | "studentId">("google");

  // Google Account Sign-In / Registration state
  const [googleEmail, setGoogleEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [googlePin, setGooglePin] = useState("");
  const [showGooglePin, setShowGooglePin] = useState(false);

  // Student ID Login state
  const [studentId, setStudentId] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [showLoginPin, setShowLoginPin] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [autoRestoring, setAutoRestoring] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [missingVars, setMissingVars] = useState<string[]>([]);

  // Newly generated Student ID modal
  const [createdStudent, setCreatedStudent] = useState<{
    studentId: string;
    googleEmail: string;
    fullName: string;
    role: "student" | "admin" | "superadmin";
  } | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkExistingSessionOrAutoLogin() {
      try {
        // 1. Check if server session cookie is already valid
        const meRes = await fetch("/api/auth/me", { cache: "no-store" });
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData?.authenticated && meData?.session) {
            const role = meData.session.role;
            if (role === "superadmin") {
              router.replace("/superadmin/dashboard");
            } else if (role === "admin") {
              router.replace("/admin/dashboard");
            } else {
              router.replace("/dashboard");
            }
            return;
          }
        }

        // 2. Check saved login details in localStorage for automatic sign-in
        const rawSaved = window.localStorage.getItem(SAVED_LOGIN_KEY);
        if (rawSaved) {
          const saved = JSON.parse(rawSaved) as SavedLoginRecord;
          if (saved.mode === "google" && saved.googleEmail && saved.pin) {
            setGoogleEmail(saved.googleEmail);
            if (saved.fullName) setFullName(saved.fullName);
            setGooglePin(saved.pin);

            const autoRes = await fetch("/api/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                googleEmail: saved.googleEmail,
                fullName: saved.fullName,
                pin: saved.pin,
              }),
            });
            const autoData = await autoRes.json();
            if (autoRes.ok && autoData?.ok) {
              const role = autoData.user?.role;
              if (role === "superadmin") {
                router.replace("/superadmin/dashboard");
              } else if (role === "admin") {
                router.replace("/admin/dashboard");
              } else {
                router.replace("/dashboard");
              }
              return;
            }
          } else if (saved.mode === "studentId" && saved.studentId && saved.pin) {
            setMode("studentId");
            setStudentId(saved.studentId);
            setLoginPin(saved.pin);

            const autoRes = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                studentId: saved.studentId,
                pin: saved.pin,
              }),
            });
            const autoData = await autoRes.json();
            if (autoRes.ok && autoData?.ok) {
              const role = autoData.student?.role;
              if (role === "superadmin") {
                router.replace("/superadmin/dashboard");
              } else if (role === "admin") {
                router.replace("/admin/dashboard");
              } else {
                router.replace("/dashboard");
              }
              return;
            }
          }
        }
      } catch {
        // Ignore auto-restore error and show normal form
      } finally {
        if (active) setAutoRestoring(false);
      }
    }

    void checkExistingSessionOrAutoLogin();

    fetch("/api/health", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.status?.missingVariables?.length > 0) {
          setMissingVars(data.status.missingVariables);
        }
      })
      .catch(() => {
        // Ignore network error on initial check
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function handleGoogleAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const normalizedEmail = googleEmail.trim().toLowerCase();
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleEmail: normalizedEmail,
          fullName: fullName.trim() ? fullName.trim() : undefined,
          pin: googlePin,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        if (data.missingVariables) setMissingVars(data.missingVariables);
        setErrorMsg(data.error ?? "Google Account sign-in failed.");
        return;
      }

      // Persist login details so user never has to sign in again until they click Sign Out
      try {
        const record: SavedLoginRecord = {
          mode: "google",
          googleEmail: normalizedEmail,
          fullName: data.user?.fullName ?? (fullName.trim() || undefined),
          studentId: data.user?.studentId,
          pin: googlePin,
        };
        window.localStorage.setItem(SAVED_LOGIN_KEY, JSON.stringify(record));
      } catch {
        // Ignore storage quota errors
      }

      if (data.isNewAccount) {
        setCreatedStudent({
          studentId: data.user.studentId,
          googleEmail: data.user.googleEmail,
          fullName: data.user.fullName,
          role: data.user.role,
        });
        return;
      }

      if (data.user.role === "superadmin") {
        router.push("/superadmin/dashboard");
      } else if (data.user.role === "admin") {
        router.push("/admin/dashboard");
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } catch {
      setErrorMsg("Network error while communicating with authentication server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const normalizedId = studentId.trim().toUpperCase();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: normalizedId, pin: loginPin }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        if (data.missingVariables) setMissingVars(data.missingVariables);
        setErrorMsg(data.error ?? "Invalid Student ID or PIN.");
        return;
      }

      try {
        const record: SavedLoginRecord = {
          mode: "studentId",
          studentId: normalizedId,
          pin: loginPin,
        };
        window.localStorage.setItem(SAVED_LOGIN_KEY, JSON.stringify(record));
      } catch {
        // Ignore storage quota errors
      }

      if (data.student?.role === "superadmin") {
        router.push("/superadmin/dashboard");
      } else if (data.student?.role === "admin") {
        router.push("/admin/dashboard");
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } catch {
      setErrorMsg("Network error while signing in.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyGeneratedId() {
    if (!createdStudent) return;
    await navigator.clipboard.writeText(createdStudent.studentId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-4xl">
        {/* Top Banner if External Environment Credentials are not yet configured */}
        {missingVars.length > 0 && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-[#ff7b29] bg-[#21113b] p-4 text-sm text-[#fff8ed] shadow-lg"
          >
            <p className="font-bold text-[#ff944d]">
              External Backend Configuration Required (.env.local)
            </p>
            <p className="mt-1 text-[#d8cbe8]">
              StudyMate AI never uses fake or mock credentials. Please configure the following
              server environment variables in <code className="text-[#fff8ed]">.env.local</code>{" "}
              before signing in:
            </p>
            <p className="mt-1.5 font-mono text-xs text-[#ff944d]">{missingVars.join(", ")}</p>
          </div>
        )}

        <div className="grid overflow-hidden rounded-3xl border border-[#3e236b] bg-[#160b28] shadow-2xl lg:grid-cols-12">
          {/* Left Column: Cute Halloween Brand Showcase */}
          <div className="flex flex-col justify-between border-b border-[#3e236b] bg-[#21113b] p-8 lg:col-span-5 lg:border-r lg:border-b-0">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <PumpkinSticker className="h-10 w-10" />
                  <div>
                    <h1 className="text-xl font-extrabold tracking-tight text-[#fff8ed]">
                      StudyMate AI
                    </h1>
                    <p className="text-xs font-medium text-[#c4b5fd]">
                      Pure Cute Halloween Study Sanctuary
                    </p>
                  </div>
                </div>
                <SpookyMoonBadge className="h-10 w-10" />
              </div>

              <div className="my-8 flex justify-center">
                <div className="relative flex items-center gap-3 rounded-3xl border border-[#3e236b] bg-[#160b28] p-5 shadow-inner">
                  <CuteGhostSticker className="h-14 w-14" />
                  <HauntedHouseIllustration className="h-24 w-24" />
                  <CuteSkeletonSticker className="h-14 w-14" />
                </div>
              </div>

              <h2 className="text-lg font-bold text-[#fff8ed]">
                Google Account Sign-In & Role-Based Security
              </h2>
              <ul className="mt-3 space-y-2.5 text-sm text-[#d8cbe8]">
                <li className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#ff7b29]" aria-hidden="true" />
                  <span>
                    Sign in seamlessly with your{" "}
                    <strong className="text-[#fff8ed]">Google Account</strong> and private security
                    PIN.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#ff7b29]" aria-hidden="true" />
                  <span>
                    Every account is also issued a unique{" "}
                    <code className="font-mono text-[#ff944d]">SM-XXXX-XXXX</code> Student ID.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#4ade80]"
                    aria-hidden="true"
                  />
                  <span>
                    Authorized Admin Google Accounts automatically unlock both the{" "}
                    <strong className="text-[#4ade80]">Admin Dashboard</strong> and all Study
                    Platform features.
                  </span>
                </li>
              </ul>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-[#3e236b] pt-4 text-xs text-[#c4b5fd]">
              <div>
                <span className="block">Grounded by Google Gemini & Supabase</span>
                <span className="mt-0.5 block font-bold text-[#ff944d]">
                  Design and Build by Team Tricksters
                </span>
              </div>
              <BatClusterSticker className="h-6 w-10 shrink-0" />
            </div>
          </div>

          {/* Right Column: Google Account Sign-In & Student ID Login Forms */}
          <div className="p-8 lg:col-span-7">
            <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-[#3e236b] bg-[#0c0617] p-1.5">
              <button
                type="button"
                onClick={() => {
                  setMode("google");
                  setErrorMsg(null);
                }}
                aria-pressed={mode === "google"}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
                  mode === "google"
                    ? "bg-[#ff7b29] text-[#0c0617] shadow"
                    : "text-[#d8cbe8] hover:text-[#fff8ed]"
                }`}
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                <span>Continue with Google</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("studentId");
                  setErrorMsg(null);
                }}
                aria-pressed={mode === "studentId"}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
                  mode === "studentId"
                    ? "bg-[#ff7b29] text-[#0c0617] shadow"
                    : "text-[#d8cbe8] hover:text-[#fff8ed]"
                }`}
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                <span>Sign In with Student ID</span>
              </button>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-[#ff6b6b] bg-[#ff6b6b]/15 p-3.5 text-sm text-[#fff8ed]"
              >
                <span aria-hidden="true" className="mr-1.5">
                  ⚠️
                </span>
                {errorMsg}
              </div>
            )}

            {mode === "google" ? (
              <form onSubmit={handleGoogleAuth} method="POST" className="space-y-5">
                <fieldset className="space-y-5">
                  <legend className="text-lg font-bold text-[#fff8ed]">
                    Sign In or Register with Your Google Account
                  </legend>

                  <div>
                    <label
                      htmlFor="google-email"
                      className="block text-sm font-semibold text-[#fff8ed]"
                    >
                      Google Account Email
                    </label>
                    <span id="google-email-hint" className="field-hint">
                      Enter your Google Account email address (e.g., yourname@gmail.com).
                    </span>
                    <input
                      id="google-email"
                      name="googleEmail"
                      type="email"
                      required
                      autoComplete="email"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      aria-describedby="google-email-hint"
                      value={googleEmail}
                      onChange={(e) => setGoogleEmail(e.target.value)}
                      placeholder="yourname@gmail.com"
                      className="w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-4 py-3 text-base text-[#fff8ed] placeholder:text-[#d8cbe8]/45"
                    />
                    <div className="field-error-msg">
                      Please enter a valid Google Account email address.
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="google-full-name"
                      className="block text-sm font-semibold text-[#fff8ed]"
                    >
                      Your Name{" "}
                      <span className="text-xs font-normal text-[#c4b5fd]">
                        (Optional for returning users)
                      </span>
                    </label>
                    <span id="google-name-hint" className="field-hint">
                      Used when creating your profile on first login.
                    </span>
                    <input
                      id="google-full-name"
                      name="fullName"
                      type="text"
                      maxLength={80}
                      autoComplete="name"
                      aria-describedby="google-name-hint"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g., Jahnvi Ratawa"
                      className="w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-4 py-3 text-base text-[#fff8ed] placeholder:text-[#d8cbe8]/45"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="google-pin"
                        className="block text-sm font-semibold text-[#fff8ed]"
                      >
                        Security PIN
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowGooglePin((v) => !v)}
                        aria-pressed={showGooglePin}
                        aria-label={showGooglePin ? "Hide PIN" : "Show PIN"}
                        aria-describedby="google-pin-toggle-warning"
                        className="flex items-center gap-1 text-xs font-medium text-[#c4b5fd] hover:text-[#ff944d]"
                      >
                        {showGooglePin ? (
                          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>{showGooglePin ? "Hide PIN" : "Show PIN"}</span>
                      </button>
                      <span id="google-pin-toggle-warning" className="visually-hidden">
                        Warning: toggling this displays your PIN on the screen.
                      </span>
                    </div>
                    <span id="google-pin-hint" className="field-hint">
                      Enter a 4 to 8 digit numeric PIN for your Google account.
                    </span>
                    <input
                      id="google-pin"
                      name="pin"
                      type={showGooglePin ? "text" : "password"}
                      inputMode="numeric"
                      autoComplete="current-password"
                      required
                      minLength={4}
                      maxLength={8}
                      pattern="\d{4,8}"
                      aria-describedby="google-pin-hint"
                      value={googlePin}
                      onChange={(e) => setGooglePin(e.target.value)}
                      placeholder="4 to 8 digit PIN"
                      className="w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-4 py-3 font-mono text-base tracking-widest text-[#fff8ed] placeholder:font-sans placeholder:tracking-normal placeholder:text-[#d8cbe8]/45"
                    />
                    <div className="field-error-msg">
                      Please enter a valid 4 to 8 digit numeric PIN.
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || autoRestoring}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff7b29] px-5 py-3.5 text-base font-bold text-[#0c0617] shadow-lg transition hover:bg-[#ff944d] disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    <span>
                      {autoRestoring
                        ? "Restoring Your Saved Account..."
                        : submitting
                          ? "Authenticating Google Account..."
                          : "Continue with Google Account"}
                    </span>
                  </button>
                </fieldset>
              </form>
            ) : (
              <form onSubmit={handleLogin} method="POST" className="space-y-5">
                <fieldset className="space-y-5">
                  <legend className="text-lg font-bold text-[#fff8ed]">
                    Sign In with Student ID & PIN
                  </legend>

                  <div>
                    <label
                      htmlFor="login-student-id"
                      className="block text-sm font-semibold text-[#fff8ed]"
                    >
                      Unique Student ID
                    </label>
                    <span id="login-id-hint" className="field-hint">
                      Format: SM-XXXX-XXXX (issued during registration).
                    </span>
                    <input
                      id="login-student-id"
                      name="studentId"
                      type="text"
                      required
                      autoComplete="username"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      pattern="^[Ss][Mm]-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$"
                      aria-describedby="login-id-hint"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value.toUpperCase())}
                      placeholder="SM-8K4P-9W2X"
                      className="w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-4 py-3 font-mono text-base uppercase text-[#fff8ed] placeholder:text-[#d8cbe8]/45"
                    />
                    <div className="field-error-msg">
                      Enter a valid Student ID in format SM-XXXX-XXXX.
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="login-pin"
                        className="block text-sm font-semibold text-[#fff8ed]"
                      >
                        Private PIN
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowLoginPin((v) => !v)}
                        aria-pressed={showLoginPin}
                        aria-label={showLoginPin ? "Hide PIN" : "Show PIN"}
                        className="flex items-center gap-1 text-xs font-medium text-[#c4b5fd] hover:text-[#ff944d]"
                      >
                        {showLoginPin ? (
                          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>{showLoginPin ? "Hide PIN" : "Show PIN"}</span>
                      </button>
                    </div>
                    <span id="login-pin-hint" className="field-hint">
                      Enter your 4 to 8 digit private numeric PIN.
                    </span>
                    <input
                      id="login-pin"
                      name="pin"
                      type={showLoginPin ? "text" : "password"}
                      inputMode="numeric"
                      autoComplete="current-password"
                      required
                      minLength={4}
                      maxLength={8}
                      pattern="\d{4,8}"
                      aria-describedby="login-pin-hint"
                      value={loginPin}
                      onChange={(e) => setLoginPin(e.target.value)}
                      placeholder="Your 4 to 8 digit PIN"
                      className="w-full rounded-xl border border-[#3e236b] bg-[#0c0617] px-4 py-3 font-mono text-base tracking-widest text-[#fff8ed] placeholder:font-sans placeholder:tracking-normal placeholder:text-[#d8cbe8]/45"
                    />
                    <div className="field-error-msg">
                      Please enter your 4 to 8 digit numeric PIN.
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff7b29] px-5 py-3.5 text-base font-bold text-[#0c0617] shadow-lg transition hover:bg-[#ff944d] disabled:opacity-50"
                  >
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                    <span>{submitting ? "Verifying Credentials..." : "Enter Study Hall"}</span>
                  </button>
                </fieldset>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* Native <dialog> Modal showing newly generated Student ID */}
      <ModalDialog
        open={Boolean(createdStudent)}
        onClose={() => {
          if (createdStudent?.role === "superadmin") {
            router.push("/superadmin/dashboard");
          } else if (createdStudent?.role === "admin") {
            router.push("/admin/dashboard");
          } else {
            router.push("/dashboard");
          }
          router.refresh();
        }}
        title={
          createdStudent?.role === "superadmin"
            ? "Supreme SuperAdmin Verified — Full Command Unlocked!"
            : createdStudent?.role === "admin"
              ? "Admin Google Account Verified — Full Access Granted!"
              : "Your Google Account & Unique Student ID Are Ready!"
        }
      >
        {createdStudent && (
          <div className="space-y-4">
            <p className="text-sm text-[#d8cbe8]">
              Welcome, <strong className="text-[#fff8ed]">{createdStudent.fullName}</strong> (
              <span className="text-[#c4b5fd]">{createdStudent.googleEmail}</span>)! You can sign
              in anytime using your Google Account email or your unique ID below.
            </p>

            {(createdStudent.role === "admin" || createdStudent.role === "superadmin") && (
              <div className="rounded-xl border border-[#4ade80]/60 bg-[#4ade80]/15 p-3 text-xs font-semibold text-[#4ade80]">
                {createdStudent.role === "superadmin"
                  ? "👑 Supreme SuperAdmin Account: You have exclusive access to the SuperAdmin Command Center (/superadmin/dashboard), the Admin Dashboard, and all StudyMate AI features."
                  : "✓ Authorized Administrator Account: You have exclusive access to the Admin Dashboard as well as all StudyMate AI features."}
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl border border-[#ff7b29] bg-[#0c0617] p-4">
              <span className="font-mono text-xl font-extrabold tracking-wider text-[#ff944d]">
                {createdStudent.studentId}
              </span>
              <button
                type="button"
                onClick={copyGeneratedId}
                className="flex items-center gap-1.5 rounded-lg border border-[#3e236b] bg-[#21113b] px-3 py-1.5 text-xs font-semibold text-[#fff8ed] hover:border-[#ff7b29]"
              >
                {copiedId ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#4ade80]" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-[#c4b5fd]" aria-hidden="true" />
                    <span>Copy ID</span>
                  </>
                )}
              </button>
            </div>

            {createdStudent.role === "superadmin" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    router.push("/superadmin/dashboard");
                    router.refresh();
                  }}
                  className="w-full rounded-xl bg-[#ff7b29] py-3 text-sm font-extrabold text-[#0c0617] hover:bg-[#ff944d]"
                >
                  Open SuperAdmin Console
                </button>
                <button
                  type="button"
                  onClick={() => {
                    router.push("/dashboard");
                    router.refresh();
                  }}
                  className="w-full rounded-xl bg-[#4ade80] py-3 text-sm font-bold text-[#0c0617] hover:bg-[#86efac]"
                >
                  Open Study Platform
                </button>
              </div>
            ) : createdStudent.role === "admin" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    router.push("/admin/dashboard");
                    router.refresh();
                  }}
                  className="w-full rounded-xl bg-[#4ade80] py-3 text-sm font-bold text-[#0c0617] hover:bg-[#86efac]"
                >
                  Open Admin Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    router.push("/dashboard");
                    router.refresh();
                  }}
                  className="w-full rounded-xl bg-[#ff7b29] py-3 text-sm font-bold text-[#0c0617] hover:bg-[#ff944d]"
                >
                  Open Study Platform
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  router.push("/dashboard");
                  router.refresh();
                }}
                className="w-full rounded-xl bg-[#ff7b29] py-3 text-sm font-bold text-[#0c0617] hover:bg-[#ff944d]"
              >
                Continue to Student Dashboard
              </button>
            )}
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
