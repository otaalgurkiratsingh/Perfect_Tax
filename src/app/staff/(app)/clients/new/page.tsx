import type { Metadata } from "next";
import Link from "next/link";
import { firmConfig } from "@firm/config";
import { requireStaff } from "@/lib/staff/auth";
import { ClientForm } from "@/components/staff/ClientForm";

export const metadata: Metadata = { title: "Add client" };

export default async function NewClientPage() {
  await requireStaff();
  return (
    <div className="space-y-5">
      <Link href="/staff/clients" className="text-sm underline">
        ← Clients
      </Link>
      <h1 className="text-2xl font-bold">Add client</h1>
      <ClientForm services={firmConfig.quarterly.clientServices} />
    </div>
  );
}
