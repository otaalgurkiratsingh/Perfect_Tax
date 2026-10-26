import { extractStatement } from "@/lib/extraction";
import { staffApi, staffAudit } from "@/lib/staff/auth";
import { adminClient, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

// Run statement extraction (beta) on one uploaded bank-statement PDF.
export const maxDuration = 26;

export async function POST(request: Request) {
  const ctx = await staffApi();
  if (ctx instanceof Response) return ctx;
  const body = (await request.json().catch(() => null)) as { documentId?: string } | null;
  if (!body?.documentId || !/^[0-9a-f-]{36}$/i.test(body.documentId)) return Response.json({ error: "Invalid" }, { status: 400 });
  // Read through the staff session (RLS) to confirm access, then fetch the file server-side.
  const { data: doc } = await ctx.supabase
    .from("documents")
    .select("id, storage_path, mime_type, client_quarter_id, original_name")
    .eq("id", body.documentId)
    .eq("status", "uploaded")
    .maybeSingle();
  if (!doc || !doc.client_quarter_id) return Response.json({ error: "Not found" }, { status: 404 });
  if (doc.mime_type !== "application/pdf") return Response.json({ error: "Only PDF statements can be read automatically" }, { status: 400 });
  const { data: file, error } = await adminClient().storage.from(DOCUMENTS_BUCKET).download(doc.storage_path);
  if (error || !file) return Response.json({ error: "Could not read the file" }, { status: 500 });

  const result = await extractStatement(new Uint8Array(await file.arrayBuffer()));
  const row = {
    document_id: doc.id,
    client_quarter_id: doc.client_quarter_id,
    status: result.failed ? "failed" : result.status,
    confidence: result.confidence,
    reason: result.reason,
    transaction_count: result.transactions.length,
    total_debits: result.status === "extracted" ? result.totalDebits : null,
    total_credits: result.status === "extracted" ? result.totalCredits : null,
    opening_balance: result.openingBalance,
    closing_balance: result.closingBalance,
    reconciled: result.reconciled,
    transactions: result.transactions,
    created_by: ctx.profile.id,
    created_at: new Date().toISOString(),
  };
  const { error: saveError } = await adminClient().from("extractions").upsert(row, { onConflict: "document_id" });
  if (saveError) return Response.json({ error: saveError.message }, { status: 500 });
  await staffAudit(ctx, {
    action: "run_extraction",
    targetType: "document",
    targetId: doc.id,
    details: { clientQuarterId: doc.client_quarter_id, status: row.status, confidence: row.confidence, transactions: row.transaction_count },
  });
  return Response.json(
    {
      status: row.status,
      confidence: row.confidence,
      reason: row.reason,
      transactionCount: row.transaction_count,
      totalDebits: row.total_debits,
      totalCredits: row.total_credits,
      openingBalance: row.opening_balance,
      closingBalance: row.closing_balance,
      reconciled: row.reconciled,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
