import type { NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { redirectTo } from "@/lib/redirect";
import { sessionClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  if (!tokenHash || request.nextUrl.searchParams.get("type") !== "magiclink") return redirectTo("/portal/login");
  const supabase = await sessionClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error || !data.user) return redirectTo("/portal/login?reason=link_expired");
  await audit({ actorType: "client", actorId: data.user.id, actorEmail: data.user.email, action: "client_portal_login", details: { step: "signed_in" } });
  return redirectTo("/portal");
}
