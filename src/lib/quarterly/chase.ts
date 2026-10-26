import "server-only";
import { firmConfig } from "@firm/config";
import { adminClient } from "@/lib/supabase/admin";
import { dueReminderDay } from "./checklist";
import { sendQuarterMessage, type QuarterTemplate } from "./engine";

const DAY = 86_400_000;

/**
 * The chase: reminders on day 7, 14, 21 and 28 after the request, ONLY to
 * clients still "requested" or "partial". A client whose checklist is complete
 * has status "complete", so they drop out of this query the moment they finish.
 */
export async function runQuarterlyChase(now: Date, opts: { sendWindowOpen: boolean }) {
  if (!opts.sendWindowOpen) return { reminders: 0, byDay: {} as Record<string, number> };
  const db = adminClient();
  const schedule = firmConfig.reminders.quarterlyReminderDays;
  const lastDay = Math.max(...schedule);
  const { data: open } = await db.from("quarters").select("id").eq("status", "open");
  const quarterIds = (open ?? []).map((q) => q.id);
  if (!quarterIds.length) return { reminders: 0, byDay: {} };
  const { data } = await db
    .from("client_quarters")
    .select("id, requested_at, last_reminder_day")
    .in("quarter_id", quarterIds)
    .in("status", ["requested", "partial"])
    .lt("last_reminder_day", lastDay)
    .not("requested_at", "is", null)
    .limit(500);
  const byDay: Record<string, number> = {};
  let reminders = 0;
  for (const row of data ?? []) {
    const days = Math.floor((now.getTime() - new Date(row.requested_at!).getTime()) / DAY);
    const day = dueReminderDay(days, row.last_reminder_day, schedule);
    if (day === null) continue;
    const { data: claimed } = await db
      .from("client_quarters")
      .update({ last_reminder_day: day, last_reminder_at: now.toISOString() })
      .eq("id", row.id)
      .eq("last_reminder_day", row.last_reminder_day)
      .in("status", ["requested", "partial"])
      .select("id");
    if (!claimed?.length) continue;
    await sendQuarterMessage(row.id, `quarter_reminder_${day}` as QuarterTemplate, { day });
    byDay[day] = (byDay[day] ?? 0) + 1;
    reminders++;
  }
  return { reminders, byDay };
}
