"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ArrowRight, Loader2, MapPin, Phone, Camera, Check, AlertCircle, ShieldCheck, Baby } from "lucide-react";
import { Field, NumberInput, PhoneField, inputClass } from "@/components/form/Field";
import {
  ACTIVITIES,
  BLOOD_GROUPS,
  FIELD_STEP,
  LEVELS,
  LIMITS,
  ageOn,
  formatNational,
  toNationalMobile,
  validateRegistration,
  type FieldErrors,
  type RegistrationInput,
} from "@/lib/validation";

type Key = keyof RegistrationInput;

const ACTIVITY_INFO: Record<(typeof ACTIVITIES)[number], string> = {
  "Riding Lessons": "Structured arena sessions",
  "Trail Ride": "Beach & countryside",
  "Joy Ride": "Relaxed guided ride",
  Photoshoot: "Costume & horse session",
};

function toActivity(v: string): (typeof ACTIVITIES)[number] {
  const s = v.toLowerCase();
  if (/trail|beach|coastal/.test(s)) return "Trail Ride";
  if (/photo/.test(s)) return "Photoshoot";
  if (/joy|experience/.test(s)) return "Joy Ride";
  return "Riding Lessons";
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const STEP_TITLES = ["Rider Info", "Emergency", "Agreement"] as const;

export default function RegistrationPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [orderId, setOrderId] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState("/checkout");
  const [lockedPhone, setLockedPhone] = useState<string | null>(null); // raw digits from a WhatsApp booking link
  const [touched, setTouched] = useState<Partial<Record<Key, boolean>>>({});
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  const [form, setForm] = useState<RegistrationInput>({
    activity: "Riding Lessons",
    level: "Beginner",
    fullName: "",
    address: "",
    mobileNumber: "",
    email: "",
    occupation: "",
    dateOfBirth: "",
    heightCm: "",
    weightKg: "",
    bloodGroup: "",
    emergencyContactPerson: "",
    emergencyContactNumber: "",
    familyPhysician: "",
    guardianName: "",
    medicalFitnessConfirmed: false,
    safetyRulesAcknowledged: false,
    indemnityAccepted: false,
    mediaConsentGranted: false, // consent must stay an explicit opt-in
    digitalSignatureName: "",
  });

  // Autofill from the WhatsApp booking link.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const phone = (p.get("phone") || p.get("mobile") || "").replace(/\D/g, "");
    const name = (p.get("name") || p.get("fullName") || "").trim().slice(0, LIMITS.nameMax);
    const service = p.get("service") || p.get("activity") || "";
    const level = p.get("level") || "";
    const order = p.get("orderId") || p.get("order_id") || "";
    const hasOrder = /^[0-9a-f-]{36}$/i.test(order);
    if (hasOrder) setOrderId(order);
    if (hasOrder && phone.length >= 10) setLockedPhone(phone);
    setForm((f) => ({
      ...f,
      ...(phone && !hasOrder ? { mobileNumber: toNationalMobile(phone) || phone.slice(-10) } : {}),
      ...(hasOrder && phone ? { mobileNumber: phone } : {}),
      ...(name ? { fullName: name } : {}),
      ...(service ? { activity: toActivity(service) } : {}),
      ...(LEVELS.includes(level as any) ? { level } : {}),
    }));
  }, []);

  const age = useMemo(() => ageOn(form.dateOfBirth), [form.dateOfBirth]);
  const isMinor = age !== null && age >= 0 && age < 18;

  const errors = useMemo(() => {
    const e = validateRegistration(form, { phoneVerified: Boolean(lockedPhone) });
    // A server error stays until the user edits that field.
    return { ...serverErrors, ...e } as FieldErrors;
  }, [form, lockedPhone, serverErrors]);

  const show = (k: Key) => (touched[k] || attempted[FIELD_STEP[k]] ? errors[k] || null : null);

  const set = <K extends Key>(k: K, v: RegistrationInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (serverErrors[k]) setServerErrors(({ [k]: _drop, ...rest }) => rest);
  };
  const touch = (k: Key) => () => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
  const text = (k: Key) => ({
    id: k,
    name: k,
    value: form[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as any),
    onBlur: touch(k),
    "aria-invalid": Boolean(show(k)),
    "aria-describedby": show(k) ? `${k}-error` : undefined,
    className: inputClass(show(k)),
  });

  const fieldsOn = (s: number) => (Object.keys(FIELD_STEP) as Key[]).filter((k) => FIELD_STEP[k] === s && errors[k]);

  const focusFirstError = (keys: Key[]) => {
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${keys[0]}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLElement>("input, textarea, button")?.focus({ preventScroll: true });
    });
  };

  const goNext = () => {
    setBanner(null);
    const bad = fieldsOn(step);
    if (bad.length) {
      setAttempted((a) => ({ ...a, [step]: true }));
      setBanner(`Please fix ${bad.length} highlighted field${bad.length > 1 ? "s" : ""} to continue.`);
      focusFirstError(bad);
      return;
    }
    setStep((s) => (s < 3 ? ((s + 1) as 2 | 3) : s));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setBanner(null);
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2) : s));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (step < 3) return goNext();
    setBanner(null);

    const all = (Object.keys(FIELD_STEP) as Key[]).filter((k) => errors[k]);
    if (all.length) {
      setAttempted({ 1: true, 2: true, 3: true });
      const first = Math.min(...all.map((k) => FIELD_STEP[k])) as 1 | 2 | 3;
      setStep(first);
      setBanner("Some details are missing or invalid. Please check the highlighted fields.");
      focusFirstError(all.filter((k) => FIELD_STEP[k] === first));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, guardianName: isMinor ? form.guardianName : "", orderId: orderId || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        if (typeof json.checkoutUrl === "string" && json.checkoutUrl.startsWith("/checkout")) setCheckoutUrl(json.checkoutUrl);
        setSubmitted(true);
        window.scrollTo({ top: 0 });
        return;
      }
      if (json.fieldErrors && typeof json.fieldErrors === "object") {
        const fe = json.fieldErrors as FieldErrors;
        setServerErrors(fe);
        setAttempted({ 1: true, 2: true, 3: true });
        const keys = Object.keys(fe) as Key[];
        if (keys.length) {
          const first = Math.min(...keys.map((k) => FIELD_STEP[k] || 3)) as 1 | 2 | 3;
          setStep(first);
          focusFirstError(keys.filter((k) => FIELD_STEP[k] === first));
        }
      }
      setBanner(json.error || "Unable to submit registration. Please check your details.");
    } catch {
      setBanner("Network connection issue. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const signer = isMinor ? form.guardianName.trim() || "the parent / guardian" : form.fullName.trim() || "the rider";
  const displayPhone = lockedPhone ? `+${lockedPhone.length === 10 ? "91" + lockedPhone : lockedPhone}` : `+91 ${formatNational(form.mobileNumber)}`;

  return (
    <div className="min-h-screen bg-[#FBFBFA] text-stone-900 flex flex-col justify-center items-center p-3 sm:p-6 font-sans">
      <div className="w-full max-w-lg bg-white border border-stone-200/90 rounded-3xl shadow-sm overflow-hidden flex flex-col">
        <div className="bg-white px-6 pt-6 pb-4 border-b border-stone-100 text-center">
          <img src="/assets/gec_logo.png" alt="Gorai Equestrian Centre" className="mx-auto h-20 w-20 object-contain drop-shadow-sm mb-3" />
          <h1 className="text-base font-semibold tracking-wide text-stone-900 uppercase">Gorai Equestrian Centre</h1>
          <p className="text-xs text-stone-500 mt-0.5">Rider Registration &amp; Safety Agreement</p>
        </div>

        {!submitted && (
          <div className="px-6 pt-4 pb-3 bg-stone-50/70 border-b border-stone-100">
            <ol className="flex items-center justify-between text-[11px] font-medium text-stone-500 mb-2">
              {STEP_TITLES.map((t, i) => {
                const n = i + 1;
                const done = step > n;
                return (
                  <li key={t} className={`flex items-center gap-1.5 ${step >= n ? "text-amber-800 font-semibold" : ""}`} aria-current={step === n ? "step" : undefined}>
                    <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${done ? "bg-amber-600 text-white" : step === n ? "border-2 border-amber-600" : "border border-stone-300"}`}>
                      {done ? <Check className="h-3 w-3" /> : n}
                    </span>
                    {t}
                  </li>
                );
              })}
            </ol>
            <div className="h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
              <div className="h-full bg-amber-600 transition-all duration-300 rounded-full" style={{ width: `${(step / 3) * 100}%` }} />
            </div>
          </div>
        )}

        {!submitted ? (
          <form ref={formRef} onSubmit={submit} noValidate className="p-5 sm:p-6 space-y-5 flex-1">
            {banner && (
              <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> <span>{banner}</span>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div data-field="activity">
                  <p className="block text-xs font-semibold text-stone-800 uppercase tracking-wider mb-2">
                    Activity <span className="text-red-600">*</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Activity">
                    {ACTIVITIES.map((a) => {
                      const sel = form.activity === a;
                      return (
                        <button
                          key={a}
                          type="button"
                          role="radio"
                          aria-checked={sel}
                          onClick={() => set("activity", a)}
                          className={`p-2.5 rounded-xl text-left border transition text-xs ${
                            sel ? "bg-amber-50/80 border-amber-600 ring-1 ring-amber-600 font-semibold" : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100/70"
                          }`}
                        >
                          <span className="flex items-center justify-between">
                            {a} {sel && <Check className="h-3 w-3 text-amber-600" />}
                          </span>
                          <span className="block text-[10px] text-stone-400 font-normal mt-0.5">{ACTIVITY_INFO[a]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div data-field="level">
                  <p className="block text-xs font-semibold text-stone-800 uppercase tracking-wider mb-2">
                    Riding Experience <span className="text-red-600">*</span>
                  </p>
                  <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Riding experience">
                    {LEVELS.map((l) => (
                      <button
                        key={l}
                        type="button"
                        role="radio"
                        aria-checked={form.level === l}
                        onClick={() => set("level", l)}
                        className={`py-2 rounded-xl border text-xs font-medium transition ${
                          form.level === l ? "bg-stone-900 text-white border-stone-900" : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <Field id="fullName" label="Rider's Full Name" error={show("fullName")}>
                  <input {...text("fullName")} autoComplete="name" maxLength={LIMITS.nameMax} placeholder="As per ID proof" />
                </Field>

                <Field id="mobileNumber" label="Mobile Number" error={show("mobileNumber")} hint={lockedPhone ? "Linked to your WhatsApp booking." : undefined}>
                  <PhoneField
                    id="mobileNumber"
                    value={form.mobileNumber}
                    onChange={(d) => set("mobileNumber", d)}
                    onBlur={touch("mobileNumber")}
                    error={show("mobileNumber")}
                    locked={Boolean(lockedPhone)}
                    lockedDisplay={displayPhone}
                  />
                </Field>

                <Field id="email" label="Email Address" error={show("email")}>
                  <input {...text("email")} type="email" inputMode="email" autoComplete="email" maxLength={100} placeholder="name@example.com" />
                </Field>

                <Field id="address" label="Residential Address" error={show("address")}>
                  <textarea {...text("address")} rows={2} maxLength={LIMITS.addressMax} autoComplete="street-address" placeholder="Flat / building, street, area, city" />
                </Field>

                <Field id="occupation" label="Occupation" error={show("occupation")}>
                  <input {...text("occupation")} maxLength={60} placeholder="e.g. Student, Engineer" />
                </Field>

                <Field
                  id="dateOfBirth"
                  label="Date of Birth"
                  error={show("dateOfBirth")}
                  hint={
                    age !== null && age >= 0 ? (
                      <span className={`inline-flex items-center gap-1 font-medium ${isMinor ? "text-amber-700" : "text-stone-500"}`}>
                        {isMinor && <Baby className="h-3.5 w-3.5" />} Age {age}
                        {isMinor ? " · Minor — a parent / guardian must sign in step 2." : ""}
                      </span>
                    ) : undefined
                  }
                >
                  <input {...text("dateOfBirth")} type="date" min="1930-01-01" max={todayIso()} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field id="heightCm" label="Height" error={show("heightCm")}>
                    <NumberInput id="heightCm" value={form.heightCm} onChange={(v) => set("heightCm", v)} onBlur={touch("heightCm")} error={show("heightCm")} placeholder="165" suffix="cm" />
                  </Field>
                  <Field id="weightKg" label="Weight" error={show("weightKg")}>
                    <NumberInput id="weightKg" value={form.weightKg} onChange={(v) => set("weightKg", v)} onBlur={touch("weightKg")} error={show("weightKg")} placeholder="60" suffix="kg" />
                  </Field>
                </div>

                <div data-field="bloodGroup">
                  <p className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                    Blood Group <span className="text-red-600">*</span>
                  </p>
                  <div className={`grid grid-cols-3 sm:grid-cols-5 gap-1.5 rounded-xl ${show("bloodGroup") ? "p-1.5 ring-1 ring-red-500 bg-red-50/40" : ""}`} role="radiogroup" aria-label="Blood group">
                    {BLOOD_GROUPS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        role="radio"
                        aria-checked={form.bloodGroup === b}
                        onClick={() => {
                          set("bloodGroup", b);
                          touch("bloodGroup")();
                        }}
                        className={`py-1.5 rounded-lg text-xs font-medium border transition ${
                          form.bloodGroup === b ? "bg-amber-600 text-white border-amber-600" : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100"
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                  {show("bloodGroup") && (
                    <p id="bloodGroup-error" role="alert" className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-600">
                      <AlertCircle className="h-3.5 w-3.5" /> {show("bloodGroup")}
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <Field id="emergencyContactPerson" label="Emergency Contact Name" error={show("emergencyContactPerson")}>
                  <input {...text("emergencyContactPerson")} maxLength={LIMITS.nameMax} placeholder="Parent / spouse / relative" />
                </Field>
                <Field id="emergencyContactNumber" label="Emergency Contact Number" error={show("emergencyContactNumber")}>
                  <PhoneField
                    id="emergencyContactNumber"
                    value={form.emergencyContactNumber}
                    onChange={(d) => set("emergencyContactNumber", d)}
                    onBlur={touch("emergencyContactNumber")}
                    error={show("emergencyContactNumber")}
                  />
                </Field>
                <Field id="familyPhysician" label="Family Doctor" error={show("familyPhysician")} hint="Write “None” if you don't have one.">
                  <input {...text("familyPhysician")} maxLength={100} placeholder="Doctor's name" />
                </Field>

                {isMinor ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3 animate-[fadeIn_.25s_ease-out]">
                    <p className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                      <Baby className="h-4 w-4" /> Rider is {age} — parent / guardian consent required
                    </p>
                    <Field id="guardianName" label="Parent / Guardian Full Name" error={show("guardianName")}>
                      <input {...text("guardianName")} maxLength={LIMITS.nameMax} placeholder="Full legal name of parent / guardian" />
                    </Field>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] text-stone-500">
                    <ShieldCheck className="h-4 w-4 text-stone-400" /> Rider is an adult — no guardian consent needed.
                  </p>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                {(
                  [
                    ["medicalFitnessConfirmed", "Medical Fitness", "I confirm the rider does not suffer from heart disorders, epilepsy, severe asthma, spinal conditions, or pregnancy.", true],
                    ["safetyRulesAcknowledged", "Safety Guidelines", "The rider will wear an approved helmet and closed footwear, and follow instructor commands at all times.", true],
                    ["indemnityAccepted", "Indemnity & Waiver", "I understand horse riding involves inherent risk and participation is voluntary and at the rider's own risk.", true],
                    ["mediaConsentGranted", "Media Consent", "Permission to photograph / film for GEC social channels and archives.", false],
                  ] as const
                ).map(([k, title, body, req]) => (
                  <div key={k} data-field={k}>
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                        show(k) ? "border-red-500 bg-red-50/40" : form[k] ? "border-amber-300 bg-amber-50/40" : "border-stone-200 bg-stone-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form[k] as boolean}
                        onChange={(e) => {
                          set(k, e.target.checked as any);
                          touch(k)();
                        }}
                        aria-invalid={Boolean(show(k))}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 accent-amber-600"
                      />
                      <span className="text-xs text-stone-700 leading-relaxed">
                        <strong>
                          {title} {req ? <span className="text-red-600">*</span> : <span className="font-normal text-stone-400">(optional)</span>}:
                        </strong>{" "}
                        {body}
                      </span>
                    </label>
                    {show(k) && (
                      <p role="alert" className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-600">
                        <AlertCircle className="h-3.5 w-3.5" /> {show(k)}
                      </p>
                    )}
                  </div>
                ))}

                <Field
                  id="digitalSignatureName"
                  label={isMinor ? "Guardian's Digital Signature" : "Digital Signature"}
                  error={show("digitalSignatureName")}
                  hint={`Type the full name of ${signer} to sign · ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
                >
                  <input {...text("digitalSignatureName")} maxLength={LIMITS.nameMax} placeholder="Type full legal name" className={`${inputClass(show("digitalSignatureName"))} italic`} />
                </Field>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {step > 1 && (
                <button type="button" onClick={goBack} className="w-1/3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium py-3 rounded-xl text-xs transition">
                  Back
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm shadow-sm flex items-center justify-center gap-2 transition"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
                  </>
                ) : step < 3 ? (
                  <>
                    Continue to {STEP_TITLES[step as 1 | 2]} <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  "Sign & Complete Registration"
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 text-center space-y-5 flex-1">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-stone-900">Registration Complete</h2>
              <p className="text-xs text-stone-500 mt-1">Your rider record and safety waiver are saved.</p>
            </div>
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-left space-y-2">
              <Row k="Rider" v={form.fullName} />
              <Row k="Activity" v={`${form.activity} (${form.level})`} />
              <Row k="Mobile" v={displayPhone} />
              {isMinor && <Row k="Guardian" v={form.guardianName} />}
            </div>
            <a href={checkoutUrl} className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-xl text-sm shadow-sm flex items-center justify-center gap-2 transition">
              {orderId ? "Continue to Secure Payment" : "Book a Riding Session"} <ArrowRight className="h-4 w-4" />
            </a>
            <a href="/" className="inline-block text-xs text-stone-500 hover:text-stone-800 font-medium">
              Return to Home
            </a>
          </div>
        )}

        <div className="p-4 bg-stone-50 border-t border-stone-200/80 text-center text-[11px] text-stone-500 space-y-1">
          <div className="flex items-center justify-center gap-1.5">
            <MapPin className="h-3 w-3 text-stone-400" /> Khajuriwadi, Gorai, Mumbai – 400092
          </div>
          <div className="flex items-center justify-center gap-3">
            <a href="tel:+919322013233" className="flex items-center gap-1 hover:text-stone-800">
              <Phone className="h-3 w-3 text-stone-400" /> +91 93220 13233
            </a>
            <a href="https://instagram.com/gorai_equestrian_centre" target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-stone-800">
              <Camera className="h-3 w-3 text-stone-400" /> @gorai_equestrian_centre
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-stone-500">{k}</span>
      <span className="font-medium text-stone-900 text-right">{v}</span>
    </div>
  );
}
