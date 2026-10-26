import "server-only";
import type { StaffContext } from "./auth";

export interface InboxFilters {
  status?: string;
  service?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
}

export const PAGE_SIZE = 50;
const STATUSES = ["draft", "new", "in_review", "docs_missing", "ready", "client_created"];

export function parseFilters(sp: Record<string, string | string[] | undefined>): InboxFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const date = (k: string) => (one(k) && /^\d{4}-\d{2}-\d{2}$/.test(one(k)!) ? one(k) : undefined);
  return {
    status: one("status"),
    service: one("service"),
    from: date("from"),
    to: date("to"),
    q: one("q")?.slice(0, 100),
    page: Math.max(1, Number(one("page")) || 1),
  };
}

export const INBOX_COLUMNS =
  "id, reference, status, applicant_type, primary_name, email, phone, business_name, services, referral_source, referral_detail, submitted_at, created_at, last_activity_at, sin_ciphertext, spouse_sin_ciphertext, retention_flagged_at, missing_docs_received_at, client_id";

/** Inbox query through the staff member's own session (RLS applies). */
export function inboxQuery(ctx: StaffContext, f: InboxFilters, opts: { paginate: boolean; columns?: string }) {
  let q = ctx.supabase.from("intakes").select(opts.columns ?? INBOX_COLUMNS, { count: "exact" });
  if (f.status === "retention") q = q.not("retention_flagged_at", "is", null);
  else if (f.status === "all") q = q.neq("status", "draft");
  else if (f.status && STATUSES.includes(f.status)) q = q.eq("status", f.status);
  else q = q.in("status", ["new", "in_review", "docs_missing", "ready"]);
  if (f.service) q = q.contains("services", [f.service]);
  if (f.from) q = q.gte(f.status === "draft" ? "created_at" : "submitted_at", `${f.from}T00:00:00`);
  if (f.to) q = q.lte(f.status === "draft" ? "created_at" : "submitted_at", `${f.to}T23:59:59.999`);
  if (f.q) {
    const term = f.q.replace(/[%,()*\\]/g, " ").trim();
    if (term) q = q.or(`primary_name.ilike.%${term}%,email.ilike.%${term}%,business_name.ilike.%${term}%,reference.ilike.%${term}%`);
  }
  q = q.order(f.status === "draft" ? "last_activity_at" : "submitted_at", { ascending: false, nullsFirst: false });
  if (opts.paginate) {
    const page = f.page ?? 1;
    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  } else {
    q = q.limit(10000);
  }
  return q;
}

export async function statusCounts(ctx: StaffContext): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  await Promise.all(
    [...STATUSES, "retention"].map(async (s) => {
      let q = ctx.supabase.from("intakes").select("id", { count: "exact", head: true });
      q = s === "retention" ? q.not("retention_flagged_at", "is", null) : q.eq("status", s);
      const { count } = await q;
      counts[s] = count ?? 0;
    }),
  );
  return counts;
}
