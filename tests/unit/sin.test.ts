import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

beforeAll(() => {
  process.env.SIN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("SIN protection", async () => {
  const { decryptSin, encryptSin, isValidSin, maskSin } = await import("@/lib/security/sin");

  it("validates the Luhn checksum", () => {
    expect(isValidSin("130 692 544")).toBe(true);
    expect(isValidSin("130692545")).toBe(false);
    expect(isValidSin("12345678")).toBe(false);
    expect(isValidSin("000000000")).toBe(false);
    expect(isValidSin("046 454 286")).toBe(false); // CRA example number: never issued (starts with 0)
  });

  it("encrypts with AES-256-GCM and never stores the plain number", () => {
    const c = encryptSin("130 692 544");
    expect(c.startsWith("v1.")).toBe(true);
    expect(c).not.toContain("130692544");
    expect(decryptSin(c)).toBe("130692544");
    expect(encryptSin("130692544")).not.toBe(c); // random IV
  });

  it("masks to the last three digits", () => {
    expect(maskSin(encryptSin("130692544"))).toBe("••• ••• 544");
    expect(maskSin(null)).toBeNull();
  });

  it("rejects tampered ciphertext", () => {
    const c = encryptSin("130692544").split(".");
    c[3] = Buffer.from("999999999").toString("base64url");
    expect(() => decryptSin(c.join("."))).toThrow();
  });
});
