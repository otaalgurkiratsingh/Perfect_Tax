import { audit } from "@/lib/audit";
import { getIntake, submitIntake } from "@/lib/intake/server";
import { notifyIntakeSubmitted } from "@/lib/notifications";
import { clientIp, jsonError, jsonOk, userAgent } from "@/lib/security/request";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { bearerToken, resolveToken } from "@/lib/security/tokens";

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  if (!(await rateLimit(`intake-submit:${ip}`, LIMITS.intakeSubmit.limit, LIMITS.intakeSubmit.window))) {
    return jsonError("Too many attempts. Please wait a few minutes and try again.", 429);
  }
  const token = await resolveToken(bearerToken(request), ["intake_resume"]);
  if (!token?.intake_id) return jsonError("This link has expired or is not valid.", 401);
  const intake = await getIntake(token.intake_id);
  if (!intake) return jsonError("This link has expired or is not valid.", 401);
  if (intake.status !== "draft") return jsonOk({ reference: intake.reference });

  const body = (await request.json().catch(() => ({}))) as { consents?: Record<string, boolean>; website?: string };
  if (body.website) return jsonOk({ reference: intake.reference }); // honeypot

  const result = await submitIntake(intake, body.consents ?? {}, { ip, userAgent: userAgent(request.headers) });
  if (!result.ok) return jsonOk({ errors: result.errors, step: result.step }, 422);

  const submitted = await getIntake(intake.id);
  if (submitted) await notifyIntakeSubmitted(submitted);
  await audit({
    actorType: "public",
    action: "intake_submitted",
    targetType: "intake",
    targetId: intake.id,
    details: { reference: result.reference },
    ip,
    userAgent: userAgent(request.headers),
  });
  return jsonOk({ reference: result.reference });
}
