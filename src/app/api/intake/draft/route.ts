import { draftView, getIntake, saveDraft } from "@/lib/intake/server";
import { clientIp, jsonError, jsonOk } from "@/lib/security/request";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { bearerToken, resolveToken } from "@/lib/security/tokens";

async function load(request: Request) {
  const token = await resolveToken(bearerToken(request), ["intake_resume"]);
  if (!token?.intake_id) return null;
  const intake = await getIntake(token.intake_id);
  return intake ? { token, intake } : null;
}

export async function GET(request: Request) {
  const ip = clientIp(request.headers);
  if (!(await rateLimit(`public-read:${ip}`, LIMITS.publicRead.limit, LIMITS.publicRead.window))) {
    return jsonError("Too many requests. Please wait a minute.", 429);
  }
  const ctx = await load(request);
  if (!ctx) return jsonError("This link has expired or is not valid.", 401);
  return jsonOk(await draftView(ctx.intake));
}

export async function PATCH(request: Request) {
  const ctx = await load(request);
  if (!ctx) return jsonError("This link has expired or is not valid.", 401);
  if (!(await rateLimit(`intake-save:${ctx.token.id}`, LIMITS.intakeSave.limit, LIMITS.intakeSave.window))) {
    return jsonError("Saving too often. Please wait a moment.", 429);
  }
  if (ctx.intake.status !== "draft") return jsonError("This form has already been sent.", 409);
  const body = (await request.json().catch(() => null)) as {
    step?: number;
    answers?: unknown;
    sin?: string | null;
    spouseSin?: string | null;
  } | null;
  if (!body) return jsonError("Invalid request", 400);
  const result = await saveDraft(ctx.intake, { step: body.step ?? 1, answers: body.answers, sin: body.sin, spouseSin: body.spouseSin }, ctx.token.id);
  const fresh = await getIntake(ctx.intake.id);
  const view = fresh ? await draftView(fresh) : null;
  return result.ok ? jsonOk({ saved: true, sin: view?.sin, spouseSin: view?.spouseSin }) : jsonOk({ saved: true, errors: result.errors, sin: view?.sin, spouseSin: view?.spouseSin });
}
