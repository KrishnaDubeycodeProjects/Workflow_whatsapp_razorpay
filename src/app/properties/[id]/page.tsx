import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import PropertyGallery from "@/components/PropertyGallery";
import MortgageCalculator from "@/components/MortgageCalculator";
import {
  Bed,
  Bath,
  Maximize2,
  MapPin,
  CheckCircle2,
  Share2,
  Phone,
  MessageCircle,
  Home,
  ShieldCheck,
  Sparkles,
  ArrowLeft,
  Calendar,
  Building,
  Compass,
  Car,
  Layers,
  ArrowUpRight,
  Award,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface Property {
  property_id: string;
  slug: string;
  title: string;
  property_type: string;
  listing_type: string;
  price: string;
  location: string;
  city: string;
  bedrooms: number;
  bathrooms: number;
  area_sqft: number;
  furnishing: string;
  description: string;
  amenities: string[];
  images: string[];
  contact_phone: string;
  contact_name: string;
  status: string;
  created_at: string;
}

interface SimilarProperty {
  property_id: string;
  slug: string;
  title: string;
  price: string;
  location: string;
  bedrooms: number;
  area_sqft: number;
  property_type: string;
  listing_type: string;
  images: string[];
}

async function getProperty(idOrSlug: string): Promise<Property | null> {
  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    const sql = isUUID
      ? "SELECT * FROM real_estate_properties WHERE property_id = $1 LIMIT 1"
      : "SELECT * FROM real_estate_properties WHERE slug = $1 LIMIT 1";

    const res = await query(sql, [idOrSlug]);
    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    let amenities = row.amenities;
    if (typeof amenities === "string") {
      try { amenities = JSON.parse(amenities); } catch { amenities = []; }
    }
    let images = row.images;
    if (typeof images === "string") {
      try { images = JSON.parse(images); } catch { images = []; }
    }
    if (!Array.isArray(images) || images.length === 0) {
      images = ["https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1600&q=80"];
    }

    return {
      ...row,
      amenities: Array.isArray(amenities) ? amenities : [],
      images,
    };
  } catch (err) {
    console.error("[Get Property Error]", err);
    return null;
  }
}

async function getSimilarProperties(currentSlug: string): Promise<SimilarProperty[]> {
  try {
    const res = await query(
      "SELECT property_id, slug, title, price, location, bedrooms, area_sqft, property_type, listing_type, images FROM real_estate_properties WHERE slug != $1 AND status = 'published' ORDER BY created_at DESC LIMIT 3",
      [currentSlug]
    );
    return res.rows.map((r) => {
      let imgs = r.images;
      if (typeof imgs === "string") {
        try { imgs = JSON.parse(imgs); } catch { imgs = []; }
      }
      return {
        ...r,
        images: Array.isArray(imgs) && imgs.length > 0
          ? imgs
          : ["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80"],
      };
    });
  } catch {
    return [];
  }
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await getProperty(id);

  if (!property) {
    notFound();
  }

  const similar = await getSimilarProperties(property.slug || property.property_id);

  const cleanPhone = (property.contact_phone || "+91 93220 13233").replace(/\D/g, "");
  const waShareText = encodeURIComponent(
    `Hello! I am inquiring about "${property.title}" (${property.price}) at ${property.location}. Please share full details and arrange a site visit.`
  );
  const waInquiryUrl = `https://wa.me/${cleanPhone}?text=${waShareText}`;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-amber-500 selection:text-neutral-900 pb-20 sm:pb-0">
      {/* ─── TOP NAVIGATION BAR ─── */}
      <header className="sticky top-0 z-50 bg-neutral-950/80 backdrop-blur-xl border-b border-neutral-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href="/properties"
              className="p-2 -ml-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-900 transition flex items-center gap-1.5 text-xs sm:text-sm font-medium"
              title="All Properties"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Portfolio</span>
            </Link>
            <div className="h-4 w-[1px] bg-neutral-800 hidden sm:block" />
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold tracking-wider text-xs sm:text-sm uppercase text-amber-400">
                Gorai Estates
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <a
              href={`tel:${cleanPhone}`}
              className="hidden md:inline-flex items-center space-x-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white text-xs font-semibold px-4 py-2 rounded-full border border-neutral-700/80 transition"
            >
              <Phone className="w-3.5 h-3.5 text-amber-400" />
              <span>Call Desk</span>
            </a>

            <a
              href={waInquiryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold px-4 sm:px-5 py-2 rounded-full transition shadow-lg shadow-emerald-950/50 hover:shadow-emerald-900/40"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp Inquire</span>
            </a>
          </div>
        </div>
      </header>

      {/* ─── MAIN CONTENT CONTAINER ─── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 w-full flex-1 space-y-8">
        {/* 1. INTERACTIVE IMAGE GALLERY (SWITCHABLE, FULLSCREEN, THUMBNAILS) */}
        <section aria-label="Property Image Gallery">
          <PropertyGallery
            images={property.images}
            title={property.title}
            listingType={property.listing_type}
            propertyType={property.property_type}
          />
        </section>

        {/* 2. TITLE, PRICE & KEY METRICS HERO BAR */}
        <section className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl sm:rounded-3xl p-6 sm:p-8 backdrop-blur-md shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-neutral-400 text-xs sm:text-sm">
                <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
                <span>{property.location}</span>
                <span className="text-neutral-600">•</span>
                <span className="text-emerald-400 font-medium">Verified Property</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
                {property.title}
              </h1>
              <p className="text-xs text-neutral-400">
                Property Ref: <span className="font-mono text-neutral-300">{property.slug}</span>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 lg:text-right border-t lg:border-t-0 border-neutral-800/80 pt-4 lg:pt-0">
              <div>
                <div className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
                  Offering Price
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-amber-400">
                  {property.price}
                </div>
                <div className="text-xs text-neutral-400 mt-0.5">
                  Direct Owner / Concierge Listing • No Hidden Brokerage
                </div>
              </div>
            </div>
          </div>

          {/* 3. KEY SPECIFICATIONS DUAL-AXIS BAR */}
          <div className="mt-8 pt-6 border-t border-neutral-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="flex items-center space-x-3.5 bg-neutral-950/70 border border-neutral-800/70 rounded-xl p-3.5">
              <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                <Bed className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-neutral-400 font-medium">Bedrooms</div>
                <div className="font-bold text-white text-sm sm:text-base">{property.bedrooms} BHK Luxury</div>
              </div>
            </div>

            <div className="flex items-center space-x-3.5 bg-neutral-950/70 border border-neutral-800/70 rounded-xl p-3.5">
              <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                <Bath className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-neutral-400 font-medium">Bathrooms</div>
                <div className="font-bold text-white text-sm sm:text-base">{property.bathrooms} Ensuite Baths</div>
              </div>
            </div>

            <div className="flex items-center space-x-3.5 bg-neutral-950/70 border border-neutral-800/70 rounded-xl p-3.5">
              <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                <Maximize2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-neutral-400 font-medium">Carpet Area</div>
                <div className="font-bold text-white text-sm sm:text-base">{property.area_sqft} sq ft</div>
              </div>
            </div>

            <div className="flex items-center space-x-3.5 bg-neutral-950/70 border border-neutral-800/70 rounded-xl p-3.5">
              <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-neutral-400 font-medium">Furnishing</div>
                <div className="font-bold text-white text-sm sm:text-base">{property.furnishing}</div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. MAIN DETAILS & STICKY SIDEBAR GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left 2 Columns: Description, Amenities, Location, Mortgage */}
          <div className="lg:col-span-2 space-y-8">
            {/* Description Card */}
            <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur shadow-lg space-y-4">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Building className="w-4 h-4" />
                </span>
                <h2 className="text-lg font-bold text-white">Residence Overview &amp; Architecture</h2>
              </div>
              <div className="text-neutral-300 text-sm sm:text-base leading-relaxed whitespace-pre-line">
                {property.description}
              </div>
            </div>

            {/* Amenities Grid */}
            <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur shadow-lg space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <h2 className="text-lg font-bold text-white">Curated Amenities &amp; Privileges</h2>
                </div>
                <span className="text-xs text-neutral-400 bg-neutral-800 px-2.5 py-1 rounded-full border border-neutral-700">
                  {property.amenities.length} Features
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {property.amenities.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center space-x-3 bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-3.5 hover:border-neutral-700 transition"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-sm font-medium text-neutral-200">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive Mortgage & EMI Calculator */}
            <MortgageCalculator initialPriceStr={property.price} />

            {/* Location & Lifestyle Advantages */}
            <div className="bg-gradient-to-br from-neutral-900/80 via-neutral-900/50 to-neutral-950 border border-neutral-800/80 rounded-2xl p-6 sm:p-8 shadow-lg space-y-4">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-400 border border-amber-500/20 shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base sm:text-lg mb-1">
                    Prime Coastal Location &amp; Equestrian Trail Access
                  </h3>
                  <p className="text-neutral-400 text-sm leading-relaxed">
                    Nestled in peaceful {property.location}, enjoy unpolluted coastal sea breeze, private nature trails, and direct access to Gorai Equestrian Centre arena facilities. Escape the urban noise while maintaining seamless transit into the western suburbs.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 border-t border-neutral-800/70 text-xs">
                <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/60">
                  <span className="text-neutral-400 block mb-0.5">🏖️ Gorai Beach</span>
                  <span className="text-white font-semibold">5 Mins Walk</span>
                </div>
                <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/60">
                  <span className="text-neutral-400 block mb-0.5">🐎 Equestrian Arena</span>
                  <span className="text-white font-semibold">Direct Access</span>
                </div>
                <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/60 col-span-2 sm:col-span-1">
                  <span className="text-neutral-400 block mb-0.5">⛴️ Gorai Jetty</span>
                  <span className="text-white font-semibold">8 Mins Drive</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Sticky Verified Concierge Card */}
          <div className="space-y-6">
            <div className="sticky top-24 bg-neutral-900/90 border border-neutral-800 rounded-2xl sm:rounded-3xl p-6 sm:p-7 shadow-2xl backdrop-blur-md space-y-6">
              {/* Agent Profile Header */}
              <div className="flex items-center space-x-3.5 pb-5 border-b border-neutral-800">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-neutral-950 font-extrabold flex items-center justify-center text-base shadow-md">
                  GE
                </div>
                <div>
                  <div className="font-bold text-white text-base flex items-center gap-1.5">
                    <span>{property.contact_name || "Gorai Concierge"}</span>
                    <Award className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-xs text-emerald-400 flex items-center gap-1 font-medium mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Verified Real Estate Desk</span>
                  </div>
                </div>
              </div>

              {/* Price Callout */}
              <div className="bg-neutral-950/80 rounded-xl p-4 border border-neutral-800/80">
                <span className="text-[11px] uppercase tracking-wider text-neutral-400">Guaranteed Value</span>
                <div className="text-2xl font-extrabold text-amber-400 mt-0.5">{property.price}</div>
                <div className="text-xs text-neutral-400 mt-1">Direct inquiries receive priority site viewing slots.</div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <a
                  href={waInquiryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center space-x-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 px-4 rounded-xl transition shadow-xl shadow-emerald-950/50 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Inquire on WhatsApp</span>
                </a>

                <a
                  href={`tel:${cleanPhone}`}
                  className="w-full flex items-center justify-center space-x-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-semibold py-3.5 px-4 rounded-xl transition border border-neutral-700 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Phone className="w-5 h-5 text-amber-400" />
                  <span>Call {property.contact_phone || "Concierge"}</span>
                </a>
              </div>

              {/* Trust Badges */}
              <div className="pt-4 border-t border-neutral-800 space-y-2.5 text-xs text-neutral-400">
                <div className="flex items-center justify-between">
                  <span>Reference ID</span>
                  <span className="font-mono text-neutral-300 font-medium">{property.slug}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Listing Type</span>
                  <span className="text-amber-400 font-medium">For {property.listing_type}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Listing Status</span>
                  <span className="capitalize text-emerald-400 font-medium">{property.status}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Date Published</span>
                  <span>{new Date(property.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 5. SIMILAR / RELATED CURATED PROPERTIES */}
        {similar.length > 0 && (
          <section className="pt-8 border-t border-neutral-800/80 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs uppercase tracking-widest text-amber-400 font-bold">Discover More</span>
                <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
                  Similar Curated Coastal Properties
                </h2>
              </div>
              <Link
                href="/properties"
                className="text-xs sm:text-sm text-neutral-400 hover:text-white flex items-center gap-1 transition"
              >
                <span>View Full Catalog</span>
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {similar.map((item) => (
                <Link
                  key={item.property_id}
                  href={`/properties/${item.slug || item.property_id}`}
                  className="group bg-neutral-900/60 rounded-2xl overflow-hidden border border-neutral-800 hover:border-neutral-700 transition duration-300 flex flex-col shadow-lg"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-neutral-950">
                    <img
                      src={item.images[0]}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    />
                    <div className="absolute top-3 left-3 flex gap-2">
                      <span className="bg-amber-500 text-neutral-950 font-bold text-[10px] uppercase px-2 py-0.5 rounded-full">
                        {item.listing_type}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="text-lg font-bold text-white group-hover:text-amber-400 transition">
                        {item.price}
                      </div>
                      <h3 className="font-medium text-neutral-200 text-sm line-clamp-1 mt-1">
                        {item.title}
                      </h3>
                      <p className="text-xs text-neutral-400 flex items-center gap-1 mt-1">
                        <MapPin className="w-3.5 h-3.5 text-amber-500" />
                        <span className="line-clamp-1">{item.location}</span>
                      </p>
                    </div>
                    <div className="mt-3 pt-3 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
                      <span>{item.bedrooms} BHK</span>
                      <span>{item.area_sqft} sq ft</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* ─── MOBILE FLOATING ACTION DOCK (PB-SAFE) ─── */}
      <div className="fixed bottom-0 left-0 right-0 sm:hidden z-50 bg-neutral-950/95 backdrop-blur-xl border-t border-neutral-800 p-3 pb-safe shadow-2xl flex items-center gap-2">
        <a
          href={`tel:${cleanPhone}`}
          className="flex-1 flex items-center justify-center space-x-2 bg-neutral-900 border border-neutral-700 text-white font-semibold py-3 px-3 rounded-xl text-xs"
        >
          <Phone className="w-4 h-4 text-amber-400" />
          <span>Call Desk</span>
        </a>

        <a
          href={waInquiryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-[2] flex items-center justify-center space-x-2 bg-emerald-600 active:bg-emerald-700 text-white font-semibold py-3 px-3 rounded-xl text-xs shadow-lg shadow-emerald-950/60"
        >
          <MessageCircle className="w-4 h-4" />
          <span>WhatsApp Inquire</span>
        </a>
      </div>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-neutral-900 bg-neutral-950 py-10 mt-16 text-center text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p className="font-semibold text-neutral-400">Gorai Equestrian Centre &amp; Real Estate Concierge</p>
          <p>© 2026 Gorai Real Estate Platform. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
