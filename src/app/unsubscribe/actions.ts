"use server";

import { headers } from "next/headers";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/security/request";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { verifySignedValue } from "@/lib/security/tokens";
import { adminClient } from "@/lib/supabase/admin";

export async function confirmUnsubscribe(channel: string, a: string, s: string): Promise<{ ok: boolean }> {
  const ip = clientIp(await headers());
  if (!(await rateLimit(`unsubscribe:${ip}`, LIMITS.unsubscribe.limit, LIMITS.unsubscribe.window))) return { ok: false };
  if (channel !== "email" && channel !== "sms") return { ok: false };
  const address = Buffer.from(a, "base64url").toString("utf8");
  if (!verifySignedValue(`${channel}:${address}`, s)) return { ok: false };
  await adminClient().from("opt_outs").upsert({ channel, address, source: "unsubscribe_link" }, { onConflict: "channel,address" });
  await audit({ actorType: "public", action: "unsubscribe", targetType: channel, ip });
  return { ok: true };
}
