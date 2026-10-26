import { jsonError, jsonOk } from "@/lib/security/request";
import { resolveUploadContext } from "@/lib/uploadContext";
import { getDocument, publicDocView, verifyUpload } from "@/lib/uploads";

export async function POST(request: Request) {
  const ctx = await resolveUploadContext(request);
  if (!ctx) return jsonError("This link has expired or is not valid.", 401);
  const body = (await request.json().catch(() => null)) as { documentId?: string } | null;
  const doc = body?.documentId ? await getDocument(body.documentId) : null;
  if (!doc || !ctx.owns(doc)) return jsonError("File not found", 404);
  if (doc.status === "uploaded") return jsonOk({ document: publicDocView(doc) });
  const result = await verifyUpload(doc);
  if (!result.ok) return jsonError(result.error, 400);
  const fresh = (await getDocument(doc.id))!;
  await ctx.afterUpload(fresh);
  return jsonOk({ document: publicDocView(fresh) });
}
