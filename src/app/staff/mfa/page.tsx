import { redirect } from "next/navigation";
import { AuthCard } from "@/components/staff/AuthCard";
import { sessionClient } from "@/lib/supabase/server";
import { MfaForm } from "./MfaForm";

export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const supabase = await sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff/login");
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/staff");
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp?.find((f) => f.status === "verified");
  return (
    <AuthCard title={verified ? "Enter your 6-digit code" : "Set up two-step sign-in"}>
      <MfaForm factorId={verified?.id ?? null} />
    </AuthCard>
  );
}
