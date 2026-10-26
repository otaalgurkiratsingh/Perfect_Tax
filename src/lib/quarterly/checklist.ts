import type { ChecklistTemplateItem } from "@/lib/config/types";

export interface ChecklistItemDraft {
  item_key: string;
  label: string;
  instructions: string;
  required: boolean;
  bank_statement: boolean;
  sort_order: number;
}

/**
 * Build one client's checklist for a quarter from the templates of every
 * service they use (bookkeeping / payroll / HST), merged and de-duplicated.
 */
export function buildChecklist(
  services: readonly string[],
  templates: Record<string, ChecklistTemplateItem[]>,
  periodLabel: string,
): ChecklistItemDraft[] {
  const seen = new Set<string>();
  const items: ChecklistItemDraft[] = [];
  for (const service of Object.keys(templates)) {
    if (!services.includes(service)) continue;
    for (const t of templates[service]) {
      if (seen.has(t.key)) continue;
      seen.add(t.key);
      items.push({
        item_key: t.key,
        label: t.label,
        instructions: t.instructions.replace(/\{\{periodLabel\}\}/g, periodLabel),
        required: t.required,
        bank_statement: Boolean(t.bankStatement),
        sort_order: items.length,
      });
    }
  }
  return items;
}

export type ItemStatus = "missing" | "received" | "not_applicable";
export type ClientQuarterStatus = "not_sent" | "requested" | "partial" | "complete" | "processed";

/** Status from the checklist: nothing in yet = requested, some = partial, all required = complete. */
export function computeStatus(
  current: ClientQuarterStatus,
  requested: boolean,
  items: { required: boolean; status: ItemStatus }[],
): ClientQuarterStatus {
  if (current === "processed") return "processed";
  const required = items.filter((i) => i.required);
  const done = required.filter((i) => i.status !== "missing").length;
  if (required.length > 0 && done === required.length) return "complete";
  if (!requested) return "not_sent";
  const anyIn = items.some((i) => i.status !== "missing");
  return anyIn ? "partial" : "requested";
}

/** Which reminder (by day number) is due now, if any. Only the latest due one is sent. */
export function dueReminderDay(daysSinceRequest: number, lastReminderDay: number, schedule: readonly number[]): number | null {
  const due = schedule.filter((d) => d > lastReminderDay && d <= daysSinceRequest);
  return due.length ? Math.max(...due) : null;
}
