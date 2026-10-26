import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/Brand";
import { requireStaff } from "@/lib/staff/auth";
import { signOut } from "../actions";
import { NavLink } from "@/components/staff/NavLink";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const { profile } = await requireStaff();
  const isAdmin = profile.role === "admin";
  return (
    <div className="min-h-screen bg-gray-100 text-[15px]">
      <header className="border-b-4 border-accent bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/staff" aria-label="Dashboard home">
            <BrandMark size="sm" />
          </Link>
          <nav className="flex flex-wrap gap-1" aria-label="Dashboard">
            <NavLink href="/staff" exact>
              Intake inbox
            </NavLink>
            <NavLink href="/staff/quarters">Quarterly</NavLink>
            <NavLink href="/staff/clients">Clients</NavLink>
            {isAdmin ? <NavLink href="/staff/audit">Audit log</NavLink> : null}
            {isAdmin ? <NavLink href="/staff/settings">Settings</NavLink> : null}
            <NavLink href="/staff/qr">Office QR</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-gray-600">
              {profile.full_name || profile.email} · {profile.role}
            </span>
            <form action={signOut}>
              <button className="rounded-lg border-2 border-gray-300 px-3 py-1.5 font-semibold hover:border-brand">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
