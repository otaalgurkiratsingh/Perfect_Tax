import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { BASE, db, env, linkIn, outbox, resetRateLimits, submitIntakeViaApi } from "./helpers";

const H = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

async function runCron() {
  const res = await fetch(`${BASE}/api/cron/run`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CRON_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ ignoreSendWindow: true }),
  });
  expect(res.status).toBe(200);
  return res.json();
}

const sentFor = (intakeId: string, templateKey: string) => outbox().filter((m) => m.context.intakeId === intakeId && m.templateKey === templateKey);

test.beforeEach(async () => {
  await resetRateLimits();
});

test("cron endpoint refuses calls without the secret", async () => {
  expect((await fetch(`${BASE}/api/cron/run`, { method: "POST" })).status).toBe(401);
  expect((await fetch(`${BASE}/api/cron/run`, { method: "POST", headers: { authorization: "Bearer nope" } })).status).toBe(401);
});

test("abandoned form: one reminder at 24h, one at 72h, then it stops — and the link resumes the form", async ({ browser }) => {
  const draft = await submitIntakeViaApi({ name: "Navdeep Abandon Test", submit: false, withDocs: false });
  await db().from("intakes").update({ last_activity_at: ago(23 * H) }).eq("id", draft.id);
  await runCron();
  expect(sentFor(draft.id, "intake_abandoned_1")).toHaveLength(0); // not yet 24h

  await db().from("intakes").update({ last_activity_at: ago(25 * H) }).eq("id", draft.id);
  await runCron();
  const first = sentFor(draft.id, "intake_abandoned_1");
  expect(first.map((m) => m.channel).sort()).toEqual(["email", "sms"]);
  const email = first.find((m) => m.channel === "email")!;
  expect(email.text).toContain("Unsubscribe:");
  expect(first.find((m) => m.channel === "sms")!.text).toMatch(/Reply STOP to opt out\.$/);

  await runCron();
  expect(sentFor(draft.id, "intake_abandoned_1")).toHaveLength(2); // still only the first pair

  // Resume link restores everything on a new device.
  const link = linkIn(email.text, "/intake#resume=");
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(link);
  await expect(page.getByText("Welcome back — your answers and files are restored.")).toBeVisible();
  await ctx.close();
  // Visiting doesn't count as activity; simulate the client leaving again.
  await db().from("intakes").update({ last_activity_at: ago(73 * H), last_abandon_reminder_at: ago(49 * H) }).eq("id", draft.id);
  await runCron();
  expect(sentFor(draft.id, "intake_abandoned_2")).toHaveLength(2);

  await db().from("intakes").update({ last_activity_at: ago(300 * H), last_abandon_reminder_at: ago(200 * H) }).eq("id", draft.id);
  await runCron();
  await runCron();
  expect(sentFor(draft.id, "intake_abandoned_1")).toHaveLength(2);
  expect(sentFor(draft.id, "intake_abandoned_2")).toHaveLength(2);
  const { data } = await db().from("intakes").select("abandon_reminders_sent").eq("id", draft.id).single();
  expect(data!.abandon_reminders_sent).toBe(2);
});

test("missing-doc reminders go weekly and stop after 3", async ({ page }) => {
  const intake = await submitIntakeViaApi({ name: "Jaspreet Reminder Test" });
  await page.goto(`/staff/intakes/${intake.id}`);
  await page.getByRole("button", { name: "Request missing docs" }).click();
  await page.getByLabel("T4 / T5 or other tax slips").check();
  await page.getByRole("button", { name: "Send request (1)" }).click();
  await expect(page.getByTestId("doc-request-status").first()).toHaveText("open");
  const { data: req } = await db().from("doc_requests").select("id").eq("intake_id", intake.id).single();

  await runCron();
  expect(sentFor(intake.id, "doc_request_reminder")).toHaveLength(0); // not a week yet
  for (let i = 1; i <= 4; i++) {
    await db().from("doc_requests").update({ last_sent_at: ago(8 * 24 * H) }).eq("id", req!.id);
    await runCron();
    expect(sentFor(intake.id, "doc_request_reminder")).toHaveLength(Math.min(i, 3) * 2); // email + sms each time
  }
  const { data: after } = await db().from("doc_requests").select("reminders_sent, status").eq("id", req!.id).single();
  expect(after).toEqual({ reminders_sent: 3, status: "open" });
  // Each reminder carries a fresh, working link.
  const last = sentFor(intake.id, "doc_request_reminder").filter((m) => m.channel === "sms").pop()!;
  const res = await fetch(`${BASE}/api/doc-request`, { headers: { authorization: `Bearer ${linkIn(last.text, "/upload#t=").split("#t=")[1]}` } });
  expect(res.status).toBe(200);
});

function twilioSign(path: string, params: Record<string, string>) {
  const url = `${env.NEXT_PUBLIC_SITE_URL}${path}`;
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", env.TWILIO_AUTH_TOKEN).update(data).digest("base64");
}

test("STOP by text and email unsubscribe are honoured (CASL)", async ({ browser }) => {
  const phone = "+16475550188";
  await db().from("opt_outs").delete().eq("address", phone);
  const params = { From: phone, Body: "STOP", MessageSid: "SMtest" };
  const bad = await fetch(`${BASE}/api/webhooks/twilio`, { method: "POST", body: new URLSearchParams(params), headers: { "x-twilio-signature": "forged" } });
  expect(bad.status).toBe(403);
  const ok = await fetch(`${BASE}/api/webhooks/twilio`, {
    method: "POST",
    body: new URLSearchParams(params),
    headers: { "x-twilio-signature": twilioSign("/api/webhooks/twilio", params), "content-type": "application/x-www-form-urlencoded" },
  });
  expect(ok.status).toBe(200);

  // Next text to that number is skipped, email still goes.
  const intake = await submitIntakeViaApi({ name: "Optout Sms Test", withDocs: false });
  const { data: logs } = await db().from("message_log").select("channel, status").eq("intake_id", intake.id).eq("template_key", "client_intake_received");
  expect(logs).toEqual(expect.arrayContaining([{ channel: "sms", status: "skipped_opt_out" }, { channel: "email", status: "dry_run" }]));

  const start = { From: phone, Body: "START", MessageSid: "SMtest2" };
  await fetch(`${BASE}/api/webhooks/twilio`, {
    method: "POST",
    body: new URLSearchParams(start),
    headers: { "x-twilio-signature": twilioSign("/api/webhooks/twilio", start), "content-type": "application/x-www-form-urlencoded" },
  });
  expect((await db().from("opt_outs").select("address").eq("address", phone)).data).toHaveLength(0);

  // Email unsubscribe link from the client's auto-reply.
  const email = outbox().filter((m) => m.context.intakeId === intake.id && m.channel === "email" && m.templateKey === "client_intake_received")[0];
  const unsub = linkIn(email.text, "/unsubscribe?");
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto(unsub);
  await page.getByRole("button", { name: "Yes, unsubscribe me" }).click();
  await expect(page.getByText("you're unsubscribed")).toBeVisible();
  // A tampered link is rejected.
  await page.goto(unsub.replace(/s=[^&]+/, "s=forged"));
  await expect(page.getByText("isn't valid")).toBeVisible();
  await ctx.close();
  expect((await db().from("opt_outs").select("channel").eq("address", intake.email)).data).toEqual([{ channel: "email" }]);
});

test("old intakes are flagged for deletion review (never auto-deleted); admin can delete", async ({ page }) => {
  const intake = await submitIntakeViaApi({ name: "Retention Old Test" });
  await db().from("intakes").update({ created_at: ago(400 * 24 * H) }).eq("id", intake.id);
  await db().from("app_settings").update({ retention_months: 12 }).eq("id", 1);
  try {
    await runCron();
    const { data } = await db().from("intakes").select("retention_flagged_at").eq("id", intake.id).single();
    expect(data!.retention_flagged_at).not.toBeNull();
    await page.goto("/staff?status=retention");
    await page.getByRole("link", { name: "Retention Old Test" }).first().click();
    await expect(page.getByText("Flagged for deletion review")).toBeVisible();
    await page.getByLabel("Reference to confirm deletion").fill(intake.reference);
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/status=retention/);
    expect((await db().from("intakes").select("id").eq("id", intake.id)).data).toHaveLength(0);
    expect((await db().from("documents").select("id").eq("intake_id", intake.id)).data).toHaveLength(0);
    const { data: audit } = await db().from("audit_log").select("action").eq("target_id", intake.id).eq("action", "delete_intake");
    expect(audit).toHaveLength(1);
  } finally {
    await db().from("app_settings").update({ retention_months: null }).eq("id", 1);
  }
});
