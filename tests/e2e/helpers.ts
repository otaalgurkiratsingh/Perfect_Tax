import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";

// Load .env.local so tests can reach the same local Supabase as the app.
export function loadEnv(): Record<string, string> {
  const file = path.resolve(__dirname, "../../.env.local");
  const env: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2];
    }
  }
  return { ...env, ...(process.env as Record<string, string>) };
}

export const env = loadEnv();

export function db() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export interface OutboxMessage {
  file: string;
  channel: string;
  templateKey: string;
  to: string;
  subject?: string;
  text: string;
  context: Record<string, string>;
}

export function outbox(): OutboxMessage[] {
  const dir = env.DEV_OUTBOX_DIR;
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(path.join(dir, f), "utf8")) }));
}

export function linkIn(text: string, pathPrefix: string): string {
  const m = new RegExp(`https?://[^\\s]+${pathPrefix.replace(/[/#]/g, (c) => `\\${c}`)}[^\\s]*`).exec(text);
  if (!m) throw new Error(`No ${pathPrefix} link in message:\n${text}`);
  return m[0];
}

export async function pdfFile(lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 740 - i * 16, size: 11, font }));
  return Buffer.from(await doc.save());
}

// 1x1 PNG
export const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Tests start many forms from one IP; clear the per-IP counters between tests. */
export async function resetRateLimits() {
  await db().from("rate_limits").delete().gte("hits", 0);
}
