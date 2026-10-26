import "server-only";
import { firmConfig } from "@firm/config";
import { env } from "@/lib/env";
import { firstName, sanitizeAnswers } from "@/lib/intake/schema";
import { getIntake, type IntakeRow } from "@/lib/intake/server";
import { delivered, sendMessage } from "@/lib/messaging/send";
import { issueToken, revokeTokens } from "@/lib/security/tokens";
import { adminClient } from "@/lib/supabase/admin";

const DAY = 86_400_000;

export interface DocRequestRow {
  id: string;
  intake_id: string;
  items: string[];
  note: string | null;
  status: "open" | "complete" | "stopped";
  created_at: string;
  completed_at: string | null;
  reminders_sent: number;
  last_sent_at: string | null;
}

export async function getDocRequest(id: string): Promise<DocRequestRow | null> {
  const { data } = await adminClient().from("doc_requests").select("*").eq("id", id).maybeSingle();
  return (data as DocRequestRow) ?? null;
}

/**
 * Send (or re-send) the secure upload-only link for a request. Each send mints
 * a fresh 7-day token, so reminders always carry a working link.
 */
export async function sendDocRequestLink(request: DocRequestRow, intake: IntakeRow, reminder: boolean): Promise<boolean> {
  const days = firmConfig.security.docRequestTokenDays;
  const token = await issueToken({
    purpose: "doc_request",
    intakeId: intake.id,
    docRequestId: request.id,
    expiresAt: new Date(Date.now() + days * DAY),
  });
  const vars = {
    firstName: firstName(sanitizeAnswers(intake.answers)),
    itemCount: String(request.items.length),
    uploadUrl: `${env.siteUrl}/upload#t=${token}`,
    expiresDays: String(days),
  };
  const templateKey = reminder ? "doc_request_reminder" : "doc_request";
  const context = { intakeId: intake.id, docRequestId: request.id, meta: { reminder: reminder ? request.reminders_sent + 1 : 0 } };
  const results = await Promise.all([
    intake.email ? sendMessage({ channel: "email", to: intake.email, templateKey, vars, context }) : null,
    intake.phone ? sendMessage({ channel: "sms", to: intake.phone, templateKey, vars, context }) : null,
  ]);
  return results.some((r) => r && delivered(r));
}

export async function createDocRequest(input: { intakeId: string; items: string[]; note: string; staffId: string }) {
  const valid = new Set(firmConfig.intake.documentSlots.map((s) => s.key));
  const items = [...new Set(input.items.filter((i) => valid.has(i)))];
  if (items.length === 0) throw new Error("Pick at least one document");
  const intake = await getIntake(input.intakeId);
  if (!intake || intake.status === "draft") throw new Error("Intake not found");
  if (!intake.email && !intake.phone) throw new Error("This client has no email or phone to send the link to");

  const db = adminClient();
  // One open request at a time: a new one replaces any earlier open request.
  const { data: open } = await db.from("doc_requests").select("id").eq("intake_id", intake.id).eq("status", "open");
  for (const r of open ?? []) {
    await db.from("doc_requests").update({ status: "stopped" }).eq("id", r.id);
    await revokeTokens({ docRequestId: r.id, purpose: "doc_request" });
  }
  const { data: request, error } = await db
    .from("doc_requests")
    .insert({ intake_id: intake.id, items, note: input.note.slice(0, 1000) || null, created_by: input.staffId, last_sent_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error || !request) throw new Error(`Could not create request: ${error?.message}`);
  await db.from("intakes").update({ status: "docs_missing", missing_docs_received_at: null }).eq("id", intake.id);
  const sent = await sendDocRequestLink(request as DocRequestRow, intake, false);
  return { request: request as DocRequestRow, sent };
}

/** Which requested items now have at least one uploaded file. */
export async function docRequestProgress(request: DocRequestRow) {
  const { data } = await adminClient()
    .from("documents")
    .select("doc_type")
    .eq("doc_request_id", request.id)
    .eq("status", "uploaded");
  const received = new Set((data ?? []).map((d) => d.doc_type));
  return { received, missing: request.items.filter((i) => !received.has(i)) };
}

/** After each upload: when every requested item has arrived, close the request and flip the intake. */
export async function completeDocRequestIfDone(requestId: string): Promise<boolean> {
  const request = await getDocRequest(requestId);
  if (!request || request.status !== "open") return false;
  const { missing } = await docRequestProgress(request);
  if (missing.length) return false;
  const db = adminClient();
  const now = new Date().toISOString();
  const { data } = await db
    .from("doc_requests")
    .update({ status: "complete", completed_at: now })
    .eq("id", request.id)
    .eq("status", "open")
    .select("id");
  if (!data?.length) return false;
  await db.from("intakes").update({ status: "in_review", missing_docs_received_at: now }).eq("id", request.intake_id).eq("status", "docs_missing");
  return true;
}
