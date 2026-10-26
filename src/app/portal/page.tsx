import type { Metadata } from "next";
import { firmConfig } from "@firm/config";
import { PublicFooter, PublicHeader } from "@/components/Brand";
import { QuarterUpload } from "@/components/public/QuarterUpload";
import { requireClient } from "@/lib/portal/auth";
import { clientQuarterView } from "@/lib/quarterly/clientView";
import { issuePortalUploadToken } from "@/lib/portal/link";
import { portalSignOut } from "./actions";

export const metadata: Metadata = { title: "Your documents" };
export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = {
  not_sent: "Not requested yet",
  requested: "Waiting for your documents",
  partial: "Some documents received",
  complete: "All received — thank you",
  processed: "Done by our team",
};

export default async function PortalHome() {
  const { supabase, client } = await requireClient();
  // RLS: these queries only return this client's own rows.
  const { data: rows } = await supabase
    .from("client_quarters")
    .select("id, status, quarter_id, quarters(label, year, quarter, status)")
    .order("created_at", { ascending: false });
  type Row = { id: string; status: string; quarters: { label: string; status: string } | null };
  const quarters = (rows ?? []) as unknown as Row[];
  const current = quarters.find((q) => q.quarters?.status === "open" && q.status !== "processed") ?? null;
  const history = quarters.filter((q) => q.id !== current?.id);
  const view = current ? await clientQuarterView(current.id) : null;
  const token = current ? await issuePortalUploadToken(current.id) : null;
  const { data: historyItems } = history.length
    ? await supabase.from("checklist_items").select("client_quarter_id, label, status").in("client_quarter_id", history.map((h) => h.id)).order("sort_order")
    : { data: [] };

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Signed in</p>
            <h1 className="text-2xl font-bold">{client.business_name}</h1>
          </div>
          <form action={portalSignOut}>
            <button className="min-h-11 rounded-xl border-2 border-gray-300 px-4 font-semibold">Sign out</button>
          </form>
        </div>

        {view && token ? (
          <QuarterUpload firmPhone={firmConfig.firm.phone} token={token} initial={view} />
        ) : (
          <p className="rounded-2xl bg-white p-5 text-lg shadow-sm">Nothing is needed from you right now. We&apos;ll let you know when the next quarter starts.</p>
        )}

        {history.length ? (
          <section>
            <h2 className="text-xl font-bold">Past quarters</h2>
            <ul className="mt-3 space-y-3">
              {history.map((h) => (
                <li key={h.id} className="rounded-2xl bg-white p-4 shadow-sm" data-testid="history-quarter">
                  <p className="flex justify-between font-semibold">
                    <span>{h.quarters?.label}</span>
                    <span className="text-gray-600">{STATUS_TEXT[h.status] ?? h.status}</span>
                  </p>
                  <ul className="mt-2 text-[15px] text-gray-700">
                    {(historyItems ?? [])
                      .filter((i) => i.client_quarter_id === h.id)
                      .map((i) => (
                        <li key={i.label}>
                          {i.status === "missing" ? "○" : "✓"} {i.label}
                          {i.status === "not_applicable" ? " (nothing to send)" : ""}
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <PublicFooter />
    </div>
  );
}
