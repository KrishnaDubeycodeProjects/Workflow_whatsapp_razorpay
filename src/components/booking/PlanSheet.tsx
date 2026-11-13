"use client";

import React, { useEffect, useRef } from "react";
import { X, Clock, Users, Layers, ShieldCheck, Check } from "lucide-react";

export type Plan = {
  service_code: string;
  title: string;
  price_inr: string | number;
  duration_minutes?: number;
  sessions_count?: number;
  target_rider_level?: string;
  description?: string;
};

export const inr = (v: string | number) => `₹${Number(v).toLocaleString("en-IN")}`;

const INCLUDED = ["Certified instructor throughout", "Helmet & safety gear provided", "Horse matched to your level"];

/** Full-screen plan detail view (mobile-first sheet, centred dialog on desktop). */
export default function PlanSheet({
  plan,
  image,
  selected,
  onClose,
  onChoose,
}: {
  plan: Plan;
  image: string;
  selected: boolean;
  onClose: () => void;
  onChoose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="plan-sheet-title">
      <div className="absolute inset-0 bg-stone-950/60 backdrop-blur-sm animate-[fadeIn_.2s_ease-out]" onClick={onClose} />
      <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white sm:h-[90vh] sm:max-w-lg sm:rounded-3xl shadow-2xl animate-[sheetUp_.28s_cubic-bezier(.2,.8,.2,1)]">
        <div className="relative h-[42vh] min-h-56 shrink-0 bg-stone-100">
          <img src={image} alt={plan.title} className="h-full w-full object-cover object-top" />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-stone-950/10 to-transparent" />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close plan details"
            className="absolute top-4 right-4 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-stone-800 shadow hover:bg-white"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
            <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider backdrop-blur">
              {plan.target_rider_level || "All riders"}
            </span>
            <h2 id="plan-sheet-title" className="mt-2 text-2xl font-semibold leading-tight">
              {plan.title}
            </h2>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat icon={<Clock className="h-4 w-4" />} label="Duration" value={`${plan.duration_minutes || 30} min`} />
            <Stat icon={<Layers className="h-4 w-4" />} label="Sessions" value={String(plan.sessions_count || 1)} />
            <Stat icon={<Users className="h-4 w-4" />} label="Per rider" value={inr(plan.price_inr)} />
          </div>

          {plan.description && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5">About this plan</h3>
              <p className="text-sm leading-relaxed text-stone-700">{plan.description}</p>
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">What's included</h3>
            <ul className="space-y-2">
              {INCLUDED.map((i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-stone-700">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                    <Check className="h-3 w-3" />
                  </span>
                  {i}
                </li>
              ))}
            </ul>
          </section>

          <p className="flex items-start gap-2 rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs text-stone-500">
            <ShieldCheck className="h-4 w-4 shrink-0 text-stone-400" />
            Your slot is held while you sign the safety waiver and pay. Price is confirmed by our server at checkout.
          </p>
        </div>

        <div className="shrink-0 border-t border-stone-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-stone-500">Total</p>
            <p className="text-lg font-bold text-stone-900">{inr(plan.price_inr)}</p>
          </div>
          <button
            type="button"
            onClick={onChoose}
            className="flex-1 rounded-xl bg-amber-600 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 active:scale-[0.99]"
          >
            {selected ? "Continue with this plan" : "Choose this plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5">
      <span className="mx-auto mb-1 grid h-7 w-7 place-items-center rounded-full bg-white text-amber-700 border border-stone-200">{icon}</span>
      <p className="text-[10px] uppercase tracking-wider text-stone-400">{label}</p>
      <p className="text-sm font-semibold text-stone-900">{value}</p>
    </div>
  );
}
