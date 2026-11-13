"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

/** Live countdown for a slot hold. Calls onExpire once when it reaches zero. */
export default function HoldTimer({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const target = new Date(expiresAt).getTime();
  const [left, setLeft] = useState(() => Math.max(0, target - Date.now()));

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    let fired = false;
    const tick = () => {
      const ms = Math.max(0, target - Date.now());
      setLeft(ms);
      if (ms === 0 && !fired) {
        fired = true;
        onExpire();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, onExpire]);

  if (!Number.isFinite(target)) return null;
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const urgent = left < 5 * 60000;
  return (
    <span
      role="timer"
      aria-live="off"
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
        urgent ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-white/80 text-emerald-800"
      }`}
    >
      <Timer className="h-3 w-3" /> Held {m}:{String(s).padStart(2, "0")}
    </span>
  );
}
