"use client";

import React, { useState, useMemo } from "react";
import {
  CheckCircle2,
  Shield,
  HeartPulse,
  ArrowRight,
  Loader2,
  ChevronLeft,
  MapPin,
  Phone,
  Camera,
  Check,
  User,
  AlertCircle
} from "lucide-react";

export default function MobileRegistrationPage() {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string>("");
  const [checkoutUrl, setCheckoutUrl] = useState<string>("/checkout");

  // Exact fields from official Gorai_Equestrian_Centre_New_Registration_Form.pdf
  const [formData, setFormData] = useState({
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
    bloodGroup: "O+",
    emergencyContactPerson: "",
    emergencyContactNumber: "",
    familyPhysician: "",
    isMinor: false,
    guardianName: "",
    medicalFitnessConfirmed: false,
    safetyRulesAcknowledged: false,
    indemnityAccepted: false,
    mediaConsentGranted: false, // consent must be an explicit opt-in
    digitalSignatureName: "",
    digitalSignatureDate: new Date().toISOString().split("T")[0]
  });

  // Phone number formatter
  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("91") && digits.length > 2) {
      const nat = digits.slice(2, 12);
      return nat.length <= 5 ? `+91 ${nat}` : `+91 ${nat.slice(0, 5)} ${nat.slice(5)}`;
    } else {
      const nat = digits.slice(0, 10);
      return nat.length <= 5 ? `+91 ${nat}` : `+91 ${nat.slice(0, 5)} ${nat.slice(5)}`;
    }
  };

  // WhatsApp Session Autofill Integration
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const phoneParam = params.get("phone") || params.get("mobile");
      const nameParam = params.get("name") || params.get("fullName");
      const serviceParam = params.get("service") || params.get("activity");
      const levelParam = params.get("level");
      const orderParam = params.get("orderId") || params.get("order_id");
      if (orderParam && /^[0-9a-f-]{36}$/i.test(orderParam)) setOrderId(orderParam);

      if (phoneParam || nameParam || serviceParam || levelParam) {
        setFormData((prev) => ({
          ...prev,
          ...(phoneParam ? { mobileNumber: formatPhone(phoneParam) } : {}),
          ...(nameParam ? { fullName: nameParam, digitalSignatureName: nameParam } : {}),
          ...(serviceParam ? { activity: serviceParam } : {}),
          ...(levelParam ? { level: levelParam } : {}),
        }));
      }
    }
  }, []);

  // Minor status follows the date of birth (the server enforces the same rule).
  React.useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.dateOfBirth)) return;
    const dob = new Date(`${formData.dateOfBirth}T00:00:00`);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    const minor = age < 18;
    setFormData((prev) => (prev.isMinor === minor ? prev : { ...prev, isMinor: minor }));
  }, [formData.dateOfBirth]);

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setFormData((prev) => ({ ...prev, mobileNumber: formatted }));
  };

  const handleEmergencyMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setFormData((prev) => ({ ...prev, emergencyContactNumber: formatted }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleActivitySelect = (act: string) => {
    setFormData((prev) => ({ ...prev, activity: act }));
  };

  const handleLevelSelect = (lvl: string) => {
    setFormData((prev) => ({ ...prev, level: lvl }));
  };

  const handleBloodGroupSelect = (bg: string) => {
    setFormData((prev) => ({ ...prev, bloodGroup: bg }));
  };

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (!formData.fullName.trim() || formData.fullName.trim().length < 2) {
        setError("Please enter your full name (minimum 2 characters).");
        return;
      }
      const mobileDigits = formData.mobileNumber.replace(/\D/g, "");
      if (mobileDigits.length < 10) {
        setError("Please enter a valid 10-digit mobile number.");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.dateOfBirth)) {
        setError("Please enter the rider's date of birth.");
        return;
      }
    } else if (step === 2) {
      if (!formData.emergencyContactPerson.trim() || formData.emergencyContactPerson.trim().length < 2) {
        setError("Please enter the emergency contact person's name.");
        return;
      }
      const emergencyDigits = formData.emergencyContactNumber.replace(/\D/g, "");
      if (emergencyDigits.length < 10) {
        setError("Please enter a valid 10-digit emergency contact phone number.");
        return;
      }
      const riderDigits = formData.mobileNumber.replace(/\D/g, "");
      if (emergencyDigits === riderDigits) {
        setError("Emergency contact number must be different from rider's number.");
        return;
      }
      if (formData.isMinor && (!formData.guardianName || formData.guardianName.trim().length < 2)) {
        setError("Please enter parent / guardian name for minors.");
        return;
      }
    }
    setStep((prev) => Math.min(prev + 1, 3));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!formData.medicalFitnessConfirmed || !formData.safetyRulesAcknowledged || !formData.indemnityAccepted) {
      setError("Please confirm the medical fitness declaration, safety rules, and indemnity agreement.");
      return;
    }

    if (!formData.digitalSignatureName.trim() || formData.digitalSignatureName.trim().length < 2) {
      setError("Please enter your full legal name as digital signature.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          orderId: orderId || undefined,
          mobileNumber: formData.mobileNumber.replace(/\s+/g, ""),
          emergencyContactNumber: formData.emergencyContactNumber.replace(/\s+/g, ""),
        }),
      });

      const json = await res.json();
      if (json.success) {
        if (typeof json.checkoutUrl === "string" && json.checkoutUrl.startsWith("/checkout")) {
          setCheckoutUrl(json.checkoutUrl);
        }
        setSubmitted(true);
      } else {
        setError(json.error || "Unable to submit registration. Please verify details.");
      }
    } catch (err: any) {
      setError("Network connection issue. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const activities = [
    { id: "Riding Lessons", label: "Riding Lessons", desc: "Structured arena sessions" },
    { id: "Trail Ride", label: "Trail Ride", desc: "Beach & countryside" },
    { id: "Joy Ride", label: "Joy Ride", desc: "Relaxed guided ride" },
    { id: "Photoshoot", label: "Photoshoot", desc: "Costume & horse session" },
  ];

  const levels = ["Beginner", "Intermediate", "Advanced"];
  const bloodGroups = ["O+", "A+", "B+", "AB+", "O-", "A-", "B-", "AB-"];

  return (
    <div className="min-h-screen bg-[#FBFBFA] text-stone-900 flex flex-col justify-center items-center p-3 sm:p-6 font-sans">
      <div className="w-full max-w-lg bg-white border border-stone-200/90 rounded-3xl shadow-sm overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-white px-6 pt-6 pb-4 border-b border-stone-100 text-center">
          <div className="flex justify-center mb-3">
            <img
              src="/assets/gec_logo.png"
              alt="Gorai Equestrian Centre"
              className="h-20 w-20 object-contain drop-shadow-sm"
            />
          </div>
          <h1 className="text-base font-semibold tracking-wide text-stone-900 uppercase">
            Gorai Equestrian Centre
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Rider Registration & Safety Agreement
          </p>
        </div>

        {/* Step Indicator */}
        {!submitted && (
          <div className="px-6 pt-4 pb-2 bg-stone-50/70 border-b border-stone-100">
            <div className="flex items-center justify-between text-xs font-medium text-stone-500 mb-2">
              <span className={step >= 1 ? "text-amber-800 font-semibold" : ""}>1. Rider Info</span>
              <span className={step >= 2 ? "text-amber-800 font-semibold" : ""}>2. Emergency</span>
              <span className={step >= 3 ? "text-amber-800 font-semibold" : ""}>3. Agreement</span>
            </div>
            <div className="h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-600 transition-all duration-300 rounded-full"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Form Body */}
        {!submitted ? (
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 flex-1">
            {error && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
                <span>{error}</span>
              </div>
            )}

            {/* STEP 1: RIDER INFO */}
            {step === 1 && (
              <div className="space-y-4">
                {/* Activity Segmented Selector */}
                <div>
                  <label className="block text-xs font-semibold text-stone-800 uppercase tracking-wider mb-2">
                    Select Activity
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {activities.map((act) => {
                      const isSel = formData.activity === act.id;
                      return (
                        <button
                          key={act.id}
                          type="button"
                          onClick={() => handleActivitySelect(act.id)}
                          className={`p-2.5 rounded-xl text-left border transition text-xs flex flex-col justify-between ${
                            isSel
                              ? "bg-amber-50/80 border-amber-600 ring-1 ring-amber-600 text-stone-900 font-semibold shadow-sm"
                              : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100/70"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{act.label}</span>
                            {isSel && <Check className="h-3 w-3 text-amber-600" />}
                          </div>
                          <span className="text-[10px] text-stone-400 font-normal mt-0.5">
                            {act.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Level Segmented Selector */}
                <div>
                  <label className="block text-xs font-semibold text-stone-800 uppercase tracking-wider mb-2">
                    Riding Experience Level
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {levels.map((lvl) => {
                      const isSel = formData.level === lvl;
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => handleLevelSelect(lvl)}
                          className={`py-2 px-3 rounded-xl text-center border transition text-xs font-medium ${
                            isSel
                              ? "bg-stone-900 text-white border-stone-900 shadow-sm"
                              : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100"
                          }`}
                        >
                          {lvl}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Full Name <span className="text-red-600 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    placeholder="Enter full name"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm px-3.5 py-2.5 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-600 focus:bg-white font-medium capitalize"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                      Mobile Number <span className="text-red-600 font-bold">*</span>
                    </label>
                    <input
                      type="tel"
                      name="mobileNumber"
                      value={formData.mobileNumber}
                      onChange={handleMobileChange}
                      placeholder="+91 98201 12345"
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl text-xs px-3.5 py-2.5 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-600 focus:bg-white font-medium"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                      Email Address (Optional)
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="name@email.com"
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl text-xs px-3.5 py-2.5 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-600 focus:bg-white font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Residential Address (Optional)
                  </label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    rows={2}
                    placeholder="Full residential address"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl text-xs px-3.5 py-2 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-600 focus:bg-white font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                      Date of Birth *
                    </label>
                    <input
                      type="date"
                      required
                      name="dateOfBirth"
                      max={new Date().toISOString().split("T")[0]}
                      value={formData.dateOfBirth}
                      onChange={handleChange}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl text-xs px-3 py-2 text-stone-900 focus:outline-none focus:border-amber-600 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                      Weight (kg) (Optional)
                    </label>
                    <input
                      type="number"
                      name="weightKg"
                      min={15}
                      max={150}
                      value={formData.weightKg}
                      onChange={handleChange}
                      placeholder="e.g. 65"
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl text-xs px-3 py-2 text-stone-900 focus:outline-none focus:border-amber-600 font-medium"
                    />
                  </div>
                </div>

                {/* Blood Group Chips */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                    Blood Group (Optional)
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {bloodGroups.map((bg) => {
                      const isSel = formData.bloodGroup === bg;
                      return (
                        <button
                          key={bg}
                          type="button"
                          onClick={() => handleBloodGroupSelect(bg)}
                          className={`py-1.5 rounded-lg text-xs font-medium border transition ${
                            isSel
                              ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                              : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100"
                          }`}
                        >
                          {bg}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleNext}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-xl text-sm shadow-sm flex items-center justify-center gap-2 transition"
                  >
                    Continue to Emergency Contact <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: EMERGENCY CONTACT */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Emergency Contact Name <span className="text-red-600 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    name="emergencyContactPerson"
                    value={formData.emergencyContactPerson}
                    onChange={handleChange}
                    placeholder="Parent / Spouse / Relative name"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm px-3.5 py-2.5 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-600 focus:bg-white font-medium capitalize"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Emergency Contact Number <span className="text-red-600 font-bold">*</span>
                  </label>
                  <input
                    type="tel"
                    name="emergencyContactNumber"
                    value={formData.emergencyContactNumber}
                    onChange={handleEmergencyMobileChange}
                    placeholder="+91 98201 12345"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm px-3.5 py-2.5 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-600 focus:bg-white font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Family Doctor / Physician (Optional)
                  </label>
                  <input
                    type="text"
                    name="familyPhysician"
                    value={formData.familyPhysician}
                    onChange={handleChange}
                    placeholder="Doctor's name and contact"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl text-xs px-3.5 py-2.5 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-600 focus:bg-white font-medium"
                  />
                </div>

                {/* Minor Check */}
                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="isMinor"
                      checked={formData.isMinor}
                      onChange={handleChange}
                      className="rounded border-stone-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                    />
                    <span className="text-xs font-medium text-stone-800">
                      Rider is under 18 years of age (Minor)
                    </span>
                  </label>
                  {formData.isMinor && (
                    <div className="space-y-1 pt-1">
                      <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider">
                        Parent / Guardian Full Legal Name <span className="text-red-600 font-bold">*</span>
                      </label>
                      <input
                        type="text"
                        name="guardianName"
                        value={formData.guardianName}
                        onChange={handleChange}
                        placeholder="Parent / Guardian Full Legal Name"
                        className="w-full bg-white border border-stone-200 rounded-lg text-xs px-3 py-2 text-stone-900 focus:outline-none focus:border-amber-600 font-medium capitalize"
                        required
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setStep(1);
                    }}
                    className="w-1/3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium py-3 rounded-xl text-xs transition"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="w-2/3 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-xl text-sm shadow-sm flex items-center justify-center gap-2 transition"
                  >
                    Continue to Agreements <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: DECLARATION & SIGNATURE */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="space-y-2.5">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer">
                    <input
                      type="checkbox"
                      name="medicalFitnessConfirmed"
                      checked={formData.medicalFitnessConfirmed}
                      onChange={handleChange}
                      className="mt-0.5 rounded border-stone-300 text-amber-600 focus:ring-amber-500 h-4 w-4 shrink-0"
                    />
                    <span className="text-xs text-stone-700 leading-relaxed">
                      <strong>Medical Fitness <span className="text-red-600 font-bold">*</span>:</strong> I confirm that I do not suffer from heart disorders, epilepsy, severe asthma, spinal conditions, or pregnancy.
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer">
                    <input
                      type="checkbox"
                      name="safetyRulesAcknowledged"
                      checked={formData.safetyRulesAcknowledged}
                      onChange={handleChange}
                      className="mt-0.5 rounded border-stone-300 text-amber-600 focus:ring-amber-500 h-4 w-4 shrink-0"
                    />
                    <span className="text-xs text-stone-700 leading-relaxed">
                      <strong>Safety Guidelines <span className="text-red-600 font-bold">*</span>:</strong> I agree to wear an approved riding helmet and closed footwear, and follow instructor commands at all times.
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer">
                    <input
                      type="checkbox"
                      name="indemnityAccepted"
                      checked={formData.indemnityAccepted}
                      onChange={handleChange}
                      className="mt-0.5 rounded border-stone-300 text-amber-600 focus:ring-amber-500 h-4 w-4 shrink-0"
                    />
                    <span className="text-xs text-stone-700 leading-relaxed">
                      <strong>Indemnity & Waiver <span className="text-red-600 font-bold">*</span>:</strong> I understand horseback riding involves inherent risk and participate voluntarily at my own risk.
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer">
                    <input
                      type="checkbox"
                      name="mediaConsentGranted"
                      checked={formData.mediaConsentGranted}
                      onChange={handleChange}
                      className="mt-0.5 rounded border-stone-300 text-amber-600 focus:ring-amber-500 h-4 w-4 shrink-0"
                    />
                    <span className="text-xs text-stone-700 leading-relaxed">
                      <strong>Media Consent (Optional):</strong> Permission to photograph/film for GEC social channels and archives.
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Digital Signature (Type Full Legal Name) <span className="text-red-600 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    name="digitalSignatureName"
                    value={formData.digitalSignatureName}
                    onChange={handleChange}
                    placeholder="Type full legal name"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm px-3.5 py-2.5 text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white font-medium capitalize"
                    required
                  />
                  <p className="text-[11px] text-stone-400 mt-1">Date: {formData.digitalSignatureDate}</p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setStep(2);
                    }}
                    className="w-1/3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium py-3 rounded-xl text-xs transition"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-2/3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm shadow-sm flex items-center justify-center gap-2 transition"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
                      </>
                    ) : (
                      "Complete Registration"
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>
        ) : (
          /* SUCCESS VIEW */
          <div className="p-6 text-center space-y-5 flex-1">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900">Registration Complete</h2>
              <p className="text-xs text-stone-500 mt-1">Your rider record has been officially registered.</p>
            </div>

            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-left space-y-2">
              <div className="flex justify-between">
                <span className="text-stone-500">Rider</span>
                <span className="font-semibold text-stone-900">{formData.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Activity</span>
                <span className="font-medium text-stone-900">{formData.activity} ({formData.level})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Mobile</span>
                <span className="font-medium text-stone-900">{formData.mobileNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Medical Fitness</span>
                <span className="text-emerald-700 font-medium">Declared Fit</span>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <a
                href={checkoutUrl}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-xl text-sm shadow-sm flex items-center justify-center gap-2 transition"
              >
                {orderId ? "Continue to Secure Payment →" : "Book a Riding Session →"}
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

        {/* Footer */}
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
