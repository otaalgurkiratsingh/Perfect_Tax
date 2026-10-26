// Shape of firm.config.ts. Everything firm-specific (name, branding, contact
// details, wording, message templates, checklists) lives in that one file so
// the system can be resold to another firm by editing a single file.

export type ApplicantType = "individual" | "couple" | "business";
export type BusinessEntity = "sole_prop" | "partnership" | "corporation";
export type Channel = "email" | "sms" | "whatsapp";

export interface ServiceOption {
  key: string;
  label: string;
  description: string;
}

export interface DocumentSlot {
  key: string;
  label: string;
  why: string;
  /** Which applicant types see this slot. */
  showFor: ApplicantType[];
}

export interface ConsentDefinition {
  key: string;
  /** Bump whenever the text changes — every submission stores the version + exact text. */
  version: string;
  label: string;
  text: string;
  required: boolean;
}

export interface MessageTemplate {
  /** Variables the template may use. Rendering any other variable throws. */
  variables: readonly string[];
  email?: { subject: string; body: string; buttonLabel?: string; buttonUrlVar?: string };
  sms?: string;
  whatsapp?: {
    body: string;
    /**
     * Twilio Content SID for the Meta-approved template (HX...). Required for
     * business-initiated WhatsApp messages outside the 24h session window.
     * Leave blank until the template is approved; the system falls back to SMS.
     */
    contentSid: string;
    /** Order of variables for the approved template ({{1}}, {{2}}, ...). */
    contentVariables: readonly string[];
  };
}

export interface ChecklistTemplateItem {
  key: string;
  label: string;
  /** Plain instructions. {{periodLabel}} becomes e.g. "Oct to Dec 2026". */
  instructions: string;
  required: boolean;
  /** Marks items whose PDFs are bank statements (used by statement extraction). */
  bankStatement?: boolean;
}

export interface FirmConfig {
  firm: {
    name: string;
    shortName: string;
    addressLines: string[];
    phone: string;
    fax?: string;
    cell?: string;
    email: string;
    hours: string[];
    preferredContact: string;
    timezone: string;
  };
  branding: {
    logo:
      | { kind: "wordmark"; primary: string; secondary: string }
      | { kind: "image"; src: string; alt: string };
    colors: {
      brand: string;
      brandText: string;
      accent: string;
      accentText: string;
      highlight: string;
    };
  };
  links: {
    bookingUrl: string;
    privacyPolicyUrl?: string;
  };
  notifications: {
    fromEmail: string;
    fromName: string;
    replyTo: string;
    firmEmails: string[];
    firmSmsNumbers: string[];
  };
  features: {
    collectSin: boolean;
    collectSpouseSin: boolean;
    allowSinReveal: boolean;
    requireStaff2FA: boolean;
    whatsappEnabled: boolean;
  };
  security: {
    staffIdleTimeoutMinutes: number;
    staffMaxSessionHours: number;
    signedUrlSeconds: number;
    resumeTokenDays: number;
    docRequestTokenDays: number;
    quarterLinkDaysAfterPeriodEnd: number;
  };
  retention: { defaultMonths: number };
  reminders: {
    abandonmentHours: readonly number[];
    docRequestIntervalDays: number;
    docRequestMaxReminders: number;
    quarterlyReminderDays: readonly number[];
    /** Automated reminders only go out between these local hours (firm timezone). */
    sendWindow: { startHour: number; endHour: number };
  };
  intake: {
    expectedResponseTime: string;
    estimatedMinutes: number;
    startIntro: string;
    reminderNotice: string;
    safetyPoints: string[];
    services: ServiceOption[];
    documentSlots: DocumentSlot[];
    referralSources: { key: string; label: string; detailLabel?: string }[];
    industries: string[];
    consents: ConsentDefinition[];
    confirmation: { heading: string; nextSteps: string[] };
  };
  quarterly: {
    clientServices: { key: string; label: string }[];
    checklistTemplates: Record<string, ChecklistTemplateItem[]>;
  };
  messages: Record<string, MessageTemplate>;
}
