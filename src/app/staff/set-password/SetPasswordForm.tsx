"use client";

import { useActionState } from "react";
import { setPassword, type FormState } from "../actions";
import { staffButton, staffInput } from "@/components/staff/AuthCard";

export function SetPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(setPassword, {});
  return (
    <form action={action} className="space-y-4">
      <label className="block font-medium">
        New password
        <input name="password" type="password" autoComplete="new-password" required className={staffInput} />
      </label>
      <label className="block font-medium">
        Type it again
        <input name="confirm" type="password" autoComplete="new-password" required className={staffInput} />
      </label>
      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
          {state.error}
        </p>
      ) : null}
      <button disabled={pending} className={`${staffButton} w-full`}>
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
