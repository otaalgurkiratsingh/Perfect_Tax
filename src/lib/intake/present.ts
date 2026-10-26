import "server-only";
import { firmConfig } from "@firm/config";
import { referralLabel, serviceLabel } from "@/lib/config";
import { maskSin } from "@/lib/security/sin";
import {
  ENTITY_TYPES,
  MARITAL_STATUSES,
  PROVINCES,
  RESIDENCY_STATUSES,
  formatPhone,
  normalizePhone,
  sanitizeAnswers,
  type Address,
} from "./schema";
import type { IntakeRow } from "./server";

export type Row = [label: string, value: string];
export interface Section {
  title: string;
  rows: Row[];
}

const pick = (list: readonly (readonly [string, string])[], v?: string) => (v ? (list.find((x) => x[0] === v)?.[1] ?? v) : "");
const yn = (v?: boolean) => (v === undefined ? "" : v ? "Yes" : "No");

export function addressText(a?: Address): string {
  if (!a?.street) return "";
  return [a.unit ? `${a.unit}-${a.street}` : a.street, a.city, a.province, a.postalCode?.toUpperCase()].filter(Boolean).join(", ");
}

export const STATUS_LABELS: Record<string, string> = {
  draft: "Unfinished",
  new: "New",
  in_review: "In Review",
  docs_missing: "Docs Missing",
  ready: "Ready",
  client_created: "Client Created",
};

export const APPLICANT_LABELS: Record<string, string> = { individual: "Individual", couple: "Couple", business: "Business" };

/**
 * Every answer as labelled sections for staff screens and the ZIP summary.
 * SINs appear masked only ("••• ••• 123").
 */
export function presentIntake(intake: IntakeRow): Section[] {
  const a = sanitizeAnswers(intake.answers);
  const p = a.primary ?? {};
  const s = a.spouse ?? {};
  const b = a.business ?? {};
  const sit = a.situation ?? {};
  const isBiz = a.applicantType === "business";
  const keep = (rows: Row[]) => rows.filter(([, v]) => v !== "" && v !== undefined);

  const sections: Section[] = [
    {
      title: "Applicant",
      rows: keep([
        ["Type", APPLICANT_LABELS[a.applicantType ?? ""] ?? ""],
        ["Business type", ENTITY_TYPES.find((e) => e[0] === a.businessEntity)?.[1] ?? ""],
        ["Reference", intake.reference],
        ["Submitted", intake.submitted_at ? new Date(intake.submitted_at).toLocaleString("en-CA", { timeZone: firmConfig.firm.timezone }) : "Not yet"],
        ["How they heard about us", referralLabel(a.referral?.source)],
        ["Referral details", a.referral?.detail ?? ""],
      ]),
    },
    {
      title: isBiz ? "Contact person" : "Main applicant",
      rows: keep([
        ["Name", p.fullLegalName ?? ""],
        ["Email", p.email ?? ""],
        ["Mobile", formatPhone(normalizePhone(p.mobile))],
        ["Role", p.role ?? ""],
        ["Date of birth", p.dateOfBirth ?? ""],
        ["Marital status", pick(MARITAL_STATUSES, p.maritalStatus)],
        ["Status in Canada", pick(RESIDENCY_STATUSES, p.residencyStatus)],
        ["Home address", addressText(p.address)],
        ["SIN", maskSin(intake.sin_ciphertext) ?? ""],
      ]),
    },
  ];
  if (a.applicantType === "couple") {
    sections.push({
      title: "Spouse / partner",
      rows: keep([
        ["Name", s.fullLegalName ?? ""],
        ["Date of birth", s.dateOfBirth ?? ""],
        ["Email", s.email ?? ""],
        ["Mobile", formatPhone(normalizePhone(s.mobile))],
        ["Status in Canada", pick(RESIDENCY_STATUSES, s.residencyStatus)],
        ["SIN", maskSin(intake.spouse_sin_ciphertext) ?? ""],
      ]),
    });
  }
  if (isBiz) {
    sections.push({
      title: "Business",
      rows: keep([
        ["Legal name", b.legalName ?? ""],
        ["Business Number", b.businessNumber ?? ""],
        ["Fiscal year-end (MM-DD)", b.fiscalYearEnd ?? ""],
        ["Incorporation date", b.incorporationDate ?? ""],
        ["Incorporated in", b.incorporationProvince === "FED" ? "Federal" : pick(PROVINCES, b.incorporationProvince)],
        ["Industry", b.industry === "Other" ? `Other: ${b.industryOther ?? ""}` : (b.industry ?? "")],
        ["Business address", b.addressDifferent ? addressText(b.address) : "Same as contact"],
      ]),
    });
  }
  sections.push({
    title: "Services requested",
    rows: keep([
      ["Services", (a.services ?? []).map(serviceLabel).join(", ")],
      ["Other (their words)", a.servicesOther ?? ""],
    ]),
  });
  sections.push({
    title: "Situation",
    rows: keep([
      ["Previous accountant", sit.hadPreviousAccountant ? `Yes${sit.previousAccountantName ? ` — ${sit.previousAccountantName}` : ""}` : yn(sit.hadPreviousAccountant)],
      ["Tax years not filed", sit.yearsUnfiled === undefined ? "" : String(sit.yearsUnfiled)],
      ["CRA letter received", sit.receivedCraLetter ? `Yes${sit.craLetterDetails ? ` — ${sit.craLetterDetails}` : ""}` : yn(sit.receivedCraLetter)],
      ["Urgent deadline", sit.urgentDeadline ? `Yes — ${sit.deadlineDate ?? ""}${sit.deadlineDetails ? ` (${sit.deadlineDetails})` : ""}` : yn(sit.urgentDeadline)],
    ]),
  });
  return sections;
}

export function sectionsToText(title: string, sections: Section[]): string {
  const lines = [title, "=".repeat(title.length), ""];
  for (const s of sections) {
    lines.push(s.title, "-".repeat(s.title.length));
    for (const [k, v] of s.rows) lines.push(`${k}: ${v}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Spreadsheet-safe CSV cell: quotes, and neutralizes formula injection (=, +, -, @). */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
