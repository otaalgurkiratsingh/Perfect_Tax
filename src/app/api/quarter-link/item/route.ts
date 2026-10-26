import { audit } from "@/lib/audit";
import { loadClientQuarter, refreshClientQuarterStatus } from "@/lib/quarterly/engine";
import { clientQuarterView } from "@/lib/quarterly/clientView";
import { jsonError, jsonOk } from "@/lib/security/request";
import { bearerToken, resolveToken } from "@/lib/security/tokens";
import { adminClient } from "@/lib/supabase/admin";

// Client says "nothing to send for this item this quarter" (or undoes it).
export async function POST(request: Request) {
  const token = await resolveToken(bearerToken(request), ["quarter_upload"]);
  const loaded = token?.client_quarter_id ? await loadClientQuarter(token.client_quarter_id) : null;
  if (!loaded || loaded.cq.status === "processed") return jsonError("This link has expired or is not valid.", 401);
  const body = (await request.json().catch(() => null)) as { itemId?: string; notApplicable?: boolean; note?: string } | null;
  const item = loaded.items.find((i) => i.id === body?.itemId);
  if (!item || typeof body?.notApplicable !== "boolean") return jsonError("Invalid request", 400);
  const db = adminClient();
  if (body.notApplicable) {
    await db
      .from("checklist_items")
      .update({ status: "not_applicable", client_note: (body.note ?? "").slice(0, 500) || null, received_at: new Date().toISOString() })
      .eq("id", item.id);
  } else {
    const { count } = await db.from("documents").select("id", { count: "exact", head: true }).eq("checklist_item_id", item.id).eq("status", "uploaded");
    await db.from("checklist_items").update({ status: count ? "received" : "missing", client_note: null }).eq("id", item.id);
  }
  await refreshClientQuarterStatus(loaded.cq.id);
  await audit({ actorType: "client", action: "client_upload", targetType: "client_quarter", targetId: loaded.cq.id, details: { item: item.item_key, notApplicable: body.notApplicable } });
  return jsonOk(await clientQuarterView(loaded.cq.id));
}
