# Field map — paper intake form → digital intake

## Source status

`intake-source/` was **empty** at build time. The firm's paper form was not available, so the
digital form uses the **default field set** from the build brief. Every field below is an
**assumption for GK to verify** against the real paper form.

The only firm material available was the firm's business card (shared in the build request).
It supplied the firm's name, address, phone, fax, cell, email, hours, and "best method of
communication: TXT or Email". All of that lives in `firm.config.ts`.

**To finish this step:** photograph or scan the paper form into `intake-source/`, then compare
it line by line with the tables below. Mark each row ✅ (matches), ✏️ (rename/reword) or ➕/➖
(add/remove). Most changes are a config or label edit. New fields need a small code change in
`src/lib/intake/schema.ts` and `src/app/intake/steps/*`.

## Step 1 — Who are you?

| Digital field | Type | Required | Notes / assumption |
|---|---|---|---|
| Applicant type | Individual / Couple / Business | Yes | Drives all branching |
| Business type | Sole proprietor / Partnership / Corporation | Yes (business) | |

## Step 2 — Details

### Individual and couple: main applicant

| Digital field | Type | Required | Notes / assumption |
|---|---|---|---|
| Full legal name | text | Yes | One field (not split first/last). Verify against paper form |
| Date of birth | date | Yes | |
| Email | email | Yes | Used for resume links and replies |
| Mobile phone | phone (10 digits) | Yes | Stored as +1XXXXXXXXXX |
| Home address | street, unit, city, province, postal code | Yes | Postal code validated |
| Marital status | single / married / common-law / separated / divorced / widowed | Yes | |
| Canadian residency status | citizen / PR / work permit / study permit / non-resident | Yes | |
| SIN | 9 digits, checksum validated | **Optional** | Only if `features.collectSin` is on. AES-256 encrypted, shown masked. Optional so clients can give it in person instead. **Firm to confirm optional vs required** |

### Couple: spouse

| Digital field | Type | Required | Notes |
|---|---|---|---|
| Spouse full legal name | text | Yes | |
| Spouse date of birth | date | Yes | |
| Spouse email | email | No | |
| Spouse mobile | phone | No | |
| Spouse residency status | as above | Yes | |
| Spouse SIN | 9 digits | Optional | Only if `features.collectSpouseSin` is on |

Assumption: the spouse's address is the same as the main applicant's (not asked separately).

### Business

| Digital field | Type | Required | Notes / assumption |
|---|---|---|---|
| Contact full name | text | Yes | The person filling the form |
| Contact email / mobile | email / phone | Yes | |
| Contact role | text | No | e.g. Owner, Director |
| Legal business name | text | Yes | |
| Business Number (BN) | 9 digits | No | Blank allowed for brand-new businesses |
| Fiscal year-end | month + day | Yes | |
| Incorporation date | date | Yes (corporation only) | |
| Incorporation province | province or "Federal" | Yes (corporation only) | |
| Industry | dropdown + "Other" text | Yes | List in `firm.config.ts` (includes Trucking for Brampton) |
| Business address if different | checkbox + address | No | |
| Owner date of birth, home address, residency, SIN | as individual | Sole proprietor only | Sole-prop income goes on the owner's T1. **Assumption** |

## Step 3 — Services (yes/no cards)

T1 personal, T2 corporate, bookkeeping, payroll, HST/GST, WSIB, incorporation, CRA audit help,
financial statements, US tax, other (free text). At least one is required. List and wording in
`firm.config.ts → intake.services`.

## Step 4 — Situation

| Digital field | Type | Required |
|---|---|---|
| Had a previous accountant? | yes/no (+ name, optional) | Yes |
| Tax years not filed | number 0–30 | Yes |
| Received a CRA letter? | yes/no (+ details, optional) | Yes |
| Urgent deadline? | yes/no (+ date required, details optional) | Yes |
| How did you hear about us? | Google / referral (who?) / social / walk-in / other | Yes |

## Step 5 — Documents (all optional at intake; staff can request missing ones later)

Government ID · last return or Notice of Assessment · T4/T5 slips (individual/couple) ·
incorporation certificate/articles (business) · void cheque · other. PDF/JPG/PNG/HEIC, 25 MB each,
multiple files per slot.

## Step 6 — Consents (each its own unticked checkbox)

| Consent | Required | Stored |
|---|---|---|
| Engagement (review my information) | Yes | version + exact text + time + IP + browser |
| Privacy acknowledgment | Yes | same |
| Email/SMS/WhatsApp communication (CASL) | No | same |
| CRA "Represent a Client" signed separately | Yes (acknowledgment) | same |

All consent wording is a draft marked **[FIRM TO CONFIRM]** in `firm.config.ts`.

## Not on the digital form (likely on paper — verify)

These are common on accounting paper forms but were **not** in the brief, so they were left out
on purpose. Add any the firm actually needs:

- Dependants (names, birth dates) for T1 credits
- Direct-deposit banking numbers (the void cheque upload covers this)
- Rent / property tax for the Ontario Trillium Benefit
- Medical expenses, donations, RRSP, tuition
- Employer name / occupation
- Language preference
- Fee agreement or payment method
