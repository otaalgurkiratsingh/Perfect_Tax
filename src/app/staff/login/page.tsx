import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/staff/AuthCard";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Staff sign in" };
export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  idle: "You were signed out after a period of inactivity.",
  expired: "Your session reached its time limit. Please sign in again.",
  signed_out: "You're signed out.",
  forbidden: "That account doesn't have dashboard access.",
};

export default async function StaffLogin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { reason } = await searchParams;
  return (
    <AuthCard title="Staff sign in">
      {reason && REASONS[reason] ? <p className="mb-4 rounded-lg bg-highlight/40 p-3">{REASONS[reason]}</p> : null}
      <LoginForm />
      <p className="mt-6 text-sm">
        <Link href="/staff/forgot" className="underline">
          Forgot your password?
        </Link>
      </p>
    </AuthCard>
  );
}
