import { describe, expect, it } from "vitest";
import { firmConfig } from "@firm/config";
import { buildChecklist, computeStatus, dueReminderDay } from "@/lib/quarterly/checklist";
import { quarterInfo, previousQuarter } from "@/lib/quarterly/periods";

const T = firmConfig.quarterly.checklistTemplates;

describe("quarters", () => {
  it("labels and periods", () => {
    expect(quarterInfo(2026, 4)).toMatchObject({ label: "2026-Q4", periodStart: "2026-10-01", periodEnd: "2026-12-31", periodLabel: "Oct to Dec 2026" });
    expect(quarterInfo(2028, 1).periodEnd).toBe("2028-03-31");
    expect(previousQuarter(new Date("2026-10-26T12:00:00Z"))).toEqual({ year: 2026, quarter: 3 });
    expect(previousQuarter(new Date("2027-02-01T12:00:00Z"))).toEqual({ year: 2026, quarter: 4 });
  });
});

describe("checklists by client type", () => {
  const p = "Oct to Dec 2026";
  it("bookkeeping clients get bank statements, cheques, etc.", () => {
    const keys = buildChecklist(["bookkeeping"], T, p).map((i) => i.item_key);
    expect(keys).toContain("bank_statements");
    expect(keys).toContain("cheque_images");
    expect(keys).not.toContain("pay_stubs");
  });
  it("payroll clients get pay stubs only", () => {
    expect(buildChecklist(["payroll"], T, p).map((i) => i.item_key)).toEqual(["pay_stubs", "employee_changes"]);
  });
  it("HST clients get sales + purchase items", () => {
    expect(buildChecklist(["hst"], T, p).map((i) => i.item_key)).toEqual(["sales_summary", "purchase_invoices"]);
  });
  it("combined clients get the union without duplicates, with the period filled in", () => {
    const items = buildChecklist(["hst", "bookkeeping", "payroll"], T, p);
    expect(new Set(items.map((i) => i.item_key)).size).toBe(items.length);
    expect(items[0].instructions).toContain("Oct to Dec 2026");
    expect(items.find((i) => i.item_key === "bank_statements")!.bank_statement).toBe(true);
  });
});

describe("status + reminders", () => {
  const items = (s: ("missing" | "received" | "not_applicable")[]) => s.map((status) => ({ required: true, status }));
  it("computes statuses", () => {
    expect(computeStatus("not_sent", false, items(["missing", "missing"]))).toBe("not_sent");
    expect(computeStatus("requested", true, items(["missing", "missing"]))).toBe("requested");
    expect(computeStatus("requested", true, items(["received", "missing"]))).toBe("partial");
    expect(computeStatus("partial", true, items(["received", "not_applicable"]))).toBe("complete");
    expect(computeStatus("processed", true, items(["missing"]))).toBe("processed");
  });
  it("sends only the latest due reminder, once", () => {
    const s = firmConfig.reminders.quarterlyReminderDays;
    expect(dueReminderDay(6, 0, s)).toBeNull();
    expect(dueReminderDay(7, 0, s)).toBe(7);
    expect(dueReminderDay(8, 7, s)).toBeNull();
    expect(dueReminderDay(15, 7, s)).toBe(14);
    expect(dueReminderDay(40, 0, s)).toBe(28); // job was down: no burst
    expect(dueReminderDay(60, 28, s)).toBeNull(); // stops after day 28
  });
});

describe("templates cover the reminder schedule", () => {
  it("every reminder day has a quarter_reminder_<day> template with SMS and email", () => {
    for (const day of firmConfig.reminders.quarterlyReminderDays) {
      const t = firmConfig.messages[`quarter_reminder_${day}`];
      expect(t, `quarter_reminder_${day}`).toBeDefined();
      expect(t.sms && t.email).toBeTruthy();
    }
  });
});
