import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/staff/auth";
import { staffButton, staffInput } from "@/components/staff/AuthCard";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireStaff();
  const { q } = await searchParams;
  let query = ctx.supabase.from("clients").select("id, business_name, contact_name, email, phone, services, active, auth_user_id").order("business_name").limit(500);
  const term = (q ?? "").replace(/[%,()*\\]/g, " ").trim();
  if (term) query = query.or(`business_name.ilike.%${term}%,contact_name.ilike.%${term}%,email.ilike.%${term}%`);
  const { data: clients } = await query;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-gray-600">Ongoing clients for quarterly document collection.</p>
        </div>
        <Link href="/staff/clients/new" className={staffButton}>
          Add client
        </Link>
      </div>
      <form action="/staff/clients" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search business, contact or email" className={`${staffInput} max-w-md`} />
        <button className={staffButton}>Search</button>
      </form>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[700px] text-left">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Services</th>
              <th className="px-4 py-3">Client page</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(clients ?? []).map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/staff/clients/${c.id}`} className="font-semibold hover:underline">
                    {c.business_name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {c.contact_name}
                  <div className="text-xs text-gray-500">{c.email ?? c.phone}</div>
                </td>
                <td className="px-4 py-3">{c.services.join(", ") || <span className="text-amber-700">none — no checklist</span>}</td>
                <td className="px-4 py-3">{c.auth_user_id ? "Invited" : "—"}</td>
                <td className="px-4 py-3">{c.active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
