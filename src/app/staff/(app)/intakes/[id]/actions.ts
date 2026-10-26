"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { firmConfig } from "@firm/config";
import { createDocRequest } from "@/lib/docRequests";
import { getIntake } from "@/lib/intake/server";
import { decryptSin, formatSin } from "@/lib/security/sin";
import { revokeTokens } from "@/lib/security/tokens";
import { requireStaff, staffAudit } from "@/lib/staff/auth";
import { adminClient, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

const ID = /^[0-9a-f-]{36}$/i;
const MANUAL_STATUSES = ["new", "in_review", "docs_missing", "ready", "client_created"];

export async function changeStatus(intakeId: string, status: string): Promise<{ error?: string }> {
  const ctx = await requireStaff();
  if (!ID.test(intakeId) || !MANUAL_STATUSES.includes(status)) return { error: "Invalid status" };
  const intake = await getIntake(intakeId);
  if (!intake || intake.status === "draft") return { error: "Not found" };
  await adminClient().from("intakes").update({ status }).eq("id", intakeId);
  await staffAudit(ctx, { action: "change_status", targetType: "intake", targetId: intakeId, details: { from: intake.status, to: status } });
  refresh();
  return {};
}

/** Full SIN for 30 seconds on screen. Every reveal is audit-logged. */
export async function revealSin(intakeId: string, which: "primary" | "spouse"): Promise<{ sin?: string; error?: string }> {
  const ctx = await requireStaff();
  if (!firmConfig.features.allowSinReveal) return { error: "SIN reveal is turned off" };
  if (!ID.test(intakeId)) return { error: "Invalid" };
  const intake = await getIntake(intakeId);
  const cipher = which === "spouse" ? intake?.spouse_sin_ciphertext : intake?.sin_ciphertext;
  if (!intake || !cipher) return { error: "No SIN on file" };
  await staffAudit(ctx, { action: "reveal_sin", targetType: "intake", targetId: intakeId, details: { which } });
  return { sin: formatSin(decryptSin(cipher)) };
}

export async function requestDocuments(intakeId: string, items: string[], note: string): Promise<{ error?: string; sent?: boolean }> {
  const ctx = await requireStaff();
  if (!ID.test(intakeId) || !Array.isArray(items)) return { error: "Invalid request" };
  try {
    const { request, sent } = await createDocRequest({ intakeId, items, note: String(note ?? ""), staffId: ctx.profile.id });
    await staffAudit(ctx, { action: "request_documents", targetType: "intake", targetId: intakeId, details: { docRequestId: request.id, items: request.items } });
    refresh();
    return { sent };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not send the request" };
  }
}

export async function stopDocRequest(intakeId: string, requestId: string): Promise<{ error?: string }> {
  const ctx = await requireStaff();
  if (!ID.test(intakeId) || !ID.test(requestId)) return { error: "Invalid" };
  await adminClient().from("doc_requests").update({ status: "stopped" }).eq("id", requestId).eq("intake_id", intakeId).eq("status", "open");
  await revokeTokens({ docRequestId: requestId, purpose: "doc_request" });
  await staffAudit(ctx, { action: "stop_doc_request", targetType: "intake", targetId: intakeId, details: { docRequestId: requestId } });
  refresh();
  return {};
}

/** Permanent deletion (admin only) — intake, answers, consents and files. Used after a retention review. */
export async function deleteIntake(intakeId: string, confirmReference: string): Promise<{ error?: string }> {
  const ctx = await requireStaff({ admin: true });
  if (!ID.test(intakeId)) return { error: "Invalid" };
  const intake = await getIntake(intakeId);
  if (!intake) return { error: "Not found" };
  if (confirmReference.trim().toUpperCase() !== intake.reference) return { error: "Type the reference number exactly to confirm." };
  const db = adminClient();
  const { data: docs } = await db.from("documents").select("storage_path").eq("intake_id", intakeId);
  if (docs?.length) await db.storage.from(DOCUMENTS_BUCKET).remove(docs.map((d) => d.storage_path));
  await staffAudit(ctx, {
    action: "delete_intake",
    targetType: "intake",
    targetId: intakeId,
    details: { reference: intake.reference, files: docs?.length ?? 0, submittedAt: intake.submitted_at },
  });
  await db.from("intakes").delete().eq("id", intakeId);
  redirect("/staff?status=retention");
}

export async function convertToClient(intakeId: string): Promise<{ error?: string; clientId?: string }> {
  const ctx = await requireStaff();
  if (!ID.test(intakeId)) return { error: "Invalid" };
  const { createClientFromIntake } = await import("@/lib/clients/create");
  const r = await createClientFromIntake(intakeId);
  if ("error" in r) return r;
  await staffAudit(ctx, { action: "create_client", targetType: "client", targetId: r.clientId, details: { intakeId } });
  return { clientId: r.clientId };
}
