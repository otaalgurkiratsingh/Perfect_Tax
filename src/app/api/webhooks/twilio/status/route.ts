import { whatsappFailedFallback } from "@/lib/quarterly/engine";
import { adminClient } from "@/lib/supabase/admin";
import { twiml, validTwilioSignature } from "@/lib/twilio";

// Twilio delivery status callbacks. When a WhatsApp message fails after being
// accepted (e.g. no WhatsApp account, template not approved), send the SMS instead.
export async function POST(request: Request) {
  const params = new URLSearchParams(await request.text());
  if (!validTwilioSignature("/api/webhooks/twilio/status", params, request.headers.get("x-twilio-signature"))) {
    return new Response("Invalid signature", { status: 403 });
  }
  const sid = params.get("MessageSid");
  const status = params.get("MessageStatus");
  if (!sid || !status) return twiml();
  const { data: log } = await adminClient().from("message_log").select("id, channel, status").eq("provider_id", sid).maybeSingle();
  if (!log) return twiml();
  if (status === "failed" || status === "undelivered") {
    if (log.channel === "whatsapp") await whatsappFailedFallback(log.id);
    else await adminClient().from("message_log").update({ status: "failed", error: `Twilio ${status} ${params.get("ErrorCode") ?? ""}`.trim() }).eq("id", log.id);
  }
  return twiml();
}
