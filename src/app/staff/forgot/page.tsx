"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPassword, type FormState } from "../actions";
import { staffButton, staffInput } from "@/components/staff/AuthCard";

export default function Forgot() {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPassword, {});
  return (
    <main className="flex min-h-screen items-start justify-center bg-gray-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow">
        <h1 className="text-2xl font-bold">Reset your password</h1>
        {state.message ? (
          <p className="mt-6 rounded-lg bg-green-50 p-3 text-green-900">{state.message}</p>
        ) : (
          <form action={action} className="mt-6 space-y-4">
            <label className="block font-medium">
              Your work email
              <input name="email" type="email" required className={staffInput} />
            </label>
            <button disabled={pending} className={`${staffButton} w-full`}>
              {pending ? "Sending…" : "Email me a link"}
            </button>
          </form>
        )}
        <p className="mt-6 text-sm">
          <Link href="/staff/login" className="underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
