import "server-only";
import { env } from "@/lib/env";
import { sendMessage } from "@/lib/messaging/send";
import { issueToken } from "@/lib/security/tokens";
import { adminClient } from "@/lib/supabase/admin";
import type { ClientRow } from "@/lib/quarterly/engine";

/** Make sure the client has a (password-less) login, then email a one-time sign-in link. */
export async function sendPortalSignInLink(client: ClientRow): Promise<boolean> {
  if (!client.email || !client.active) return false;
  const db = adminClient();
  let userId = client.auth_user_id;
  if (!userId) {
    const { data, error } = await db.auth.admin.createUser({ email: client.email, email_confirm: true, user_metadata: { client_id: client.id } });
    if (error || !data.user) {
      const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
      userId = list.users.find((u) => u.email?.toLowerCase() === client.email!.toLowerCase())?.id ?? null;
    } else {
      userId = data.user.id;
    }
    if (!userId) return false;
    const { data: staff } = await db.from("staff_profiles").select("id").eq("id", userId).maybeSingle();
    if (staff) return false; // never turn a staff login into a client login
    await db.from("clients").update({ auth_user_id: userId }).eq("id", client.id);
  }
  const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email: client.email });
  if (error || !link.properties?.hashed_token) return false;
  const signInUrl = `${env.siteUrl}/portal/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink`;
  const r = await sendMessage({
    channel: "email",
    to: client.email,
    templateKey: "portal_sign_in",
    vars: { name: client.contact_name.split(/\s+/)[0] || client.contact_name, signInUrl },
    context: { clientId: client.id },
  });
  return r.status === "sent" || r.status === "dry_run";
}

/** Short-lived upload token for the signed-in client page (reuses the same upload flow as the personal link). */
export function issuePortalUploadToken(clientQuarterId: string): Promise<string> {
  return issueToken({ purpose: "quarter_upload", clientQuarterId, expiresAt: new Date(Date.now() + 12 * 3_600_000) });
}
