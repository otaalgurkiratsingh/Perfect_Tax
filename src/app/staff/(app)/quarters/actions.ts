"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { firmConfig } from "@firm/config";
import { sendPortalSignInLink } from "@/lib/portal/link";
import {
  addClientToQuarter,
  loadClientQuarter,
  openQuarter,
  refreshClientQuarterStatus,
  sendDayZeroRequests,
  sendQuarterMessage,
  syncItemFromFiles,
  type ClientRow,
  type QuarterRow,
  type QuarterTemplate,
} from "@/lib/quarterly/engine";
import { normalizePhone } from "@/lib/intake/schema";
import { requireStaff, staffAudit } from "@/lib/staff/auth";
import { adminClient } from "@/lib/supabase/admin";

const ID = /^[0-9a-f-]{36}$/i;
export interface ActionState {
  error?: string;
  message?: string;
}

export async function openQuarterAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireStaff();
  const year = Number(form.get("year"));
  const quarter = Number(form.get("quarter"));
  let quarterId: string;
  try {
    const r = await openQuarter(year, quarter, ctx.profile.id);
    quarterId = r.quarter.id;
    await staffAudit(ctx, { action: "open_quarter", targetType: "quarter", targetId: r.quarter.id, details: { label: r.quarter.label, clients: r.added, skipped: r.skippedNoServices.length } });
    if (form.get("sendNow") === "on") {
      const s = await sendDayZeroRequests(r.quarter.id);
      await staffAudit(ctx, { action: "send_quarter_requests", targetType: "quarter", targetId: r.quarter.id, details: { sent: s.sent } });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not open the quarter" };
  }
  redirect(`/staff/quarters/${quarterId}`);
}

export async function sendRequestsAction(quarterId: string): Promise<ActionState> {
  const ctx = await requireStaff();
  if (!ID.test(quarterId)) return { error: "Invalid" };
  const r = await sendDayZeroRequests(quarterId);
  await staffAudit(ctx, { action: "send_quarter_requests", targetType: "quarter", targetId: quarterId, details: { sent: r.sent } });
  refresh();
  return { message: `Sent to ${r.sent} client${r.sent === 1 ? "" : "s"}.` };
}

function nudgeTemplate(lastDay: number): QuarterTemplate {
  const days = firmConfig.reminders.quarterlyReminderDays.filter((d) => d <= Math.max(lastDay, 7));
  return `quarter_reminder_${Math.max(...days, 7)}` as QuarterTemplate;
}

export async function nudgeAction(clientQuarterId: string): Promise<ActionState> {
  const ctx = await requireStaff();
  if (!ID.test(clientQuarterId)) return { error: "Invalid" };
  const loaded = await loadClientQuarter(clientQuarterId);
  if (!loaded) return { error: "Not found" };
  if (loaded.cq.status === "not_sent") {
    await sendDayZeroRequests(loaded.quarter.id, clientQuarterId);
  } else if (["requested", "partial"].includes(loaded.cq.status)) {
    await sendQuarterMessage(clientQuarterId, nudgeTemplate(loaded.cq.last_reminder_day), { manual: true });
  } else {
    return { error: "This client is already complete." };
  }
  await staffAudit(ctx, { action: "nudge_client", targetType: "client_quarter", targetId: clientQuarterId, details: { client: loaded.client.business_name } });
  refresh();
  return { message: "Nudge sent." };
}

export async function nudgeAllAction(quarterId: string): Promise<ActionState> {
  const ctx = await requireStaff();
  if (!ID.test(quarterId)) return { error: "Invalid" };
  const { data } = await adminClient().from("client_quarters").select("id, last_reminder_day").eq("quarter_id", quarterId).in("status", ["requested", "partial"]);
  for (const row of data ?? []) await sendQuarterMessage(row.id, nudgeTemplate(row.last_reminder_day), { manual: true });
  await staffAudit(ctx, { action: "nudge_client", targetType: "quarter", targetId: quarterId, details: { bulk: true, count: data?.length ?? 0 } });
  refresh();
  return { message: `Nudged ${data?.length ?? 0} client${data?.length === 1 ? "" : "s"}.` };
}

export async function markProcessedAction(clientQuarterId: string, processed: boolean): Promise<ActionState> {
  const ctx = await requireStaff();
  if (!ID.test(clientQuarterId)) return { error: "Invalid" };
  const db = adminClient();
  if (processed) {
    await db.from("client_quarters").update({ status: "processed", processed_at: new Date().toISOString(), processed_by: ctx.profile.id }).eq("id", clientQuarterId);
  } else {
    await db.from("client_quarters").update({ status: "partial", processed_at: null, processed_by: null }).eq("id", clientQuarterId);
    await refreshClientQuarterStatus(clientQuarterId);
  }
  await staffAudit(ctx, { action: "mark_processed", targetType: "client_quarter", targetId: clientQuarterId, details: { processed } });
  refresh();
  return {};
}

/** Staff says an item still isn't right (e.g. a statement is missing a month): back to missing. */
export async function reopenItemAction(itemId: string, clientQuarterId: string): Promise<ActionState> {
  const ctx = await requireStaff();
  if (!ID.test(itemId) || !ID.test(clientQuarterId)) return { error: "Invalid" };
  await adminClient().from("checklist_items").update({ status: "missing", received_at: null, client_note: null }).eq("id", itemId).eq("client_quarter_id", clientQuarterId);
  await adminClient().from("client_quarters").update({ status: "partial", completed_at: null }).eq("id", clientQuarterId).in("status", ["complete"]);
  await refreshClientQuarterStatus(clientQuarterId);
  await staffAudit(ctx, { action: "reopen_item", targetType: "client_quarter", targetId: clientQuarterId, details: { itemId } });
  refresh();
  return {};
}

export async function resyncItemAction(itemId: string): Promise<void> {
  await requireStaff();
  if (ID.test(itemId)) await syncItemFromFiles(itemId);
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
function clientFields(form: FormData) {
  const services = firmConfig.quarterly.clientServices.map((s) => s.key).filter((k) => form.get(`service_${k}`) === "on");
  const email = String(form.get("email") ?? "").trim().toLowerCase() || null;
  const phoneRaw = String(form.get("phone") ?? "").trim();
  const waRaw = String(form.get("whatsapp_phone") ?? "").trim();
  return {
    business_name: String(form.get("business_name") ?? "").trim().slice(0, 200),
    contact_name: String(form.get("contact_name") ?? "").trim().slice(0, 200),
    email,
    phone: phoneRaw ? normalizePhone(phoneRaw) : null,
    whatsapp_phone: waRaw ? normalizePhone(waRaw) : null,
    services,
    notes: String(form.get("notes") ?? "").trim().slice(0, 2000) || null,
    phoneRaw,
    waRaw,
  };
}

function validateClient(f: ReturnType<typeof clientFields>): string | null {
  if (!f.business_name || !f.contact_name) return "Business name and contact name are required.";
  if (!f.email && !f.phone) return "Add an email or a mobile number so the client can be reached.";
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return "That email doesn't look right.";
  if (f.phoneRaw && !f.phone) return "Mobile must be a 10-digit number.";
  if (f.waRaw && !f.whatsapp_phone) return "WhatsApp number must be a 10-digit number.";
  return null;
}

export async function createClientAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireStaff();
  const f = clientFields(form);
  const problem = validateClient(f);
  if (problem) return { error: problem };
  const { phoneRaw: _p, waRaw: _w, ...row } = f;
  void _p;
  void _w;
  const { data, error } = await adminClient().from("clients").insert(row).select("id").single();
  if (error) return { error: error.code === "23505" ? "A client with that email already exists." : error.message };
  await staffAudit(ctx, { action: "create_client", targetType: "client", targetId: data.id, details: { business: row.business_name } });
  redirect(`/staff/clients/${data.id}`);
}

export async function updateClientAction(clientId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireStaff();
  if (!ID.test(clientId)) return { error: "Invalid" };
  const f = clientFields(form);
  const problem = validateClient(f);
  if (problem) return { error: problem };
  const { phoneRaw: _p, waRaw: _w, ...row } = f;
  void _p;
  void _w;
  const { error } = await adminClient().from("clients").update({ ...row, active: form.get("active") === "on" }).eq("id", clientId);
  if (error) return { error: error.code === "23505" ? "Another client already uses that email." : error.message };
  await staffAudit(ctx, { action: "update_client", targetType: "client", targetId: clientId });
  refresh();
  return { message: "Saved." };
}

export async function inviteClientAction(clientId: string): Promise<ActionState> {
  const ctx = await requireStaff();
  if (!ID.test(clientId)) return { error: "Invalid" };
  const { data: client } = await adminClient().from("clients").select("*").eq("id", clientId).single();
  if (!client?.email) return { error: "This client has no email address." };
  const ok = await sendPortalSignInLink(client as ClientRow);
  await staffAudit(ctx, { action: "invite_client", targetType: "client", targetId: clientId });
  refresh();
  return ok ? { message: "Sign-in link emailed." } : { error: "Could not send the sign-in email." };
}

export async function addToQuarterAction(clientId: string, quarterId: string): Promise<ActionState> {
  const ctx = await requireStaff();
  if (!ID.test(clientId) || !ID.test(quarterId)) return { error: "Invalid" };
  const db = adminClient();
  const [{ data: client }, { data: quarter }] = await Promise.all([
    db.from("clients").select("*").eq("id", clientId).single(),
    db.from("quarters").select("*").eq("id", quarterId).single(),
  ]);
  if (!client || !quarter) return { error: "Not found" };
  const r = await addClientToQuarter(client as ClientRow, quarter as QuarterRow);
  if (r === "no_services") return { error: "Tick at least one service (bookkeeping, payroll or HST) first." };
  await staffAudit(ctx, { action: "update_client", targetType: "client", targetId: clientId, details: { addedToQuarter: quarter.label } });
  refresh();
  return { message: r === "exists" ? "Already in that quarter." : `Added to ${quarter.label}.` };
}
