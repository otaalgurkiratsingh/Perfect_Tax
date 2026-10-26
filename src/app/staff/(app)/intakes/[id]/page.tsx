import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { firmConfig } from "@firm/config";
import { documentSlotLabel } from "@/lib/config";
import { presentIntake, STATUS_LABELS } from "@/lib/intake/present";
import type { IntakeRow } from "@/lib/intake/server";
import { requireStaff, staffAudit } from "@/lib/staff/auth";
import { StatusPill } from "@/components/staff/StatusPill";
import { formatBytes } from "@/lib/format";
import { DeleteIntake, RequestDocsForm, SinReveal, StatusSelect, StopRequestButton, ZipButton } from "@/components/staff/IntakeActions";
import { CreateClientButton } from "@/components/staff/CreateClientButton";

export const metadata: Metadata = { title: "Intake" };

const tz = firmConfig.firm.timezone;
const fmt = (ts: string | null) => (ts ? new Date(ts).toLocaleString("en-CA", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }) : "—");

export default async function IntakeDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await ctx.supabase.from("intakes").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const intake = data as IntakeRow & { retention_flagged_at: string | null; missing_docs_received_at: string | null };
  await staffAudit(ctx, { action: "view_intake", targetType: "intake", targetId: id });

  const [{ data: docs }, { data: requests }, { data: consents }, { data: messages }] = await Promise.all([
    ctx.supabase.from("documents").select("id, doc_type, original_name, mime_type, size_bytes, uploaded_at, source").eq("intake_id", id).eq("status", "uploaded").order("uploaded_at"),
    ctx.supabase.from("doc_requests").select("*").eq("intake_id", id).order("created_at", { ascending: false }),
    ctx.supabase.from("intake_consents").select("*").eq("intake_id", id).order("consent_key"),
    ctx.supabase.from("message_log").select("created_at, channel, template_key, recipient_masked, status, error").eq("intake_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  const sections = presentIntake(intake);
  const isAdmin = ctx.profile.role === "admin";
  const slots = firmConfig.intake.documentSlots
    .filter((s) => !intake.applicant_type || (s.showFor as string[]).includes(intake.applicant_type))
    .map((s) => ({ key: s.key, label: s.label }));

  return (
    <div className="space-y-6">
      <Link href="/staff" className="text-sm underline">
        ← Back to inbox
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{intake.primary_name ?? "Unfinished form"}</h1>
          {intake.business_name ? <p className="text-lg text-gray-700">{intake.business_name}</p> : null}
          <p className="mt-1 text-gray-600">
            #{intake.reference} · submitted {fmt(intake.submitted_at)} ·{" "}
            <StatusPill status={intake.status} label={STATUS_LABELS[intake.status] ?? intake.status} />
          </p>
          {intake.missing_docs_received_at ? <p className="mt-1 font-semibold text-green-700">Missing documents received {fmt(intake.missing_docs_received_at)}</p> : null}
          {intake.retention_flagged_at ? <p className="mt-1 font-semibold text-red-700">Flagged for deletion review {fmt(intake.retention_flagged_at)}</p> : null}
        </div>
        {intake.status !== "draft" ? (
          <div className="w-56">
            <StatusSelect key={intake.status} intakeId={id} status={intake.status} labels={STATUS_LABELS} />
          </div>
        ) : null}
      </div>

      {intake.status !== "draft" ? (
        <div className="flex flex-wrap items-start gap-3">
          <ZipButton intakeId={id} />
          <RequestDocsForm intakeId={id} slots={slots} hasContact={Boolean(intake.email || intake.phone)} />
          <CreateClientButton intakeId={id} existingClientId={intake.client_id} />
        </div>
      ) : (
        <p className="rounded-lg bg-gray-200 p-3">This person started the form but hasn&apos;t sent it yet. Automatic reminders handle follow-up.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          {sections.map((s) => (
            <section key={s.title} className="rounded-xl bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-bold">{s.title}</h2>
              <dl className="divide-y">
                {s.rows.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[40%_60%] gap-3 py-2">
                    <dt className="text-gray-600">{k}</dt>
                    <dd className="break-words font-medium">
                      {k === "SIN" && firmConfig.features.allowSinReveal ? (
                        <SinReveal intakeId={id} which={s.title === "Spouse / partner" ? "spouse" : "primary"} masked={v} />
                      ) : (
                        v
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <div className="space-y-4">
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-lg font-bold">Documents ({docs?.length ?? 0})</h2>
            {docs?.length ? (
              <ul className="divide-y">
                {docs.map((d) => (
                  <li key={d.id} className="py-2" data-testid="staff-doc">
                    <p className="text-xs font-semibold uppercase text-gray-500">{documentSlotLabel(d.doc_type)}</p>
                    <p className="break-all font-medium">{d.original_name}</p>
                    <p className="text-sm text-gray-600">
                      {formatBytes(Number(d.size_bytes))} · {fmt(d.uploaded_at)}
                      {d.source === "doc_request" ? " · via missing-docs link" : ""}
                    </p>
                    <p className="mt-1 flex gap-4 text-sm font-semibold">
                      {["application/pdf", "image/jpeg", "image/png"].includes(d.mime_type) ? (
                        <a href={`/api/staff/documents/${d.id}?mode=view`} target="_blank" rel="noreferrer" className="underline">
                          View
                        </a>
                      ) : null}
                      <a href={`/api/staff/documents/${d.id}?mode=download`} className="underline">
                        Download
                      </a>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-600">No documents yet.</p>
            )}
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-lg font-bold">Missing-document requests</h2>
            {requests?.length ? (
              <ul className="divide-y">
                {requests.map((r) => (
                  <li key={r.id} className="py-2" data-testid="doc-request">
                    <p className="font-medium">{(r.items as string[]).map(documentSlotLabel).join(", ")}</p>
                    <p className="text-sm text-gray-600">
                      Sent {fmt(r.created_at)} · <b data-testid="doc-request-status">{r.status}</b> · reminders {r.reminders_sent}/{firmConfig.reminders.docRequestMaxReminders}
                      {r.completed_at ? ` · completed ${fmt(r.completed_at)}` : ""}
                    </p>
                    {r.status === "open" ? <StopRequestButton intakeId={id} requestId={r.id} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-600">None.</p>
            )}
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-lg font-bold">Consent records</h2>
            {consents?.length ? (
              <ul className="space-y-2 text-sm">
                {consents.map((c) => (
                  <li key={c.id}>
                    <b>{c.consent_key}</b> — {c.accepted ? "accepted" : "not accepted"} · v{c.version} · {fmt(c.recorded_at)} · IP {c.ip}
                    <details>
                      <summary className="cursor-pointer text-gray-600">Exact text shown</summary>
                      <p className="mt-1 text-gray-700">{c.text_shown}</p>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-600">Not submitted yet.</p>
            )}
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-lg font-bold">Messages sent</h2>
            {messages?.length ? (
              <ul className="space-y-1 text-sm">
                {messages.map((m, i) => (
                  <li key={i}>
                    {fmt(m.created_at)} · {m.channel} · {m.template_key} → {m.recipient_masked} · <b>{m.status}</b>
                    {m.error ? <span className="text-red-700"> ({m.error})</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-600">None.</p>
            )}
          </section>

          {isAdmin ? (
            <section className="rounded-xl border-2 border-red-200 bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-bold text-red-800">Delete (admin)</h2>
              <DeleteIntake intakeId={id} reference={intake.reference} />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
