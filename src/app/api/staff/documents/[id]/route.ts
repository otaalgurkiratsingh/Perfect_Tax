import { NextResponse } from "next/server";
import { firmConfig } from "@firm/config";
import { staffApi, staffAudit } from "@/lib/staff/auth";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

// Staff open or download one document. Access is checked, audit-logged, and
// answered with a redirect to a short-lived (<= 5 minute) signed URL.
const INLINE_SAFE = new Set(["application/pdf", "image/jpeg", "image/png"]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await staffApi();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const mode = new URL(request.url).searchParams.get("mode") === "download" ? "download" : "view";
  const { data: doc } = await ctx.supabase
    .from("documents")
    .select("id, storage_path, original_name, mime_type, status, intake_id, client_quarter_id")
    .eq("id", id)
    .eq("status", "uploaded")
    .maybeSingle();
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });

  // Only "safe" types are shown in the browser; anything else (HEIC) is downloaded.
  const download = mode === "download" || !INLINE_SAFE.has(doc.mime_type);
  await staffAudit(ctx, {
    action: download ? "download_document" : "view_document",
    targetType: "document",
    targetId: doc.id,
    details: { intakeId: doc.intake_id, clientQuarterId: doc.client_quarter_id, name: doc.original_name },
  });
  // Signed with the staff member's own session: storage RLS must also allow it.
  const { data, error } = await ctx.supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(doc.storage_path, firmConfig.security.signedUrlSeconds, download ? { download: doc.original_name } : undefined);
  if (error || !data) return Response.json({ error: "Could not open the file" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
