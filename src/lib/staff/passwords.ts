import "server-only";
import { env } from "@/lib/env";
import { sendMessage } from "@/lib/messaging/send";
import { adminClient } from "@/lib/supabase/admin";

/** Email a one-time "set your password" link (used for new staff and resets). */
export async function sendPasswordLink(email: string, name: string): Promise<void> {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: "recovery", email });
  if (error || !data.properties?.hashed_token) return;
  const linkUrl = `${env.siteUrl}/staff/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery`;
  await sendMessage({ channel: "email", to: email, templateKey: "staff_set_password", vars: { name, linkUrl }, internal: true });
}
