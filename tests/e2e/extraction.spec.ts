import { expect, test } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { db, resetRateLimits, unique, uploadVia } from "./helpers";
import { makeScannedStatement, makeStatement } from "../fixtures/statements";

test("statement extraction: text PDF → CSV whose totals match; scanned → manual review; bad maths → low", async ({ page }) => {
  await resetRateLimits();
  const admin = db();
  const year = 2040 + (Math.floor(Date.now() / 1000) % 59);
  const { data: quarter } = await admin
    .from("quarters")
    .insert({ year, quarter: 3, label: `${year}-Q3`, period_start: `${year}-07-01`, period_end: `${year}-09-30` })
    .select("id")
    .single();
  try {
    const { data: client } = await admin
      .from("clients")
      .insert({ business_name: `Extraction ${unique("Co")}`, contact_name: "Test Owner", email: `${unique("e2e-x-")}@example.com`, services: ["bookkeeping"], active: true })
      .select("id")
      .single();
    const { data: cq } = await admin.from("client_quarters").insert({ client_id: client!.id, quarter_id: quarter!.id, status: "requested", requested_at: new Date().toISOString() }).select("id").single();
    const { data: item } = await admin
      .from("checklist_items")
      .insert({ client_quarter_id: cq!.id, item_key: "bank_statements", label: "Bank statements", instructions: "PDFs", bank_statement: true })
      .select("id")
      .single();
    const raw = randomBytes(32).toString("base64url");
    await admin.from("access_tokens").insert({ token_hash: createHash("sha256").update(raw).digest("hex"), purpose: "quarter_upload", client_quarter_id: cq!.id, expires_at: new Date(Date.now() + 86_400_000).toISOString() });

    const good = await makeStatement({ layout: "A", seed: 2024, year, quarter: 3, count: 48, opening: 15234.18 });
    const other = await makeStatement({ layout: "B", seed: 77, year, quarter: 3, count: 30, opening: 402.5, bankName: "Prairie Commerce Bank" });
    const tampered = await makeStatement({ layout: "A", seed: 5, year, quarter: 3, count: 15, opening: 100, tamperClosing: 1234.56 });
    await uploadVia(raw, { itemId: item!.id }, "chequing-jul-sep.pdf", good.bytes, "application/pdf");
    await uploadVia(raw, { itemId: item!.id }, "savings-jul-sep.pdf", other.bytes, "application/pdf");
    await uploadVia(raw, { itemId: item!.id }, "scanned-visa.pdf", await makeScannedStatement(), "application/pdf");
    await uploadVia(raw, { itemId: item!.id }, "doctored.pdf", tampered.bytes, "application/pdf");

    await page.goto(`/staff/client-quarters/${cq!.id}`);
    await expect(page.getByTestId("extraction-panel")).toContainText("does not replace your judgment");
    await page.getByRole("button", { name: "Read all statements" }).click();
    const row = (name: string) => page.getByTestId("extraction-row").filter({ hasText: name });
    await expect(row("chequing-jul-sep.pdf").getByTestId("extraction-confidence")).toHaveText("high confidence", { timeout: 30_000 });
    await expect(row("savings-jul-sep.pdf").getByTestId("extraction-confidence")).toHaveText("high confidence");
    await expect(row("scanned-visa.pdf").getByTestId("extraction-confidence")).toHaveText("manual review");
    await expect(row("scanned-visa.pdf").getByTestId("extraction-reason")).toContainText("scanned");
    await expect(row("doctored.pdf").getByTestId("extraction-confidence")).toHaveText("low confidence");
    await expect(row("chequing-jul-sep.pdf")).toContainText("✓ reconciles");

    const csv = await (await page.request.get(`/api/staff/client-quarters/${cq!.id}/transactions`)).text();
    const lines = csv.trim().split("\r\n").map((l) => l.split(","));
    expect(lines[0]).toEqual(["Source file", "Date", "Description", "Withdrawal (debit)", "Deposit (credit)", "Balance", "Page", "File confidence", "Needs checking"]);
    const sum = (file: string, col: number) =>
      Math.round(lines.slice(1).filter((l) => l[0] === file).reduce((s, l) => s + (l[col] ? Number(l[col]) : 0), 0) * 100) / 100;
    expect(lines.slice(1).filter((l) => l[0] === "chequing-jul-sep.pdf")).toHaveLength(good.count);
    expect(sum("chequing-jul-sep.pdf", 3)).toBeCloseTo(good.totalDebits, 2);
    expect(sum("chequing-jul-sep.pdf", 4)).toBeCloseTo(good.totalCredits, 2);
    expect(Math.round((good.opening + sum("chequing-jul-sep.pdf", 4) - sum("chequing-jul-sep.pdf", 3)) * 100) / 100).toBe(good.closing);
    expect(sum("savings-jul-sep.pdf", 3)).toBeCloseTo(other.totalDebits, 2);
    expect(sum("savings-jul-sep.pdf", 4)).toBeCloseTo(other.totalCredits, 2);
    expect(lines.some((l) => l[0] === "scanned-visa.pdf")).toBe(false); // nothing guessed
    console.log(`EXTRACTION chequing: ${good.count} txns, debits ${good.totalDebits}, credits ${good.totalCredits}, opening ${good.opening} → closing ${good.closing} (CSV matches)`);

    const { data: audit } = await admin.from("audit_log").select("action").in("target_id", [cq!.id]).eq("action", "download_extraction");
    expect(audit!.length).toBeGreaterThan(0);
  } finally {
    await admin.from("quarters").delete().eq("id", quarter!.id);
    await admin.from("clients").update({ active: false }).like("business_name", "Extraction %");
  }
});
