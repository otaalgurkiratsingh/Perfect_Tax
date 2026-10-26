import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { firmConfig } from "@firm/config";
import { formatBytes } from "@/lib/format";
import { CQ_STATUS_LABELS } from "@/lib/quarterly/labels";
import { requireStaff, staffAudit } from "@/lib/staff/auth";
import { ReopenItemButton, RowActions } from "@/components/staff/QuarterButtons";
import { StatusPill } from "@/components/staff/StatusPill";

export const metadata: Metadata = { title: "Client quarter" };

const tz = firmConfig.firm.timezone;
const fmt = (ts: string | null) => (ts ? new Date(ts).toLocaleString("en-CA", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }) : "—");

export default async function ClientQuarterPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: cq } = await ctx.supabase.from("client_quarters").select("*, clients(*), quarters(*)").eq("id", id).maybeSingle();
  if (!cq) notFound();
  await staffAudit(ctx, { action: "view_client_quarter", targetType: "client_quarter", targetId: id });
  const [{ data: items }, { data: docs }, { data: messages }] = await Promise.all([
    ctx.supabase.from("checklist_items").select("*").eq("client_quarter_id", id).order("sort_order"),
    ctx.supabase.from("documents").select("id, checklist_item_id, original_name, mime_type, size_bytes, uploaded_at").eq("client_quarter_id", id).eq("status", "uploaded").order("uploaded_at"),
    ctx.supabase.from("message_log").select("created_at, channel, template_key, recipient_masked, status, error").eq("client_quarter_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  const client = cq.clients;
  const quarter = cq.quarters;

  return (
    <div className="space-y-6">
      <Link href={`/staff/quarters/${quarter.id}`} className="text-sm underline">
        ← {quarter.label} board
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {client.business_name} — {quarter.label}
          </h1>
          <p className="text-gray-600">
            <Link href={`/staff/clients/${client.id}`} className="underline">
              {client.contact_name}
            </Link>{" "}
            · requested {fmt(cq.requested_at)} · <StatusPill status={cq.status} label={CQ_STATUS_LABELS[cq.status]} />
          </p>
        </div>
        <RowActions clientQuarterId={id} status={cq.status} />
      </div>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-bold">Checklist</h2>
        <ul className="divide-y">
          {(items ?? []).map((item) => {
            const files = (docs ?? []).filter((d) => d.checklist_item_id === item.id);
            return (
              <li key={item.id} className="py-3" data-testid="cq-item">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {item.status === "missing" ? "○" : "✓"} {item.label}
                    <span className="ml-2 text-sm font-normal text-gray-600">
                      {item.status === "not_applicable" ? `client says nothing to send${item.client_note ? `: “${item.client_note}”` : ""}` : item.status}
                    </span>
                  </p>
                  {item.status !== "missing" && cq.status !== "processed" ? <ReopenItemButton itemId={item.id} clientQuarterId={id} /> : null}
                </div>
                {files.length ? (
                  <ul className="mt-1 space-y-1 text-sm">
                    {files.map((f) => (
                      <li key={f.id} className="flex flex-wrap gap-3">
                        <span className="break-all">{f.original_name}</span>
                        <span className="text-gray-500">
                          {formatBytes(Number(f.size_bytes))} · {fmt(f.uploaded_at)}
                        </span>
                        {["application/pdf", "image/jpeg", "image/png"].includes(f.mime_type) ? (
                          <a className="font-semibold underline" target="_blank" rel="noreferrer" href={`/api/staff/documents/${f.id}?mode=view`}>
                            View
                          </a>
                        ) : null}
                        <a className="font-semibold underline" href={`/api/staff/documents/${f.id}?mode=download`}>
                          Download
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>


      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-lg font-bold">Messages</h2>
        {messages?.length ? (
          <ul className="space-y-1 text-sm">
            {messages.map((m, i) => (
              <li key={i}>
                {fmt(m.created_at)} · {m.channel} · {m.template_key} → {m.recipient_masked} · <b>{m.status}</b>
                {m.error ? <span className="text-red-700"> ({m.error})</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-600">None yet.</p>
        )}
      </section>
    </div>
  );
}
