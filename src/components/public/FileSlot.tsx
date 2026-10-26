"use client";

import { useRef, useState } from "react";
import { formatBytes } from "@/components/ui";
import { ApiError, removeFile, uploadFile, type UploadedFile } from "./api";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif";

interface Pending {
  key: string;
  name: string;
  progress: number;
  error?: string;
}

/**
 * One upload slot: says in plain words what it is and why, accepts several
 * files (tap to choose or drag and drop), shows progress, and lists what's in.
 */
export function FileSlot({
  token,
  slot,
  label,
  why,
  files,
  onAdded,
  onRemoved,
  allowRemove = true,
  testId,
}: {
  token: string;
  slot: { docType?: string; itemId?: string };
  label: string;
  why: string;
  files: UploadedFile[];
  onAdded: (file: UploadedFile) => void;
  onRemoved: (id: string) => void;
  allowRemove?: boolean;
  testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);

  async function handle(list: FileList | null) {
    if (!list || list.length === 0) return;
    const chosen = Array.from(list);
    const entries = chosen.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, progress: 0 }));
    setPending((p) => [...p, ...entries]);
    await Promise.all(
      chosen.map(async (file, i) => {
        const key = entries[i].key;
        if (file.size > 25 * 1024 * 1024) {
          setPending((p) => p.map((x) => (x.key === key ? { ...x, error: "Over 25 MB — please upload a smaller copy." } : x)));
          return;
        }
        try {
          const doc = await uploadFile(token, slot, file, (progress) =>
            setPending((p) => p.map((x) => (x.key === key ? { ...x, progress } : x))),
          );
          setPending((p) => p.filter((x) => x.key !== key));
          onAdded(doc);
        } catch (e) {
          const message = e instanceof ApiError ? e.message : "Upload failed. Please try again.";
          setPending((p) => p.map((x) => (x.key === key ? { ...x, error: message } : x)));
        }
      }),
    );
    if (input.current) input.current.value = "";
  }

  async function remove(id: string) {
    try {
      await removeFile(token, id);
      onRemoved(id);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Could not remove the file.");
    }
  }

  return (
    <div
      data-testid={testId}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handle(e.dataTransfer.files);
      }}
      className={`rounded-2xl border-2 bg-white p-4 ${dragging ? "border-accent bg-red-50" : files.length ? "border-green-600" : "border-gray-300"}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            files.length ? "bg-green-600 text-white" : "bg-gray-200 text-gray-500"
          }`}
        >
          {files.length ? "✓" : ""}
        </span>
        <div className="flex-1">
          <p className="text-lg font-semibold">{label}</p>
          <p className="text-[15px] text-gray-600">{why}</p>
        </div>
      </div>

      {files.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {files.map((f) => (
            <li key={f.id} data-testid="uploaded-file" className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-[15px]">
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-gray-500">{formatBytes(f.size)}</span>
              {allowRemove ? (
                <button type="button" onClick={() => void remove(f.id)} className="ml-auto shrink-0 px-2 py-1 font-semibold text-red-700 underline">
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {pending.length > 0 ? (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {pending.map((p) => (
            <li key={p.key} className="rounded-lg bg-gray-50 px-3 py-2 text-[15px]">
              <div className="flex items-center gap-2">
                <span className="truncate">{p.name}</span>
                {p.error ? (
                  <button
                    type="button"
                    className="ml-auto shrink-0 font-semibold underline"
                    onClick={() => setPending((x) => x.filter((y) => y.key !== p.key))}
                  >
                    Dismiss
                  </button>
                ) : (
                  <span className="ml-auto shrink-0 text-gray-500">{Math.round(p.progress * 100)}%</span>
                )}
              </div>
              {p.error ? (
                <p role="alert" className="mt-1 font-medium text-red-700">
                  {p.error}
                </p>
              ) : (
                <div className="mt-2 h-2 overflow-hidden rounded bg-gray-200">
                  <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(p.progress * 100)}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        aria-label={`Add files: ${label}`}
        onChange={(e) => void handle(e.target.files)}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="mt-3 flex min-h-14 w-full items-center justify-center rounded-xl border-2 border-dashed border-gray-400 text-lg font-semibold text-gray-800 hover:border-brand"
      >
        {files.length ? "+ Add another file" : "Tap to add a photo or file"}
      </button>
      <p className="mt-2 text-center text-[13px] text-gray-500">PDF, JPG, PNG or HEIC · up to 25 MB each</p>
    </div>
  );
}
