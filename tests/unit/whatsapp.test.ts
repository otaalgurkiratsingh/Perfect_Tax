import { describe, expect, it } from "vitest";
import { deliverQuarterMessage } from "@/lib/quarterly/engine";
import type { SendInput, SendResult } from "@/lib/messaging/send";

function fakeSender(outcome: Partial<Record<string, SendResult["status"]>>) {
  const calls: SendInput[] = [];
  const send = async (input: SendInput): Promise<SendResult> => {
    calls.push(input);
    return { status: outcome[input.channel] ?? "sent" };
  };
  return { calls, send };
}

const client = { id: "c1", email: "owner@example.com", phone: "+14165550100", whatsapp_phone: "+14165550199" };
const ctx = { clientId: "c1", clientQuarterId: "cq1", meta: {} };
const vars = { contactName: "A", businessName: "B", quarterLabel: "2026-Q4", periodLabel: "Oct to Dec 2026", itemList: "-", uploadUrl: "https://x/q#t=1" };

describe("quarterly channel plan (WhatsApp → SMS fallback)", () => {
  it("WhatsApp first + email when enabled and it works; no SMS", async () => {
    const f = fakeSender({});
    await deliverQuarterMessage(client, "quarter_request", vars, ctx, { whatsappEnabled: true, send: f.send });
    expect(f.calls.map((c) => c.channel)).toEqual(["whatsapp", "email"]);
    expect(f.calls[0].to).toBe("+14165550199");
  });
  it("falls back to SMS when WhatsApp fails", async () => {
    const f = fakeSender({ whatsapp: "failed" });
    await deliverQuarterMessage(client, "quarter_request", vars, ctx, { whatsappEnabled: true, send: f.send });
    expect(f.calls.map((c) => c.channel)).toEqual(["whatsapp", "sms", "email"]);
    expect(f.calls[1].to).toBe("+14165550100");
    expect(f.calls[1].context?.meta?.fallback).toBe(true);
  });
  it("respects an opt-out: no SMS after a STOP on WhatsApp", async () => {
    const f = fakeSender({ whatsapp: "skipped_opt_out" });
    await deliverQuarterMessage(client, "quarter_request", vars, ctx, { whatsappEnabled: true, send: f.send });
    expect(f.calls.map((c) => c.channel)).toEqual(["whatsapp", "email"]);
  });
  it("SMS + email when WhatsApp is switched off", async () => {
    const f = fakeSender({});
    await deliverQuarterMessage(client, "quarter_request", vars, ctx, { whatsappEnabled: false, send: f.send });
    expect(f.calls.map((c) => c.channel)).toEqual(["sms", "email"]);
  });
});
