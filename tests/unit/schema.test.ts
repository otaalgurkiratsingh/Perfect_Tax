import { describe, expect, it } from "vitest";
import { firmConfig } from "@firm/config";
import { asksPrimarySin, asksSpouseSin, documentSlotsFor, normalizePhone, sanitizeAnswers, validateStep, type IntakeAnswers } from "@/lib/intake/schema";

const keys = firmConfig.intake.services.map((s) => s.key);
const address = { street: "1 Main St", city: "Brampton", province: "ON", postalCode: "L6X 1A1" };
const person = {
  fullLegalName: "Test Person",
  dateOfBirth: "1985-04-02",
  email: "test@example.com",
  mobile: "416-555-0199",
  address,
  maritalStatus: "single",
  residencyStatus: "citizen",
};

describe("intake validation", () => {
  it("requires an applicant type, and a business type for businesses", () => {
    expect(validateStep("type", {}, keys)).toHaveProperty("applicantType");
    expect(validateStep("type", { applicantType: "business" }, keys)).toHaveProperty("businessEntity");
    expect(validateStep("type", { applicantType: "individual" }, keys)).toEqual({});
  });

  it("individual details pass with a full person record", () => {
    expect(validateStep("details", { applicantType: "individual", primary: person }, keys)).toEqual({});
  });

  it("flags bad postal codes, phones and emails in plain language", () => {
    const e = validateStep("details", { applicantType: "individual", primary: { ...person, email: "nope", mobile: "123", address: { ...address, postalCode: "12345" } } }, keys);
    expect(e["primary.email"]).toMatch(/valid email/);
    expect(e["primary.mobile"]).toMatch(/10-digit/);
    expect(e["primary.address.postalCode"]).toMatch(/postal code/);
  });

  it("couples need spouse details; individuals don't", () => {
    const e = validateStep("details", { applicantType: "couple", primary: person }, keys);
    expect(e["spouse.fullLegalName"]).toBeDefined();
    expect(validateStep("details", { applicantType: "individual", primary: person }, keys)["spouse.fullLegalName"]).toBeUndefined();
  });

  it("business branch asks BN/fiscal year-end/industry, never spouse", () => {
    const a: IntakeAnswers = { applicantType: "business", businessEntity: "corporation", primary: { fullLegalName: "Owner", email: "o@x.ca", mobile: "4165550100" }, business: {} };
    const e = validateStep("details", a, keys);
    expect(e["business.legalName"]).toBeDefined();
    expect(e["business.fiscalYearEnd"]).toBeDefined();
    expect(e["business.industry"]).toBeDefined();
    expect(e["business.incorporationDate"]).toBeDefined();
    expect(Object.keys(e).some((k) => k.startsWith("spouse"))).toBe(false);
    const ok = validateStep(
      "details",
      { ...a, business: { legalName: "X Inc", businessNumber: "123456789", fiscalYearEnd: "12-31", industry: "Retail store", incorporationDate: "2020-01-01", incorporationProvince: "ON" } },
      keys,
    );
    expect(ok).toEqual({});
    expect(validateStep("details", { ...a, business: { legalName: "X", businessNumber: "12345", fiscalYearEnd: "12-31", industry: "Retail store", incorporationDate: "2020-01-01", incorporationProvince: "ON" } }, keys)["business.businessNumber"]).toMatch(/9 digits/);
  });

  it("SIN is asked for individuals/couples/sole props only, per config", () => {
    const f = { collectSin: true, collectSpouseSin: true };
    expect(asksPrimarySin({ applicantType: "individual" }, f)).toBe(true);
    expect(asksPrimarySin({ applicantType: "business", businessEntity: "corporation" }, f)).toBe(false);
    expect(asksPrimarySin({ applicantType: "business", businessEntity: "sole_prop" }, f)).toBe(true);
    expect(asksSpouseSin({ applicantType: "couple" }, f)).toBe(true);
    expect(asksPrimarySin({ applicantType: "individual" }, { collectSin: false, collectSpouseSin: false })).toBe(false);
  });

  it("services need at least one, and 'other' needs words", () => {
    expect(validateStep("services", { services: [] }, keys)).toHaveProperty("services");
    expect(validateStep("services", { services: ["other"] }, keys)).toHaveProperty("servicesOther");
    expect(validateStep("services", { services: ["t1_personal"] }, keys)).toEqual({});
  });

  it("situation requires yes/no answers and a deadline date when urgent", () => {
    const e = validateStep("situation", { situation: { hadPreviousAccountant: false, receivedCraLetter: false, urgentDeadline: true, yearsUnfiled: 0 }, referral: { source: "google" } }, keys);
    expect(Object.keys(e)).toEqual(["situation.deadlineDate"]);
  });

  it("document slots branch by applicant type", () => {
    const biz = documentSlotsFor(firmConfig.intake.documentSlots, "business").map((d) => d.key);
    const ind = documentSlotsFor(firmConfig.intake.documentSlots, "individual").map((d) => d.key);
    expect(biz).toContain("incorporation_docs");
    expect(biz).not.toContain("tax_slips");
    expect(ind).toContain("tax_slips");
    expect(ind).not.toContain("incorporation_docs");
  });

  it("sanitizes drafts to the known shape", () => {
    const s = sanitizeAnswers({ applicantType: "hacker", primary: { fullLegalName: "A", evil: "<script>" }, sin: "130692544" });
    expect(s.applicantType).toBeUndefined();
    expect(JSON.stringify(s)).not.toContain("evil");
    expect(JSON.stringify(s)).not.toContain("130692544");
  });

  it("normalizes phone numbers to E.164", () => {
    expect(normalizePhone("(416) 555-0199")).toBe("+14165550199");
    expect(normalizePhone("1-647-555-0142")).toBe("+16475550142");
    expect(normalizePhone("555-0199")).toBeNull();
  });
});

describe("plain-language errors", () => {
  it("never shows technical messages for untouched fields", () => {
    const all = {
      ...validateStep("details", { applicantType: "couple" }, keys),
      ...validateStep("details", { applicantType: "business", businessEntity: "corporation" }, keys),
      ...validateStep("details", { applicantType: "business", businessEntity: "sole_prop" }, keys),
    };
    for (const [field, message] of Object.entries(all)) {
      expect(message, field).toMatch(/^Please /);
    }
    expect(all["primary.address.street"]).toBe("Please enter your street address");
  });
});
