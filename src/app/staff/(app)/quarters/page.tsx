import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/staff/auth";
import { previousQuarter } from "@/lib/quarterly/periods";
import { CQ_STATUSES, CQ_STATUS_LABELS } from "@/lib/quarterly/labels";
import { OpenQuarterForm } from "@/components/staff/QuarterButtons";
import { StatusPill } from "@/components/staff/StatusPill";

export const metadata: Metadata = { title: "Quarterly collection" };

export default async function QuartersPage() {
  const ctx = await requireStaff();
  const { data: quarters } = await ctx.supabase.from("quarters").select("*").order("year", { ascending: false }).order("quarter", { ascending: false });
  const { data: cqs } = await ctx.supabase.from("client_quarters").select("quarter_id, status");
  const counts = new Map<string, Record<string, number>>();
  for (const r of cqs ?? []) {
    const c = counts.get(r.quarter_id) ?? {};
    c[r.status] = (c[r.status] ?? 0) + 1;
    counts.set(r.quarter_id, c);
  }
  const suggested = previousQuarter();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quarterly collection</h1>
        <p className="text-gray-600">
          Open a quarter once: every active client gets their own checklist and private upload link. Reminders go out automatically on days 7, 14, 21
          and 28 — only to clients who haven&apos;t finished.
        </p>
      </div>
      <OpenQuarterForm year={suggested.year} quarter={suggested.quarter} />
      <div className="grid gap-4 md:grid-cols-2">
        {(quarters ?? []).map((q) => {
          const c = counts.get(q.id) ?? {};
          const total = Object.values(c).reduce((a, b) => a + b, 0);
          return (
            <Link key={q.id} href={`/staff/quarters/${q.id}`} className="block rounded-xl bg-white p-5 shadow-sm hover:ring-2 hover:ring-brand">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl font-bold">{q.label}</h2>
                <span className="text-sm text-gray-600">{total} clients</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {CQ_STATUSES.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 text-sm">
                    <StatusPill status={s} label={CQ_STATUS_LABELS[s]} /> {c[s] ?? 0}
                  </span>
                ))}
              </div>
            </Link>
          );
        })}
        {!quarters?.length ? <p className="text-gray-600">No quarters yet — open the first one above.</p> : null}
      </div>
    </div>
  );
}
