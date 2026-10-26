import "server-only";
import { createHash } from "node:crypto";
import { firmConfig } from "@firm/config";
import { fillFirmText, serviceLabel } from "@/lib/config";
import { adminClient } from "@/lib/supabase/admin";
import { encryptSin, decryptSin, isValidSin, normalizeSin } from "@/lib/security/sin";
import { issueToken, revokeTokens } from "@/lib/security/tokens";
import { publicDocView } from "@/lib/uploads";
import {
  asksPrimarySin,
  asksSpouseSin,
  displayName,
  normalizePhone,
  sanitizeAnswers,
  STEPS,
  validateStep,
  type FieldErrors,
  type IntakeAnswers,
} from "./schema";

const DAY = 24 * 60 * 60 * 1000;

export interface IntakeRow {
  id: string;
  reference: string;
  status: string;
  applicant_type: string | null;
  current_step: number;
  answers: IntakeAnswers;
  sin_ciphertext: string | null;
  spouse_sin_ciphertext: string | null;
  primary_name: string | null;
  email: string | null;
  phone: string | null;
  business_name: string | null;
  services: string[];
  referral_source: string | null;
  referral_detail: string | null;
  comms_consent: boolean;
  kiosk: boolean;
  submitted_at: string | null;
  last_activity_at: string;
  abandon_reminders_sent: number;
  created_at: string;
  client_id: string | null;
}

export function resumeExpiry(from = new Date()): Date {
  return new Date(from.getTime() + firmConfig.security.resumeTokenDays * DAY);
}

export async function createDraft(opts: { kiosk: boolean }): Promise<{ intakeId: string; token: string }> {
  const { data, error } = await adminClient()
    .from("intakes")
    .insert({ status: "draft", kiosk: opts.kiosk })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Could not create draft: ${error?.message}`);
  const token = await issueToken({ purpose: "intake_resume", intakeId: data.id, expiresAt: resumeExpiry() });
  return { intakeId: data.id, token };
}

export async function getIntake(id: string): Promise<IntakeRow | null> {
  const { data } = await adminClient().from("intakes").select("*").eq("id", id).maybeSingle();
  return (data as IntakeRow) ?? null;
}

function last3(cipher: string | null): string | null {
  if (!cipher) return null;
  try {
    return decryptSin(cipher).slice(-3);
  } catch {
    return null;
  }
}

/** What the browser gets back when resuming. SINs are never echoed — only "on file, ends in 123". */
export async function draftView(intake: IntakeRow) {
  const { data: docs } = await adminClient()
    .from("documents")
    .select("id, doc_type, original_name, size_bytes, status, checklist_item_id")
    .eq("intake_id", intake.id)
    .eq("status", "uploaded")
    .order("created_at");
  return {
    reference: intake.reference,
    status: intake.status,
    currentStep: intake.current_step,
    answers: intake.answers ?? {},
    sin: { onFile: Boolean(intake.sin_ciphertext), last3: last3(intake.sin_ciphertext) },
    spouseSin: { onFile: Boolean(intake.spouse_sin_ciphertext), last3: last3(intake.spouse_sin_ciphertext) },
    documents: (docs ?? []).map(publicDocView),
  };
}

export interface SaveInput {
  step: number;
  answers: unknown;
  sin?: string | null;
  spouseSin?: string | null;
}

export async function saveDraft(intake: IntakeRow, input: SaveInput, tokenId: string): Promise<{ ok: true } | { ok: false; errors: FieldErrors }> {
  const answers = sanitizeAnswers(input.answers);
  const update: Record<string, unknown> = {
    answers,
    applicant_type: answers.applicantType ?? null,
    current_step: Math.min(Math.max(intake.current_step, Number(input.step) || 1), STEPS.length),
    primary_name: answers.primary?.fullLegalName?.trim() || null,
    email: answers.primary?.email?.trim().toLowerCase() || null,
    phone: normalizePhone(answers.primary?.mobile),
    business_name: answers.applicantType === "business" ? answers.business?.legalName?.trim() || null : null,
    services: (answers.services ?? []).filter((s) => firmConfig.intake.services.some((x) => x.key === s)),
    referral_source: answers.referral?.source ?? null,
    referral_detail: answers.referral?.detail?.trim() || null,
    last_activity_at: new Date().toISOString(),
  };

  const errors: FieldErrors = {};
  // SIN: "" clears it, a value replaces it, undefined leaves it alone.
  if (input.sin !== undefined) {
    if (!input.sin) update.sin_ciphertext = null;
    else if (!asksPrimarySin(answers, firmConfig.features)) update.sin_ciphertext = null;
    else if (!isValidSin(input.sin)) errors["primary.sin"] = "That SIN doesn't look right — please check the 9 digits";
    else update.sin_ciphertext = encryptSin(normalizeSin(input.sin));
  }
  if (input.spouseSin !== undefined) {
    if (!input.spouseSin) update.spouse_sin_ciphertext = null;
    else if (!asksSpouseSin(answers, firmConfig.features)) update.spouse_sin_ciphertext = null;
    else if (!isValidSin(input.spouseSin)) errors["spouse.sin"] = "That SIN doesn't look right — please check the 9 digits";
    else update.spouse_sin_ciphertext = encryptSin(normalizeSin(input.spouseSin));
  }
  // If the branch changed so SIN no longer applies, drop it.
  if (!asksPrimarySin(answers, firmConfig.features) && intake.sin_ciphertext) update.sin_ciphertext = null;
  if (!asksSpouseSin(answers, firmConfig.features) && intake.spouse_sin_ciphertext) update.spouse_sin_ciphertext = null;

  const db = adminClient();
  const { error } = await db.from("intakes").update(update).eq("id", intake.id).eq("status", "draft");
  if (error) throw new Error(`Could not save draft: ${error.message}`);
  // Sliding expiry: the link in this browser stays valid for 7 days after the last save.
  await db.from("access_tokens").update({ expires_at: resumeExpiry().toISOString() }).eq("id", tokenId);
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

export function consentText(key: string): { version: string; text: string; required: boolean } | null {
  const c = firmConfig.intake.consents.find((x) => x.key === key);
  return c ? { version: c.version, text: fillFirmText(c.text), required: c.required } : null;
}

export type SubmitResult =
  | { ok: true; reference: string }
  | { ok: false; step: string; errors: FieldErrors };

export async function submitIntake(
  intake: IntakeRow,
  consents: Record<string, boolean>,
  meta: { ip: string; userAgent: string },
): Promise<SubmitResult> {
  const answers = sanitizeAnswers(intake.answers);
  for (const step of ["type", "details", "services", "situation"] as const) {
    const errors = validateStep(step, answers, firmConfig.intake.services.map((s) => s.key));
    if (Object.keys(errors).length) return { ok: false, step, errors };
  }
  const consentErrors: FieldErrors = {};
  for (const c of firmConfig.intake.consents) {
    if (c.required && consents[c.key] !== true) consentErrors[`consents.${c.key}`] = "Please tick this box to continue";
  }
  if (Object.keys(consentErrors).length) return { ok: false, step: "consents", errors: consentErrors };

  const db = adminClient();
  const now = new Date().toISOString();
  const rows = firmConfig.intake.consents.map((c) => {
    const text = fillFirmText(c.text);
    return {
      intake_id: intake.id,
      consent_key: c.key,
      version: c.version,
      text_shown: text,
      text_sha256: createHash("sha256").update(text).digest("hex"),
      accepted: consents[c.key] === true,
      recorded_at: now,
      ip: meta.ip,
      user_agent: meta.userAgent,
    };
  });
  const { error: consentError } = await db.from("intake_consents").upsert(rows, { onConflict: "intake_id,consent_key" });
  if (consentError) throw new Error(`Could not store consents: ${consentError.message}`);

  const { data: updated, error } = await db
    .from("intakes")
    .update({
      status: "new",
      submitted_at: now,
      last_activity_at: now,
      current_step: STEPS.length,
      comms_consent: consents.communications === true,
    })
    .eq("id", intake.id)
    .eq("status", "draft")
    .select("reference")
    .maybeSingle();
  if (error) throw new Error(`Could not submit: ${error.message}`);
  if (!updated) return { ok: true, reference: intake.reference }; // already submitted (double tap)

  // Clean up abandoned half-uploads and retire the resume links.
  const { data: pending } = await db.from("documents").select("id, storage_path").eq("intake_id", intake.id).eq("status", "pending");
  if (pending?.length) {
    await db.storage.from("documents").remove(pending.map((p) => p.storage_path));
    await db.from("documents").delete().in("id", pending.map((p) => p.id));
  }
  await revokeTokens({ intakeId: intake.id, purpose: "intake_resume" });
  return { ok: true, reference: updated.reference };
}

/** Non-sensitive summary used in notifications: name + services only. */
export function notificationSummary(intake: Pick<IntakeRow, "answers" | "services">) {
  const answers = sanitizeAnswers(intake.answers);
  const name = displayName(answers);
  const services = (intake.services ?? []).map(serviceLabel).join(", ") || "Not specified";
  return { name, services };
}
