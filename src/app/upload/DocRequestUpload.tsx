"use client";

import { useEffect, useState } from "react";
import { FileSlot } from "@/components/public/FileSlot";
import { ApiError, api, takeFragmentToken, type UploadedFile } from "@/components/public/api";

interface RequestView {
  firstName: string;
  status: string;
  note: string | null;
  items: { key: string; label: string; why: string }[];
  missing: string[];
  documents: UploadedFile[];
}

const KEY = "doc_request_token";

/** Upload-only page for a staff "request missing documents" link. Shows only the requested items. */
export function DocRequestUpload({ firmPhone }: { firmPhone: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<RequestView | null>(null);
  const [docs, setDocs] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
    const fromLink = takeFragmentToken("t");
    let t = fromLink;
    try {
      if (fromLink) sessionStorage.setItem(KEY, fromLink);
      t = t ?? sessionStorage.getItem(KEY);
    } catch {
      // storage unavailable — fragment token still works for this visit
    }
    if (!t) {
      setError("This link is missing its code. Please open the link from your message again.");
      return;
    }
    setToken(t);
    try {
      const v = await api<RequestView>("/api/doc-request", t);
      setView(v);
      setDocs(v.documents);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "We couldn't load this page.");
    }
    })();
  }, []);

  if (error) {
    return (
      <div className="space-y-3 py-6">
        <h1 className="text-2xl font-bold">This link isn&apos;t working</h1>
        <p className="text-lg">{error}</p>
        <p className="text-lg">
          Please call us at{" "}
          <a className="font-semibold underline" href={`tel:${firmPhone.replace(/\D/g, "")}`}>
            {firmPhone}
          </a>{" "}
          and we&apos;ll send a new one.
        </p>
      </div>
    );
  }
  if (!view || !token) return <p className="py-16 text-center text-lg text-gray-600">Loading…</p>;

  const remaining = view.items.filter((i) => !docs.some((d) => d.docType === i.key));
  const done = remaining.length === 0 || view.status === "complete";
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold">Hi {view.firstName}, please upload {view.items.length === 1 ? "this document" : "these documents"}</h1>
      <p className="text-lg text-gray-700">Only the items below are needed. Photos from your phone are fine.</p>
      {view.note ? <p className="rounded-xl bg-highlight/50 p-4 text-lg">Note from our team: {view.note}</p> : null}
      {done ? (
        <div className="rounded-2xl bg-green-700 p-5 text-white" data-testid="upload-complete">
          <p className="text-2xl font-bold">✓ Thank you — we have everything we asked for.</p>
          <p className="mt-1 text-lg">Our team has been notified. You can close this page.</p>
        </div>
      ) : (
        <p className="font-semibold">
          {remaining.length} of {view.items.length} still needed
        </p>
      )}
      {view.items.map((item) => (
        <FileSlot
          key={item.key}
          testId={`slot-${item.key}`}
          token={token}
          slot={{ docType: item.key }}
          label={item.label}
          why={item.why}
          files={docs.filter((d) => d.docType === item.key)}
          allowRemove={!done}
          readOnly={done}
          onAdded={(f) => setDocs((d) => [...d, f])}
          onRemoved={(id) => setDocs((d) => d.filter((x) => x.id !== id))}
        />
      ))}
    </div>
  );
}
