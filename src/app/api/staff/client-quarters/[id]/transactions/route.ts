import { toCsv } from "@/lib/intake/present";
import { transactionsCsvRows, type Transaction } from "@/lib/extraction/parse";
import { staffApi, staffAudit } from "@/lib/staff/auth";

// One clean CSV per client-quarter: every extracted bank statement, one row per transaction.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await staffApi();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const { data: cq } = await ctx.supabase.from("client_quarters").select("id, clients(business_name), quarters(label)").eq("id", id).maybeSingle();
  if (!cq) return Response.json({ error: "Not found" }, { status: 404 });
  const { data: extractions } = await ctx.supabase
    .from("extractions")
    .select("confidence, transactions, documents(original_name)")
    .eq("client_quarter_id", id)
    .eq("status", "extracted");
  type Ex = { confidence: string; transactions: Transaction[]; documents: { original_name: string } | null };
  const rows = ((extractions ?? []) as unknown as Ex[]).flatMap((e) =>
    e.transactions.map((t) => ({ file: e.documents?.original_name ?? "", confidence: e.confidence, t })),
  );
  rows.sort((a, b) => a.t.date.localeCompare(b.t.date) || a.file.localeCompare(b.file));
  await staffAudit(ctx, { action: "download_extraction", targetType: "client_quarter", targetId: id, details: { rows: rows.length } });
  const c = cq as unknown as { clients: { business_name: string } | null; quarters: { label: string } | null };
  const name = `${(c.clients?.business_name ?? "client").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-")}-${c.quarters?.label ?? ""}-transactions.csv`;
  return new Response(toCsv(transactionsCsvRows(rows)), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
