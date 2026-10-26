"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { requestSignInLink, type PortalState } from "../actions";

export function PortalLoginForm() {
  const [state, action, pending] = useActionState<PortalState, FormData>(requestSignInLink, {});
  if (state.message) return <p className="mt-6 rounded-2xl bg-green-700 p-5 text-lg font-semibold text-white">{state.message}</p>;
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block text-[17px] font-semibold">
        Your email
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          className="mt-1 block min-h-14 w-full rounded-xl border-2 border-gray-300 bg-white px-4 text-lg focus:border-brand focus:outline-none"
        />
      </label>
      {state.error ? (
        <p role="alert" className="font-medium text-red-700">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
