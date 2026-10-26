import { clientIp, jsonError, jsonOk } from "@/lib/security/request";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { resolveUploadContext } from "@/lib/uploadContext";
import { createUploadSlot } from "@/lib/uploads";

// Issues a short-lived signed upload URL. The file itself goes straight from the
// browser to private Supabase Storage — never through this function.
export async function POST(request: Request) {
  const ctx = await resolveUploadContext(request);
  if (!ctx) return jsonError("This link has expired or is not valid.", 401);
  const ip = clientIp(request.headers);
  if (!(await rateLimit(`upload-sign:${ctx.token.id}:${ip}`, LIMITS.uploadSign.limit, LIMITS.uploadSign.window))) {
    return jsonError("Too many uploads at once. Please wait a minute.", 429);
  }
  const body = (await request.json().catch(() => null)) as { docType?: string; itemId?: string; fileName?: string; size?: number } | null;
  if (!body?.fileName || typeof body.size !== "number") return jsonError("Invalid request", 400);
  const target = await ctx.target({ docType: body.docType, itemId: body.itemId });
  if ("error" in target) return jsonError(target.error, 400);
  const slot = await createUploadSlot(target, body.fileName, body.size);
  if (!slot.ok) return jsonError(slot.error, 400);
  return jsonOk({ documentId: slot.documentId, signedUrl: slot.signedUrl, mimeType: slot.mimeType });
}
