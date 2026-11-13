"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, LogOut } from "lucide-react";

const IDLE_MS = 30 * 60 * 1000; // must match IDLE_TIMEOUT_SECONDS in lib/auth.ts
const WARN_MS = 2 * 60 * 1000; // show the warning 2 minutes before sign-out
const PING_EVERY_MS = 2 * 60 * 1000; // slide the server window at most every 2 minutes while active
const STORAGE_KEY = "gec-admin-last-activity"; // shared across tabs

const readShared = () => {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
};
const writeShared = (t: number) => {
  try {
    localStorage.setItem(STORAGE_KEY, String(t));
  } catch {}
};

/**
 * Client half of admin session management:
 *  • tracks real activity (shared across tabs) and slides the server idle window,
 *  • warns 2 minutes before the 30-minute idle sign-out, with "Stay signed in",
 *  • signs out when the idle or the 12-hour absolute limit is reached.
 * The server enforces the same limits independently (proxy.ts / lib/auth.ts).
 */
export default function SessionGuard() {
  const lastActivity = useRef(Date.now());
  const lastPing = useRef(Date.now());
  const absoluteAt = useRef<number>(Infinity);
  const [warnLeft, setWarnLeft] = useState<number | null>(null);
  const signingOut = useRef(false);

  const signOut = useCallback(async (reason: "idle" | "expired") => {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    window.location.assign(`/login?reason=${reason}&next=/admin`);
  }, []);

  const ping = useCallback(async () => {
    lastPing.current = Date.now();
    try {
      const res = await fetch("/api/auth/session", { method: "POST" });
      if (res.status === 401) return signOut("expired");
      const json = await res.json();
      if (json.absoluteExpiresAt) absoluteAt.current = json.absoluteExpiresAt - (json.serverNow - Date.now());
    } catch {}
  }, [signOut]);

  const stay = useCallback(() => {
    const now = Date.now();
    lastActivity.current = now;
    writeShared(now);
    setWarnLeft(null);
    ping();
  }, [ping]);

  useEffect(() => {
    writeShared(Date.now());
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.status === 401 ? signOut("expired") : r.json()))
      .then((j: any) => {
        if (j?.absoluteExpiresAt) absoluteAt.current = j.absoluteExpiresAt - (j.serverNow - Date.now());
      })
      .catch(() => {});

    let lastWrite = 0;
    const onActivity = () => {
      if (warnRef.current !== null) return; // while warning, only the button counts
      const now = Date.now();
      lastActivity.current = now;
      if (now - lastWrite > 5000) {
        lastWrite = now;
        writeShared(now);
      }
      if (now - lastPing.current > PING_EVERY_MS) ping();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const tick = setInterval(() => {
      const now = Date.now();
      const last = Math.max(lastActivity.current, readShared());
      lastActivity.current = last;
      if (now >= absoluteAt.current) return signOut("expired");
      const idleLeft = last + IDLE_MS - now;
      if (idleLeft <= 0) return signOut("idle");
      const absLeft = absoluteAt.current - now;
      const left = Math.min(idleLeft, absLeft);
      setWarnLeft(left <= WARN_MS ? left : null);
    }, 1000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(tick);
    };
  }, [ping, signOut]);

  const warnRef = useRef<number | null>(null);
  warnRef.current = warnLeft;

  if (warnLeft === null) return null;
  const secs = Math.ceil(warnLeft / 1000);
  const absoluteSoon = absoluteAt.current - Date.now() <= WARN_MS;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-stone-950/50 backdrop-blur-sm p-4" role="alertdialog" aria-modal="true" aria-labelledby="sess-title">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-center space-y-4">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="h-6 w-6" />
        </span>
        <div>
          <h2 id="sess-title" className="text-base font-semibold text-stone-900">
            {absoluteSoon ? "Your session is ending" : "Are you still there?"}
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            {absoluteSoon ? "For security, sessions last 12 hours. You'll be signed out in " : "You'll be signed out for inactivity in "}
            <span className="font-semibold tabular-nums text-stone-900">
              {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
            </span>
            .
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => signOut("idle")} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
          {!absoluteSoon && (
            <button autoFocus onClick={stay} className="flex-1 rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white hover:bg-stone-800">
              Stay signed in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
