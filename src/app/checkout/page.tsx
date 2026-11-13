"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Script from "next/script";
import {
  CheckCircle2,
  ShieldCheck,
  MapPin,
  Phone,
  Camera,
  Loader2,
  ArrowRight,
  ChevronLeft,
  Clock,
  Calendar,
  Printer,
  AlertCircle,
  Check,
  Pencil,
} from "lucide-react";
import PlanSheet, { inr, type Plan } from "@/components/booking/PlanSheet";
import DateList, { type OpenSlot } from "@/components/booking/DateList";
import HoldTimer from "@/components/booking/HoldTimer";
import { Field, PhoneField, inputClass } from "@/components/form/Field";
import { LIMITS, mobileError, nameError, toNationalMobile } from "@/lib/validation";

type Step = "plan" | "schedule" | "details";
type HeldSlot = { displayDate: string; startTime: string; endTime: string; holdExpiresAt?: string | null };

const SERVICE_IMAGES: Record<string, string> = {
  basic_course: "/assets/brochure_page_4.png",
  beginner_session: "/assets/brochure_page_5.png",
  experienced_session: "/assets/brochure_page_6.png",
  jumping_training: "/assets/brochure_page_7.png",
  trail_ride: "/assets/brochure_page_8.png",
  horse_experience: "/assets/brochure_page_9.png",
};
const imgFor = (code?: string) => (code && SERVICE_IMAGES[code]) || "/assets/brochure_page_4.png";

const STEPS: { id: Step; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "schedule", label: "Date & time" },
  { id: "details", label: "Details & pay" },
];

export default function CheckoutPage() {
  const [services, setServices] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [sheetPlan, setSheetPlan] = useState<Plan | null>(null);
  const [step, setStep] = useState<Step>("plan");

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState(""); // 10 national digits, or raw digits when locked
  const [lockedName, setLockedName] = useState(false);
  const [lockedPhone, setLockedPhone] = useState(false);
  const [lockedPlan, setLockedPlan] = useState(false);
  const [touched, setTouched] = useState<{ name?: boolean; phone?: boolean }>({});
  const [triedPay, setTriedPay] = useState(false);

  const [paymentStatus, setPaymentStatus] = useState<"IDLE" | "PROCESSING" | "PAID" | "FAILED">("IDLE");
  const [txDetails, setTxDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [orderId, setOrderId] = useState("");

  const [heldSlot, setHeldSlot] = useState<HeldSlot | null>(null);
  const [needsSlot, setNeedsSlot] = useState(false);
  const [openSlots, setOpenSlots] = useState<OpenSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [openDate, setOpenDate] = useState("");
  const [pickedSlotId, setPickedSlotId] = useState("");

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    try {
      const res = await fetch("/api/slots", { cache: "no-store" });
      const json = await res.json();
      const list: OpenSlot[] = json.success ? json.slots : [];
      setOpenSlots(list);
      setOpenDate((d) => (d && list.some((s) => s.slot_date === d) ? d : list[0]?.slot_date || ""));
      setPickedSlotId((id) => (list.some((s) => s.slot_id === id) ? id : ""));
    } catch {
      setOpenSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (needsSlot) loadSlots();
  }, [needsSlot, loadSlots]);

  const showReceipt = (json: any) => {
    setTxDetails({
      receiptNumber: json.receiptNumber,
      gatewayRef: json.gatewayRef,
      timestamp: new Date(json.paidAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      amount: json.amount,
      service: json.serviceTitle,
      schedule: json.schedule || null,
      needsStaff: Boolean(json.needsStaff),
    });
    setPaymentStatus("PAID");
  };

  // Bootstrap: URL autofill, existing booking lookup, service catalogue.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlOrderId = params.get("order_id") || params.get("orderId") || "";
    const urlName = (params.get("name") || "").trim().slice(0, LIMITS.nameMax);
    const urlPhone = (params.get("phone") || "").replace(/\D/g, "");
    const urlPlan = params.get("plan") || params.get("service") || "";

    if (urlOrderId) setOrderId(urlOrderId);
    if (urlName) {
      setCustomerName(urlName);
      setLockedName(true);
    }
    if (urlPhone) {
      const nat = toNationalMobile(urlPhone);
      setPhone(urlOrderId ? urlPhone : nat || urlPhone.slice(-10));
      setLockedPhone(Boolean(urlOrderId) || Boolean(nat));
    }

    let planFromUrl = false;
    const catalogue = fetch("/api/services")
      .then((r) => r.json())
      .then((json) => {
        const list: Plan[] = json.success ? json.data?.services || [] : [];
        setServices(list);
        const match = urlPlan && list.find((s) => s.service_code === urlPlan || s.title?.toLowerCase() === urlPlan.toLowerCase());
        if (match) {
          planFromUrl = true;
          setSelectedPlan((p) => p || match.service_code);
        }
      })
      .catch(() => setError("Could not load sessions. Please refresh the page."));

    const order =
      urlOrderId && urlPhone
        ? fetch(`/api/order-summary?orderId=${encodeURIComponent(urlOrderId)}&phone=${encodeURIComponent(urlPhone)}`, { cache: "no-store" })
            .then(async (res) => {
              const json = await res.json();
              if (!res.ok || !json.success) {
                setOrderId("");
                setNeedsSlot(true);
                setError(json.error || "This booking link has expired. You can start a new booking below.");
                return "plan" as Step;
              }
              if (json.paid) {
                showReceipt({ ...json.paid, serviceTitle: json.order.serviceTitle, schedule: json.slot ? `${json.slot.displayDate}, ${json.slot.startTime}` : null });
                return "details" as Step;
              }
              setSelectedPlan(json.order.serviceCode);
              setLockedPlan(true);
              if (json.order.customerName && !urlName) setCustomerName(json.order.customerName);
              if (json.slot && json.slot.status !== "EXPIRED" && json.slot.isFuture) {
                setHeldSlot({ displayDate: json.slot.displayDate, startTime: json.slot.startTime, endTime: json.slot.endTime, holdExpiresAt: json.slot.holdExpiresAt });
                return "details" as Step;
              }
              setNeedsSlot(true);
              if (json.slot) setNotice("Your earlier slot hold expired. Please pick a time again — it only takes a second.");
              return "schedule" as Step;
            })
            .catch(() => {
              setNeedsSlot(true);
              return "plan" as Step;
            })
        : Promise.resolve(null);

    if (!urlOrderId) setNeedsSlot(true);

    Promise.all([catalogue, order]).then(([, orderStep]) => {
      setStep(orderStep || (planFromUrl ? "schedule" : "plan"));
      setLoading(false);
    });
  }, []);

  const currentPlan = useMemo(() => services.find((s) => s.service_code === selectedPlan) || null, [services, selectedPlan]);
  const pickedSlot = useMemo(() => openSlots.find((s) => s.slot_id === pickedSlotId) || null, [openSlots, pickedSlotId]);
  const hasTime = Boolean((heldSlot && !needsSlot) || pickedSlot);

  const nameErr = lockedName ? null : nameError(customerName, "full name");
  const phoneErr = lockedPhone ? null : mobileError(phone, "WhatsApp number");
  const showNameErr = touched.name || triedPay ? nameErr : null;
  const showPhoneErr = touched.phone || triedPay ? phoneErr : null;

  const go = (s: Step) => {
    setError(null);
    setStep(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onHoldExpired = useCallback(() => {
    setHeldSlot(null);
    setPickedSlotId("");
    setNeedsSlot(true);
    setNotice("Your slot hold expired. Please choose a time again.");
    setStep("schedule");
  }, []);

  const handlePay = async () => {
    if (isSubmitting) return;
    setTriedPay(true);
    if (!currentPlan) return go("plan");
    if (!hasTime) return go("schedule");
    if (nameErr || phoneErr) {
      setError("Please fix the highlighted details.");
      return;
    }
    const Razorpay = (window as any).Razorpay;
    if (!razorpayReady || !Razorpay) {
      setError("Secure payment window is still loading. Please try again in a moment.");
      return;
    }

    setIsSubmitting(true);
    setPaymentStatus("PROCESSING");
    setError(null);
    setNotice(null);
    const fail = (message: string) => {
      setError(message);
      setPaymentStatus("FAILED");
      setIsSubmitting(false);
    };

    try {
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceCode: currentPlan.service_code,
          customerName: customerName.trim(),
          whatsappNumber: phone,
          participantsCount: 1,
          orderId: orderId || undefined,
          slotId: needsSlot ? pickedSlotId : undefined,
        }),
      });
      const order = await res.json();
      if (order.orderId) setOrderId(order.orderId);
      if (!res.ok || !order.success) {
        if (order.code === "REGISTRATION_REQUIRED" && order.registerUrl) {
          if (needsSlot && pickedSlot) {
            setHeldSlot({ displayDate: pickedSlot.display_date, startTime: pickedSlot.start_time, endTime: pickedSlot.end_time });
            setNeedsSlot(false);
          }
          setNotice("Slot held for 30 minutes. Taking you to the rider safety waiver…");
          setPaymentStatus("IDLE");
          setIsSubmitting(false);
          setTimeout(() => (window.location.href = order.registerUrl), 1500);
          return;
        }
        if (order.code === "SLOT_UNAVAILABLE" || order.code === "SLOT_REQUIRED") {
          setHeldSlot(null);
          setPickedSlotId("");
          setNeedsSlot(true);
          loadSlots();
          setStep("schedule");
        }
        return fail(order.error || "Unable to start payment. Please try again.");
      }
      if (order.slot) {
        setHeldSlot(order.slot);
        setNeedsSlot(false);
      }
      if (order.alreadyPaid) {
        showReceipt(order);
        setIsSubmitting(false);
        return;
      }
      if (order.gecOrderId) setOrderId(order.gecOrderId);

      const rzp = new Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        name: "Gorai Equestrian Centre",
        description: order.serviceTitle,
        image: "/assets/gec_logo.png",
        prefill: { name: order.prefill?.name, contact: order.prefill?.contact },
        notes: { gec_order_id: order.gecOrderId },
        theme: { color: "#d97706" },
        modal: { ondismiss: () => fail("Payment was cancelled. Your slot is still held — you can try again.") },
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            const vRes = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(response),
            });
            const v = await vRes.json();
            if (vRes.ok && v.success) {
              showReceipt(v);
              setIsSubmitting(false);
            } else fail(v.error || "Payment verification failed. Please contact GEC support.");
          } catch {
            fail("Payment done, but we could not reach our server to confirm it. Please contact GEC support with your payment ID: " + response.razorpay_payment_id);
          }
        },
      });
      rzp.on("payment.failed", (resp: any) => setError(resp?.error?.description || "Payment failed. Please try another method."));
      rzp.open();
    } catch {
      fail("Network connection issue. Please verify and try again.");
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const timeLabel = heldSlot && !needsSlot ? `${heldSlot.displayDate} · ${heldSlot.startTime}` : pickedSlot ? `${pickedSlot.display_date} · ${pickedSlot.start_time}` : null;

  // Sticky bar CTA per step.
  const cta = (() => {
    if (step === "plan") return { label: currentPlan ? "Continue to date & time" : "Select a plan", disabled: !currentPlan, onClick: () => go("schedule") };
    if (step === "schedule") return { label: hasTime ? "Continue to details" : "Pick a time", disabled: !hasTime, onClick: () => go("details") };
    return {
      label: isSubmitting ? "Processing…" : `Pay ${currentPlan ? inr(currentPlan.price_inr) : ""} & confirm`,
      disabled: isSubmitting || !currentPlan,
      onClick: handlePay,
    };
  })();

  return (
    <div className="min-h-screen bg-[#FBFBFA] text-stone-900 flex flex-col items-center p-3 sm:p-6 pb-32 font-sans">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onReady={() => setRazorpayReady(true)}
        onError={() => setError("Could not load the secure payment window. Please check your connection and refresh.")}
      />

      <div className="w-full max-w-lg bg-white border border-stone-200/90 rounded-3xl shadow-sm overflow-hidden flex flex-col">
        <header className="px-6 pt-5 pb-4 border-b border-stone-100 flex items-center gap-3">
          <img src="/assets/gec_logo.png" alt="Gorai Equestrian Centre" className="h-12 w-12 object-contain" />
          <div>
            <h1 className="text-sm font-semibold tracking-wide uppercase">Gorai Equestrian Centre</h1>
            <p className="text-xs text-stone-500">Book a ride · Beach &amp; countryside, Mumbai</p>
          </div>
        </header>

        {paymentStatus !== "PAID" && (
          <nav aria-label="Booking progress" className="px-5 py-3 bg-stone-50/70 border-b border-stone-100">
            <ol className="flex items-center gap-2">
              {STEPS.map((s, i) => {
                const done = i < stepIndex;
                const reachable = i <= stepIndex && !(s.id === "plan" && lockedPlan);
                return (
                  <li key={s.id} className="flex flex-1 items-center gap-2">
                    <button
                      type="button"
                      disabled={!reachable}
                      onClick={() => go(s.id)}
                      aria-current={s.id === step ? "step" : undefined}
                      className="flex items-center gap-1.5 text-[11px] font-semibold disabled:cursor-default"
                    >
                      <span
                        className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${
                          done ? "bg-amber-600 text-white" : s.id === step ? "border-2 border-amber-600 text-amber-800" : "border border-stone-300 text-stone-400"
                        }`}
                      >
                        {done ? <Check className="h-3 w-3" /> : i + 1}
                      </span>
                      <span className={s.id === step || done ? "text-stone-900" : "text-stone-400"}>{s.label}</span>
                    </button>
                    {i < STEPS.length - 1 && <span className={`h-px flex-1 ${done ? "bg-amber-600" : "bg-stone-200"}`} />}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        {paymentStatus !== "PAID" ? (
          <main className="p-5 sm:p-6 space-y-5 flex-1">
            {notice && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex gap-2">
                <Clock className="h-4 w-4 shrink-0" /> {notice}
              </div>
            )}
            {error && (
              <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            {loading ? (
              <div className="text-xs text-stone-500 py-10 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-amber-600" /> Loading available sessions…
              </div>
            ) : step === "plan" ? (
              <section aria-labelledby="plan-h" className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h2 id="plan-h" className="text-base font-semibold">Choose your riding experience</h2>
                  <span className="text-[11px] text-stone-400">{services.length} plans</span>
                </div>
                <ul className="space-y-2.5">
                  {services.map((p) => {
                    const sel = p.service_code === selectedPlan;
                    return (
                      <li key={p.service_code}>
                        <button
                          type="button"
                          onClick={() => setSheetPlan(p)}
                          className={`group flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition ${
                            sel ? "border-amber-600 bg-amber-50/50 ring-2 ring-amber-600/20" : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm"
                          }`}
                        >
                          <img src={imgFor(p.service_code)} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover object-top border border-stone-200/60" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[10px] font-semibold uppercase tracking-wider text-stone-500 truncate">{p.target_rider_level || "All riders"}</span>
                            <span className="block text-sm font-semibold text-stone-900 truncate">{p.title}</span>
                            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-stone-500">
                              <Clock className="h-3 w-3" /> {p.duration_minutes || 30} min · {p.sessions_count || 1} session
                            </span>
                          </span>
                          <span className="text-right">
                            <span className="block text-sm font-bold">{inr(p.price_inr)}</span>
                            <span className="text-[11px] font-medium text-amber-700 group-hover:underline">{sel ? "Selected" : "View"}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : step === "schedule" ? (
              <section aria-labelledby="sched-h" className="space-y-3">
                <PlanSummary plan={currentPlan} locked={lockedPlan} onChange={() => go("plan")} />
                <h2 id="sched-h" className="text-base font-semibold pt-1">Pick a date &amp; time</h2>
                {heldSlot && !needsSlot ? (
                  <HeldCard slot={heldSlot} onExpire={onHoldExpired} onChange={() => setNeedsSlot(true)} />
                ) : slotsLoading ? (
                  <div className="text-xs text-stone-500 py-8 flex items-center justify-center gap-2 bg-stone-50 rounded-2xl border border-stone-200">
                    <Loader2 className="h-4 w-4 animate-spin text-amber-600" /> Checking live availability…
                  </div>
                ) : openSlots.length === 0 ? (
                  <div className="text-xs text-stone-600 p-4 bg-stone-50 rounded-2xl border border-stone-200">
                    No online slots are open right now. Please call{" "}
                    <a className="font-semibold underline" href="tel:+919322013233">
                      +91 93220 13233
                    </a>{" "}
                    to book.
                  </div>
                ) : (
                  <>
                    <DateList
                      slots={openSlots}
                      openDate={openDate}
                      onOpenDate={setOpenDate}
                      pickedSlotId={pickedSlotId}
                      onPick={(s) => {
                        setPickedSlotId(s.slot_id);
                        setError(null);
                      }}
                    />
                    <p className="text-[11px] text-stone-400 text-center">Times shown in IST · availability updates live</p>
                  </>
                )}
              </section>
            ) : (
              <section aria-labelledby="det-h" className="space-y-4">
                <div className="rounded-2xl border border-stone-200 divide-y divide-stone-100">
                  <SummaryRow label="Plan" value={currentPlan?.title || "—"} onEdit={lockedPlan ? undefined : () => go("plan")} />
                  <SummaryRow
                    label="When"
                    value={timeLabel || "—"}
                    extra={heldSlot && !needsSlot && heldSlot.holdExpiresAt ? <HoldTimer expiresAt={heldSlot.holdExpiresAt} onExpire={onHoldExpired} /> : null}
                    onEdit={() => {
                      setNeedsSlot(true);
                      go("schedule");
                    }}
                  />
                </div>

                <h2 id="det-h" className="text-base font-semibold">Rider details</h2>
                <Field id="customerName" label="Full name" error={showNameErr} hint={lockedName ? "Verified from your booking." : undefined}>
                  <input
                    id="customerName"
                    value={customerName}
                    readOnly={lockedName}
                    maxLength={LIMITS.nameMax}
                    autoComplete="name"
                    onChange={(e) => setCustomerName(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                    placeholder="Rider's full name"
                    aria-invalid={Boolean(showNameErr)}
                    aria-describedby={showNameErr ? "customerName-error" : undefined}
                    className={lockedName ? "w-full rounded-xl border border-stone-300 bg-stone-100 text-sm px-3.5 py-2.5 text-stone-700 font-medium cursor-not-allowed" : inputClass(showNameErr)}
                  />
                </Field>
                <Field id="whatsapp" label="WhatsApp number" error={showPhoneErr} hint="Your receipt and directions are sent here.">
                  <PhoneField
                    id="whatsapp"
                    value={phone}
                    onChange={setPhone}
                    onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                    error={showPhoneErr}
                    locked={lockedPhone}
                    lockedDisplay={phone.length === 10 ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : `+${phone}`}
                  />
                </Field>

                {currentPlan && (
                  <div className="rounded-xl bg-stone-50 border border-stone-200/80 p-3.5 space-y-2 text-xs">
                    <div className="flex justify-between text-stone-600">
                      <span>{currentPlan.title} × 1</span>
                      <span className="font-medium text-stone-900">{inr(currentPlan.price_inr)}</span>
                    </div>
                    <div className="border-t border-stone-200 pt-2 flex justify-between text-sm font-semibold">
                      <span>Total payable</span>
                      <span className="font-bold">{inr(currentPlan.price_inr)}</span>
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-stone-400 text-center flex items-center justify-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Secure payment by Razorpay · UPI, cards, netbanking &amp; wallets
                </p>
              </section>
            )}
          </main>
        ) : (
          <Receipt tx={txDetails} name={customerName} />
        )}

        <footer className="p-4 bg-stone-50 border-t border-stone-200/80 text-center text-[11px] text-stone-500 space-y-1">
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
        </footer>
      </div>

      {/* Sticky summary + primary action */}
      {paymentStatus !== "PAID" && !loading && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
            {step !== "plan" && !(step === "schedule" && lockedPlan) && (
              <button
                type="button"
                aria-label="Back"
                onClick={() => go(step === "details" ? "schedule" : "plan")}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-stone-900">{currentPlan?.title || "No plan selected"}</p>
              <p className="truncate text-[11px] text-stone-500">{timeLabel || (currentPlan ? inr(currentPlan.price_inr) : "Choose a plan to begin")}</p>
            </div>
            <button
              type="button"
              onClick={cta.onClick}
              disabled={cta.disabled}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50 active:scale-[0.99]"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {cta.label}
              {!isSubmitting && step !== "details" && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {sheetPlan && (
        <PlanSheet
          plan={sheetPlan}
          image={imgFor(sheetPlan.service_code)}
          selected={sheetPlan.service_code === selectedPlan}
          onClose={() => setSheetPlan(null)}
          onChoose={() => {
            setSelectedPlan(sheetPlan.service_code);
            setSheetPlan(null);
            go("schedule");
          }}
        />
      )}
    </div>
  );
}

function PlanSummary({ plan, locked, onChange }: { plan: Plan | null; locked: boolean; onChange: () => void }) {
  if (!plan) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-2.5">
      <img src={imgFor(plan.service_code)} alt="" className="h-11 w-11 rounded-lg object-cover object-top" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{plan.title}</p>
        <p className="text-[11px] text-stone-500">
          {plan.duration_minutes || 30} min · {inr(plan.price_inr)}
        </p>
      </div>
      {!locked && (
        <button type="button" onClick={onChange} className="text-xs font-semibold text-amber-700 hover:underline">
          Change
        </button>
      )}
    </div>
  );
}

function HeldCard({ slot, onExpire, onChange }: { slot: HeldSlot; onExpire: () => void; onChange: () => void }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <Calendar className="h-4 w-4" /> {slot.displayDate}
        </span>
        {slot.holdExpiresAt ? <HoldTimer expiresAt={slot.holdExpiresAt} onExpire={onExpire} /> : <span className="text-[11px] font-semibold text-emerald-800">Held for you</span>}
      </div>
      <p className="text-xs text-emerald-900">
        {slot.startTime} – {slot.endTime}
      </p>
      <button type="button" onClick={onChange} className="text-xs font-semibold text-emerald-800 underline-offset-2 hover:underline">
        Choose a different time
      </button>
    </div>
  );
}

function SummaryRow({ label, value, extra, onEdit }: { label: string; value: string; extra?: React.ReactNode; onEdit?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <span className="w-12 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{label}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{value}</span>
      {extra}
      {onEdit && (
        <button type="button" onClick={onEdit} aria-label={`Change ${label.toLowerCase()}`} className="grid h-8 w-8 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Receipt({ tx, name }: { tx: any; name: string }) {
  return (
    <div className="p-6 text-center space-y-5 flex-1">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Booking Confirmed</h2>
        <p className="text-xs text-stone-500 mt-1">
          {tx?.needsStaff
            ? "Payment received. Your slot was released before payment completed — our team will call you to fix a time."
            : "Your session is scheduled. A receipt is on its way to your WhatsApp."}
        </p>
      </div>
      <div className="rounded-2xl bg-stone-50 border border-stone-200 p-4 text-left text-xs space-y-2.5">
        <Line k="Receipt No" v={<span className="font-mono">{tx?.receiptNumber}</span>} />
        <Line k="Rider" v={name} />
        <Line k="Session" v={tx?.service} />
        {tx?.schedule && <Line k="Ride time" v={tx.schedule} />}
        <Line k="Amount paid" v={<span className="font-bold text-emerald-700">{tx?.amount != null ? inr(tx.amount) : "—"}</span>} />
        <Line k="Paid on" v={tx?.timestamp} />
      </div>
      <div className="space-y-2.5">
        <button
          onClick={() => window.print()}
          className="w-full bg-white hover:bg-stone-50 text-stone-800 font-medium py-3 rounded-xl text-xs border border-stone-200 flex items-center justify-center gap-2 shadow-sm"
        >
          <Printer className="h-4 w-4 text-stone-600" /> Save / Print Slip
        </button>
        <a
          href={`https://wa.me/919322013233?text=${encodeURIComponent(`Hi GEC, I have confirmed my booking (${tx?.receiptNumber}) for ${name} (${tx?.service}).`)}`}
          target="_blank"
          rel="noreferrer"
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm"
        >
          Send Confirmation on WhatsApp
        </a>
        <a href="/" className="inline-block text-xs text-stone-500 hover:text-stone-800 pt-2 font-medium">
          Return to Home
        </a>
      </div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-stone-500">{k}</span>
      <span className="font-medium text-stone-900 text-right">{v}</span>
    </div>
  );
}
