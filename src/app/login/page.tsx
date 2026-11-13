import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Admin Sign In · Gorai Equestrian Centre",
  robots: { index: false, follow: false },
};

// Only allow same-site relative redirects (blocks open-redirects like //evil.com).
function safeNext(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || v.startsWith("/login")) return "/admin";
  return v;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const configured = Boolean(process.env.ADMIN_PASSWORD);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[#FBFBFA] relative overflow-hidden">
      {/* Soft decorative backdrop */}
      <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-amber-100/50 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-40 h-[30rem] w-[30rem] rounded-full bg-stone-200/50 blur-3xl" />

      <main className="relative w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <img
            src="/assets/gec_logo.png"
            alt="Gorai Equestrian Centre crest"
            className="h-20 w-20 object-contain drop-shadow-sm mb-4"
          />
          <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-amber-700">Admin Desk</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-stone-900">Gorai Equestrian Centre</h1>
          <p className="mt-2 text-sm text-stone-500">Sign in to manage bookings, riders and live chats.</p>
        </div>

        <div className="rounded-2xl border border-stone-200/90 bg-white/95 backdrop-blur-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(68,64,60,0.18)] p-6 sm:p-7">
          <LoginForm
            next={safeNext(params.next)}
            configured={configured}
            reason={params.reason === "idle" ? "idle" : params.reason === "expired" ? "expired" : undefined}
          />
        </div>

        <p className="mt-6 text-center text-xs text-stone-500">
          Not staff?{" "}
          <a href="/" className="font-medium text-amber-800 hover:text-amber-900 underline-offset-4 hover:underline">
            Go to the customer site
          </a>
        </p>
      </main>
    </div>
  );
}
