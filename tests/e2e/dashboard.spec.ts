import { expect, test } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { readFileSync } from "node:fs";
import { auditActions, BASE, db, env, linkIn, outbox, PNG_1PX, resetRateLimits, submitIntakeViaApi, unique } from "./helpers";

test.beforeEach(async () => {
  await resetRateLimits();
});

test("new intake shows in the dashboard within seconds; firm alert has zero sensitive data", async ({ page }) => {
  const before = outbox().length;
  const t0 = Date.now();
  const intake = await submitIntakeViaApi({ name: "Gurleen Alert Test", dob: "1979-11-23", sin: "130 692 544" });
  await page.goto("/staff");
  await expect(page.getByRole("link", { name: "Gurleen Alert Test" }).first()).toBeVisible();
  const seconds = (Date.now() - t0) / 1000;
  console.log(`DASHBOARD_TIMING intake visible in inbox ${seconds.toFixed(1)}s after submit`);
  expect(seconds).toBeLessThan(10);

  const alerts = outbox()
    .slice(before)
    .filter((m) => m.templateKey === "firm_new_intake" && m.context.intakeId === intake.id);
  expect(alerts.map((a) => a.channel).sort()).toEqual(["email", "sms"]);
  for (const a of alerts) {
    const body = `${a.subject ?? ""}\n${a.text}`;
    expect(body).toContain("Gurleen Alert Test");
    expect(body).toContain(`/staff/intakes/${intake.id}`);
    for (const secret of ["130", "692", "544", "1979", "11-23", "Secret Lane", "L6Y", intake.email, "647", "0188", "passport", "noa-2024", "Cousin"]) {
      expect(body, `alert leaked "${secret}"`).not.toContain(secret);
    }
  }
});

test("detail view, masked SIN, documents, ZIP, CSV — all audit-logged; document URLs are protected", async ({ page, browser }) => {
  const intake = await submitIntakeViaApi({ name: "Simran Package Test" });
  await page.goto(`/staff/intakes/${intake.id}`);
  await expect(page.getByRole("heading", { name: "Simran Package Test" })).toBeVisible();
  await expect(page.getByTestId("sin-primary")).toHaveText("••• ••• 544");
  await expect(page.getByText("130 692 544")).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal (logged)" }).click();
  await expect(page.getByTestId("sin-primary")).toHaveText("130 692 544");
  await expect(page.getByText("Cousin")).toBeVisible(); // referral source visible

  // View a document: redirect to a short-lived signed URL.
  const viewLink = page.getByTestId("staff-doc").filter({ hasText: "noa-2024.pdf" }).getByRole("link", { name: "View" });
  const href = await viewLink.getAttribute("href");
  const res = await page.request.get(href!, { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  const signed = res.headers()["location"];
  expect(signed).toContain("/storage/v1/object/sign/documents/");
  const jwt = JSON.parse(Buffer.from(new URL(signed).searchParams.get("token")!.split(".")[1], "base64url").toString());
  expect(jwt.exp - jwt.iat).toBeLessThanOrEqual(300);
  const file = await fetch(signed);
  expect(file.status).toBe(200);
  expect(Buffer.from(await file.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  // Download mode
  const dl = await page.request.get(href!.replace("mode=view", "mode=download"), { maxRedirects: 0 });
  expect(dl.headers()["location"]).toContain("download=");

  // Unauthenticated access fails everywhere.
  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const anonRes = await anon.request.get(href!, { maxRedirects: 0 });
  expect(anonRes.status()).toBe(401);
  const anonPage = await anon.newPage();
  await anonPage.goto("/staff");
  await expect(anonPage).toHaveURL(/\/staff\/login/);
  expect((await anon.request.get("/api/staff/export")).status()).toBe(401);
  await anon.close();
  const { data: doc } = await db().from("documents").select("storage_path").eq("intake_id", intake.id).eq("doc_type", "last_return_noa").single();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  expect((await fetch(`${url}/storage/v1/object/public/documents/${doc!.storage_path}`)).ok).toBe(false);
  expect((await fetch(`${url}/storage/v1/object/documents/${doc!.storage_path}`)).ok).toBe(false);
  expect((await fetch(`${url}/storage/v1/object/authenticated/documents/${doc!.storage_path}`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` } })).ok).toBe(false);
  // Signed URLs expire.
  const { data: short } = await db().storage.from("documents").createSignedUrl(doc!.storage_path, 1);
  await new Promise((r) => setTimeout(r, 2500));
  expect((await fetch(short!.signedUrl)).ok).toBe(false);

  // ZIP: answers summary + every file.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download all (ZIP)" }).click();
  const zipPath = await (await download).path();
  const zip = unzipSync(new Uint8Array(readFileSync(zipPath!)));
  const names = Object.keys(zip);
  expect(names.some((n) => n.endsWith("-summary.txt"))).toBe(true);
  expect(names.some((n) => n.endsWith("passport-scan.png"))).toBe(true);
  expect(names.some((n) => n.endsWith("noa-2024.pdf"))).toBe(true);
  const summary = strFromU8(zip[names.find((n) => n.endsWith("-summary.txt"))!]);
  expect(summary).toContain("Simran Package Test");
  expect(summary).toContain("••• ••• 544");
  expect(summary).not.toContain("130692544");
  expect(summary).not.toContain("130 692 544");
  expect(summary).toContain("engagement (2026-10-v1): ACCEPTED");

  // CSV: no SIN, just "SIN on file".
  const csv = await (await page.request.get("/api/staff/export?status=all")).text();
  expect(csv.split("\r\n")[0]).toContain("SIN on file");
  const row = csv.split("\r\n").find((l) => l.includes(intake.reference))!;
  expect(row).toContain(",yes,");
  expect(csv).not.toMatch(/130\s?692\s?544/);
  expect(csv).not.toContain("v1.");

  const actions = await auditActions(intake.id);
  for (const a of ["intake_submitted", "view_intake", "reveal_sin", "download_zip"]) expect(actions).toContain(a);
  const { data: docAudit } = await db().from("audit_log").select("action").eq("target_type", "document").in("action", ["view_document", "download_document"]).order("id", { ascending: false }).limit(5);
  expect(docAudit!.map((r) => r.action)).toEqual(expect.arrayContaining(["view_document", "download_document"]));
  const { data: exportAudit } = await db().from("audit_log").select("details").eq("action", "export_csv").order("id", { ascending: false }).limit(1).single();
  expect((exportAudit!.details as { rows: number }).rows).toBeGreaterThan(0);

  // Audit log page shows them.
  await page.goto(`/staff/audit?target=${intake.id}`);
  await expect(page.getByTestId("audit-action").filter({ hasText: "download_zip" })).toBeVisible();
  await expect(page.getByTestId("audit-action").filter({ hasText: "reveal_sin" })).toBeVisible();
});

test("request missing docs: client uploads only the missing item via token link; staff sees status flip", async ({ page, browser }) => {
  const intake = await submitIntakeViaApi({ name: "Manjit Missing Docs" });
  await page.goto(`/staff/intakes/${intake.id}`);
  await page.getByRole("button", { name: "Request missing docs" }).click();
  await page.getByLabel("Void cheque or direct deposit form").check();
  await page.getByRole("button", { name: "Send request (1)" }).click();
  await expect(page.getByTestId("doc-request-status").first()).toHaveText("open");
  await expect(page.getByLabel("Pipeline status")).toHaveValue("docs_missing");

  const msg = outbox().reverse().find((m) => m.templateKey === "doc_request" && m.context.intakeId === intake.id && m.channel === "sms")!;
  expect(msg.text).toContain("Reply STOP to opt out.");
  const link = linkIn(msg.text, "/upload#t=");

  const client = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, storageState: { cookies: [], origins: [] } });
  const cp = await client.newPage();
  await cp.goto(link);
  await expect(cp.getByRole("heading", { name: /please upload this document/ })).toBeVisible();
  await expect(cp.getByText("Void cheque or direct deposit form")).toBeVisible();
  await expect(cp.getByText("Government photo ID")).toHaveCount(0); // only the missing item
  await cp.getByTestId("slot-void_cheque").locator('input[type="file"]').setInputFiles({ name: "void-cheque.png", mimeType: "image/png", buffer: PNG_1PX });
  await expect(cp.getByTestId("upload-complete")).toBeVisible();
  // The link cannot be used to upload anything else.
  const token = link.split("#t=")[1];
  const wrong = await fetch(`${BASE}/api/uploads/sign`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ docType: "government_id", fileName: "x.png", size: 10 }),
  });
  expect(wrong.status).toBeGreaterThanOrEqual(400);
  await client.close();

  await page.reload();
  await expect(page.getByLabel("Pipeline status")).toHaveValue("in_review");
  await expect(page.getByText(/Missing documents received/)).toBeVisible();
  await expect(page.getByTestId("doc-request-status").first()).toHaveText("complete");
  await expect(page.getByTestId("staff-doc").filter({ hasText: "void-cheque.png" })).toContainText("via missing-docs link");
  const actions = await auditActions(intake.id);
  expect(actions).toEqual(expect.arrayContaining(["request_documents", "client_upload"]));
});

test("staff can filter and search the inbox, change status, and create a client", async ({ page }) => {
  const surname = unique("Filtertest");
  const intake = await submitIntakeViaApi({ name: `Baljit ${surname}`, services: ["payroll", "hst_gst"] });
  await page.goto(`/staff?service=payroll&q=${surname}`);
  await expect(page.getByTestId("inbox-row")).toHaveCount(1);
  await page.goto(`/staff?service=us_tax&q=${surname}`);
  await expect(page.getByTestId("inbox-row")).toHaveCount(0);
  await page.goto(`/staff/intakes/${intake.id}`);
  await page.getByLabel("Pipeline status").selectOption("ready");
  await expect.poll(async () => (await db().from("intakes").select("status").eq("id", intake.id).single()).data!.status).toBe("ready");
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page).toHaveURL(/\/staff\/clients\//);
  const { data } = await db().from("intakes").select("status, client_id").eq("id", intake.id).single();
  expect(data!.status).toBe("client_created");
  const { data: client } = await db().from("clients").select("services").eq("id", data!.client_id).single();
  expect(client!.services.sort()).toEqual(["hst", "payroll"]);
});
