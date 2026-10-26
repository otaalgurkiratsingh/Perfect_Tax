"use client";

import type { PublicIntakeConfig } from "@/lib/config/public";
import {
  ENTITY_TYPES,
  MARITAL_STATUSES,
  PROVINCES,
  RESIDENCY_STATUSES,
  asksPrimarySin,
  asksSpouseSin,
  documentSlotsFor,
  formatPhone,
  normalizePhone,
  type Address,
  type FieldErrors,
  type IntakeAnswers,
} from "@/lib/intake/schema";
import { ChoiceCards, ConsentBox, SelectField, TextArea, TextField, TickCard, YesNo } from "@/components/ui";
import { FileSlot } from "@/components/public/FileSlot";
import type { UploadedFile } from "@/components/public/api";

export type SetField = (path: string, value: unknown) => void;

export interface SinState {
  onFile: boolean;
  last3: string | null;
}

export interface StepProps {
  cfg: PublicIntakeConfig;
  a: IntakeAnswers;
  set: SetField;
  errors: FieldErrors;
}

const MONTHS = [
  ["01", "January"],
  ["02", "February"],
  ["03", "March"],
  ["04", "April"],
  ["05", "May"],
  ["06", "June"],
  ["07", "July"],
  ["08", "August"],
  ["09", "September"],
  ["10", "October"],
  ["11", "November"],
  ["12", "December"],
] as const;
const DAYS = Array.from({ length: 31 }, (_, i) => {
  const d = String(i + 1).padStart(2, "0");
  return [d, String(i + 1)] as const;
});

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-2 border-b-2 border-gray-200 pb-1 text-xl font-bold">{children}</h3>;
}

// ---------------------------------------------------------------------------
// Step 1 — Who are you?
// ---------------------------------------------------------------------------
export function StepType({ a, set, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <ChoiceCards
        name="applicantType"
        legend="I'm filling this out for…"
        value={a.applicantType}
        onChange={(v) => set("applicantType", v)}
        error={errors.applicantType}
        options={[
          { value: "individual", label: "Just me", description: "Personal taxes for one person" },
          { value: "couple", label: "Me and my spouse/partner", description: "Married or common-law couple" },
          { value: "business", label: "My business", description: "Sole proprietor, partnership or corporation" },
        ]}
      />
      {a.applicantType === "business" ? (
        <ChoiceCards
          name="businessEntity"
          legend="What kind of business?"
          value={a.businessEntity}
          onChange={(v) => set("businessEntity", v)}
          error={errors.businessEntity}
          options={ENTITY_TYPES.map(([value, label, description]) => ({ value, label, description }))}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Details
// ---------------------------------------------------------------------------
function AddressFields({ prefix, a, set, errors }: { prefix: string; a: IntakeAnswers; set: SetField; errors: FieldErrors }) {
  const get = (k: string) => {
    const parts = `${prefix}.${k}`.split(".");
    let cur: unknown = a;
    for (const p of parts) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[p] : undefined;
    return typeof cur === "string" ? cur : "";
  };
  return (
    <div className="grid gap-4">
      <TextField id={`${prefix}.street`} label="Street address" autoComplete="street-address" value={get("street")} onChange={(v) => set(`${prefix}.street`, v)} error={errors[`${prefix}.street`]} />
      <TextField id={`${prefix}.unit`} label="Unit / apartment" optional value={get("unit")} onChange={(v) => set(`${prefix}.unit`, v)} error={errors[`${prefix}.unit`]} />
      <TextField id={`${prefix}.city`} label="City" autoComplete="address-level2" value={get("city")} onChange={(v) => set(`${prefix}.city`, v)} error={errors[`${prefix}.city`]} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField id={`${prefix}.province`} label="Province" value={get("province")} onChange={(v) => set(`${prefix}.province`, v)} options={PROVINCES} error={errors[`${prefix}.province`]} />
        <TextField
          id={`${prefix}.postalCode`}
          label="Postal code"
          autoComplete="postal-code"
          placeholder="L7A 1C1"
          maxLength={7}
          value={get("postalCode")}
          onChange={(v) => set(`${prefix}.postalCode`, v.toUpperCase())}
          error={errors[`${prefix}.postalCode`]}
        />
      </div>
    </div>
  );
}

function SinField({
  id,
  label,
  value,
  onChange,
  state,
  onChangeExisting,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  state: SinState;
  onChangeExisting: () => void;
  error?: string;
}) {
  if (state.onFile && !value) {
    return (
      <div className="rounded-xl border-2 border-green-600 bg-green-50 p-4">
        <p className="text-[17px] font-semibold">{label}</p>
        <p className="mt-1">
          Saved securely — ends in <span className="font-mono font-bold">{state.last3}</span>.{" "}
          <button type="button" className="font-semibold underline" onClick={onChangeExisting}>
            Change
          </button>
        </p>
      </div>
    );
  }
  return (
    <TextField
      id={id}
      label={label}
      optional
      hint="Encrypted and only seen by our team. You can also give it to us in person instead."
      inputMode="numeric"
      autoComplete="off"
      maxLength={11}
      placeholder="123 456 789"
      value={value}
      onChange={(v) => onChange(v.replace(/[^\d ]/g, ""))}
      error={error}
    />
  );
}

export interface DetailsProps extends StepProps {
  sinInput: string;
  setSinInput: (v: string) => void;
  spouseSinInput: string;
  setSpouseSinInput: (v: string) => void;
  sin: SinState;
  spouseSin: SinState;
  clearSin: (which: "primary" | "spouse") => void;
}

export function StepDetails(props: DetailsProps) {
  const { cfg, a, set, errors } = props;
  const p = a.primary ?? {};
  const isBusiness = a.applicantType === "business";
  const soleProp = isBusiness && a.businessEntity === "sole_prop";
  const showPrimarySin = asksPrimarySin(a, cfg.features);
  const showSpouseSin = asksSpouseSin(a, cfg.features);

  const personalBlock = (
    <>
      <TextField id="primary.dateOfBirth" label="Date of birth" type="date" autoComplete="bday" value={p.dateOfBirth} onChange={(v) => set("primary.dateOfBirth", v)} error={errors["primary.dateOfBirth"]} />
      {!isBusiness ? (
        <SelectField id="primary.maritalStatus" label="Marital status" value={p.maritalStatus} onChange={(v) => set("primary.maritalStatus", v)} options={MARITAL_STATUSES} error={errors["primary.maritalStatus"]} />
      ) : null}
      <SelectField id="primary.residencyStatus" label="Status in Canada" value={p.residencyStatus} onChange={(v) => set("primary.residencyStatus", v)} options={RESIDENCY_STATUSES} error={errors["primary.residencyStatus"]} />
      <SectionTitle>{isBusiness ? "Your home address" : "Home address"}</SectionTitle>
      <AddressFields prefix="primary.address" a={a} set={set} errors={errors} />
      {showPrimarySin ? (
        <SinField
          id="primary.sin"
          label="Social Insurance Number (SIN)"
          value={props.sinInput}
          onChange={props.setSinInput}
          state={props.sin}
          onChangeExisting={() => props.clearSin("primary")}
          error={errors["primary.sin"]}
        />
      ) : null}
    </>
  );

  return (
    <div className="grid gap-5">
      <SectionTitle>{isBusiness ? "Your contact details" : a.applicantType === "couple" ? "About you" : "About you"}</SectionTitle>
      <TextField id="primary.fullLegalName" label={isBusiness ? "Your full name" : "Full legal name"} hint={isBusiness ? undefined : "As it appears on your ID"} autoComplete="name" value={p.fullLegalName} onChange={(v) => set("primary.fullLegalName", v)} error={errors["primary.fullLegalName"]} />
      <TextField id="primary.email" label="Email" type="email" inputMode="email" autoComplete="email" value={p.email} onChange={(v) => set("primary.email", v.trim())} error={errors["primary.email"]} />
      <TextField
        id="primary.mobile"
        label="Mobile phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="416-555-0123"
        value={p.mobile}
        onChange={(v) => set("primary.mobile", v)}
        error={errors["primary.mobile"]}
      />
      {isBusiness ? (
        <TextField id="primary.role" label="Your role" optional placeholder="Owner, director…" value={p.role} onChange={(v) => set("primary.role", v)} />
      ) : null}
      {!isBusiness ? personalBlock : null}

      {a.applicantType === "couple" ? <SpouseFields {...props} showSin={showSpouseSin} /> : null}
      {isBusiness ? <BusinessFields {...props} /> : null}
      {soleProp ? (
        <>
          <SectionTitle>About you (the owner)</SectionTitle>
          <p className="-mt-3 text-[15px] text-gray-600">Sole proprietor income goes on your personal tax return, so we need these too.</p>
          {personalBlock}
        </>
      ) : null}
      <p className="rounded-xl bg-gray-100 p-4 text-[15px] text-gray-700">{cfg.reminderNotice}</p>
    </div>
  );
}

function SpouseFields(props: DetailsProps & { showSin: boolean }) {
  const { a, set, errors } = props;
  const s = a.spouse ?? {};
  return (
    <>
      <SectionTitle>About your spouse or partner</SectionTitle>
      <TextField id="spouse.fullLegalName" label="Spouse's full legal name" value={s.fullLegalName} onChange={(v) => set("spouse.fullLegalName", v)} error={errors["spouse.fullLegalName"]} />
      <TextField id="spouse.dateOfBirth" label="Spouse's date of birth" type="date" value={s.dateOfBirth} onChange={(v) => set("spouse.dateOfBirth", v)} error={errors["spouse.dateOfBirth"]} />
      <TextField id="spouse.email" label="Spouse's email" optional type="email" inputMode="email" value={s.email} onChange={(v) => set("spouse.email", v.trim())} error={errors["spouse.email"]} />
      <TextField id="spouse.mobile" label="Spouse's mobile phone" optional type="tel" inputMode="tel" value={s.mobile} onChange={(v) => set("spouse.mobile", v)} error={errors["spouse.mobile"]} />
      <SelectField id="spouse.residencyStatus" label="Spouse's status in Canada" value={s.residencyStatus} onChange={(v) => set("spouse.residencyStatus", v)} options={RESIDENCY_STATUSES} error={errors["spouse.residencyStatus"]} />
      {props.showSin ? (
        <SinField
          id="spouse.sin"
          label="Spouse's SIN"
          value={props.spouseSinInput}
          onChange={props.setSpouseSinInput}
          state={props.spouseSin}
          onChangeExisting={() => props.clearSin("spouse")}
          error={errors["spouse.sin"]}
        />
      ) : null}
    </>
  );
}

function BusinessFields({ cfg, a, set, errors }: DetailsProps) {
  const b = a.business ?? {};
  const [month, day] = (b.fiscalYearEnd ?? "-").split("-");
  const setFye = (m: string | undefined, d: string | undefined) => set("business.fiscalYearEnd", m && d ? `${m}-${d}` : m ? `${m}-` : "");
  const corp = a.businessEntity === "corporation";
  return (
    <>
      <SectionTitle>About the business</SectionTitle>
      <TextField id="business.legalName" label="Legal business name" value={b.legalName} onChange={(v) => set("business.legalName", v)} error={errors["business.legalName"]} />
      <TextField
        id="business.businessNumber"
        label="Business Number (BN)"
        optional
        hint="The 9-digit number from CRA. Leave blank if you don't have one yet."
        inputMode="numeric"
        maxLength={15}
        placeholder="123456789"
        value={b.businessNumber}
        onChange={(v) => set("business.businessNumber", v.replace(/[^\d ]/g, ""))}
        error={errors["business.businessNumber"]}
      />
      <fieldset>
        <legend className="text-[17px] font-semibold">Fiscal year-end</legend>
        <p className="text-[15px] text-gray-600">The last day of your business year (often December 31).</p>
        <div className="grid grid-cols-2 gap-3">
          <SelectField id="business.fiscalYearEnd.month" label="Month" value={month || ""} onChange={(v) => setFye(v, day || undefined)} options={MONTHS} />
          <SelectField id="business.fiscalYearEnd.day" label="Day" value={day || ""} onChange={(v) => setFye(month || undefined, v)} options={DAYS} />
        </div>
        {errors["business.fiscalYearEnd"] ? (
          <p role="alert" className="mt-1 text-[15px] font-medium text-red-700">
            {errors["business.fiscalYearEnd"]}
          </p>
        ) : null}
      </fieldset>
      {corp ? (
        <>
          <TextField id="business.incorporationDate" label="Date of incorporation" type="date" value={b.incorporationDate} onChange={(v) => set("business.incorporationDate", v)} error={errors["business.incorporationDate"]} />
          <SelectField
            id="business.incorporationProvince"
            label="Incorporated in"
            value={b.incorporationProvince}
            onChange={(v) => set("business.incorporationProvince", v)}
            options={[["FED", "Federal (Canada)"], ...PROVINCES]}
            error={errors["business.incorporationProvince"]}
          />
        </>
      ) : null}
      <SelectField
        id="business.industry"
        label="Industry"
        value={b.industry}
        onChange={(v) => set("business.industry", v)}
        options={cfg.industries.map((i) => [i, i] as const)}
        error={errors["business.industry"]}
      />
      {b.industry === "Other" ? (
        <TextField id="business.industryOther" label="What industry?" value={b.industryOther} onChange={(v) => set("business.industryOther", v)} error={errors["business.industryOther"]} />
      ) : null}
      <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 border-gray-300 bg-white px-4">
        <input type="checkbox" className="h-6 w-6" checked={b.addressDifferent === true} onChange={(e) => set("business.addressDifferent", e.target.checked)} />
        <span className="text-lg">The business has a different address</span>
      </label>
      {b.addressDifferent ? <AddressFields prefix="business.address" a={a} set={set} errors={errors} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Services
// ---------------------------------------------------------------------------
export function StepServices({ cfg, a, set, errors }: StepProps) {
  const chosen = new Set(a.services ?? []);
  const toggle = (key: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(key);
    else next.delete(key);
    set("services", cfg.services.map((s) => s.key).filter((k) => next.has(k)));
  };
  return (
    <div className="space-y-3">
      <p className="text-gray-700">Tick everything you&apos;d like help with. Not sure? Tick what&apos;s closest — we&apos;ll talk it through.</p>
      {errors.services ? (
        <p role="alert" className="font-medium text-red-700">
          {errors.services}
        </p>
      ) : null}
      {cfg.services.map((s) => (
        <TickCard key={s.key} id={`service-${s.key}`} checked={chosen.has(s.key)} onChange={(on) => toggle(s.key, on)} label={s.label} description={s.description} />
      ))}
      {chosen.has("other") ? (
        <TextArea id="servicesOther" label="Tell us what you need" value={a.servicesOther} onChange={(v) => set("servicesOther", v)} error={errors.servicesOther} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Situation
// ---------------------------------------------------------------------------
export function StepSituation({ cfg, a, set, errors }: StepProps) {
  const s = a.situation ?? {};
  const source = cfg.referralSources.find((r) => r.key === a.referral?.source);
  return (
    <div className="grid gap-6">
      <YesNo name="situation.hadPreviousAccountant" legend="Have you had an accountant before?" value={s.hadPreviousAccountant} onChange={(v) => set("situation.hadPreviousAccountant", v)} error={errors["situation.hadPreviousAccountant"]} />
      {s.hadPreviousAccountant ? (
        <TextField id="situation.previousAccountantName" label="Who was it?" optional value={s.previousAccountantName} onChange={(v) => set("situation.previousAccountantName", v)} />
      ) : null}
      <TextField
        id="situation.yearsUnfiled"
        label="How many years of tax returns are not filed?"
        hint="Enter 0 if you're up to date."
        inputMode="numeric"
        maxLength={2}
        value={s.yearsUnfiled === undefined ? "" : String(s.yearsUnfiled)}
        onChange={(v) => set("situation.yearsUnfiled", v === "" ? undefined : Number(v.replace(/\D/g, "")))}
        error={errors["situation.yearsUnfiled"]}
      />
      <YesNo name="situation.receivedCraLetter" legend="Have you received a letter from CRA?" value={s.receivedCraLetter} onChange={(v) => set("situation.receivedCraLetter", v)} error={errors["situation.receivedCraLetter"]} />
      {s.receivedCraLetter ? (
        <TextArea id="situation.craLetterDetails" label="What was it about?" optional hint="You can upload the letter on the next screen." value={s.craLetterDetails} onChange={(v) => set("situation.craLetterDetails", v)} />
      ) : null}
      <YesNo name="situation.urgentDeadline" legend="Do you have an urgent deadline?" value={s.urgentDeadline} onChange={(v) => set("situation.urgentDeadline", v)} error={errors["situation.urgentDeadline"]} />
      {s.urgentDeadline ? (
        <>
          <TextField id="situation.deadlineDate" label="Deadline date" type="date" value={s.deadlineDate} onChange={(v) => set("situation.deadlineDate", v)} error={errors["situation.deadlineDate"]} />
          <TextField id="situation.deadlineDetails" label="What is due?" optional value={s.deadlineDetails} onChange={(v) => set("situation.deadlineDetails", v)} />
        </>
      ) : null}
      <SelectField
        id="referral.source"
        label="How did you hear about us?"
        value={a.referral?.source}
        onChange={(v) => set("referral.source", v)}
        options={cfg.referralSources.map((r) => [r.key, r.label] as const)}
        error={errors["referral.source"]}
      />
      {source?.detailLabel ? (
        <TextField id="referral.detail" label={source.detailLabel} value={a.referral?.detail} onChange={(v) => set("referral.detail", v)} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Documents
// ---------------------------------------------------------------------------
export function StepDocuments({
  cfg,
  a,
  token,
  docs,
  setDocs,
}: {
  cfg: PublicIntakeConfig;
  a: IntakeAnswers;
  token: string;
  docs: UploadedFile[];
  setDocs: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
}) {
  const slots = documentSlotsFor(cfg.documentSlots, a.applicantType);
  return (
    <div className="space-y-4">
      <p className="text-gray-700">
        Add what you have now — photos from your phone are fine. Nothing here is required; we&apos;ll ask for anything missing later.
      </p>
      {slots.map((slot) => (
        <FileSlot
          key={slot.key}
          testId={`slot-${slot.key}`}
          token={token}
          slot={{ docType: slot.key }}
          label={slot.label}
          why={slot.why}
          files={docs.filter((d) => d.docType === slot.key)}
          onAdded={(f) => setDocs((d) => [...d, f])}
          onRemoved={(id) => setDocs((d) => d.filter((x) => x.id !== id))}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — Consents
// ---------------------------------------------------------------------------
export function StepConsents({
  cfg,
  consents,
  setConsent,
  errors,
}: {
  cfg: PublicIntakeConfig;
  consents: Record<string, boolean>;
  setConsent: (key: string, v: boolean) => void;
  errors: FieldErrors;
}) {
  return (
    <div className="space-y-4">
      <p className="text-gray-700">Please read and tick each box. Each one is separate.</p>
      {cfg.consents.map((c) => (
        <ConsentBox
          key={c.key}
          id={`consent-${c.key}`}
          checked={consents[c.key] === true}
          onChange={(v) => setConsent(c.key, v)}
          label={c.label}
          text={c.text}
          required={c.required}
          error={errors[`consents.${c.key}`]}
        />
      ))}
      {cfg.privacyPolicyUrl ? (
        <p className="text-[15px]">
          <a className="underline" href={cfg.privacyPolicyUrl} target="_blank" rel="noreferrer">
            Read our full privacy policy
          </a>
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------
function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="grid grid-cols-[40%_60%] gap-2 border-b border-gray-100 py-2 text-[15px]">
      <dt className="text-gray-600">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}

function Section({ title, step, goTo, children }: { title: string; step: number; goTo: (s: number) => void; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-bold">{title}</h3>
        <button type="button" className="min-h-11 px-2 font-semibold underline" onClick={() => goTo(step)}>
          Edit
        </button>
      </div>
      <dl>{children}</dl>
    </section>
  );
}

function lookup(list: readonly (readonly [string, string])[], v?: string) {
  return list.find((x) => x[0] === v)?.[1] ?? v;
}

function addressText(ad?: Address) {
  if (!ad) return undefined;
  return [ad.unit ? `${ad.unit}-${ad.street}` : ad.street, ad.city, ad.province, ad.postalCode].filter(Boolean).join(", ");
}

export function StepReview({
  cfg,
  a,
  docs,
  sin,
  spouseSin,
  goTo,
}: {
  cfg: PublicIntakeConfig;
  a: IntakeAnswers;
  docs: UploadedFile[];
  sin: SinState;
  spouseSin: SinState;
  goTo: (step: number) => void;
}) {
  const p = a.primary ?? {};
  const s = a.spouse ?? {};
  const b = a.business ?? {};
  const sit = a.situation ?? {};
  const yn = (v?: boolean) => (v === undefined ? undefined : v ? "Yes" : "No");
  const typeLabel = { individual: "Just me", couple: "Me and my spouse/partner", business: "My business" }[a.applicantType ?? "individual"];
  return (
    <div className="space-y-4">
      <p className="text-gray-700">Please check everything below. Tap “Edit” to change anything.</p>
      <Section title="Who you are" step={0} goTo={goTo}>
        <Row label="Filling out for" value={typeLabel} />
        <Row label="Business type" value={ENTITY_TYPES.find((e) => e[0] === a.businessEntity)?.[1]} />
      </Section>
      <Section title="Your details" step={1} goTo={goTo}>
        <Row label="Name" value={p.fullLegalName} />
        <Row label="Email" value={p.email} />
        <Row label="Mobile" value={formatPhone(normalizePhone(p.mobile))} />
        <Row label="Role" value={p.role} />
        <Row label="Date of birth" value={p.dateOfBirth} />
        <Row label="Marital status" value={lookup(MARITAL_STATUSES, p.maritalStatus)} />
        <Row label="Status in Canada" value={lookup(RESIDENCY_STATUSES, p.residencyStatus)} />
        <Row label="Address" value={addressText(p.address)} />
        <Row label="SIN" value={sin.onFile ? `On file (ends in ${sin.last3})` : undefined} />
        {a.applicantType === "couple" ? (
          <>
            <Row label="Spouse" value={s.fullLegalName} />
            <Row label="Spouse date of birth" value={s.dateOfBirth} />
            <Row label="Spouse email" value={s.email} />
            <Row label="Spouse mobile" value={formatPhone(normalizePhone(s.mobile))} />
            <Row label="Spouse status" value={lookup(RESIDENCY_STATUSES, s.residencyStatus)} />
            <Row label="Spouse SIN" value={spouseSin.onFile ? `On file (ends in ${spouseSin.last3})` : undefined} />
          </>
        ) : null}
        {a.applicantType === "business" ? (
          <>
            <Row label="Business name" value={b.legalName} />
            <Row label="Business Number" value={b.businessNumber} />
            <Row label="Fiscal year-end" value={b.fiscalYearEnd} />
            <Row label="Incorporated" value={b.incorporationDate ? `${b.incorporationDate} (${b.incorporationProvince})` : undefined} />
            <Row label="Industry" value={b.industry === "Other" ? b.industryOther : b.industry} />
            <Row label="Business address" value={b.addressDifferent ? addressText(b.address) : "Same as above"} />
          </>
        ) : null}
      </Section>
      <Section title="Services" step={2} goTo={goTo}>
        <Row label="You need" value={(a.services ?? []).map((k) => cfg.services.find((s) => s.key === k)?.label ?? k).join(", ")} />
        <Row label="Other" value={a.servicesOther} />
      </Section>
      <Section title="Your situation" step={3} goTo={goTo}>
        <Row label="Previous accountant" value={yn(sit.hadPreviousAccountant)} />
        <Row label="Years not filed" value={sit.yearsUnfiled} />
        <Row label="CRA letter" value={yn(sit.receivedCraLetter)} />
        <Row label="Urgent deadline" value={sit.urgentDeadline ? `Yes — ${sit.deadlineDate ?? ""}` : yn(sit.urgentDeadline)} />
        <Row label="Heard about us" value={cfg.referralSources.find((r) => r.key === a.referral?.source)?.label} />
        <Row label="Details" value={a.referral?.detail} />
      </Section>
      <Section title="Documents" step={4} goTo={goTo}>
        <Row label="Files added" value={docs.length ? `${docs.length} file${docs.length === 1 ? "" : "s"}` : "None yet"} />
      </Section>
    </div>
  );
}
