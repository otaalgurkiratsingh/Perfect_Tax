import "server-only";
import { firmConfig } from "@firm/config";
import { env } from "@/lib/env";
import { delivered, sendMessage, type SendResult } from "@/lib/messaging/send";
import { issueToken } from "@/lib/security/tokens";
import { adminClient } from "@/lib/supabase/admin";
import { buildChecklist, computeStatus, type ClientQuarterStatus, type ItemStatus } from "./checklist";
import { quarterInfo } from "./periods";

const DAY = 86_400_000;

export interface ClientRow {
  id: string;
  business_name: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  services: string[];
  active: boolean;
  auth_user_id: string | null;
}

export interface QuarterRow {
  id: string;
  year: number;
  quarter: number;
  label: string;
  period_start: string;
  period_end: string;
  status: "open" | "closed";
}

export interface ClientQuarterRow {
  id: string;
  client_id: string;
  quarter_id: string;
  status: ClientQuarterStatus;
  requested_at: string | null;
  last_reminder_day: number;
  last_reminder_at: string | null;
  completed_at: string | null;
  processed_at: string | null;
}

export interface ChecklistItemRow {
  id: string;
  client_quarter_id: string;
  item_key: string;
  label: string;
  instructions: string;
  required: boolean;
  bank_statement: boolean;
  sort_order: number;
  status: ItemStatus;
  received_at: string | null;
  client_note: string | null;
}

export function periodLabelOf(q: Pick<QuarterRow, "year" | "quarter">): string {
  return quarterInfo(q.year, q.quarter).periodLabel;
}

/** Create the per-client checklist for one client in one quarter (idempotent). */
export async function addClientToQuarter(client: ClientRow, quarter: QuarterRow): Promise<"added" | "exists" | "no_services"> {
  const items = buildChecklist(client.services, firmConfig.quarterly.checklistTemplates, periodLabelOf(quarter));
  if (items.length === 0) return "no_services";
  const db = adminClient();
  const { data: cq, error } = await db
    .from("client_quarters")
    .insert({ client_id: client.id, quarter_id: quarter.id })
    .select("id")
    .maybeSingle();
  if (error?.code === "23505") return "exists";
  if (error || !cq) throw new Error(`Could not add client to quarter: ${error?.message}`);
  const { error: itemsError } = await db.from("checklist_items").insert(items.map((i) => ({ ...i, client_quarter_id: cq.id })));
  if (itemsError) throw new Error(itemsError.message);
  return "added";
}

/** Staff "open quarter": one click generates every active client's checklist. */
export async function openQuarter(year: number, quarter: number, staffId: string) {
  const info = quarterInfo(year, quarter);
  const db = adminClient();
  const { data: q, error } = await db
    .from("quarters")
    .insert({ year, quarter, label: info.label, period_start: info.periodStart, period_end: info.periodEnd, opened_by: staffId })
    .select("*")
    .single();
  if (error?.code === "23505") throw new Error(`${info.label} is already open`);
  if (error || !q) throw new Error(error?.message ?? "Could not open quarter");
  const { data: clients } = await db.from("clients").select("*").eq("active", true);
  const result = { quarter: q as QuarterRow, added: 0, skippedNoServices: [] as string[] };
  for (const c of (clients ?? []) as ClientRow[]) {
    const r = await addClientToQuarter(c, q as QuarterRow);
    if (r === "added") result.added++;
    if (r === "no_services") result.skippedNoServices.push(c.business_name);
  }
  return result;
}

export async function loadClientQuarter(id: string) {
  const db = adminClient();
  const { data: cq } = await db.from("client_quarters").select("*").eq("id", id).maybeSingle();
  if (!cq) return null;
  const [{ data: client }, { data: quarter }, { data: items }] = await Promise.all([
    db.from("clients").select("*").eq("id", cq.client_id).single(),
    db.from("quarters").select("*").eq("id", cq.quarter_id).single(),
    db.from("checklist_items").select("*").eq("client_quarter_id", id).order("sort_order"),
  ]);
  return {
    cq: cq as ClientQuarterRow,
    client: client as ClientRow,
    quarter: quarter as QuarterRow,
    items: (items ?? []) as ChecklistItemRow[],
  };
}

/** Recalculate a client's quarter status from its checklist. Completing it stops reminders immediately. */
export async function refreshClientQuarterStatus(id: string): Promise<ClientQuarterStatus | null> {
  const loaded = await loadClientQuarter(id);
  if (!loaded) return null;
  const { cq, items } = loaded;
  const next = computeStatus(cq.status, Boolean(cq.requested_at), items);
  if (next !== cq.status) {
    await adminClient()
      .from("client_quarters")
      .update({ status: next, completed_at: next === "complete" ? new Date().toISOString() : null })
      .eq("id", id)
      .neq("status", "processed");
  }
  return next;
}

/** Mark one checklist item received/missing based on its uploaded files. */
export async function syncItemFromFiles(itemId: string) {
  const db = adminClient();
  const { data: item } = await db.from("checklist_items").select("id, status, client_quarter_id").eq("id", itemId).single();
  if (!item) return;
  const { count } = await db.from("documents").select("id", { count: "exact", head: true }).eq("checklist_item_id", itemId).eq("status", "uploaded");
  if ((count ?? 0) > 0 && item.status !== "received") {
    await db.from("checklist_items").update({ status: "received", received_at: new Date().toISOString() }).eq("id", itemId);
  } else if ((count ?? 0) === 0 && item.status === "received") {
    await db.from("checklist_items").update({ status: "missing", received_at: null }).eq("id", itemId);
  }
  await refreshClientQuarterStatus(item.client_quarter_id);
}

function linkExpiry(quarter: QuarterRow): Date {
  const afterPeriod = new Date(`${quarter.period_end}T23:59:59Z`).getTime() + firmConfig.security.quarterLinkDaysAfterPeriodEnd * DAY;
  return new Date(Math.max(afterPeriod, Date.now() + 30 * DAY));
}

export type QuarterTemplate = "quarter_request" | "quarter_reminder_7" | "quarter_reminder_14" | "quarter_reminder_21" | "quarter_reminder_28";

export async function quarterMessageVars(clientQuarterId: string) {
  const loaded = await loadClientQuarter(clientQuarterId);
  if (!loaded) throw new Error("Client quarter not found");
  const { client, quarter, items } = loaded;
  const token = await issueToken({ purpose: "quarter_upload", clientQuarterId, expiresAt: linkExpiry(quarter) });
  const missing = items.filter((i) => i.status === "missing");
  return {
    loaded,
    vars: {
      contactName: client.contact_name.split(/\s+/)[0] || client.contact_name,
      businessName: client.business_name,
      quarterLabel: quarter.label,
      periodLabel: periodLabelOf(quarter),
      itemList: (missing.length ? missing : items).map((i) => `• ${i.label}`).join("\n"),
      uploadUrl: `${env.siteUrl}/q#t=${token}`,
    },
  };
}

type Sender = (input: Parameters<typeof sendMessage>[0]) => Promise<SendResult>;

/**
 * Channel plan for one quarterly message: WhatsApp first (when the firm has it
 * switched on and the client has a WhatsApp number), SMS if WhatsApp didn't go
 * through, and email alongside. Pure apart from the injected sender (unit-tested).
 */
export async function deliverQuarterMessage(
  client: Pick<ClientRow, "id" | "email" | "phone" | "whatsapp_phone">,
  templateKey: QuarterTemplate,
  vars: Record<string, string>,
  context: { clientId: string; clientQuarterId: string; meta: Record<string, string | number | boolean> },
  opts: { whatsappEnabled: boolean; send?: Sender },
) {
  const send = opts.send ?? sendMessage;
  const results: { channel: string; result: SendResult }[] = [];
  let textHandled = false;
  if (opts.whatsappEnabled && client.whatsapp_phone) {
    const wa = await send({ channel: "whatsapp", to: client.whatsapp_phone, templateKey, vars, context });
    results.push({ channel: "whatsapp", result: wa });
    textHandled = delivered(wa) || wa.status === "skipped_opt_out";
  }
  const smsTo = client.phone || client.whatsapp_phone;
  if (!textHandled && smsTo) {
    const fallback = results.length > 0;
    const sms = await send({ channel: "sms", to: smsTo, templateKey, vars, context: { ...context, meta: { ...context.meta, fallback } } });
    results.push({ channel: "sms", result: sms });
  }
  if (client.email) results.push({ channel: "email", result: await send({ channel: "email", to: client.email, templateKey, vars, context }) });
  return { delivered: results.some((r) => delivered(r.result)), results };
}

export async function sendQuarterMessage(clientQuarterId: string, templateKey: QuarterTemplate, meta: Record<string, string | number | boolean> = {}) {
  const { loaded, vars } = await quarterMessageVars(clientQuarterId);
  const context = { clientId: loaded.client.id, clientQuarterId, meta: { ...meta, template: templateKey } };
  return deliverQuarterMessage(loaded.client, templateKey, vars, context, { whatsappEnabled: firmConfig.features.whatsappEnabled });
}

/** Day 0: send the request to every client in the quarter that hasn't been asked yet. */
export async function sendDayZeroRequests(quarterId: string, onlyClientQuarterId?: string) {
  const db = adminClient();
  let q = db.from("client_quarters").select("id").eq("quarter_id", quarterId).eq("status", "not_sent");
  if (onlyClientQuarterId) q = q.eq("id", onlyClientQuarterId);
  const { data } = await q;
  let sent = 0;
  for (const { id } of data ?? []) {
    const { data: claimed } = await db
      .from("client_quarters")
      .update({ status: "requested", requested_at: new Date().toISOString(), last_reminder_day: 0 })
      .eq("id", id)
      .eq("status", "not_sent")
      .select("id");
    if (!claimed?.length) continue;
    await refreshClientQuarterStatus(id);
    await sendQuarterMessage(id, "quarter_request", { day: 0 });
    sent++;
  }
  return { sent };
}

/** Status-callback hook: a WhatsApp message failed after Twilio accepted it → send the SMS instead. */
export async function whatsappFailedFallback(messageLogId: string) {
  const db = adminClient();
  const { data: log } = await db
    .from("message_log")
    .update({ status: "failed" })
    .eq("id", messageLogId)
    .eq("channel", "whatsapp")
    .neq("status", "fallback_sent")
    .select("id, client_quarter_id, template_key")
    .maybeSingle();
  if (!log?.client_quarter_id) return false;
  const { loaded, vars } = await quarterMessageVars(log.client_quarter_id);
  const to = loaded.client.phone || loaded.client.whatsapp_phone;
  if (!to) return false;
  const r = await sendMessage({
    channel: "sms",
    to,
    templateKey: log.template_key,
    vars,
    context: { clientId: loaded.client.id, clientQuarterId: log.client_quarter_id, meta: { fallback: true } },
  });
  if (delivered(r)) await db.from("message_log").update({ status: "fallback_sent" }).eq("id", log.id);
  return delivered(r);
}
