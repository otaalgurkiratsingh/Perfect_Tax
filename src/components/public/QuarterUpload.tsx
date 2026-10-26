"use client";

import { useEffect, useState } from "react";
import { FileSlot } from "./FileSlot";
import { ApiError, api, takeFragmentToken, type UploadedFile } from "./api";

interface Item {
  id: string;
  label: string;
  instructions: string;
  required: boolean;
  status: "missing" | "received" | "not_applicable";
  clientNote: string | null;
}

export interface QuarterView {
  clientQuarterId: string;
  businessName: string;
  contactName: string;
  quarterLabel: string;
  periodLabel: string;
  status: string;
  items: Item[];
  documents: UploadedFile[];
}

const KEY = "quarter_token";

/**
 * The client's checklist for one quarter with an upload slot per item. Used by
 * the personal link (/q#t=...) and inside the signed-in client page (token prop).
 */
export function QuarterUpload({ firmPhone, token: givenToken, initial }: { firmPhone: string; token?: string; initial?: QuarterView }) {
  const [token, setToken] = useState<string | null>(givenToken ?? null);
  const [view, setView] = useState<QuarterView | null>(initial ?? null);
  const [docs, setDocs] = useState<UploadedFile[]>(initial?.documents ?? []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (givenToken) return;
    void (async () => {
      let t = takeFragmentToken("t");
      try {
        if (t) sessionStorage.setItem(KEY, t);
        t = t ?? sessionStorage.getItem(KEY);
      } catch {
        // storage blocked; fragment token still works for this visit
      }
      if (!t) {
        setError("This link is missing its code. Please open the link from your message again.");
        return;
      }
      setToken(t);
      try {
        const v = await api<QuarterView>("/api/quarter-link", t);
        setView(v);
        setDocs(v.documents);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "We couldn't load this page.");
      }
    })();
  }, [givenToken]);

  async function refresh() {
    if (!token) return;
    try {
      const v = await api<QuarterView>("/api/quarter-link", token);
      setView(v);
      setDocs(v.documents);
    } catch {
      // keep what we have
    }
  }

  async function setNotApplicable(itemId: string, notApplicable: boolean) {
    if (!token) return;
    try {
      const v = await api<QuarterView>("/api/quarter-link/item", token, { method: "POST", body: { itemId, notApplicable } });
      setView(v);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Could not save. Please try again.");
    }
  }

  if (error) {
    return (
      <div className="space-y-3 py-6">
        <h1 className="text-2xl font-bold">This link isn&apos;t working</h1>
        <p className="text-lg">{error}</p>
        <p className="text-lg">
          Please call us at{" "}
          <a className="font-semibold underline" href={`tel:${firmPhone.replace(/\D/g, "")}`}>
            {firmPhone}
          </a>
          .
        </p>
      </div>
    );
  }
  if (!view || !token) return <p className="py-16 text-center text-lg text-gray-600">Loading…</p>;

  const required = view.items.filter((i) => i.required);
  const done = required.filter((i) => i.status !== "missing").length;
  const complete = view.status === "complete" || view.status === "processed" || (required.length > 0 && done === required.length);
  const locked = view.status === "processed";

  return (
    <div className="space-y-5" data-testid="quarter-upload">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">{view.businessName}</p>
        <h1 className="text-3xl font-bold">
          {view.periodLabel} documents
        </h1>
        <p className="mt-1 text-lg text-gray-700">
          Hi {view.contactName} — upload each item below. No need to email anything.
        </p>
      </div>
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-lg font-semibold">
          <span data-testid="quarter-progress">
            {done} of {required.length} done
          </span>
          <span className="text-gray-500">{view.quarterLabel}</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${required.length ? (done / required.length) * 100 : 0}%` }} />
        </div>
      </div>
      {complete ? (
        <div className="rounded-2xl bg-green-700 p-5 text-white" data-testid="quarter-complete">
          <p className="text-2xl font-bold">✓ All done for {view.periodLabel}. Thank you!</p>
          <p className="mt-1 text-lg">We won&apos;t send you any more reminders for this quarter. You can still add files if you find more.</p>
        </div>
      ) : null}
      {view.items.map((item) => {
        const files = docs.filter((d) => d.checklistItemId === item.id);
        return (
          <div key={item.id} className="space-y-2" data-testid={`item-${item.label}`}>
            {item.status === "not_applicable" ? (
              <div className="rounded-2xl border-2 border-gray-300 bg-white p-4">
                <p className="text-lg font-semibold">{item.label}</p>
                <p className="text-gray-600">You told us there&apos;s nothing to send for this one.</p>
                {!locked ? (
                  <button type="button" className="mt-2 font-semibold underline" onClick={() => void setNotApplicable(item.id, false)}>
                    Undo
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <FileSlot
                  token={token}
                  slot={{ itemId: item.id }}
                  label={item.label}
                  why={item.instructions}
                  files={files}
                  readOnly={locked}
                  allowRemove={!locked}
                  onAdded={(f) => {
                    setDocs((d) => [...d, f]);
                    void refresh();
                  }}
                  onRemoved={(id) => {
                    setDocs((d) => d.filter((x) => x.id !== id));
                    void refresh();
                  }}
                />
                {files.length === 0 && !locked ? (
                  <button type="button" className="px-1 text-[15px] font-semibold text-gray-700 underline" onClick={() => void setNotApplicable(item.id, true)}>
                    Nothing to send for this one this quarter
                  </button>
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
