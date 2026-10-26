import { firmConfig } from "@firm/config";
import { referralLabel, serviceLabel } from "@/lib/config";
import { APPLICANT_LABELS, STATUS_LABELS, toCsv } from "@/lib/intake/present";
import { staffApi, staffAudit } from "@/lib/staff/auth";
import { inboxQuery, parseFilters } from "@/lib/staff/intakes";

// CSV export of the current inbox view. SINs are NEVER exported — only "SIN on file: yes/no".
const COLUMNS =
  "id, reference, status, applicant_type, primary_name, email, phone, business_name, services, referral_source, referral_detail, submitted_at, created_at, sin_ciphertext, spouse_sin_ciphertext";

export async function GET(request: Request) {
  const ctx = await staffApi();
  if (ctx instanceof Response) return ctx;
  const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
  const filters = parseFilters(sp);
  const { data, error } = await inboxQuery(ctx, filters, { paginate: false, columns: COLUMNS });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  await staffAudit(ctx, { action: "export_csv", targetType: "intakes", details: { filters, rows: rows.length } });

  const tz = firmConfig.firm.timezone;
  const date = (v: unknown) => (v ? new Date(String(v)).toLocaleString("en-CA", { timeZone: tz }) : "");
  const csv = toCsv([
    ["Reference", "Status", "Type", "Name", "Business", "Email", "Phone", "Services", "Heard about us", "Referral details", "SIN on file", "Spouse SIN on file", "Submitted", "Started"],
    ...rows.map((r) => [
      r.reference,
      STATUS_LABELS[String(r.status)] ?? r.status,
      APPLICANT_LABELS[String(r.applicant_type)] ?? "",
      r.primary_name,
      r.business_name,
      r.email,
      r.phone,
      ((r.services as string[]) ?? []).map(serviceLabel).join("; "),
      referralLabel(r.referral_source as string),
      r.referral_detail,
      r.sin_ciphertext ? "yes" : "no",
      r.applicant_type === "couple" ? (r.spouse_sin_ciphertext ? "yes" : "no") : "",
      date(r.submitted_at),
      date(r.created_at),
    ]),
  ]);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="intakes-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
