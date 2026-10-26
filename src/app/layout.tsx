import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { firmConfig } from "@firm/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: firmConfig.firm.name, template: `%s — ${firmConfig.firm.name}` },
  description: `Client intake — ${firmConfig.firm.name}`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: firmConfig.branding.colors.brand,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const c = firmConfig.branding.colors;
  const brandVars = {
    "--brand": c.brand,
    "--brand-text": c.brandText,
    "--accent": c.accent,
    "--accent-text": c.accentText,
    "--highlight": c.highlight,
  } as CSSProperties;
  return (
    <html lang="en" style={brandVars} className="h-full antialiased">
      <body className="min-h-full flex flex-col text-[17px]">{children}</body>
    </html>
  );
}
