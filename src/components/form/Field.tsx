"use client";

import React from "react";
import { AlertCircle, Lock } from "lucide-react";
import { formatNational } from "@/lib/validation";

const base =
  "w-full rounded-xl border text-sm px-3.5 py-2.5 text-stone-900 placeholder:text-stone-400 font-medium transition outline-none focus:bg-white focus:ring-4";
export const inputClass = (error?: string | null) =>
  `${base} ${
    error
      ? "border-red-500 bg-red-50/40 focus:border-red-500 focus:ring-red-100"
      : "border-stone-200 bg-stone-50 focus:border-amber-600 focus:ring-amber-100"
  }`;

/** Label + control + inline error / hint. Pass the control as children. */
export function Field({
  id,
  label,
  required = true,
  error,
  hint,
  children,
  className = "",
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className} data-field={id}>
      <label htmlFor={id} className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
        {label} {required ? <span className="text-red-600">*</span> : <span className="normal-case font-normal text-stone-400">(optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 flex items-start gap-1 text-[11px] font-medium text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-stone-400">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Indian mobile input. "+91" is a fixed visual prefix, NOT part of the value,
 * so it can never get stuck or be re-inserted while deleting. `value` is the
 * 10 national digits; pasted "+91 …", "91…" or "0…" numbers are normalised.
 */
export function PhoneField({
  id,
  value,
  onChange,
  onBlur,
  error,
  locked,
  lockedDisplay,
  placeholder = "98201 12345",
}: {
  id: string;
  value: string;
  onChange: (digits: string) => void;
  onBlur?: () => void;
  error?: string | null;
  locked?: boolean;
  lockedDisplay?: string;
  placeholder?: string;
}) {
  if (locked) {
    return (
      <div className="relative">
        <input
          id={id}
          readOnly
          value={lockedDisplay || `+91 ${formatNational(value)}`}
          className="w-full rounded-xl border border-stone-300 bg-stone-100 text-sm px-3.5 py-2.5 pr-24 text-stone-700 font-medium cursor-not-allowed"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
          <Lock className="h-3 w-3" aria-hidden /> Verified
        </span>
      </div>
    );
  }

  const handle = (raw: string) => {
    let d = raw.replace(/\D/g, "");
    if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
    else if (d.length > 10 && d.startsWith("0")) d = d.slice(1);
    onChange(d.slice(0, 10));
  };

  return (
    <div className={`flex items-stretch rounded-xl ${error ? "ring-0" : ""}`}>
      <span
        aria-hidden
        className={`inline-flex items-center rounded-l-xl border border-r-0 px-3 text-sm font-semibold select-none ${
          error ? "border-red-500 bg-red-50 text-red-700" : "border-stone-200 bg-stone-100 text-stone-600"
        }`}
      >
        +91
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={11}
        value={formatNational(value)}
        onChange={(e) => handle(e.target.value)}
        onPaste={(e) => {
          e.preventDefault();
          handle(e.clipboardData.getData("text"));
        }}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputClass(error)} rounded-l-none tracking-wide`}
      />
    </div>
  );
}

/** Digits-only input for small numbers (no "e", "+", "-", scroll-wheel changes). */
export function NumberInput({
  id,
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  suffix,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string | null;
  placeholder?: string;
  suffix: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        maxLength={3}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 3))}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputClass(error)} pr-10`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-400">{suffix}</span>
    </div>
  );
}
