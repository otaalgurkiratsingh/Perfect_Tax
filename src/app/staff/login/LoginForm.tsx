"use client";

import { useActionState } from "react";
import { signIn, type FormState } from "../actions";
import { staffButton, staffInput } from "@/components/staff/AuthCard";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-4">
      <label className="block font-medium">
        Email
        <input key={state.email ?? ""} name="email" type="email" autoComplete="username" required defaultValue={state.email} className={staffInput} />
      </label>
      <label className="block font-medium">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={staffInput} />
      </label>
      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={`${staffButton} w-full`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
