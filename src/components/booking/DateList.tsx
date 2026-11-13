"use client";

import React, { useMemo } from "react";
import { ChevronDown, Sun, Sunrise, Sunset, Flame } from "lucide-react";

export type OpenSlot = {
  slot_id: string;
  slot_date: string; // YYYY-MM-DD (IST)
  display_date: string;
  start_time: string; // "07:00 AM"
  end_time: string;
  spots_left: number;
};

const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", ...opts });

const hour24 = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim());
  if (!m) return 0;
  const h = Number(m[1]) % 12;
  return m[3].toUpperCase() === "PM" ? h + 12 : h;
};

const PERIODS = [
  { key: "Morning", test: (h: number) => h < 12, icon: Sunrise },
  { key: "Afternoon", test: (h: number) => h >= 12 && h < 16, icon: Sun },
  { key: "Evening", test: (h: number) => h >= 16, icon: Sunset },
] as const;

/**
 * Appointment-style availability: one row per bookable day (no calendar grid).
 * Opening a day reveals its times grouped by part of day.
 */
export default function DateList({
  slots,
  openDate,
  onOpenDate,
  pickedSlotId,
  onPick,
  maxDays = 14,
}: {
  slots: OpenSlot[];
  openDate: string;
  onOpenDate: (d: string) => void;
  pickedSlotId: string;
  onPick: (s: OpenSlot) => void;
  maxDays?: number;
}) {
  const days = useMemo(() => {
    const map = new Map<string, OpenSlot[]>();
    for (const s of slots) {
      if (!map.has(s.slot_date)) map.set(s.slot_date, []);
      map.get(s.slot_date)!.push(s);
    }
    return Array.from(map.entries()).slice(0, maxDays);
  }, [slots, maxDays]);

  const today = istToday();
  const tomorrow = addDays(today, 1);

  return (
    <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
      {days.map(([date, list]) => {
        const open = date === openDate;
        const spots = list.reduce((n, s) => n + s.spots_left, 0);
        const relative = date === today ? "Today" : date === tomorrow ? "Tomorrow" : fmt(date, { weekday: "long" });
        const hasPick = list.some((s) => s.slot_id === pickedSlotId);
        const picked = list.find((s) => s.slot_id === pickedSlotId);
        return (
          <li key={date}>
            <button
              type="button"
              onClick={() => onOpenDate(open ? "" : date)}
              aria-expanded={open}
              aria-controls={`day-${date}`}
              className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition ${open ? "bg-amber-50/60" : "hover:bg-stone-50"}`}
            >
              <span
                className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border ${
                  hasPick ? "border-amber-600 bg-amber-600 text-white" : "border-stone-200 bg-stone-50 text-stone-800"
                }`}
              >
                <span className="text-[9px] font-semibold uppercase leading-none tracking-wider opacity-80">{fmt(date, { month: "short" })}</span>
                <span className="text-lg font-bold leading-tight">{fmt(date, { day: "numeric" })}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                  {relative}
                  {spots <= 3 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 border border-red-100">
                      <Flame className="h-3 w-3" /> Filling fast
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-stone-500">
                  {picked ? (
                    <span className="font-semibold text-amber-800">Selected · {picked.start_time}</span>
                  ) : (
                    <>
                      {list.length} time{list.length === 1 ? "" : "s"} available · from {list[0].start_time}
                    </>
                  )}
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
              <div id={`day-${date}`} className="space-y-3 bg-stone-50/60 px-3.5 pb-4 pt-1">
                {PERIODS.map(({ key, test, icon: Icon }) => {
                  const group = list.filter((s) => test(hour24(s.start_time)));
                  if (!group.length) return null;
                  return (
                    <div key={key}>
                      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                        <Icon className="h-3.5 w-3.5" /> {key}
                      </p>
                      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={`${relative} ${key} times`}>
                        {group.map((s) => {
                          const sel = s.slot_id === pickedSlotId;
                          return (
                            <button
                              key={s.slot_id}
                              type="button"
                              role="radio"
                              aria-checked={sel}
                              onClick={() => onPick(s)}
                              className={`rounded-xl border px-2 py-2 text-center transition ${
                                sel ? "border-amber-600 bg-amber-600 text-white shadow-sm" : "border-stone-200 bg-white text-stone-800 hover:border-amber-400"
                              }`}
                            >
                              <span className="block text-xs font-semibold">{s.start_time}</span>
                              <span className={`block text-[10px] ${sel ? "text-amber-50" : s.spots_left <= 2 ? "text-red-600" : "text-stone-400"}`}>
                                {s.spots_left} spot{s.spots_left === 1 ? "" : "s"} left
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
