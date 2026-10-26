import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/Brand";
import { PortalLoginForm } from "./PortalLoginForm";

export const metadata: Metadata = { title: "Client sign in" };
export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  signed_out: "You're signed out.",
  link_expired: "That sign-in link has expired or was already used. Ask for a new one below.",
  no_account: "We couldn't find a client account for that sign-in. Please contact our office.",
};

export default async function PortalLogin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { reason } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-3xl font-bold">Client sign in</h1>
        <p className="mt-2 text-lg text-gray-700">No password needed — we&apos;ll email you a one-time sign-in link.</p>
        {reason && REASONS[reason] ? <p className="mt-4 rounded-xl bg-highlight/50 p-3 text-lg">{REASONS[reason]}</p> : null}
        <PortalLoginForm />
      </main>
      <PublicFooter />
    </div>
  );
}
