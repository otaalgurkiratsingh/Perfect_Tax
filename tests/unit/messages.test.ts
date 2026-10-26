import { describe, expect, it } from "vitest";
import { firmConfig } from "@firm/config";
import { renderEmail, renderSms, renderWhatsApp, SMS_OPT_OUT } from "@/lib/messaging/render";
import type { MessageTemplate } from "@/lib/config/types";

const templates = firmConfig.messages as Record<string, MessageTemplate>;
const sample = (t: MessageTemplate) => Object.fromEntries(t.variables.map((v) => [v, `<${v}>`]));

describe("message templates", () => {
  it("every template renders with exactly its declared variables", () => {
    for (const [key, t] of Object.entries(templates)) {
      if (t.email) expect(() => renderEmail(key, sample(t), "https://x/unsub")).not.toThrow();
      if (t.sms) expect(() => renderSms(key, sample(t))).not.toThrow();
      if (t.whatsapp) expect(() => renderWhatsApp(key, sample(t))).not.toThrow();
    }
  });

  it("every SMS and WhatsApp names the firm and carries STOP opt-out (CASL)", () => {
    for (const [key, t] of Object.entries(templates)) {
      if (t.sms) {
        const sms = renderSms(key, sample(t));
        expect(sms).toContain(firmConfig.firm.name);
        expect(sms.endsWith(SMS_OPT_OUT)).toBe(true);
      }
      if (t.whatsapp) {
        const wa = renderWhatsApp(key, sample(t));
        expect(wa.body).toContain(firmConfig.firm.name);
        expect(wa.body).toContain("STOP");
      }
    }
  });

  it("client emails carry the firm name, address and an unsubscribe link", () => {
    const t = templates.client_intake_received;
    const e = renderEmail("client_intake_received", sample(t), "https://example.test/unsubscribe?x");
    expect(e.text).toContain(firmConfig.firm.name);
    expect(e.text).toContain(firmConfig.firm.addressLines[0]);
    expect(e.text).toContain("Unsubscribe: https://example.test/unsubscribe?x");
    expect(e.html).toContain("Unsubscribe");
  });

  it("refuses undeclared or sensitive variables", () => {
    expect(() => renderSms("firm_new_intake", { clientName: "A", services: "B", dashboardUrl: "C", sin: "130692544" })).toThrow();
    expect(() => renderSms("firm_new_intake", { clientName: "A", services: "B", dashboardUrl: "C", dateOfBirth: "1990-01-01" })).toThrow();
    expect(() => renderSms("firm_new_intake", { clientName: "A", services: "B", dashboardUrl: "C", email: "x@y.z" })).toThrow();
  });

  it("firm notification only accepts name, services and dashboard link", () => {
    expect([...templates.firm_new_intake.variables].sort()).toEqual(["clientName", "dashboardUrl", "services"]);
  });

  it("escapes HTML in emails", () => {
    const e = renderEmail("firm_new_intake", { clientName: "<img src=x>", services: "T1", dashboardUrl: "https://x" });
    expect(e.html).not.toContain("<img src=x>");
    expect(e.html).toContain("&lt;img src=x&gt;");
  });
});
