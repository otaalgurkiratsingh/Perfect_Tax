import { jsonError, jsonOk } from "@/lib/security/request";
import { resolveUploadContext } from "@/lib/uploadContext";
import { getDocument, removeDocument } from "@/lib/uploads";

export async function POST(request: Request) {
  const ctx = await resolveUploadContext(request);
  if (!ctx) return jsonError("This link has expired or is not valid.", 401);
  const body = (await request.json().catch(() => null)) as { documentId?: string } | null;
  const doc = body?.documentId ? await getDocument(body.documentId) : null;
  if (!doc || !ctx.owns(doc)) return jsonError("File not found", 404);
  if (!ctx.canRemove(doc)) return jsonError("This file can no longer be removed. Please contact the office.", 409);
  await removeDocument(doc);
  await ctx.afterRemove?.(doc);
  return jsonOk({ removed: true });
}
