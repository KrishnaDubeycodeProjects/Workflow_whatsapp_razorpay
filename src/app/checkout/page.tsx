"use client";

import React, { useState, useEffect, useMemo } from "react";
import Script from "next/script";
import {
  CheckCircle2,
  ShieldCheck,
  Download,
  MapPin,
  Phone,
  Camera,
  Loader2,
  ArrowRight,
  Clock,
  Sparkles,
  Check,
  Calendar,
  User,
  ChevronDown,
  Layers,
  Printer
} from "lucide-react";

export default function MobileCheckoutPage() {
  const [services, setServices] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [whatsappNumber, setWhatsappNumber] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<"IDLE" | "PROCESSING" | "PAID" | "FAILED">("IDLE");
  const [txDetails, setTxDetails] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [razorpayReady, setRazorpayReady] = useState<boolean>(false);

  // Real brochure service images mapping
  const serviceImages: Record<string, string> = {
    basic_course: "/assets/brochure_page_4.png",
    beginner_session: "/assets/brochure_page_5.png",
    experienced_session: "/assets/brochure_page_6.png",
    jumping_training: "/assets/brochure_page_7.png",
    trail_ride: "/assets/brochure_page_8.png",
    horse_experience: "/assets/brochure_page_9.png",
  };

  const [orderId, setOrderId] = useState<string>("");
  const [isLockedName, setIsLockedName] = useState<boolean>(false);
  const [isLockedPhone, setIsLockedPhone] = useState<boolean>(false);
  const [isLockedPlan, setIsLockedPlan] = useState<boolean>(false);

  // Slot state: a hold that already exists (from WhatsApp) or a new pick on the website.
  type HeldSlot = { displayDate: string; startTime: string; endTime: string };
  type OpenSlot = { slot_id: string; slot_date: string; display_date: string; start_time: string; end_time: string; spots_left: number };
  const [heldSlot, setHeldSlot] = useState<HeldSlot | null>(null);
  const [needsSlot, setNeedsSlot] = useState<boolean>(false);
  const [openSlots, setOpenSlots] = useState<OpenSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState<boolean>(false);
  const [pickedDate, setPickedDate] = useState<string>("");
  const [pickedSlotId, setPickedSlotId] = useState<string>("");

  const loadSlots = async () => {
    setSlotsLoading(true);
    try {
      const res = await fetch("/api/slots", { cache: "no-store" });
      const json = await res.json();
      const list: OpenSlot[] = json.success ? json.slots : [];
      setOpenSlots(list);
      setPickedDate((d) => (d && list.some((s) => s.slot_date === d) ? d : list[0]?.slot_date || ""));
      setPickedSlotId((id) => (list.some((s) => s.slot_id === id) ? id : ""));
    } catch {
      setOpenSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  useEffect(() => {
    if (needsSlot) loadSlots();
  }, [needsSlot]);

  const slotDates = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of openSlots) if (!seen.has(s.slot_date)) seen.set(s.slot_date, s.display_date);
    return Array.from(seen.entries()).slice(0, 14);
  }, [openSlots]);
  const slotsForDate = useMemo(() => openSlots.filter((s) => s.slot_date === pickedDate), [openSlots, pickedDate]);

  const showReceipt = (json: any) => {
    setTxDetails({
      receiptNumber: json.receiptNumber,
      gatewayRef: json.gatewayRef,
      timestamp: new Date(json.paidAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      amount: json.amount,
      service: json.serviceTitle,
      schedule: json.schedule || null,
      needsStaff: Boolean(json.needsStaff),
    });
    setPaymentStatus("PAID");
  };

  // Fetch official services strictly from Neon DB & autofill from URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlOrderId = params.get("order_id") || params.get("orderId");
      const urlName = params.get("name");
      const urlPhone = params.get("phone");
      const urlPlan = params.get("plan") || params.get("service");

      if (urlOrderId) setOrderId(urlOrderId);
      if (urlName && urlName.trim()) {
        setCustomerName(decodeURIComponent(urlName.trim()));
        setIsLockedName(true);
      }
      if (urlPhone && urlPhone.trim()) {
        const d = urlPhone.replace(/\D/g, "");
        if (d.length === 10) setWhatsappNumber(`+91 ${d.slice(0, 5)} ${d.slice(5)}`);
        else if (d.length === 12 && d.startsWith("91")) setWhatsappNumber(`+91 ${d.slice(2, 7)} ${d.slice(7)}`);
        else setWhatsappNumber(urlPhone);
        setIsLockedPhone(true);
      }
      if (urlPlan) setSelectedPlan(decodeURIComponent(urlPlan));

      // Existing booking (from WhatsApp / waiver): lock the plan, show the held slot or a picker, or the receipt if paid.
      if (urlOrderId && urlPhone) {
        fetch(`/api/order-summary?orderId=${encodeURIComponent(urlOrderId)}&phone=${encodeURIComponent(urlPhone.replace(/\D/g, ""))}`, { cache: "no-store" })
          .then(async (res) => {
            const json = await res.json();
            if (!res.ok || !json.success) {
              setOrderId("");
              setNeedsSlot(true);
              setError(json.error || "This booking link has expired. You can start a new booking below.");
              return;
            }
            if (json.paid) {
              showReceipt({ ...json.paid, serviceTitle: json.order.serviceTitle, schedule: json.slot ? `${json.slot.displayDate}, ${json.slot.startTime}` : null });
              return;
            }
            setSelectedPlan(json.order.serviceCode);
            setIsLockedPlan(true);
            if (json.order.customerName && !urlName) setCustomerName(json.order.customerName);
            if (json.slot && json.slot.status !== "EXPIRED" && json.slot.isFuture) {
              setHeldSlot({ displayDate: json.slot.displayDate, startTime: json.slot.startTime, endTime: json.slot.endTime });
            } else {
              setNeedsSlot(true);
              if (json.slot) setError("Your earlier slot hold expired. Please pick a time again — it only takes a second.");
            }
          })
          .catch(() => setNeedsSlot(true));
      } else {
        setNeedsSlot(true);
      }
    }

    fetch("/api/services")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data?.services?.length > 0) {
          const list = json.data.services;
          setServices(list);
          if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const planParam = params.get("plan") || params.get("service");
            if (planParam && list.some((s: any) => s.service_code === planParam || s.title?.toLowerCase() === planParam.toLowerCase())) {
              const matched = list.find((s: any) => s.service_code === planParam || s.title?.toLowerCase() === planParam.toLowerCase());
              setSelectedPlan(matched.service_code);
              return;
            }
          }
          setSelectedPlan(list[0].service_code);
        }
      })
      .catch((e) => console.error("Error fetching services:", e))
      .finally(() => setLoading(false));
  }, []);

  const currentPlan = useMemo(() => {
    if (!services.length) return null;
    return services.find((s) => s.service_code === selectedPlan) || services[0];
  }, [services, selectedPlan]);

  const currentImg = useMemo(() => {
    if (!currentPlan) return "/assets/brochure_page_4.png";
    return serviceImages[currentPlan.service_code] || "/assets/brochure_page_4.png";
  }, [currentPlan]);

  // Phone number auto-formatter: formats into +91 XXXXX XXXXX cleanly
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, "");
    
    // If empty
    if (!digits) {
      setWhatsappNumber("");
      return;
    }

    // Format based on length
    let formatted = "";
    if (digits.startsWith("91") && digits.length > 2) {
      const national = digits.slice(2, 12);
      if (national.length <= 5) {
        formatted = `+91 ${national}`;
      } else {
        formatted = `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
      }
    } else {
      const national = digits.slice(0, 10);
      if (national.length <= 5) {
        formatted = `+91 ${national}`;
      } else {
        formatted = `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
      }
    }
    setWhatsappNumber(formatted);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomerName(e.target.value);
  };

  const isPhoneValid = useMemo(() => {
    const digits = whatsappNumber.replace(/\D/g, "");
    return digits.length === 10 || (digits.length === 12 && digits.startsWith("91"));
  }, [whatsappNumber]);

  const isNameValid = useMemo(() => {
    return customerName.trim().length >= 2;
  }, [customerName]);

  const handlePay = async () => {
    if (isSubmitting) return;

    if (!isNameValid) {
      setError("Please enter your full name (at least 2 characters).");
      return;
    }
    if (!isPhoneValid) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!currentPlan) {
      setError("Please select a session.");
      return;
    }
    if (needsSlot && !pickedSlotId) {
      setError("Please choose a date and time for your ride.");
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

    const fail = (message: string) => {
      setError(message);
      setPaymentStatus("FAILED");
      setIsSubmitting(false);
    };

    try {
      // STEP 1: server creates the Razorpay order (amount is priced server-side)
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceCode: currentPlan.service_code,
          customerName: customerName.trim(),
          whatsappNumber: whatsappNumber.replace(/\s+/g, ""),
          participantsCount: 1,
          orderId: orderId || undefined,
          slotId: needsSlot ? pickedSlotId : undefined,
        }),
      });
      const order = await res.json();
      if (order.orderId) setOrderId(order.orderId);
      if (!res.ok || !order.success) {
        if (order.code === "REGISTRATION_REQUIRED" && order.registerUrl) {
          // Slot is held server-side while the rider signs the waiver.
          if (needsSlot) {
            const s = openSlots.find((x) => x.slot_id === pickedSlotId);
            if (s) setHeldSlot({ displayDate: s.display_date, startTime: s.start_time, endTime: s.end_time });
            setNeedsSlot(false);
          }
          setError(order.error);
          setPaymentStatus("IDLE");
          setTimeout(() => (window.location.href = order.registerUrl), 1500);
          return;
        }
        if (order.code === "SLOT_UNAVAILABLE" || order.code === "SLOT_REQUIRED") {
          setHeldSlot(null);
          setPickedSlotId("");
          setNeedsSlot(true);
          loadSlots();
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
      if (order.gecOrderId) setOrderId(order.gecOrderId); // retries reuse the same booking

      // STEP 2: open the Razorpay Standard Checkout modal
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
        modal: {
          ondismiss: () => fail("Payment was cancelled. You can try again whenever you're ready."),
        },
        // STEP 3: send the three Razorpay fields to the server for signature verification
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
            } else {
              fail(v.error || "Payment verification failed. Please contact GEC support.");
            }
          } catch {
            fail("Payment done, but we could not reach our server to confirm it. Please contact GEC support with your payment ID: " + response.razorpay_payment_id);
          }
        },
      });
      rzp.on("payment.failed", (resp: any) => {
        // Razorpay keeps the modal open so the customer can retry; we just surface the reason.
        setError(resp?.error?.description || "Payment failed. Please try another method.");
      });
      rzp.open();
    } catch (e: any) {
      fail("Network connection issue. Please verify and try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[#FBFBFA] text-stone-900 flex flex-col justify-center items-center p-3 sm:p-6 font-sans">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onReady={() => setRazorpayReady(true)}
        onError={() => setError("Could not load the secure payment window. Please check your connection and refresh.")}
      />
      <div className="w-full max-w-lg bg-white border border-stone-200/90 rounded-3xl shadow-sm overflow-hidden flex flex-col">
        {/* Brand Header */}
        <div className="bg-white px-6 pt-6 pb-4 border-b border-stone-100 text-center">
          <div className="flex justify-center mb-3">
            <img
              src="/assets/gec_logo.png"
              alt="Gorai Equestrian Centre Logo"
              className="h-20 w-20 object-contain drop-shadow-sm"
            />
          </div>
          <h1 className="text-base font-semibold tracking-wide text-stone-900 uppercase">
            Gorai Equestrian Centre
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Beach & Countryside Riding · Gorai, Mumbai
          </p>
        </div>

        {paymentStatus !== "PAID" ? (
          <div className="p-5 sm:p-6 space-y-5 flex-1">
            {error && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                {error}
              </div>
            )}

            {/* INTERACTIVE EXPERIENCE SELECTOR */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-stone-800 uppercase tracking-wider">
                  Select Riding Experience
                </label>
                <span className="text-[11px] text-stone-400">
                  {services.length} options available
                </span>
              </div>

              {loading || !currentPlan ? (
                <div className="text-xs text-stone-500 py-6 flex items-center justify-center gap-2 bg-stone-50 rounded-2xl border border-stone-200">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" /> Loading available sessions...
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Select Options Grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {services.filter((item) => !isLockedPlan || item.service_code === currentPlan.service_code).map((item) => {
                      const isSelected = item.service_code === currentPlan.service_code;
                      const thumb = serviceImages[item.service_code] || "/assets/brochure_page_4.png";
                      return (
                        <button
                          key={item.service_code}
                          type="button"
                          onClick={() => {
                            if (isLockedPlan) return;
                            setSelectedPlan(item.service_code);
                            setError(null);
                          }}
                          className={`relative text-left p-3 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                            isSelected
                              ? "bg-amber-50/60 border-amber-600 ring-2 ring-amber-600/30 shadow-sm"
                              : "bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50/50"
                          }`}
                        >
                          {isSelected && (
                            <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-amber-600 text-white flex items-center justify-center">
                              <Check className="h-2.5 w-2.5 stroke-[3]" />
                            </span>
                          )}

                          <div className="flex items-center gap-2 mb-2">
                            <img
                              src={thumb}
                              alt=""
                              className="h-8 w-8 rounded-lg object-cover border border-stone-200/60"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-semibold text-stone-500 uppercase block truncate">
                                {item.target_rider_level || "All Riders"}
                              </span>
                              <span className="text-xs font-semibold text-stone-900 block truncate">
                                {item.title}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-baseline justify-between pt-1 border-t border-stone-100">
                            <span className="text-[10px] text-stone-500">
                              {item.duration_minutes || 30}m
                            </span>
                            <span className="text-xs font-bold text-stone-900">
                              ₹{parseFloat(item.price_inr).toLocaleString("en-IN")}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Active Selected Card Preview */}
            {currentPlan && (
              <div className="rounded-2xl overflow-hidden border border-stone-200 bg-white shadow-sm">
                <div className="relative h-44 w-full bg-stone-100">
                  <img
                    src={currentImg}
                    alt={currentPlan.title}
                    className="h-full w-full object-cover object-top"
                  />
                  <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm border border-stone-200 text-stone-900 font-bold px-3 py-1 rounded-full text-xs shadow-sm">
                    ₹{parseFloat(currentPlan.price_inr).toLocaleString("en-IN")}
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-stone-900 text-sm">{currentPlan.title}</h3>
                    <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-md">
                      {currentPlan.target_rider_level || "All Riders"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-stone-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-stone-400" />
                      {currentPlan.duration_minutes || 30} mins
                    </span>
                    <span>•</span>
                    <span>{currentPlan.sessions_count || 1} session</span>
                  </div>

                  <p className="text-xs text-stone-600 leading-relaxed pt-1.5 border-t border-stone-100">
                    {currentPlan.description}
                  </p>
                </div>
              </div>
            )}

            {/* Date & Time */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-stone-800 uppercase tracking-wider">Date &amp; Time</label>
              {heldSlot && !needsSlot ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-emerald-900">
                    <Calendar className="h-4 w-4" />
                    <span className="font-semibold">{heldSlot.displayDate}</span>
                    <span>·</span>
                    <span>{heldSlot.startTime} – {heldSlot.endTime}</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-800 bg-white/80 border border-emerald-200 px-2 py-0.5 rounded-md">Held for you</span>
                </div>
              ) : slotsLoading ? (
                <div className="text-xs text-stone-500 py-4 flex items-center justify-center gap-2 bg-stone-50 rounded-xl border border-stone-200">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" /> Checking live availability...
                </div>
              ) : openSlots.length === 0 ? (
                <div className="text-xs text-stone-600 p-3.5 bg-stone-50 rounded-xl border border-stone-200">
                  No online slots are open right now. Please call <a className="font-semibold underline" href="tel:+919322013233">+91 93220 13233</a> to book.
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                    {slotDates.map(([date, label]) => (
                      <button
                        key={date}
                        type="button"
                        onClick={() => {
                          setPickedDate(date);
                          setPickedSlotId("");
                        }}
                        className={`shrink-0 px-3 py-2 rounded-xl border text-[11px] font-semibold transition ${
                          date === pickedDate ? "bg-amber-600 border-amber-600 text-white" : "bg-white border-stone-200 text-stone-700 hover:border-stone-300"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {slotsForDate.map((s) => (
                      <button
                        key={s.slot_id}
                        type="button"
                        onClick={() => {
                          setPickedSlotId(s.slot_id);
                          setError(null);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition ${
                          s.slot_id === pickedSlotId ? "bg-amber-50 border-amber-600 ring-2 ring-amber-600/30" : "bg-white border-stone-200 hover:border-stone-300"
                        }`}
                      >
                        <span className="block text-xs font-semibold text-stone-900">{s.start_time}</span>
                        <span className="block text-[10px] text-stone-500">{s.spots_left} spot{s.spots_left === 1 ? "" : "s"} left</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Rider Details */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-stone-800 uppercase tracking-wider">
                Rider Details
              </label>
              <div className="space-y-2.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-stone-600">Full Name</span>
                    {isLockedName && (
                      <span className="text-[10px] text-amber-800 font-semibold flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/80">
                        🔒 Verified & Locked
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={customerName}
                    onChange={isLockedName ? undefined : handleNameChange}
                    readOnly={isLockedName}
                    placeholder="Full Name"
                    className={`w-full rounded-xl text-xs sm:text-sm px-3.5 py-3 font-medium transition capitalize ${
                      isLockedName
                        ? "bg-stone-100/90 text-stone-700 cursor-not-allowed border border-stone-300 select-none shadow-none"
                        : "bg-stone-50 border border-stone-200 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-600 focus:bg-white"
                    }`}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-stone-600">WhatsApp Mobile Number</span>
                    {isLockedPhone && (
                      <span className="text-[10px] text-amber-800 font-semibold flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/80">
                        🔒 Verified & Locked
                      </span>
                    )}
                  </div>
                  <input
                    type="tel"
                    value={whatsappNumber}
                    onChange={isLockedPhone ? undefined : handlePhoneChange}
                    readOnly={isLockedPhone}
                    placeholder="+91 98201 12345"
                    className={`w-full rounded-xl text-xs sm:text-sm px-3.5 py-3 font-medium transition ${
                      isLockedPhone
                        ? "bg-stone-100/90 text-stone-700 cursor-not-allowed border border-stone-300 select-none shadow-none"
                        : "bg-stone-50 border border-stone-200 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-600 focus:bg-white"
                    }`}
                  />
                  <p className="text-[10px] text-stone-400 mt-1">
                    {isLockedPhone
                      ? "Booking receipt and session directions will be dispatched to this verified WhatsApp number."
                      : "Booking receipt and session directions will be sent to this WhatsApp number."}
                  </p>
                </div>
              </div>
            </div>

            {/* Price Summary */}
            {currentPlan && (
              <div className="rounded-xl bg-stone-50 border border-stone-200/80 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between text-stone-600">
                  <span>Selected Session</span>
                  <span className="font-medium text-stone-900">{currentPlan.title}</span>
                </div>
                <div className="border-t border-stone-200 pt-2 flex justify-between text-sm font-semibold">
                  <span className="text-stone-800">Total Payable</span>
                  <span className="text-stone-900 font-bold">
                    ₹{parseFloat(currentPlan.price_inr).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            )}

            {/* Pay Button */}
            <button
              onClick={handlePay}
              disabled={isSubmitting || loading || !currentPlan}
              className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-sm shadow-sm flex items-center justify-center gap-2 transition active:scale-[0.99]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing Secure Payment...
                </>
              ) : (
                <>
                  Pay {currentPlan ? `₹${parseFloat(currentPlan.price_inr).toLocaleString("en-IN")}` : ""} & Confirm
                </>
              )}
            </button>

            <p className="text-[11px] text-stone-400 text-center flex items-center justify-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-stone-400" />
              Secure payment by Razorpay · UPI, Cards, Netbanking & Wallets
            </p>
          </div>
        ) : (
          /* Payment Confirmation Slip */
          <div className="p-6 text-center space-y-5 flex-1">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900">Booking Confirmed</h2>
              <p className="text-xs text-stone-500 mt-1">
                {txDetails?.needsStaff
                  ? "Payment received. Your slot was released before payment completed — our team will call you to fix a time."
                  : "Your session has been scheduled successfully. A receipt is on its way to your WhatsApp."}
              </p>
            </div>

            {/* Receipt Card */}
            <div className="rounded-2xl bg-stone-50 border border-stone-200 p-4 text-left text-xs space-y-2.5">
              <div className="flex items-center justify-between border-b border-stone-200/80 pb-2">
                <span className="text-stone-500">Receipt No</span>
                <span className="font-semibold text-stone-900 font-mono">{txDetails?.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Rider Name</span>
                <span className="font-medium text-stone-900">{customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Session</span>
                <span className="font-medium text-stone-900">{txDetails?.service}</span>
              </div>
              {txDetails?.schedule && (
                <div className="flex justify-between">
                  <span className="text-stone-500">Ride Time</span>
                  <span className="font-medium text-stone-900">{txDetails.schedule}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-stone-500">Amount Paid</span>
                <span className="font-bold text-emerald-700 text-sm">
                  ₹{parseFloat(txDetails?.amount).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Date & Time</span>
                <span className="text-stone-700">{txDetails?.timestamp}</span>
              </div>
            </div>

            {/* Customer Actions */}
            <div className="space-y-2.5 pt-1">
              <button
                onClick={() => window.print()}
                className="w-full bg-white hover:bg-stone-50 text-stone-800 font-medium py-3 rounded-xl text-xs border border-stone-200 flex items-center justify-center gap-2 transition shadow-sm"
              >
                <Printer className="h-4 w-4 text-stone-600" /> Save / Print Official Slip
              </button>

              <a
                href={`https://wa.me/919322013233?text=Hi%20GEC,%20I%20have%20confirmed%20my%20booking%20(${txDetails?.receiptNumber})%20for%20${encodeURIComponent(customerName)}%20(${encodeURIComponent(txDetails?.service)}).`}
                target="_blank"
                rel="noreferrer"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-sm"
              >
                Send Confirmation on WhatsApp
              </a>

              <a
                href="/"
                className="inline-block text-xs text-stone-500 hover:text-stone-800 pt-2 transition font-medium"
              >
                Return to Home
              </a>
            </div>
          </div>
        )}

        {/* Official Footer from PDF */}
        <div className="p-4 bg-stone-50 border-t border-stone-200/80 text-center text-[11px] text-stone-500 space-y-1">
          <div className="flex items-center justify-center gap-1.5">
            <MapPin className="h-3 w-3 text-stone-400" />
            Khajuriwadi, Gorai, Mumbai – 400092
          </div>
          <div className="flex items-center justify-center gap-3">
            <a href="tel:+919322013233" className="flex items-center gap-1 hover:text-stone-800 transition">
              <Phone className="h-3 w-3 text-stone-400" /> +91 93220 13233
            </a>
            <a href="https://instagram.com/gorai_equestrian_centre" target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-stone-800 transition">
              <Camera className="h-3 w-3 text-stone-400" /> @gorai_equestrian_centre
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
