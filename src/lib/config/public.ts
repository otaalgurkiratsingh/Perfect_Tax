import "server-only";
import { firmConfig } from "@firm/config";
import { fillFirmText } from "@/lib/config";

/**
 * The slice of firm.config.ts that browser code may see. Passed to client
 * components as props so notification recipients and message templates never
 * end up in a public JavaScript bundle.
 */
export function publicIntakeConfig() {
  const f = firmConfig;
  return {
    firmName: f.firm.name,
    firmPhone: f.firm.phone,
    firmEmail: f.firm.email,
    bookingUrl: f.links.bookingUrl,
    privacyPolicyUrl: f.links.privacyPolicyUrl ?? "",
    estimatedMinutes: f.intake.estimatedMinutes,
    reminderNotice: fillFirmText(f.intake.reminderNotice),
    features: { collectSin: f.features.collectSin, collectSpouseSin: f.features.collectSpouseSin },
    services: f.intake.services,
    documentSlots: f.intake.documentSlots,
    referralSources: f.intake.referralSources,
    industries: f.intake.industries,
    consents: f.intake.consents.map((c) => ({
      key: c.key,
      label: fillFirmText(c.label),
      text: fillFirmText(c.text),
      required: c.required,
    })),
    confirmation: {
      heading: fillFirmText(f.intake.confirmation.heading),
      nextSteps: f.intake.confirmation.nextSteps.map((s) => fillFirmText(s)),
    },
  };
}

export type PublicIntakeConfig = ReturnType<typeof publicIntakeConfig>;
