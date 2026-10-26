/**
 * FIRM CONFIGURATION — the ONE file to edit when deploying for a firm.
 *
 * Everything firm-specific lives here: name, branding, contact details,
 * notification recipients, wording, consent text, message templates and
 * quarterly checklists. Nothing else in the codebase names the firm.
 *
 * Strings marked [FIRM TO CONFIRM] are drafts written in the firm's voice.
 * They must be reviewed and approved by the firm before go-live. The system
 * never invents prices, policies or promises — if a value is unknown it is
 * left blank and the related feature is hidden or reported in Settings.
 *
 * Template variables use {{name}}. Every template declares the variables it
 * may use; rendering anything else fails loudly. {{firmName}}, {{firmPhone}}
 * and {{firmEmail}} are always available. Sensitive data (SIN, dates of
 * birth, document contents, account numbers) is never passed to templates.
 */
import type { FirmConfig } from "@/lib/config/types";

export const firmConfig: FirmConfig = {
  firm: {
    name: "Perfect Accounting & Tax Services",
    shortName: "Perfect Accounting",
    addressLines: ["16 Regan Rd., Unit 38", "Brampton, ON L7A 1C1"],
    phone: "905-497-7050",
    fax: "905-497-7051",
    cell: "416-577-6517",
    email: "savetax@live.ca",
    hours: ["Mon – Fri: 9am to 6pm", "Sat: 10am to 5pm", "Sunday: Closed"],
    preferredContact: "Text or email is the best way to reach us.",
    timezone: "America/Toronto",
  },

  branding: {
    logo: { kind: "wordmark", primary: "PERFECT", secondary: "Accounting & Tax Services" },
    colors: {
      brand: "#111111",
      brandText: "#ffffff",
      accent: "#d7191f",
      accentText: "#ffffff",
      highlight: "#ffe600",
    },
  },

  links: {
    // [FIRM TO CONFIRM] Cal.com booking page for onboarding calls, e.g. "https://cal.com/<name>/onboarding".
    // Left blank until GK supplies it — the confirmation screen hides the booking button while blank.
    bookingUrl: "",
    // [FIRM TO CONFIRM] Optional link to the firm's full privacy policy.
    privacyPolicyUrl: "",
  },

  notifications: {
    // [FIRM TO CONFIRM] Sender address on a domain verified in Resend (cannot be @live.ca).
    fromEmail: "",
    fromName: "Perfect Accounting & Tax Services",
    replyTo: "savetax@live.ca",
    // Who gets "new intake" alerts. Alerts never contain SIN, birth dates or document contents.
    firmEmails: ["savetax@live.ca"],
    firmSmsNumbers: ["+14165776517"],
  },

  features: {
    // [FIRM TO CONFIRM] Collect SIN on the form? When true it is AES-256 encrypted, shown masked,
    // and never appears in emails, SMS, logs, notifications or CSV exports.
    collectSin: true,
    collectSpouseSin: true,
    // Staff may reveal a full SIN for 30 seconds; every reveal is audit-logged.
    allowSinReveal: true,
    // Staff must set up an authenticator app (TOTP) before using the dashboard.
    requireStaff2FA: true,
    // Requires a Twilio WhatsApp sender + Meta-approved templates (contentSid below).
    // While false, quarterly requests go by SMS + email.
    whatsappEnabled: false,
  },

  security: {
    staffIdleTimeoutMinutes: 30,
    staffMaxSessionHours: 12,
    signedUrlSeconds: 300,
    resumeTokenDays: 7,
    docRequestTokenDays: 7,
    quarterLinkDaysAfterPeriodEnd: 60,
  },

  retention: {
    // [FIRM TO CONFIRM] Intakes older than this are flagged for deletion review (never auto-deleted).
    // Admins can change it in Settings. 84 months = 7 years.
    defaultMonths: 84,
  },

  reminders: {
    abandonmentHours: [24, 72],
    docRequestIntervalDays: 7,
    docRequestMaxReminders: 3,
    quarterlyReminderDays: [7, 14, 21, 28],
    sendWindow: { startHour: 9, endHour: 19 },
  },

  intake: {
    // [FIRM TO CONFIRM]
    expectedResponseTime: "within 1 business day",
    estimatedMinutes: 5,
    // [FIRM TO CONFIRM]
    startIntro:
      "Tell us about yourself and what you need help with. It takes about 5 minutes. You can stop at any time and pick up where you left off.",
    // [FIRM TO CONFIRM]
    // [FIRM TO CONFIRM] Shown on the start page. "Canada" is only true once the Supabase project is in ca-central-1.
    safetyPoints: [
      "Stored securely in Canada and encrypted.",
      "Only our team can see it. We never sell or share it.",
      "No ads or tracking on this form.",
    ],
    // [FIRM TO CONFIRM]
    reminderNotice:
      "Your answers save as you go. If you stop before finishing, we'll send up to two reminders with a private link to pick up where you left off.",
    services: [
      { key: "t1_personal", label: "Personal tax return (T1)", description: "Your yearly income tax return." },
      { key: "t2_corporate", label: "Corporate tax return (T2)", description: "Yearly tax return for a corporation." },
      { key: "bookkeeping", label: "Bookkeeping", description: "We keep your business records in order." },
      { key: "payroll", label: "Payroll", description: "Paying staff, pay stubs, T4s and remittances." },
      { key: "hst_gst", label: "HST/GST filing", description: "Sales tax returns to CRA." },
      { key: "wsib", label: "WSIB", description: "Workplace insurance reports and payments." },
      { key: "incorporation", label: "Incorporation", description: "Setting up a new corporation." },
      { key: "cra_audit", label: "CRA audit or review help", description: "Help answering CRA letters or audits." },
      { key: "financial_statements", label: "Financial statements", description: "Statements for banks, landlords or owners." },
      { key: "us_tax", label: "US tax", description: "US returns or US income questions." },
      { key: "other", label: "Something else", description: "Tell us in your own words." },
    ],
    documentSlots: [
      {
        key: "government_id",
        label: "Government photo ID",
        why: "So we can confirm who you are before we act for you — never shared.",
        showFor: ["individual", "couple", "business"],
      },
      {
        key: "last_return_noa",
        label: "Last tax return or Notice of Assessment",
        why: "So we can file correctly and carry forward amounts from last year — never shared.",
        showFor: ["individual", "couple", "business"],
      },
      {
        key: "tax_slips",
        label: "T4 / T5 or other tax slips",
        why: "So we report every slip CRA already has — never shared.",
        showFor: ["individual", "couple"],
      },
      {
        key: "incorporation_docs",
        label: "Incorporation certificate or articles",
        why: "So we have your company's official details — never shared.",
        showFor: ["business"],
      },
      {
        key: "void_cheque",
        label: "Void cheque or direct deposit form",
        why: "So refunds and payments go to the right account — never shared.",
        showFor: ["individual", "couple", "business"],
      },
      {
        key: "other",
        label: "Anything else",
        why: "CRA letters or anything you think we should see.",
        showFor: ["individual", "couple", "business"],
      },
    ],
    referralSources: [
      { key: "google", label: "Google search" },
      { key: "referral", label: "A friend or client referred me", detailLabel: "Who referred you? (optional)" },
      { key: "social", label: "Social media" },
      { key: "walk_in", label: "Walked by the office" },
      { key: "other", label: "Other", detailLabel: "Tell us where (optional)" },
    ],
    industries: [
      "Trucking & transportation",
      "Construction & trades",
      "Retail store",
      "Restaurant & food",
      "Real estate",
      "Professional services",
      "Health & wellness",
      "IT & technology",
      "Cleaning & maintenance",
      "Manufacturing",
      "Online business",
      "Other",
    ],
    consents: [
      {
        key: "engagement",
        version: "2026-10-v1",
        label: "I'd like {{firmName}} to review my information",
        // [FIRM TO CONFIRM] — have the firm (and ideally their lawyer/insurer) approve this wording.
        text:
          "I'm asking {{firmName}} to review the information and documents I've provided so they can tell me how they can help. I understand this form does not on its own make {{firmName}} my accountant. Services and fees will be confirmed separately before any work starts.",
        required: true,
      },
      {
        key: "privacy",
        version: "2026-10-v1",
        label: "I understand how my information is used",
        // [FIRM TO CONFIRM]
        text:
          "{{firmName}} collects my personal information to provide accounting and tax services. It is stored securely in Canada and shared only with the Canada Revenue Agency or others when needed to do the work I ask for, or when the law requires it. I can ask to see or correct my information at any time.",
        required: true,
      },
      {
        key: "communications",
        version: "2026-10-v1",
        label: "Yes, you may email and text me",
        // [FIRM TO CONFIRM] CASL express consent. Optional — the form works without it.
        text:
          "{{firmName}} may contact me by email, text message and WhatsApp about my file and their services. I can unsubscribe at any time by replying STOP or using the unsubscribe link.",
        required: false,
      },
      {
        key: "cra_authorization",
        version: "2026-10-v1",
        label: "I understand CRA authorization is signed separately",
        // [FIRM TO CONFIRM]
        text:
          "To speak with the Canada Revenue Agency for me, {{firmName}} will ask me to sign a separate CRA authorization (\"Represent a Client\"). This form does not give that authorization.",
        required: true,
      },
    ],
    confirmation: {
      // [FIRM TO CONFIRM]
      heading: "Thank you — we have everything we need to get started.",
      // [FIRM TO CONFIRM]
      nextSteps: [
        "Our team will review your answers and documents.",
        "We'll contact you {{expectedResponseTime}} by text or email.",
        "If anything is missing, we'll send you a private link to upload it.",
      ],
    },
  },

  quarterly: {
    clientServices: [
      { key: "bookkeeping", label: "Bookkeeping" },
      { key: "payroll", label: "Payroll" },
      { key: "hst", label: "HST/GST" },
    ],
    // [FIRM TO CONFIRM] all item labels and instructions below.
    checklistTemplates: {
      bookkeeping: [
        {
          key: "bank_statements",
          label: "Bank statements — all business accounts",
          instructions:
            "PDF statements for every business bank account for {{periodLabel}}. Download them from online banking as PDF (not screenshots).",
          required: true,
          bankStatement: true,
        },
        {
          key: "credit_card_statements",
          label: "Credit card statements — all business cards",
          instructions: "PDF statements for every business credit card for {{periodLabel}}.",
          required: true,
        },
        {
          key: "cheque_images",
          label: "Cheque images",
          instructions: "Photos or scans of cheques you wrote or deposited in {{periodLabel}}.",
          required: true,
        },
        {
          key: "sales_invoices",
          label: "Sales invoices",
          instructions: "Invoices or receipts you gave to customers in {{periodLabel}}.",
          required: true,
        },
        {
          key: "expense_receipts",
          label: "Expense receipts and bills",
          instructions: "Receipts and bills for business expenses in {{periodLabel}}. Photos are fine.",
          required: true,
        },
      ],
      payroll: [
        {
          key: "pay_stubs",
          label: "Pay stubs or payroll summary",
          instructions: "Pay stubs for every pay period in {{periodLabel}}, or your payroll summary report.",
          required: true,
        },
        {
          key: "employee_changes",
          label: "New or departed employees",
          instructions:
            "If anyone started or left in {{periodLabel}}, upload their details (start/end date and TD1 form for new staff).",
          required: true,
        },
      ],
      hst: [
        {
          key: "sales_summary",
          label: "Sales summary",
          instructions: "A summary of all sales and HST collected in {{periodLabel}}.",
          required: true,
        },
        {
          key: "purchase_invoices",
          label: "Purchase invoices with HST",
          instructions: "Invoices for business purchases in {{periodLabel}} that show HST paid.",
          required: true,
        },
      ],
    },
  },

  // [FIRM TO CONFIRM] every message below. SMS and WhatsApp automatically get
  // "Reply STOP to opt out." appended; emails get the firm's name, address and
  // an unsubscribe link in the footer. Do not add SIN, birth dates, amounts or
  // document contents to any template.
  messages: {
    firm_new_intake: {
      variables: ["clientName", "services", "dashboardUrl"],
      email: {
        subject: "New client intake: {{clientName}}",
        body: "A new intake was submitted.\n\nName: {{clientName}}\nServices: {{services}}\n\nOpen it in the dashboard to review.",
        buttonLabel: "Open in dashboard",
        buttonUrlVar: "dashboardUrl",
      },
      sms: "{{firmName}}: new intake from {{clientName}} ({{services}}). {{dashboardUrl}}",
    },
    client_intake_received: {
      variables: ["firstName", "reference", "responseTime", "bookingUrl"],
      email: {
        subject: "We received your information — {{firmName}}",
        body:
          "Hi {{firstName}},\n\nThank you — we received everything you sent. Your reference number is {{reference}}.\n\nHere's what happens next: our team will review your information and contact you {{responseTime}}. If anything is missing, we'll send you a private link to upload it.\n\nQuestions? Call {{firmPhone}} or reply to this email.",
      },
      sms: "{{firmName}}: Hi {{firstName}}, we received your information (ref {{reference}}). We'll be in touch {{responseTime}}.",
    },
    intake_abandoned_1: {
      variables: ["firstName", "resumeUrl", "expiresDays"],
      email: {
        subject: "Pick up where you left off — {{firmName}}",
        body:
          "Hi {{firstName}},\n\nYou started your client form with {{firmName}} but didn't finish. Your answers are saved. Use the button below to continue — the link works for {{expiresDays}} days.\n\nIf you'd rather talk, call us at {{firmPhone}}.",
        buttonLabel: "Continue my form",
        buttonUrlVar: "resumeUrl",
      },
      sms: "{{firmName}}: Hi {{firstName}}, your form is saved. Continue here: {{resumeUrl}}",
    },
    intake_abandoned_2: {
      variables: ["firstName", "resumeUrl", "expiresDays"],
      email: {
        subject: "Your form is still saved — {{firmName}}",
        body:
          "Hi {{firstName}},\n\nA last reminder: your client form with {{firmName}} is still saved. You can finish it any time in the next {{expiresDays}} days. We won't send more reminders.",
        buttonLabel: "Finish my form",
        buttonUrlVar: "resumeUrl",
      },
      sms: "{{firmName}}: last reminder — your form is still saved. Finish it here: {{resumeUrl}}",
    },
    doc_request: {
      variables: ["firstName", "itemCount", "uploadUrl", "expiresDays"],
      email: {
        subject: "Please upload {{itemCount}} document(s) — {{firmName}}",
        body:
          "Hi {{firstName}},\n\nTo continue with your file we need {{itemCount}} more document(s). Use the private link below to upload them — it only accepts the items we asked for and works for {{expiresDays}} days.",
        buttonLabel: "Upload documents",
        buttonUrlVar: "uploadUrl",
      },
      sms: "{{firmName}}: Hi {{firstName}}, we need {{itemCount}} more document(s). Upload here: {{uploadUrl}}",
    },
    doc_request_reminder: {
      variables: ["firstName", "itemCount", "uploadUrl", "expiresDays"],
      email: {
        subject: "Reminder: {{itemCount}} document(s) still needed — {{firmName}}",
        body:
          "Hi {{firstName}},\n\nFriendly reminder: we're still waiting on {{itemCount}} document(s) to continue with your file. Upload them with the private link below (works for {{expiresDays}} days).\n\nIf you've already sent them another way, please ignore this message.",
        buttonLabel: "Upload documents",
        buttonUrlVar: "uploadUrl",
      },
      sms: "{{firmName}}: reminder — we still need {{itemCount}} document(s). Upload here: {{uploadUrl}}",
    },
    quarter_request: {
      variables: ["contactName", "businessName", "quarterLabel", "periodLabel", "itemList", "uploadUrl"],
      email: {
        subject: "{{quarterLabel}} documents for {{businessName}} — {{firmName}}",
        body:
          "Hi {{contactName}},\n\nIt's time to send your documents for {{periodLabel}} ({{quarterLabel}}). Here's what we need:\n\n{{itemList}}\n\nUse your private upload link below. No need to email attachments.",
        buttonLabel: "Upload my documents",
        buttonUrlVar: "uploadUrl",
      },
      sms: "{{firmName}}: Hi {{contactName}}, please send your {{periodLabel}} documents for {{businessName}}. Upload here: {{uploadUrl}}",
      whatsapp: {
        body: "Hi {{contactName}}, this is {{firmName}}. Please send your {{periodLabel}} documents for {{businessName}} using your private link: {{uploadUrl}}",
        contentSid: "",
        contentVariables: ["contactName", "firmName", "periodLabel", "businessName", "uploadUrl"],
      },
    },
    quarter_reminder_7: {
      variables: ["contactName", "businessName", "quarterLabel", "periodLabel", "itemList", "uploadUrl"],
      email: {
        subject: "Friendly reminder: {{quarterLabel}} documents — {{firmName}}",
        body:
          "Hi {{contactName}},\n\nJust a friendly reminder to upload your {{periodLabel}} documents for {{businessName}}. Still needed:\n\n{{itemList}}",
        buttonLabel: "Upload my documents",
        buttonUrlVar: "uploadUrl",
      },
      sms: "{{firmName}}: friendly reminder to upload your {{periodLabel}} documents for {{businessName}}: {{uploadUrl}}",
      whatsapp: {
        body: "Hi {{contactName}}, friendly reminder from {{firmName}} to upload your {{periodLabel}} documents for {{businessName}}: {{uploadUrl}}",
        contentSid: "",
        contentVariables: ["contactName", "firmName", "periodLabel", "businessName", "uploadUrl"],
      },
    },
    quarter_reminder_14: {
      // [FIRM TO CONFIRM] Based on the firm's existing second WhatsApp message.
      variables: ["contactName", "businessName", "quarterLabel", "periodLabel", "itemList", "uploadUrl"],
      email: {
        subject: "Reminder: please send your {{quarterLabel}} documents — {{firmName}}",
        body:
          "Hi {{contactName}},\n\nPlease send your {{periodLabel}} documents for {{businessName}} to the office using your private link below. If you have already sent them, please ignore this message.\n\nStill needed:\n\n{{itemList}}",
        buttonLabel: "Upload my documents",
        buttonUrlVar: "uploadUrl",
      },
      sms: "{{firmName}}: please send your {{periodLabel}} documents for {{businessName}} to the office: {{uploadUrl}} — ignore if already sent.",
      whatsapp: {
        body: "Hi {{contactName}}, {{firmName}} here. Please send your {{periodLabel}} documents for {{businessName}} to the office: {{uploadUrl}} — please ignore if already sent.",
        contentSid: "",
        contentVariables: ["contactName", "firmName", "periodLabel", "businessName", "uploadUrl"],
      },
    },
    quarter_reminder_21: {
      variables: ["contactName", "businessName", "quarterLabel", "periodLabel", "itemList", "uploadUrl"],
      email: {
        subject: "Action needed: {{quarterLabel}} documents for {{businessName}} — {{firmName}}",
        body:
          "Hi {{contactName}},\n\nWe still don't have all of your {{periodLabel}} documents for {{businessName}}, and we need them to keep your filings on time. Please upload them this week.\n\nStill needed:\n\n{{itemList}}",
        buttonLabel: "Upload my documents",
        buttonUrlVar: "uploadUrl",
      },
      sms: "{{firmName}}: we still need your {{periodLabel}} documents for {{businessName}} to keep your filings on time. Upload this week: {{uploadUrl}}",
      whatsapp: {
        body: "Hi {{contactName}}, {{firmName}} still needs your {{periodLabel}} documents for {{businessName}} to keep your filings on time. Please upload this week: {{uploadUrl}}",
        contentSid: "",
        contentVariables: ["contactName", "firmName", "periodLabel", "businessName", "uploadUrl"],
      },
    },
    quarter_reminder_28: {
      variables: ["contactName", "businessName", "quarterLabel", "periodLabel", "itemList", "uploadUrl"],
      email: {
        subject: "Final reminder: {{quarterLabel}} documents — {{firmName}}",
        body:
          "Hi {{contactName}},\n\nThis is our final automatic reminder for your {{periodLabel}} documents for {{businessName}}. Please upload them as soon as possible, or call us at {{firmPhone}} if something is holding you up.\n\nStill needed:\n\n{{itemList}}",
        buttonLabel: "Upload my documents",
        buttonUrlVar: "uploadUrl",
      },
      sms: "{{firmName}}: final reminder for your {{periodLabel}} documents for {{businessName}}: {{uploadUrl}} Questions? {{firmPhone}}",
      whatsapp: {
        body: "Hi {{contactName}}, final reminder from {{firmName}} for your {{periodLabel}} documents for {{businessName}}: {{uploadUrl}} Questions? Call {{firmPhone}}.",
        contentSid: "",
        contentVariables: ["contactName", "firmName", "periodLabel", "businessName", "uploadUrl", "firmPhone"],
      },
    },
    portal_sign_in: {
      variables: ["name", "signInUrl"],
      email: {
        subject: "Your sign-in link — {{firmName}}",
        body:
          "Hi {{name}},\n\nUse the button below to sign in to your {{firmName}} client page. The link works once and expires in 1 hour. If you didn't ask for it, you can ignore this email.",
        buttonLabel: "Sign in",
        buttonUrlVar: "signInUrl",
      },
    },
    staff_set_password: {
      variables: ["name", "linkUrl"],
      email: {
        subject: "Set your dashboard password — {{firmName}}",
        body:
          "Hi {{name}},\n\nUse the button below to set your password for the {{firmName}} staff dashboard. The link works once and expires in 1 hour.",
        buttonLabel: "Set my password",
        buttonUrlVar: "linkUrl",
      },
    },
  },
};

