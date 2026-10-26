import type { Metadata } from "next";
import { firmConfig } from "@firm/config";
import { env } from "@/lib/env";
import { requireStaff } from "@/lib/staff/auth";
import { RetentionForm, AddStaffForm, StaffRowActions } from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireStaff({ admin: true });
  const [{ data: settings }, { data: staff }] = await Promise.all([
    ctx.supabase.from("app_settings").select("*").eq("id", 1).single(),
    ctx.supabase.from("staff_profiles").select("*").order("created_at"),
  ]);
  const months = settings?.retention_months ?? firmConfig.retention.defaultMonths;
  const t = env.twilio;
  const waTemplates = Object.entries(firmConfig.messages).filter(([, m]) => m.whatsapp);
  const checks: [string, boolean, string][] = [
    ["Messages are sent for real (MESSAGING_MODE=live)", env.messagingMode === "live", "Until then every message is only logged (dry run)."],
    ["Email provider key (Resend)", Boolean(env.resendApiKey), "Set RESEND_API_KEY."],
    ["Sender email address", Boolean(firmConfig.notifications.fromEmail), "Set notifications.fromEmail in firm.config.ts (domain verified in Resend)."],
    ["SMS provider (Twilio)", Boolean(t.accountSid && t.authToken && (t.smsFrom || t.messagingServiceSid)), "Set the TWILIO_* variables."],
    ["Spam protection (Turnstile)", Boolean(env.turnstileSecret && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY), "Set the TURNSTILE keys. Without them the start page refuses new forms in production."],
    ["Booking link", Boolean(firmConfig.links.bookingUrl), "Set links.bookingUrl in firm.config.ts."],
    [
      "WhatsApp",
      firmConfig.features.whatsappEnabled && Boolean(t.whatsappFrom) && waTemplates.every(([, m]) => m.whatsapp?.contentSid),
      "Needs a Twilio WhatsApp sender, Meta-approved templates (contentSid) and features.whatsappEnabled. Until then quarterly requests go by SMS + email.",
    ],
  ];
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Go-live checklist</h2>
        <ul className="mt-3 space-y-2">
          {checks.map(([label, ok, help]) => (
            <li key={label} className="flex gap-3">
              <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${ok ? "bg-green-600 text-white" : "bg-amber-200"}`}>
                {ok ? "✓" : "!"}
              </span>
              <span>
                <b>{label}</b>
                {ok ? null : <span className="block text-sm text-gray-600">{help}</span>}
              </span>
            </li>
          ))}
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-bold">?</span>
            <span>
              <b>Database region is Canada (ca-central-1)</b>
              <span className="block text-sm text-gray-600">Can&apos;t be checked from here — confirm in the Supabase dashboard (see GK_SETUP.md).</span>
            </span>
          </li>
        </ul>
      </section>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Record retention</h2>
        <p className="mt-1 text-gray-600">
          Intakes older than this are <b>flagged</b> for a deletion review in the inbox (&ldquo;Deletion review&rdquo; tab). Nothing is ever deleted automatically.
        </p>
        <RetentionForm months={months} />
      </section>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Staff accounts</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-gray-600">
            <tr>
              <th className="py-2">Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Access</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(staff ?? []).map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="py-2 font-semibold">{s.full_name}</td>
                <td>{s.email}</td>
                <td>{s.role}</td>
                <td>{s.active ? "Active" : "Turned off"}</td>
                <td>{s.id === ctx.profile.id ? <span className="text-gray-500">You</span> : <StaffRowActions id={s.id} role={s.role} active={s.active} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <AddStaffForm />
      </section>
    </div>
  );
}
