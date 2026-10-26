import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { publicDocView } from "@/lib/uploads";
import { loadClientQuarter, periodLabelOf } from "./engine";

/** What a client sees for one quarter: their checklist, statuses and file names (no downloads). */
export async function clientQuarterView(clientQuarterId: string) {
  const loaded = await loadClientQuarter(clientQuarterId);
  if (!loaded) return null;
  const { cq, client, quarter, items } = loaded;
  const { data: docs } = await adminClient()
    .from("documents")
    .select("id, doc_type, original_name, size_bytes, status, checklist_item_id")
    .eq("client_quarter_id", cq.id)
    .eq("status", "uploaded")
    .order("created_at");
  return {
    clientQuarterId: cq.id,
    businessName: client.business_name,
    contactName: client.contact_name.split(/\s+/)[0] || client.contact_name,
    quarterLabel: quarter.label,
    periodLabel: periodLabelOf(quarter),
    status: cq.status,
    items: items.map((i) => ({
      id: i.id,
      label: i.label,
      instructions: i.instructions,
      required: i.required,
      status: i.status,
      clientNote: i.client_note,
    })),
    documents: (docs ?? []).map(publicDocView),
  };
}

export type ClientQuarterView = NonNullable<Awaited<ReturnType<typeof clientQuarterView>>>;
