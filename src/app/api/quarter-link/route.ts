import { clientQuarterView } from "@/lib/quarterly/clientView";
import { clientIp, jsonError, jsonOk } from "@/lib/security/request";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { bearerToken, resolveToken } from "@/lib/security/tokens";

export async function GET(request: Request) {
  if (!(await rateLimit(`public-read:${clientIp(request.headers)}`, LIMITS.publicRead.limit, LIMITS.publicRead.window))) {
    return jsonError("Too many requests. Please wait a minute.", 429);
  }
  const token = await resolveToken(bearerToken(request), ["quarter_upload"]);
  const view = token?.client_quarter_id ? await clientQuarterView(token.client_quarter_id) : null;
  if (!view) return jsonError("This link has expired or is not valid.", 401);
  return jsonOk(view);
}
