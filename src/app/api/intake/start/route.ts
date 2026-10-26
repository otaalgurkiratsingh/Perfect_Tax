import { createDraft } from "@/lib/intake/server";
import { clientIp, jsonError, jsonOk } from "@/lib/security/request";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { generateRawToken } from "@/lib/security/tokens";
import { verifyTurnstile } from "@/lib/security/turnstile";

// Starts a new draft. Protected by Turnstile + honeypot + per-IP rate limit.
export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  if (!(await rateLimit(`intake-start:${ip}`, LIMITS.intakeStart.limit, LIMITS.intakeStart.window))) {
    return jsonError("Too many attempts. Please wait a few minutes and try again.", 429);
  }
  const body = (await request.json().catch(() => ({}))) as { turnstileToken?: string; website?: string; kiosk?: boolean };
  // Honeypot: real people never see or fill the "website" field. Pretend success, store nothing.
  if (body.website) return jsonOk({ token: generateRawToken() });
  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    return jsonError("We couldn't confirm you're a person. Please try again.", 400);
  }
  const { token } = await createDraft({ kiosk: body.kiosk === true });
  return jsonOk({ token });
}
