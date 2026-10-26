"use client";

import { useState, useTransition } from "react";
import { zipSync, strToU8 } from "fflate";
import { changeStatus, deleteIntake, requestDocuments, revealSin, stopDocRequest } from "@/app/staff/(app)/intakes/[id]/actions";
import { staffButton, staffButtonDanger, staffButtonSecondary, staffInput } from "./AuthCard";


export function StatusSelect({ intakeId, status, labels }: { intakeId: string; status: string; labels: Record<string, string> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="text-sm font-semibold">
      Pipeline status
      <select
        aria-label="Pipeline status"
        disabled={pending}
        defaultValue={status}
        className={staffInput}
        onChange={(e) => {
          const v = e.target.value;
          start(async () => {
            const r = await changeStatus(intakeId, v);
            setError(r.error ?? null);
          });
        }}
      >
        {["new", "in_review", "docs_missing", "ready", "client_created"].map((s) => (
          <option key={s} value={s}>
            {labels[s]}
          </option>
        ))}
      </select>
      {error ? <span className="text-red-700">{error}</span> : null}
    </label>
  );
}

export function SinReveal({ intakeId, which, masked }: { intakeId: string; which: "primary" | "spouse"; masked: string }) {
  const [shown, setShown] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono" data-testid={`sin-${which}`}>
        {shown ?? masked}
      </span>
      {shown ? null : (
        <button
          type="button"
          disabled={pending}
          className="text-sm font-semibold underline"
          onClick={() =>
            start(async () => {
              const r = await revealSin(intakeId, which);
              if (r.sin) {
                setShown(r.sin);
                setTimeout(() => setShown(null), 30_000);
              }
            })
          }
        >
          Reveal (logged)
        </button>
      )}
    </span>
  );
}

export function ZipButton({ intakeId }: { intakeId: string }) {
  const [state, setState] = useState<string | null>(null);
  async function run() {
    try {
      setState("Preparing…");
      const res = await fetch(`/api/staff/intakes/${intakeId}/package`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not prepare the package");
      const pkg = (await res.json()) as { zipName: string; summaryName: string; summary: string; files: { name: string; url: string }[] };
      const entries: Record<string, Uint8Array> = { [pkg.summaryName]: strToU8(pkg.summary) };
      let i = 0;
      for (const f of pkg.files) {
        setState(`Downloading ${++i} of ${pkg.files.length}…`);
        const r = await fetch(f.url);
        if (!r.ok) throw new Error(`Could not download ${f.name}`);
        entries[f.name] = new Uint8Array(await r.arrayBuffer());
      }
      const zip = zipSync(entries, { level: 0 });
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = pkg.zipName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState(null);
    } catch (e) {
      setState(e instanceof Error ? e.message : "Download failed");
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className={staffButton} onClick={() => void run()} disabled={state !== null && state.endsWith("…")}>
        Download all (ZIP)
      </button>
      {state ? <span className="text-sm text-gray-600">{state}</span> : null}
    </span>
  );
}

export function RequestDocsForm({
  intakeId,
  slots,
  hasContact,
}: {
  intakeId: string;
  slots: { key: string; label: string }[];
  hasContact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" className={staffButtonSecondary} onClick={() => setOpen(true)} disabled={!hasContact}>
        Request missing docs
      </button>
    );
  }
  return (
    <div className="w-full rounded-xl border-2 border-brand bg-white p-4">
      <h3 className="font-bold">Request missing documents</h3>
      <p className="text-sm text-gray-600">The client gets a private upload-only link (works 7 days) by email and text. Reminders go weekly, up to 3, then stop.</p>
      <fieldset className="mt-3 grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Documents to request</legend>
        {slots.map((s) => (
          <label key={s.key} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={items.includes(s.key)}
              onChange={(e) => setItems((x) => (e.target.checked ? [...x, s.key] : x.filter((k) => k !== s.key)))}
            />
            {s.label}
          </label>
        ))}
      </fieldset>
      <label className="mt-3 block text-sm font-semibold">
        Note to the client (optional — shown on the upload page, not in the text message)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} className={staffInput} />
      </label>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className={staffButton}
          disabled={pending || items.length === 0}
          onClick={() =>
            start(async () => {
              const r = await requestDocuments(intakeId, items, note);
              setResult(r.error ?? (r.sent ? "Sent ✓" : "Saved, but the message could not be delivered — check the message log."));
              if (!r.error) {
                setItems([]);
                setNote("");
                setOpen(false);
              }
            })
          }
        >
          {pending ? "Sending…" : `Send request (${items.length})`}
        </button>
        <button type="button" className="underline" onClick={() => setOpen(false)}>
          Cancel
        </button>
        {result ? <span role="status">{result}</span> : null}
      </div>
    </div>
  );
}

export function StopRequestButton({ intakeId, requestId }: { intakeId: string; requestId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="text-sm font-semibold text-red-700 underline" disabled={pending} onClick={() => start(async () => void (await stopDocRequest(intakeId, requestId)))}>
      Stop reminders
    </button>
  );
}

export function DeleteIntake({ intakeId, reference }: { intakeId: string; reference: string }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <p className="text-sm">Permanently deletes this intake, its answers, consents and files. Type the reference <b>{reference}</b> to confirm.</p>
      <div className="flex gap-2">
        <input value={value} onChange={(e) => setValue(e.target.value)} className={staffInput} aria-label="Reference to confirm deletion" />
        <button
          type="button"
          className={staffButtonDanger}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deleteIntake(intakeId, value);
              if (r?.error) setError(r.error);
            })
          }
        >
          Delete
        </button>
      </div>
      {error ? <p className="text-red-700">{error}</p> : null}
    </div>
  );
}
