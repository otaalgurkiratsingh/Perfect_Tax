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

// RFC 6238 TOTP (what an authenticator app computes) so tests can do real 2-step sign-in.
export function totp(secretBase32: string, at = Date.now()): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHmac } = require("node:crypto") as typeof import("node:crypto");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretBase32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", bytes).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return code;
}

export const STAFF = {
  admin: { email: "e2e-admin@example.com", password: "E2e-Admin-Passw0rd!", name: "E2E Admin", role: "admin" as const },
  staff: { email: "e2e-staff@example.com", password: "E2e-Staff-Passw0rd!", name: "E2E Staff", role: "staff" as const },
};

/** Create (or reset) a staff account with a known password and no 2FA yet. */
export async function ensureStaff(who: (typeof STAFF)[keyof typeof STAFF]) {
  const admin = db();
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let user = list.users.find((u) => u.email === who.email);
  if (user) {
    await admin.auth.admin.updateUserById(user.id, { password: who.password, ban_duration: "none" });
    const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
    for (const f of factors?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id });
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email: who.email, password: who.password, email_confirm: true });
    if (error) throw error;
    user = data.user!;
  }
  await admin.from("staff_profiles").upsert({ id: user.id, email: who.email, full_name: who.name, role: who.role, active: true });
  return user.id;
}

export const BASE = env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

/** Signed storage links may be relative (STORAGE_PROXY=1): resolve them against the app. */
export function abs(url: string): string {
  return new URL(url, BASE).toString();
}

async function call<T>(path: string, token: string | null, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
  return data as T;
}

export async function uploadVia(token: string, slot: { docType?: string; itemId?: string }, name: string, bytes: Buffer, mime: string) {
  const signed = await call<{ documentId: string; signedUrl: string }>("/api/uploads/sign", token, "POST", { ...slot, fileName: name, size: bytes.length });
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob([new Uint8Array(bytes)], { type: mime }), name);
  const put = await fetch(abs(signed.signedUrl), { method: "PUT", body: form, headers: { "x-upsert": "false" } });
  if (!put.ok) throw new Error(`storage upload failed ${put.status}`);
  return call<{ document: { id: string } }>("/api/uploads/complete", token, "POST", { documentId: signed.documentId });
}

export interface ApiIntake {
  id: string;
  reference: string;
  email: string;
  token: string;
}

/** Fill and submit a complete intake through the public API (same endpoints the form uses). */
export async function submitIntakeViaApi(opts: { name?: string; dob?: string; sin?: string; withDocs?: boolean; services?: string[]; submit?: boolean } = {}): Promise<ApiIntake> {
  await resetRateLimits();
  const email = `${unique("e2e-api-")}@example.com`;
  const { token } = await call<{ token: string }>("/api/intake/start", null, "POST", {});
  const answers = {
    applicantType: "individual",
    primary: {
      fullLegalName: opts.name ?? "Harpreet Api Test",
      dateOfBirth: opts.dob ?? "1979-11-23",
      email,
      mobile: "647-555-0188",
      address: { street: "88 Secret Lane", city: "Brampton", province: "ON", postalCode: "L6Y 2B2" },
      maritalStatus: "married",
      residencyStatus: "citizen",
    },
    services: opts.services ?? ["t1_personal", "bookkeeping"],
    situation: { hadPreviousAccountant: false, yearsUnfiled: 1, receivedCraLetter: false, urgentDeadline: false },
    referral: { source: "referral", detail: "Cousin" },
  };
  await call("/api/intake/draft", token, "PATCH", { step: 6, answers, sin: opts.sin ?? "130 692 544" });
  if (opts.withDocs !== false) {
    await uploadVia(token, { docType: "government_id" }, "passport-scan.png", PNG_1PX, "image/png");
    await uploadVia(token, { docType: "last_return_noa" }, "noa-2024.pdf", await pdfFile(["Notice of Assessment 2024"]), "application/pdf");
  }
  const { data } = await db().from("intakes").select("id, reference").eq("email", email).single();
  if (opts.submit !== false) {
    await call("/api/intake/submit", token, "POST", { consents: { engagement: true, privacy: true, communications: true, cra_authorization: true } });
  }
  return { id: data!.id, reference: data!.reference, email, token };
}

export async function auditActions(targetId: string): Promise<string[]> {
  const { data } = await db().from("audit_log").select("action").eq("target_id", targetId).order("id");
  return (data ?? []).map((r) => r.action);
}
