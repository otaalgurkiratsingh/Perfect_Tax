import { audit } from "@/lib/audit";
import { normalizePhone } from "@/lib/intake/schema";
import { adminClient } from "@/lib/supabase/admin";
import { START_WORDS, STOP_WORDS, twiml, validTwilioSignature } from "@/lib/twilio";

// Inbound SMS / WhatsApp replies. STOP (and the usual variants) opts the number
// out of every automated text and WhatsApp; START opts back in (CASL).
// Twilio's Advanced Opt-Out also sends the carrier-required confirmation reply.
export async function POST(request: Request) {
  const params = new URLSearchParams(await request.text());
  if (!validTwilioSignature("/api/webhooks/twilio", params, request.headers.get("x-twilio-signature"))) {
    return new Response("Invalid signature", { status: 403 });
  }
  const from = params.get("From") ?? "";
  const channel = from.startsWith("whatsapp:") ? "whatsapp" : "sms";
  const phone = normalizePhone(from.replace(/^whatsapp:/, ""));
  const word = (params.get("Body") ?? "").trim().toUpperCase();
  if (!phone) return twiml();
  const db = adminClient();
  if (STOP_WORDS.includes(word)) {
    await db.from("opt_outs").upsert({ channel, address: phone, source: `inbound:${word}` }, { onConflict: "channel,address" });
    await audit({ actorType: "public", action: "unsubscribe", targetType: channel, details: { last4: phone.slice(-4) } });
  } else if (START_WORDS.includes(word)) {
    await db.from("opt_outs").delete().in("channel", ["sms", "whatsapp"]).eq("address", phone);
  }
  return twiml();
}
