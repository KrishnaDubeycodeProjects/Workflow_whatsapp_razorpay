import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gorai Equestrian Centre (GEC) · Mumbai",
  description: "Official riding experiences, beach trails, and equestrian training in Gorai, Mumbai.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#FBFBFA] text-stone-900 antialiased selection:bg-amber-100 selection:text-amber-900">
        {children}
      </body>
    </html>
  );
}
