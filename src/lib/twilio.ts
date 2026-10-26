import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Validate X-Twilio-Signature: HMAC-SHA1 over the public URL + sorted POST
 * params, keyed with the auth token. Fails closed when no token is configured.
 */
export function validTwilioSignature(path: string, params: URLSearchParams, signature: string | null): boolean {
  const token = env.twilio.authToken;
  if (!token || !signature) return false;
  const url = `${env.siteUrl}${path}`;
  const data = [...params.keys()]
    .sort()
    .reduce((acc, key) => acc + key + (params.get(key) ?? ""), url);
  const expected = Buffer.from(createHmac("sha1", token).update(data).digest("base64"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "ARRET", "ARRÊT"];
export const START_WORDS = ["START", "UNSTOP", "YES"];

export function twiml(): Response {
  return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    headers: { "Content-Type": "text/xml" },
  });
}
