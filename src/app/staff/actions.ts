"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { firmConfig } from "@firm/config";
import { audit } from "@/lib/audit";
import { sendPasswordLink } from "@/lib/staff/passwords";
import { adminClient } from "@/lib/supabase/admin";
import { authCookieOptions, sessionClient } from "@/lib/supabase/server";
import { clientIp, userAgent } from "@/lib/security/request";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { requireStaff } from "@/lib/staff/auth";

export interface FormState {
  error?: string;
  message?: string;
  /** Echoed back so a failed sign-in doesn't wipe what the person typed. */
  email?: string;
}

const GENERIC_LOGIN_ERROR = "That email and password don't match, or the account is not active.";

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const h = await headers();
  const ip = clientIp(h);
  const ua = userAgent(h);
  if (!email || !password) return { error: "Please enter your email and password.", email };

  const ipOk = await rateLimit(`staff-login-ip:${ip}`, LIMITS.staffLoginIp.limit, LIMITS.staffLoginIp.window);
  const emailOk = await rateLimit(`staff-login-email:${email}`, LIMITS.staffLoginEmail.limit, LIMITS.staffLoginEmail.window);
  if (!ipOk || !emailOk) {
    await audit({ actorType: "public", actorEmail: email, action: "staff_login_failed", details: { reason: "rate_limited" }, ip, userAgent: ua });
    return { error: "Too many sign-in attempts. Please wait 15 minutes and try again.", email };
  }

  const supabase = await sessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await audit({ actorType: "public", actorEmail: email, action: "staff_login_failed", details: { reason: "bad_credentials" }, ip, userAgent: ua });
    return { error: GENERIC_LOGIN_ERROR, email };
  }
  const { data: profile } = await adminClient().from("staff_profiles").select("active").eq("id", data.user.id).maybeSingle();
  if (!profile?.active) {
    await supabase.auth.signOut({ scope: "local" });
    await audit({ actorType: "public", actorId: data.user.id, actorEmail: email, action: "staff_login_failed", details: { reason: "not_staff" }, ip, userAgent: ua });
    return { error: GENERIC_LOGIN_ERROR, email };
  }
  await audit({ actorType: "staff", actorId: data.user.id, actorEmail: email, action: "staff_login", ip, userAgent: ua });
  (await cookies()).set("staff_seen", String(Date.now()), authCookieOptions);
  redirect("/staff");
}

export async function signOut() {
  const supabase = await sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const h = await headers();
    await audit({ actorType: "staff", actorId: user.id, actorEmail: user.email, action: "staff_logout", ip: clientIp(h) });
  }
  await supabase.auth.signOut({ scope: "local" });
  (await cookies()).delete("staff_seen");
  redirect("/staff/login?reason=signed_out");
}

export async function forgotPassword(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const ip = clientIp(await headers());
  const ok = await rateLimit(`staff-forgot:${ip}`, 5, 900);
  if (ok && email) {
    const { data: staff } = await adminClient().from("staff_profiles").select("full_name, active").eq("email", email).maybeSingle();
    if (staff?.active) await sendPasswordLink(email, staff.full_name || "there");
  }
  return { message: "If that email belongs to an active staff account, a link to set a new password is on its way." };
}

export async function setPassword(_: FormState, form: FormData): Promise<FormState> {
  await requireStaff({ allowMfaSetup: true });
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < 12) return { error: "Please use at least 12 characters." };
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password))
    return { error: "Please include upper-case and lower-case letters and a number." };
  if (password !== confirm) return { error: "The two passwords don't match." };
  const supabase = await sessionClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/staff");
}

// ---------------------------------------------------------------------------
// Two-factor authentication (authenticator app / TOTP)
// ---------------------------------------------------------------------------
export interface MfaEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

export async function startMfaEnrollment(): Promise<MfaEnrollment | { error: string }> {
  const supabase = await sessionClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `${firmConfig.firm.shortName} dashboard ${Date.now()}` });
  if (error || !data) return { error: error?.message ?? "Could not start set-up" };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyMfa(_: FormState, form: FormData): Promise<FormState> {
  const factorId = String(form.get("factorId") ?? "");
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  const enrolling = form.get("enrolling") === "1";
  const supabase = await sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff/login");
  const ip = clientIp(await headers());
  if (!(await rateLimit(`staff-mfa:${user.id}`, 10, 900))) return { error: "Too many attempts. Please wait 15 minutes." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    await audit({ actorType: "staff", actorId: user.id, actorEmail: user.email, action: "staff_login_failed", details: { reason: "bad_2fa_code" }, ip });
    return { error: "That code didn't work. Check the 6-digit code in your authenticator app and try again." };
  }
  if (enrolling) await audit({ actorType: "staff", actorId: user.id, actorEmail: user.email, action: "staff_mfa_enrolled", ip });
  redirect("/staff");
}
