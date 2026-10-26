import { AuthCard } from "@/components/staff/AuthCard";
import { requireStaff } from "@/lib/staff/auth";
import { SetPasswordForm } from "./SetPasswordForm";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  const { profile } = await requireStaff({ allowMfaSetup: true });
  return (
    <AuthCard title="Set your password">
      <p className="mb-4 text-gray-700">Signed in as {profile.email}. Use at least 12 characters with upper- and lower-case letters and a number.</p>
      <SetPasswordForm />
    </AuthCard>
  );
}
