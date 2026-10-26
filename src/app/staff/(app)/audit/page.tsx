import type { Metadata } from "next";
import Link from "next/link";
import { firmConfig } from "@firm/config";
import { requireStaff, staffAudit } from "@/lib/staff/auth";
import { staffButton, staffInput } from "@/components/staff/AuthCard";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireStaff({ admin: true });
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  let q = ctx.supabase.from("audit_log").select("*", { count: "exact" }).order("occurred_at", { ascending: false });
  if (sp.action) q = q.eq("action", sp.action);
  if (sp.actor) q = q.ilike("actor_email", `%${sp.actor.replace(/[%,]/g, "")}%`);
  if (sp.target) q = q.eq("target_id", sp.target);
  if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) q = q.gte("occurred_at", `${sp.from}T00:00:00`);
  if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) q = q.lte("occurred_at", `${sp.to}T23:59:59.999`);
  const { data, count } = await q.range((page - 1) * PAGE, page * PAGE - 1);
  await staffAudit(ctx, { action: "view_audit_log", details: { filters: sp } });
  const tz = firmConfig.firm.timezone;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-gray-600">Every view, download, export and change. Entries can&apos;t be edited or deleted.</p>
      </div>
      <form className="grid gap-3 rounded-xl bg-white p-4 shadow-sm md:grid-cols-6" action="/staff/audit">
        <label className="text-sm font-semibold">
          Action
          <input name="action" defaultValue={sp.action} className={staffInput} placeholder="download_document" />
        </label>
        <label className="text-sm font-semibold">
          Staff email
          <input name="actor" defaultValue={sp.actor} className={staffInput} />
        </label>
        <label className="text-sm font-semibold md:col-span-2">
          Record ID
          <input name="target" defaultValue={sp.target} className={staffInput} />
        </label>
        <label className="text-sm font-semibold">
          From
          <input type="date" name="from" defaultValue={sp.from} className={staffInput} />
        </label>
        <label className="text-sm font-semibold">
          To
          <input type="date" name="to" defaultValue={sp.to} className={staffInput} />
        </label>
        <div className="md:col-span-6">
          <button className={staffButton}>Filter</button>{" "}
          <Link href="/staff/audit" className="ml-2 underline">
            Clear
          </Link>
        </div>
      </form>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Who</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Record</th>
              <th className="px-3 py-2">Details</th>
              <th className="px-3 py-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((e) => (
              <tr key={e.id} className="border-b align-top last:border-0" data-testid="audit-row">
                <td className="whitespace-nowrap px-3 py-2">{new Date(e.occurred_at).toLocaleString("en-CA", { timeZone: tz })}</td>
                <td className="px-3 py-2">{e.actor_email ?? e.actor_type}</td>
                <td className="px-3 py-2 font-semibold" data-testid="audit-action">{e.action}</td>
                <td className="px-3 py-2">
                  {e.target_type === "intake" && e.target_id ? (
                    <Link className="underline" href={`/staff/intakes/${e.target_id}`}>
                      intake
                    </Link>
                  ) : (
                    e.target_type ?? ""
                  )}
                  <div className="font-mono text-xs text-gray-500">{e.target_id}</div>
                </td>
                <td className="max-w-md break-words px-3 py-2 font-mono text-xs text-gray-700">{JSON.stringify(e.details)}</td>
                <td className="px-3 py-2 text-xs">{e.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-gray-600">
        {count ?? 0} entries · page {page}
        {(count ?? 0) > page * PAGE ? (
          <Link className="ml-3 underline" href={`/staff/audit?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>, page: String(page + 1) })}`}>
            Next page
          </Link>
        ) : null}
      </p>
    </div>
  );
}
