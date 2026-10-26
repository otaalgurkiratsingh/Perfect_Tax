import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { firmConfig } from "@firm/config";
import { requireStaff } from "@/lib/staff/auth";
import { CQ_STATUSES, CQ_STATUS_LABELS } from "@/lib/quarterly/labels";
import { BulkButtons, RowActions } from "@/components/staff/QuarterButtons";
import { StatusPill } from "@/components/staff/StatusPill";
import { staffInput, staffButton } from "@/components/staff/AuthCard";

export const metadata: Metadata = { title: "Quarter board" };

const DAY = 86_400_000;
const tz = firmConfig.firm.timezone;
const fmtDate = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-CA", { timeZone: tz, month: "short", day: "numeric" }) : "—");

interface BoardRow {
  id: string;
  status: string;
  requested_at: string | null;
  last_reminder_day: number;
  last_reminder_at: string | null;
  clients: { id: string; business_name: string; contact_name: string; services: string[] } | null;
  checklist_items: { status: string; required: boolean }[];
}

export default async function QuarterBoard({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: quarter } = await ctx.supabase.from("quarters").select("*").eq("id", id).maybeSingle();
  if (!quarter) notFound();
  const { data } = await ctx.supabase
    .from("client_quarters")
    .select("id, status, requested_at, last_reminder_day, last_reminder_at, clients(id, business_name, contact_name, services), checklist_items(status, required)")
    .eq("quarter_id", id);
  const all = ((data ?? []) as unknown as BoardRow[]).sort((a, b) => (a.clients?.business_name ?? "").localeCompare(b.clients?.business_name ?? ""));
  const counts = Object.fromEntries(CQ_STATUSES.map((s) => [s, all.filter((r) => r.status === s).length]));
  const q = (sp.q ?? "").toLowerCase();
  const rows = all.filter(
    (r) =>
      (!sp.status || r.status === sp.status) &&
      (!sp.service || r.clients?.services.includes(sp.service)) &&
      (!q || r.clients?.business_name.toLowerCase().includes(q) || r.clients?.contact_name.toLowerCase().includes(q)),
  );
  const schedule = firmConfig.reminders.quarterlyReminderDays;
  const nextReminder = (r: BoardRow) => {
    if (!["requested", "partial"].includes(r.status) || !r.requested_at) return "—";
    const next = schedule.find((d) => d > r.last_reminder_day);
    return next ? `Day ${next} · ${fmtDate(new Date(new Date(r.requested_at).getTime() + next * DAY))}` : "Finished";
  };

  return (
    <div className="space-y-5">
      <Link href="/staff/quarters" className="text-sm underline">
        ← All quarters
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{quarter.label} board</h1>
          <p className="text-gray-600">
            {quarter.period_start} to {quarter.period_end} · {all.length} clients
          </p>
        </div>
        <BulkButtons quarterId={id} notSent={counts.not_sent} stragglers={counts.requested + counts.partial} />
      </div>

      <nav aria-label="Status" className="flex flex-wrap gap-2">
        <Link href={`/staff/quarters/${id}`} className={`rounded-full border-2 px-3 py-1.5 font-semibold ${!sp.status ? "border-brand bg-brand text-brand-text" : "border-gray-300 bg-white"}`}>
          All {all.length}
        </Link>
        {CQ_STATUSES.map((s) => (
          <Link
            key={s}
            data-testid={`board-count-${s}`}
            href={`/staff/quarters/${id}?status=${s}`}
            className={`rounded-full border-2 px-3 py-1.5 font-semibold ${sp.status === s ? "border-brand bg-brand text-brand-text" : "border-gray-300 bg-white"}`}
          >
            {CQ_STATUS_LABELS[s]} <span className="opacity-70">{counts[s]}</span>
          </Link>
        ))}
      </nav>

      <form className="flex flex-wrap items-end gap-3" action={`/staff/quarters/${id}`}>
        {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
        <label className="text-sm font-semibold">
          Search client
          <input name="q" defaultValue={sp.q} className={staffInput} />
        </label>
        <label className="text-sm font-semibold">
          Service
          <select name="service" defaultValue={sp.service ?? ""} className={staffInput}>
            <option value="">Any</option>
            {firmConfig.quarterly.clientServices.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button className={staffButton}>Filter</button>
      </form>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Checklist</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Requested</th>
              <th className="px-4 py-3">Last reminder</th>
              <th className="px-4 py-3">Next reminder</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const req = r.checklist_items.filter((i) => i.required);
              const done = req.filter((i) => i.status !== "missing").length;
              return (
                <tr key={r.id} className="border-b last:border-0" data-testid="board-row">
                  <td className="px-4 py-3">
                    <Link href={`/staff/client-quarters/${r.id}`} className="font-semibold underline-offset-2 hover:underline">
                      {r.clients?.business_name}
                    </Link>
                    <div className="text-xs text-gray-500">
                      {r.clients?.contact_name} · {r.clients?.services.join(", ")}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {done}/{req.length}
                    <div className="mt-1 h-1.5 w-24 rounded bg-gray-200">
                      <div className="h-full rounded bg-green-600" style={{ width: `${req.length ? (done / req.length) * 100 : 0}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-3" data-testid="board-status">
                    <StatusPill status={r.status} label={CQ_STATUS_LABELS[r.status]} />
                  </td>
                  <td className="px-4 py-3">{fmtDate(r.requested_at)}</td>
                  <td className="px-4 py-3">{r.last_reminder_day ? `Day ${r.last_reminder_day} · ${fmtDate(r.last_reminder_at)}` : "—"}</td>
                  <td className="px-4 py-3">{nextReminder(r)}</td>
                  <td className="px-4 py-3">
                    <RowActions clientQuarterId={r.id} status={r.status} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  No clients match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
