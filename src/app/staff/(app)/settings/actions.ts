"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { requireStaff, staffAudit } from "@/lib/staff/auth";
import { sendPasswordLink } from "@/lib/staff/passwords";

export async function updateRetention(_: { message?: string; error?: string }, form: FormData) {
  const ctx = await requireStaff({ admin: true });
  const months = Number(form.get("months"));
  if (!Number.isInteger(months) || months < 12 || months > 240) return { error: "Choose between 12 and 240 months." };
  await adminClient().from("app_settings").update({ retention_months: months, updated_at: new Date().toISOString(), updated_by: ctx.profile.id }).eq("id", 1);
  await staffAudit(ctx, { action: "update_settings", details: { retention_months: months } });
  refresh();
  return { message: `Saved. Intakes older than ${months} months will be flagged for deletion review.` };
}

export async function addStaff(_: { message?: string; error?: string }, form: FormData) {
  const ctx = await requireStaff({ admin: true });
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim().slice(0, 100);
  const role = form.get("role") === "admin" ? "admin" : "staff";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) return { error: "Enter a name and a valid email." };
  const db = adminClient();
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    password: `${randomBytes(24).toString("base64url")}aA1`,
    user_metadata: { full_name: name },
  });
  if (error || !created.user) return { error: error?.message ?? "Could not create the account" };
  const { error: profileError } = await db.from("staff_profiles").insert({ id: created.user.id, email, full_name: name, role });
  if (profileError) return { error: profileError.message };
  await sendPasswordLink(email, name);
  await staffAudit(ctx, { action: "add_staff", targetType: "staff", targetId: created.user.id, details: { email, role } });
  refresh();
  return { message: `${name} was added and emailed a link to set their password.` };
}

export async function updateStaff(staffId: string, patch: { role?: "admin" | "staff"; active?: boolean }): Promise<{ error?: string }> {
  const ctx = await requireStaff({ admin: true });
  if (!/^[0-9a-f-]{36}$/i.test(staffId)) return { error: "Invalid" };
  if (staffId === ctx.profile.id) return { error: "You can't change your own role or access." };
  const update: Record<string, unknown> = {};
  if (patch.role === "admin" || patch.role === "staff") update.role = patch.role;
  if (typeof patch.active === "boolean") update.active = patch.active;
  await adminClient().from("staff_profiles").update(update).eq("id", staffId);
  // Deactivated staff lose access at once (RLS checks "active"); the ban also stops session refresh.
  if (typeof patch.active === "boolean") {
    await adminClient().auth.admin.updateUserById(staffId, { ban_duration: patch.active ? "none" : "876000h" });
  }
  await staffAudit(ctx, { action: "update_staff", targetType: "staff", targetId: staffId, details: update });
  refresh();
  return {};
}
