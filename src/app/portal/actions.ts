"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { sendPortalSignInLink } from "@/lib/portal/link";
import type { ClientRow } from "@/lib/quarterly/engine";
import { clientIp } from "@/lib/security/request";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { adminClient } from "@/lib/supabase/admin";
import { sessionClient } from "@/lib/supabase/server";

export interface PortalState {
  message?: string;
  error?: string;
}

const SAME_ANSWER = "If that email belongs to a client account, a sign-in link is on its way. It works once and expires in 1 hour.";

export async function requestSignInLink(_: PortalState, form: FormData): Promise<PortalState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Please enter your email address." };
  const ip = clientIp(await headers());
  const ipOk = await rateLimit(`portal-login-ip:${ip}`, LIMITS.portalLoginIp.limit, LIMITS.portalLoginIp.window);
  const emailOk = await rateLimit(`portal-login-email:${email}`, LIMITS.portalLoginEmail.limit, LIMITS.portalLoginEmail.window);
  if (!ipOk || !emailOk) return { message: SAME_ANSWER };
  const { data: client } = await adminClient().from("clients").select("*").ilike("email", email).eq("active", true).maybeSingle();
  if (client) {
    await sendPortalSignInLink(client as ClientRow);
    await audit({ actorType: "client", action: "client_portal_login", targetType: "client", targetId: client.id, details: { step: "link_sent" }, ip });
  }
  // Same answer either way, so the form can't be used to discover who is a client.
  return { message: SAME_ANSWER };
}

export async function portalSignOut() {
  const supabase = await sessionClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/portal/login?reason=signed_out");
}
