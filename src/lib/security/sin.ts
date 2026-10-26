import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

// SIN protection: AES-256-GCM at the application level, key from the environment.
// Ciphertext format: "v1.<iv b64url>.<auth tag b64url>.<ciphertext b64url>".
// Plain SINs never leave this module except via decryptSin() for an explicit,
// audit-logged staff reveal.

function key(): Buffer {
  const raw = Buffer.from(env.sinEncryptionKey, "base64");
  if (raw.length !== 32) throw new Error("SIN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return raw;
}

export function normalizeSin(input: string): string {
  return input.replace(/\D/g, "");
}

/** Canadian SIN check: 9 digits passing the Luhn checksum. */
export function isValidSin(input: string): boolean {
  const digits = normalizeSin(input);
  if (!/^\d{9}$/.test(digits) || digits.startsWith("0") || digits.startsWith("8")) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(digits[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function encryptSin(sin: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(normalizeSin(sin), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSin(payload: string): string {
  const [version, iv, tag, ct] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognized SIN ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** "••• ••• 123" — the only form a SIN is ever displayed in by default. */
export function maskSin(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    return `••• ••• ${decryptSin(payload).slice(-3)}`;
  } catch {
    return "••• ••• ???";
  }
}

export function formatSin(sin: string): string {
  const d = normalizeSin(sin);
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}
