"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  Camera,
  Building,
  Sparkles,
  Share2,
  Check,
} from "lucide-react";

interface PropertyGalleryProps {
  images: string[];
  title: string;
  listingType?: string;
  propertyType?: string;
}

export default function PropertyGallery({
  images = [],
  title,
  listingType = "Sale",
  propertyType = "Villa",
}: PropertyGalleryProps) {
  // Ensure at least one fallback image exists
  const safeImages = images && images.length > 0
    ? images
    : ["https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1600&q=80"];

  const [activeIndex, setActiveIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Navigate next / previous with wraparound
  const handlePrev = useCallback(() => {
    setActiveIndex((prev) => (prev === 0 ? safeImages.length - 1 : prev - 1));
  }, [safeImages.length]);

  const handleNext = useCallback(() => {
    setActiveIndex((prev) => (prev === safeImages.length - 1 ? 0 : prev + 1));
  }, [safeImages.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      } else if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrev, handleNext, isFullscreen]);

  // Prevent background scroll when fullscreen lightbox is open
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isFullscreen]);

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title,
          url: window.location.href,
        });
      } catch {
        // User cancelled share
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const currentImage = safeImages[activeIndex] || safeImages[0];

  return (
    <div className="w-full space-y-3">
      {/* ─── MAIN HERO STAGE ─── */}
      <div className="relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-[21/9] w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-neutral-900 border border-neutral-800 shadow-2xl group select-none">
        {/* Main Display Image */}
        <img
          key={currentImage}
          src={currentImage}
          alt={`${title} - Photo ${activeIndex + 1}`}
          className="w-full h-full object-cover transition-all duration-500 ease-out cursor-pointer group-hover:scale-[1.01]"
          onClick={() => setIsFullscreen(true)}
          loading="eager"
        />

        {/* Ambient Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/85 via-neutral-950/20 to-neutral-950/40 pointer-events-none" />

        {/* Top Badges & Quick Action Controls */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10 pointer-events-auto">
          <div className="flex items-center gap-2">
            <span className="bg-amber-500 text-neutral-950 font-bold text-xs uppercase px-3 py-1 rounded-full shadow-lg shadow-amber-500/20 backdrop-blur-md">
              For {listingType}
            </span>
            <span className="bg-neutral-900/80 backdrop-blur-md text-neutral-200 text-xs px-3 py-1 rounded-full border border-neutral-700/80 flex items-center gap-1.5 shadow">
              <Building className="w-3.5 h-3.5 text-amber-400" />
              <span>{propertyType}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Share Button */}
            <button
              onClick={handleShare}
              className="p-2.5 rounded-full bg-neutral-900/80 hover:bg-neutral-800 text-neutral-200 hover:text-white backdrop-blur-md border border-neutral-700/70 transition shadow cursor-pointer"
              title="Share Property"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
            </button>

            {/* Expand Fullscreen Button */}
            <button
              onClick={() => setIsFullscreen(true)}
              className="p-2.5 rounded-full bg-neutral-900/80 hover:bg-neutral-800 text-neutral-200 hover:text-white backdrop-blur-md border border-neutral-700/70 transition shadow cursor-pointer"
              title="View Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Previous & Next Navigation Arrows (visible when more than 1 image) */}
        {safeImages.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 sm:p-3 rounded-full bg-neutral-950/70 hover:bg-neutral-900 text-white backdrop-blur-md border border-neutral-700/60 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-xl hover:scale-110 cursor-pointer z-10"
              aria-label="Previous Image"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 sm:p-3 rounded-full bg-neutral-950/70 hover:bg-neutral-900 text-white backdrop-blur-md border border-neutral-700/60 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-xl hover:scale-110 cursor-pointer z-10"
              aria-label="Next Image"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </>
        )}

        {/* Bottom Bar: Image Count & Click-to-Enlarge Hint */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between z-10 pointer-events-none">
          <div className="inline-flex items-center gap-2 bg-neutral-950/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-neutral-700/60 text-xs font-medium text-neutral-200 shadow">
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {activeIndex + 1} / {safeImages.length} {safeImages.length === 1 ? "Photo" : "Photos"}
            </span>
          </div>

          <div className="hidden sm:inline-flex items-center gap-1.5 bg-neutral-950/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-neutral-700/60 text-[11px] text-neutral-400 shadow">
            <span>Click photo to enlarge</span>
          </div>
        </div>
      </div>

      {/* ─── INTERACTIVE THUMBNAIL SWITCHER STRIP ─── */}
      {safeImages.length > 1 && (
        <div className="w-full">
          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-2 pt-1 no-scrollbar scroll-smooth">
            {safeImages.map((img, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveIndex(idx)}
                  className={`relative flex-shrink-0 w-20 sm:w-28 md:w-32 aspect-[16/10] rounded-xl overflow-hidden cursor-pointer transition-all duration-300 bg-neutral-900 border ${
                    isActive
                      ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-neutral-950 border-amber-400 scale-[1.03] shadow-lg shadow-amber-500/10"
                      : "border-neutral-800 opacity-60 hover:opacity-100 hover:border-neutral-700"
                  }`}
                  aria-label={`Switch to Photo ${idx + 1}`}
                >
                  <img
                    src={img}
                    alt={`Thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {isActive && (
                    <div className="absolute inset-0 bg-amber-500/10 pointer-events-none" />
                  )}
                  <span className="absolute bottom-1 right-1.5 text-[9px] font-mono bg-black/70 backdrop-blur px-1 rounded text-neutral-300">
                    #{idx + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── FULLSCREEN LIGHTBOX MODAL ─── */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col justify-between p-4 sm:p-6 select-none animate-in fade-in duration-200"
          onClick={() => setIsFullscreen(false)}
        >
          {/* Lightbox Header */}
          <div
            className="flex items-center justify-between max-w-7xl mx-auto w-full z-20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="text-white font-semibold text-sm sm:text-base line-clamp-1">
                {title}
              </span>
              <span className="text-xs bg-neutral-800 text-neutral-300 px-2.5 py-1 rounded-full border border-neutral-700">
                Photo {activeIndex + 1} of {safeImages.length}
              </span>
            </div>

            <button
              onClick={() => setIsFullscreen(false)}
              className="p-2 rounded-full bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 hover:text-white transition cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Lightbox Center Image Viewport */}
          <div
            className="relative flex-1 flex items-center justify-center my-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {safeImages.length > 1 && (
              <button
                onClick={handlePrev}
                className="absolute left-2 sm:left-6 p-3 rounded-full bg-neutral-900/80 hover:bg-neutral-800 text-white backdrop-blur border border-neutral-700 transition cursor-pointer z-20 shadow-2xl hover:scale-110"
                title="Previous (Left Arrow)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <img
              src={currentImage}
              alt={`${title} - Enlarge ${activeIndex + 1}`}
              className="max-h-[82vh] max-w-[92vw] object-contain rounded-xl sm:rounded-2xl shadow-2xl transition duration-300"
            />

            {safeImages.length > 1 && (
              <button
                onClick={handleNext}
                className="absolute right-2 sm:right-6 p-3 rounded-full bg-neutral-900/80 hover:bg-neutral-800 text-white backdrop-blur border border-neutral-700 transition cursor-pointer z-20 shadow-2xl hover:scale-110"
                title="Next (Right Arrow)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Lightbox Bottom Thumbnail Bar */}
          {safeImages.length > 1 && (
            <div
              className="max-w-4xl mx-auto w-full overflow-x-auto flex items-center justify-center gap-2 py-2 no-scrollbar z-20"
              onClick={(e) => e.stopPropagation()}
            >
              {safeImages.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveIndex(idx)}
                  className={`w-16 h-12 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer border transition ${
                    idx === activeIndex
                      ? "ring-2 ring-amber-400 border-amber-400 scale-105"
                      : "border-neutral-800 opacity-50 hover:opacity-100"
                  }`}
                >
                  <img src={img} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
