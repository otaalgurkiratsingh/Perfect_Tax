import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { firmConfig } from "@firm/config";
import { CQ_STATUS_LABELS } from "@/lib/quarterly/labels";
import { requireStaff } from "@/lib/staff/auth";
import { ClientForm } from "@/components/staff/ClientForm";
import { AddToQuarterButton, InviteButton } from "@/components/staff/QuarterButtons";
import { StatusPill } from "@/components/staff/StatusPill";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: client } = await ctx.supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) notFound();
  const [{ data: history }, { data: openQuarters }] = await Promise.all([
    ctx.supabase.from("client_quarters").select("id, status, quarter_id, quarters(label)").eq("client_id", id).order("created_at", { ascending: false }),
    ctx.supabase.from("quarters").select("id, label").eq("status", "open").order("year", { ascending: false }).order("quarter", { ascending: false }),
  ]);
  const inQuarters = new Set((history ?? []).map((h) => h.quarter_id));
  const addable = (openQuarters ?? []).filter((q) => !inQuarters.has(q.id));
  type H = { id: string; status: string; quarters: { label: string } | null };

  return (
    <div className="space-y-6">
      <Link href="/staff/clients" className="text-sm underline">
        ← Clients
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{client.business_name}</h1>
          {client.intake_id ? (
            <Link href={`/staff/intakes/${client.intake_id}`} className="text-sm underline">
              Original intake form
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {client.email ? <InviteButton clientId={id} hasLogin={Boolean(client.auth_user_id)} /> : null}
          {addable.map((q) => (
            <AddToQuarterButton key={q.id} clientId={id} quarterId={q.id} label={q.label} />
          ))}
        </div>
      </div>
      <ClientForm client={client} services={firmConfig.quarterly.clientServices} />
      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-lg font-bold">Quarters</h2>
        {history?.length ? (
          <ul className="divide-y">
            {(history as unknown as H[]).map((h) => (
              <li key={h.id} className="flex items-center justify-between py-2">
                <Link href={`/staff/client-quarters/${h.id}`} className="font-semibold underline">
                  {h.quarters?.label}
                </Link>
                <StatusPill status={h.status} label={CQ_STATUS_LABELS[h.status]} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-600">Not part of any quarter yet.</p>
        )}
      </section>
    </div>
  );
}
