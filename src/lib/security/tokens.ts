import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export type TokenPurpose = "intake_resume" | "doc_request" | "quarter_upload";

export interface TokenRecord {
  id: string;
  purpose: TokenPurpose;
  intake_id: string | null;
  doc_request_id: string | null;
  client_quarter_id: string | null;
  expires_at: string;
}

/** 256 bits of randomness, URL-safe. Only its SHA-256 hash is stored. */
export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function issueToken(input: {
  purpose: TokenPurpose;
  expiresAt: Date;
  intakeId?: string;
  docRequestId?: string;
  clientQuarterId?: string;
}): Promise<string> {
  const raw = generateRawToken();
  const { error } = await adminClient().from("access_tokens").insert({
    token_hash: hashToken(raw),
    purpose: input.purpose,
    intake_id: input.intakeId ?? null,
    doc_request_id: input.docRequestId ?? null,
    client_quarter_id: input.clientQuarterId ?? null,
    expires_at: input.expiresAt.toISOString(),
  });
  if (error) throw new Error(`Could not issue token: ${error.message}`);
  return raw;
}

/** Resolve a raw token to its record if it exists, matches a purpose, and is live. */
export async function resolveToken(raw: string | null | undefined, purposes: TokenPurpose[]): Promise<TokenRecord | null> {
  if (!raw || raw.length < 32 || raw.length > 128 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  const { data } = await adminClient()
    .from("access_tokens")
    .select("id, purpose, intake_id, doc_request_id, client_quarter_id, expires_at, revoked_at")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();
  if (!data || data.revoked_at || !purposes.includes(data.purpose)) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  void adminClient().from("access_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data as TokenRecord;
}

export async function revokeTokens(filter: { intakeId?: string; docRequestId?: string; purpose: TokenPurpose }) {
  let q = adminClient()
    .from("access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("purpose", filter.purpose)
    .is("revoked_at", null);
  if (filter.intakeId) q = q.eq("intake_id", filter.intakeId);
  if (filter.docRequestId) q = q.eq("doc_request_id", filter.docRequestId);
  await q;
}

/** Read the bearer token sent by public pages (never in the URL path or query). */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

// Signed, non-expiring links for one-click unsubscribe pages.
export function signValue(value: string): string {
  return createHmac("sha256", env.linkSigningSecret).update(value).digest("base64url");
}

export function verifySignedValue(value: string, signature: string): boolean {
  const expected = Buffer.from(signValue(value));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
