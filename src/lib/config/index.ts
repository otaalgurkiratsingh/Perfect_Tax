import { firmConfig } from "@firm/config";

export { firmConfig };
export const config = firmConfig;



export function serviceLabel(key: string): string {
  return firmConfig.intake.services.find((s) => s.key === key)?.label ?? key;
}

export function documentSlotLabel(key: string): string {
  return firmConfig.intake.documentSlots.find((d) => d.key === key)?.label ?? key;
}

export function referralLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return firmConfig.intake.referralSources.find((r) => r.key === key)?.label ?? key;
}

/** Replace {{firmName}} etc. in static config text (consents, intro copy). */
export function fillFirmText(text: string, extra: Record<string, string> = {}): string {
  const vars: Record<string, string> = {
    firmName: firmConfig.firm.name,
    firmPhone: firmConfig.firm.phone,
    firmEmail: firmConfig.firm.email,
    expectedResponseTime: firmConfig.intake.expectedResponseTime,
    ...extra,
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}
