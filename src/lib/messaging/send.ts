import "server-only";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { firmConfig } from "@firm/config";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/admin";
import { signValue } from "@/lib/security/tokens";
import { normalizePhone } from "@/lib/intake/schema";
import { renderEmail, renderSms, renderWhatsApp, type TemplateKey, type TemplateVars } from "./render";

export type Channel = "email" | "sms" | "whatsapp";
export type SendStatus = "sent" | "failed" | "dry_run" | "skipped_opt_out" | "fallback_sent";

export interface MessageContext {
  intakeId?: string;
  docRequestId?: string;
  clientId?: string;
  clientQuarterId?: string;
  /** Extra non-sensitive info kept with the log row (e.g. reminder number). */
  meta?: Record<string, string | number | boolean>;
}

export interface SendResult {
  status: SendStatus;
  logId?: string;
  error?: string;
}

export function normalizeAddress(channel: Channel, to: string): string | null {
  if (channel === "email") {
    const e = to.trim().toLowerCase();
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
  }
  return normalizePhone(to);
}

export function maskAddress(channel: Channel, address: string): string {
  if (channel === "email") {
    const [user, domain] = address.split("@");
    return `${user.slice(0, 1)}***@${domain}`;
  }
  return `***-***-${address.slice(-4)}`;
}

function hashAddress(address: string): string {
  return createHash("sha256").update(address).digest("hex");
}

export function unsubscribeUrl(channel: Channel, address: string): string {
  const a = Buffer.from(address).toString("base64url");
  return `${env.siteUrl}/unsubscribe?c=${channel}&a=${a}&s=${signValue(`${channel}:${address}`)}`;
}

export async function isOptedOut(channel: Channel, address: string): Promise<boolean> {
  // Opting out of SMS also stops WhatsApp (same phone number) and vice versa.
  const channels = channel === "email" ? ["email"] : ["sms", "whatsapp"];
  const { data } = await adminClient()
    .from("opt_outs")
    .select("channel")
    .in("channel", channels)
    .eq("address", address)
    .limit(1);
  return Boolean(data && data.length > 0);
}

async function writeOutbox(entry: Record<string, unknown>) {
  const dir = env.devOutboxDir;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${entry.channel}-${entry.templateKey}.json`;
  await writeFile(path.join(dir, name), JSON.stringify(entry, null, 2));
}

async function log(row: {
  channel: Channel;
  templateKey: string;
  address: string;
  status: SendStatus;
  providerId?: string;
  error?: string;
  context: MessageContext;
}): Promise<string | undefined> {
  const { data, error } = await adminClient()
    .from("message_log")
    .insert({
      channel: row.channel,
      template_key: row.templateKey,
      recipient_masked: maskAddress(row.channel, row.address),
      recipient_hash: hashAddress(row.address),
      status: row.status,
      provider_id: row.providerId ?? null,
      error: row.error?.slice(0, 500) ?? null,
      intake_id: row.context.intakeId ?? null,
      doc_request_id: row.context.docRequestId ?? null,
      client_id: row.context.clientId ?? null,
      client_quarter_id: row.context.clientQuarterId ?? null,
      context: row.context.meta ?? {},
    })
    .select("id")
    .single();
  if (error) console.error("message_log insert failed", error.message);
  return data?.id;
}

function providerReady(channel: Channel): boolean {
  if (env.messagingMode !== "live") return false;
  if (channel === "email") return Boolean(env.resendApiKey && firmConfig.notifications.fromEmail);
  const t = env.twilio;
  if (!t.accountSid || !t.authToken) return false;
  if (channel === "sms") return Boolean(t.smsFrom || t.messagingServiceSid);
  return Boolean(t.whatsappFrom);
}

async function sendViaResend(to: string, email: { subject: string; text: string; html: string }, unsub?: string) {
  const n = firmConfig.notifications;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${n.fromName} <${n.fromEmail}>`,
      to: [to],
      reply_to: n.replyTo || undefined,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: unsub ? { "List-Unsubscribe": `<${unsub}>` } : undefined,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new Error(data.message ?? `Resend error ${res.status}`);
  return data.id;
}

async function sendViaTwilio(params: Record<string, string>) {
  const t = env.twilio;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${t.accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${t.accountSid}:${t.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ ...params, StatusCallback: `${env.siteUrl}/api/webhooks/twilio/status` }),
  });
  const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
  if (!res.ok) throw new Error(data.message ?? `Twilio error ${res.status}`);
  return data.sid;
}

export interface SendInput {
  channel: Channel;
  to: string | null | undefined;
  templateKey: TemplateKey;
  vars: TemplateVars;
  context?: MessageContext;
  /** Firm-internal alerts skip the unsubscribe footer. */
  internal?: boolean;
}

/**
 * Render + send one message on one channel, honouring opt-outs, and record
 * the outcome in message_log (template key and masked recipient only).
 */
export async function sendMessage(input: SendInput): Promise<SendResult> {
  const context = input.context ?? {};
  const address = input.to ? normalizeAddress(input.channel, input.to) : null;
  if (!address) return { status: "failed", error: "No valid address" };

  if (!input.internal && (await isOptedOut(input.channel, address))) {
    const logId = await log({ channel: input.channel, templateKey: String(input.templateKey), address, status: "skipped_opt_out", context });
    return { status: "skipped_opt_out", logId };
  }

  try {
    let outbox: Record<string, unknown>;
    let send: () => Promise<string | undefined>;
    if (input.channel === "email") {
      const unsub = input.internal ? undefined : unsubscribeUrl("email", address);
      const email = renderEmail(input.templateKey, input.vars, unsub);
      outbox = { subject: email.subject, text: email.text };
      send = () => sendViaResend(address, email, unsub);
    } else if (input.channel === "sms") {
      const body = renderSms(input.templateKey, input.vars);
      outbox = { text: body };
      const t = env.twilio;
      send = () =>
        sendViaTwilio({
          To: address,
          Body: body,
          ...(t.messagingServiceSid ? { MessagingServiceSid: t.messagingServiceSid } : { From: t.smsFrom! }),
        });
    } else {
      const wa = renderWhatsApp(input.templateKey, input.vars);
      outbox = { text: wa.body, contentSid: wa.contentSid, contentVariables: wa.contentVariables };
      send = () =>
        sendViaTwilio({
          To: `whatsapp:${address}`,
          From: `whatsapp:${env.twilio.whatsappFrom}`,
          ...(wa.contentSid
            ? { ContentSid: wa.contentSid, ContentVariables: JSON.stringify(wa.contentVariables) }
            : { Body: wa.body }),
        });
    }

    if (!providerReady(input.channel)) {
      await writeOutbox({ channel: input.channel, templateKey: input.templateKey, to: address, context, ...outbox });
      const logId = await log({ channel: input.channel, templateKey: String(input.templateKey), address, status: "dry_run", context });
      return { status: "dry_run", logId };
    }

    const providerId = await send();
    const logId = await log({ channel: input.channel, templateKey: String(input.templateKey), address, status: "sent", providerId, context });
    return { status: "sent", logId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const logId = await log({ channel: input.channel, templateKey: String(input.templateKey), address, status: "failed", error: message, context });
    return { status: "failed", logId, error: message };
  }
}

export function delivered(result: SendResult): boolean {
  return result.status === "sent" || result.status === "dry_run";
}

/** True when an automated message may go out now (firm's local send window). */
export function withinSendWindow(now: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-CA", { hour: "numeric", hourCycle: "h23", timeZone: firmConfig.firm.timezone }).format(now),
  );
  const { startHour, endHour } = firmConfig.reminders.sendWindow;
  return hour >= startHour && hour < endHour;
}
