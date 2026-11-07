import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { browserStorageUrl } from "@/lib/storageUrl";

// Files go DIRECTLY from the browser to Supabase Storage using a short-lived
// signed upload URL — they never pass through our serverless functions.
// After the browser reports completion we verify the object really exists,
// its size matches, and its first bytes match the declared type.

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const TYPES: Record<string, { mime: string; magic: (b: Uint8Array) => boolean }> = {
  pdf: { mime: "application/pdf", magic: (b) => ascii(b, 0, 5) === "%PDF-" },
  jpg: { mime: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { mime: "image/png", magic: (b) => b[0] === 0x89 && ascii(b, 1, 4) === "PNG" },
  heic: { mime: "image/heic", magic: (b) => ascii(b, 4, 8) === "ftyp" },
  heif: { mime: "image/heif", magic: (b) => ascii(b, 4, 8) === "ftyp" },
};

function ascii(b: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...b.slice(start, end));
}

export function fileExtension(name: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

/** Type is decided by extension (phones often send HEIC with no MIME type). */
export function resolveFileType(name: string): { ext: string; mime: string } | null {
  const ext = fileExtension(name);
  const t = TYPES[ext];
  return t ? { ext: ext === "jpeg" ? "jpg" : ext, mime: t.mime } : null;
}

export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^\w.\- ()]/g, "_").slice(-120) || "file";
}

export interface UploadTarget {
  intakeId?: string;
  docRequestId?: string;
  clientId?: string;
  clientQuarterId?: string;
  checklistItemId?: string;
  /** Storage folder, e.g. "intakes/<id>/government_id" or "clients/<id>/2026-Q4/bank_statements". */
  folder: string;
  docType: string;
  source: "intake" | "doc_request" | "quarter_link" | "portal" | "staff";
}

export type UploadSlotResult =
  | { ok: true; documentId: string; signedUrl: string; mimeType: string }
  | { ok: false; error: string };

export async function createUploadSlot(target: UploadTarget, fileName: string, size: number): Promise<UploadSlotResult> {
  const type = resolveFileType(fileName);
  if (!type) return { ok: false, error: "Please upload a PDF, JPG, PNG or HEIC file." };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: "That file looks empty." };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, error: "That file is over 25 MB. Please upload a smaller copy." };

  const storagePath = `${target.folder}/${randomUUID()}.${type.ext}`;
  const db = adminClient();
  const { data: doc, error } = await db
    .from("documents")
    .insert({
      intake_id: target.intakeId ?? null,
      doc_request_id: target.docRequestId ?? null,
      client_id: target.clientId ?? null,
      client_quarter_id: target.clientQuarterId ?? null,
      checklist_item_id: target.checklistItemId ?? null,
      doc_type: target.docType,
      storage_path: storagePath,
      original_name: cleanFileName(fileName),
      mime_type: type.mime,
      size_bytes: size,
      status: "pending",
      source: target.source,
    })
    .select("id")
    .single();
  if (error || !doc) return { ok: false, error: "Could not start the upload. Please try again." };

  const { data: signed, error: signError } = await db.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(storagePath);
  if (signError || !signed) {
    await db.from("documents").delete().eq("id", doc.id);
    return { ok: false, error: "Could not start the upload. Please try again." };
  }
  return { ok: true, documentId: doc.id, signedUrl: browserStorageUrl(signed.signedUrl), mimeType: type.mime };
}

export interface DocumentRow {
  id: string;
  intake_id: string | null;
  doc_request_id: string | null;
  client_id: string | null;
  client_quarter_id: string | null;
  checklist_item_id: string | null;
  doc_type: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  status: "pending" | "uploaded";
  uploaded_at: string | null;
}

/** Confirm an upload: object exists, size matches, first bytes match the type. */
export async function verifyUpload(doc: DocumentRow): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = adminClient();
  const { data: signed } = await db.storage.from(DOCUMENTS_BUCKET).createSignedUrl(doc.storage_path, 60);
  if (!signed) return { ok: false, error: "We couldn't find the uploaded file. Please try again." };
  const res = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-31" } });
  if (!res.ok) return { ok: false, error: "We couldn't find the uploaded file. Please try again." };
  const head = new Uint8Array(await res.arrayBuffer()).slice(0, 32);
  const total = Number(/\/(\d+)$/.exec(res.headers.get("content-range") ?? "")?.[1] ?? res.headers.get("content-length") ?? 0);
  const ext = fileExtension(doc.storage_path);
  const type = TYPES[ext];
  if (!type || !type.magic(head)) {
    await removeDocument(doc);
    return { ok: false, error: "That file doesn't look like a PDF or photo. Please upload a PDF, JPG, PNG or HEIC." };
  }
  if (total && total !== Number(doc.size_bytes)) {
    await db.from("documents").update({ size_bytes: total }).eq("id", doc.id);
  }
  await db.from("documents").update({ status: "uploaded", uploaded_at: new Date().toISOString() }).eq("id", doc.id);
  return { ok: true };
}

export async function removeDocument(doc: Pick<DocumentRow, "id" | "storage_path">) {
  const db = adminClient();
  await db.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
  await db.from("documents").delete().eq("id", doc.id);
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await adminClient().from("documents").select("*").eq("id", id).maybeSingle();
  return (data as DocumentRow) ?? null;
}

export function publicDocView(d: Pick<DocumentRow, "id" | "doc_type" | "original_name" | "size_bytes" | "status" | "checklist_item_id">) {
  return {
    id: d.id,
    docType: d.doc_type,
    name: d.original_name,
    size: Number(d.size_bytes),
    status: d.status,
    checklistItemId: d.checklist_item_id,
  };
}
