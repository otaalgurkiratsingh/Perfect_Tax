import "server-only";
import { sanitizeAnswers } from "@/lib/intake/schema";
import { getIntake } from "@/lib/intake/server";
import { adminClient } from "@/lib/supabase/admin";

// Intake services → quarterly client types (drive the quarterly checklists).
const SERVICE_MAP: Record<string, string> = { bookkeeping: "bookkeeping", payroll: "payroll", hst_gst: "hst" };

export async function createClientFromIntake(intakeId: string): Promise<{ clientId: string } | { error: string }> {
  const intake = await getIntake(intakeId);
  if (!intake || intake.status === "draft") return { error: "Intake not found" };
  if (intake.client_id) return { clientId: intake.client_id };
  const a = sanitizeAnswers(intake.answers);
  const db = adminClient();
  if (intake.email) {
    const { data: existing } = await db.from("clients").select("id").ilike("email", intake.email).maybeSingle();
    if (existing) {
      await db.from("intakes").update({ client_id: existing.id, status: "client_created" }).eq("id", intakeId);
      return { clientId: existing.id };
    }
  }
  const services = [...new Set(intake.services.map((s) => SERVICE_MAP[s]).filter(Boolean))];
  const { data, error } = await db
    .from("clients")
    .insert({
      business_name: intake.business_name || intake.primary_name || "Unnamed client",
      contact_name: intake.primary_name || "Client",
      email: intake.email,
      phone: intake.phone,
      whatsapp_phone: intake.phone,
      services,
      intake_id: intakeId,
      notes: a.business?.businessNumber ? `BN ${a.business.businessNumber}` : null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create client" };
  await db.from("intakes").update({ client_id: data.id, status: "client_created" }).eq("id", intakeId);
  return { clientId: data.id };
}

