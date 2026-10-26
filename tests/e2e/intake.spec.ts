import { expect, test, type Page } from "@playwright/test";
import { db, PNG_1PX, pdfFile, resetRateLimits, unique } from "./helpers";

test.beforeEach(async () => {
  await resetRateLimits();
});

async function startForm(page: Page) {
  await page.goto("/start");
  await page.getByRole("button", { name: "Start my form" }).click();
  await expect(page).toHaveURL(/\/intake/);
  await expect(page.getByRole("heading", { name: "Who are you?" })).toBeVisible();
}

async function cont(page: Page) {
  await page.getByRole("button", { name: /^(Continue|Skip for now)$/ }).click();
}

async function fillIndividual(page: Page, email: string) {
  await page.getByLabel("Full legal name", { exact: true }).fill("Priya Test Sharma");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mobile phone", { exact: true }).fill("416-555-0142");
  await page.getByLabel("Date of birth", { exact: true }).fill("1985-04-02");
  await page.getByLabel("Marital status").selectOption("single");
  await page.getByLabel("Status in Canada", { exact: true }).selectOption("citizen");
  await page.getByLabel("Street address").fill("25 Test Crescent");
  await page.getByLabel("City").fill("Brampton");
  await page.getByLabel("Province").selectOption("ON");
  await page.getByLabel("Postal code").fill("L6X 1A1");
  await page.getByLabel("Social Insurance Number").fill("130 692 544");
}

async function yesNo(page: Page, legend: string, answer: "Yes" | "No") {
  await page.getByRole("group", { name: legend }).getByText(answer, { exact: true }).click();
}

test("individual completes the full intake on a phone, with 2 uploads, in under 5 minutes", async ({ page }) => {
  const started = Date.now();
  const email = `${unique("e2e-ind-")}@example.com`;
  await startForm(page);

  await page.getByText("Just me", { exact: true }).click();
  await cont(page);

  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  // Inline validation before anything is typed
  await cont(page);
  await expect(page.getByText("Please enter your full legal name")).toBeVisible();
  await fillIndividual(page, email);
  await cont(page);

  await expect(page.getByRole("heading", { name: "What do you need?" })).toBeVisible();
  await page.getByText("Personal tax return (T1)").click();
  await cont(page);

  await expect(page.getByRole("heading", { name: "Your situation" })).toBeVisible();
  await yesNo(page, "Have you had an accountant before?", "No");
  await page.getByLabel("How many years of tax returns are not filed?").fill("0");
  await yesNo(page, "Have you received a letter from CRA?", "No");
  await yesNo(page, "Do you have an urgent deadline?", "No");
  await page.getByLabel("How did you hear about us?").selectOption("referral");
  await page.getByLabel("Who referred you?").fill("A friend");
  await cont(page);

  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  const idSlot = page.getByTestId("slot-government_id");
  await idSlot.locator('input[type="file"]').setInputFiles({ name: "drivers-licence.png", mimeType: "image/png", buffer: PNG_1PX });
  await expect(idSlot.getByTestId("uploaded-file").getByText("drivers-licence.png")).toBeVisible();
  const noaSlot = page.getByTestId("slot-last_return_noa");
  await noaSlot.locator('input[type="file"]').setInputFiles({
    name: "notice-of-assessment.pdf",
    mimeType: "application/pdf",
    buffer: await pdfFile(["Notice of Assessment", "Test document"]),
  });
  await expect(noaSlot.getByTestId("uploaded-file").getByText("notice-of-assessment.pdf")).toBeVisible();
  await cont(page);

  await expect(page.getByRole("heading", { name: "Your consent" })).toBeVisible();
  await cont(page);
  await expect(page.getByText("Please tick this box to continue").first()).toBeVisible();
  await page.locator("#consent-engagement").check();
  await page.locator("#consent-privacy").check();
  await page.locator("#consent-communications").check();
  await page.locator("#consent-cra_authorization").check();
  await cont(page);

  await expect(page.getByRole("heading", { name: "Review & send" })).toBeVisible();
  await expect(page.getByText("On file (ends in 544)")).toBeVisible();
  await expect(page.getByText("2 files")).toBeVisible();
  await page.getByRole("button", { name: "Send to our team" }).click();
  await expect(page.getByTestId("confirmation")).toBeVisible();
  const reference = (await page.getByTestId("confirmation").locator(".font-mono").textContent())?.trim();
  const elapsed = (Date.now() - started) / 1000;
  console.log(`INTAKE_TIMING individual flow completed in ${elapsed.toFixed(1)}s (reference ${reference})`);
  expect(elapsed).toBeLessThan(300);

  const { data: intake } = await db().from("intakes").select("id, status, sin_ciphertext, comms_consent, answers").eq("email", email).single();
  expect(intake!.status).toBe("new");
  expect(intake!.comms_consent).toBe(true);
  expect(intake!.sin_ciphertext).toMatch(/^v1\./);
  expect(JSON.stringify(intake!.answers)).not.toContain("130692544");
  const { data: docs } = await db().from("documents").select("doc_type, status").eq("intake_id", intake!.id);
  expect(docs!.filter((d) => d.status === "uploaded")).toHaveLength(2);
  const { data: consents } = await db().from("intake_consents").select("consent_key, version, text_shown, ip").eq("intake_id", intake!.id);
  expect(consents).toHaveLength(4);
  for (const c of consents!) {
    expect(c.version).toBeTruthy();
    expect(c.text_shown.length).toBeGreaterThan(20);
    expect(c.ip).toBeTruthy();
  }
});

test("abandoning mid-way and resuming restores every answer and file", async ({ page, browser }) => {
  const email = `${unique("e2e-resume-")}@example.com`;
  await startForm(page);
  await page.getByText("Me and my spouse/partner").click();
  await cont(page);
  await fillIndividual(page, email);
  await page.getByLabel("Spouse's full legal name").fill("Arjun Test Sharma");
  await page.getByLabel("Spouse's date of birth").fill("1984-01-15");
  await page.getByLabel("Spouse's status in Canada").selectOption("permanent_resident");
  await cont(page);
  await page.getByText("HST/GST filing").click();
  await page.getByText("Personal tax return (T1)").click();
  await cont(page);
  await yesNo(page, "Have you had an accountant before?", "Yes");
  await page.getByLabel("Who was it?").fill("Old Accountant LLP");
  await page.getByLabel("How many years of tax returns are not filed?").fill("2");
  await yesNo(page, "Have you received a letter from CRA?", "Yes");
  await yesNo(page, "Do you have an urgent deadline?", "Yes");
  await page.getByLabel("Deadline date").fill("2026-12-15");
  await page.getByLabel("How did you hear about us?").selectOption("google");
  await cont(page);
  const slot = page.getByTestId("slot-tax_slips");
  await slot.locator('input[type="file"]').setInputFiles({ name: "t4-2025.pdf", mimeType: "application/pdf", buffer: await pdfFile(["T4 2025"]) });
  await expect(slot.getByTestId("uploaded-file").getByText("t4-2025.pdf")).toBeVisible();
  await expect(page.getByText("Saved ✓")).toBeVisible();

  // Abandon: grab this device's saved link token, close the tab.
  const token = await page.evaluate(() => localStorage.getItem("intake_token"));
  expect(token).toBeTruthy();
  await page.close();

  // Resume on a brand-new device with the private link.
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.goto(`/intake#resume=${token}`);
  await expect(fresh.getByText("Welcome back — your answers and files are restored.")).toBeVisible();
  await expect(fresh.getByRole("heading", { name: "Documents" })).toBeVisible();
  await expect(fresh.getByTestId("slot-tax_slips").getByTestId("uploaded-file").getByText("t4-2025.pdf")).toBeVisible();
  expect(fresh.url()).not.toContain(token!); // token removed from the address bar

  await fresh.getByRole("button", { name: "Back" }).click();
  await expect(fresh.getByLabel("Who was it?")).toHaveValue("Old Accountant LLP");
  await expect(fresh.getByLabel("How many years of tax returns are not filed?")).toHaveValue("2");
  await expect(fresh.getByLabel("Deadline date")).toHaveValue("2026-12-15");
  await expect(fresh.getByLabel("How did you hear about us?")).toHaveValue("google");
  await fresh.getByRole("button", { name: "Back" }).click();
  await expect(fresh.locator("#service-hst_gst")).toBeChecked();
  await expect(fresh.locator("#service-t1_personal")).toBeChecked();
  await fresh.getByRole("button", { name: "Back" }).click();
  await expect(fresh.getByLabel("Full legal name", { exact: true })).toHaveValue("Priya Test Sharma");
  await expect(fresh.getByLabel("Spouse's full legal name")).toHaveValue("Arjun Test Sharma");
  await expect(fresh.getByLabel("Postal code")).toHaveValue("L6X 1A1");
  await expect(fresh.getByText("Saved securely — ends in")).toBeVisible();
  await context.close();
});

test("business intake branches: BN and fiscal year-end appear, spouse does not", async ({ page }) => {
  await startForm(page);
  await page.getByText("My business", { exact: true }).click();
  await cont(page);
  await expect(page.getByText("Please choose your business type")).toBeVisible();
  await page.getByText("Corporation", { exact: true }).click();
  await cont(page);
  await expect(page.getByLabel("Business Number (BN)")).toBeVisible();
  await expect(page.getByText("Fiscal year-end")).toBeVisible();
  await expect(page.getByLabel("Date of incorporation")).toBeVisible();
  await expect(page.getByText(/spouse/i)).toHaveCount(0);
  await expect(page.getByLabel("Social Insurance Number")).toHaveCount(0);
  await expect(page.getByLabel("Marital status")).toHaveCount(0);

  await page.getByLabel("Your full name").fill("Owner Test");
  await page.getByLabel("Email", { exact: true }).fill(`${unique("e2e-biz-")}@example.com`);
  await page.getByLabel("Mobile phone", { exact: true }).fill("905-555-0177");
  await page.getByLabel("Legal business name").fill("Test Trucking Inc.");
  await page.getByLabel("Business Number (BN)").fill("12345");
  await page.getByLabel("Month").selectOption("12");
  await page.getByLabel("Day").selectOption("31");
  await page.getByLabel("Date of incorporation").fill("2019-06-01");
  await page.getByLabel("Incorporated in").selectOption("ON");
  await page.getByLabel("Industry").selectOption("Trucking & transportation");
  await cont(page);
  await expect(page.getByText("A Business Number has 9 digits")).toBeVisible();
  await page.getByLabel("Business Number (BN)").fill("123456789");
  await cont(page);
  await expect(page.getByRole("heading", { name: "What do you need?" })).toBeVisible();

  // Sole proprietors are also asked for the owner's personal details (income goes on their T1).
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByText("Sole proprietor", { exact: true }).click();
  await cont(page);
  await expect(page.getByText("About you (the owner)")).toBeVisible();
  await expect(page.getByLabel("Date of incorporation")).toHaveCount(0);
});

test("public pages load no third-party scripts except Turnstile on /start", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["127.0.0.1", "localhost"].includes(u.hostname)) external.push(r.url());
  });
  await startForm(page);
  await page.getByText("Just me", { exact: true }).click();
  await cont(page);
  await page.getByLabel("Full legal name", { exact: true }).fill("No Trackers");
  expect(external).toEqual([]);
  const csp = (await page.request.get("/intake")).headers()["content-security-policy"];
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain("challenges.cloudflare.com");
});
