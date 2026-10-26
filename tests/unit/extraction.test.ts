import { describe, expect, it } from "vitest";
import { extractStatement } from "@/lib/extraction";
import { parseAmount } from "@/lib/extraction/parse";
import { makeScannedStatement, makeStatement } from "../fixtures/statements";

describe("amount parsing", () => {
  it("reads common formats", () => {
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("$45.00")).toBe(45);
    expect(parseAmount("(12.50)")).toBe(-12.5);
    expect(parseAmount("12.50-")).toBe(-12.5);
    expect(parseAmount("Oct")).toBeNull();
    expect(parseAmount("2026")).toBeNull();
  });
});

describe("statement extraction (text-based PDFs)", () => {
  it("layout A (balance on every row, two pages): totals match the statement", async () => {
    const s = await makeStatement({ layout: "A", seed: 7, year: 2026, quarter: 3, count: 60, opening: 12500.25 });
    const r = await extractStatement(s.bytes);
    expect(r.status).toBe("extracted");
    expect(r.transactions).toHaveLength(s.count);
    expect(r.openingBalance).toBe(s.opening);
    expect(r.closingBalance).toBe(s.closing);
    expect(r.totalDebits).toBeCloseTo(s.totalDebits, 2);
    expect(r.totalCredits).toBeCloseTo(s.totalCredits, 2);
    expect(r.reconciled).toBe(true);
    expect(r.confidence).toBe("high");
    expect(r.transactions[0].date).toMatch(/^2026-07-/);
    expect(r.transactions.some((t) => / BRAMPTON ON| FROM: | PRE-AUTHORIZED/.test(t.description))).toBe(true); // wrapped lines joined
  });

  it("layout B (date once per day, balance at day end): totals match", async () => {
    const s = await makeStatement({ layout: "B", seed: 99, year: 2026, quarter: 4, count: 45, opening: 830.4, bankName: "Prairie Commerce Bank" });
    const r = await extractStatement(s.bytes);
    expect(r.transactions).toHaveLength(s.count);
    expect(r.totalDebits).toBeCloseTo(s.totalDebits, 2);
    expect(r.totalCredits).toBeCloseTo(s.totalCredits, 2);
    expect(r.closingBalance).toBe(s.closing);
    expect(r.reconciled).toBe(true);
    expect(r.confidence).toBe("high");
  });

  it("a statement whose numbers don't add up is flagged LOW, not 'fixed'", async () => {
    const s = await makeStatement({ layout: "A", seed: 3, year: 2026, quarter: 3, count: 20, opening: 1000, tamperClosing: 99999.99 });
    const r = await extractStatement(s.bytes);
    expect(r.reconciled).toBe(false);
    expect(r.confidence).toBe("low");
    expect(r.reason).toMatch(/do NOT reconcile/);
    expect(r.closingBalance).toBe(99999.99); // reported as printed
  });

  it("a scanned (image-only) statement is flagged for manual review — no numbers guessed", async () => {
    const r = await extractStatement(await makeScannedStatement());
    expect(r.status).toBe("manual_review");
    expect(r.confidence).toBe("none");
    expect(r.transactions).toHaveLength(0);
    expect(r.reason).toMatch(/scanned/);
  });

  it("garbage bytes are manual review, not a crash", async () => {
    const r = await extractStatement(new Uint8Array(Buffer.from("%PDF-1.4 not really a pdf")));
    expect(r.status).toBe("manual_review");
  });
});
