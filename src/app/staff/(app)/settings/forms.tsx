"use client";

import { useActionState, useTransition } from "react";
import { addStaff, updateRetention, updateStaff } from "./actions";
import { staffButton, staffInput } from "@/components/staff/AuthCard";

type S = { message?: string; error?: string };

export function RetentionForm({ months }: { months: number }) {
  const [state, action, pending] = useActionState<S, FormData>(updateRetention, {});
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
      <label className="text-sm font-semibold">
        Flag after (months)
        <input name="months" type="number" min={12} max={240} defaultValue={months} className={`${staffInput} w-32`} />
      </label>
      <button className={staffButton} disabled={pending}>
        Save
      </button>
      {state.message ? <p className="w-full text-green-800">{state.message}</p> : null}
      {state.error ? <p className="w-full text-red-700">{state.error}</p> : null}
    </form>
  );
}

export function AddStaffForm() {
  const [state, action, pending] = useActionState<S, FormData>(addStaff, {});
  return (
    <form action={action} className="mt-5 grid gap-3 border-t pt-4 md:grid-cols-4">
      <label className="text-sm font-semibold">
        Name
        <input name="name" required className={staffInput} />
      </label>
      <label className="text-sm font-semibold">
        Email
        <input name="email" type="email" required className={staffInput} />
      </label>
      <label className="text-sm font-semibold">
        Role
        <select name="role" className={staffInput} defaultValue="staff">
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <div className="flex items-end">
        <button className={staffButton} disabled={pending}>
          Add staff member
        </button>
      </div>
      {state.message ? <p className="text-green-800 md:col-span-4">{state.message}</p> : null}
      {state.error ? <p className="text-red-700 md:col-span-4">{state.error}</p> : null}
    </form>
  );
}

export function StaffRowActions({ id, role, active }: { id: string; role: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <span className="flex gap-3">
      <button type="button" className="underline" disabled={pending} onClick={() => start(async () => void (await updateStaff(id, { role: role === "admin" ? "staff" : "admin" })))}>
        Make {role === "admin" ? "staff" : "admin"}
      </button>
      <button type="button" className="underline" disabled={pending} onClick={() => start(async () => void (await updateStaff(id, { active: !active })))}>
        {active ? "Turn off access" : "Turn on access"}
      </button>
    </span>
  );
}
