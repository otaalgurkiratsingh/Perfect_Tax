"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addToQuarterAction,
  inviteClientAction,
  markProcessedAction,
  nudgeAction,
  nudgeAllAction,
  openQuarterAction,
  reopenItemAction,
  sendRequestsAction,
  type ActionState,
} from "@/app/staff/(app)/quarters/actions";
import { staffButton, staffButtonSecondary, staffInput } from "./AuthCard";

function useAction() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState>({});
  const run = (fn: () => Promise<ActionState | void>) => start(async () => setMsg((await fn()) ?? {}));
  return { pending, msg, run };
}

function Feedback({ msg }: { msg: ActionState }) {
  if (msg.error) return <span className="text-sm text-red-700">{msg.error}</span>;
  if (msg.message) return <span role="status" className="text-sm text-green-800">{msg.message}</span>;
  return null;
}

export function OpenQuarterForm({ year, quarter }: { year: number; quarter: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(openQuarterAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
      <label className="text-sm font-semibold">
        Year
        <input name="year" type="number" defaultValue={year} min={2020} max={2100} className={`${staffInput} w-28`} />
      </label>
      <label className="text-sm font-semibold">
        Quarter
        <select name="quarter" defaultValue={quarter} className={`${staffInput} w-44`}>
          <option value={1}>Q1 (Jan–Mar)</option>
          <option value={2}>Q2 (Apr–Jun)</option>
          <option value={3}>Q3 (Jul–Sep)</option>
          <option value={4}>Q4 (Oct–Dec)</option>
        </select>
      </label>
      <label className="flex items-center gap-2 pb-2.5 text-sm font-semibold">
        <input type="checkbox" name="sendNow" className="h-5 w-5" /> Send requests to all clients now
      </label>
      <button className={staffButton} disabled={pending}>
        {pending ? "Opening…" : "Open quarter"}
      </button>
      {state.error ? <p className="w-full text-red-700">{state.error}</p> : null}
    </form>
  );
}

export function BulkButtons({ quarterId, notSent, stragglers }: { quarterId: string; notSent: number; stragglers: number }) {
  const { pending, msg, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className={staffButton} disabled={pending || notSent === 0} onClick={() => run(() => sendRequestsAction(quarterId))}>
        Send requests to all Not Sent ({notSent})
      </button>
      <button className={staffButtonSecondary} disabled={pending || stragglers === 0} onClick={() => run(() => nudgeAllAction(quarterId))}>
        Nudge all stragglers ({stragglers})
      </button>
      <Feedback msg={msg} />
    </div>
  );
}

export function RowActions({ clientQuarterId, status }: { clientQuarterId: string; status: string }) {
  const { pending, msg, run } = useAction();
  return (
    <span className="flex flex-wrap items-center gap-3 text-sm font-semibold">
      {["not_sent", "requested", "partial"].includes(status) ? (
        <button className="underline" disabled={pending} onClick={() => run(() => nudgeAction(clientQuarterId))}>
          {status === "not_sent" ? "Send request" : "Nudge"}
        </button>
      ) : null}
      {status !== "processed" ? (
        <button className="underline" disabled={pending} onClick={() => run(() => markProcessedAction(clientQuarterId, true))}>
          Mark processed
        </button>
      ) : (
        <button className="underline" disabled={pending} onClick={() => run(() => markProcessedAction(clientQuarterId, false))}>
          Undo processed
        </button>
      )}
      <Feedback msg={msg} />
    </span>
  );
}

export function ReopenItemButton({ itemId, clientQuarterId }: { itemId: string; clientQuarterId: string }) {
  const { pending, run } = useAction();
  return (
    <button className="text-sm font-semibold underline" disabled={pending} onClick={() => run(() => reopenItemAction(itemId, clientQuarterId))}>
      Mark as still missing
    </button>
  );
}

export function InviteButton({ clientId, hasLogin }: { clientId: string; hasLogin: boolean }) {
  const { pending, msg, run } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      <button className={staffButtonSecondary} disabled={pending} onClick={() => run(() => inviteClientAction(clientId))}>
        {hasLogin ? "Email a new sign-in link" : "Invite to client page"}
      </button>
      <Feedback msg={msg} />
    </span>
  );
}

export function AddToQuarterButton({ clientId, quarterId, label }: { clientId: string; quarterId: string; label: string }) {
  const { pending, msg, run } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      <button className={staffButtonSecondary} disabled={pending} onClick={() => run(() => addToQuarterAction(clientId, quarterId))}>
        Add to {label}
      </button>
      <Feedback msg={msg} />
    </span>
  );
}
