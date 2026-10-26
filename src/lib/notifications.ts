import "server-only";
import { firmConfig } from "@firm/config";
import { env } from "@/lib/env";
import { sendMessage } from "@/lib/messaging/send";
import { firstName, sanitizeAnswers } from "@/lib/intake/schema";
import { notificationSummary, type IntakeRow } from "@/lib/intake/server";

/**
 * On submit: alert the firm (email + SMS) and send the client an auto-reply.
 * Firm alerts carry ONLY name + services ticked + dashboard link. No SIN, no
 * birth date, no document contents — the template system enforces this too.
 * Failures are logged in message_log and never block the submission.
 */
export async function notifyIntakeSubmitted(intake: IntakeRow) {
  const { name, services } = notificationSummary(intake);
  const answers = sanitizeAnswers(intake.answers);
  const clientName = intake.business_name ? `${name} (${intake.business_name})` : name;
  const dashboardUrl = `${env.siteUrl}/staff/intakes/${intake.id}`;
  const context = { intakeId: intake.id };
  const jobs: Promise<unknown>[] = [];

  for (const to of firmConfig.notifications.firmEmails) {
    jobs.push(
      sendMessage({ channel: "email", to, templateKey: "firm_new_intake", vars: { clientName, services, dashboardUrl }, context, internal: true }),
    );
  }
  for (const to of firmConfig.notifications.firmSmsNumbers) {
    jobs.push(
      sendMessage({ channel: "sms", to, templateKey: "firm_new_intake", vars: { clientName, services, dashboardUrl }, context, internal: true }),
    );
  }

  const clientVars = {
    firstName: firstName(answers),
    reference: intake.reference,
    responseTime: firmConfig.intake.expectedResponseTime,
    bookingUrl: firmConfig.links.bookingUrl || `${env.siteUrl}`,
  };
  if (intake.email) jobs.push(sendMessage({ channel: "email", to: intake.email, templateKey: "client_intake_received", vars: clientVars, context }));
  if (intake.phone) jobs.push(sendMessage({ channel: "sms", to: intake.phone, templateKey: "client_intake_received", vars: clientVars, context }));

  await Promise.allSettled(jobs);
}
