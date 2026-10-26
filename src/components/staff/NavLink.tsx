"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, exact, children }: { href: string; exact?: boolean; children: ReactNode }) {
  const path = usePathname();
  const active = exact ? path === href || path.startsWith("/staff/intakes") : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg px-3 py-2 font-semibold ${active ? "bg-brand text-brand-text" : "text-gray-800 hover:bg-gray-100"}`}
    >
      {children}
    </Link>
  );
}
