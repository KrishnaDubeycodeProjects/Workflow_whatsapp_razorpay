import React from "react";
import Link from "next/link";
import { query } from "@/lib/db";
import PropertyCatalogClient, { PropertyCatalogItem } from "@/components/PropertyCatalogClient";
import { Building, MapPin, Bed, Bath, Maximize2, ArrowRight, Home, Sparkles, MessageCircle, Phone, Compass } from "lucide-react";

export const dynamic = "force-dynamic";

async function getProperties(): Promise<PropertyCatalogItem[]> {
  try {
    const res = await query(
      "SELECT property_id, slug, title, property_type, listing_type, price, location, bedrooms, bathrooms, area_sqft, images, contact_phone, created_at FROM real_estate_properties WHERE status = 'published' ORDER BY created_at DESC"
    );
    return res.rows.map((row) => {
      let images = row.images;
      if (typeof images === "string") {
        try { images = JSON.parse(images); } catch { images = []; }
      }
      if (!Array.isArray(images) || images.length === 0) {
        images = ["https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1600&q=80"];
      }
      return {
        ...row,
        images,
      };
    });
  } catch (err) {
    console.error("[Get Properties Error]", err);
    return [];
  }
}

export default async function PropertiesCatalogPage() {
  const properties = await getProperties();

  const deskPhone = "+91 93220 13233";
  const cleanPhone = deskPhone.replace(/\D/g, "");
  const waConciergeUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent("Hello! I am inquiring about coastal real estate listings and luxury properties in Gorai.")}`;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-amber-500 selection:text-neutral-900">
      {/* ─── HEADER ─── */}
      <header className="border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
              GE
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-extrabold tracking-wider text-sm sm:text-base uppercase text-amber-400">
                Gorai Estates
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <a
              href={waConciergeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-full transition shadow-lg shadow-emerald-950/50"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp Concierge</span>
            </a>
          </div>
        </div>
      </header>

      {/* ─── HERO LUXURY BANNER ─── */}
      <div className="relative border-b border-neutral-800/80 bg-gradient-to-b from-neutral-900/90 via-neutral-950 to-neutral-950 py-14 sm:py-20 px-4 sm:px-6 lg:px-8 text-center overflow-hidden">
        {/* Subtle radial ambient background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-64 bg-amber-500/5 blur-3xl pointer-events-none rounded-full" />

        <div className="max-w-3xl mx-auto relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs uppercase tracking-widest px-3.5 py-1.5 rounded-full font-semibold shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Curated Coastal Living</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight">
            Exceptional Coastal Villas &amp; Private Estates
          </h1>

          <p className="text-neutral-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Direct owner listings in Gorai and coastal Mumbai. Featuring beachfront villas, equestrian trail access, and private residences with instant WhatsApp concierge scheduling.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-neutral-400">
            <div className="flex items-center gap-1.5 bg-neutral-900/60 px-3 py-1.5 rounded-full border border-neutral-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>100% Verified Properties</span>
            </div>
            <div className="flex items-center gap-1.5 bg-neutral-900/60 px-3 py-1.5 rounded-full border border-neutral-800">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Zero Hidden Brokerage</span>
            </div>
            <div className="flex items-center gap-1.5 bg-neutral-900/60 px-3 py-1.5 rounded-full border border-neutral-800">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>Direct WhatsApp Site Visits</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── MAIN CATALOG & FILTER VIEW ─── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full flex-1">
        <PropertyCatalogClient initialProperties={properties} />
      </main>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-neutral-900 bg-neutral-950 py-12 text-center text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 space-y-3">
          <div className="flex items-center justify-center space-x-2 text-neutral-400 font-semibold">
            <span>Gorai Equestrian Centre &amp; Real Estate Concierge</span>
          </div>
          <p>Gorai Beach Road, Borivali West / Gorai Island, Mumbai, Maharashtra 400092</p>
          <p>© 2026 Gorai Platform Engineering. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
