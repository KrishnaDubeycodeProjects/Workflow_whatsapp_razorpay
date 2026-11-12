"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  MapPin,
  Bed,
  Bath,
  Maximize2,
  Building,
  Camera,
  MessageCircle,
  Home,
  SlidersHorizontal,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export interface PropertyCatalogItem {
  property_id: string;
  slug: string;
  title: string;
  property_type: string;
  listing_type: string;
  price: string;
  location: string;
  bedrooms: number;
  bathrooms: number;
  area_sqft: number;
  images: string[];
  contact_phone?: string;
  created_at?: string;
}

interface PropertyCatalogClientProps {
  initialProperties: PropertyCatalogItem[];
}

export default function PropertyCatalogClient({ initialProperties = [] }: PropertyCatalogClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [selectedListing, setSelectedListing] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("newest");

  // Extract distinct property types
  const propertyTypes = useMemo(() => {
    const types = new Set<string>();
    initialProperties.forEach((p) => {
      if (p.property_type) types.add(p.property_type);
    });
    return ["ALL", ...Array.from(types)];
  }, [initialProperties]);

  // Filtered & Sorted list
  const filteredProperties = useMemo(() => {
    return initialProperties
      .filter((p) => {
        // Search term check
        const q = searchTerm.toLowerCase().trim();
        const matchesSearch =
          !q ||
          p.title?.toLowerCase().includes(q) ||
          p.location?.toLowerCase().includes(q) ||
          p.property_type?.toLowerCase().includes(q) ||
          p.price?.toLowerCase().includes(q);

        // Type check
        const matchesType =
          selectedType === "ALL" ||
          p.property_type?.toLowerCase() === selectedType.toLowerCase();

        // Listing check
        const matchesListing =
          selectedListing === "ALL" ||
          p.listing_type?.toLowerCase() === selectedListing.toLowerCase();

        return matchesSearch && matchesType && matchesListing;
      })
      .sort((a, b) => {
        if (sortBy === "area_desc") {
          return (b.area_sqft || 0) - (a.area_sqft || 0);
        } else if (sortBy === "area_asc") {
          return (a.area_sqft || 0) - (b.area_sqft || 0);
        }
        // Default newest
        return new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime();
      });
  }, [initialProperties, searchTerm, selectedType, selectedListing, sortBy]);

  return (
    <div className="space-y-8">
      {/* ─── SEARCH & FILTER CONTROL BAR ─── */}
      <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 backdrop-blur-xl shadow-xl space-y-4">
        {/* Search Input & Sort Selector */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by neighborhood, villa name, price or keywords..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-950/80 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/50 transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-neutral-950/80 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-300 focus:outline-none focus:border-amber-500/80 cursor-pointer"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="area_desc">Sort: Largest Area</option>
              <option value="area_asc">Sort: Smallest Area</option>
            </select>
          </div>
        </div>

        {/* Filter Pills (Property Type & Listing Type) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-800/80">
          {/* Property Types */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-xs text-neutral-400 mr-1 hidden sm:inline">Type:</span>
            {propertyTypes.map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition cursor-pointer ${
                  selectedType === type
                    ? "bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20 font-semibold"
                    : "bg-neutral-950/60 hover:bg-neutral-800 text-neutral-300 border border-neutral-800"
                }`}
              >
                {type === "ALL" ? "All Types" : type}
              </button>
            ))}
          </div>

          {/* Listing Types (Sale / Rent) */}
          <div className="flex items-center gap-1.5 bg-neutral-950/80 p-1 rounded-xl border border-neutral-800">
            {["ALL", "Sale", "Rent"].map((listing) => (
              <button
                key={listing}
                onClick={() => setSelectedListing(listing)}
                className={`text-xs px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                  selectedListing === listing
                    ? "bg-neutral-800 text-amber-400 font-semibold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                {listing === "ALL" ? "Any Listing" : `For ${listing}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── PROPERTIES COUNTER ─── */}
      <div className="flex items-center justify-between px-1">
        <div className="text-xs sm:text-sm text-neutral-400">
          Showing <span className="font-bold text-white">{filteredProperties.length}</span>{" "}
          {filteredProperties.length === 1 ? "exclusive property" : "exclusive properties"}
        </div>
        <div className="text-xs text-emerald-400 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Real-time Verified Inventory</span>
        </div>
      </div>

      {/* ─── PROPERTIES CARD GRID ─── */}
      {filteredProperties.length === 0 ? (
        <div className="text-center py-20 bg-neutral-900/30 rounded-3xl border border-neutral-800/80 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-neutral-800/60 border border-neutral-700/60 flex items-center justify-center mx-auto text-neutral-500">
            <Home className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">No Properties Found</h3>
            <p className="text-sm text-neutral-400 max-w-sm mx-auto">
              No published listings match your current filters. Try resetting the search or filter tags.
            </p>
          </div>
          <button
            onClick={() => {
              setSearchTerm("");
              setSelectedType("ALL");
              setSelectedListing("ALL");
            }}
            className="inline-flex items-center space-x-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold px-4 py-2 rounded-full border border-neutral-700 transition"
          >
            <span>Reset All Filters</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {filteredProperties.map((prop) => {
            const cleanPhone = (prop.contact_phone || "+91 93220 13233").replace(/\D/g, "");
            const waText = encodeURIComponent(
              `Hello! I saw the property "${prop.title}" (${prop.price}) on your Gorai Real Estate website. I would like more information and arrange a visit.`
            );
            const waUrl = `https://wa.me/${cleanPhone}?text=${waText}`;

            const totalImages = prop.images?.length || 1;

            return (
              <div
                key={prop.property_id}
                className="group bg-neutral-900/60 rounded-2xl sm:rounded-3xl overflow-hidden border border-neutral-800/90 hover:border-neutral-700 transition duration-300 flex flex-col shadow-xl hover:shadow-2xl hover:shadow-amber-500/5 backdrop-blur-md"
              >
                {/* Image Stage */}
                <Link
                  href={`/properties/${prop.slug || prop.property_id}`}
                  className="relative aspect-[16/10] overflow-hidden bg-neutral-950 block"
                >
                  <img
                    src={prop.images[0]}
                    alt={prop.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-neutral-950/20" />

                  {/* Top Badges */}
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span className="bg-amber-500 text-neutral-950 font-bold text-[11px] uppercase px-3 py-0.5 rounded-full shadow">
                      For {prop.listing_type}
                    </span>
                    <span className="bg-neutral-950/80 backdrop-blur text-white text-[11px] px-2.5 py-0.5 rounded-full border border-neutral-700">
                      {prop.property_type}
                    </span>
                  </div>

                  {/* Photos count pill */}
                  <div className="absolute bottom-3 right-3 bg-neutral-950/80 backdrop-blur px-2.5 py-1 rounded-full border border-neutral-700/80 text-[10px] text-neutral-300 font-medium flex items-center gap-1 shadow">
                    <Camera className="w-3 h-3 text-amber-400" />
                    <span>{totalImages} {totalImages === 1 ? "Photo" : "Photos"}</span>
                  </div>
                </Link>

                {/* Content Section */}
                <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    {/* Price */}
                    <div className="text-2xl font-extrabold text-white group-hover:text-amber-400 transition">
                      {prop.price}
                    </div>

                    {/* Title */}
                    <Link
                      href={`/properties/${prop.slug || prop.property_id}`}
                      className="block hover:underline"
                    >
                      <h3 className="font-bold text-neutral-100 text-base line-clamp-1">
                        {prop.title}
                      </h3>
                    </Link>

                    {/* Location */}
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="line-clamp-1">{prop.location}</span>
                    </div>
                  </div>

                  {/* Spec Row */}
                  <div className="pt-3 border-t border-neutral-800/80 grid grid-cols-3 gap-2 text-center text-xs text-neutral-300">
                    <div className="bg-neutral-950/60 p-2 rounded-xl border border-neutral-800/60">
                      <span className="text-[10px] text-neutral-400 block mb-0.5">Bedrooms</span>
                      <span className="font-bold text-white">{prop.bedrooms} BHK</span>
                    </div>
                    <div className="bg-neutral-950/60 p-2 rounded-xl border border-neutral-800/60">
                      <span className="text-[10px] text-neutral-400 block mb-0.5">Bathrooms</span>
                      <span className="font-bold text-white">{prop.bathrooms} Baths</span>
                    </div>
                    <div className="bg-neutral-950/60 p-2 rounded-xl border border-neutral-800/60">
                      <span className="text-[10px] text-neutral-400 block mb-0.5">Area</span>
                      <span className="font-bold text-white">{prop.area_sqft} sqft</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 flex items-center gap-2">
                    <Link
                      href={`/properties/${prop.slug || prop.property_id}`}
                      className="flex-1 flex items-center justify-center space-x-1.5 bg-neutral-800 hover:bg-neutral-700 text-white font-medium py-2.5 px-3 rounded-xl text-xs transition border border-neutral-700"
                    >
                      <span>Explore Showcase</span>
                      <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                    </Link>

                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white transition shadow shadow-emerald-950 cursor-pointer"
                      title="WhatsApp Inquire"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
