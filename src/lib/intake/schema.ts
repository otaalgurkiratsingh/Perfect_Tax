// Intake answers: types, step order and validation. Shared by the browser
// (inline errors as the client types) and the server (authoritative checks).
// SINs are deliberately NOT part of IntakeAnswers — they travel separately and
// are encrypted on arrival.

import { z } from "zod";
import { firmConfig } from "@firm/config";
import type { ApplicantType, BusinessEntity } from "@/lib/config/types";

export const PROVINCES = [
  ["ON", "Ontario"],
  ["AB", "Alberta"],
  ["BC", "British Columbia"],
  ["MB", "Manitoba"],
  ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"],
  ["NS", "Nova Scotia"],
  ["NT", "Northwest Territories"],
  ["NU", "Nunavut"],
  ["PE", "Prince Edward Island"],
  ["QC", "Quebec"],
  ["SK", "Saskatchewan"],
  ["YT", "Yukon"],
] as const;

export const MARITAL_STATUSES = [
  ["single", "Single"],
  ["married", "Married"],
  ["common_law", "Common-law"],
  ["separated", "Separated"],
  ["divorced", "Divorced"],
  ["widowed", "Widowed"],
] as const;

export const RESIDENCY_STATUSES = [
  ["citizen", "Canadian citizen"],
  ["permanent_resident", "Permanent resident"],
  ["work_permit", "Work permit"],
  ["study_permit", "Study permit"],
  ["non_resident", "Non-resident / other"],
] as const;

export const ENTITY_TYPES: [BusinessEntity, string, string][] = [
  ["sole_prop", "Sole proprietor", "Just me, not incorporated"],
  ["partnership", "Partnership", "Two or more owners, not incorporated"],
  ["corporation", "Corporation", "Incorporated company (Inc., Ltd., Corp.)"],
];

export interface Address {
  street?: string;
  unit?: string;
  city?: string;
  province?: string;
  postalCode?: string;
}

export interface PersonInfo {
  fullLegalName?: string;
  dateOfBirth?: string;
  email?: string;
  mobile?: string;
  address?: Address;
  maritalStatus?: string;
  residencyStatus?: string;
  role?: string;
}

export interface BusinessInfo {
  legalName?: string;
  businessNumber?: string;
  fiscalYearEnd?: string;
  incorporationDate?: string;
  incorporationProvince?: string;
  industry?: string;
  industryOther?: string;
  addressDifferent?: boolean;
  address?: Address;
}

export interface SituationInfo {
  hadPreviousAccountant?: boolean;
  previousAccountantName?: string;
  yearsUnfiled?: number;
  receivedCraLetter?: boolean;
  craLetterDetails?: string;
  urgentDeadline?: boolean;
  deadlineDate?: string;
  deadlineDetails?: string;
}

export interface IntakeAnswers {
  applicantType?: ApplicantType;
  businessEntity?: BusinessEntity;
  primary?: PersonInfo;
  spouse?: PersonInfo;
  business?: BusinessInfo;
  services?: string[];
  servicesOther?: string;
  situation?: SituationInfo;
  referral?: { source?: string; detail?: string };
}

export const STEPS = [
  { key: "type", title: "Who are you?" },
  { key: "details", title: "Your details" },
  { key: "services", title: "What do you need?" },
  { key: "situation", title: "Your situation" },
  { key: "documents", title: "Documents" },
  { key: "consents", title: "Your consent" },
  { key: "review", title: "Review & send" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];
export type FieldErrors = Record<string, string>;

// ---------------------------------------------------------------------------
// Field-level rules
// ---------------------------------------------------------------------------
const POSTAL = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i;

export function normalizePhone(input: string | undefined): string | null {
  if (!input) return null;
  let d = input.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10 || /^[01]/.test(d)) return null;
  return `+1${d}`;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "").slice(-10);
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

export function normalizeBn(input: string | undefined): string {
  return (input ?? "").replace(/\D/g, "").slice(0, 9);
}

const nonEmpty = (label: string) => z.string().trim().min(1, `Please enter ${label}`).max(200);
const emailRule = z.string().trim().max(200).email("Please enter a valid email, like name@example.com");
const phoneRule = z
  .string()
  .trim()
  .refine((v) => normalizePhone(v) !== null, "Please enter a 10-digit phone number");

const pastDate = (label: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `Please enter ${label}`)
    .refine((v) => {
      const t = Date.parse(v);
      return !Number.isNaN(t) && t < Date.now() && t > Date.parse("1900-01-01");
    }, `Please check ${label}`);

const addressRule = z.object({
  street: nonEmpty("your street address"),
  unit: z.string().trim().max(40).optional(),
  city: nonEmpty("your city"),
  province: z.enum(PROVINCES.map((p) => p[0]) as [string, ...string[]], { message: "Please choose a province" }),
  postalCode: z.string().trim().regex(POSTAL, "Please enter a postal code like L7A 1C1"),
});

const personFull = z.object({
  fullLegalName: nonEmpty("your full legal name"),
  dateOfBirth: pastDate("your date of birth"),
  email: emailRule,
  mobile: phoneRule,
  address: addressRule,
  maritalStatus: z.enum(MARITAL_STATUSES.map((m) => m[0]) as [string, ...string[]], {
    message: "Please choose your marital status",
  }),
  residencyStatus: z.enum(RESIDENCY_STATUSES.map((m) => m[0]) as [string, ...string[]], {
    message: "Please choose your residency status",
  }),
});

const spouseRule = z.object({
  fullLegalName: nonEmpty("your spouse's full legal name"),
  dateOfBirth: pastDate("your spouse's date of birth"),
  email: z.union([z.literal(""), emailRule]).optional(),
  mobile: z.union([z.literal(""), phoneRule]).optional(),
  residencyStatus: z.enum(RESIDENCY_STATUSES.map((m) => m[0]) as [string, ...string[]], {
    message: "Please choose your spouse's residency status",
  }),
});

const businessContact = z.object({
  fullLegalName: nonEmpty("your full name"),
  email: emailRule,
  mobile: phoneRule,
  role: z.string().trim().max(100).optional(),
});

const soleProprietorPersonal = z.object({
  dateOfBirth: pastDate("your date of birth"),
  address: addressRule,
  residencyStatus: z.enum(RESIDENCY_STATUSES.map((m) => m[0]) as [string, ...string[]], {
    message: "Please choose your residency status",
  }),
});

const businessRule = z
  .object({
    legalName: nonEmpty("the legal business name"),
    businessNumber: z
      .string()
      .optional()
      .refine((v) => !v || normalizeBn(v).length === 9, "A Business Number has 9 digits — leave it blank if you don't have one yet"),
    fiscalYearEnd: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Please choose your fiscal year-end"),
    incorporationDate: z.string().optional(),
    incorporationProvince: z.string().optional(),
    industry: z.string().min(1, "Please choose an industry"),
    industryOther: z.string().max(100).optional(),
    addressDifferent: z.boolean().optional(),
    address: z.any().optional(),
  })
  .superRefine((b, ctx) => {
    if (b.industry === "Other" && !b.industryOther?.trim()) {
      ctx.addIssue({ code: "custom", path: ["industryOther"], message: "Please tell us your industry" });
    }
    if (b.addressDifferent) {
      const r = addressRule.safeParse(b.address ?? {});
      if (!r.success) {
        for (const issue of r.error.issues) {
          ctx.addIssue({ code: "custom", path: ["address", ...issue.path.map(String)], message: issue.message });
        }
      }
    }
  });

const corporationExtra = z.object({
  incorporationDate: pastDate("the incorporation date"),
  incorporationProvince: z.string().min(2, "Please choose the province or federal"),
});

function collect(errors: FieldErrors, prefix: string, result: { success: boolean; error?: z.ZodError }) {
  if (result.success || !result.error) return;
  for (const issue of result.error.issues) {
    const key = [prefix, ...issue.path.map(String)].filter(Boolean).join(".");
    if (!errors[key]) errors[key] = issue.message;
  }
}

/** Validate one step. Returns {} when the step is complete. */
export function validateStep(step: StepKey, a: IntakeAnswers): FieldErrors {
  const errors: FieldErrors = {};
  switch (step) {
    case "type": {
      if (!a.applicantType) errors.applicantType = "Please choose one";
      if (a.applicantType === "business" && !a.businessEntity) errors.businessEntity = "Please choose your business type";
      break;
    }
    case "details": {
      if (a.applicantType === "business") {
        collect(errors, "primary", businessContact.safeParse(a.primary ?? {}));
        if (a.businessEntity === "sole_prop") collect(errors, "primary", soleProprietorPersonal.safeParse(a.primary ?? {}));
        collect(errors, "business", businessRule.safeParse(a.business ?? {}));
        if (a.businessEntity === "corporation") collect(errors, "business", corporationExtra.safeParse(a.business ?? {}));
      } else {
        collect(errors, "primary", personFull.safeParse(a.primary ?? {}));
        if (a.applicantType === "couple") collect(errors, "spouse", spouseRule.safeParse(a.spouse ?? {}));
      }
      break;
    }
    case "services": {
      const valid = new Set<string>(firmConfig.intake.services.map((s) => s.key));
      const chosen = (a.services ?? []).filter((s) => valid.has(s));
      if (chosen.length === 0) errors.services = "Please choose at least one service";
      if (chosen.includes("other") && !a.servicesOther?.trim()) errors.servicesOther = "Please tell us what you need";
      break;
    }
    case "situation": {
      const s = a.situation ?? {};
      if (s.hadPreviousAccountant === undefined) errors["situation.hadPreviousAccountant"] = "Please answer yes or no";
      if (s.receivedCraLetter === undefined) errors["situation.receivedCraLetter"] = "Please answer yes or no";
      if (s.urgentDeadline === undefined) errors["situation.urgentDeadline"] = "Please answer yes or no";
      if (s.yearsUnfiled === undefined || s.yearsUnfiled === null || Number.isNaN(s.yearsUnfiled))
        errors["situation.yearsUnfiled"] = "Please enter a number (0 if you're up to date)";
      else if (s.yearsUnfiled < 0 || s.yearsUnfiled > 30) errors["situation.yearsUnfiled"] = "Please enter a number from 0 to 30";
      if (s.urgentDeadline && !s.deadlineDate) errors["situation.deadlineDate"] = "Please choose the deadline date";
      if (!a.referral?.source) errors["referral.source"] = "Please choose one";
      break;
    }
    default:
      break;
  }
  return errors;
}

export function documentSlotsFor(type: ApplicantType | undefined) {
  return firmConfig.intake.documentSlots.filter((d) => !type || (d.showFor as readonly string[]).includes(type));
}

/** Whether the SIN field is shown for the main applicant. */
export function asksPrimarySin(a: IntakeAnswers): boolean {
  if (!firmConfig.features.collectSin) return false;
  return a.applicantType !== "business" || a.businessEntity === "sole_prop";
}

export function asksSpouseSin(a: IntakeAnswers): boolean {
  return firmConfig.features.collectSin && firmConfig.features.collectSpouseSin && a.applicantType === "couple";
}

/** Strip anything outside the known shape so drafts can't store arbitrary blobs. */
export function sanitizeAnswers(input: unknown): IntakeAnswers {
  const a = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const address = (v: unknown): Address | undefined => {
    if (!v || typeof v !== "object") return undefined;
    const o = obj(v);
    return {
      street: str(o.street),
      unit: str(o.unit, 40),
      city: str(o.city, 100),
      province: str(o.province, 2),
      postalCode: str(o.postalCode, 7),
    };
  };
  const person = (v: unknown): PersonInfo | undefined => {
    if (!v || typeof v !== "object") return undefined;
    const o = obj(v);
    return {
      fullLegalName: str(o.fullLegalName),
      dateOfBirth: str(o.dateOfBirth, 10),
      email: str(o.email),
      mobile: str(o.mobile, 30),
      address: address(o.address),
      maritalStatus: str(o.maritalStatus, 30),
      residencyStatus: str(o.residencyStatus, 30),
      role: str(o.role, 100),
    };
  };
  const applicantType = (["individual", "couple", "business"] as const).find((t) => t === a.applicantType);
  const businessEntity = (["sole_prop", "partnership", "corporation"] as const).find((t) => t === a.businessEntity);
  const b = obj(a.business);
  const s = obj(a.situation);
  const r = obj(a.referral);
  const years = typeof s.yearsUnfiled === "number" ? Math.trunc(s.yearsUnfiled) : undefined;
  return {
    applicantType,
    businessEntity,
    primary: person(a.primary),
    spouse: person(a.spouse),
    business: a.business
      ? {
          legalName: str(b.legalName),
          businessNumber: str(b.businessNumber, 20),
          fiscalYearEnd: str(b.fiscalYearEnd, 5),
          incorporationDate: str(b.incorporationDate, 10),
          incorporationProvince: str(b.incorporationProvince, 10),
          industry: str(b.industry, 100),
          industryOther: str(b.industryOther, 100),
          addressDifferent: bool(b.addressDifferent),
          address: address(b.address),
        }
      : undefined,
    services: Array.isArray(a.services)
      ? a.services.filter((x): x is string => typeof x === "string").slice(0, 20)
      : undefined,
    servicesOther: str(a.servicesOther, 1000),
    situation: a.situation
      ? {
          hadPreviousAccountant: bool(s.hadPreviousAccountant),
          previousAccountantName: str(s.previousAccountantName),
          yearsUnfiled: years,
          receivedCraLetter: bool(s.receivedCraLetter),
          craLetterDetails: str(s.craLetterDetails, 1000),
          urgentDeadline: bool(s.urgentDeadline),
          deadlineDate: str(s.deadlineDate, 10),
          deadlineDetails: str(s.deadlineDetails, 1000),
        }
      : undefined,
    referral: a.referral ? { source: str(r.source, 30), detail: str(r.detail) } : undefined,
  };
}

/** Name shown to staff and used in notifications. */
export function displayName(a: IntakeAnswers): string {
  return a.primary?.fullLegalName?.trim() || "Unnamed applicant";
}

export function firstName(a: IntakeAnswers): string {
  return displayName(a).split(/\s+/)[0] ?? "there";
}
