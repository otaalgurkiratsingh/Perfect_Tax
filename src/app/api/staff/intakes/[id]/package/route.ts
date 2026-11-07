import { firmConfig } from "@firm/config";
import { documentSlotLabel } from "@/lib/config";
import { presentIntake, sectionsToText } from "@/lib/intake/present";
import type { IntakeRow } from "@/lib/intake/server";
import { staffApi, staffAudit } from "@/lib/staff/auth";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { browserStorageUrl } from "@/lib/storageUrl";

// "Download all as ZIP". Netlify functions can't return large bodies, so the
// server returns the answers summary + short-lived signed URLs, and the
// browser builds the ZIP itself. The download is audit-logged here.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await staffApi();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const { data: intake } = await ctx.supabase.from("intakes").select("*").eq("id", id).maybeSingle();
  if (!intake) return Response.json({ error: "Not found" }, { status: 404 });
  const { data: docs } = await ctx.supabase
    .from("documents")
    .select("id, doc_type, original_name, storage_path")
    .eq("intake_id", id)
    .eq("status", "uploaded")
    .order("created_at");
  const { data: consents } = await ctx.supabase
    .from("intake_consents")
    .select("consent_key, version, accepted, recorded_at, ip, text_shown")
    .eq("intake_id", id)
    .order("consent_key");

  const row = intake as IntakeRow;
  const summary = [
    sectionsToText(`Client intake #${row.reference}`, presentIntake(row)),
    "Consents",
    "--------",
    ...(consents ?? []).flatMap((c) => [
      `${c.consent_key} (${c.version}): ${c.accepted ? "ACCEPTED" : "not accepted"} at ${c.recorded_at} from ${c.ip}`,
      `  "${c.text_shown}"`,
    ]),
    "",
    `Exported ${new Date().toLocaleString("en-CA", { timeZone: firmConfig.firm.timezone })} by ${ctx.profile.email}. SINs are masked in this summary.`,
  ].join("\n");

  const used = new Map<string, number>();
  const files = [];
  for (const d of docs ?? []) {
    const { data } = await ctx.supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(d.storage_path, firmConfig.security.signedUrlSeconds);
    if (!data) continue;
    const folder = documentSlotLabel(d.doc_type).replace(/[^\w\- ]+/g, "").trim();
    let name = `${folder}/${d.original_name}`;
    const n = used.get(name) ?? 0;
    used.set(name, n + 1);
    if (n) name = name.replace(/(\.[^.]+)?$/, ` (${n + 1})$1`);
    files.push({ name, url: browserStorageUrl(data.signedUrl) });
  }
  await staffAudit(ctx, { action: "download_zip", targetType: "intake", targetId: id, details: { files: files.length } });
  const base = `${(row.primary_name ?? "intake").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-")}-${row.reference}`;
  return Response.json({ zipName: `${base}.zip`, summaryName: `${base}-summary.txt`, summary, files }, { headers: { "Cache-Control": "no-store" } });
}
