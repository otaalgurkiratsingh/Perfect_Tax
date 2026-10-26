"use client";

// Browser helpers for the public (no-account) pages. The private link token
// arrives in the URL fragment (#t=...) — fragments are never sent to servers or
// leaked via Referer — and is then sent only as a Bearer header.

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, token: string | null, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(data.error ?? "Something went wrong. Please try again."), res.status, data);
  return data as T;
}

/** Take a token from the URL fragment (and remove it from the address bar). */
export function takeFragmentToken(param: string): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = params.get(param);
  if (token) history.replaceState(null, "", window.location.pathname + window.location.search);
  return token;
}

export function storageFor(kiosk: boolean): Storage | null {
  try {
    return kiosk ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export interface UploadedFile {
  id: string;
  docType: string;
  name: string;
  size: number;
  status: string;
  checklistItemId?: string | null;
}

/** Sign → PUT straight to Supabase Storage (with progress) → confirm. */
export async function uploadFile(
  token: string,
  slot: { docType?: string; itemId?: string },
  file: File,
  onProgress: (fraction: number) => void,
): Promise<UploadedFile> {
  const signed = await api<{ documentId: string; signedUrl: string; mimeType: string }>("/api/uploads/sign", token, {
    method: "POST",
    body: { ...slot, fileName: file.name, size: file.size },
  });
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob([file], { type: signed.mimeType }), file.name);
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signed.signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anon) xhr.setRequestHeader("apikey", anon);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError("Upload failed. Please try again.", xhr.status)));
    xhr.onerror = () => reject(new ApiError("Upload failed — please check your connection and try again.", 0));
    xhr.send(form);
  });
  const done = await api<{ document: UploadedFile }>("/api/uploads/complete", token, {
    method: "POST",
    body: { documentId: signed.documentId },
  });
  return done.document;
}

export async function removeFile(token: string, documentId: string): Promise<void> {
  await api("/api/uploads/remove", token, { method: "POST", body: { documentId } });
}
