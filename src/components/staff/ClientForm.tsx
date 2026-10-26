"use client";

import { useActionState } from "react";
import { createClientAction, updateClientAction, type ActionState } from "@/app/staff/(app)/quarters/actions";
import { staffButton, staffInput } from "./AuthCard";

export interface ClientFormValues {
  id?: string;
  business_name?: string;
  contact_name?: string;
  email?: string | null;
  phone?: string | null;
  whatsapp_phone?: string | null;
  services?: string[];
  notes?: string | null;
  active?: boolean;
}

export function ClientForm({ client, services }: { client?: ClientFormValues; services: { key: string; label: string }[] }) {
  const bound = client?.id ? updateClientAction.bind(null, client.id) : createClientAction;
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});
  const fmt = (p?: string | null) => (p ? p.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3") : "");
  return (
    <form action={action} className="grid gap-4 rounded-xl bg-white p-5 shadow-sm md:grid-cols-2">
      <label className="text-sm font-semibold">
        Business name
        <input name="business_name" required defaultValue={client?.business_name} className={staffInput} />
      </label>
      <label className="text-sm font-semibold">
        Contact name
        <input name="contact_name" required defaultValue={client?.contact_name} className={staffInput} />
      </label>
      <label className="text-sm font-semibold">
        Email
        <input name="email" type="email" defaultValue={client?.email ?? ""} className={staffInput} />
      </label>
      <label className="text-sm font-semibold">
        Mobile (SMS)
        <input name="phone" defaultValue={fmt(client?.phone)} className={staffInput} placeholder="416-555-0123" />
      </label>
      <label className="text-sm font-semibold">
        WhatsApp number (if different or preferred)
        <input name="whatsapp_phone" defaultValue={fmt(client?.whatsapp_phone)} className={staffInput} />
      </label>
      <fieldset className="text-sm font-semibold">
        <legend>Quarterly services (decide the checklist)</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {services.map((s) => (
            <label key={s.key} className="flex items-center gap-2 font-normal">
              <input type="checkbox" name={`service_${s.key}`} defaultChecked={client?.services?.includes(s.key)} className="h-5 w-5" />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="text-sm font-semibold md:col-span-2">
        Notes (staff only)
        <textarea name="notes" rows={2} defaultValue={client?.notes ?? ""} className={staffInput} />
      </label>
      {client?.id ? (
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="active" defaultChecked={client.active} className="h-5 w-5" /> Active (included when a new quarter opens)
        </label>
      ) : null}
      <div className="flex items-center gap-3 md:col-span-2">
        <button className={staffButton} disabled={pending}>
          {client?.id ? "Save changes" : "Add client"}
        </button>
        {state.error ? <span className="text-red-700">{state.error}</span> : null}
        {state.message ? <span className="text-green-800">{state.message}</span> : null}
      </div>
    </form>
  );
}
