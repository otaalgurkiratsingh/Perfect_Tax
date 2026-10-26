import "server-only";
import { firmConfig } from "@firm/config";
import { env } from "@/lib/env";
import { getDocRequest, sendDocRequestLink } from "@/lib/docRequests";
import { firstName, sanitizeAnswers } from "@/lib/intake/schema";
import { getIntake, resumeExpiry, type IntakeRow } from "@/lib/intake/server";
import { sendMessage, withinSendWindow } from "@/lib/messaging/send";
import { issueToken } from "@/lib/security/tokens";
import { adminClient, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { runQuarterlyChase } from "@/lib/quarterly/chase";

// Scheduled work. Every job is idempotent and "claims" each row with a
// conditional update before sending, so overlapping runs can never send the
// same reminder twice. Run every 15 minutes by netlify/functions/scheduled-jobs.mts.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BATCH = 200;

export interface JobOptions {
  now?: Date;
  /** Local testing only: ignore the firm's daytime send window. */
  ignoreSendWindow?: boolean;
}

export interface JobReport {
  abandonment: { first: number; second: number };
  docRequests: { reminders: number };
  quarterly: Awaited<ReturnType<typeof runQuarterlyChase>>;
  retention: { flagged: number };
  cleanup: { rateLimits: number; tokens: number; pendingUploads: number };
  sendWindowOpen: boolean;
}

/** Abandoned drafts: ONE reminder at 24h, ONE more at 72h, then stop. */
export async function abandonmentReminders(now: Date): Promise<JobReport["abandonment"]> {
  const db = adminClient();
  const [firstAfter, secondAfter] = firmConfig.reminders.abandonmentHours;
  const result = { first: 0, second: 0 };
  for (const [step, hours] of [
    [1, firstAfter],
    [2, secondAfter],
  ] as const) {
    let q = db
      .from("intakes")
      .select("id")
      .eq("status", "draft")
      .eq("abandon_reminders_sent", step - 1)
      .or("email.not.is.null,phone.not.is.null")
      .lte("last_activity_at", new Date(now.getTime() - hours * HOUR).toISOString())
      .limit(BATCH);
    // Never send the second reminder less than a day after the first.
    if (step === 2) q = q.lte("last_abandon_reminder_at", new Date(now.getTime() - DAY).toISOString());
    const { data } = await q;
    for (const { id } of data ?? []) {
      const { data: claimed } = await db
        .from("intakes")
        .update({ abandon_reminders_sent: step, last_abandon_reminder_at: now.toISOString() })
        .eq("id", id)
        .eq("status", "draft")
        .eq("abandon_reminders_sent", step - 1)
        .select("id");
      if (!claimed?.length) continue;
      const intake = await getIntake(id);
      if (!intake) continue;
      await sendAbandonmentReminder(intake, step, now);
      if (step === 1) result.first++;
      else result.second++;
    }
  }
  return result;
}

async function sendAbandonmentReminder(intake: IntakeRow, step: 1 | 2, now: Date) {
  const expires = resumeExpiry(now);
  const token = await issueToken({ purpose: "intake_resume", intakeId: intake.id, expiresAt: expires });
  const vars = {
    firstName: firstName(sanitizeAnswers(intake.answers)),
    resumeUrl: `${env.siteUrl}/intake#resume=${token}`,
    expiresDays: String(firmConfig.security.resumeTokenDays),
  };
  const templateKey = step === 1 ? "intake_abandoned_1" : "intake_abandoned_2";
  const context = { intakeId: intake.id, meta: { reminder: step } };
  await Promise.all([
    intake.email ? sendMessage({ channel: "email", to: intake.email, templateKey, vars, context }) : null,
    intake.phone ? sendMessage({ channel: "sms", to: intake.phone, templateKey, vars, context }) : null,
  ]);
}

/** Missing-document requests: a reminder every week while still open, at most 3, then stop. */
export async function docRequestReminders(now: Date): Promise<JobReport["docRequests"]> {
  const db = adminClient();
  const { docRequestIntervalDays, docRequestMaxReminders } = firmConfig.reminders;
  const { data } = await db
    .from("doc_requests")
    .select("id, reminders_sent")
    .eq("status", "open")
    .lt("reminders_sent", docRequestMaxReminders)
    .lte("last_sent_at", new Date(now.getTime() - docRequestIntervalDays * DAY).toISOString())
    .limit(BATCH);
  let reminders = 0;
  for (const row of data ?? []) {
    const { data: claimed } = await db
      .from("doc_requests")
      .update({ reminders_sent: row.reminders_sent + 1, last_sent_at: now.toISOString() })
      .eq("id", row.id)
      .eq("status", "open")
      .eq("reminders_sent", row.reminders_sent)
      .select("id");
    if (!claimed?.length) continue;
    const request = await getDocRequest(row.id);
    const intake = request ? await getIntake(request.intake_id) : null;
    if (!request || !intake) continue;
    await sendDocRequestLink({ ...request, reminders_sent: row.reminders_sent }, intake, true);
    reminders++;
  }
  return { reminders };
}

/** Flag (never delete) intakes older than the retention period for an admin review. */
export async function retentionFlags(now: Date): Promise<JobReport["retention"]> {
  const db = adminClient();
  const { data: settings } = await db.from("app_settings").select("retention_months").eq("id", 1).maybeSingle();
  const months = settings?.retention_months ?? firmConfig.retention.defaultMonths;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  const { data } = await db
    .from("intakes")
    .update({ retention_flagged_at: now.toISOString() })
    .is("retention_flagged_at", null)
    .lt("created_at", cutoff.toISOString())
    .select("id");
  return { flagged: data?.length ?? 0 };
}

export async function cleanup(now: Date): Promise<JobReport["cleanup"]> {
  const db = adminClient();
  const { data: rl } = await db.from("rate_limits").delete().lt("window_start", new Date(now.getTime() - DAY).toISOString()).select("bucket");
  const { data: tk } = await db.from("access_tokens").delete().lt("expires_at", new Date(now.getTime() - 30 * DAY).toISOString()).select("id");
  // Uploads that were started but never finished (browser closed mid-upload).
  const { data: pending } = await db
    .from("documents")
    .select("id, storage_path")
    .eq("status", "pending")
    .lt("created_at", new Date(now.getTime() - DAY).toISOString())
    .limit(BATCH);
  if (pending?.length) {
    await db.storage.from(DOCUMENTS_BUCKET).remove(pending.map((p) => p.storage_path));
    await db.from("documents").delete().in("id", pending.map((p) => p.id));
  }
  return { rateLimits: rl?.length ?? 0, tokens: tk?.length ?? 0, pendingUploads: pending?.length ?? 0 };
}

export async function runAllJobs(opts: JobOptions = {}): Promise<JobReport> {
  const now = opts.now ?? new Date();
  const open = opts.ignoreSendWindow || withinSendWindow(now);
  const empty = { abandonment: { first: 0, second: 0 }, docRequests: { reminders: 0 } };
  const messages = open
    ? { abandonment: await abandonmentReminders(now), docRequests: await docRequestReminders(now) }
    : empty;
  const quarterly = await runQuarterlyChase(now, { sendWindowOpen: open });
  return {
    ...messages,
    quarterly,
    retention: await retentionFlags(now),
    cleanup: await cleanup(now),
    sendWindowOpen: open,
  };
}
