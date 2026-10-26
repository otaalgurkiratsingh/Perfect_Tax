import type { Metadata } from "next";
import Link from "next/link";
import { firmConfig } from "@firm/config";
import { referralLabel, serviceLabel } from "@/lib/config";
import { APPLICANT_LABELS, STATUS_LABELS } from "@/lib/intake/present";
import { requireStaff } from "@/lib/staff/auth";
import { inboxQuery, PAGE_SIZE, parseFilters, statusCounts } from "@/lib/staff/intakes";
import { StatusPill } from "@/components/staff/StatusPill";
import { staffButton, staffButtonSecondary, staffInput } from "@/components/staff/AuthCard";

export const metadata: Metadata = { title: "Intake inbox" };

interface InboxRow {
  id: string;
  reference: string;
  status: string;
  applicant_type: string | null;
  primary_name: string | null;
  email: string | null;
  business_name: string | null;
  services: string[];
  referral_source: string | null;
  referral_detail: string | null;
  submitted_at: string | null;
  last_activity_at: string;
  retention_flagged_at: string | null;
  missing_docs_received_at: string | null;
}

const TABS: [string, string][] = [
  ["", "Open"],
  ["new", "New"],
  ["in_review", "In Review"],
  ["docs_missing", "Docs Missing"],
  ["ready", "Ready"],
  ["client_created", "Client Created"],
  ["all", "All submitted"],
  ["draft", "Unfinished"],
  ["retention", "Deletion review"],
];

function fmt(ts: string | null) {
  return ts ? new Date(ts).toLocaleString("en-CA", { timeZone: firmConfig.firm.timezone, dateStyle: "medium", timeStyle: "short" }) : "—";
}

export default async function Inbox({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireStaff();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const [{ data, count, error }, counts] = await Promise.all([inboxQuery(ctx, f, { paginate: true }), statusCounts(ctx)]);
  const rows = (data ?? []) as unknown as InboxRow[];
  const openCount = counts.new + counts.in_review + counts.docs_missing + counts.ready;
  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: f.status, service: f.service, from: f.from, to: f.to, q: f.q, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Intake inbox</h1>
          <p className="text-gray-600">Every client form, newest first.</p>
        </div>
        <a href={`/api/staff/export${qs({})}`} className={staffButtonSecondary}>
          Export CSV
        </a>
      </div>

      <nav aria-label="Status" className="flex flex-wrap gap-2">
        {TABS.map(([key, label]) => {
          const n = key === "" ? openCount : key === "all" ? undefined : counts[key];
          const active = (f.status ?? "") === key;
          return (
            <Link
              key={key}
              href={`/staff${qs({ status: key || undefined, page: undefined })}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border-2 px-3 py-1.5 font-semibold ${active ? "border-brand bg-brand text-brand-text" : "border-gray-300 bg-white"}`}
            >
              {label}
              {n !== undefined ? <span className="ml-1.5 opacity-70">{n}</span> : null}
            </Link>
          );
        })}
      </nav>

      <form className="grid gap-3 rounded-xl bg-white p-4 shadow-sm md:grid-cols-[2fr_1fr_1fr_1fr_auto]" action="/staff">
        {f.status ? <input type="hidden" name="status" value={f.status} /> : null}
        <label className="text-sm font-semibold">
          Search name, email, business or reference
          <input name="q" defaultValue={f.q} className={staffInput} placeholder="e.g. Sharma" />
        </label>
        <label className="text-sm font-semibold">
          Service
          <select name="service" defaultValue={f.service ?? ""} className={staffInput}>
            <option value="">Any</option>
            {firmConfig.intake.services.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          From
          <input type="date" name="from" defaultValue={f.from} className={staffInput} />
        </label>
        <label className="text-sm font-semibold">
          To
          <input type="date" name="to" defaultValue={f.to} className={staffInput} />
        </label>
        <div className="flex items-end gap-2">
          <button className={staffButton}>Filter</button>
          <Link href={`/staff${f.status ? `?status=${f.status}` : ""}`} className="px-2 py-2.5 underline">
            Clear
          </Link>
        </div>
      </form>

      {error ? <p className="rounded-lg bg-red-50 p-3 text-red-800">Could not load intakes: {error.message}</p> : null}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left">
          <thead className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Services</th>
              <th className="px-4 py-3">Heard about us</th>
              <th className="px-4 py-3">{f.status === "draft" ? "Last activity" : "Submitted"}</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  Nothing here.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50" data-testid="inbox-row">
                <td className="px-4 py-3">
                  <Link href={`/staff/intakes/${r.id}`} className="font-semibold text-brand underline-offset-2 hover:underline">
                    {r.primary_name || "Unnamed (not finished)"}
                  </Link>
                  {r.business_name ? <div className="text-gray-600">{r.business_name}</div> : null}
                  <div className="text-xs text-gray-500">
                    {r.email ?? "no email yet"} · #{r.reference}
                  </div>
                  {r.missing_docs_received_at && r.status === "in_review" ? (
                    <div className="mt-1 text-xs font-semibold text-green-700">Missing documents received</div>
                  ) : null}
                  {r.retention_flagged_at ? <div className="mt-1 text-xs font-semibold text-red-700">Flagged for deletion review</div> : null}
                </td>
                <td className="px-4 py-3">{APPLICANT_LABELS[r.applicant_type ?? ""] ?? "—"}</td>
                <td className="px-4 py-3">{r.services.map(serviceLabel).join(", ") || "—"}</td>
                <td className="px-4 py-3">
                  {referralLabel(r.referral_source)}
                  {r.referral_detail ? <div className="text-xs text-gray-500">{r.referral_detail}</div> : null}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{fmt(f.status === "draft" ? r.last_activity_at : r.submitted_at)}</td>
                <td className="px-4 py-3">
                  <StatusPill status={r.status} label={STATUS_LABELS[r.status] ?? r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <nav className="flex items-center gap-3" aria-label="Pages">
          {f.page && f.page > 1 ? <Link className={staffButtonSecondary} href={`/staff${qs({ page: String(f.page - 1) })}`}>Previous</Link> : null}
          <span>
            Page {f.page} of {pages} · {count} total
          </span>
          {(f.page ?? 1) < pages ? <Link className={staffButtonSecondary} href={`/staff${qs({ page: String((f.page ?? 1) + 1) })}`}>Next</Link> : null}
        </nav>
      ) : (
        <p className="text-sm text-gray-500">{count ?? 0} shown</p>
      )}
    </div>
  );
}
