"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { staffButton, staffButtonSecondary } from "./AuthCard";

interface ExtractionView {
  documentId: string;
  status: string;
  confidence: string;
  reason: string;
  transactionCount: number;
  totalDebits: number | null;
  totalCredits: number | null;
  openingBalance: number | null;
  closingBalance: number | null;
  reconciled: boolean;
}

const BADGE: Record<string, string> = {
  high: "bg-green-100 text-green-900",
  medium: "bg-amber-100 text-amber-900",
  low: "bg-red-100 text-red-900",
  none: "bg-gray-200 text-gray-800",
};

const money = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-CA", { style: "currency", currency: "CAD" }));

export function ExtractionPanel({
  clientQuarterId,
  documents,
  extractions,
}: {
  clientQuarterId: string;
  documents: { id: string; name: string }[];
  extractions: ExtractionView[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(ids: string[]) {
    setError(null);
    for (const id of ids) {
      setBusy(id);
      const res = await fetch("/api/staff/extractions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: id }),
      });
      if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Extraction failed");
    }
    setBusy(null);
    router.refresh();
  }

  const byDoc = new Map(extractions.map((e) => [e.documentId, e]));
  const anyExtracted = extractions.some((e) => e.status === "extracted");
  return (
    <section className="rounded-xl bg-white p-5 shadow-sm" data-testid="extraction-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">
          Bank statement transactions <span className="ml-1 rounded bg-highlight px-2 py-0.5 text-xs font-black uppercase">Beta</span>
        </h2>
        <div className="flex gap-2">
          <button className={staffButton} disabled={busy !== null || documents.length === 0} onClick={() => void run(documents.map((d) => d.id))}>
            {busy ? "Reading…" : "Read all statements"}
          </button>
          {anyExtracted ? (
            <a className={staffButtonSecondary} href={`/api/staff/client-quarters/${clientQuarterId}/transactions`}>
              Download CSV
            </a>
          ) : null}
        </div>
      </div>
      <p className="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
        This reads text-based PDF statements to save typing. It <b>assists</b> your bookkeeping — it does not replace your judgment. Always compare
        the totals with the statement. Scanned or photographed statements are never guessed: they are marked for manual review.
      </p>
      {error ? <p className="mt-2 text-red-700">{error}</p> : null}
      {documents.length === 0 ? (
        <p className="mt-3 text-gray-600">No PDF bank statements uploaded yet.</p>
      ) : (
        <ul className="mt-3 divide-y">
          {documents.map((d) => {
            const e = byDoc.get(d.id);
            return (
              <li key={d.id} className="py-3" data-testid="extraction-row">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="break-all font-semibold">{d.name}</p>
                  <button className="text-sm font-semibold underline" disabled={busy !== null} onClick={() => void run([d.id])}>
                    {busy === d.id ? "Reading…" : e ? "Read again" : "Read this statement"}
                  </button>
                </div>
                {e ? (
                  <div className="mt-1 text-sm">
                    <span className={`mr-2 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${BADGE[e.confidence] ?? BADGE.none}`} data-testid="extraction-confidence">
                      {e.status === "extracted" ? `${e.confidence} confidence` : "manual review"}
                    </span>
                    {e.status === "extracted" ? (
                      <span>
                        {e.transactionCount} transactions · opening {money(e.openingBalance)} · deposits {money(e.totalCredits)} · withdrawals{" "}
                        {money(e.totalDebits)} · closing {money(e.closingBalance)} · {e.reconciled ? "✓ reconciles" : "✗ does not reconcile"}
                      </span>
                    ) : null}
                    <p className="mt-1 text-gray-600" data-testid="extraction-reason">
                      {e.reason}
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
