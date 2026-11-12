"use client";

import React, { useState, useEffect } from "react";
import {
  Calendar,
  FileCheck,
  Phone,
  MapPin,
  Camera,
  ArrowRight,
  Clock,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Users,
  Compass,
  BookOpen
} from "lucide-react";

export default function CustomerPortalPage() {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBrochurePage, setSelectedBrochurePage] = useState<number>(1);
  const [viewTab, setViewTab] = useState<"experiences" | "brochure">("experiences");

  const serviceImages: Record<string, string> = {
    basic_course: "/assets/brochure_page_4.png",
    beginner_session: "/assets/brochure_page_5.png",
    experienced_session: "/assets/brochure_page_6.png",
    jumping_training: "/assets/brochure_page_7.png",
    trail_ride: "/assets/brochure_page_8.png",
    horse_experience: "/assets/brochure_page_9.png",
  };

  useEffect(() => {
    fetch("/api/services")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data?.services) {
          setServices(json.data.services);
        }
      })
      .catch((err) => console.error("Error loading services:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#FBFBFA] text-stone-900 font-sans selection:bg-amber-100 selection:text-amber-900">
      {/* Top Banner & Navigation */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-200/80">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/assets/gec_logo.png"
              alt="Gorai Equestrian Centre Logo"
              className="h-11 w-11 object-contain shrink-0 drop-shadow-sm"
            />
            <div>
              <span className="text-sm font-semibold tracking-wide text-stone-900 block leading-tight">
                Gorai Equestrian Centre
              </span>
              <span className="text-[11px] text-stone-500 block">
                Gorai, Mumbai
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/register"
              className="text-xs font-medium text-stone-600 hover:text-stone-900 px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 transition hidden sm:inline-block"
            >
              Rider Form
            </a>
            <a
              href="/checkout"
              className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3.5 py-1.5 rounded-lg shadow-sm transition flex items-center gap-1"
            >
              Book Ride
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-8">
        {/* Hero Card */}
        <div className="bg-white border border-stone-200/90 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col items-center text-center">
          <div className="mb-4">
            <img
              src="/assets/gec_logo.png"
              alt="Gorai Equestrian Centre Crest"
              className="h-24 w-24 sm:h-28 sm:w-28 object-contain drop-shadow-sm transition-transform duration-300 hover:scale-105"
            />
          </div>

          <span className="text-[11px] font-semibold tracking-wider text-amber-800 bg-amber-50 border border-amber-200/60 px-3 py-0.5 rounded-full uppercase mb-2">
            Beach & Countryside Riding
          </span>

          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            Gorai Equestrian Centre
          </h1>

          <p className="text-xs sm:text-sm text-stone-500 max-w-md mt-1.5 leading-relaxed">
            Professional riding instruction, sunset beach trails, and horse care in a serene coastal atmosphere away from the city rush.
          </p>

          {/* Quick Action Grid */}
          <div className="grid grid-cols-2 gap-3 w-full max-w-sm mt-6">
            <a
              href="/checkout"
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-4 rounded-xl text-xs sm:text-sm shadow-sm flex items-center justify-center gap-1.5 transition"
            >
              <Calendar className="h-4 w-4" /> Book a Session
            </a>
            <a
              href="/register"
              className="bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold py-3 px-4 rounded-xl text-xs sm:text-sm border border-stone-200/80 flex items-center justify-center gap-1.5 transition"
            >
              <FileCheck className="h-4 w-4 text-stone-600" /> Rider Form
            </a>
          </div>
        </div>

        {/* Tab Toggle: Experiences vs Brochure */}
        <div className="flex justify-center">
          <div className="inline-flex p-1 bg-stone-200/60 rounded-xl">
            <button
              onClick={() => setViewTab("experiences")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewTab === "experiences"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Riding Sessions & Rates
            </button>
            <button
              onClick={() => setViewTab("brochure")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewTab === "brochure"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Official Brochure
            </button>
          </div>
        </div>

        {/* EXPERIENCES LIST */}
        {viewTab === "experiences" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-stone-900">Available Experiences</h2>
                <p className="text-xs text-stone-500">Select any experience to view details and reserve your slot</p>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-stone-400">Loading sessions...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {services.map((item) => {
                  const img = serviceImages[item.service_code] || "/assets/brochure_page_4.png";
                  return (
                    <div
                      key={item.service_code}
                      className="bg-white border border-stone-200/90 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition flex flex-col"
                    >
                      <div className="relative h-44 w-full bg-stone-100">
                        <img
                          src={img}
                          alt={item.title}
                          className="w-full h-full object-cover object-top"
                        />
                        <div className="absolute top-2.5 right-2.5 bg-white/95 backdrop-blur-sm border border-stone-200 text-stone-900 font-bold px-3 py-1 rounded-full text-xs shadow-sm">
                          ₹{parseFloat(item.price_inr).toLocaleString("en-IN")}
                        </div>
                      </div>

                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-stone-900 text-sm">{item.title}</h3>
                            <span className="text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded">
                              {item.target_rider_level || "All Riders"}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-stone-500">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-stone-400" />
                              {item.duration_minutes || 30} mins
                            </span>
                            <span>•</span>
                            <span>{item.sessions_count || 1} session</span>
                          </div>

                          <p className="text-xs text-stone-600 line-clamp-2 pt-1 leading-relaxed">
                            {item.description}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-stone-100">
                          <a
                            href={`/checkout?plan=${item.service_code}`}
                            className="w-full bg-stone-900 hover:bg-black text-white font-medium py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
                          >
                            Book This Session <ChevronRight className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* BROCHURE VIEWER */}
        {viewTab === "brochure" && (
          <div className="bg-white border border-stone-200/90 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-stone-900">Official GEC Brochure</h2>
                <p className="text-xs text-stone-500">Page {selectedBrochurePage} of 12</p>
              </div>

              {/* Page Selector */}
              <div className="flex items-center gap-1 overflow-x-auto max-w-[200px] sm:max-w-none pb-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((p) => (
                  <button
                    key={p}
                    onClick={() => setSelectedBrochurePage(p)}
                    className={`h-7 w-7 rounded-lg text-xs font-semibold shrink-0 transition ${
                      selectedBrochurePage === p
                        ? "bg-amber-600 text-white"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden border border-stone-200 bg-stone-50">
              <img
                src={`/assets/brochure_page_${selectedBrochurePage}.png`}
                alt={`Brochure Page ${selectedBrochurePage}`}
                className="w-full h-auto object-contain max-h-[600px] mx-auto"
              />
            </div>
          </div>
        )}

        {/* Contact & Location Card */}
        <div className="bg-white border border-stone-200/90 rounded-3xl p-6 shadow-sm">
          <h2 className="text-base font-bold text-stone-900 mb-3">Location & Contacts</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-stone-600">
            <div className="flex items-start gap-2.5">
              <MapPin className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-stone-900 font-semibold mb-0.5">Stables Address</strong>
                Khajuriwadi, Gorai, Mumbai, Maharashtra – 400092
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Phone className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-stone-900 font-semibold mb-0.5">Direct Enquiries</strong>
                <a href="tel:+919322013233" className="block hover:text-stone-900">Salma: +91 93220 13233</a>
                <a href="tel:+919021939252" className="block hover:text-stone-900">Anushka: +91 90219 39252</a>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Camera className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-stone-900 font-semibold mb-0.5">Social & Support</strong>
                <a href="https://instagram.com/gorai_equestrian_centre" target="_blank" rel="noreferrer" className="block hover:text-stone-900">
                  @gorai_equestrian_centre
                </a>
                <a
                  href="https://wa.me/919322013233?text=Hi%20GEC,%20I%20would%20like%20to%20enquire%20about%20riding%20sessions."
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-600 font-medium hover:underline block mt-0.5"
                >
                  Chat on WhatsApp →
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-stone-200 bg-white py-6 text-center text-xs text-stone-500">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} Gorai Equestrian Centre. All rights reserved.</p>
          <div className="flex items-center gap-4 text-[11px] text-stone-400">
            <a href="/register" className="hover:text-stone-700">Rider Form</a>
            <a href="/checkout" className="hover:text-stone-700">Book Ride</a>
            <a href="/admin" className="hover:text-stone-700">Staff Portal</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
