import type { NextConfig } from "next";

// Strict security headers. The public form pages load NO third-party scripts:
// Cloudflare Turnstile is allowed only on /start, before any personal data is typed.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const isDev = process.env.NODE_ENV === "development";

function csp(extra: { script?: string[]; frame?: string[] } = {}) {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${(extra.script ?? []).join(" ")}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:`,
    "font-src 'self'",
    `connect-src 'self' ${supabaseUrl}`.trim(),
    `frame-src ${(extra.frame ?? ["'none'"]).join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    isDev ? "" : "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ");
}

const baseHeaders = [
  { key: "Content-Security-Policy", value: csp() },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Links carry private tokens: never leak the URL to other sites.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pdfjs-dist"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: baseHeaders },
      {
        source: "/start",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp({ script: ["https://challenges.cloudflare.com"], frame: ["https://challenges.cloudflare.com"] }),
          },
        ],
      },
      {
        source: "/(staff|portal|intake|upload|q)/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
