"use client";

import React, { useState } from "react";
import { Eye, EyeOff, Lock, Loader2, AlertCircle, ArrowRight } from "lucide-react";

export default function LoginForm({ next, configured }: { next: string; configured: boolean }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    configured ? null : "Admin login isn't configured yet. Set ADMIN_PASSWORD in the server environment."
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        // Full navigation so the new cookie is sent on the very next request.
        window.location.assign(next);
        return;
      }
      setError(json.error || "Sign in failed. Please try again.");
      setPassword("");
    } catch {
      setError("Network error. Check your connection and try again.");
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Hidden username helps password managers associate the saved credential. */}
      <input type="text" name="username" autoComplete="username" value="gec-admin" readOnly hidden />

      <div>
        <label htmlFor="password" className="block text-xs font-semibold text-stone-700 mb-1.5">
          Password
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" aria-hidden />
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            autoFocus
            required
            disabled={!configured || submitting}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "login-error" : undefined}
            className="w-full h-11 rounded-xl border border-stone-200 bg-stone-50/60 pl-10 pr-11 text-sm text-stone-900 placeholder:text-stone-400 outline-none transition focus:bg-white focus:border-amber-400 focus:ring-4 focus:ring-amber-100 disabled:opacity-60"
            placeholder="Enter admin password"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div aria-live="polite" className="min-h-0">
        {error && (
          <p
            id="login-error"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-px" aria-hidden />
            <span>{error}</span>
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={!configured || submitting || !password}
        className="group w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Signing in…
          </>
        ) : (
          <>
            Sign in <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
          </>
        )}
      </button>

      <p className="text-[11px] leading-relaxed text-stone-400 text-center">
        Sessions expire after 12 hours. Customer data on this desk is confidential.
      </p>
    </form>
  );
}
