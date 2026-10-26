import "server-only";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { firmConfig } from "@firm/config";
import { audit } from "@/lib/audit";
import { sessionClient } from "@/lib/supabase/server";
import { clientIp, userAgent } from "@/lib/security/request";

export interface StaffProfile {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "staff";
  active: boolean;
}

export type StaffContext = {
  profile: StaffProfile;
  supabase: Awaited<ReturnType<typeof sessionClient>>;
  ip: string;
  userAgent: string;
};

type Failure = "signin" | "mfa_verify" | "mfa_setup" | "forbidden" | "expired";

async function check(opts: { admin?: boolean; allowMfaSetup?: boolean } = {}): Promise<StaffContext | Failure> {
  const supabase = await sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "signin";

  const { data: profile } = await supabase.from("staff_profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile || !profile.active) return "forbidden";

  const h = await headers();
  const ctx: StaffContext = { profile: profile as StaffProfile, supabase, ip: clientIp(h), userAgent: userAgent(h) };

  // Absolute session lifetime, whatever the activity.
  const { data: startedAt } = await supabase.rpc("current_session_started_at");
  if (startedAt && Date.now() - new Date(startedAt as string).getTime() > firmConfig.security.staffMaxSessionHours * 3_600_000) {
    await audit({ actorType: "staff", actorId: profile.id, actorEmail: profile.email, action: "staff_session_expired", ip: ctx.ip });
    await supabase.auth.signOut({ scope: "local" });
    return "expired";
  }

  // Two-factor: verify if enrolled; require enrolment when the firm says so.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") return "mfa_verify";
  if (firmConfig.features.requireStaff2FA && aal?.currentLevel !== "aal2" && !opts.allowMfaSetup) return "mfa_setup";

  if (opts.admin && profile.role !== "admin") return "forbidden";
  return ctx;
}

/** For staff pages: redirects to sign-in / 2FA as needed. */
export async function requireStaff(opts: { admin?: boolean; allowMfaSetup?: boolean } = {}): Promise<StaffContext> {
  const result = await check(opts);
  if (typeof result !== "string") return result;
  switch (result) {
    case "signin":
      redirect("/staff/login");
    case "expired":
      redirect("/staff/login?reason=expired");
    case "mfa_verify":
    case "mfa_setup":
      redirect("/staff/mfa");
    case "forbidden":
      redirect("/staff/login?reason=forbidden");
  }
}

/** For staff API routes: returns a ready 401/403 response instead of redirecting. */
export async function staffApi(opts: { admin?: boolean } = {}): Promise<StaffContext | Response> {
  const result = await check(opts);
  if (typeof result !== "string") return result;
  const status = result === "forbidden" ? 403 : 401;
  return Response.json({ error: status === 403 ? "Not allowed" : "Please sign in again" }, { status, headers: { "Cache-Control": "no-store" } });
}

export function staffAudit(ctx: StaffContext, entry: Omit<Parameters<typeof audit>[0], "actorType" | "actorId" | "actorEmail" | "ip" | "userAgent">) {
  return audit({ ...entry, actorType: "staff", actorId: ctx.profile.id, actorEmail: ctx.profile.email, ip: ctx.ip, userAgent: ctx.userAgent });
}
