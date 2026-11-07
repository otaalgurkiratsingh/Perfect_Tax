import { expect, test, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { abs, BASE, db, env, linkIn, outbox, pdfFile, PNG_1PX, resetRateLimits, unique } from "./helpers";

const DAY = 86_400_000;

async function runCron() {
  const res = await fetch(`${BASE}/api/cron/run`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CRON_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ ignoreSendWindow: true }),
  });
  expect(res.status).toBe(200);
  return res.json();
}

async function boardCount(page: Page, status: string) {
  return Number((await page.getByTestId(`board-count-${status}`).locator("span").textContent())?.trim());
}

test("full quarter cycle: open, checklists per client type, Day-0 links, chase, completion stops reminders, board, portal", async ({ page, browser }) => {
  test.setTimeout(240_000);
  await resetRateLimits();
  const tag = unique("Q");
  const admin = db();
  // Only this test's clients are active, so the board counts are exact.
  await admin.from("clients").update({ active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
  const mk = async (name: string, services: string[], extra: Record<string, string> = {}) => {
    const { data } = await admin
      .from("clients")
      .insert({ business_name: `${name} ${tag}`, contact_name: `${name.split(" ")[0]} Owner`, email: `${unique("e2e-client-")}@example.com`, phone: "+14165550123", services, ...extra })
      .select("id")
      .single();
    return data!.id as string;
  };
  const bookkeeping = await mk("Alpha Bookkeeping", ["bookkeeping"]);
  const payroll = await mk("Bravo Payroll", ["payroll"]);
  const hst = await mk("Charlie HST", ["hst"]);
  const company = await mk("Delta Trucking", ["bookkeeping", "payroll", "hst"], { whatsapp_phone: "+14165550177" });
  const echo = await mk("Echo Cleaning", ["hst"]);

  // Staff opens the quarter once.
  const year = 2040 + (Math.floor(Date.now() / 1000) % 59);
  await page.goto("/staff/quarters");
  await page.getByLabel("Year").fill(String(year));
  await page.getByLabel("Quarter").selectOption("4");
  await page.getByRole("button", { name: "Open quarter" }).click();
  await expect(page.getByRole("heading", { name: `${year}-Q4 board` })).toBeVisible();
  const { data: quarter } = await admin.from("quarters").select("id").eq("label", `${year}-Q4`).single();

  try {
    // Correct checklists for 3 different client types.
    const keysFor = async (clientId: string) => {
      const { data: cq } = await admin.from("client_quarters").select("id, status").eq("client_id", clientId).eq("quarter_id", quarter!.id).single();
      const { data: items } = await admin.from("checklist_items").select("item_key, instructions").eq("client_quarter_id", cq!.id).order("sort_order");
      return { cqId: cq!.id as string, status: cq!.status, keys: items!.map((i) => i.item_key), first: items![0].instructions };
    };
    const A = await keysFor(bookkeeping);
    const B = await keysFor(payroll);
    const C = await keysFor(hst);
    const D = await keysFor(company);
    const E = await keysFor(echo);
    expect(A.keys).toEqual(["bank_statements", "credit_card_statements", "cheque_images", "sales_invoices", "expense_receipts"]);
    expect(B.keys).toEqual(["pay_stubs", "employee_changes"]);
    expect(C.keys).toEqual(["sales_summary", "purchase_invoices"]);
    expect(D.keys).toHaveLength(9);
    expect(A.first).toContain(`Oct to Dec ${year}`);
    expect(await boardCount(page, "not_sent")).toBe(5);

    // Day 0 to everyone except Charlie (stays Not Sent).
    const before = outbox().length;
    for (const name of ["Alpha Bookkeeping", "Bravo Payroll", "Delta Trucking", "Echo Cleaning"]) {
      const row = page.getByTestId("board-row").filter({ hasText: `${name} ${tag}` });
      await row.getByRole("button", { name: "Send request" }).click();
      await expect(row.getByTestId("board-status")).toHaveText("Requested");
    }
    const day0 = outbox().slice(before).filter((m) => m.templateKey === "quarter_request");
    const deltaText = day0.find((m) => m.context.clientQuarterId === D.cqId && m.channel === "sms")!;
    expect(deltaText.text).toContain("Reply STOP to opt out.");
    expect(day0.find((m) => m.context.clientQuarterId === D.cqId && m.channel === "email")!.text).toContain("Bank statements — all business accounts");
    expect(day0.filter((m) => m.context.clientQuarterId === C.cqId)).toHaveLength(0);

    // Delta (the company) opens the personal link on a phone and works through the checklist.
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, storageState: { cookies: [], origins: [] } });
    const cp = await phone.newPage();
    await cp.goto(linkIn(deltaText.text, "/q#t="));
    await expect(cp.getByRole("heading", { name: `Oct to Dec ${year} documents` })).toBeVisible();
    await expect(cp.getByTestId("quarter-progress")).toHaveText("0 of 9 done");
    const bank = cp.getByTestId("item-Bank statements — all business accounts");
    await bank.locator('input[type="file"]').setInputFiles({ name: "td-chequing-oct-dec.pdf", mimeType: "application/pdf", buffer: await pdfFile(["TD Bank statement"]) });
    await expect(bank.getByTestId("uploaded-file")).toContainText("td-chequing-oct-dec.pdf");
    await expect(cp.getByTestId("quarter-progress")).toHaveText("1 of 9 done");
    expect((await admin.from("client_quarters").select("status").eq("id", D.cqId).single()).data!.status).toBe("partial");
    const { data: stored } = await admin.from("documents").select("storage_path").eq("client_quarter_id", D.cqId).single();
    expect(stored!.storage_path).toMatch(new RegExp(`^clients/${company}/${year}-Q4/bank_statements/`)); // pre-organized

    // Alpha uploads one item → Partial. Echo says "nothing to send" for both → Complete.
    const alphaLink = linkIn(day0.find((m) => m.context.clientQuarterId === A.cqId && m.channel === "sms")!.text, "/q#t=");
    const alphaToken = alphaLink.split("#t=")[1];
    const { data: alphaItems } = await admin.from("checklist_items").select("id, item_key").eq("client_quarter_id", A.cqId);
    const signed = await (await fetch(`${BASE}/api/uploads/sign`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${alphaToken}` },
      body: JSON.stringify({ itemId: alphaItems!.find((i) => i.item_key === "cheque_images")!.id, fileName: "cheque.png", size: PNG_1PX.length }),
    })).json();
    const form = new FormData();
    form.append("", new Blob([new Uint8Array(PNG_1PX)], { type: "image/png" }), "cheque.png");
    await fetch(abs(signed.signedUrl), { method: "PUT", body: form });
    await fetch(`${BASE}/api/uploads/complete`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${alphaToken}` }, body: JSON.stringify({ documentId: signed.documentId }) });
    const echoToken = linkIn(day0.find((m) => m.context.clientQuarterId === E.cqId && m.channel === "sms")!.text, "/q#t=").split("#t=")[1];
    const { data: echoItems } = await admin.from("checklist_items").select("id").eq("client_quarter_id", E.cqId);
    for (const it of echoItems!) {
      await fetch(`${BASE}/api/quarter-link/item`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${echoToken}` }, body: JSON.stringify({ itemId: it.id, notApplicable: true }) });
    }

    // Chase: 8 days later, reminders go ONLY to incomplete clients.
    await admin.from("client_quarters").update({ requested_at: new Date(Date.now() - 8 * DAY).toISOString() }).eq("quarter_id", quarter!.id).not("requested_at", "is", null);
    const beforeChase = outbox().length;
    await runCron();
    const chase = outbox().slice(beforeChase).filter((m) => m.templateKey === "quarter_reminder_7");
    const remindedCq = new Set(chase.map((m) => m.context.clientQuarterId));
    expect(remindedCq.has(A.cqId)).toBe(true); // partial
    expect(remindedCq.has(B.cqId)).toBe(true); // requested
    expect(remindedCq.has(D.cqId)).toBe(true); // partial
    expect(remindedCq.has(E.cqId)).toBe(false); // complete
    expect(remindedCq.has(C.cqId)).toBe(false); // never requested
    // Running again the same day sends nothing new.
    const afterFirst = outbox().length;
    await runCron();
    expect(outbox().slice(afterFirst).filter((m) => m.templateKey.startsWith("quarter_reminder")).filter((m) => [A.cqId, B.cqId, D.cqId].includes(m.context.clientQuarterId))).toHaveLength(0);

    // Delta finishes everything → complete → its reminders stop instantly; others keep going on day 14.
    const items = await cp.locator('[data-testid^="item-"]').all();
    for (const item of items) {
      const notApplicable = item.getByRole("button", { name: "Nothing to send for this one this quarter" });
      if (await notApplicable.count()) await notApplicable.click();
    }
    await expect(cp.getByTestId("quarter-complete")).toBeVisible();
    await phone.close();
    expect((await admin.from("client_quarters").select("status").eq("id", D.cqId).single()).data!.status).toBe("complete");
    await admin.from("client_quarters").update({ requested_at: new Date(Date.now() - 15 * DAY).toISOString() }).eq("quarter_id", quarter!.id).not("requested_at", "is", null);
    const before14 = outbox().length;
    await runCron();
    const day14 = new Set(outbox().slice(before14).filter((m) => m.templateKey === "quarter_reminder_14").map((m) => m.context.clientQuarterId));
    expect(day14.has(D.cqId)).toBe(false);
    expect(day14.has(A.cqId)).toBe(true);
    expect(day14.has(B.cqId)).toBe(true);

    // Staff marks Delta processed. Board now shows all five states.
    await page.reload();
    await page.getByTestId("board-row").filter({ hasText: `Delta Trucking ${tag}` }).getByRole("button", { name: "Mark processed" }).click();
    await expect(page.getByTestId("board-row").filter({ hasText: `Delta Trucking ${tag}` }).getByTestId("board-status")).toHaveText("Processed");
    await page.reload();
    expect(await boardCount(page, "not_sent")).toBe(1);
    expect(await boardCount(page, "requested")).toBe(1);
    expect(await boardCount(page, "partial")).toBe(1);
    expect(await boardCount(page, "complete")).toBe(1);
    expect(await boardCount(page, "processed")).toBe(1);
    const statusOf = async (name: string) => (await page.getByTestId("board-row").filter({ hasText: `${name} ${tag}` }).getByTestId("board-status").textContent())?.trim();
    expect(await statusOf("Charlie HST")).toBe("Not Sent");
    expect(await statusOf("Bravo Payroll")).toBe("Requested");
    expect(await statusOf("Alpha Bookkeeping")).toBe("Partial");
    expect(await statusOf("Echo Cleaning")).toBe("Complete");
    expect(await statusOf("Delta Trucking")).toBe("Processed");
    await page.goto(`/staff/quarters/${quarter!.id}?status=partial`);
    await expect(page.getByTestId("board-row")).toHaveCount(1);

    // WhatsApp delivery failure reported by Twilio → SMS fallback goes out.
    const { data: waLog } = await admin
      .from("message_log")
      .insert({ channel: "whatsapp", template_key: "quarter_request", recipient_masked: "***-***-0123", recipient_hash: "x", status: "sent", provider_id: `SM${tag}`, client_id: bookkeeping, client_quarter_id: A.cqId })
      .select("id")
      .single();
    const params = { MessageSid: `SM${tag}`, MessageStatus: "undelivered", ErrorCode: "63016" };
    const sig = createHmac("sha1", env.TWILIO_AUTH_TOKEN).update(Object.keys(params).sort().reduce((a, k) => a + k + params[k as keyof typeof params], `${env.NEXT_PUBLIC_SITE_URL}/api/webhooks/twilio/status`)).digest("base64");
    const beforeFallback = outbox().length;
    const cb = await fetch(`${BASE}/api/webhooks/twilio/status`, { method: "POST", body: new URLSearchParams(params), headers: { "x-twilio-signature": sig, "content-type": "application/x-www-form-urlencoded" } });
    expect(cb.status).toBe(200);
    const fb = outbox().slice(beforeFallback).filter((m) => m.channel === "sms" && m.context.clientQuarterId === A.cqId);
    expect(fb).toHaveLength(1);
    expect(fb[0].text).toContain("/q#t=");
    expect((await admin.from("message_log").select("status").eq("id", waLog!.id).single()).data!.status).toBe("fallback_sent");

    // Client page (magic link, no password).
    await page.goto(`/staff/clients/${company}`);
    await page.getByRole("button", { name: "Invite to client page" }).click();
    await expect(page.getByText("Sign-in link emailed.")).toBeVisible();
    const invite = outbox().reverse().find((m) => m.templateKey === "portal_sign_in" && m.context.clientId === company)!;
    const portal = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
    const pp = await portal.newPage();
    await pp.goto(linkIn(invite.text, "/portal/auth/confirm?"));
    await expect(pp.getByRole("heading", { name: `Delta Trucking ${tag}` })).toBeVisible();
    await expect(pp.getByTestId("history-quarter").filter({ hasText: `${year}-Q4` })).toContainText("Done by our team");
    // A used link can't be replayed.
    await pp.goto(linkIn(invite.text, "/portal/auth/confirm?"));
    await pp.goto("/portal/login");
    await portal.close();

    // Row Level Security: a signed-in client sees only their own records.
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: (await admin.from("clients").select("email").eq("id", company).single()).data!.email });
    const asClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    await asClient.auth.verifyOtp({ token_hash: link.properties!.hashed_token, type: "magiclink" });
    const { data: seenClients } = await asClient.from("clients").select("id");
    expect(seenClients!.map((c) => c.id)).toEqual([company]);
    expect((await asClient.from("intakes").select("id")).data).toEqual([]);
    expect((await asClient.from("audit_log").select("id")).data).toEqual([]);
    const { data: seenCq } = await asClient.from("client_quarters").select("client_id");
    expect(new Set(seenCq!.map((c) => c.client_id))).toEqual(new Set([company]));
    // Anonymous key sees nothing at all.
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    for (const table of ["intakes", "documents", "clients", "access_tokens", "audit_log", "intake_consents"]) {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? [], table).toEqual([]);
    }
  } finally {
    await admin.from("quarters").delete().eq("id", quarter!.id);
    await admin.from("clients").update({ active: false }).in("id", [bookkeeping, payroll, hst, company, echo]);
  }
});
