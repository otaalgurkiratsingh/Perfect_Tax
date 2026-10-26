import { firmConfig } from "@firm/config";
import { docRequestProgress, getDocRequest } from "@/lib/docRequests";
import { firstName, sanitizeAnswers } from "@/lib/intake/schema";
import { getIntake } from "@/lib/intake/server";
import { clientIp, jsonError, jsonOk } from "@/lib/security/request";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { bearerToken, resolveToken } from "@/lib/security/tokens";
import { adminClient } from "@/lib/supabase/admin";
import { publicDocView } from "@/lib/uploads";

// What the upload-only page needs: ONLY the requested items and files uploaded through this request.
export async function GET(request: Request) {
  if (!(await rateLimit(`public-read:${clientIp(request.headers)}`, LIMITS.publicRead.limit, LIMITS.publicRead.window))) {
    return jsonError("Too many requests. Please wait a minute.", 429);
  }
  const token = await resolveToken(bearerToken(request), ["doc_request"]);
  const req = token?.doc_request_id ? await getDocRequest(token.doc_request_id) : null;
  if (!token || !req) return jsonError("This link has expired or is not valid.", 401);
  const intake = await getIntake(req.intake_id);
  if (!intake) return jsonError("This link has expired or is not valid.", 401);
  const { data: docs } = await adminClient()
    .from("documents")
    .select("id, doc_type, original_name, size_bytes, status, checklist_item_id")
    .eq("doc_request_id", req.id)
    .eq("status", "uploaded")
    .order("created_at");
  const { missing } = await docRequestProgress(req);
  return jsonOk({
    firstName: firstName(sanitizeAnswers(intake.answers)),
    status: req.status,
    note: req.note,
    items: req.items.map((key) => {
      const slot = firmConfig.intake.documentSlots.find((s) => s.key === key);
      return { key, label: slot?.label ?? key, why: slot?.why ?? "" };
    }),
    missing,
    documents: (docs ?? []).map(publicDocView),
  });
}
