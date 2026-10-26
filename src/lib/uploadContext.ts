import "server-only";
import { firmConfig } from "@firm/config";
import { audit } from "@/lib/audit";
import { completeDocRequestIfDone, getDocRequest } from "@/lib/docRequests";
import { documentSlotsFor } from "@/lib/intake/schema";
import { getIntake } from "@/lib/intake/server";
import { bearerToken, resolveToken, type TokenRecord } from "@/lib/security/tokens";
import type { DocumentRow, UploadTarget } from "@/lib/uploads";

// Every public upload is authorized by an access token sent as a Bearer header.
// The token decides WHERE a file may go; the browser only says which slot.

export interface UploadContext {
  token: TokenRecord;
  /** Build the storage target for a requested slot, or explain why not. */
  target(slot: { docType?: string; itemId?: string }): Promise<UploadTarget | { error: string }>;
  /** True if this token may touch an existing document. */
  owns(doc: DocumentRow): boolean;
  /** Whether files may still be removed. */
  canRemove(doc: DocumentRow): boolean;
  /** Called after a verified upload (status changes, audit, etc.). */
  afterUpload(doc: DocumentRow): Promise<void>;
}

export async function resolveUploadContext(request: Request): Promise<UploadContext | null> {
  const token = await resolveToken(bearerToken(request), ["intake_resume", "doc_request"]);
  if (!token) return null;
  if (token.purpose === "doc_request") return docRequestContext(token);
  return intakeContext(token);
}

async function docRequestContext(token: TokenRecord): Promise<UploadContext | null> {
  const request = token.doc_request_id ? await getDocRequest(token.doc_request_id) : null;
  if (!request || request.status !== "open") return null;
  return {
    token,
    async target({ docType }) {
      if (!docType || !request.items.includes(docType)) return { error: "We didn't ask for that document" };
      return {
        intakeId: request.intake_id,
        docRequestId: request.id,
        folder: `intakes/${request.intake_id}/${docType}`,
        docType,
        source: "doc_request",
      };
    },
    owns: (doc) => doc.doc_request_id === request.id,
    canRemove: () => true,
    async afterUpload(doc) {
      await audit({
        actorType: "client",
        action: "client_upload",
        targetType: "intake",
        targetId: request.intake_id,
        details: { docRequestId: request.id, docType: doc.doc_type, documentId: doc.id },
      });
      await completeDocRequestIfDone(request.id);
    },
  };
}

async function intakeContext(token: TokenRecord): Promise<UploadContext | null> {
  const intake = token.intake_id ? await getIntake(token.intake_id) : null;
  if (!intake || intake.status !== "draft") return null;
  return {
    token,
    async target({ docType }) {
      const slots = documentSlotsFor(firmConfig.intake.documentSlots, intake.answers?.applicantType);
      if (!docType || !slots.some((s) => s.key === docType)) return { error: "Unknown document type" };
      return { intakeId: intake.id, folder: `intakes/${intake.id}/${docType}`, docType, source: "intake" };
    },
    owns: (doc) => doc.intake_id === intake.id && !doc.client_quarter_id,
    canRemove: () => true,
    async afterUpload() {},
  };
}
