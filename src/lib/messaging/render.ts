// Message rendering. Templates live in firm.config.ts. A template may only use
// the variables it declares (plus the firm's own name/phone/email); anything
// else throws, so sensitive fields can't leak into a message by accident.

import { firmConfig } from "@firm/config";
import type { MessageTemplate } from "@/lib/config/types";

export type TemplateKey = string;
export type TemplateVars = Record<string, string>;

const GLOBAL_VARS = ["firmName", "firmPhone", "firmEmail"] as const;
export const SMS_OPT_OUT = "Reply STOP to opt out.";

/** Field names that must never be passed to any template. */
const FORBIDDEN_VARS = /^(sin|dob|password)$|Sin$|SIN|[Ss]ocial|[Bb]irth|[Aa]ccount|[Ss]ecret/;

function globals(): TemplateVars {
  return {
    firmName: firmConfig.firm.name,
    firmPhone: firmConfig.firm.phone,
    firmEmail: firmConfig.firm.email,
  };
}

export function getTemplate(key: TemplateKey): MessageTemplate {
  const t = (firmConfig.messages as Record<string, MessageTemplate>)[key];
  if (!t) throw new Error(`Unknown message template ${String(key)}`);
  return t;
}

function fill(text: string, allowed: Set<string>, vars: TemplateVars, key: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!allowed.has(name)) throw new Error(`Template ${key} uses undeclared variable {{${name}}}`);
    const value = vars[name];
    if (value === undefined) throw new Error(`Template ${key} is missing a value for {{${name}}}`);
    return value;
  });
}

function prepare(key: TemplateKey, vars: TemplateVars) {
  const template = getTemplate(key);
  for (const name of Object.keys(vars)) {
    if (FORBIDDEN_VARS.test(name)) throw new Error(`Refusing to render sensitive variable ${name}`);
    if (!template.variables.includes(name)) throw new Error(`Template ${String(key)} does not accept {{${name}}}`);
  }
  const allowed = new Set<string>([...template.variables, ...GLOBAL_VARS]);
  return { template, allowed, all: { ...globals(), ...vars } };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderEmail(key: TemplateKey, vars: TemplateVars, unsubscribeUrl?: string): RenderedEmail {
  const { template, allowed, all } = prepare(key, vars);
  if (!template.email) throw new Error(`Template ${String(key)} has no email version`);
  const subject = fill(template.email.subject, allowed, all, String(key));
  const body = fill(template.email.body, allowed, all, String(key));
  const buttonUrl = template.email.buttonUrlVar ? all[template.email.buttonUrlVar] : undefined;
  const buttonLabel = template.email.buttonLabel;
  const f = firmConfig.firm;
  const c = firmConfig.branding.colors;

  const footerLines = [f.name, ...f.addressLines, `Tel: ${f.phone}`];
  const textParts = [body];
  if (buttonUrl && buttonLabel) textParts.push(`${buttonLabel}: ${buttonUrl}`);
  textParts.push("—", footerLines.join("\n"));
  if (unsubscribeUrl) textParts.push(`Unsubscribe: ${unsubscribeUrl}`);
  const text = textParts.join("\n\n");

  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button =
    buttonUrl && buttonLabel
      ? `<p style="margin:24px 0"><a href="${escapeHtml(buttonUrl)}" style="background:${c.accent};color:${c.accentText};padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">${escapeHtml(buttonLabel)}</a></p>`
      : "";
  const unsub = unsubscribeUrl
    ? `<p style="margin:8px 0 0"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#666">Unsubscribe</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:${c.brand};color:${c.brandText};padding:16px 20px;border-radius:8px 8px 0 0;font-weight:bold;font-size:18px">${escapeHtml(f.name)}</div>
<div style="background:#fff;padding:24px 20px;border-radius:0 0 8px 8px;font-size:16px">${paragraphs}${button}</div>
<div style="color:#666;font-size:12px;padding:16px 4px;line-height:1.5">${footerLines.map(escapeHtml).join("<br>")}${unsub}</div>
</div></body></html>`;
  return { subject, text, html };
}

/** SMS always names the firm (via the template) and ends with the STOP opt-out. */
export function renderSms(key: TemplateKey, vars: TemplateVars): string {
  const { template, allowed, all } = prepare(key, vars);
  if (!template.sms) throw new Error(`Template ${String(key)} has no SMS version`);
  return `${fill(template.sms, allowed, all, String(key))} ${SMS_OPT_OUT}`;
}

export interface RenderedWhatsApp {
  body: string;
  contentSid: string;
  contentVariables: Record<string, string>;
}

export function renderWhatsApp(key: TemplateKey, vars: TemplateVars): RenderedWhatsApp {
  const { template, allowed, all } = prepare(key, vars);
  if (!template.whatsapp) throw new Error(`Template ${String(key)} has no WhatsApp version`);
  const contentVariables: Record<string, string> = {};
  template.whatsapp.contentVariables.forEach((name, i) => {
    contentVariables[String(i + 1)] = all[name] ?? "";
  });
  return {
    body: `${fill(template.whatsapp.body, allowed, all, String(key))} ${SMS_OPT_OUT}`,
    contentSid: template.whatsapp.contentSid,
    contentVariables,
  };
}

export function hasChannel(key: TemplateKey, channel: "email" | "sms" | "whatsapp"): boolean {
  return Boolean(getTemplate(key)[channel]);
}
