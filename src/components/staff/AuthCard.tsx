import type { ReactNode } from "react";
import { BrandMark } from "@/components/Brand";

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-gray-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow">
        <BrandMark size="sm" />
        <h1 className="mt-6 text-2xl font-bold">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export const staffInput =
  "mt-1 block w-full rounded-lg border-2 border-gray-300 px-3 py-2.5 text-base focus:border-brand focus:outline-none";
export const staffButton =
  "inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2.5 font-semibold text-brand-text hover:opacity-90 disabled:opacity-50";
export const staffButtonSecondary =
  "inline-flex items-center justify-center rounded-lg border-2 border-gray-300 bg-white px-4 py-2 font-semibold text-gray-900 hover:border-brand disabled:opacity-50";
export const staffButtonDanger =
  "inline-flex items-center justify-center rounded-lg bg-red-700 px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50";
